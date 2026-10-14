-- Tests SQL — purges automatiques `privacy_purge()` (migration 20261014000001).
--
-- COMMENT LANCER : SQL Editor du projet **TEST** (gyjcdswpybrhesarompg), ou
-- `supabase db query --linked -f` sur un dossier lié à TEST. Lire la table de
-- résultats (tout ✅). ROLLBACK final : rien ne persiste.
--
-- Chaque test pose une ligne juste AVANT et une juste APRÈS sa limite, puis
-- appelle la purge : seule la première doit disparaître.

BEGIN;

CREATE TEMP TABLE t_res (ordre int, test text, attendu text, obtenu text, ok boolean) ON COMMIT DROP;

DO $t$
DECLARE
  v_n int;
BEGIN
  IF to_regprocedure('public.privacy_purge()') IS NULL THEN
    RAISE EXCEPTION 'privacy_purge() absente — jouer la migration 20261014000001 avant ces tests.';
  END IF;

  -- ── Jeu de données ─────────────────────────────────────────────────────────
  INSERT INTO public.rank_stat_samples
    (puuid, match_id, region, queue, tier, role, kills, deaths, assists,
     cs_per_min, vision_score, damage_dealt, gold_earned, duration_s, win, collected_at)
  VALUES
    ('t-puuid-vieux',  'T_1', 'euw1', 420, 'GOLD', 'MIDDLE', 1, 1, 1, 6, 20, 10000, 9000, 1800, true, now() - interval '1 year 1 day'),
    ('t-puuid-recent', 'T_2', 'euw1', 420, 'GOLD', 'MIDDLE', 1, 1, 1, 6, 20, 10000, 9000, 1800, true, now() - interval '11 months');

  INSERT INTO public.riot_cache (cache_key, function_name, response_body, expires_at) VALUES
    ('rate:ip:t-expiree',   'public-search', '[]'::jsonb, now() - interval '1 minute'),
    ('rate:ip:t-active',    'public-search', '[]'::jsonb, now() + interval '30 minutes'),
    ('t:cache:49h',         'riot-matches',  '{}'::jsonb, now() - interval '49 hours'),
    ('t:cache:47h',         'riot-matches',  '{}'::jsonb, now() - interval '47 hours');

  INSERT INTO public.searched_summoners (region, game_name, tag_line, last_seen) VALUES
    ('euw1', 't-vieux',  'T1', now() - interval '6 months 1 day'),
    ('euw1', 't-recent', 'T1', now() - interval '5 months');

  PERFORM public.privacy_purge();

  -- ── T1 — échantillons de rang : un an ─────────────────────────────────────
  SELECT count(*) INTO v_n FROM public.rank_stat_samples WHERE puuid IN ('t-puuid-vieux', 't-puuid-recent');
  INSERT INTO t_res VALUES (1, 'T1 — rank_stat_samples > 1 an purgé, < 1 an gardé',
    'reste t-puuid-recent', v_n::text || ' ligne(s)',
    v_n = 1 AND EXISTS (SELECT 1 FROM public.rank_stat_samples WHERE puuid = 't-puuid-recent'));

  -- ── T2 — clés de limitation : dès l'expiration ────────────────────────────
  SELECT count(*) INTO v_n FROM public.riot_cache WHERE cache_key LIKE 'rate:ip:t-%';
  INSERT INTO t_res VALUES (2, 'T2 — clé rate:* expirée purgée, active gardée',
    'reste rate:ip:t-active', v_n::text || ' ligne(s)',
    v_n = 1 AND EXISTS (SELECT 1 FROM public.riot_cache WHERE cache_key = 'rate:ip:t-active'));

  -- ── T3 — autres entrées : 48 h après expiration ───────────────────────────
  SELECT count(*) INTO v_n FROM public.riot_cache WHERE cache_key LIKE 't:cache:%';
  INSERT INTO t_res VALUES (3, 'T3 — cache expiré depuis 49 h purgé, 47 h gardé (repli périmé)',
    'reste t:cache:47h', v_n::text || ' ligne(s)',
    v_n = 1 AND EXISTS (SELECT 1 FROM public.riot_cache WHERE cache_key = 't:cache:47h'));

  -- ── T4 — autocomplétion : 6 mois ──────────────────────────────────────────
  SELECT count(*) INTO v_n FROM public.searched_summoners WHERE game_name IN ('t-vieux', 't-recent');
  INSERT INTO t_res VALUES (4, 'T4 — searched_summoners > 6 mois purgé, < 6 mois gardé',
    'reste t-recent', v_n::text || ' ligne(s)',
    v_n = 1 AND EXISTS (SELECT 1 FROM public.searched_summoners WHERE game_name = 't-recent'));

  -- ── T5 — personne d'autre que postgres ne lance la purge ─────────────────
  INSERT INTO t_res VALUES (5, 'T5 — privacy_purge() fermée à anon et authenticated',
    'false / false',
    has_function_privilege('anon', 'public.privacy_purge()', 'EXECUTE')::text || ' / '
      || has_function_privilege('authenticated', 'public.privacy_purge()', 'EXECUTE')::text,
    NOT has_function_privilege('anon', 'public.privacy_purge()', 'EXECUTE')
      AND NOT has_function_privilege('authenticated', 'public.privacy_purge()', 'EXECUTE'));

  -- ── T6 — job planifié ──────────────────────────────────────────────────────
  SELECT count(*) INTO v_n FROM cron.job WHERE jobname = 'privacy-purge' AND active AND schedule = '*/15 * * * *';
  INSERT INTO t_res VALUES (6, 'T6 — job pg_cron privacy-purge actif, toutes les 15 min',
    '1', v_n::text, v_n = 1);

  -- ── T7 — plus aucun détail de match « permanent » ─────────────────────────
  SELECT count(*) INTO v_n FROM public.riot_cache
   WHERE function_name = 'riot-match-detail' AND expires_at > now() + interval '31 days';
  INSERT INTO t_res VALUES (7, 'T7 — aucun détail de match au-delà de 30 jours',
    '0', v_n::text, v_n = 0);
END
$t$;

SELECT ordre, CASE WHEN ok THEN '✅' ELSE '❌' END AS r, test, attendu, obtenu
  FROM t_res ORDER BY ordre;

ROLLBACK;
