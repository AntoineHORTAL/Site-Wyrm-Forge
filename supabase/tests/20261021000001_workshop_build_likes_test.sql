-- Tests SQL — likes du Workshop Builds (migration 20261021000001) : un like par
-- utilisateur et par build, retirable, jamais sur son propre build, compteur tenu
-- par la base.
--
-- ════════════════════════════════════════════════════════════════════════════
--  COMMENT LANCER
-- ════════════════════════════════════════════════════════════════════════════
--   1. Ouvrir le SQL Editor sur le projet **TEST** (gyjcdswpybrhesarompg).
--      ⚠️ PAS la prod (cuscgmgqakxnfwnsrhhv) : le script crée des comptes dans
--      auth.users et un rôle temporaire (tout est annulé par le ROLLBACK final).
--   2. Coller CE FICHIER EN ENTIER dans un onglet vide, puis exécuter.
--   3. Lire la table de résultats : une ligne par test, colonne `r`.
--      Tout doit être `✅`. `ROLLBACK` final → rien ne persiste.
--   (En CLI : `supabase db query --linked -f <ce fichier>` depuis un dossier lié
--   au projet de TEST.)
--
-- Mêmes conventions que les tests de `jungle_paths` (20261018000001) : aucune
-- méta-commande psql, identités résolues par le script, un seul BEGIN … ROLLBACK.
-- `request.jwt.claims` décide QUI on est (`auth.uid()`), `SET LOCAL ROLE` sous quel
-- RÔLE.
--
-- ── Suppression d'un compte : pourquoi pas `SET LOCAL ROLE supabase_auth_admin`
-- Sur Supabase, `postgres` n'est pas superuser et n'est pas membre de
-- `supabase_auth_admin` ; l'adhésion est réservée aux superusers (« role
-- memberships are reserved », mesuré le 2026-10-21). Le rôle d'Auth ne peut donc
-- pas être endossé depuis le SQL Editor ni la CLI. À la place, trois preuves :
--   T13 — la DÉFINITION : wbl_sync_like_count est SECURITY DEFINER, search_path figé,
--         propriétaire postgres ;
--   T14 — le CONTEXTE LE PLUS DÉFAVORABLE : un rôle temporaire qui n'a AUCUN droit
--         sur workshop_builds (vérifié : son UPDATE direct y est refusé) supprime des
--         likes, comme le fait la cascade ; le compteur doit suivre sans erreur ;
--   T15/T16 — la VRAIE cascade : DELETE dans auth.users d'un compte qui a liké, puis
--         d'un compte AUTEUR d'un build liké (creator_id → NULL).
-- (Pour mémoire : PostgreSQL exécute les actions référentielles sous le propriétaire
-- de la table modifiée, pas sous le rôle qui a lancé le DELETE initial. Le SECURITY
-- DEFINER reste la garantie qui ne dépend pas de ce détail.)

BEGIN;

CREATE TEMP TABLE t_res (
  ordre    int,
  test     text,
  attendu  text,
  obtenu   text,
  ok       boolean
) ON COMMIT DROP;
-- Les résultats s'écrivent aussi sous les rôles client : ce droit-là, aucun autre.
GRANT INSERT ON t_res TO anon, authenticated;

-- Exécute une instruction et renvoie 'ok' ou son SQLSTATE : une écriture refusée
-- doit être OBSERVÉE, pas faire échouer le script.
CREATE FUNCTION pg_temp.try_sql(p_sql text) RETURNS text
LANGUAGE plpgsql AS $f$
BEGIN
  EXECUTE p_sql;
  RETURN 'ok';
EXCEPTION WHEN OTHERS THEN
  RETURN SQLSTATE;
END
$f$;

-- Variante qui garde le message : distingue `own_build` d'un refus de privilège.
CREATE FUNCTION pg_temp.try_msg(p_sql text) RETURNS text
LANGUAGE plpgsql AS $f$
BEGIN
  EXECUTE p_sql;
  RETURN 'ok';
EXCEPTION WHEN OTHERS THEN
  RETURN SQLSTATE || ' ' || SQLERRM;
END
$f$;

-- Rôle temporaire « sans droit sur workshop_builds » (T14) : seulement DELETE sur
-- la table des likes. Annulé par le ROLLBACK, comme tout le reste.
CREATE ROLE wf_test_cascade NOLOGIN;
GRANT wf_test_cascade TO postgres;
GRANT USAGE ON SCHEMA public TO wf_test_cascade;
GRANT SELECT, DELETE ON public.workshop_build_likes TO wf_test_cascade;
GRANT INSERT ON t_res TO wf_test_cascade;

DO $t$
DECLARE
  v_a      uuid;   -- joueur A (celui qui like)
  v_b      uuid;   -- joueur B (auteur du build principal)
  v_c      uuid := gen_random_uuid();   -- compte jetable qui like, supprimé en T15
  v_d      uuid := gen_random_uuid();   -- compte jetable AUTEUR, supprimé en T16
  v_wb_b   uuid := gen_random_uuid();   -- build de B
  v_wb_a   uuid := gen_random_uuid();   -- build de A
  v_wb_z   uuid := gen_random_uuid();   -- build de B pour le plancher à 0
  v_wb_d   uuid := gen_random_uuid();   -- build de D
  v_wb_x   uuid := gen_random_uuid();   -- build de B supprimé en T17
  v_liked  boolean;
  v_liked2 boolean;
  v_cnt    int;
  v_cnt2   int;
  v_cnt3   int;
  v_cnt4   int;
  v_r      text;
  v_r2     text;
  v_r3     text;
  v_owner  uuid;
BEGIN
  -- ══════════════════════════════════════════════════════════════════════
  -- T0 — identités et cobayes (semés sous postgres, avant tout SET ROLE)
  -- ══════════════════════════════════════════════════════════════════════
  IF to_regclass('public.workshop_build_likes') IS NULL THEN
    RAISE EXCEPTION 'workshop_build_likes est absente — appliquer la migration 20261021000001 avant ces tests.';
  END IF;
  SELECT id INTO v_a FROM public.profiles ORDER BY created_at, id LIMIT 1;
  SELECT id INTO v_b FROM public.profiles WHERE id <> v_a ORDER BY created_at, id LIMIT 1;
  IF v_a IS NULL OR v_b IS NULL THEN
    RAISE EXCEPTION 'Il faut au moins deux profils sur cette base.';
  END IF;

  INSERT INTO auth.users (id, email) VALUES
    (v_c, '__test_wbl_c@example.invalid'),
    (v_d, '__test_wbl_d@example.invalid');

  INSERT INTO public.workshop_builds (id, titre, creator_name, creator_id, champion) VALUES
    (v_wb_b, '__test_wbl_b', 'B', v_b, 'Ahri'),
    (v_wb_a, '__test_wbl_a', 'A', v_a, 'Vi'),
    (v_wb_z, '__test_wbl_z', 'B', v_b, 'Lux'),
    (v_wb_d, '__test_wbl_d', 'D', v_d, 'Jinx'),
    (v_wb_x, '__test_wbl_x', 'B', v_b, 'Zed');

  -- B a liké le build de A (lecture d'autrui, T6) ; C a liké les builds de B et D.
  INSERT INTO public.workshop_build_likes (build_id, user_id) VALUES
    (v_wb_a, v_b), (v_wb_b, v_c), (v_wb_d, v_c), (v_wb_x, v_c);

  -- Plancher : A a un like tracé sur Z alors que le compteur est (artificiellement) à 0.
  INSERT INTO public.workshop_build_likes (build_id, user_id) VALUES (v_wb_z, v_a);
  UPDATE public.workshop_builds SET likes = 0 WHERE id = v_wb_z;

  SELECT likes INTO v_cnt FROM public.workshop_builds WHERE id = v_wb_b;
  INSERT INTO t_res VALUES (0, 'T0 — deux profils, deux comptes jetables, cinq builds semés',
    'A + B, likes(B)=1', format('A=%s B=%s, likes(B)=%s', left(v_a::text, 8), left(v_b::text, 8), v_cnt),
    v_cnt = 1);

  -- ══════════════════════════════════════════════════════════════════════
  -- Joueur A connecté
  -- ══════════════════════════════════════════════════════════════════════
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  -- T1 — like
  SELECT liked, like_count INTO v_liked, v_cnt FROM public.toggle_build_like(v_wb_b);
  SELECT count(*) INTO v_cnt2 FROM public.workshop_build_likes WHERE build_id = v_wb_b AND user_id = v_a;
  INSERT INTO t_res VALUES (1, 'T1 — A like le build de B',
    'liked=t, 2, 1 ligne', format('liked=%s, %s, %s ligne', v_liked, v_cnt, v_cnt2),
    v_liked AND v_cnt = 2 AND v_cnt2 = 1);

  -- T2 — unlike
  SELECT liked, like_count INTO v_liked, v_cnt FROM public.toggle_build_like(v_wb_b);
  SELECT count(*) INTO v_cnt2 FROM public.workshop_build_likes WHERE build_id = v_wb_b AND user_id = v_a;
  INSERT INTO t_res VALUES (2, 'T2 — A retire son like',
    'liked=f, 1, 0 ligne', format('liked=%s, %s, %s ligne', v_liked, v_cnt, v_cnt2),
    NOT v_liked AND v_cnt = 1 AND v_cnt2 = 0);

  -- T3 — double toggle = retour à l'état initial (compteur ET ligne)
  SELECT likes INTO v_cnt3 FROM public.workshop_builds WHERE id = v_wb_b;
  SELECT liked INTO v_liked  FROM public.toggle_build_like(v_wb_b);
  SELECT liked, like_count INTO v_liked2, v_cnt FROM public.toggle_build_like(v_wb_b);
  SELECT count(*) INTO v_cnt2 FROM public.workshop_build_likes WHERE build_id = v_wb_b AND user_id = v_a;
  INSERT INTO t_res VALUES (3, 'T3 — double toggle : même compteur, aucune ligne',
    format('t puis f, %s, 0', v_cnt3), format('%s puis %s, %s, %s', v_liked, v_liked2, v_cnt, v_cnt2),
    v_liked AND NOT v_liked2 AND v_cnt = v_cnt3 AND v_cnt2 = 0);

  -- T4 — son propre build
  v_r := pg_temp.try_msg(format('SELECT * FROM public.toggle_build_like(%L)', v_wb_a));
  SELECT likes INTO v_cnt FROM public.workshop_builds WHERE id = v_wb_a;
  INSERT INTO t_res VALUES (4, 'T4 — A ne peut pas liker son propre build',
    '42501 own_build, compteur inchangé (1)', format('%s, %s', v_r, v_cnt),
    v_r = '42501 own_build' AND v_cnt = 1);

  -- T5 — écriture directe dans la table des likes
  v_r  := pg_temp.try_sql(format('INSERT INTO public.workshop_build_likes (build_id) VALUES (%L)', v_wb_b));
  v_r2 := pg_temp.try_sql(format('DELETE FROM public.workshop_build_likes WHERE build_id = %L', v_wb_a));
  v_r3 := pg_temp.try_sql(format('UPDATE public.workshop_build_likes SET user_id = user_id WHERE build_id = %L', v_wb_a));
  INSERT INTO t_res VALUES (5, 'T5 — INSERT / DELETE / UPDATE directs refusés',
    '42501 ×3', format('%s / %s / %s', v_r, v_r2, v_r3),
    v_r = '42501' AND v_r2 = '42501' AND v_r3 = '42501');

  -- T6 — lecture des likes : les siens oui, ceux des autres jamais
  SELECT count(*) INTO v_cnt  FROM public.workshop_build_likes WHERE user_id <> v_a;
  SELECT count(*) INTO v_cnt2 FROM public.workshop_build_likes WHERE user_id = v_a;
  INSERT INTO t_res VALUES (6, 'T6 — A ne lit aucun like d''autrui, lit le sien (Z)',
    '0 / 1', format('%s / %s', v_cnt, v_cnt2), v_cnt = 0 AND v_cnt2 = 1);

  -- T7 — l'auteur réécrit likes/saves en direct : neutralisé, sans erreur
  v_r := pg_temp.try_sql(format(
    'UPDATE public.workshop_builds SET likes = 999, saves = 999, titre = ''__test_wbl_a2'' WHERE id = %L', v_wb_a));
  SELECT likes, saves INTO v_cnt, v_cnt2 FROM public.workshop_builds WHERE id = v_wb_a AND titre = '__test_wbl_a2';
  INSERT INTO t_res VALUES (7, 'T7 — UPDATE likes/saves par l''auteur : titre pris, compteurs inchangés',
    'ok, 1 / 0', format('%s, %s / %s', v_r, v_cnt, v_cnt2), v_r = 'ok' AND v_cnt = 1 AND v_cnt2 = 0);

  -- T8 — publication avec des compteurs gonflés : forcés à 0
  INSERT INTO public.workshop_builds (titre, creator_name, champion, likes, saves)
    VALUES ('__test_wbl_new', 'A', 'Vi', 500, 500)
    RETURNING likes, saves, creator_id INTO v_cnt, v_cnt2, v_owner;
  INSERT INTO t_res VALUES (8, 'T8 — INSERT avec likes/saves = 500 : posés à 0',
    '0 / 0, creator = A', format('%s / %s, creator = %s', v_cnt, v_cnt2,
      CASE WHEN v_owner = v_a THEN 'A' ELSE coalesce(v_owner::text, 'NULL') END),
    v_cnt = 0 AND v_cnt2 = 0 AND v_owner = v_a);

  -- T9 — increment_saves fonctionne toujours (connecté)
  SELECT saves INTO v_cnt FROM public.workshop_builds WHERE id = v_wb_b;
  v_r := pg_temp.try_sql(format('SELECT public.increment_saves(%L)', v_wb_b));
  SELECT saves INTO v_cnt2 FROM public.workshop_builds WHERE id = v_wb_b;
  INSERT INTO t_res VALUES (9, 'T9 — increment_saves (authenticated) : +1',
    format('ok, %s', v_cnt + 1), format('%s, %s', v_r, v_cnt2), v_r = 'ok' AND v_cnt2 = v_cnt + 1);

  -- T10 — plancher : retrait d'un like tracé alors que le compteur est à 0
  SELECT liked, like_count INTO v_liked, v_cnt FROM public.toggle_build_like(v_wb_z);
  INSERT INTO t_res VALUES (10, 'T10 — retrait avec compteur à 0 : reste à 0',
    'liked=f, 0', format('liked=%s, %s', v_liked, v_cnt), NOT v_liked AND v_cnt = 0);

  -- T11 — build inexistant ; increment_likes refusé même connecté
  v_r  := pg_temp.try_msg(format('SELECT * FROM public.toggle_build_like(%L)', gen_random_uuid()));
  v_r2 := pg_temp.try_sql(format('SELECT public.increment_likes(%L)', v_wb_b));
  INSERT INTO t_res VALUES (11, 'T11 — build inexistant / increment_likes (authenticated)',
    'P0002 build_not_found / 42501', format('%s / %s', v_r, v_r2),
    v_r = 'P0002 build_not_found' AND v_r2 = '42501');

  EXECUTE 'RESET ROLE';

  -- ══════════════════════════════════════════════════════════════════════
  -- Visiteur anonyme
  -- ══════════════════════════════════════════════════════════════════════
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  EXECUTE 'SET LOCAL ROLE anon';
  SELECT likes INTO v_cnt FROM public.workshop_builds WHERE id = v_wb_b;
  v_r  := pg_temp.try_sql(format('SELECT * FROM public.toggle_build_like(%L)', v_wb_b));
  v_r2 := pg_temp.try_sql(format('SELECT public.increment_likes(%L)', v_wb_b));
  v_r3 := pg_temp.try_sql('SELECT count(*) FROM public.workshop_build_likes');
  SELECT likes INTO v_cnt2 FROM public.workshop_builds WHERE id = v_wb_b;
  INSERT INTO t_res VALUES (12, 'T12 — anon : toggle / increment_likes / lecture refusés, compteur intact',
    format('42501 ×3, %s', v_cnt), format('%s / %s / %s, %s', v_r, v_r2, v_r3, v_cnt2),
    v_r = '42501' AND v_r2 = '42501' AND v_r3 = '42501' AND v_cnt2 = v_cnt);
  EXECUTE 'RESET ROLE';

  -- ══════════════════════════════════════════════════════════════════════
  -- Suppression de comptes (voir l'en-tête)
  -- ══════════════════════════════════════════════════════════════════════

  -- T13 — définition de la fonction de synchro
  SELECT CASE WHEN p.prosecdef THEN 'definer' ELSE 'invoker' END
         || ' · ' || coalesce(array_to_string(p.proconfig, ','), 'search_path libre')
         || ' · ' || pg_get_userbyid(p.proowner)
    INTO v_r
    FROM pg_proc p WHERE p.oid = 'public.wbl_sync_like_count()'::regprocedure;
  INSERT INTO t_res VALUES (13, 'T13 — wbl_sync_like_count : SECURITY DEFINER, search_path figé',
    'definer · search_path=public · postgres', v_r,
    v_r = 'definer · search_path=public · postgres');

  -- T14 — contexte le plus défavorable : un rôle SANS droit sur workshop_builds
  -- supprime le like de C sur le build de B, comme le ferait la cascade.
  EXECUTE 'CREATE POLICY wbl_test_cascade_delete ON public.workshop_build_likes
             FOR DELETE TO wf_test_cascade USING (true)';
  EXECUTE 'CREATE POLICY wbl_test_cascade_select ON public.workshop_build_likes
             FOR SELECT TO wf_test_cascade USING (true)';
  SELECT likes INTO v_cnt FROM public.workshop_builds WHERE id = v_wb_b;
  EXECUTE 'SET LOCAL ROLE wf_test_cascade';
  v_r  := pg_temp.try_sql(format('UPDATE public.workshop_builds SET titre = titre WHERE id = %L', v_wb_b));
  v_r2 := pg_temp.try_sql(format(
    'DELETE FROM public.workshop_build_likes WHERE build_id = %L AND user_id = %L', v_wb_b, v_c));
  EXECUTE 'RESET ROLE';
  EXECUTE 'DROP POLICY wbl_test_cascade_delete ON public.workshop_build_likes';
  EXECUTE 'DROP POLICY wbl_test_cascade_select ON public.workshop_build_likes';
  SELECT likes INTO v_cnt2 FROM public.workshop_builds WHERE id = v_wb_b;
  SELECT count(*) INTO v_cnt3 FROM public.workshop_build_likes WHERE build_id = v_wb_b AND user_id = v_c;
  INSERT INTO t_res VALUES (14, 'T14 — rôle sans droit sur workshop_builds : UPDATE direct refusé, son DELETE décompte quand même',
    format('42501 / ok, %s → %s, 0 ligne', v_cnt, v_cnt - 1),
    format('%s / %s, %s → %s, %s ligne', v_r, v_r2, v_cnt, v_cnt2, v_cnt3),
    v_r = '42501' AND v_r2 = 'ok' AND v_cnt2 = v_cnt - 1 AND v_cnt3 = 0);

  -- T15 — vraie cascade : suppression du compte C (a liké D et X)
  SELECT likes INTO v_cnt FROM public.workshop_builds WHERE id = v_wb_d;
  v_r := pg_temp.try_sql(format('DELETE FROM auth.users WHERE id = %L', v_c));
  SELECT likes INTO v_cnt2 FROM public.workshop_builds WHERE id = v_wb_d;
  SELECT count(*) INTO v_cnt3 FROM public.workshop_build_likes WHERE user_id = v_c;
  SELECT count(*) INTO v_cnt4 FROM auth.users WHERE id = v_c;
  INSERT INTO t_res VALUES (15, 'T15 — suppression du compte C : ses likes partent, les compteurs suivent',
    format('ok, %s → %s, 0 like, compte supprimé', v_cnt, v_cnt - 1),
    format('%s, %s → %s, %s like, %s compte', v_r, v_cnt, v_cnt2, v_cnt3, v_cnt4),
    v_r = 'ok' AND v_cnt2 = v_cnt - 1 AND v_cnt3 = 0 AND v_cnt4 = 0);

  -- T16 — suppression de D, AUTEUR d'un build liké par A
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT liked INTO v_liked FROM public.toggle_build_like(v_wb_d);   -- A like le build de D
  EXECUTE 'RESET ROLE';
  SELECT likes INTO v_cnt FROM public.workshop_builds WHERE id = v_wb_d;
  v_r := pg_temp.try_sql(format('DELETE FROM auth.users WHERE id = %L', v_d));
  SELECT count(*), max(likes) INTO v_cnt2, v_cnt3
    FROM public.workshop_builds WHERE id = v_wb_d AND creator_id IS NULL;
  -- Le build orphelin reste likable : A peut retirer puis remettre son like.
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT liked INTO v_liked2 FROM public.toggle_build_like(v_wb_d);
  SELECT liked, like_count INTO v_liked2, v_cnt4 FROM public.toggle_build_like(v_wb_d);
  EXECUTE 'RESET ROLE';
  INSERT INTO t_res VALUES (16, 'T16 — suppression de l''AUTEUR D : creator_id NULL, likes intacts, build toujours likable',
    format('ok, 1 build orphelin à %s, re-like → %s', v_cnt, v_cnt),
    format('%s, %s build orphelin à %s, re-like → %s', v_r, v_cnt2, v_cnt3, v_cnt4),
    v_liked AND v_r = 'ok' AND v_cnt2 = 1 AND v_cnt3 = v_cnt AND v_liked2 AND v_cnt4 = v_cnt);

  -- T17 — suppression d'un build qui a des likes (cascade côté build)
  v_r := pg_temp.try_sql(format('DELETE FROM public.workshop_builds WHERE id = %L', v_wb_x));
  SELECT count(*) INTO v_cnt FROM public.workshop_build_likes WHERE build_id = v_wb_x;
  INSERT INTO t_res VALUES (17, 'T17 — suppression d''un build liké : ok, ses likes partent',
    'ok, 0', format('%s, %s', v_r, v_cnt), v_r = 'ok' AND v_cnt = 0);
END
$t$;

-- T18 — privilèges réels sur la table
INSERT INTO t_res
SELECT 18, 'T18 — anon : aucun privilège · authenticated : SELECT seul',
       'anon 0/7 · auth 1/7 (SELECT)',
       format('anon %s/7 · auth %s/7 (%s)',
         (SELECT count(*) FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p
           WHERE has_table_privilege('anon', 'public.workshop_build_likes', p)),
         (SELECT count(*) FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p
           WHERE has_table_privilege('authenticated', 'public.workshop_build_likes', p)),
         (SELECT string_agg(p, ',') FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p
           WHERE has_table_privilege('authenticated', 'public.workshop_build_likes', p))),
       (SELECT count(*) FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p
         WHERE has_table_privilege('anon', 'public.workshop_build_likes', p)) = 0
   AND (SELECT string_agg(p, ',') FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p
         WHERE has_table_privilege('authenticated', 'public.workshop_build_likes', p)) = 'SELECT';

-- T19 — fonctions : qui peut exécuter quoi
INSERT INTO t_res
SELECT 19, 'T19 — EXECUTE : toggle auth seul · increment_likes personne · increment_saves inchangé',
       'toggle f/t · likes f/f · saves t/t',
       format('toggle %s/%s · likes %s/%s · saves %s/%s',
         has_function_privilege('anon', 'public.toggle_build_like(uuid)', 'EXECUTE'),
         has_function_privilege('authenticated', 'public.toggle_build_like(uuid)', 'EXECUTE'),
         has_function_privilege('anon', 'public.increment_likes(uuid)', 'EXECUTE'),
         has_function_privilege('authenticated', 'public.increment_likes(uuid)', 'EXECUTE'),
         has_function_privilege('anon', 'public.increment_saves(uuid)', 'EXECUTE'),
         has_function_privilege('authenticated', 'public.increment_saves(uuid)', 'EXECUTE')),
       NOT has_function_privilege('anon', 'public.toggle_build_like(uuid)', 'EXECUTE')
   AND has_function_privilege('authenticated', 'public.toggle_build_like(uuid)', 'EXECUTE')
   AND NOT has_function_privilege('anon', 'public.increment_likes(uuid)', 'EXECUTE')
   AND NOT has_function_privilege('authenticated', 'public.increment_likes(uuid)', 'EXECUTE')
   AND has_function_privilege('anon', 'public.increment_saves(uuid)', 'EXECUTE')
   AND has_function_privilege('authenticated', 'public.increment_saves(uuid)', 'EXECUTE');

-- T20 — une seule policy, SELECT, TO authenticated, et les deux triggers en place
INSERT INTO t_res
SELECT 20, 'T20 — 1 policy SELECT TO authenticated · triggers wb_protect_counters + wbl_sync_like_count',
       '1 / SELECT / {authenticated} · 2 triggers',
       format('%s / %s / %s · %s triggers', count(*), max(cmd), max(roles::text),
         (SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal
           AND tgname IN ('wb_protect_counters', 'wbl_sync_like_count'))),
       count(*) = 1 AND max(cmd) = 'SELECT' AND max(roles::text) = '{authenticated}'
       AND (SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal
             AND tgname IN ('wb_protect_counters', 'wbl_sync_like_count')) = 2
  FROM pg_policies WHERE schemaname = 'public' AND tablename = 'workshop_build_likes';

SELECT ordre, CASE WHEN ok THEN '✅' ELSE '❌' END AS r, test, attendu, obtenu
  FROM t_res ORDER BY ordre;

-- Rien ne persiste : comptes, builds, likes, rôle et policies temporaires.
ROLLBACK;
