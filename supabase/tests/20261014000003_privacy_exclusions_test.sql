-- Tests SQL — liste d'exclusion et procédure d'opposition (migration 20261014000003).
--
-- COMMENT LANCER : projet **TEST** (gyjcdswpybrhesarompg), ce fichier en entier.
-- ROLLBACK final : rien ne persiste.

BEGIN;

CREATE TEMP TABLE t_res (ordre int, test text, attendu text, obtenu text, ok boolean) ON COMMIT DROP;

DO $t$
DECLARE
  v_ex    text := repeat('x', 78);   -- joueur qui s'oppose
  v_ok    text := repeat('y', 78);   -- joueur sans opposition
  v_n     int;
  v_res   jsonb;
  v_err   text;
BEGIN
  IF to_regclass('public.riot_privacy_exclusions') IS NULL THEN
    RAISE EXCEPTION 'riot_privacy_exclusions absente — jouer la migration 20261014000003 avant ces tests.';
  END IF;

  -- Données existantes au nom du joueur, AVANT son opposition.
  INSERT INTO public.rank_stat_samples
    (puuid, match_id, region, queue, tier, role, kills, deaths, assists,
     cs_per_min, vision_score, damage_dealt, gold_earned, duration_s, win)
  VALUES
    (v_ex, 'TX_1', 'euw1', 420, 'GOLD', 'MIDDLE', 1, 1, 1, 6, 20, 10000, 9000, 1800, true),
    (v_ok, 'TY_1', 'euw1', 420, 'GOLD', 'MIDDLE', 1, 1, 1, 6, 20, 10000, 9000, 1800, true);
  INSERT INTO public.riot_cache (cache_key, function_name, response_body, expires_at) VALUES
    ('rank:euw1:puuid:' || v_ex, 'riot-rank',         '{}'::jsonb, now() + interval '5 minutes'),
    ('t:match:avec-lui',         'riot-match-detail', jsonb_build_object('participants', jsonb_build_array(jsonb_build_object('puuid', v_ex))), now() + interval '30 days'),
    ('t:match:sans-lui',         'riot-match-detail', jsonb_build_object('participants', jsonb_build_array(jsonb_build_object('puuid', v_ok))), now() + interval '30 days');
  INSERT INTO public.searched_summoners (region, game_name, tag_line) VALUES
    ('euw1', 'TestOppose', 'EUW'), ('euw1', 'TestAutre', 'EUW');

  -- ── Opposition ─────────────────────────────────────────────────────────────
  v_res := public.privacy_forget_player(v_ex, 'euw1', 'testoppose', 'euw');

  -- T1 — l'existant est effacé, et seulement lui
  SELECT count(*) INTO v_n FROM public.rank_stat_samples WHERE puuid IN (v_ex, v_ok);
  INSERT INTO t_res VALUES (1, 'T1 — échantillons du joueur effacés, ceux des autres gardés',
    'reste 1 (autre joueur)', v_n::text, v_n = 1 AND NOT EXISTS (SELECT 1 FROM public.rank_stat_samples WHERE puuid = v_ex));

  SELECT count(*) INTO v_n FROM public.riot_cache WHERE cache_key IN ('rank:euw1:puuid:' || v_ex, 't:match:avec-lui', 't:match:sans-lui');
  INSERT INTO t_res VALUES (2, 'T2 — entrées de cache qui le contiennent effacées (clé ou corps)',
    'reste t:match:sans-lui', v_n::text, v_n = 1 AND EXISTS (SELECT 1 FROM public.riot_cache WHERE cache_key = 't:match:sans-lui'));

  SELECT count(*) INTO v_n FROM public.searched_summoners WHERE game_name IN ('TestOppose', 'TestAutre');
  INSERT INTO t_res VALUES (3, 'T3 — son Riot ID retiré de l’autocomplétion (casse ignorée)',
    'reste TestAutre', v_n::text, v_n = 1 AND EXISTS (SELECT 1 FROM public.searched_summoners WHERE game_name = 'TestAutre'));

  -- T4 — l'opposition tient dans le temps : un nouvel échantillon est écarté
  INSERT INTO public.rank_stat_samples
    (puuid, match_id, region, queue, tier, role, kills, deaths, assists,
     cs_per_min, vision_score, damage_dealt, gold_earned, duration_s, win)
  VALUES
    (v_ex, 'TX_2', 'euw1', 420, 'GOLD', 'MIDDLE', 1, 1, 1, 6, 20, 10000, 9000, 1800, true),
    (v_ok, 'TY_2', 'euw1', 420, 'GOLD', 'MIDDLE', 1, 1, 1, 6, 20, 10000, 9000, 1800, true);
  INSERT INTO t_res VALUES (4, 'T4 — nouvel échantillon du joueur opposé écarté, l’autre inséré',
    'false / true',
    EXISTS (SELECT 1 FROM public.rank_stat_samples WHERE match_id = 'TX_2')::text || ' / '
      || EXISTS (SELECT 1 FROM public.rank_stat_samples WHERE match_id = 'TY_2')::text,
    NOT EXISTS (SELECT 1 FROM public.rank_stat_samples WHERE match_id = 'TX_2')
      AND EXISTS (SELECT 1 FROM public.rank_stat_samples WHERE match_id = 'TY_2'));

  -- T5 — seul le PUUID est gardé
  INSERT INTO t_res VALUES (5, 'T5 — la liste ne garde que le PUUID (et la date)',
    'puuid, created_at',
    (SELECT string_agg(column_name, ', ' ORDER BY ordinal_position) FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'riot_privacy_exclusions'),
    (SELECT string_agg(column_name, ', ' ORDER BY ordinal_position) FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'riot_privacy_exclusions') = 'puuid, created_at');

  -- T6 — idempotent : une seconde demande ne lève rien
  PERFORM public.privacy_forget_player(v_ex);
  SELECT count(*) INTO v_n FROM public.riot_privacy_exclusions WHERE puuid = v_ex;
  INSERT INTO t_res VALUES (6, 'T6 — seconde demande sans erreur, une seule ligne', '1', v_n::text, v_n = 1);

  -- T7 — PUUID invalide refusé (pas de joker possible)
  BEGIN
    PERFORM public.privacy_forget_player('%');
    v_err := 'aucune erreur';
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
  END;
  INSERT INTO t_res VALUES (7, 'T7 — PUUID invalide refusé', 'invalid_puuid', v_err, v_err = 'invalid_puuid');

  -- T8 — fermé aux clients
  INSERT INTO t_res VALUES (8, 'T8 — table et procédure fermées à anon / authenticated', 'false',
    (has_table_privilege('anon', 'public.riot_privacy_exclusions', 'SELECT')
      OR has_table_privilege('authenticated', 'public.riot_privacy_exclusions', 'SELECT')
      OR has_function_privilege('anon', 'public.privacy_forget_player(text, text, text, text)', 'EXECUTE')
      OR has_function_privilege('authenticated', 'public.privacy_forget_player(text, text, text, text)', 'EXECUTE'))::text,
    NOT (has_table_privilege('anon', 'public.riot_privacy_exclusions', 'SELECT')
      OR has_table_privilege('authenticated', 'public.riot_privacy_exclusions', 'SELECT')
      OR has_function_privilege('anon', 'public.privacy_forget_player(text, text, text, text)', 'EXECUTE')
      OR has_function_privilege('authenticated', 'public.privacy_forget_player(text, text, text, text)', 'EXECUTE')));
END
$t$;

SELECT ordre, CASE WHEN ok THEN '✅' ELSE '❌' END AS r, test, attendu, obtenu
  FROM t_res ORDER BY ordre;

ROLLBACK;
