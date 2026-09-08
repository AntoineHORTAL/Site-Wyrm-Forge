-- Tests SQL — kit_request_order, kit_assert_snapshot et l'extension de
-- kit_set_details au snapshot (lot 2 « Kit sur mesure », migration 20260909000001).
--
-- ════════════════════════════════════════════════════════════════════════════
--  COMMENT LANCER
-- ════════════════════════════════════════════════════════════════════════════
--   1. Ouvrir le SQL Editor sur le projet **TEST** (gyjcdswpybrhesarompg).
--      ⚠️ PAS la prod (cuscgmgqakxnfwnsrhhv). Vérifier le nom du projet en haut
--      à gauche : « Wyrm Forge Test ».
--   2. Coller CE FICHIER EN ENTIER dans un onglet vide, puis exécuter.
--   3. Lire la table de résultats : une ligne par test, colonne `ok`.
--      Tout doit être `true`. `ROLLBACK` final → rien ne persiste.
--
-- Mêmes conventions que le test du lot 1 (20260908000001) : aucune méta-commande
-- psql, identités résolues par le script, un seul BEGIN … ROLLBACK.
--
-- ════════════════════════════════════════════════════════════════════════════
--  ⚠️ CE SCRIPT BASCULE LE FLAG `kit_sur_mesure_enabled` — ET C'EST VOULU
-- ════════════════════════════════════════════════════════════════════════════
-- Le service n'est PAS lancé : `kit_sur_mesure_enabled` vaut `'false'` en base.
-- Tel quel, tous les dépôts échoueraient sur `kit_service_disabled` et on ne
-- prouverait rien du chemin nominal. Le script pose donc lui-même la valeur
-- avant chaque groupe : `'false'` pour le test de coupure, `'true'` pour la
-- suite.
--
-- Le `ROLLBACK` final restaure la valeur d'origine, quelle qu'elle soit. Mais
-- pendant les quelques millisecondes de la transaction, un autre client lisant
-- `app_settings` ne verra rien d'anormal : l'UPDATE n'est pas encore commité, et
-- il n'est jamais commité. C'est aussi pourquoi ce script ne doit tourner QUE
-- sur le projet de test.
--
-- ════════════════════════════════════════════════════════════════════════════
--  DEUX MÉCANISMES DISTINCTS, À NE PAS CONFONDRE (rappel du lot 1)
-- ════════════════════════════════════════════════════════════════════════════
--   • `set_config('request.jwt.claims', …)` décide QUI on est pour `auth.uid()`,
--     donc pour `is_admin()` et pour l'attribution du dossier ;
--   • `SET LOCAL ROLE authenticated` décide sous quel RÔLE POSTGRES on parle,
--     donc quels PRIVILÈGES D'EXÉCUTION s'appliquent.
--
-- La distinction porte un test à elle seule ici (T7) : `kit_request_order` est la
-- PREMIÈRE fonction du module accordée à un non-admin. Si le
-- `GRANT EXECUTE … TO authenticated` manquait, un appel sous le rôle du SQL
-- Editor (superuser) réussirait quand même et masquerait le bug — le vrai
-- client, lui, se prendrait un 42501.

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
  v_other   uuid;
  v_flag0   text;      -- valeur d'origine du flag, pour la restituer en fin de script
  v_id      uuid;
  v_err     text;
  v_cnt     int;
  v_status  text;
  v_snap    jsonb;
  v_by      uuid;
BEGIN
  -- ══════════════════════════════════════════════════════════════════════
  -- T0 — Identités et pré-requis
  -- ══════════════════════════════════════════════════════════════════════
  SELECT user_id INTO v_admin FROM public.admin_users ORDER BY user_id LIMIT 1;
  IF v_admin IS NULL THEN
    RAISE EXCEPTION
      'admin_users est VIDE — impossible de tester is_admin(). Amorcer la table d''abord.';
  END IF;

  -- ⚠️ `admin_users`, jamais `prac_admins` : `is_admin()` ne lit que la première.
  SELECT p.id INTO v_client
    FROM public.profiles p
   WHERE NOT EXISTS (SELECT 1 FROM public.admin_users a WHERE a.user_id = p.id)
   ORDER BY p.created_at, p.id LIMIT 1;

  SELECT p.id INTO v_other
    FROM public.profiles p
   WHERE NOT EXISTS (SELECT 1 FROM public.admin_users a WHERE a.user_id = p.id)
     AND p.id IS DISTINCT FROM v_client
   ORDER BY p.created_at, p.id LIMIT 1;

  IF v_client IS NULL OR v_other IS NULL THEN
    RAISE EXCEPTION 'Il faut au moins DEUX profils non-admin distincts.';
  END IF;

  SELECT value INTO v_flag0
    FROM public.app_settings WHERE key = 'kit_sur_mesure_enabled';
  IF v_flag0 IS NULL THEN
    RAISE EXCEPTION
      'kit_sur_mesure_enabled absent d''app_settings — la migration 20260908000002 '
      'n''a pas été appliquée sur cette base. La jouer avant ces tests.';
  END IF;

  -- ⚠️ Vérifier ICI que la migration testée est bien en place, et pas plus loin.
  -- `to_regprocedure` rend NULL sur une fonction absente au lieu de lever : sans
  -- cette garde, l'échec surviendrait au milieu du script, avorterait la
  -- transaction, et le SELECT final ne rendrait AUCUN résultat — on perdrait
  -- même les tests déjà passés.
  IF to_regprocedure('public.kit_request_order(jsonb)') IS NULL THEN
    RAISE EXCEPTION
      'kit_request_order est absente — la migration 20260909000001 n''a pas été '
      'appliquée sur cette base. La jouer avant ces tests.';
  END IF;

  -- Les dossiers déjà présents pour nos deux cobayes fausseraient
  -- `uq_kit_orders_active`. On les retire DANS LA TRANSACTION (donc annulé au
  -- ROLLBACK) plutôt que d'adapter les attentes à un état inconnu.
  DELETE FROM public.kit_orders WHERE user_id IN (v_client, v_other);

  INSERT INTO t_res VALUES (
    0, 'T0 — identités + flag présent + cobayes remis à zéro',
    'admin + 2 non-admins + flag connu',
    format('admin=%s client=%s other=%s flag=%s',
           left(v_admin::text,8), left(v_client::text,8), left(v_other::text,8), v_flag0),
    true);

  -- ══════════════════════════════════════════════════════════════════════
  -- T1 — 🔴 FLAG COUPÉ : le dépôt est refusé EN BASE, pas seulement dans l'UI
  -- ══════════════════════════════════════════════════════════════════════
  -- Le cœur de cette migration. `useFlag()` ne masque qu'un onglet ; la RPC est
  -- accordée à `authenticated` et donc appelable au `curl`. Si ce test tombe,
  -- le flag n'est qu'un rideau et le service est ouvert avant son lancement.
  UPDATE public.app_settings SET value = 'false' WHERE key = 'kit_sur_mesure_enabled';

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_client, 'role', 'authenticated')::text, true);

  BEGIN
    PERFORM public.kit_request_order('{"v":1}'::jsonb);
    v_err := '(aucune erreur — DÉPÔT PASSÉ)';
  EXCEPTION WHEN OTHERS THEN v_err := SQLERRM;
  END;

  INSERT INTO t_res VALUES (
    1, 'T1 — 🔴 flag coupé ⇒ dépôt refusé',
    'kit_service_disabled', v_err, v_err LIKE '%kit_service_disabled%');

  -- Et rien n'a été créé : le refus n'est pas un artefact d'affichage.
  SELECT count(*) INTO v_cnt FROM public.kit_orders WHERE user_id = v_client;
  INSERT INTO t_res VALUES (
    2, 'T1b — 🔴 aucun dossier créé pendant la coupure',
    '0', v_cnt::text, v_cnt = 0);

  -- ══════════════════════════════════════════════════════════════════════
  -- T2 — auth.uid() NUL ⇒ not_authenticated
  -- ══════════════════════════════════════════════════════════════════════
  -- Flag REMIS À TRUE d'abord : la garde d'authentification passe AVANT celle du
  -- flag dans la fonction, donc avec le flag coupé on obtiendrait
  -- `not_authenticated` de toute façon — et on n'aurait rien prouvé.
  UPDATE public.app_settings SET value = 'true' WHERE key = 'kit_sur_mesure_enabled';

  -- `'{}'` et non `''` : `auth.uid()` caste le réglage en jsonb, et `''::jsonb`
  -- lève une erreur de syntaxe au lieu de rendre NULL. Un objet vide n'a pas de
  -- clé `sub` → `->> 'sub'` vaut NULL → `auth.uid()` vaut NULL.
  PERFORM set_config('request.jwt.claims', '{}', true);

  BEGIN
    PERFORM public.kit_request_order('{"v":1}'::jsonb);
    v_err := '(aucune erreur)';
  EXCEPTION WHEN OTHERS THEN v_err := SQLERRM;
  END;

  INSERT INTO t_res VALUES (
    3, 'T2 — anonyme ⇒ not_authenticated',
    'not_authenticated', v_err, v_err LIKE '%not_authenticated%');

  -- ══════════════════════════════════════════════════════════════════════
  -- T3 — Snapshot mal formé ⇒ invalid_snapshot
  -- ══════════════════════════════════════════════════════════════════════
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_client, 'role', 'authenticated')::text, true);

  BEGIN
    PERFORM public.kit_request_order(NULL);
    v_err := '(aucune erreur)';
  EXCEPTION WHEN OTHERS THEN v_err := SQLERRM;
  END;
  INSERT INTO t_res VALUES (
    4, 'T3a — snapshot NULL refusé',
    'invalid_snapshot', v_err, v_err LIKE '%invalid_snapshot%');

  BEGIN
    -- Un TABLEAU est du jsonb valide mais pas un objet : `jsonb_typeof` le
    -- distingue, et c'est ce que la garde teste.
    PERFORM public.kit_request_order('[]'::jsonb);
    v_err := '(aucune erreur)';
  EXCEPTION WHEN OTHERS THEN v_err := SQLERRM;
  END;
  INSERT INTO t_res VALUES (
    5, 'T3b — tableau JSON refusé (objet attendu)',
    'invalid_snapshot', v_err, v_err LIKE '%invalid_snapshot%');

  BEGIN
    PERFORM public.kit_request_order('"texte"'::jsonb);
    v_err := '(aucune erreur)';
  EXCEPTION WHEN OTHERS THEN v_err := SQLERRM;
  END;
  INSERT INTO t_res VALUES (
    6, 'T3c — scalaire JSON refusé',
    'invalid_snapshot', v_err, v_err LIKE '%invalid_snapshot%');

  -- ══════════════════════════════════════════════════════════════════════
  -- T4 — Snapshot trop gros ⇒ snapshot_too_large
  -- ══════════════════════════════════════════════════════════════════════
  -- La borne est en OCTETS (`octet_length`), pas en nombre de clés : c'est ce
  -- qui coûte réellement en stockage et en transfert. 5000 caractères ASCII
  -- dépassent les 4096 octets sans ambiguïté.
  BEGIN
    PERFORM public.kit_request_order(jsonb_build_object('goals', repeat('a', 5000)));
    v_err := '(aucune erreur)';
  EXCEPTION WHEN OTHERS THEN v_err := SQLERRM;
  END;
  INSERT INTO t_res VALUES (
    7, 'T4 — snapshot > 4096 octets refusé',
    'snapshot_too_large', v_err, v_err LIKE '%snapshot_too_large%');

  -- Contraste : un snapshot réaliste passe très loin sous la borne.
  SELECT octet_length(jsonb_build_object(
      'v', 1, 'formula', 'solo', 'captured_at', now(),
      'riot_rank', 'gold', 'role', 'JUNGLE',
      'goals', 'Monter en Platine avant la fin de saison',
      'availability', 'Soirs de semaine après 20h',
      'champions_liked', 'Lee Sin, Vi, Hecarim',
      'champions_disliked', 'Evelynn',
      'playstyle', 'Agressif early, je force les ganks bot')::text)
    INTO v_cnt;
  INSERT INTO t_res VALUES (
    8, 'T4b — un snapshot réaliste tient largement',
    '< 4096 octets', v_cnt || ' octets', v_cnt < 4096);

  -- ══════════════════════════════════════════════════════════════════════
  -- T5 — DÉPÔT NOMINAL par le client, sous le rôle `authenticated`
  -- ══════════════════════════════════════════════════════════════════════
  -- ⚠️ `SET LOCAL ROLE authenticated` est indispensable ici. Sous le rôle du SQL
  -- Editor (superuser), l'appel réussirait même si le `GRANT EXECUTE` manquait —
  -- on validerait une fonction que le vrai client ne peut pas appeler.
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    v_id := public.kit_request_order(jsonb_build_object(
      'v', 1, 'formula', 'solo', 'riot_rank', 'gold',
      'riot_gamename', 'Fakr',                 -- coquille VOLONTAIRE, corrigée en T8
      'goals', 'Monter en Platine'));
    v_err := 'ok';
  EXCEPTION WHEN OTHERS THEN v_err := SQLSTATE || ' ' || SQLERRM;
  END;
  EXECUTE 'RESET ROLE';

  INSERT INTO t_res VALUES (
    9, 'T5 — 🔴 dépôt client accepté sous le rôle authenticated',
    'ok', v_err, v_err = 'ok');

  SELECT status, created_by INTO v_status, v_by
    FROM public.kit_orders WHERE id = v_id;

  INSERT INTO t_res VALUES (
    10, 'T5b — le dossier naît en « demande »',
    'demande', coalesce(v_status, '(introuvable)'), v_status = 'demande');

  -- `created_by = user_id` est la SIGNATURE d'un dépôt client, par opposition à
  -- un dossier ouvert par l'admin via kit_open_order. C'est ce qui permet de
  -- distinguer les deux sans colonne supplémentaire.
  INSERT INTO t_res VALUES (
    11, 'T5c — created_by = user_id (signature du dépôt client)',
    'égaux', format('created_by=%s user=%s', left(coalesce(v_by::text,'∅'),8), left(v_client::text,8)),
    v_by = v_client);

  SELECT count(*) INTO v_cnt
    FROM public.kit_order_events
   WHERE kit_order_id = v_id AND from_status IS NULL AND to_status = 'demande';
  INSERT INTO t_res VALUES (
    12, 'T5d — l''ouverture est tracée dans le journal',
    '1 événement', v_cnt::text, v_cnt = 1);

  -- ══════════════════════════════════════════════════════════════════════
  -- T6 — SECOND dépôt refusé (dossier déjà actif)
  -- ══════════════════════════════════════════════════════════════════════
  BEGIN
    PERFORM public.kit_request_order('{"v":1}'::jsonb);
    v_err := '(aucune erreur — DEUXIÈME DOSSIER CRÉÉ)';
  EXCEPTION WHEN OTHERS THEN v_err := SQLERRM;
  END;
  INSERT INTO t_res VALUES (
    13, 'T6 — 🔴 second dépôt refusé (uq_kit_orders_active)',
    'kit_order_already_active', v_err, v_err LIKE '%kit_order_already_active%');

  -- L'index est PARTIEL et PAR UTILISATEUR : un autre client dépose sans gêne
  -- pendant que le premier a un dossier ouvert.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_other, 'role', 'authenticated')::text, true);
  BEGIN
    PERFORM public.kit_request_order('{"v":1}'::jsonb);
    v_err := 'ok';
  EXCEPTION WHEN OTHERS THEN v_err := SQLERRM;
  END;
  INSERT INTO t_res VALUES (
    14, 'T6b — un AUTRE client dépose quand même (index par utilisateur)',
    'ok', v_err, v_err = 'ok');

  -- ══════════════════════════════════════════════════════════════════════
  -- T7 — `anon` n'a PAS le droit d'exécuter la fonction
  -- ══════════════════════════════════════════════════════════════════════
  -- Un visiteur non connecté doit être arrêté par le PRIVILÈGE, avant même
  -- d'atteindre `not_authenticated`.
  --
  -- ⚠️ VIDER LES CLAIMS EST ESSENTIEL — NE PAS SUPPRIMER CETTE LIGNE.
  -- Le rôle Postgres et l'identité JWT sont deux réglages INDÉPENDANTS :
  -- `SET LOCAL ROLE anon` ne touche pas `request.jwt.claims`. Sans ce
  -- `set_config`, les claims de T6b (v_other, authenticated) survivent au
  -- changement de rôle et `auth.uid()` reste non nul pendant tout T7.
  --
  -- C'est exactement ce qui a MASQUÉ le trou de privilèges la première fois :
  -- `anon` pouvait bel et bien exécuter la fonction, mais l'appel allait mourir
  -- plus loin sur `kit_order_already_active` — une erreur MÉTIER, donc un refus
  -- qui ressemblait à un succès du test alors qu'il prouvait le contraire.
  -- Claims vidées, il ne reste qu'une issue possible en cas de bon privilège :
  -- 42501. Le test devient discriminant au lieu d'être ambigu.
  PERFORM set_config('request.jwt.claims', '{}', true);
  EXECUTE 'SET LOCAL ROLE anon';
  BEGIN
    PERFORM public.kit_request_order('{"v":1}'::jsonb);
    v_err := '(aucune erreur — anon A PU APPELER)';
  EXCEPTION WHEN OTHERS THEN v_err := SQLSTATE || ' ' || SQLERRM;
  END;
  EXECUTE 'RESET ROLE';

  INSERT INTO t_res VALUES (
    15, 'T7 — 🔴 anon ne peut pas exécuter kit_request_order',
    '42501 permission denied', v_err, v_err LIKE '42501%');

  -- ══════════════════════════════════════════════════════════════════════
  -- T8 — kit_set_details corrige le snapshot (4ᵉ paramètre, ADMIN)
  -- ══════════════════════════════════════════════════════════════════════
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

  -- ⚠️ Enveloppé, comme tous les appels de ce script. Si T5 a échoué, `v_id` est
  -- NULL : `kit_set_details` lèverait alors `kit_order_not_found`, et une
  -- exception NON RATTRAPÉE ici avorterait la transaction entière — on perdrait
  -- la table de résultats avec elle. Aucun appel ne doit rester nu.
  BEGIN
    PERFORM public.kit_set_details(
      v_id, NULL, NULL,
      jsonb_build_object('v', 1, 'formula', 'solo', 'riot_rank', 'gold',
                         'riot_gamename', 'Faker', 'goals', 'Monter en Platine'));
    v_err := 'ok';
  EXCEPTION WHEN OTHERS THEN v_err := SQLERRM;
  END;

  SELECT player_snapshot INTO v_snap FROM public.kit_orders WHERE id = v_id;
  INSERT INTO t_res VALUES (
    16, 'T8 — l''admin corrige la coquille du snapshot',
    'Faker', coalesce(v_snap ->> 'riot_gamename', v_err),
    v_snap ->> 'riot_gamename' = 'Faker');

  -- Sémantique de mise à jour PARTIELLE : `NULL` = « ne change pas ce champ ».
  -- Un prix posé seul ne doit pas effacer le snapshot.
  BEGIN
    PERFORM public.kit_set_details(v_id, 6000);
    v_err := 'ok';
  EXCEPTION WHEN OTHERS THEN v_err := SQLERRM;
  END;

  SELECT player_snapshot INTO v_snap FROM public.kit_orders WHERE id = v_id;
  INSERT INTO t_res VALUES (
    17, 'T8b — p_player_snapshot NULL laisse le snapshot intact',
    'Faker', coalesce(v_snap ->> 'riot_gamename', v_err),
    v_snap ->> 'riot_gamename' = 'Faker');

  -- La correction admin est bornée comme le dépôt client : `kit_assert_snapshot`
  -- est la MÊME fonction pour les deux chemins.
  BEGIN
    PERFORM public.kit_set_details(v_id, NULL, NULL, jsonb_build_object('x', repeat('a', 5000)));
    v_err := '(aucune erreur)';
  EXCEPTION WHEN OTHERS THEN v_err := SQLERRM;
  END;
  INSERT INTO t_res VALUES (
    18, 'T8c — une correction trop grosse est refusée aussi',
    'snapshot_too_large', v_err, v_err LIKE '%snapshot_too_large%');

  -- ══════════════════════════════════════════════════════════════════════
  -- T9 — 🔴 NON-RÉGRESSION : le client n'a gagné AUCUN autre droit
  -- ══════════════════════════════════════════════════════════════════════
  -- Le lot 2 ouvre UN chemin d'écriture, et un seul. Ces trois cas vérifient que
  -- les gardes du lot 1 sont intactes — c'est la vraie question que pose
  -- l'ajout d'une première RPC cliente.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_client, 'role', 'authenticated')::text, true);

  BEGIN
    PERFORM public.kit_set_status(v_id, 'acompte_paye');
    v_err := '(aucune erreur — LE CLIENT A FAIT AVANCER SON DOSSIER)';
  EXCEPTION WHEN OTHERS THEN v_err := SQLERRM;
  END;
  INSERT INTO t_res VALUES (
    19, 'T9a — 🔴 non-admin : kit_set_status toujours refusé',
    'not_admin', v_err, v_err LIKE '%not_admin%');

  BEGIN
    PERFORM public.kit_open_order(v_client, '{}'::jsonb, 'acompte_paye');
    v_err := '(aucune erreur)';
  EXCEPTION WHEN OTHERS THEN v_err := SQLERRM;
  END;
  INSERT INTO t_res VALUES (
    20, 'T9b — 🔴 non-admin : kit_open_order toujours refusé',
    'not_admin', v_err, v_err LIKE '%not_admin%');

  BEGIN
    PERFORM public.kit_set_details(v_id, 9900);
    v_err := '(aucune erreur)';
  EXCEPTION WHEN OTHERS THEN v_err := SQLERRM;
  END;
  INSERT INTO t_res VALUES (
    21, 'T9c — 🔴 non-admin : kit_set_details toujours refusé',
    'not_admin', v_err, v_err LIKE '%not_admin%');

  -- Le dossier n'a pas bougé après les trois refus.
  SELECT status INTO v_status FROM public.kit_orders WHERE id = v_id;
  INSERT INTO t_res VALUES (
    22, 'T9d — 🔴 le dossier est resté en « demande »',
    'demande', v_status, v_status = 'demande');

  -- ══════════════════════════════════════════════════════════════════════
  -- T10 — Le client ne peut toujours pas écrire en direct
  -- ══════════════════════════════════════════════════════════════════════
  -- Aucune policy UPDATE n'a été ajoutée par le lot 2 : le gel du snapshot tient
  -- par l'ABSENCE DE PORTE, pas par une discipline du front.
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    EXECUTE format('UPDATE public.kit_orders SET player_snapshot = %L WHERE id = %L',
                   '{"riot_rank":"challenger"}', v_id);
    v_err := '(aucune erreur — UPDATE PASSÉ)';
  EXCEPTION WHEN OTHERS THEN v_err := SQLSTATE || ' ' || SQLERRM;
  END;
  EXECUTE 'RESET ROLE';

  INSERT INTO t_res VALUES (
    23, 'T10 — 🔴 UPDATE direct du snapshot toujours refusé',
    '42501 permission denied', v_err, v_err LIKE '42501%');

  -- ══════════════════════════════════════════════════════════════════════
  -- T11 — Restauration explicite du flag
  -- ══════════════════════════════════════════════════════════════════════
  -- Le ROLLBACK s'en charge de toute façon ; on le fait quand même pour que
  -- l'état soit correct même si quelqu'un exécute ce bloc hors transaction.
  UPDATE public.app_settings SET value = v_flag0 WHERE key = 'kit_sur_mesure_enabled';
  INSERT INTO t_res VALUES (
    24, 'T11 — flag restauré à sa valeur d''origine',
    v_flag0,
    (SELECT value FROM public.app_settings WHERE key = 'kit_sur_mesure_enabled'),
    (SELECT value FROM public.app_settings WHERE key = 'kit_sur_mesure_enabled') = v_flag0);
END
$t$;

-- ════════════════════════════════════════════════════════════════════════════
--  T12 — L'ANCIENNE SIGNATURE DE kit_set_details A BIEN DISPARU
-- ════════════════════════════════════════════════════════════════════════════
-- C'est le point risqué de la migration. Ajouter un paramètre à DEFAULT ne
-- remplace pas la fonction : Postgres crée une SURCHARGE. Si le
-- `DROP FUNCTION … (uuid, integer, text)` n'avait pas été joué, les deux
-- coexisteraient et tout appel à TROIS arguments — dont ceux du panneau admin
-- livré au lot 1 — deviendrait ambigu (42725), en production.
--
-- Attendu : UNE seule ligne, à 4 arguments.
INSERT INTO t_res
SELECT 25,
       'T12 — 🔴 une seule signature de kit_set_details, à 4 arguments',
       '1 fonction / 4 args',
       coalesce(string_agg(p.pronargs::text, ', ' ORDER BY p.pronargs), '(aucune)'),
       count(*) = 1 AND bool_and(p.pronargs = 4)
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname = 'kit_set_details';

-- ════════════════════════════════════════════════════════════════════════════
--  T13 — PRIVILÈGES D'EXÉCUTION des quatre fonctions du module
-- ════════════════════════════════════════════════════════════════════════════
-- `has_function_privilege` plutôt qu'une jointure de catalogue : c'est la
-- question qu'on pose réellement, écrite telle quelle.
--
-- ⚠️ `to_regprocedure` plutôt que la signature en texte : passer le NOM d'une
-- fonction absente fait LEVER `has_function_privilege`, ce qui avorterait la
-- transaction et emporterait toute la table de résultats. `to_regprocedure` rend
-- NULL, et `has_function_privilege(role, NULL, …)` rend NULL — la ligne
-- s'affiche alors en échec, ce qui est le comportement voulu.
--
-- Attendu : `authenticated` peut appeler les quatre (les gardes internes
-- `is_admin()` font le reste) ; `anon` n'en appelle AUCUNE.
WITH fn AS (
  SELECT to_regprocedure('public.kit_request_order(jsonb)')                    AS req,
         to_regprocedure('public.kit_open_order(uuid,jsonb,text,integer,text)') AS opn,
         to_regprocedure('public.kit_set_status(uuid,text,text)')               AS sts,
         to_regprocedure('public.kit_set_details(uuid,integer,text,jsonb)')     AS det
)
INSERT INTO t_res
SELECT 26,
       'T13a — authenticated peut exécuter les 4 RPC',
       'true × 4',
       format('request=%s open=%s status=%s details=%s',
         has_function_privilege('authenticated', req, 'EXECUTE'),
         has_function_privilege('authenticated', opn, 'EXECUTE'),
         has_function_privilege('authenticated', sts, 'EXECUTE'),
         has_function_privilege('authenticated', det, 'EXECUTE')),
       has_function_privilege('authenticated', req, 'EXECUTE')
       AND has_function_privilege('authenticated', opn, 'EXECUTE')
       AND has_function_privilege('authenticated', sts, 'EXECUTE')
       AND has_function_privilege('authenticated', det, 'EXECUTE')
  FROM fn;

WITH fn AS (
  SELECT to_regprocedure('public.kit_request_order(jsonb)')                    AS req,
         to_regprocedure('public.kit_open_order(uuid,jsonb,text,integer,text)') AS opn,
         to_regprocedure('public.kit_set_status(uuid,text,text)')               AS sts,
         to_regprocedure('public.kit_set_details(uuid,integer,text,jsonb)')     AS det
)
INSERT INTO t_res
SELECT 27,
       'T13b — 🔴 anon n''en exécute AUCUNE',
       'false × 4',
       format('request=%s open=%s status=%s details=%s',
         has_function_privilege('anon', req, 'EXECUTE'),
         has_function_privilege('anon', opn, 'EXECUTE'),
         has_function_privilege('anon', sts, 'EXECUTE'),
         has_function_privilege('anon', det, 'EXECUTE')),
       NOT has_function_privilege('anon', req, 'EXECUTE')
       AND NOT has_function_privilege('anon', opn, 'EXECUTE')
       AND NOT has_function_privilege('anon', sts, 'EXECUTE')
       AND NOT has_function_privilege('anon', det, 'EXECUTE')
  FROM fn;

-- `kit_assert_snapshot` est un helper INTERNE : révoqué de PUBLIC et jamais
-- accordé. Les deux rôles clients doivent donc être incapables de l'appeler —
-- il n'a aucune raison d'être exposé.
WITH fn AS (SELECT to_regprocedure('public.kit_assert_snapshot(jsonb)') AS asr)
INSERT INTO t_res
SELECT 28,
       'T13c — kit_assert_snapshot reste interne',
       'false / false',
       format('authenticated=%s anon=%s',
         has_function_privilege('authenticated', asr, 'EXECUTE'),
         has_function_privilege('anon', asr, 'EXECUTE')),
       NOT has_function_privilege('authenticated', asr, 'EXECUTE')
       AND NOT has_function_privilege('anon', asr, 'EXECUTE')
  FROM fn;

-- ════════════════════════════════════════════════════════════════════════════
--  RÉSULTATS
-- ════════════════════════════════════════════════════════════════════════════
SELECT
  ordre,
  CASE WHEN ok THEN '✅' ELSE '❌' END AS r,
  test,
  attendu,
  obtenu
FROM t_res
ORDER BY ordre;

-- Rien ne persiste — y compris la bascule du flag et la purge des dossiers de test.
ROLLBACK;
