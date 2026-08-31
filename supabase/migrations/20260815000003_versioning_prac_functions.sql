-- Reversement de la dette « bootstrap §4b » — les 3 fonctions du module prac où la
-- PROD est en avance sur le dépôt. Dernier reversement neutre du plan de dette.
--
-- ÉTAT AVANT CETTE MIGRATION
-- --------------------------
--   • prac_visible_match_ids  — n'existe dans AUCUNE migration ni dans le baseline
--     pré-versionnage (aujourd'hui la migration 20260529000000, à l'époque
--     bootstrap/00). Créée directement sur la prod.
--   • prac_related_players    — idem.
--   • prac_player_stats       — existe bien en migration (20260628000001) mais la
--     prod porte une RÉÉCRITURE postérieure, jamais reversée.
--
-- Audit à l'appui (2026-08-15) : sur les 46 fonctions du schéma public en prod,
-- ces deux-là sont les SEULES absentes à la fois des migrations et du baseline.
-- Le trou n'est donc pas un motif diffus, il s'arrête ici. (Le recensement des
-- fonctions dont le CORPS a dérivé sans être absentes repose, lui, sur la
-- comparaison objet par objet du 2026-08-11 consignée dans bootstrap/01, qui
-- n'identifie que prac_player_stats — traitée ici.)
--
-- CE QUE LA RÉÉCRITURE DE prac_player_stats A CHANGÉ
-- ---------------------------------------------------
-- Ce n'est pas un ajustement cosmétique : la version 20260628000001 ne connaît que
-- deux catégories d'appelants (admin prac → tout dossier ; non-admin → son propre
-- dossier uniquement, via un lookup filtré `AND tp.profile_id = auth.uid()`). La
-- version prod introduit la CATÉGORIE 3 — un joueur qui partage au moins un match
-- avec la cible — et borne les agrégats aux seuls matchs visibles pour l'appelant,
-- en déléguant ce calcul à prac_visible_match_ids.
--
-- D'où l'interdépendance, et l'ordre de création de ce fichier :
--   prac_visible_match_ids  (aucune dépendance prac)
--     └─ appelée par prac_related_players ET par prac_player_stats
--
-- Conséquence concrète d'un rejeu complet aujourd'hui, sans cette migration : les
-- deux orphelines disparaissent, et prac_player_stats retombe dans sa version 4A —
-- self-cohérente, mais amputée de la catégorie 3. Le module prac perdrait sa portée
-- de visibilité partagée sans qu'aucune erreur ne soit levée.
--
-- DROITS D'EXÉCUTION — reproduits À L'IDENTIQUE, volontairement
-- --------------------------------------------------------------
-- AUCUN GRANT ni REVOKE dans ce fichier : c'est délibéré, et c'est ce qui garde la
-- migration strictement no-op. `CREATE OR REPLACE` PRÉSERVE l'ACL d'une fonction
-- existante ; sur une base neuve, la création hérite des DEFAULT PRIVILEGES
-- Supabase. Dans les deux cas on retombe sur l'ACL observée en prod le 2026-08-15 :
--
--     postgres=X/postgres | anon=X/postgres | authenticated=X/postgres |
--     service_role=X/postgres
--
-- ⚠️ Correction d'une imprécision de bootstrap/01, qui décrit ces droits comme
-- « laissés au défaut PostgreSQL (EXECUTE à PUBLIC) ». C'est faux au sens strict :
-- le défaut PostgreSQL serait proacl = NULL (EXECUTE implicite à PUBLIC). Ici l'ACL
-- est EXPLICITE et nomme trois rôles Supabase — la conséquence pratique est la même
-- (anon peut invoquer), mais un futur `REVOKE ... FROM PUBLIC` ne retirerait RIEN,
-- puisque le grant ne passe pas par PUBLIC. Il faudra viser anon nommément.
--
-- Les trois fonctions sont SECURITY DEFINER et filtrent sur auth.uid() en interne :
-- un appelant anonyme n'obtient aucune ligne. Le DURCISSEMENT (aligner sur
-- prac_top_winrate / prac_search_profiles, qui font REVOKE FROM PUBLIC + GRANT
-- authenticated) est un LOT SÉPARÉ, décision HORTAL du 2026-08-15 : il changerait un
-- comportement en prod, ce qu'aucune des trois migrations de ce plan ne fait.
--
-- Corps recopiés depuis pg_get_functiondef() sur la PROD (2026-08-15), pas depuis le
-- dump de bootstrap/01 — vérification faite, les deux sont identiques au caractère
-- près une fois l'espacement normalisé, mais la prod reste la source d'autorité.

-- ── Garde : les dépendances des trois corps doivent exister ──────────────────
-- Un corps plpgsql n'est pas résolu à la création : ces fonctions se créeraient
-- sans erreur au-dessus de tables absentes et n'échoueraient qu'à l'exécution, chez
-- un utilisateur. Si un réordonnancement plaçait ce fichier avant 20260626000001
-- (is_prac_admin), 20260626000002 / 20260627000002 / 20260705000001 (les tables),
-- on veut le savoir au déploiement.
DO $guard$
DECLARE
  v_missing TEXT;
BEGIN
  SELECT string_agg(dep.label, ', ' ORDER BY dep.label)
    INTO v_missing
    FROM (VALUES
      ('table public.tracked_players',           to_regclass('public.tracked_players')::text),
      ('table public.tracked_matches',           to_regclass('public.tracked_matches')::text),
      ('table public.tracked_match_participants', to_regclass('public.tracked_match_participants')::text),
      ('table public.profiles',                  to_regclass('public.profiles')::text),
      ('fonction public.is_prac_admin(uuid)',    to_regprocedure('public.is_prac_admin(uuid)')::text)
    ) AS dep(label, found)
   WHERE dep.found IS NULL;

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION
      'Dependances du module prac manquantes (%) — ces fonctions se creeraient sans erreur mais echoueraient a l''execution.', v_missing;
  END IF;
END $guard$;

-- ── Les 3 fonctions, dans l'ordre de dépendance ──────────────────────────────
CREATE OR REPLACE FUNCTION public.prac_visible_match_ids(p_caller uuid, p_tracked_player_id uuid)
 RETURNS SETOF uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_profile_id   uuid;
  v_caller_puuid text;
BEGIN
  -- Résout le joueur tracké ciblé.
  SELECT tp.profile_id INTO v_profile_id
    FROM public.tracked_players tp
   WHERE tp.id = p_tracked_player_id;
  IF NOT FOUND THEN
    RETURN;  -- dossier inexistant → aucun match visible
  END IF;

  -- Cat. 1 (admin) OU cat. 2 (self) → tous les matchs du joueur tracké.
  IF public.is_prac_admin(p_caller) OR p_caller = v_profile_id THEN
    RETURN QUERY
      SELECT tm.id FROM public.tracked_matches tm
       WHERE tm.tracked_player_id = p_tracked_player_id;
    RETURN;
  END IF;

  -- Cat. 3 → uniquement les matchs partagés (puuid du caller ∈ participants).
  SELECT pr.riot_puuid INTO v_caller_puuid
    FROM public.profiles pr WHERE pr.id = p_caller;
  IF v_caller_puuid IS NULL THEN
    RETURN;  -- pas de compte Riot lié → aucun accès cat. 3
  END IF;

  RETURN QUERY
    SELECT tm.id
      FROM public.tracked_matches tm
      JOIN public.tracked_match_participants tmp ON tmp.tracked_match_id = tm.id
     WHERE tm.tracked_player_id = p_tracked_player_id
       AND tmp.puuid = v_caller_puuid;
END;
$function$;

CREATE OR REPLACE FUNCTION public.prac_related_players()
 RETURNS TABLE(tracked_player_id uuid, profile_id uuid, username text, relation text, games bigint, wins bigint, winrate numeric, avg_kda numeric, avg_cs_per_min numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_puuid  text;
BEGIN
  IF v_caller IS NULL THEN
    RETURN;  -- pas de session → rien
  END IF;

  SELECT pr.riot_puuid INTO v_puuid FROM public.profiles pr WHERE pr.id = v_caller;

  RETURN QUERY
  WITH related AS (
    -- self : le dossier du caller (0 ou 1 ligne).
    SELECT tp.id AS tracked_player_id, tp.profile_id, 'self'::text AS relation
      FROM public.tracked_players tp
     WHERE tp.profile_id = v_caller
    UNION
    -- co-joueurs : dossiers partageant ≥1 match avec le puuid du caller (hors self).
    SELECT DISTINCT tp.id, tp.profile_id, 'shared'::text
      FROM public.tracked_players tp
      JOIN public.tracked_matches tm             ON tm.tracked_player_id = tp.id
      JOIN public.tracked_match_participants tmp ON tmp.tracked_match_id = tm.id
     WHERE v_puuid IS NOT NULL
       AND tmp.puuid = v_puuid
       AND tp.profile_id <> v_caller
  ),
  scoped AS (
    -- Stats caller-scoped : jointure LATÉRALE sur les matchs visibles de chaque relation.
    -- LEFT JOIN → une relation self à 0 match visible apparaît quand même (games=0).
    SELECT r.tracked_player_id, r.profile_id, r.relation,
           mv.mid, mv.win, mv.kills, mv.deaths, mv.assists, mv.cs, mv.duration_s
      FROM related r
      LEFT JOIN LATERAL (
        SELECT tmx.id AS mid, tmx.win, tmx.kills, tmx.deaths,
               tmx.assists, tmx.cs, tmx.duration_s
          FROM public.tracked_matches tmx
         WHERE tmx.id IN (SELECT public.prac_visible_match_ids(v_caller, r.tracked_player_id))
      ) mv ON true
  )
  SELECT
    s.tracked_player_id,
    s.profile_id,
    pr.username,
    s.relation,
    count(s.mid)::bigint                                             AS games,
    count(*) FILTER (WHERE s.win)::bigint                            AS wins,
    COALESCE(ROUND(count(*) FILTER (WHERE s.win)::numeric
             / NULLIF(count(s.mid), 0) * 100, 1), 0)                 AS winrate,
    COALESCE(
      ROUND((SUM(s.kills) + SUM(s.assists))::numeric
            / NULLIF(SUM(s.deaths), 0), 2),
      (SUM(s.kills) + SUM(s.assists))::numeric,
      0
    )                                                                AS avg_kda,
    COALESCE(ROUND(SUM(s.cs)::numeric
             / NULLIF(SUM(s.duration_s), 0) * 60, 2), 0)             AS avg_cs_per_min
  FROM scoped s
  JOIN public.profiles pr ON pr.id = s.profile_id
  GROUP BY s.tracked_player_id, s.profile_id, pr.username, s.relation
  ORDER BY (s.relation = 'self') DESC, winrate DESC, games DESC, pr.username;
END;
$function$;

CREATE OR REPLACE FUNCTION public.prac_player_stats(p_tracked_player_id uuid)
 RETURNS TABLE(tracked_player_id uuid, profile_id uuid, username text, games bigint, wins bigint, losses bigint, winrate numeric, avg_kda numeric, avg_kills numeric, avg_deaths numeric, avg_assists numeric, avg_cs_per_min numeric, avg_vision_score numeric, avg_damage_dealt numeric, avg_gold_earned numeric, top_champions jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_profile_id uuid;
  v_username   text;
  v_is_admin   boolean := public.is_prac_admin(auth.uid());
  v_is_self    boolean;
  v_visible    uuid[];
BEGIN
  -- Résolution de la cible — ORDRE anti-énumération (identique à 4A) :
  --   admin → révélation honnête not_found ; non-admin → not_authorized indistinct.
  SELECT tp.profile_id, pr.username
    INTO v_profile_id, v_username
    FROM public.tracked_players tp
    JOIN public.profiles pr ON pr.id = tp.profile_id
   WHERE tp.id = p_tracked_player_id;
  IF NOT FOUND THEN
    IF v_is_admin THEN
      RAISE EXCEPTION 'not_found';
    ELSE
      RAISE EXCEPTION 'not_authorized';
    END IF;
  END IF;

  v_is_self := (auth.uid() = v_profile_id);

  -- Ensemble des matchs visibles pour l'appelant — SOURCE UNIQUE de la portée.
  SELECT array_agg(mid) INTO v_visible
    FROM public.prac_visible_match_ids(auth.uid(), p_tracked_player_id) AS mid;
  v_visible := COALESCE(v_visible, ARRAY[]::uuid[]);

  -- Autorisation : admin/self toujours (agrégats possiblement vides) ; cat. 3
  -- seulement s'il partage ≥1 match ; sinon (aucune relation) not_authorized.
  IF NOT (v_is_admin OR v_is_self) AND cardinality(v_visible) = 0 THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  RETURN QUERY
  WITH m AS (
    -- Alias explicite (tmx) : évite la collision avec la colonne OUT homonyme
    -- tracked_player_id du RETURNS TABLE (piège 4A). Portée = matchs visibles.
    SELECT tmx.* FROM public.tracked_matches tmx
     WHERE tmx.id = ANY(v_visible)
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
      (SUM(m.kills) + SUM(m.assists))::numeric,
      0
    )                                                                AS avg_kda,
    COALESCE(ROUND(AVG(m.kills)::numeric, 1), 0)                     AS avg_kills,
    COALESCE(ROUND(AVG(m.deaths)::numeric, 1), 0)                    AS avg_deaths,
    COALESCE(ROUND(AVG(m.assists)::numeric, 1), 0)                   AS avg_assists,
    COALESCE(ROUND(SUM(m.cs)::numeric
             / NULLIF(SUM(m.duration_s), 0) * 60, 2), 0)             AS avg_cs_per_min,
    COALESCE(ROUND(AVG(m.vision_score)::numeric, 1), 0)             AS avg_vision_score,
    COALESCE(ROUND(AVG(m.damage_dealt)::numeric, 0), 0)             AS avg_damage_dealt,
    COALESCE(ROUND(AVG(m.gold_earned)::numeric, 0), 0)              AS avg_gold_earned,
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
$function$;

