-- Tests SQL — la table `scenarios` obéit au flag `scenarios_enabled`
-- (migration 20261017000002 : `launch_flag_on()` + les 4 policies `scn_*`).
--
-- ════════════════════════════════════════════════════════════════════════════
--  COMMENT LANCER
-- ════════════════════════════════════════════════════════════════════════════
--   1. Ouvrir le SQL Editor sur le projet **TEST** (gyjcdswpybrhesarompg).
--      ⚠️ PAS la prod (cuscgmgqakxnfwnsrhhv). Vérifier le nom du projet en haut
--      à gauche : « Wyrm Forge Test ».
--   2. Coller CE FICHIER EN ENTIER dans un onglet vide, puis exécuter.
--   3. Lire la table de résultats : une ligne par test, colonne `ok`.
--      Tout doit être `✅`. `ROLLBACK` final → rien ne persiste.
--   (En CLI : `supabase db query --linked -f <ce fichier>` depuis un dossier lié
--   au projet de TEST.)
--
-- Mêmes conventions que les tests du kit (20260909000001) : aucune méta-commande
-- psql, identités résolues par le script, un seul BEGIN … ROLLBACK.
--
-- ⚠️ CE SCRIPT BASCULE `scenarios_enabled` (et, en T9, `ecailles_enabled` /
-- `shop_enabled`) DANS SA TRANSACTION — c'est voulu : il faut prouver les deux
-- états. Rien n'est jamais commité, d'où l'exécution sur TEST seulement.
--
-- Rappel des deux mécanismes : `request.jwt.claims` décide QUI on est
-- (`auth.uid()`, `is_admin()`), `SET LOCAL ROLE` sous quel RÔLE (donc quels
-- privilèges et quelles policies). Sous le rôle du SQL Editor (superuser), la RLS
-- ne s'appliquerait pas : chaque test client passe donc par `authenticated`.

BEGIN;

CREATE TEMP TABLE t_res (
  ordre    int,
  test     text,
  attendu  text,
  obtenu   text,
  ok       boolean
) ON COMMIT DROP;

DO $t$
DECLARE
  v_admin   uuid;
  v_client  uuid;
  v_flag0   text;
  v_row_c   uuid;    -- scénario du client, semé en superuser
  v_row_a   uuid;    -- scénario de l'admin, semé en superuser
  v_new     uuid;
  v_cnt     int;
  v_cnt2    int;
  v_t1      int;
  v_t3      int;
  v_t4      int;
  v_err     text;
  v_b1      boolean;
  v_b2      boolean;
  v_b3      boolean;
  v_b4      boolean;
BEGIN
  -- ══════════════════════════════════════════════════════════════════════
  -- T0 — Identités, pré-requis, cobayes
  -- ══════════════════════════════════════════════════════════════════════
  SELECT user_id INTO v_admin FROM public.admin_users ORDER BY user_id LIMIT 1;
  IF v_admin IS NULL THEN
    RAISE EXCEPTION 'admin_users est VIDE — impossible de tester le passe-droit admin.';
  END IF;
  SELECT p.id INTO v_client
    FROM public.profiles p
   WHERE NOT EXISTS (SELECT 1 FROM public.admin_users a WHERE a.user_id = p.id)
   ORDER BY p.created_at, p.id LIMIT 1;
  IF v_client IS NULL THEN
    RAISE EXCEPTION 'Il faut au moins un profil non admin.';
  END IF;
  IF to_regprocedure('public.launch_flag_on(text)') IS NULL THEN
    RAISE EXCEPTION 'launch_flag_on est absente — la migration 20261017000002 '
                    'n''a pas été appliquée sur cette base. La jouer avant ces tests.';
  END IF;
  SELECT value INTO v_flag0 FROM public.app_settings WHERE key = 'scenarios_enabled';
  IF v_flag0 IS NULL THEN
    RAISE EXCEPTION 'scenarios_enabled absent d''app_settings.';
  END IF;

  INSERT INTO public.scenarios (user_id, name) VALUES (v_client, '__test_rls_client')
    RETURNING id INTO v_row_c;
  INSERT INTO public.scenarios (user_id, name) VALUES (v_admin, '__test_rls_admin')
    RETURNING id INTO v_row_a;

  INSERT INTO t_res VALUES (0, 'T0 — identités, flag connu, 2 scénarios semés',
    'admin + non-admin + flag', format('admin=%s client=%s flag=%s',
      left(v_admin::text, 8), left(v_client::text, 8), v_flag0), true);

  -- ══════════════════════════════════════════════════════════════════════
  -- FLAG FERMÉ — le compte non admin ne touche plus à rien
  -- ══════════════════════════════════════════════════════════════════════
  UPDATE public.app_settings SET value = 'false' WHERE key = 'scenarios_enabled';
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_client, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  -- T1 — lecture
  -- (Résultats écrits APRÈS `RESET ROLE` : `authenticated` n'a aucun droit sur
  -- la table temporaire.)
  SELECT count(*) INTO v_t1 FROM public.scenarios WHERE id = v_row_c;

  -- T2 — création
  BEGIN
    INSERT INTO public.scenarios (user_id, name) VALUES (v_client, '__test_rls_insert');
    v_err := '(aucune erreur — INSERT PASSÉ)';
  EXCEPTION WHEN OTHERS THEN v_err := SQLSTATE || ' ' || SQLERRM;
  END;

  -- T3 — modification
  UPDATE public.scenarios SET name = '__test_rls_renamed' WHERE id = v_row_c;
  GET DIAGNOSTICS v_t3 = ROW_COUNT;

  -- T4 — suppression
  DELETE FROM public.scenarios WHERE id = v_row_c;
  GET DIAGNOSTICS v_t4 = ROW_COUNT;

  EXECUTE 'RESET ROLE';
  INSERT INTO t_res VALUES (1, 'T1 — flag fermé : le client ne LIT plus son scénario',
    '0 ligne', format('%s ligne(s)', v_t1), v_t1 = 0);
  INSERT INTO t_res VALUES (2, 'T2 — flag fermé : le client ne CRÉE pas',
    '42501 (RLS)', v_err, v_err LIKE '42501%');
  INSERT INTO t_res VALUES (3, 'T3 — flag fermé : le client ne MODIFIE pas',
    '0 ligne', format('%s ligne(s)', v_t3), v_t3 = 0);
  INSERT INTO t_res VALUES (4, 'T4 — flag fermé : le client ne SUPPRIME pas',
    '0 ligne', format('%s ligne(s)', v_t4), v_t4 = 0);

  -- T5 — les données ne sont pas perdues, seulement masquées
  SELECT count(*) INTO v_cnt FROM public.scenarios
   WHERE id = v_row_c AND name = '__test_rls_client';
  INSERT INTO t_res VALUES (5, 'T5 — flag fermé : la ligne existe toujours, intacte',
    '1 ligne', format('%s ligne(s)', v_cnt), v_cnt = 1);

  -- T6 — passe-droit admin (ses propres scénarios seulement)
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO v_cnt FROM public.scenarios WHERE id IN (v_row_a, v_row_c);
  BEGIN
    INSERT INTO public.scenarios (user_id, name) VALUES (v_admin, '__test_rls_admin2')
      RETURNING id INTO v_new;
    v_err := 'ok';
  EXCEPTION WHEN OTHERS THEN v_err := SQLSTATE || ' ' || SQLERRM;
  END;
  EXECUTE 'RESET ROLE';
  INSERT INTO t_res VALUES (6, 'T6 — flag fermé : l''admin lit et crée LES SIENS (recette)',
    '1 ligne visible (la sienne, pas celle du client) + insert ok',
    format('%s ligne(s), insert=%s', v_cnt, v_err), v_cnt = 1 AND v_err = 'ok');

  -- ══════════════════════════════════════════════════════════════════════
  -- FLAG OUVERT (bascule AdminTab) — effet immédiat, sans déploiement
  -- ══════════════════════════════════════════════════════════════════════
  UPDATE public.app_settings SET value = 'true' WHERE key = 'scenarios_enabled';
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_client, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  SELECT count(*) INTO v_cnt FROM public.scenarios WHERE id = v_row_c;
  v_b1 := v_cnt = 1;
  BEGIN
    INSERT INTO public.scenarios (user_id, name) VALUES (v_client, '__test_rls_insert')
      RETURNING id INTO v_new;
    v_b2 := true;
  EXCEPTION WHEN OTHERS THEN v_b2 := false;
  END;
  UPDATE public.scenarios SET name = '__test_rls_renamed' WHERE id = v_row_c;
  GET DIAGNOSTICS v_cnt = ROW_COUNT;
  v_b3 := v_cnt = 1;
  DELETE FROM public.scenarios WHERE id = v_new;
  GET DIAGNOSTICS v_cnt = ROW_COUNT;
  v_b4 := v_cnt = 1;
  EXECUTE 'RESET ROLE';
  INSERT INTO t_res VALUES (7, 'T7 — flag ouvert : le client lit / crée / modifie / supprime',
    'true / true / true / true', format('%s / %s / %s / %s', v_b1, v_b2, v_b3, v_b4),
    v_b1 AND v_b2 AND v_b3 AND v_b4);

  -- T8 — la propriété tient toujours, flag ouvert
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO v_cnt FROM public.scenarios WHERE id = v_row_a;
  UPDATE public.scenarios SET name = 'pirate' WHERE id = v_row_a;
  GET DIAGNOSTICS v_cnt2 = ROW_COUNT;
  BEGIN
    INSERT INTO public.scenarios (user_id, name) VALUES (v_admin, '__test_rls_spoof');
    v_err := '(aucune erreur — INSERT PASSÉ)';
  EXCEPTION WHEN OTHERS THEN v_err := SQLSTATE;
  END;
  EXECUTE 'RESET ROLE';
  INSERT INTO t_res VALUES (8, 'T8 — flag ouvert : rien sur le scénario d''un autre',
    'lecture 0 · update 0 · insert au nom d''autrui 42501',
    format('lecture %s · update %s · insert %s', v_cnt, v_cnt2, v_err),
    v_cnt = 0 AND v_cnt2 = 0 AND v_err = '42501');

  -- ══════════════════════════════════════════════════════════════════════
  -- launch_flag_on — sémantique
  -- ══════════════════════════════════════════════════════════════════════
  -- T9 — hiérarchie : un enfant ouvert sous un parent fermé est fermé
  UPDATE public.app_settings SET value = 'false' WHERE key = 'ecailles_enabled';
  UPDATE public.app_settings SET value = 'true'  WHERE key = 'shop_enabled';
  v_b1 := public.launch_flag_on('shop_enabled');
  UPDATE public.app_settings SET value = 'true'  WHERE key = 'ecailles_enabled';
  v_b2 := public.launch_flag_on('shop_enabled');
  INSERT INTO t_res VALUES (9, 'T9 — parent fermé ⇒ enfant fermé ; les deux ouverts ⇒ ouvert',
    'false puis true', format('%s puis %s', v_b1, v_b2), NOT v_b1 AND v_b2);

  -- T10 — repli fermé et pas de fuite des valeurs de tuning
  v_b1 := public.launch_flag_on('flag_qui_n_existe_pas');
  v_b2 := public.launch_flag_on('patch_auto_publish');   -- kind 'setting', privé
  INSERT INTO t_res VALUES (10, 'T10 — clé inconnue ⇒ false ; valeur de tuning ⇒ false',
    'false / false', format('%s / %s', v_b1, v_b2),
    v_b1 IS FALSE AND v_b2 IS FALSE);

  -- T11 — anon ne lit toujours rien
  PERFORM set_config('request.jwt.claims', '{}', true);
  EXECUTE 'SET LOCAL ROLE anon';
  BEGIN
    SELECT count(*) INTO v_cnt FROM public.scenarios;
    v_err := format('(aucune erreur — %s lignes)', v_cnt);
  EXCEPTION WHEN OTHERS THEN v_err := SQLSTATE;
  END;
  EXECUTE 'RESET ROLE';
  INSERT INTO t_res VALUES (11, 'T11 — anon sur scenarios, flag ouvert', '42501', v_err,
    v_err = '42501');

  -- Valeurs d'origine (le ROLLBACK s'en charge aussi).
  UPDATE public.app_settings SET value = v_flag0 WHERE key = 'scenarios_enabled';
END
$t$;

-- T12 — privilèges réels de la fonction (règle des trois instructions)
WITH fn AS (SELECT to_regprocedure('public.launch_flag_on(text)') AS f)
INSERT INTO t_res
SELECT 12, 'T12 — launch_flag_on : anon non, authenticated oui',
       'anon=false authenticated=true',
       format('anon=%s authenticated=%s',
         has_function_privilege('anon', f, 'EXECUTE'),
         has_function_privilege('authenticated', f, 'EXECUTE')),
       NOT has_function_privilege('anon', f, 'EXECUTE')
       AND has_function_privilege('authenticated', f, 'EXECUTE')
  FROM fn;

-- T13 — exactement 4 policies sur scenarios, toutes gardées par le flag
INSERT INTO t_res
SELECT 13, 'T13 — 4 policies scn_*, toutes relisent le flag',
       '4 / 4', format('%s / %s', count(*),
         count(*) FILTER (WHERE coalesce(qual,'') || coalesce(with_check,'') LIKE '%launch_flag_on%')),
       count(*) = 4
       AND count(*) FILTER (WHERE coalesce(qual,'') || coalesce(with_check,'') LIKE '%launch_flag_on%') = 4
  FROM pg_policies WHERE schemaname = 'public' AND tablename = 'scenarios';

SELECT ordre, CASE WHEN ok THEN '✅' ELSE '❌' END AS r, test, attendu, obtenu
  FROM t_res ORDER BY ordre;

-- Rien ne persiste : scénarios semés, bascules de flags.
ROLLBACK;
