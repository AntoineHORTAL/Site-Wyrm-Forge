-- Tests SQL — les fonctions de cosmétiques obéissent à `cosmetics_enabled`
-- (migration 20261017000003 : equip / unequip / get_equipped_cosmetics).
--
-- ════════════════════════════════════════════════════════════════════════════
--  COMMENT LANCER
-- ════════════════════════════════════════════════════════════════════════════
--   1. SQL Editor du projet **TEST** (gyjcdswpybrhesarompg) — ⚠️ PAS la prod.
--      (Ou `supabase db query --linked -f <ce fichier>` depuis un dossier lié à TEST.)
--   2. Coller CE FICHIER EN ENTIER, exécuter, lire la colonne `r` : tout doit être ✅.
--   3. `ROLLBACK` final → rien ne persiste (cosmétiques semés, PUUID de test, flags).
--
-- ⚠️ Ce script BASCULE `ecailles_enabled` et `cosmetics_enabled` dans sa transaction,
-- et pose un PUUID factice sur un profil : TEST seulement. Mêmes conventions que
-- 20261017000002_scenarios_flag_rls_test.sql (identités résolues, résultats écrits
-- sous le rôle du script : `authenticated` / `anon` n'ont aucun droit sur t_res).

BEGIN;

CREATE TEMP TABLE t_res (
  ordre int, test text, attendu text, obtenu text, ok boolean
) ON COMMIT DROP;

DO $t$
DECLARE
  v_admin  uuid;
  v_client uuid;
  v_c1     bigint;   -- cosmétique possédé (client et admin)
  v_c2     bigint;   -- cosmétique NON possédé par le client
  v_puuid  text := 'test-cosm-flag-' || replace(gen_random_uuid()::text, '-', '');
  v_e1 text; v_e2 text; v_e3 text; v_e4 text;
  v_n1 int;  v_n2 int;
  v_eq0    boolean;
BEGIN
  -- ══ T0 — identités, pré-requis, cobayes ═══════════════════════════════════
  SELECT user_id INTO v_admin FROM public.admin_users ORDER BY user_id LIMIT 1;
  SELECT p.id INTO v_client FROM public.profiles p
   WHERE NOT EXISTS (SELECT 1 FROM public.admin_users a WHERE a.user_id = p.id)
   ORDER BY p.created_at, p.id LIMIT 1;
  IF v_admin IS NULL OR v_client IS NULL THEN
    RAISE EXCEPTION 'Il faut un admin (admin_users) et un profil non admin.';
  END IF;
  IF to_regprocedure('public.launch_flag_on(text)') IS NULL THEN
    RAISE EXCEPTION 'launch_flag_on absente — appliquer 20261017000002 d''abord.';
  END IF;
  IF pg_get_functiondef('public.equip_cosmetic(bigint)'::regprocedure) NOT LIKE '%cosmetics_disabled%' THEN
    RAISE EXCEPTION 'equip_cosmetic sans garde — appliquer 20261017000003 d''abord.';
  END IF;

  -- Deux cosmétiques semés pour le test (le catalogue de TEST peut être vide) —
  -- annulés au ROLLBACK comme le reste.
  INSERT INTO public.cosmetics (slug, type, name, rarity, price_scales)
  VALUES ('__test_flag_c1_' || left(v_puuid, 24), 'avatar_frame', 'Test flag C1', 'common', 1)
  RETURNING id INTO v_c1;
  INSERT INTO public.cosmetics (slug, type, name, rarity, price_scales)
  VALUES ('__test_flag_c2_' || left(v_puuid, 24), 'avatar', 'Test flag C2', 'common', 1)
  RETURNING id INTO v_c2;

  -- Cobayes remis à zéro DANS la transaction (annulé au ROLLBACK).
  DELETE FROM public.user_cosmetics WHERE user_id IN (v_client, v_admin);
  INSERT INTO public.user_cosmetics (user_id, cosmetic_id, cosmetic_type, is_equipped)
  SELECT u, c.id, c.type, true
    FROM unnest(ARRAY[v_client, v_admin]) AS u, public.cosmetics c
   WHERE c.id = v_c1;
  UPDATE public.profiles SET riot_puuid = v_puuid WHERE id = v_client;

  INSERT INTO t_res VALUES (0, 'T0 — identités, 2 cosmétiques, PUUID de test',
    'ok', format('admin=%s client=%s c1=%s c2=%s', left(v_admin::text,8), left(v_client::text,8), v_c1, v_c2), true);

  -- ══ FLAG FERMÉ (cosmetics_enabled = false, parent ouvert) ═════════════════
  UPDATE public.app_settings SET value = 'true'  WHERE key = 'ecailles_enabled';
  UPDATE public.app_settings SET value = 'false' WHERE key = 'cosmetics_enabled';

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_client, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN PERFORM public.equip_cosmetic(v_c1);   v_e1 := '(passé)'; EXCEPTION WHEN OTHERS THEN v_e1 := SQLERRM; END;
  BEGIN PERFORM public.unequip_cosmetic(v_c1); v_e2 := '(passé)'; EXCEPTION WHEN OTHERS THEN v_e2 := SQLERRM; END;
  EXECUTE 'RESET ROLE';
  SELECT is_equipped INTO v_eq0 FROM public.user_cosmetics WHERE user_id = v_client AND cosmetic_id = v_c1;
  INSERT INTO t_res VALUES (1, 'T1 — fermé : le client ne peut pas ÉQUIPER',
    'cosmetics_disabled', v_e1, v_e1 = 'cosmetics_disabled');
  INSERT INTO t_res VALUES (2, 'T2 — fermé : ni DÉSÉQUIPER, et rien n''a bougé',
    'cosmetics_disabled · toujours équipé', format('%s · équipé=%s', v_e2, v_eq0),
    v_e2 = 'cosmetics_disabled' AND v_eq0);

  -- T3 — page publique : liste vide pour anon, et pour le client lui-même
  PERFORM set_config('request.jwt.claims', '{}', true);
  EXECUTE 'SET LOCAL ROLE anon';
  SELECT count(*) INTO v_n1 FROM public.get_equipped_cosmetics(v_puuid);
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_client, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO v_n2 FROM public.get_equipped_cosmetics(v_puuid);
  EXECUTE 'RESET ROLE';
  INSERT INTO t_res VALUES (3, 'T3 — fermé : get_equipped vide (anon, client), sans erreur',
    '0 / 0', format('%s / %s', v_n1, v_n2), v_n1 = 0 AND v_n2 = 0);

  -- T4 — passe-droit admin : équipe le sien, voit les cosmétiques équipés
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN PERFORM public.equip_cosmetic(v_c1); v_e3 := 'ok'; EXCEPTION WHEN OTHERS THEN v_e3 := SQLERRM; END;
  SELECT count(*) INTO v_n1 FROM public.get_equipped_cosmetics(v_puuid);
  EXECUTE 'RESET ROLE';
  INSERT INTO t_res VALUES (4, 'T4 — fermé : l''admin équipe et voit (recette)',
    'ok · ≥ 1 ligne', format('%s · %s ligne(s)', v_e3, v_n1), v_e3 = 'ok' AND v_n1 >= 1);

  -- ══ PARENT FERMÉ, enfant ouvert ═══════════════════════════════════════════
  UPDATE public.app_settings SET value = 'false' WHERE key = 'ecailles_enabled';
  UPDATE public.app_settings SET value = 'true'  WHERE key = 'cosmetics_enabled';
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_client, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN PERFORM public.equip_cosmetic(v_c1); v_e1 := '(passé)'; EXCEPTION WHEN OTHERS THEN v_e1 := SQLERRM; END;
  EXECUTE 'RESET ROLE';
  INSERT INTO t_res VALUES (5, 'T5 — ecailles fermé + cosmetics ouvert ⇒ fermé',
    'cosmetics_disabled', v_e1, v_e1 = 'cosmetics_disabled');

  -- ══ OUVERT (les deux) ═════════════════════════════════════════════════════
  UPDATE public.app_settings SET value = 'true' WHERE key IN ('ecailles_enabled', 'cosmetics_enabled');
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_client, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN PERFORM public.unequip_cosmetic(v_c1); v_e1 := 'ok'; EXCEPTION WHEN OTHERS THEN v_e1 := SQLERRM; END;
  BEGIN PERFORM public.equip_cosmetic(v_c1);   v_e2 := 'ok'; EXCEPTION WHEN OTHERS THEN v_e2 := SQLERRM; END;
  BEGIN PERFORM public.equip_cosmetic(v_c2);   v_e4 := '(passé)'; EXCEPTION WHEN OTHERS THEN v_e4 := SQLERRM; END;
  EXECUTE 'RESET ROLE';
  INSERT INTO t_res VALUES (6, 'T6 — ouvert : le client déséquipe puis rééquipe',
    'ok / ok', format('%s / %s', v_e1, v_e2), v_e1 = 'ok' AND v_e2 = 'ok');
  INSERT INTO t_res VALUES (7, 'T7 — ouvert : la règle métier tient (non possédé)',
    'cosmetic_not_owned', v_e4, v_e4 = 'cosmetic_not_owned');

  PERFORM set_config('request.jwt.claims', '{}', true);
  EXECUTE 'SET LOCAL ROLE anon';
  SELECT count(*) INTO v_n1 FROM public.get_equipped_cosmetics(v_puuid);
  EXECUTE 'RESET ROLE';
  INSERT INTO t_res VALUES (8, 'T8 — ouvert : la page publique voit le cosmétique équipé',
    '1 ligne', format('%s ligne(s)', v_n1), v_n1 = 1);
END
$t$;

-- T9 — privilèges inchangés par CREATE OR REPLACE
INSERT INTO t_res
SELECT 9, 'T9 — droits : equip/unequip auth seul ; get_equipped anon + auth',
       'f/f · t/t · t/t',
       format('%s/%s · %s/%s · %s/%s',
         has_function_privilege('anon', 'public.equip_cosmetic(bigint)', 'EXECUTE'),
         has_function_privilege('anon', 'public.unequip_cosmetic(bigint)', 'EXECUTE'),
         has_function_privilege('authenticated', 'public.equip_cosmetic(bigint)', 'EXECUTE'),
         has_function_privilege('authenticated', 'public.unequip_cosmetic(bigint)', 'EXECUTE'),
         has_function_privilege('anon', 'public.get_equipped_cosmetics(text)', 'EXECUTE'),
         has_function_privilege('authenticated', 'public.get_equipped_cosmetics(text)', 'EXECUTE')),
       NOT has_function_privilege('anon', 'public.equip_cosmetic(bigint)', 'EXECUTE')
       AND NOT has_function_privilege('anon', 'public.unequip_cosmetic(bigint)', 'EXECUTE')
       AND has_function_privilege('authenticated', 'public.equip_cosmetic(bigint)', 'EXECUTE')
       AND has_function_privilege('authenticated', 'public.unequip_cosmetic(bigint)', 'EXECUTE')
       AND has_function_privilege('anon', 'public.get_equipped_cosmetics(text)', 'EXECUTE')
       AND has_function_privilege('authenticated', 'public.get_equipped_cosmetics(text)', 'EXECUTE');

SELECT ordre, CASE WHEN ok THEN '✅' ELSE '❌' END AS r, test, attendu, obtenu
  FROM t_res ORDER BY ordre;

ROLLBACK;
