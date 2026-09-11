-- Tests SQL — checkout_consent_log et record_checkout_consent (migration
-- 20260911000003, preuve de la demande expresse avant paiement).
--
-- ════════════════════════════════════════════════════════════════════════════
--  COMMENT LANCER
-- ════════════════════════════════════════════════════════════════════════════
--   1. Ouvrir le SQL Editor sur le projet **TEST** (gyjcdswpybrhesarompg).
--      ⚠️ PAS la prod (cuscgmgqakxnfwnsrhhv). Vérifier le nom du projet en haut
--      à gauche : « Wyrm Forge Test ».
--   2. Coller CE FICHIER EN ENTIER dans un onglet vide, puis exécuter.
--   3. Lire la table de résultats : une ligne par test, colonne `r`.
--      Tout doit être ✅. `ROLLBACK` final → rien ne persiste.
--
-- Mêmes conventions que 20260909000003_stripe_subscriptions_test.sql : aucune
-- méta-commande psql, identités résolues par le script, un seul BEGIN … ROLLBACK,
-- tentatives sous rôle restreint mémorisées PUIS écrites dans `t_res` après
-- `RESET ROLE` (`t_res` appartient à postgres, un rôle client ne peut pas y
-- écrire).
--
-- ⚠️ La migration 20260911000003 doit avoir été appliquée sur la base visée —
-- T0 échoue bruyamment sinon.
--
-- ════════════════════════════════════════════════════════════════════════════
--  CE QUI COMPTE LE PLUS
-- ════════════════════════════════════════════════════════════════════════════
--   • T1  — le chemin RÉEL (service_role, celui de la route de checkout) écrit
--           bien la preuve, texte complet et horodatage BASE ;
--   • T4  — une preuve ne se modifie pas, même par service_role ;
--   • T5  — MAIS la suppression d'un compte passe quand même (exception étroite
--           du trigger pour `ON DELETE SET NULL`) et la preuve SURVIT, détachée ;
--   • T7  — ni anon ni authenticated ne peuvent fabriquer une preuve (42501).

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
  v_client  uuid;
  v_other   uuid;
  v_id      uuid;
  v_id2     uuid;
  v_err     text;
  v_err2    text;
  v_err3    text;
  v_cnt     int;
  v_row     public.checkout_consent_log%ROWTYPE;
  v_text    CONSTANT text :=
    'Je demande à accéder à mon abonnement immédiatement, avant la fin du délai de '
    || 'rétractation de 14 jours. Texte de test.';
BEGIN
  -- ══════════════════════════════════════════════════════════════════════
  -- T0 — Présence de la migration, identités
  -- ══════════════════════════════════════════════════════════════════════
  IF to_regclass('public.checkout_consent_log') IS NULL THEN
    RAISE EXCEPTION
      'checkout_consent_log est absente — la migration 20260911000003 n''a pas '
      'été appliquée sur cette base. La jouer avant ces tests.';
  END IF;

  IF to_regprocedure('public.record_checkout_consent(uuid,text,text,text,text,text,text)') IS NULL THEN
    RAISE EXCEPTION
      'record_checkout_consent est absente OU sa signature a changé — '
      'la migration 20260911000003 n''a pas été appliquée sur cette base.';
  END IF;

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

  INSERT INTO t_res VALUES (0, 'T0 — migration présente, deux profils cobayes',
    '2 profils', format('client=%s other=%s', left(v_client::text, 8), left(v_other::text, 8)), true);

  -- ══════════════════════════════════════════════════════════════════════
  -- T1 — NOMINAL, sous service_role (le rôle réel de la route)
  -- ══════════════════════════════════════════════════════════════════════
  -- Sous le superuser du SQL Editor, l'appel passerait même sans le GRANT à
  -- service_role : on endosse le vrai rôle, sinon on validerait une fonction que
  -- la route ne peut pas appeler — et TOUT checkout tomberait en 503.
  PERFORM set_config('request.jwt.claims', '{}', true);
  EXECUTE 'SET LOCAL ROLE service_role';
  BEGIN
    v_id := public.record_checkout_consent(
      v_client, 'forgeron', 'mensuel', 'retractation-2026-09-11', 'fr', v_text, '2026-09-11');
    v_err := 'ok';
  EXCEPTION WHEN OTHERS THEN v_id := NULL; v_err := SQLSTATE || ' ' || SQLERRM;
  END;
  -- Flux ANNUEL, même chemin : il ne doit pas être le parent pauvre du mensuel.
  BEGIN
    v_id2 := public.record_checkout_consent(
      v_client, 'maitre', 'annuel', 'retractation-2026-09-11', 'en', v_text, '2026-09-11');
    v_err2 := 'ok';
  EXCEPTION WHEN OTHERS THEN v_id2 := NULL; v_err2 := SQLSTATE || ' ' || SQLERRM;
  END;
  EXECUTE 'RESET ROLE';

  INSERT INTO t_res VALUES (1, 'T1a — 🔴 service_role écrit une preuve (mensuel) et reçoit son id',
    'ok + uuid', format('%s / %s', v_err, coalesce(v_id::text, '∅')), v_err = 'ok' AND v_id IS NOT NULL);
  INSERT INTO t_res VALUES (2, 'T1b — 🔴 idem pour le flux ANNUEL',
    'ok + uuid', format('%s / %s', v_err2, coalesce(v_id2::text, '∅')), v_err2 = 'ok' AND v_id2 IS NOT NULL);

  SELECT * INTO v_row FROM public.checkout_consent_log WHERE id = v_id;
  INSERT INTO t_res VALUES (3, 'T1c — 🔴 la ligne porte QUI, QUOI (texte complet), POUR QUOI',
    'user + forgeron/mensuel + texte identique + version + CGV',
    format('user=%s %s/%s texte_ok=%s v=%s cgv=%s', left(v_row.user_id::text, 8), v_row.plan,
           v_row.period, v_row.consent_text = v_text, v_row.consent_version, v_row.terms_version),
    v_row.user_id = v_client AND v_row.plan = 'forgeron' AND v_row.period = 'mensuel'
      AND v_row.consent_text = v_text AND v_row.consent_version = 'retractation-2026-09-11'
      AND v_row.locale = 'fr' AND v_row.terms_version = '2026-09-11');

  -- `now()` est figé pour la transaction : l'horodatage de la preuve DOIT lui
  -- être égal. C'est ce qui prouve que la date vient de la base, pas d'un
  -- paramètre (la fonction n'en accepte d'ailleurs aucun).
  INSERT INTO t_res VALUES (4, 'T1d — horodatage posé par la BASE (= now() de la transaction)',
    now()::text, coalesce(v_row.accepted_at::text, '∅'), v_row.accepted_at = now());

  -- ══════════════════════════════════════════════════════════════════════
  -- T2 — Garde-fous de la fonction et CHECK de la table
  -- ══════════════════════════════════════════════════════════════════════
  EXECUTE 'SET LOCAL ROLE service_role';
  BEGIN
    PERFORM public.record_checkout_consent(
      NULL, 'forgeron', 'mensuel', 'retractation-2026-09-11', 'fr', v_text, '2026-09-11');
    v_err := '(aucune erreur — PREUVE SANS UTILISATEUR)';
  EXCEPTION WHEN OTHERS THEN v_err := SQLSTATE || ' ' || SQLERRM;
  END;
  BEGIN
    PERFORM public.record_checkout_consent(
      v_client, 'forgeron', 'hebdo', 'retractation-2026-09-11', 'fr', v_text, '2026-09-11');
    v_err2 := '(aucune erreur — PÉRIODICITÉ INVENTÉE ACCEPTÉE)';
  EXCEPTION WHEN OTHERS THEN v_err2 := SQLSTATE || ' ' || SQLERRM;
  END;
  BEGIN
    PERFORM public.record_checkout_consent(
      v_client, 'forgeron', 'mensuel', 'retractation-2026-09-11', 'fr', 'ok', '2026-09-11');
    v_err3 := '(aucune erreur — TEXTE VIDE DE SENS ACCEPTÉ)';
  EXCEPTION WHEN OTHERS THEN v_err3 := SQLSTATE || ' ' || SQLERRM;
  END;
  EXECUTE 'RESET ROLE';

  INSERT INTO t_res VALUES (5, 'T2a — p_user_id NULL refusé (consent_user_required)',
    'P0001 consent_user_required', v_err, v_err LIKE '%consent_user_required%');
  INSERT INTO t_res VALUES (6, 'T2b — périodicité hors (mensuel, annuel) refusée',
    '23514 check_violation', v_err2, v_err2 LIKE '23514%');
  INSERT INTO t_res VALUES (7, 'T2c — texte de moins de 20 caractères refusé',
    '23514 check_violation', v_err3, v_err3 LIKE '23514%');

  EXECUTE 'SET LOCAL ROLE service_role';
  BEGIN
    PERFORM public.record_checkout_consent(
      gen_random_uuid(), 'forgeron', 'mensuel', 'retractation-2026-09-11', 'fr', v_text, '2026-09-11');
    v_err := '(aucune erreur — PREUVE POUR UN PROFIL INEXISTANT)';
  EXCEPTION WHEN OTHERS THEN v_err := SQLSTATE || ' ' || SQLERRM;
  END;
  EXECUTE 'RESET ROLE';

  -- C'est ce cas qui fait répondre 503 à la route AVANT toute session Stripe.
  INSERT INTO t_res VALUES (8, 'T2d — profil inexistant ⇒ 23503 (la route ne crée alors aucune session)',
    '23503 foreign_key_violation', v_err, v_err LIKE '23503%');

  -- ══════════════════════════════════════════════════════════════════════
  -- T4 — 🔴 IMMUABILITÉ : une preuve ne se réécrit pas, même par service_role
  -- ══════════════════════════════════════════════════════════════════════
  EXECUTE 'SET LOCAL ROLE service_role';
  BEGIN
    EXECUTE format('UPDATE public.checkout_consent_log SET consent_text = %L WHERE id = %L',
                   'J''accepte autre chose, finalement.', v_id);
    v_err := '(aucune erreur — TEXTE DE LA PREUVE RÉÉCRIT)';
  EXCEPTION WHEN OTHERS THEN v_err := SQLSTATE || ' ' || SQLERRM;
  END;
  BEGIN
    EXECUTE format('UPDATE public.checkout_consent_log SET accepted_at = accepted_at - interval ''30 days'' WHERE id = %L', v_id);
    v_err2 := '(aucune erreur — DATE ANTIDATÉE)';
  EXCEPTION WHEN OTHERS THEN v_err2 := SQLSTATE || ' ' || SQLERRM;
  END;
  -- Réattribuer une preuve à un autre compte : aussi grave qu'en réécrire le texte.
  BEGIN
    EXECUTE format('UPDATE public.checkout_consent_log SET user_id = %L WHERE id = %L', v_other, v_id);
    v_err3 := '(aucune erreur — PREUVE RÉATTRIBUÉE)';
  EXCEPTION WHEN OTHERS THEN v_err3 := SQLSTATE || ' ' || SQLERRM;
  END;
  EXECUTE 'RESET ROLE';

  INSERT INTO t_res VALUES (9, 'T4a — 🔴 texte de la preuve non modifiable (même service_role)',
    'checkout_consent_log_immutable', v_err, v_err LIKE '%checkout_consent_log_immutable%');
  INSERT INTO t_res VALUES (10, 'T4b — 🔴 date non modifiable',
    'checkout_consent_log_immutable', v_err2, v_err2 LIKE '%checkout_consent_log_immutable%');
  INSERT INTO t_res VALUES (11, 'T4c — 🔴 preuve non réattribuable à un autre compte',
    'checkout_consent_log_immutable', v_err3, v_err3 LIKE '%checkout_consent_log_immutable%');

  SELECT * INTO v_row FROM public.checkout_consent_log WHERE id = v_id;
  INSERT INTO t_res VALUES (12, 'T4d — la ligne est intacte après les trois refus',
    'texte, date et user d''origine',
    format('texte_ok=%s date_ok=%s user_ok=%s', v_row.consent_text = v_text,
           v_row.accepted_at = now(), v_row.user_id = v_client),
    v_row.consent_text = v_text AND v_row.accepted_at = now() AND v_row.user_id = v_client);

  -- ══════════════════════════════════════════════════════════════════════
  -- T5 — 🔴 LA SUPPRESSION D'UN COMPTE PASSE, ET LA PREUVE SURVIT DÉTACHÉE
  -- ══════════════════════════════════════════════════════════════════════
  -- Sans l'exception étroite du trigger, `ON DELETE SET NULL` (exécuté comme
  -- un UPDATE) serait bloqué et toute demande d'effacement RGPD d'un ancien
  -- abonné deviendrait impossible à traiter.
  --
  -- T5a — l'exception du trigger, isolée : exactement l'UPDATE qu'exécute
  -- Postgres pour `ON DELETE SET NULL`, sur la seconde preuve seulement. Ce
  -- test tient même si T5b échouait pour une raison étrangère (voir plus bas).
  EXECUTE 'SET LOCAL ROLE service_role';
  BEGIN
    EXECUTE format('UPDATE public.checkout_consent_log SET user_id = NULL WHERE id = %L', v_id2);
    v_err := 'ok';
  EXCEPTION WHEN OTHERS THEN v_err := SQLSTATE || ' ' || SQLERRM;
  END;
  EXECUTE 'RESET ROLE';

  INSERT INTO t_res VALUES (13, 'T5a — 🔴 l''anonymisation (user_id → NULL, rien d''autre) est admise',
    'ok', v_err, v_err = 'ok');

  -- T5b — la vraie suppression. Profil uniquement (pas `auth.users`) : c'est la
  -- FK `checkout_consent_log.user_id → profiles(id)` qu'on éprouve. Tout est
  -- annulé au ROLLBACK final. Si ce test échoue sur la contrainte d'une AUTRE
  -- table (message à lire dans « obtenu »), ce n'est pas cette migration qui
  -- bloque : T5a prouve déjà que le trigger laisse passer l'anonymisation.
  BEGIN
    DELETE FROM public.profiles WHERE id = v_client;
    v_err := 'ok';
  EXCEPTION WHEN OTHERS THEN v_err := SQLSTATE || ' ' || SQLERRM;
  END;

  INSERT INTO t_res VALUES (14, 'T5b — 🔴 supprimer le profil d''un ancien abonné reste possible',
    'ok', v_err, v_err = 'ok');

  SELECT count(*) INTO v_cnt FROM public.checkout_consent_log
   WHERE id IN (v_id, v_id2) AND user_id IS NULL AND consent_text = v_text;
  INSERT INTO t_res VALUES (15, 'T5c — 🔴 les deux preuves survivent, détachées (user_id NULL), texte intact',
    '2', v_cnt::text, v_cnt = 2);

  -- ══════════════════════════════════════════════════════════════════════
  -- T6 — Aucun accès client à la table, lecture comprise
  -- ══════════════════════════════════════════════════════════════════════
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_other, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    EXECUTE 'SELECT count(*) FROM public.checkout_consent_log' INTO v_cnt;
    v_err := format('(aucune erreur — authenticated A LU %s ligne(s))', v_cnt);
  EXCEPTION WHEN OTHERS THEN v_err := SQLSTATE || ' ' || SQLERRM;
  END;
  BEGIN
    EXECUTE format(
      'INSERT INTO public.checkout_consent_log (user_id, plan, period, consent_version, locale, consent_text, terms_version) '
      'VALUES (%L, %L, %L, %L, %L, %L, %L)',
      v_other, 'maitre', 'annuel', 'fabriquee', 'fr', v_text, '2026-09-11');
    v_err2 := '(aucune erreur — PREUVE FABRIQUÉE PAR LE CLIENT)';
  EXCEPTION WHEN OTHERS THEN v_err2 := SQLSTATE || ' ' || SQLERRM;
  END;
  EXECUTE 'RESET ROLE';

  PERFORM set_config('request.jwt.claims', '{}', true);
  EXECUTE 'SET LOCAL ROLE anon';
  BEGIN
    EXECUTE 'SELECT count(*) FROM public.checkout_consent_log' INTO v_cnt;
    v_err3 := format('(aucune erreur — anon A LU %s ligne(s))', v_cnt);
  EXCEPTION WHEN OTHERS THEN v_err3 := SQLSTATE || ' ' || SQLERRM;
  END;
  EXECUTE 'RESET ROLE';

  INSERT INTO t_res VALUES (16, 'T6a — 🔴 authenticated ne lit pas la table (privilège, pas filtrage)',
    '42501', v_err, v_err LIKE '42501%');
  INSERT INTO t_res VALUES (17, 'T6b — 🔴 authenticated n''insère pas directement',
    '42501', v_err2, v_err2 LIKE '42501%');
  INSERT INTO t_res VALUES (18, 'T6c — 🔴 anon ne lit pas la table',
    '42501', v_err3, v_err3 LIKE '42501%');

  -- ══════════════════════════════════════════════════════════════════════
  -- T7 — 🔴🔴 SONDE RPC : ni anon ni authenticated ne fabriquent de preuve
  -- ══════════════════════════════════════════════════════════════════════
  -- Arguments VALIDES (profil existant, texte dans les bornes) : si l'appel
  -- échouait sur une erreur métier, le test passerait pour la mauvaise raison
  -- et masquerait un privilège réel — le piège de 20260909000002.
  PERFORM set_config('request.jwt.claims', '{}', true);
  EXECUTE 'SET LOCAL ROLE anon';
  BEGIN
    PERFORM public.record_checkout_consent(
      v_other, 'maitre', 'annuel', 'retractation-2026-09-11', 'fr', v_text, '2026-09-11');
    v_err := '(aucune erreur — anon A FABRIQUÉ UNE PREUVE)';
  EXCEPTION WHEN OTHERS THEN v_err := SQLSTATE || ' ' || SQLERRM;
  END;
  EXECUTE 'RESET ROLE';

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_other, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.record_checkout_consent(
      v_other, 'maitre', 'annuel', 'retractation-2026-09-11', 'fr', v_text, '2026-09-11');
    v_err2 := '(aucune erreur — UN COMPTE CONNECTÉ A FABRIQUÉ SA PREUVE)';
  EXCEPTION WHEN OTHERS THEN v_err2 := SQLSTATE || ' ' || SQLERRM;
  END;
  EXECUTE 'RESET ROLE';

  INSERT INTO t_res VALUES (19, 'T7a — 🔴🔴 anon ne peut PAS exécuter record_checkout_consent',
    '42501', v_err, v_err LIKE '42501%');
  INSERT INTO t_res VALUES (20, 'T7b — 🔴🔴 authenticated non plus',
    '42501', v_err2, v_err2 LIKE '42501%');

  SELECT count(*) INTO v_cnt FROM public.checkout_consent_log WHERE user_id = v_other;
  INSERT INTO t_res VALUES (21, 'T7c — aucune preuve créée pour le témoin pendant les sondes',
    '0', v_cnt::text, v_cnt = 0);
END
$t$;

-- ════════════════════════════════════════════════════════════════════════════
--  T8 — Catalogue : signature unique, SECURITY DEFINER, privilèges
-- ════════════════════════════════════════════════════════════════════════════
INSERT INTO t_res
SELECT 22,
       'T8a — une seule signature de record_checkout_consent, 7 args, SECURITY DEFINER',
       '1 fonction / 7 args / secdef=true',
       coalesce(string_agg(format('%s args secdef=%s', p.pronargs, p.prosecdef), ', '), '(aucune)'),
       count(*) = 1 AND bool_and(p.pronargs = 7 AND p.prosecdef)
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname = 'record_checkout_consent';

WITH fn AS (
  SELECT to_regprocedure('public.record_checkout_consent(uuid,text,text,text,text,text,text)') AS f
)
INSERT INTO t_res
SELECT 23,
       'T8b — 🔴🔴 EXECUTE : service_role oui, anon/authenticated non',
       'service_role=true anon=false authenticated=false',
       format('service_role=%s anon=%s authenticated=%s',
         has_function_privilege('service_role', f, 'EXECUTE'),
         has_function_privilege('anon', f, 'EXECUTE'),
         has_function_privilege('authenticated', f, 'EXECUTE')),
       has_function_privilege('service_role', f, 'EXECUTE')
       AND NOT has_function_privilege('anon', f, 'EXECUTE')
       AND NOT has_function_privilege('authenticated', f, 'EXECUTE')
  FROM fn;

INSERT INTO t_res
SELECT 24,
       'T8c — 🔴 AUCUN privilège de table pour anon/authenticated',
       '(aucun)',
       coalesce(string_agg(grantee || ':' || privilege_type, ', ' ORDER BY grantee, privilege_type), '(aucun)'),
       count(*) = 0
  FROM information_schema.role_table_grants
 WHERE table_schema = 'public'
   AND table_name = 'checkout_consent_log'
   AND grantee IN ('anon', 'authenticated');

INSERT INTO t_res
SELECT 25,
       'T8d — RLS activée, AUCUNE policy',
       'rls=true / 0 policy',
       format('rls=%s / %s policy', c.relrowsecurity,
              (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'checkout_consent_log')),
       c.relrowsecurity
       AND (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'checkout_consent_log') = 0
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relname = 'checkout_consent_log';

INSERT INTO t_res
SELECT 26,
       'T8e — FK user_id → profiles en ON DELETE SET NULL (pas CASCADE)',
       'confdeltype=n (SET NULL)',
       coalesce(string_agg(format('%s confdeltype=%s', conname, confdeltype), ', '), '(aucune FK)'),
       count(*) = 1 AND bool_and(confdeltype = 'n')
  FROM pg_constraint
 WHERE conrelid = 'public.checkout_consent_log'::regclass AND contype = 'f';

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

-- Rien ne persiste — ni les preuves de test, ni la suppression du profil cobaye.
ROLLBACK;
