-- Tests SQL — stripe_subscriptions, stripe_apply_subscription_event et le
-- verrou de `profiles.tier` (migration 20260909000003, abonnements Stripe).
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
-- Mêmes conventions que les tests du kit (20260908000001, 20260909000001) :
-- aucune méta-commande psql, identités résolues par le script, un seul
-- BEGIN … ROLLBACK.
--
-- ⚠️ La migration 20260909000003 doit avoir été appliquée sur la base visée.
-- Au 2026-09-10 elle ne l'est NI sur Test NI en prod : T0 échoue bruyamment,
-- avec le nom de la migration à jouer, plutôt que de laisser les tests suivants
-- mentir.
--
-- ════════════════════════════════════════════════════════════════════════════
--  ⚠️ CE SCRIPT ÉCRIT DANS `profiles` — ET C'EST TOUT L'OBJET DU MODULE
-- ════════════════════════════════════════════════════════════════════════════
-- `stripe_apply_subscription_event` reporte le palier sur `profiles.tier` et
-- `profiles.tier_expires_at` : impossible de tester le chemin nominal sans
-- toucher ces deux colonnes. Le script sauvegarde les valeurs d'origine du
-- cobaye en T0 et les restaure explicitement en T11 — le `ROLLBACK` le ferait
-- de toute façon, on le fait quand même pour que l'état soit correct même si
-- quelqu'un exécute le bloc hors transaction.
--
-- `profiles` est PARTAGÉE avec l'app de bureau WPF : c'est aussi pourquoi ce
-- script ne doit tourner QUE sur le projet de test.
--
-- ════════════════════════════════════════════════════════════════════════════
--  TROIS MÉCANISMES DISTINCTS, À NE PAS CONFONDRE
-- ════════════════════════════════════════════════════════════════════════════
--   • `set_config('request.jwt.claims', …)` décide QUI on est pour `auth.uid()`,
--     donc pour les prédicats de policy et pour `is_admin()` ;
--   • `SET LOCAL ROLE <role>` décide sous quel RÔLE POSTGRES on parle, donc
--     quels PRIVILÈGES de table et de fonction s'appliquent ;
--   • le rôle du SQL Editor est SUPERUSER : sous lui, ni les REVOKE, ni les
--     policies, ni le trigger `trg_protect_privilege_columns` ne s'appliquent.
--     Tout test de refus qui oublie le `SET LOCAL ROLE` passe à tort.
--
-- Ce module ajoute un quatrième acteur : `service_role`. C'est le rôle de la
-- route `/api/stripe/webhook`, et le SEUL à qui l'EXECUTE de la RPC est
-- accordé. Les tests nominaux (T1 à T5) l'endossent explicitement plutôt que de
-- rester en superuser — sinon on validerait une fonction que le vrai webhook ne
-- peut pas appeler.
--
-- ════════════════════════════════════════════════════════════════════════════
--  ⚠️ DEUX MARQUEURS D'ADMIN COEXISTENT — ILS NE SONT PAS INTERCHANGEABLES
-- ════════════════════════════════════════════════════════════════════════════
-- Comme dans les tests du kit, l'identité admin est résolue depuis
-- `admin_users` — JAMAIS `prac_admins` (un admin prac n'est pas super-admin du
-- site, cf. l'en-tête de 20260626000001).
--
-- MAIS : `stripe_apply_subscription_event` ne lit PAS `admin_users`. Sa garde
-- est `profiles.role = 'admin'`. Les deux marqueurs sont censés désigner les
-- mêmes comptes ; s'ils divergent sur cette base, la branche `admin_untouched`
-- ne se déclencherait pas pour le compte retenu et T6 échouerait sans qu'on
-- sache pourquoi. T0b vérifie donc explicitement la concordance, et l'affiche.
--
-- ════════════════════════════════════════════════════════════════════════════
--  LE POINT CRITIQUE : LA SONDE `anon` (T12, T16, T17)
-- ════════════════════════════════════════════════════════════════════════════
-- Leçon de 20260909000002 : sur ce projet Supabase, les ALTER DEFAULT PRIVILEGES
-- accordent EXECUTE **nominativement** à `anon` et `authenticated` sur toute
-- fonction neuve de `public`. Un `REVOKE … FROM PUBLIC` ne retire PAS un grant
-- nominatif : il passe la relecture de code et laisse la fonction appelable au
-- `curl` avec la clé anon. Ici, ce serait l'AUTO-ATTRIBUTION DE PALIER PAYANT.
--
-- D'où deux sondes complémentaires, et non une :
--   • le catalogue (`has_function_privilege`), qui répond sans ambiguïté ;
--   • un APPEL RÉEL sous `SET LOCAL ROLE anon`, claims VIDÉES au préalable, qui
--     doit être refusé par un **42501** et non par une erreur métier plus loin
--     dans la fonction. C'est EXACTEMENT ce qui avait masqué le trou la première
--     fois : `anon` pouvait appeler, mais mourait sur une erreur métier — un
--     refus qui ressemblait à un succès du test alors qu'il prouvait l'inverse.

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
  v_admin      uuid;
  v_client     uuid;
  v_other      uuid;
  v_admin_role text;
  v_tier0      text;        -- palier d'origine du cobaye, restauré en T11
  v_exp0       timestamptz; -- idem pour tier_expires_at
  v_tier_admin text;        -- palier d'origine de l'admin, pour prouver qu'il ne bouge pas
  v_cus        text;        -- identifiant client Stripe synthétique du cobaye
  v_cus2       text;        -- identifiant client Stripe synthétique de l'admin
  v_sub        text;        -- identifiant d'abonnement synthétique
  v_t0         timestamptz; -- horodatage de l'événement de référence
  v_res        jsonb;
  v_err        text;
  -- ⚠️ Deux variables d'erreur SUPPLÉMENTAIRES, et non une seule réutilisée :
  -- `t_res` appartient à `postgres`, donc un `INSERT INTO t_res` fait sous
  -- `SET LOCAL ROLE authenticated` échoue en 42501 (« permission denied for
  -- table t_res ») et avorte tout le script. Les blocs qui enchaînent PLUSIEURS
  -- tentatives sous un même rôle (T8, T11) doivent donc mémoriser leurs trois
  -- verdicts, faire `RESET ROLE`, et seulement ensuite écrire les lignes.
  v_err2       text;
  v_err3       text;
  v_cnt        int;
  v_cnt2       int;
  v_status     text;
  v_tier       text;
  v_cancel     boolean;
  v_exp        timestamptz;
BEGIN
  -- ══════════════════════════════════════════════════════════════════════
  -- T0 — Identités, présence de la migration, remise à zéro des cobayes
  -- ══════════════════════════════════════════════════════════════════════
  -- ⚠️ Vérifier ICI que la migration testée est en place, et pas plus loin.
  -- `to_regclass` / `to_regprocedure` rendent NULL sur un objet absent au lieu
  -- de lever : sans cette garde, l'échec surviendrait au milieu du script,
  -- avorterait la transaction, et le SELECT final ne rendrait AUCUN résultat —
  -- on perdrait même les tests déjà passés.
  IF to_regclass('public.stripe_subscriptions') IS NULL THEN
    RAISE EXCEPTION
      'stripe_subscriptions est absente — la migration 20260909000003 n''a pas '
      'été appliquée sur cette base. La jouer avant ces tests.';
  END IF;

  IF to_regprocedure('public.stripe_apply_subscription_event(uuid,text,text,text,text,text,timestamptz,boolean,text,timestamptz,timestamptz)') IS NULL THEN
    RAISE EXCEPTION
      'stripe_apply_subscription_event est absente OU sa signature a changé — '
      'la migration 20260909000003 n''a pas été appliquée sur cette base.';
  END IF;

  -- ⚠️ `admin_users`, jamais `prac_admins`.
  SELECT user_id INTO v_admin FROM public.admin_users ORDER BY user_id LIMIT 1;
  IF v_admin IS NULL THEN
    RAISE EXCEPTION
      'admin_users est VIDE sur cette base — impossible de tester la branche '
      'admin_untouched. Amorcer la table avant de rejouer (voir 20260626000001).';
  END IF;

  -- Deux profils NON admin, distincts. `NOT EXISTS` sur `admin_users` : c'est la
  -- table qui porte le statut de super-admin du site.
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
    RAISE EXCEPTION
      'Il faut au moins DEUX profils non-admin distincts pour jouer T7/T9/T12.';
  END IF;

  -- Filet supplémentaire : si le compte « admin » retenu se trouvait aussi être
  -- le cobaye, T6 et T9 ne prouveraient rien.
  IF v_admin = v_client OR v_admin = v_other THEN
    RAISE EXCEPTION 'Les identités se recouvrent — jeu de comptes inutilisable.';
  END IF;

  -- Les abonnements déjà présents pour nos trois comptes fausseraient la garde
  -- d'ordre (`last_event_at` hérité d'un vrai événement, potentiellement
  -- postérieur à nos horodatages de test) et la clé primaire. On les retire DANS
  -- LA TRANSACTION plutôt que d'adapter les attentes à un état inconnu.
  DELETE FROM public.stripe_subscriptions WHERE user_id IN (v_client, v_other, v_admin);

  SELECT tier, tier_expires_at INTO v_tier0, v_exp0
    FROM public.profiles WHERE id = v_client;
  SELECT tier INTO v_tier_admin FROM public.profiles WHERE id = v_admin;

  -- Identifiants Stripe SYNTHÉTIQUES. `stripe_customer_id` est UNIQUE au niveau
  -- de la table : un littéral fixe finirait par entrer en collision avec une
  -- vraie ligne, et le script échouerait sur un 23505 sans rapport avec ce
  -- qu'il teste. Un uuid rend la collision impossible.
  v_cus  := 'cus_wftest_' || replace(gen_random_uuid()::text, '-', '');
  v_cus2 := 'cus_wftest_' || replace(gen_random_uuid()::text, '-', '');
  v_sub  := 'sub_wftest_' || replace(gen_random_uuid()::text, '-', '');

  -- Horodatage FIXE et non `now()` : toute la garde d'ordre se raisonne en
  -- écarts autour de ce point, et un point fixe rend les attentes lisibles.
  v_t0   := timestamptz '2026-09-09 12:00:00+00';

  INSERT INTO t_res VALUES (
    0, 'T0 — identités (admin issu de admin_users) + cobayes remis à zéro',
    'admin + 2 non-admins distincts',
    format('admin=%s client=%s other=%s',
           left(v_admin::text,8), left(v_client::text,8), left(v_other::text,8)),
    true);

  -- T0b — Concordance des deux marqueurs d'admin. Si elle est fausse, T6 tombe
  -- pour une raison qui n'a rien à voir avec le module Stripe : on veut le voir
  -- ici, nommément, plutôt que de deviner.
  SELECT role INTO v_admin_role FROM public.profiles WHERE id = v_admin;
  INSERT INTO t_res VALUES (
    1, 'T0b — le compte admin_users porte bien profiles.role = ''admin''',
    'admin', coalesce(v_admin_role, '(profil introuvable)'),
    v_admin_role = 'admin');

  -- ══════════════════════════════════════════════════════════════════════
  -- T1 — NOMINAL : le webhook (service_role) crée l'abonnement et pose le palier
  -- ══════════════════════════════════════════════════════════════════════
  -- ⚠️ `SET LOCAL ROLE service_role` est indispensable : sous le rôle du SQL
  -- Editor (superuser), l'appel réussirait même si le `GRANT EXECUTE TO
  -- service_role` manquait — on validerait une fonction que le vrai webhook ne
  -- peut pas appeler, et Stripe retenterait l'événement à l'infini sur un 42501.
  PERFORM set_config('request.jwt.claims', '{}', true);
  EXECUTE 'SET LOCAL ROLE service_role';
  BEGIN
    v_res := public.stripe_apply_subscription_event(
      v_client, v_cus, v_sub, 'active', 'price_test_forgeron_mensuel',
      'forgeron', v_t0 + interval '30 days', false,
      'forgeron', v_t0 + interval '30 days', v_t0);
    v_err := 'ok';
  EXCEPTION WHEN OTHERS THEN
    v_res := NULL;
    v_err := SQLSTATE || ' ' || SQLERRM;
  END;
  EXECUTE 'RESET ROLE';

  INSERT INTO t_res VALUES (
    2, 'T1a — 🔴 service_role peut appeler la RPC (chemin réel du webhook)',
    'ok', v_err, v_err = 'ok');

  INSERT INTO t_res VALUES (
    3, 'T1b — événement appliqué + palier reporté',
    'applied=true profile_updated=true reason=ok',
    coalesce(v_res::text, '(pas de retour)'),
    v_res ->> 'applied'         = 'true'
      AND v_res ->> 'profile_updated' = 'true'
      AND v_res ->> 'reason'          = 'ok');

  SELECT status, tier INTO v_status, v_tier
    FROM public.stripe_subscriptions WHERE user_id = v_client;
  INSERT INTO t_res VALUES (
    4, 'T1c — la ligne d''abonnement porte le statut et le palier ACHETÉS',
    'active / forgeron',
    format('%s / %s', coalesce(v_status,'∅'), coalesce(v_tier,'∅')),
    v_status = 'active' AND v_tier = 'forgeron');

  SELECT tier, tier_expires_at INTO v_tier, v_exp
    FROM public.profiles WHERE id = v_client;
  INSERT INTO t_res VALUES (
    5, 'T1d — 🔴 profiles.tier et tier_expires_at reçoivent le palier EFFECTIF',
    format('forgeron / %s', (v_t0 + interval '30 days')::text),
    format('%s / %s', coalesce(v_tier,'∅'), coalesce(v_exp::text,'∅')),
    v_tier = 'forgeron' AND v_exp = v_t0 + interval '30 days');

  -- ══════════════════════════════════════════════════════════════════════
  -- T2 — La base APPLIQUE une décision, elle ne la PREND pas
  -- ══════════════════════════════════════════════════════════════════════
  -- La fonction ne traduit PAS un statut Stripe en palier : la politique
  -- (past_due garde son palier, unpaid le perd, …) vit dans `src/lib/stripe/
  -- plans.ts`, module pur et testé. On le prouve en passant un palier ACHETÉ
  -- différent du palier EFFECTIF — cas `unpaid` : l'abonnement reste « maître »,
  -- l'accès retombe à « apprenti ». Si un jour la base se mettait à décider
  -- elle-même, ce test tomberait.
  EXECUTE 'SET LOCAL ROLE service_role';
  BEGIN
    v_res := public.stripe_apply_subscription_event(
      v_client, v_cus, v_sub, 'unpaid', 'price_test_maitre_annuel',
      'maître', v_t0 + interval '30 days', false,
      'apprenti', NULL, v_t0 + interval '1 hour');
    v_err := 'ok';
  EXCEPTION WHEN OTHERS THEN
    v_res := NULL;
    v_err := SQLSTATE || ' ' || SQLERRM;
  END;
  EXECUTE 'RESET ROLE';

  SELECT tier INTO v_tier FROM public.stripe_subscriptions WHERE user_id = v_client;
  SELECT tier, tier_expires_at INTO v_status, v_exp FROM public.profiles WHERE id = v_client;
  INSERT INTO t_res VALUES (
    6, 'T2 — palier ACHETÉ ≠ palier EFFECTIF (la base n''interprète pas Stripe)',
    'abonnement=maître / profil=apprenti / expires=∅',
    format('abonnement=%s / profil=%s / expires=%s',
           coalesce(v_tier,'∅'), coalesce(v_status,'∅'), coalesce(v_exp::text,'∅')),
    v_tier = 'maître' AND v_status = 'apprenti' AND v_exp IS NULL);

  -- ══════════════════════════════════════════════════════════════════════
  -- T3 — 🔴 GARDE D'ORDRE : Stripe ne livre pas ses webhooks dans l'ordre
  -- ══════════════════════════════════════════════════════════════════════
  -- Le cœur de cette migration. Sans `last_event_at`, un `subscription.updated`
  -- (active) livré en retard APRÈS un `deleted` RÉACTIVERAIT l'abonnement d'un
  -- compte résilié — un accès payant rendu à quelqu'un qui a arrêté de payer.
  -- État courant à l'entrée : last_event_at = v_t0 + 1h, profil « apprenti ».

  -- T3a — Événement STRICTEMENT plus ancien : refusé, SANS exception.
  -- Pas d'exception, c'est voulu : un webhook en erreur est retenté en boucle
  -- par Stripe. Un événement périmé doit répondre 200 et ne rien faire.
  EXECUTE 'SET LOCAL ROLE service_role';
  BEGIN
    v_res := public.stripe_apply_subscription_event(
      v_client, v_cus, v_sub, 'active', 'price_test_maitre_annuel',
      'maître', v_t0 + interval '365 days', false,
      'maître', v_t0 + interval '365 days', v_t0 - interval '1 hour');
    v_err := 'ok';
  EXCEPTION WHEN OTHERS THEN
    v_res := NULL;
    v_err := SQLSTATE || ' ' || SQLERRM;
  END;
  EXECUTE 'RESET ROLE';

  INSERT INTO t_res VALUES (
    7, 'T3a — 🔴 événement plus ancien ⇒ stale_event (et AUCUNE exception)',
    'applied=false profile_updated=false reason=stale_event',
    coalesce(v_res::text, v_err),
    v_res ->> 'applied'         = 'false'
      AND v_res ->> 'profile_updated' = 'false'
      AND v_res ->> 'reason'          = 'stale_event');

  -- Preuve que le refus n'est pas cosmétique : la ligne n'a pas bougé.
  SELECT status INTO v_status FROM public.stripe_subscriptions WHERE user_id = v_client;
  INSERT INTO t_res VALUES (
    8, 'T3b — 🔴 l''abonnement est resté sur l''événement le plus récent',
    'unpaid', coalesce(v_status,'∅'), v_status = 'unpaid');

  -- Et surtout : le palier n'a PAS été rendu. C'est le test qui compte.
  SELECT tier INTO v_tier FROM public.profiles WHERE id = v_client;
  INSERT INTO t_res VALUES (
    9, 'T3c — 🔴 un événement périmé ne REND PAS le palier payant',
    'apprenti', coalesce(v_tier,'∅'), v_tier = 'apprenti');

  -- T3d — Horodatage ÉGAL : ACCEPTÉ (`>=`, pas `>`).
  -- `checkout.session.completed` et le premier `customer.subscription.updated`
  -- portent souvent le MÊME `created` à la seconde près. Avec `>`, le second
  -- serait rejeté comme périmé alors qu'il porte l'information la plus complète.
  -- À timestamp égal, le dernier arrivé gagne.
  EXECUTE 'SET LOCAL ROLE service_role';
  BEGIN
    v_res := public.stripe_apply_subscription_event(
      v_client, v_cus, v_sub, 'active', 'price_test_forgeron_mensuel',
      'forgeron', v_t0 + interval '30 days', false,
      'forgeron', v_t0 + interval '30 days', v_t0 + interval '1 hour');
    v_err := 'ok';
  EXCEPTION WHEN OTHERS THEN
    v_res := NULL;
    v_err := SQLSTATE || ' ' || SQLERRM;
  END;
  EXECUTE 'RESET ROLE';

  INSERT INTO t_res VALUES (
    10, 'T3d — 🔴 horodatage ÉGAL accepté (règle `>=`, le dernier arrivé gagne)',
    'applied=true reason=ok', coalesce(v_res::text, v_err),
    v_res ->> 'applied' = 'true' AND v_res ->> 'reason' = 'ok');

  -- T3e — Événement plus récent : appliqué, et la résiliation redescend le palier.
  EXECUTE 'SET LOCAL ROLE service_role';
  BEGIN
    v_res := public.stripe_apply_subscription_event(
      v_client, v_cus, v_sub, 'canceled', 'price_test_forgeron_mensuel',
      'forgeron', v_t0 + interval '30 days', true,
      'apprenti', NULL, v_t0 + interval '2 hours');
    v_err := 'ok';
  EXCEPTION WHEN OTHERS THEN
    v_res := NULL;
    v_err := SQLSTATE || ' ' || SQLERRM;
  END;
  EXECUTE 'RESET ROLE';

  SELECT status, cancel_at_period_end INTO v_status, v_cancel
    FROM public.stripe_subscriptions WHERE user_id = v_client;
  SELECT tier INTO v_tier FROM public.profiles WHERE id = v_client;
  INSERT INTO t_res VALUES (
    11, 'T3e — événement plus récent appliqué (canceled ⇒ apprenti)',
    'canceled / cancel_at_period_end=true / apprenti',
    format('%s / cancel_at_period_end=%s / %s',
           coalesce(v_status,'∅'), coalesce(v_cancel::text,'∅'), coalesce(v_tier,'∅')),
    v_status = 'canceled' AND v_cancel AND v_tier = 'apprenti');

  -- T3f — `p_event_at` NULL ⇒ COALESCE(now()).
  -- `last_event_at` est NOT NULL et pilote la garde d'ordre : un NULL y ferait
  -- échouer l'INSERT, et rendrait la comparaison du DO UPDATE nulle — donc
  -- jamais vraie, donc TOUT événement rejeté en silence. `now()` est postérieur
  -- à v_t0+2h, l'événement doit donc s'appliquer.
  EXECUTE 'SET LOCAL ROLE service_role';
  BEGIN
    v_res := public.stripe_apply_subscription_event(
      v_client, v_cus, v_sub, 'active', 'price_test_forgeron_mensuel',
      'forgeron', now() + interval '30 days', false,
      'forgeron', now() + interval '30 days', NULL);
    v_err := 'ok';
  EXCEPTION WHEN OTHERS THEN
    v_res := NULL;
    v_err := SQLSTATE || ' ' || SQLERRM;
  END;
  EXECUTE 'RESET ROLE';

  INSERT INTO t_res VALUES (
    12, 'T3f — p_event_at NULL ⇒ now() (et non un rejet silencieux de TOUT événement)',
    'applied=true reason=ok', coalesce(v_res::text, v_err),
    v_res ->> 'applied' = 'true' AND v_res ->> 'reason' = 'ok');

  -- ══════════════════════════════════════════════════════════════════════
  -- T4 — Un client Stripe ne peut pas être partagé par deux comptes
  -- ══════════════════════════════════════════════════════════════════════
  -- `stripe_customer_id` est UNIQUE. Sans cette contrainte, un événement
  -- `customer.subscription.*` — qui ne porte PAS de `client_reference_id`, seul
  -- le checkout en a un — serait ambigu : deux comptes candidats pour un même
  -- client Stripe.
  --
  -- ⚠️ Le conflit porte sur `stripe_customer_id`, PAS sur `user_id` : l'arbitre
  -- de l'`ON CONFLICT` est `(user_id)`, la violation d'unicité n'est donc pas
  -- absorbée et remonte en 23505. C'est le comportement voulu — un webhook en
  -- 500, que Stripe retentera, vaut mieux qu'un abonnement attribué au mauvais
  -- compte.
  EXECUTE 'SET LOCAL ROLE service_role';
  BEGIN
    PERFORM public.stripe_apply_subscription_event(
      v_other, v_cus, NULL, 'active', 'price_test_forgeron_mensuel',
      'forgeron', v_t0 + interval '30 days', false,
      'forgeron', v_t0 + interval '30 days', v_t0);
    v_err := '(aucune erreur — DEUX COMPTES PARTAGENT UN CLIENT STRIPE)';
  EXCEPTION WHEN OTHERS THEN v_err := SQLSTATE || ' ' || SQLERRM;
  END;
  EXECUTE 'RESET ROLE';

  INSERT INTO t_res VALUES (
    13, 'T4 — 🔴 un stripe_customer_id ne peut pas servir deux comptes',
    '23505 unique_violation', v_err, v_err LIKE '23505%');

  -- ══════════════════════════════════════════════════════════════════════
  -- T5 — La branche `no_profile` est INATTEIGNABLE (et c'est très bien)
  -- ══════════════════════════════════════════════════════════════════════
  -- La fonction rend `reason = 'no_profile'` si le profil n'existe pas. Mais
  -- `user_id` porte une FK vers `profiles(id)` : l'INSERT échoue AVANT que la
  -- fonction n'atteigne ce test. La branche est donc du code mort défensif — ce
  -- test le CONSTATE plutôt que de le supposer, pour qu'un futur relâchement de
  -- la FK ne passe pas inaperçu.
  EXECUTE 'SET LOCAL ROLE service_role';
  BEGIN
    PERFORM public.stripe_apply_subscription_event(
      gen_random_uuid(), 'cus_wftest_' || replace(gen_random_uuid()::text, '-', ''),
      NULL, 'active', 'price_test_forgeron_mensuel',
      'forgeron', v_t0, false, 'forgeron', v_t0, v_t0);
    v_err := '(aucune erreur — UN ABONNEMENT SANS PROFIL A ÉTÉ CRÉÉ)';
  EXCEPTION WHEN OTHERS THEN v_err := SQLSTATE || ' ' || SQLERRM;
  END;
  EXECUTE 'RESET ROLE';

  INSERT INTO t_res VALUES (
    14, 'T5 — utilisateur inconnu ⇒ violation de FK (la branche no_profile est morte)',
    '23503 foreign_key_violation', v_err, v_err LIKE '23503%');

  -- ══════════════════════════════════════════════════════════════════════
  -- T6 — 🔴 UN ADMIN N'EST PAS TRAITÉ COMME UN ABONNÉ ORDINAIRE
  -- ══════════════════════════════════════════════════════════════════════
  -- Le palier d'un admin est un marqueur de rôle géré à la main (cf.
  -- `effectiveTier` dans SessionProvider, et l'exclusion des admins dans
  -- SubscriptionReminder / AdminTab). Le redescendre à `apprenti` parce qu'un
  -- abonnement de TEST a expiré lui ferait perdre un accès qui ne vient pas de
  -- Stripe. L'abonnement doit quand même être ENREGISTRÉ — seul le report du
  -- palier est sauté.
  --
  -- L'événement passé ci-dessous est le pire cas : une résiliation qui, sur un
  -- compte ordinaire, écraserait `tier` en 'apprenti'.
  EXECUTE 'SET LOCAL ROLE service_role';
  BEGIN
    v_res := public.stripe_apply_subscription_event(
      v_admin, v_cus2, NULL, 'canceled', 'price_test_forgeron_mensuel',
      'forgeron', v_t0, false,
      'apprenti', NULL, v_t0);
    v_err := 'ok';
  EXCEPTION WHEN OTHERS THEN
    v_res := NULL;
    v_err := SQLSTATE || ' ' || SQLERRM;
  END;
  EXECUTE 'RESET ROLE';

  INSERT INTO t_res VALUES (
    15, 'T6a — 🔴 compte admin ⇒ admin_untouched (abonnement écrit, palier NON)',
    'applied=true profile_updated=false reason=admin_untouched',
    coalesce(v_res::text, v_err),
    v_res ->> 'applied'         = 'true'
      AND v_res ->> 'profile_updated' = 'false'
      AND v_res ->> 'reason'          = 'admin_untouched');

  SELECT tier INTO v_tier FROM public.profiles WHERE id = v_admin;
  INSERT INTO t_res VALUES (
    16, 'T6b — 🔴 le palier de l''admin n''a PAS bougé',
    coalesce(v_tier_admin, '∅'), coalesce(v_tier, '∅'),
    v_tier IS NOT DISTINCT FROM v_tier_admin);

  -- Contraste : l'abonnement, lui, EST enregistré. C'est la moitié de la
  -- fonction qui doit continuer de s'exécuter pour un admin — sinon on perdrait
  -- la trace d'un vrai paiement.
  SELECT count(*) INTO v_cnt
    FROM public.stripe_subscriptions WHERE user_id = v_admin;
  INSERT INTO t_res VALUES (
    17, 'T6c — l''abonnement de l''admin est quand même enregistré',
    '1', v_cnt::text, v_cnt = 1);

  -- ══════════════════════════════════════════════════════════════════════
  -- T7 — 🔴 RLS : chacun voit SON abonnement, et rien d'autre
  -- ══════════════════════════════════════════════════════════════════════
  -- Test CROISÉ, sur le modèle de T7 du lot 1 kit : compter les lignes vues par
  -- le propriétaire NE PROUVE RIEN si on ne compte pas aussi celles vues par un
  -- tiers. Sous le rôle du SQL Editor les deux vaudraient 1.
  --
  -- L'enjeu n'est pas théorique : la ligne porte `stripe_customer_id`, la clé
  -- par laquelle le webhook identifie un abonné.
  EXECUTE 'SET LOCAL ROLE authenticated';

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_client, 'role', 'authenticated')::text, true);
  EXECUTE format('SELECT count(*) FROM public.stripe_subscriptions WHERE user_id = %L', v_client)
    INTO v_cnt;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_other, 'role', 'authenticated')::text, true);
  EXECUTE format('SELECT count(*) FROM public.stripe_subscriptions WHERE user_id = %L', v_client)
    INTO v_cnt2;

  EXECUTE 'RESET ROLE';

  INSERT INTO t_res VALUES (
    18, 'T7a — 🔴 propriétaire voit 1 ligne, tiers voit 0',
    '1 / 0', format('%s / %s', v_cnt, v_cnt2),
    v_cnt = 1 AND v_cnt2 = 0);

  -- Pas d'exception admin sur cette table : décision ASSUMÉE de la migration
  -- (l'AdminTab lit `profiles.tier`, pas les identifiants Stripe). Si un écran
  -- en a besoin un jour, la policy sera rouverte EXPLICITEMENT — et ce test
  -- tombera, ce qui est exactement le rappel voulu.
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  EXECUTE format('SELECT count(*) FROM public.stripe_subscriptions WHERE user_id = %L', v_client)
    INTO v_cnt;
  EXECUTE 'RESET ROLE';

  INSERT INTO t_res VALUES (
    19, 'T7b — même un ADMIN ne lit pas l''abonnement d''autrui (aucune exception)',
    '0', v_cnt::text, v_cnt = 0);

  -- ══════════════════════════════════════════════════════════════════════
  -- T8 — 🔴 Aucune écriture directe sur la table, pour personne
  -- ══════════════════════════════════════════════════════════════════════
  -- RLS activée SANS policy d'écriture = deny total. Et le `REVOKE ALL` fait que
  -- le refus tombe encore plus tôt, sur le PRIVILÈGE — la ceinture en plus des
  -- bretelles, exactement ce que 20260901000003 a dû réparer après coup sur
  -- `scenarios`.
  --
  -- ⚠️ Les TROIS tentatives sont faites d'abord, les trois lignes de résultat
  -- écrites ensuite, APRÈS le `RESET ROLE` : `t_res` appartient à `postgres` et
  -- `authenticated` n'a pas le droit d'y insérer.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_client, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  BEGIN
    EXECUTE format(
      'INSERT INTO public.stripe_subscriptions (user_id, stripe_customer_id) VALUES (%L, %L)',
      v_other, 'cus_pirate');
    v_err := '(aucune erreur — INSERT PASSÉ)';
  EXCEPTION WHEN OTHERS THEN v_err := SQLSTATE || ' ' || SQLERRM;
  END;

  -- Le cas le plus tentant, et le plus grave : s'attribuer le client Stripe d'un
  -- abonné. Le prochain événement `customer.subscription.*` lui offrirait
  -- l'abonnement de quelqu'un d'autre.
  BEGIN
    EXECUTE format(
      'UPDATE public.stripe_subscriptions SET stripe_customer_id = %L WHERE user_id = %L',
      'cus_pirate', v_client);
    v_err2 := '(aucune erreur — UPDATE PASSÉ)';
  EXCEPTION WHEN OTHERS THEN v_err2 := SQLSTATE || ' ' || SQLERRM;
  END;

  BEGIN
    EXECUTE format('DELETE FROM public.stripe_subscriptions WHERE user_id = %L', v_client);
    v_err3 := '(aucune erreur — DELETE PASSÉ)';
  EXCEPTION WHEN OTHERS THEN v_err3 := SQLSTATE || ' ' || SQLERRM;
  END;

  EXECUTE 'RESET ROLE';

  INSERT INTO t_res VALUES (
    20, 'T8a — 🔴 INSERT direct refusé pour authenticated',
    '42501 permission denied', v_err, v_err LIKE '42501%');

  INSERT INTO t_res VALUES (
    21, 'T8b — 🔴 UPDATE direct de son PROPRE abonnement refusé',
    '42501 permission denied', v_err2, v_err2 LIKE '42501%');

  INSERT INTO t_res VALUES (
    22, 'T8c — 🔴 DELETE direct refusé',
    '42501 permission denied', v_err3, v_err3 LIKE '42501%');

  -- Preuve que les trois refus ne sont pas des artefacts : la ligne est intacte.
  SELECT stripe_customer_id INTO v_err
    FROM public.stripe_subscriptions WHERE user_id = v_client;
  INSERT INTO t_res VALUES (
    23, 'T8d — 🔴 la ligne est intacte après les trois refus',
    v_cus, coalesce(v_err, '(ligne disparue)'), v_err = v_cus);

  -- ══════════════════════════════════════════════════════════════════════
  -- T9 — 🔴 `anon` ne lit RIEN de cette table
  -- ══════════════════════════════════════════════════════════════════════
  -- La policy `ss_select_own` est accordée `TO authenticated` uniquement, et le
  -- `REVOKE ALL … FROM anon` retire jusqu'au privilège de SELECT. Le refus doit
  -- donc tomber sur le PRIVILÈGE (42501), pas sur un filtrage RLS silencieux
  -- (0 ligne) : ce sont deux niveaux de défense différents, et on veut savoir
  -- lequel des deux tient réellement.
  PERFORM set_config('request.jwt.claims', '{}', true);
  EXECUTE 'SET LOCAL ROLE anon';
  BEGIN
    EXECUTE 'SELECT count(*) FROM public.stripe_subscriptions' INTO v_cnt;
    v_err := format('(aucune erreur — anon A LU %s ligne(s))', v_cnt);
  EXCEPTION WHEN OTHERS THEN v_err := SQLSTATE || ' ' || SQLERRM;
  END;
  EXECUTE 'RESET ROLE';

  INSERT INTO t_res VALUES (
    24, 'T9 — 🔴 anon ne peut pas lire stripe_subscriptions',
    '42501 permission denied', v_err, v_err LIKE '42501%');

  -- ══════════════════════════════════════════════════════════════════════
  -- T10 — 🔴🔴 SONDE `anon` SUR LA RPC — LE TEST LE PLUS IMPORTANT DU FICHIER
  -- ══════════════════════════════════════════════════════════════════════
  -- Si celui-ci tombe, n'importe quel navigateur muni de la clé anon (publique,
  -- lisible dans le bundle) peut s'attribuer le palier « maître » au `curl`.
  --
  -- ⚠️ VIDER LES CLAIMS EST ESSENTIEL — NE PAS SUPPRIMER CETTE LIGNE.
  -- Le rôle Postgres et l'identité JWT sont deux réglages INDÉPENDANTS :
  -- `SET LOCAL ROLE anon` ne touche pas `request.jwt.claims`. Sans ce
  -- `set_config`, les claims de T8 (v_client, authenticated) survivraient au
  -- changement de rôle. `'{}'` et non `''` : `auth.uid()` caste le réglage en
  -- jsonb, et `''::jsonb` lève une erreur de syntaxe au lieu de rendre NULL.
  --
  -- ⚠️ ET SURTOUT : les arguments ci-dessous sont VALIDES — profil existant,
  -- client Stripe inédit, événement récent. C'est délibéré. Avec des arguments
  -- bancals, l'appel mourrait sur une erreur MÉTIER (une FK, une unicité) et le
  -- test passerait pour la MAUVAISE RAISON, en masquant un privilège bien réel.
  -- C'est EXACTEMENT le piège de 20260909000002. Ici, si la révocation tient, un
  -- seul verdict est possible : 42501, refusé au seuil.
  PERFORM set_config('request.jwt.claims', '{}', true);
  EXECUTE 'SET LOCAL ROLE anon';
  BEGIN
    PERFORM public.stripe_apply_subscription_event(
      v_other, 'cus_wftest_' || replace(gen_random_uuid()::text, '-', ''),
      NULL, 'active', 'price_test_maitre_annuel',
      'maître', now() + interval '365 days', false,
      'maître', now() + interval '365 days', now());
    v_err := '(aucune erreur — anon A PU S''ATTRIBUER UN PALIER PAYANT)';
  EXCEPTION WHEN OTHERS THEN v_err := SQLSTATE || ' ' || SQLERRM;
  END;
  EXECUTE 'RESET ROLE';

  INSERT INTO t_res VALUES (
    25, 'T10a — 🔴🔴 anon ne peut PAS exécuter stripe_apply_subscription_event',
    '42501 permission denied', v_err, v_err LIKE '42501%');

  -- Même sonde sous `authenticated` : un compte réel connecté est le cas le plus
  -- favorable à une faille, puisqu'il a déjà un JWT valide. Ici les claims sont
  -- posées EXPRÈS (identité cohérente avec l'argument `p_user_id`), pour que le
  -- seul obstacle possible reste le privilège.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_other, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.stripe_apply_subscription_event(
      v_other, 'cus_wftest_' || replace(gen_random_uuid()::text, '-', ''),
      NULL, 'active', 'price_test_maitre_annuel',
      'maître', now() + interval '365 days', false,
      'maître', now() + interval '365 days', now());
    v_err := '(aucune erreur — UN UTILISATEUR CONNECTÉ S''EST AUTO-ABONNÉ)';
  EXCEPTION WHEN OTHERS THEN v_err := SQLSTATE || ' ' || SQLERRM;
  END;
  EXECUTE 'RESET ROLE';

  INSERT INTO t_res VALUES (
    26, 'T10b — 🔴🔴 authenticated non plus',
    '42501 permission denied', v_err, v_err LIKE '42501%');

  -- Et le témoin n'a hérité d'aucun abonnement au passage : si l'une des deux
  -- sondes avait abouti, cette ligne le dirait même si le SQLSTATE trompait.
  SELECT count(*) INTO v_cnt FROM public.stripe_subscriptions WHERE user_id = v_other;
  INSERT INTO t_res VALUES (
    27, 'T10c — 🔴 aucun abonnement créé pour le témoin pendant les deux sondes',
    '0', v_cnt::text, v_cnt = 0);

  -- ══════════════════════════════════════════════════════════════════════
  -- T11 — 🔴 AUCUN CHEMIN CLIENT N'ÉCRIT profiles.tier / tier_expires_at
  -- ══════════════════════════════════════════════════════════════════════
  -- La RPC est verrouillée (T10). Reste l'AUTRE porte : l'UPDATE direct sur
  -- `profiles` via PostgREST. La policy `profiles_update_self_or_admin` LAISSE
  -- PASSER un utilisateur sur SA propre ligne — c'est le trigger
  -- `trg_protect_privilege_columns` (20260614000001) qui doit l'arrêter sur les
  -- colonnes de privilège, parce qu'une policy WITH CHECK ne voit que NEW,
  -- jamais OLD, et ne peut donc pas interdire un CHANGEMENT de valeur.
  --
  -- Le test exige le message du trigger en plus du 42501 : sans lui, un simple
  -- `REVOKE UPDATE` sur la table rendrait le test vert alors que le trigger
  -- pourrait avoir disparu — deux causes, un même code d'erreur.
  --
  -- Note de portée : ce trigger ne bloque QUE `current_user = 'authenticated'`
  -- ET non-admin. Un admin authentifié peut écrire ces colonnes — bypass
  -- DÉLIBÉRÉ et documenté (gestion manuelle des paliers), hors sujet ici : la
  -- question posée est celle du chemin CLIENT.
  --
  -- ⚠️ Comme en T8 : les trois tentatives d'abord, les trois lignes de résultat
  -- après le `RESET ROLE` — `authenticated` ne peut pas écrire dans `t_res`.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_client, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  BEGIN
    EXECUTE format('UPDATE public.profiles SET tier = %L WHERE id = %L', 'maître', v_client);
    v_err := '(aucune erreur — AUTO-ÉLÉVATION DE PALIER)';
  EXCEPTION WHEN OTHERS THEN v_err := SQLSTATE || ' ' || SQLERRM;
  END;

  -- La date d'expiration est la seconde moitié du privilège : la repousser sans
  -- toucher au palier prolongerait un abonnement gratuitement.
  BEGIN
    EXECUTE format('UPDATE public.profiles SET tier_expires_at = %L WHERE id = %L',
                   (now() + interval '10 years')::text, v_client);
    v_err2 := '(aucune erreur — PROLONGATION GRATUITE)';
  EXCEPTION WHEN OTHERS THEN v_err2 := SQLSTATE || ' ' || SQLERRM;
  END;

  -- Les deux d'un coup, au cas où le trigger ne testerait qu'une colonne à la
  -- fois : c'est la forme qu'aurait l'attaque réelle, en un seul PATCH.
  BEGIN
    EXECUTE format(
      'UPDATE public.profiles SET tier = %L, tier_expires_at = %L WHERE id = %L',
      'maître', (now() + interval '10 years')::text, v_client);
    v_err3 := '(aucune erreur — AUTO-ABONNEMENT COMPLET)';
  EXCEPTION WHEN OTHERS THEN v_err3 := SQLSTATE || ' ' || SQLERRM;
  END;

  EXECUTE 'RESET ROLE';

  INSERT INTO t_res VALUES (
    28, 'T11a — 🔴 UPDATE direct de profiles.tier refusé (par le TRIGGER)',
    '42501 + « privilege columns »', v_err,
    v_err LIKE '42501%' AND v_err LIKE '%privilege columns%');

  INSERT INTO t_res VALUES (
    29, 'T11b — 🔴 UPDATE direct de tier_expires_at refusé',
    '42501 + « privilege columns »', v_err2,
    v_err2 LIKE '42501%' AND v_err2 LIKE '%privilege columns%');

  INSERT INTO t_res VALUES (
    30, 'T11c — 🔴 les deux colonnes ensemble : refusé aussi',
    '42501 + « privilege columns »', v_err3,
    v_err3 LIKE '42501%' AND v_err3 LIKE '%privilege columns%');

  -- Preuve que les trois refus ont tenu : le profil porte encore ce que la RPC y
  -- a mis en T3f, et rien de ce que le client a tenté d'y écrire.
  SELECT tier, tier_expires_at INTO v_tier, v_exp FROM public.profiles WHERE id = v_client;
  INSERT INTO t_res VALUES (
    31, 'T11d — 🔴 le palier est resté celui posé par la RPC',
    'forgeron / expiration à ~30 jours',
    format('%s / %s', coalesce(v_tier,'∅'), coalesce(v_exp::text,'∅')),
    v_tier = 'forgeron' AND v_exp < now() + interval '1 year');

  -- ══════════════════════════════════════════════════════════════════════
  -- T12 — Restauration explicite du profil cobaye
  -- ══════════════════════════════════════════════════════════════════════
  -- Le ROLLBACK s'en charge de toute façon ; on le fait quand même pour que
  -- l'état soit correct même si quelqu'un exécute ce bloc hors transaction.
  -- `profiles` est PARTAGÉE avec l'app WPF : un palier laissé de travers s'y
  -- verrait immédiatement, et donnerait ou retirerait un accès payant.
  UPDATE public.profiles
     SET tier = v_tier0, tier_expires_at = v_exp0
   WHERE id = v_client;

  SELECT tier, tier_expires_at INTO v_tier, v_exp FROM public.profiles WHERE id = v_client;
  INSERT INTO t_res VALUES (
    32, 'T12 — palier du cobaye restauré à sa valeur d''origine',
    format('%s / %s', coalesce(v_tier0,'∅'), coalesce(v_exp0::text,'∅')),
    format('%s / %s', coalesce(v_tier,'∅'), coalesce(v_exp::text,'∅')),
    v_tier IS NOT DISTINCT FROM v_tier0 AND v_exp IS NOT DISTINCT FROM v_exp0);
END
$t$;

-- ════════════════════════════════════════════════════════════════════════════
--  T13 — UNE SEULE SIGNATURE, ET ELLE EST SECURITY DEFINER
-- ════════════════════════════════════════════════════════════════════════════
-- Même piège que `kit_set_details` au lot 2 : `CREATE OR REPLACE` ne remplace
-- une fonction que si la LISTE DES TYPES D'ARGUMENTS est identique au caractère
-- près. Ajouter, retirer ou retyper un paramètre crée une SURCHARGE, et les deux
-- coexistent. Le webhook appelle la RPC par ARGUMENTS NOMMÉS via PostgREST : avec
-- deux surcharges, la résolution devient ambiguë (42725) — en production, sur le
-- seul chemin qui encaisse l'argent. Cette migration n'a AUCUN `DROP FUNCTION` :
-- rien ne la protège d'une surcharge à la prochaine évolution, sinon ce test.
--
-- `prosecdef` est vérifié dans la même ligne : une fonction qui perdrait son
-- SECURITY DEFINER s'exécuterait avec les droits de l'appelant, ne pourrait plus
-- écrire `profiles.tier` (le trigger et la RLS s'appliqueraient), et tous les
-- webhooks tomberaient.
INSERT INTO t_res
SELECT 33,
       'T13 — 🔴 une seule signature de stripe_apply_subscription_event, 11 args, SECURITY DEFINER',
       '1 fonction / 11 args / secdef=true',
       coalesce(string_agg(format('%s args secdef=%s', p.pronargs, p.prosecdef),
                           ', ' ORDER BY p.pronargs), '(aucune)'),
       count(*) = 1 AND bool_and(p.pronargs = 11 AND p.prosecdef)
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname = 'stripe_apply_subscription_event';

-- ════════════════════════════════════════════════════════════════════════════
--  T14 — PRIVILÈGES D'EXÉCUTION, LUS DANS LE CATALOGUE
-- ════════════════════════════════════════════════════════════════════════════
-- Le pendant statique de T10 : l'appel réel prouve le COMPORTEMENT, le catalogue
-- prouve l'INTENTION. Les deux, parce qu'un `REVOKE … FROM PUBLIC` seul laisse le
-- catalogue accordant sur ce projet (grants NOMINATIFS des DEFAULT PRIVILEGES).
--
-- ⚠️ `to_regprocedure` plutôt que la signature en texte : passer le NOM d'une
-- fonction absente fait LEVER `has_function_privilege`, ce qui avorterait la
-- transaction et emporterait toute la table de résultats. `to_regprocedure` rend
-- NULL, et `has_function_privilege(role, NULL, …)` rend NULL — la ligne s'affiche
-- alors en échec, ce qui est le comportement voulu.
WITH fn AS (
  SELECT to_regprocedure(
    'public.stripe_apply_subscription_event(uuid,text,text,text,text,text,timestamptz,boolean,text,timestamptz,timestamptz)'
  ) AS f
)
INSERT INTO t_res
SELECT 34,
       'T14a — 🔴🔴 ni anon ni authenticated n''ont EXECUTE',
       'false / false',
       format('anon=%s authenticated=%s',
         has_function_privilege('anon', f, 'EXECUTE'),
         has_function_privilege('authenticated', f, 'EXECUTE')),
       NOT has_function_privilege('anon', f, 'EXECUTE')
       AND NOT has_function_privilege('authenticated', f, 'EXECUTE')
  FROM fn;

-- Contrôle INVERSE, tout aussi nécessaire : sans ce GRANT, le webhook tombe en
-- 42501 et Stripe retente indéfiniment un événement qui ne peut pas aboutir.
-- Une sur-révocation casse le paiement aussi sûrement qu'une sous-révocation
-- l'ouvre.
WITH fn AS (
  SELECT to_regprocedure(
    'public.stripe_apply_subscription_event(uuid,text,text,text,text,text,timestamptz,boolean,text,timestamptz,timestamptz)'
  ) AS f
)
INSERT INTO t_res
SELECT 35,
       'T14b — service_role a bien EXECUTE (sinon le webhook boucle en 42501)',
       'true',
       format('service_role=%s', has_function_privilege('service_role', f, 'EXECUTE')),
       has_function_privilege('service_role', f, 'EXECUTE')
  FROM fn;

-- ════════════════════════════════════════════════════════════════════════════
--  T15 — BALAYAGE : AUCUNE fonction SECURITY DEFINER du module n'est exposée
-- ════════════════════════════════════════════════════════════════════════════
-- T14 nomme UNE fonction. Ce test-ci ne nomme rien : il balaie toutes les
-- `stripe%` SECURITY DEFINER de `public` et liste celles qu'`anon` ou
-- `authenticated` peuvent appeler. Attendu : la liste est vide.
--
-- C'est le test qui survivra à la prochaine migration. Le jour où quelqu'un
-- ajoute `stripe_cancel_subscription` sans penser aux DEFAULT PRIVILEGES, T14
-- passera toujours — celui-ci tombera.
INSERT INTO t_res
SELECT 36,
       'T15a — 🔴🔴 aucune fonction SECURITY DEFINER « stripe% » ouverte à anon/authenticated',
       '(liste vide)',
       coalesce(string_agg(
         format('%s[anon=%s auth=%s]', p.proname,
                has_function_privilege('anon', p.oid, 'EXECUTE'),
                has_function_privilege('authenticated', p.oid, 'EXECUTE')),
         ', ' ORDER BY p.proname), '(liste vide)'),
       count(*) = 0
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname LIKE 'stripe%'
   AND p.prosecdef
   AND (has_function_privilege('anon', p.oid, 'EXECUTE')
        OR has_function_privilege('authenticated', p.oid, 'EXECUTE'));

-- Garde-fou du balayage : un `LIKE 'stripe%'` qui ne matcherait plus rien (module
-- renommé, préfixe abandonné) rendrait T15a vert POUR RIEN — un test vacant est
-- pire qu'une absence de test, parce qu'il rassure. On exige donc qu'il y ait au
-- moins une fonction à balayer.
INSERT INTO t_res
SELECT 37,
       'T15b — le balayage porte sur au moins une fonction (T15a non vacant)',
       '>= 1',
       count(*)::text,
       count(*) >= 1
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname LIKE 'stripe%' AND p.prosecdef;

-- ════════════════════════════════════════════════════════════════════════════
--  T16 — PRIVILÈGES DE TABLE : uniquement (authenticated, SELECT)
-- ════════════════════════════════════════════════════════════════════════════
-- Attendu : UNE seule ligne. Aucune ligne pour `anon`, aucun INSERT/UPDATE/DELETE
-- pour qui que ce soit. C'est le `REVOKE ALL … FROM anon, authenticated` de la
-- migration qui rend ce test vrai — sans lui, les DEFAULT PRIVILEGES de Supabase
-- accordent ALL sur toute table neuve, et le refus d'écriture ne tiendrait plus
-- qu'à l'absence de policy.
INSERT INTO t_res
SELECT 38,
       'T16 — 🔴 privilèges de table : seulement (authenticated, SELECT)',
       '1 ligne SELECT/authenticated',
       coalesce(string_agg(grantee || ':' || privilege_type, ', '
                           ORDER BY grantee, privilege_type), '(aucun)'),
       count(*) = 1
         AND bool_and(grantee = 'authenticated' AND privilege_type = 'SELECT')
  FROM information_schema.role_table_grants
 WHERE table_schema = 'public'
   AND table_name = 'stripe_subscriptions'
   AND grantee IN ('anon', 'authenticated');

-- ════════════════════════════════════════════════════════════════════════════
--  T17 — RLS ACTIVÉE, ET UNE SEULE POLICY (SELECT)
-- ════════════════════════════════════════════════════════════════════════════
-- « RLS activée SANS policy d'écriture = deny total » : les DEUX moitiés de cette
-- phrase doivent être vraies. Une policy d'écriture ajoutée par inadvertance
-- passerait inaperçue à la relecture d'un diff — pas ici.
INSERT INTO t_res
SELECT 39,
       'T17a — RLS activée sur stripe_subscriptions',
       'true', c.relrowsecurity::text, c.relrowsecurity
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relname = 'stripe_subscriptions';

INSERT INTO t_res
SELECT 40,
       'T17b — 🔴 une seule policy, en SELECT',
       '1 policy SELECT',
       coalesce(string_agg(format('%s:%s:%s', policyname, cmd, roles::text), ', '
                           ORDER BY policyname), '(aucune)'),
       count(*) = 1 AND bool_and(cmd = 'SELECT')
  FROM pg_policies
 WHERE schemaname = 'public' AND tablename = 'stripe_subscriptions';

-- ════════════════════════════════════════════════════════════════════════════
--  T18 — Le trigger `updated_at` est bien posé
-- ════════════════════════════════════════════════════════════════════════════
-- Vérifié au CATALOGUE et non par une écriture : `now()` est FIGÉ pour toute la
-- durée d'une transaction, donc `updated_at` ne bougerait pas entre deux upserts
-- de ce script même si le trigger fonctionnait parfaitement. Un test « la valeur
-- a changé » serait faux-négatif par construction.
INSERT INTO t_res
SELECT 41,
       'T18 — trigger trg_stripe_subscriptions_updated_at présent',
       '1 trigger',
       coalesce(string_agg(t.tgname, ', ' ORDER BY t.tgname), '(aucun)'),
       count(*) = 1
  FROM pg_trigger t
  JOIN pg_class c     ON c.oid = t.tgrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public'
   AND c.relname = 'stripe_subscriptions'
   AND t.tgname  = 'trg_stripe_subscriptions_updated_at'
   AND NOT t.tgisinternal;

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

-- Rien ne persiste — y compris les abonnements de test et les paliers touchés.
ROLLBACK;
