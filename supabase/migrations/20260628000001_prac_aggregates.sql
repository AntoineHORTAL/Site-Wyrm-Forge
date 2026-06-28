-- Migration 20260628000001 : fonctions d'agrégats prac (chantier 4, lot 4A).
--
-- Deux fonctions SECURITY DEFINER qui alimentent les pages prac du chantier 4 :
--   • prac_top_winrate(p_min_matches) → classement winrate (accueil / top-5), admin only.
--   • prac_player_stats(p_tracked_player_id) → fiche détaillée d'un joueur
--     (liste-agrégat + top champions), garde « admin prac OU le joueur lui-même ».
--
-- ── Contraste VOLONTAIRE avec get_rank_avg (NE PAS le confondre) ───────────────
-- get_rank_avg agrège des moyennes par RANG : zéro PII → aucune garde, GRANT anon.
-- Ces deux fonctions exposent des IDENTITÉS RÉELLES (username) de joueurs trackés
-- → frontière d'accès volontairement plus stricte :
--     REVOKE EXECUTE FROM PUBLIC + GRANT authenticated UNIQUEMENT (jamais anon),
--   et garde interne obligatoire (is_prac_admin / self). La seule chose héritée de
--   get_rank_avg est la forme « SECURITY DEFINER + agrégats », pas la portée d'accès.
--
-- ── Protection division par zéro ──────────────────────────────────────────────
--   • winrate = wins / NULLIF(games,0) * 100         → 0 si aucun match
--   • avg_cs_per_min = cs / NULLIF(Σduration_s,0)*60 → 0 si durée totale nulle
--   • avg_kda = (ΣK+ΣA) / NULLIF(ΣD,0)               → si ΣD=0, KDA « parfait » = ΣK+ΣA
--
-- Dépend de : tracked_matches, tracked_players, profiles, is_prac_admin(uuid).
-- Idempotent : CREATE OR REPLACE.

-- ── 1. prac_top_winrate — classement (admin prac uniquement) ──────────────────
CREATE OR REPLACE FUNCTION public.prac_top_winrate(p_min_matches int DEFAULT 5)
RETURNS TABLE (
  tracked_player_id uuid,
  profile_id        uuid,
  username          text,
  games             bigint,
  wins              bigint,
  winrate           numeric,
  avg_kda           numeric,
  avg_cs_per_min    numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Garde admin-only : exposition d'identités réelles → réservé aux admins prac.
  IF NOT public.is_prac_admin(auth.uid()) THEN
    RAISE EXCEPTION 'not_prac_admin';
  END IF;

  RETURN QUERY
  SELECT
    tp.id,
    tp.profile_id,
    pr.username,
    count(*)::bigint                                            AS games,
    count(*) FILTER (WHERE tm.win)::bigint                      AS wins,
    ROUND(count(*) FILTER (WHERE tm.win)::numeric
          / NULLIF(count(*), 0) * 100, 1)                       AS winrate,
    COALESCE(
      ROUND((SUM(tm.kills) + SUM(tm.assists))::numeric
            / NULLIF(SUM(tm.deaths), 0), 2),
      (SUM(tm.kills) + SUM(tm.assists))::numeric                -- ΣD=0 → KDA parfait
    )                                                           AS avg_kda,
    COALESCE(
      ROUND(SUM(tm.cs)::numeric / NULLIF(SUM(tm.duration_s), 0) * 60, 2),
      0
    )                                                           AS avg_cs_per_min
  FROM public.tracked_matches tm
  JOIN public.tracked_players tp ON tp.id = tm.tracked_player_id
  JOIN public.profiles        pr ON pr.id = tp.profile_id
  GROUP BY tp.id, tp.profile_id, pr.username
  HAVING count(*) >= p_min_matches
  ORDER BY winrate DESC, games DESC, pr.username;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.prac_top_winrate(int) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.prac_top_winrate(int) TO authenticated;

-- ── 2. prac_player_stats — fiche joueur (admin prac OU le joueur lui-même) ─────
CREATE OR REPLACE FUNCTION public.prac_player_stats(p_tracked_player_id uuid)
RETURNS TABLE (
  tracked_player_id uuid,
  profile_id        uuid,
  username          text,
  games             bigint,
  wins              bigint,
  losses            bigint,
  winrate           numeric,
  avg_kda           numeric,
  avg_kills         numeric,
  avg_deaths        numeric,
  avg_assists       numeric,
  avg_cs_per_min    numeric,
  avg_vision_score  numeric,
  avg_damage_dealt  numeric,
  avg_gold_earned   numeric,
  top_champions     jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_id uuid;
  v_username   text;
BEGIN
  -- Garde + résolution de la cible — ORDRE anti-énumération :
  --   • admin prac → autorisé sur TOUT joueur, donc on PEUT révéler not_found.
  --   • non-admin  → autorisé UNIQUEMENT sur son propre dossier ; on ne distingue
  --     JAMAIS « inexistant » de « pas à toi » (même erreur not_authorized), sinon
  --     la fonction devient un oracle d'énumération des tracked_player_id.
  IF public.is_prac_admin(auth.uid()) THEN
    SELECT tp.profile_id, pr.username
      INTO v_profile_id, v_username
      FROM public.tracked_players tp
      JOIN public.profiles pr ON pr.id = tp.profile_id
     WHERE tp.id = p_tracked_player_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'not_found';
    END IF;
  ELSE
    SELECT tp.profile_id, pr.username
      INTO v_profile_id, v_username
      FROM public.tracked_players tp
      JOIN public.profiles pr ON pr.id = tp.profile_id
     WHERE tp.id = p_tracked_player_id
       AND tp.profile_id = auth.uid();
    IF NOT FOUND THEN
      RAISE EXCEPTION 'not_authorized';
    END IF;
  END IF;

  RETURN QUERY
  WITH m AS (
    -- Alias explicite : sans lui, la colonne tracked_player_id entrerait en
    -- collision avec la colonne OUT homonyme du RETURNS TABLE (variable plpgsql
    -- en scope) → « column reference is ambiguous ».
    SELECT tmx.* FROM public.tracked_matches tmx
     WHERE tmx.tracked_player_id = p_tracked_player_id
  ),
  top3 AS (
    SELECT champion_name,
           count(*)                    AS c_games,
           count(*) FILTER (WHERE win) AS c_wins
      FROM m
     WHERE champion_name IS NOT NULL
     GROUP BY champion_name
     ORDER BY c_games DESC, c_wins DESC, champion_name
     LIMIT 3
  )
  SELECT
    p_tracked_player_id,
    v_profile_id,
    v_username,
    count(*)::bigint                                                  AS games,
    count(*) FILTER (WHERE m.win)::bigint                             AS wins,
    count(*) FILTER (WHERE m.win IS NOT NULL AND NOT m.win)::bigint   AS losses,
    COALESCE(ROUND(count(*) FILTER (WHERE m.win)::numeric
             / NULLIF(count(*), 0) * 100, 1), 0)                      AS winrate,
    COALESCE(
      ROUND((SUM(m.kills) + SUM(m.assists))::numeric
            / NULLIF(SUM(m.deaths), 0), 2),
      (SUM(m.kills) + SUM(m.assists))::numeric,                       -- ΣD=0 → KDA parfait
      0                                                              -- aucun match
    )                                                                AS avg_kda,
    COALESCE(ROUND(AVG(m.kills)::numeric, 1), 0)                     AS avg_kills,
    COALESCE(ROUND(AVG(m.deaths)::numeric, 1), 0)                    AS avg_deaths,
    COALESCE(ROUND(AVG(m.assists)::numeric, 1), 0)                   AS avg_assists,
    COALESCE(ROUND(SUM(m.cs)::numeric
             / NULLIF(SUM(m.duration_s), 0) * 60, 2), 0)             AS avg_cs_per_min,
    COALESCE(ROUND(AVG(m.vision_score)::numeric, 1), 0)             AS avg_vision_score,
    COALESCE(ROUND(AVG(m.damage_dealt)::numeric, 0), 0)             AS avg_damage_dealt,
    COALESCE(ROUND(AVG(m.gold_earned)::numeric, 0), 0)              AS avg_gold_earned,
    -- Top 3 champions par parties jouées (games/wins/winrate dénormalisés).
    COALESCE(
      (SELECT jsonb_agg(jsonb_build_object(
                'champion', champion_name,
                'games',    c_games,
                'wins',     c_wins,
                'winrate',  ROUND(c_wins::numeric / NULLIF(c_games, 0) * 100, 1)
              ) ORDER BY c_games DESC, c_wins DESC, champion_name)
         FROM top3),
      '[]'::jsonb
    )                                                                AS top_champions
  FROM m;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.prac_player_stats(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.prac_player_stats(uuid) TO authenticated;
