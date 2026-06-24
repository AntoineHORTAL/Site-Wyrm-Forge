-- Migration 20260611000001 : Module Tournois — tables de base.
--
-- Tables créées :
--   tournaments         — catalogue des tournois (1 ligne par événement)
--   tournament_teams    — équipes inscrites à un tournoi
--   tournament_players  — joueurs d'une équipe (discord_pseudo jamais exposé publiquement)
--   matches             — arbre DE (Double Élimination) avec câblage de propagation
--
-- Vues :
--   tournament_standings      — classement public (points, W/L, pseudos Riot)
--   tournament_players_public — joueurs sans discord_pseudo
--
-- RLS :
--   tournaments      : SELECT anon/auth sur status != 'draft' ; draft via created_by ou is_admin()
--   tournament_teams : SELECT anon/auth (toutes équipes d'un tournoi public)
--   tournament_players : pas de policy SELECT directe — passer par la vue publique
--   matches          : SELECT anon/auth
--   Aucune policy INSERT/UPDATE/DELETE côté client — Edge Functions via service_role.
--
-- Clients consommateurs :
--   Site React   : lecture des 4 tables + vues (anon/auth)
--   App WPF      : lecture tournament_standings + tournament_players_public (anon/auth)
--   Edge Functions : écriture via service_role (bypass RLS automatique)

-- ---------------------------------------------------------------------------
-- Table tournaments
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.tournaments (
  id               UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  slug             TEXT        NOT NULL,
  name             TEXT        NOT NULL,
  format           TEXT        NOT NULL DEFAULT '2V2',
  map              TEXT        NOT NULL DEFAULT 'ARAM',
  status           TEXT        NOT NULL DEFAULT 'draft',
  starts_at        TIMESTAMPTZ,
  max_teams        INT         NOT NULL DEFAULT 8,
  cashprize_label  TEXT,
  cashprize_bonus  TEXT,
  caster_name      TEXT,
  twitch_url       TEXT,
  hero_image_url   TEXT,
  rules            JSONB       NOT NULL DEFAULT '[]',
  created_by       UUID        NOT NULL REFERENCES auth.users,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_tournaments_slug    UNIQUE (slug),
  CONSTRAINT chk_tournaments_status CHECK (status IN ('draft', 'registration', 'live', 'finished'))
);

ALTER TABLE public.tournaments ENABLE ROW LEVEL SECURITY;

-- SELECT non-draft : accessible à tout le monde sans login (pages publiques SEO)
CREATE POLICY "trn_select_public"
  ON public.tournaments FOR SELECT
  TO anon, authenticated
  USING (status <> 'draft');

-- SELECT draft : uniquement le créateur ou un admin
-- Deux policies OR-séparées : Supabase évalue policy par policy, la ligne passe si l'une
-- renvoie true. On utilise une seule policy avec OR pour la clarté.
CREATE POLICY "trn_select_draft_owner_or_admin"
  ON public.tournaments FOR SELECT
  TO authenticated
  USING (
    status = 'draft'
    AND (created_by = auth.uid() OR public.is_admin())
  );

-- INSERT / UPDATE / DELETE : aucune policy client (service_role only)

-- ---------------------------------------------------------------------------
-- Table tournament_teams
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.tournament_teams (
  id            UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tournament_id UUID        NOT NULL REFERENCES public.tournaments ON DELETE CASCADE,
  name          TEXT        NOT NULL,
  seed          INT,
  status        TEXT        NOT NULL DEFAULT 'pending',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_team_name_per_tournament UNIQUE (tournament_id, name),
  CONSTRAINT chk_team_name_len    CHECK (char_length(name) BETWEEN 3 AND 24),
  CONSTRAINT chk_team_status      CHECK (status IN ('pending', 'validated', 'rejected'))
);

ALTER TABLE public.tournament_teams ENABLE ROW LEVEL SECURITY;

-- SELECT : public — les équipes des tournois publiés sont visibles sans login.
-- On laisse volontairement accès à toutes les équipes y compris 'rejected'/'pending'
-- car le front peut filtrer. Ne pas restreindre ici pour ne pas casser l'app.
CREATE POLICY "tt_select_public"
  ON public.tournament_teams FOR SELECT
  TO anon, authenticated
  USING (true);

-- INSERT / UPDATE / DELETE : aucune policy client

-- ---------------------------------------------------------------------------
-- Table tournament_players
-- ---------------------------------------------------------------------------
-- IMPORTANT : discord_pseudo est confidentiel — ne jamais l'exposer en SELECT
-- direct côté client. Utiliser la vue tournament_players_public à la place.

CREATE TABLE IF NOT EXISTS public.tournament_players (
  id             UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id        UUID        NOT NULL REFERENCES public.tournament_teams ON DELETE CASCADE,
  riot_pseudo    TEXT        NOT NULL,  -- format 'gameName#TAG', validé côté Edge Function
  discord_pseudo TEXT        NOT NULL,  -- ne PAS exposer en lecture publique
  user_id        UUID        REFERENCES auth.users,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.tournament_players ENABLE ROW LEVEL SECURITY;

-- Pas de policy SELECT directe sur tournament_players.
-- La lecture publique passe par la vue tournament_players_public (SECURITY DEFINER).
-- Un utilisateur authentifié peut lire SES propres lignes (pour affichage profil).
CREATE POLICY "tp_select_own"
  ON public.tournament_players FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- INSERT / UPDATE / DELETE : aucune policy client

-- ---------------------------------------------------------------------------
-- Table matches
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.matches (
  id                   UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tournament_id        UUID        NOT NULL REFERENCES public.tournaments ON DELETE CASCADE,
  code                 TEXT        NOT NULL,   -- 'M1'..'M14', identifiant humain dans le bracket
  bracket              TEXT        NOT NULL,
  round                INT         NOT NULL,
  position             INT         NOT NULL,
  team_a               UUID        REFERENCES public.tournament_teams,
  team_b               UUID        REFERENCES public.tournament_teams,
  winner_id            UUID        REFERENCES public.tournament_teams,
  -- Câblage DE : next pour le gagnant
  next_match_id        UUID        REFERENCES public.matches,
  next_match_slot      TEXT        CHECK (next_match_slot IN ('a', 'b')),
  -- Câblage DE : loser bracket pour le perdant
  loser_next_match_id  UUID        REFERENCES public.matches,
  loser_next_match_slot TEXT       CHECK (loser_next_match_slot IN ('a', 'b')),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_match_code_per_tournament UNIQUE (tournament_id, code),
  CONSTRAINT chk_match_bracket CHECK (bracket IN ('winner', 'loser', 'final'))
);

ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;

-- SELECT : public — le bracket est visible sans login
CREATE POLICY "mch_select_public"
  ON public.matches FOR SELECT
  TO anon, authenticated
  USING (true);

-- INSERT / UPDATE / DELETE : aucune policy client

-- ---------------------------------------------------------------------------
-- Vue tournament_players_public
-- Expose les joueurs SANS discord_pseudo — seule vue accessible en SELECT public.
-- SECURITY DEFINER pour contourner le RLS de tournament_players (pas de policy anon).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.tournament_players_public
  WITH (security_invoker = false)
AS
  SELECT
    tp.id,
    tp.team_id,
    tp.riot_pseudo,
    tp.user_id,
    tp.created_at
  FROM public.tournament_players tp;

-- Rendre la vue accessible publiquement (anon + authenticated)
GRANT SELECT ON public.tournament_players_public TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Vue tournament_standings
-- Agrège wins / losses / points par équipe et par tournoi.
-- Inclut les pseudos Riot des joueurs (jamais discord_pseudo).
-- Tri : points DESC, (wins - losses) DESC, seed ASC NULLS LAST.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.tournament_standings AS
  WITH match_results AS (
    -- Un match joué = un line pour team_a et un pour team_b (si les deux sont renseignés)
    SELECT
      m.tournament_id,
      m.team_a           AS team_id,
      CASE WHEN m.winner_id = m.team_a THEN 1 ELSE 0 END AS is_win,
      CASE WHEN m.winner_id IS NOT NULL              THEN 1 ELSE 0 END AS is_played
    FROM public.matches m
    WHERE m.team_a IS NOT NULL AND m.team_b IS NOT NULL

    UNION ALL

    SELECT
      m.tournament_id,
      m.team_b           AS team_id,
      CASE WHEN m.winner_id = m.team_b THEN 1 ELSE 0 END AS is_win,
      CASE WHEN m.winner_id IS NOT NULL              THEN 1 ELSE 0 END AS is_played
    FROM public.matches m
    WHERE m.team_a IS NOT NULL AND m.team_b IS NOT NULL
  ),
  aggregated AS (
    SELECT
      mr.tournament_id,
      mr.team_id,
      SUM(mr.is_win)::INT                              AS wins,
      (SUM(mr.is_played) - SUM(mr.is_win))::INT        AS losses,
      (SUM(mr.is_win) * 2)::INT                        AS points
    FROM match_results mr
    GROUP BY mr.tournament_id, mr.team_id
  ),
  -- Agrège les pseudos Riot des joueurs de chaque équipe
  team_players AS (
    SELECT
      tp.team_id,
      array_agg(tp.riot_pseudo ORDER BY tp.created_at) AS riot_pseudos
    FROM public.tournament_players tp
    GROUP BY tp.team_id
  )
  SELECT
    t.id              AS tournament_id,
    t.slug            AS tournament_slug,
    tt.id             AS team_id,
    tt.name           AS team_name,
    tt.seed,
    COALESCE(ag.wins,   0) AS wins,
    COALESCE(ag.losses, 0) AS losses,
    COALESCE(ag.points, 0) AS points,
    COALESCE(tp.riot_pseudos, ARRAY[]::TEXT[]) AS riot_pseudos
  FROM public.tournaments t
  JOIN public.tournament_teams tt ON tt.tournament_id = t.id
  LEFT JOIN aggregated          ag ON ag.tournament_id = t.id AND ag.team_id = tt.id
  LEFT JOIN team_players         tp ON tp.team_id = tt.id
  WHERE tt.status = 'validated'
  ORDER BY
    t.id,
    COALESCE(ag.points, 0)          DESC,
    (COALESCE(ag.wins, 0) - COALESCE(ag.losses, 0)) DESC,
    tt.seed                          ASC NULLS LAST;

-- Lecture publique du classement (pas de RLS sur une vue — GRANT suffit)
GRANT SELECT ON public.tournament_standings TO anon, authenticated;
