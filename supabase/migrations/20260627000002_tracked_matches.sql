-- Migration 20260627000002 : table tracked_matches + RLS + trigger de purge (chantier 3, lot 3A).
--
-- Matchs trackés d'un joueur suivi : pointeur (vers tracked_players + match Riot)
-- + snapshot dénormalisé immuable (juste ce que les pages du chantier 4 consomment :
-- liste + agrégats). Le payload Riot complet n'est PAS dupliqué — le détail d'un
-- match se lit en réutilisant /match/[region]/[matchId] (re-fetch live).
--
-- Frontière de sécurité = RLS. Lecture : admin prac (tout) OU le joueur sur ses
-- propres lignes (via le pointeur tracked_player_id → tracked_players.profile_id).
-- Écritures : EXCLUSIVEMENT via l'EF prac-track (service_role, lot 3B) — aucune
-- policy INSERT/UPDATE/DELETE client.
--
-- Purge sur révocation : un dossier qui passe en status='revoked' (UPDATE) ne
-- déclenche PAS la cascade FK (qui n'agit qu'au DELETE). D'où le trigger AFTER
-- UPDATE ci-dessous. Le DELETE direct (remove_tracking) est lui couvert par la FK
-- ON DELETE CASCADE — deux mécanismes distincts et complémentaires.
--
-- Dépend de : tracked_players + is_prac_admin(uuid) (migrations 20260626000001/000002),
--             auth.users.
--
-- Idempotent : CREATE ... IF NOT EXISTS + DROP/CREATE POLICY/TRIGGER + CREATE OR REPLACE.

-- ── 1. Table ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tracked_matches (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tracked_player_id  uuid NOT NULL REFERENCES public.tracked_players(id) ON DELETE CASCADE,
  match_id           text NOT NULL,                       -- id Riot (ex: EUW1_1234567890)
  region             text NOT NULL,                       -- plateforme au track → lien /match/[region]/[matchId]
  added_by           uuid NOT NULL REFERENCES auth.users, -- admin prac qui a tracké
  created_at         timestamptz NOT NULL DEFAULT now(),

  -- Snapshot dénormalisé (immuable — une partie finie ne change jamais)
  game_creation      timestamptz NOT NULL,                -- to_timestamp(gameCreation/1000)
  champion_id        int,
  champion_name      text,
  queue_id           int,
  win                boolean,
  kills              int,
  deaths             int,
  assists            int,
  cs                 int,
  duration_s         int,
  position           text,
  vision_score       int,
  damage_dealt       int,
  gold_earned        int,

  CONSTRAINT uq_tracked_matches_player_match UNIQUE (tracked_player_id, match_id)
);

-- Liste des matchs d'un joueur (récent d'abord) + agrégats par joueur.
CREATE INDEX IF NOT EXISTS idx_tracked_matches_player_time
  ON public.tracked_matches (tracked_player_id, game_creation DESC);

-- ── 2. RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE public.tracked_matches ENABLE ROW LEVEL SECURITY;

-- Lecture : admin prac (tout) OU le joueur ciblé (ses propres matchs via le pointeur).
DROP POLICY IF EXISTS tm_select ON public.tracked_matches;
CREATE POLICY tm_select ON public.tracked_matches
  FOR SELECT
  USING (
    public.is_prac_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.tracked_players tp
       WHERE tp.id = tracked_matches.tracked_player_id
         AND tp.profile_id = auth.uid()
    )
  );

-- Aucune policy INSERT/UPDATE/DELETE : RLS activée + absence de policy = deny total
-- pour les rôles client. Écritures via l'EF prac-track (service_role, lot 3B).
--
-- Privilèges table — moindre privilège EXPLICITE. Supabase applique des DEFAULT
-- PRIVILEGES qui accordent ALL (SELECT/INSERT/UPDATE/DELETE/…) à anon ET
-- authenticated sur toute nouvelle table → on RÉVOQUE d'abord, puis on ré-accorde
-- le strict nécessaire. La RLS suffit à bloquer l'accès aux lignes, mais on veut
-- aussi le moindre privilège au niveau table (défense en profondeur).
-- service_role n'est PAS touché (writes EF prac-track au lot 3B).
REVOKE ALL ON public.tracked_matches FROM anon, authenticated;
GRANT SELECT ON public.tracked_matches TO authenticated;   -- anon : aucun privilège

-- ── 3. Trigger de purge sur révocation ───────────────────────────────────────
-- Quand un dossier tracked_players passe en 'revoked', on supprime ses matchs
-- trackés. SECURITY DEFINER (owned postgres) → la purge réussit quel que soit
-- l'appelant de l'UPDATE (respond_consent SECURITY DEFINER, service_role, postgres).
CREATE OR REPLACE FUNCTION public.fn_purge_tracked_matches_on_revoke()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.tracked_matches WHERE tracked_player_id = NEW.id;
  RETURN NULL;  -- AFTER trigger : valeur de retour ignorée
END;
$$;

-- AFTER UPDATE : la ligne tracked_players est déjà mise à jour. Le WHEN restreint
-- le déclenchement à la transition ENTRANTE vers 'revoked' (garde-fou défensif :
-- la seule transition atteignable est accepted → revoked via respond_consent ;
-- IS DISTINCT FROM évite un re-fire sur un UPDATE direct revoked → revoked).
-- Distinct du trigger BEFORE UPDATE trg_tracked_players_updated_at (phase + table
-- cible différentes : aucun conflit d'ordre).
DROP TRIGGER IF EXISTS trg_tracked_players_purge_on_revoke ON public.tracked_players;
CREATE TRIGGER trg_tracked_players_purge_on_revoke
  AFTER UPDATE ON public.tracked_players
  FOR EACH ROW
  WHEN (NEW.status = 'revoked' AND OLD.status IS DISTINCT FROM 'revoked')
  EXECUTE FUNCTION public.fn_purge_tracked_matches_on_revoke();
