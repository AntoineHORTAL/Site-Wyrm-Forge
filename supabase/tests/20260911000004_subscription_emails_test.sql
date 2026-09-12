-- Tests SQL — file d'envoi `subscription_emails` (migration 20260911000004).
--
-- COMMENT LANCER : SQL Editor du projet **TEST** (gyjcdswpybrhesarompg), ce
-- fichier en entier, lire la table de résultats (tout ✅). ROLLBACK final : rien
-- ne persiste — y compris le job pg_cron si la migration est jouée dans la même
-- transaction.
--
-- Conventions de 20260909000003 / 20260911000003 : identités résolues par le
-- script, tentatives sous rôle restreint mémorisées puis écrites après RESET ROLE.
--
-- CE QUI COMPTE LE PLUS
--   T1  — un événement Stripe rejoué ne crée pas de seconde ligne ;
--   T2  — une ligne n'est réclamée qu'une fois (pas de double envoi) ;
--   T3  — une ligne envoyée n'est jamais remise en file ;
--   T5  — une relance n'est due qu'à son échéance ; T6 — une ligne bloquée
--         en `sending` est reprise après 15 min (dette V1 de prac réglée) ;
--   T10 — ni anon ni authenticated n'accèdent à la file ni aux fonctions.

BEGIN;

CREATE TEMP TABLE t_res (ordre int, test text, attendu text, obtenu text, ok boolean) ON COMMIT DROP;

DO $t$
DECLARE
  v_user   uuid;
  v_r      text;
  v_r2     text;
  v_cnt    int;
  v_ids    bigint[];
  v_id     bigint;
  v_status text;
  v_err    text;
  v_err2   text;
  v_err3   text;
  v_ok     boolean;
  v_next   timestamptz;
BEGIN
  IF to_regclass('public.subscription_emails') IS NULL THEN
    RAISE EXCEPTION 'subscription_emails absente — jouer la migration 20260911000004 avant ces tests.';
  END IF;

  SELECT p.id INTO v_user FROM public.profiles p
   WHERE NOT EXISTS (SELECT 1 FROM public.admin_users a WHERE a.user_id = p.id)
   ORDER BY p.created_at, p.id LIMIT 1;
  IF v_user IS NULL THEN RAISE EXCEPTION 'Aucun profil non-admin.'; END IF;

  -- On travaille sur une file vide : les lignes existantes (s'il y en a)
  -- fausseraient les comptages de réclamation. Annulé au ROLLBACK.
  DELETE FROM public.subscription_emails;

  INSERT INTO t_res VALUES (0, 'T0 — migration présente, cobaye résolu', 'ok', left(v_user::text, 8), true);

  -- ══ T1 — dépôt idempotent : un événement rejoué ne crée rien ═════════════
  PERFORM set_config('request.jwt.claims', '{}', true);
  EXECUTE 'SET LOCAL ROLE service_role';
  v_r  := public.enqueue_subscription_email(v_user, 'sub_t', 'order_confirmation', 'order:sub_t',
            '{"tier":"forgeron"}'::jsonb, now() - interval '1 minute');
  v_r2 := public.enqueue_subscription_email(v_user, 'sub_t', 'order_confirmation', 'order:sub_t',
            '{"tier":"MODIFIE"}'::jsonb, now() - interval '1 minute');
  EXECUTE 'RESET ROLE';
  SELECT count(*) INTO v_cnt FROM public.subscription_emails WHERE dedup_key = 'order:sub_t';
  INSERT INTO t_res VALUES (1, 'T1a — 🔴 rejeu du webhook : 1 seule ligne',
    'inserted / unchanged / 1', format('%s / %s / %s', v_r, v_r2, v_cnt), v_r = 'inserted' AND v_r2 = 'unchanged' AND v_cnt = 1);
  SELECT payload->>'tier' INTO v_status FROM public.subscription_emails WHERE dedup_key = 'order:sub_t';
  INSERT INTO t_res VALUES (2, 'T1b — une confirmation déposée n''est jamais modifiée',
    'forgeron', v_status, v_status = 'forgeron');

  -- ══ T2 — claim-then-send : une seule réclamation ═════════════════════════
  EXECUTE 'SET LOCAL ROLE service_role';
  SELECT array_agg(id) INTO v_ids FROM public.claim_subscription_emails(20);
  SELECT count(*) INTO v_cnt FROM public.claim_subscription_emails(20);
  EXECUTE 'RESET ROLE';
  SELECT status INTO v_status FROM public.subscription_emails WHERE dedup_key = 'order:sub_t';
  INSERT INTO t_res VALUES (3, 'T2a — la première passe réclame la ligne (→ sending)',
    '1 ligne / sending', format('%s / %s', coalesce(array_length(v_ids, 1), 0), v_status),
    array_length(v_ids, 1) = 1 AND v_status = 'sending');
  INSERT INTO t_res VALUES (4, 'T2b — 🔴 une seconde passe ne la réclame PAS (pas de double envoi)',
    '0', v_cnt::text, v_cnt = 0);

  -- ══ T3 — clôture « envoyé », puis rejeu : rien ne repart ═════════════════
  v_id := v_ids[1];
  EXECUTE 'SET LOCAL ROLE service_role';
  v_ok := public.finish_subscription_email(v_id, 'sent', 're_123', NULL, 'joueur@example.com');
  v_r  := public.enqueue_subscription_email(v_user, 'sub_t', 'order_confirmation', 'order:sub_t', '{}'::jsonb, now());
  SELECT count(*) INTO v_cnt FROM public.claim_subscription_emails(20);
  EXECUTE 'RESET ROLE';
  SELECT status INTO v_status FROM public.subscription_emails WHERE id = v_id;
  INSERT INTO t_res VALUES (5, 'T3a — clôture « sent » : statut, id Resend, destinataire',
    'true / sent', format('%s / %s', v_ok, v_status), v_ok AND v_status = 'sent'
      AND EXISTS (SELECT 1 FROM public.subscription_emails WHERE id = v_id AND provider_message_id = 're_123' AND recipient = 'joueur@example.com' AND sent_at IS NOT NULL));
  INSERT INTO t_res VALUES (6, 'T3b — 🔴 rejeu APRÈS envoi : unchanged, rien de réclamable',
    'unchanged / 0', format('%s / %s', v_r, v_cnt), v_r = 'unchanged' AND v_cnt = 0);

  -- Clôture d'une ligne qui n'est plus `sending` : sans effet.
  EXECUTE 'SET LOCAL ROLE service_role';
  v_ok := public.finish_subscription_email(v_id, 'failed', NULL, 'tardif', NULL);
  EXECUTE 'RESET ROLE';
  SELECT status INTO v_status FROM public.subscription_emails WHERE id = v_id;
  INSERT INTO t_res VALUES (7, 'T3c — une clôture tardive ne touche pas une ligne déjà close',
    'false / sent', format('%s / %s', v_ok, v_status), NOT v_ok AND v_status = 'sent');

  -- ══ T4 — rappel annuel : programmé, mis à jour tant qu'il n'est pas parti ═
  EXECUTE 'SET LOCAL ROLE service_role';
  v_r := public.enqueue_subscription_email(v_user, 'sub_a', 'renewal_reminder', 'renewal:sub_a:2027-09-11',
           '{"amount_cents":6000}'::jsonb, now() + interval '300 days');
  SELECT count(*) INTO v_cnt FROM public.claim_subscription_emails(20);
  v_r2 := public.enqueue_subscription_email(v_user, 'sub_a', 'renewal_reminder', 'renewal:sub_a:2027-09-11',
           '{"amount_cents":5000}'::jsonb, now() - interval '1 minute');
  EXECUTE 'RESET ROLE';
  INSERT INTO t_res VALUES (8, 'T4a — rappel programmé : rien de réclamable avant sa date',
    'inserted / 0', format('%s / %s', v_r, v_cnt), v_r = 'inserted' AND v_cnt = 0);
  SELECT payload->>'amount_cents' INTO v_status FROM public.subscription_emails WHERE dedup_key = 'renewal:sub_a:2027-09-11';
  INSERT INTO t_res VALUES (9, 'T4b — un rappel non envoyé se met à jour (montant, date) sans doublon',
    'updated / 5000 / 1 ligne', format('%s / %s / %s', v_r2, v_status,
      (SELECT count(*) FROM public.subscription_emails WHERE dedup_key = 'renewal:sub_a:2027-09-11')),
    v_r2 = 'updated' AND v_status = '5000');

  -- ══ T5 — échec d'envoi : relance différée, puis due ══════════════════════
  EXECUTE 'SET LOCAL ROLE service_role';
  SELECT array_agg(id) INTO v_ids FROM public.claim_subscription_emails(20);
  v_ok := public.finish_subscription_email(v_ids[1], 'failed', NULL, 'Resend 503', 'joueur@example.com');
  SELECT count(*) INTO v_cnt FROM public.claim_subscription_emails(20);
  EXECUTE 'RESET ROLE';
  SELECT next_attempt_at, status INTO v_next, v_status FROM public.subscription_emails WHERE id = v_ids[1];
  INSERT INTO t_res VALUES (10, 'T5a — échec : `failed`, relance dans ~15 min, pas réclamable tout de suite',
    'failed / ~15 min / 0', format('%s / %s / %s', v_status, date_trunc('minute', v_next - now()), v_cnt),
    v_status = 'failed' AND v_next BETWEEN now() + interval '14 minutes' AND now() + interval '16 minutes' AND v_cnt = 0);

  UPDATE public.subscription_emails SET next_attempt_at = now() - interval '1 second' WHERE id = v_ids[1];
  EXECUTE 'SET LOCAL ROLE service_role';
  SELECT count(*) INTO v_cnt FROM public.claim_subscription_emails(20);
  EXECUTE 'RESET ROLE';
  SELECT attempts INTO v_cnt FROM public.subscription_emails WHERE id = v_ids[1];
  INSERT INTO t_res VALUES (11, 'T5b — relance due ⇒ réclamée à nouveau (2ᵉ tentative)',
    '2', v_cnt::text, v_cnt = 2);

  -- ══ T6 — ligne bloquée en `sending` (plantage) : reprise après 15 min ════
  UPDATE public.subscription_emails SET claimed_at = now() - interval '10 minutes' WHERE id = v_ids[1];
  EXECUTE 'SET LOCAL ROLE service_role';
  SELECT count(*) INTO v_cnt FROM public.claim_subscription_emails(20);
  EXECUTE 'RESET ROLE';
  UPDATE public.subscription_emails SET claimed_at = now() - interval '16 minutes' WHERE id = v_ids[1];
  EXECUTE 'SET LOCAL ROLE service_role';
  SELECT count(*) INTO v_r FROM public.claim_subscription_emails(20);
  EXECUTE 'RESET ROLE';
  INSERT INTO t_res VALUES (12, 'T6 — 🔴 `sending` récent intouché, bloqué >15 min repris',
    '0 / 1', format('%s / %s', v_cnt, v_r), v_cnt = 0 AND v_r = '1');

  -- ══ T7 — plafond de 8 tentatives ═════════════════════════════════════════
  UPDATE public.subscription_emails SET status = 'failed', attempts = 8, next_attempt_at = now() - interval '1 hour' WHERE id = v_ids[1];
  EXECUTE 'SET LOCAL ROLE service_role';
  SELECT count(*) INTO v_cnt FROM public.claim_subscription_emails(20);
  EXECUTE 'RESET ROLE';
  INSERT INTO t_res VALUES (13, 'T7 — au-delà de 8 tentatives : abandon visible (`failed`), plus de relance',
    '0', v_cnt::text, v_cnt = 0);

  -- ══ T8 — rappel `skipped` (résiliation) réactivé par l'annulation de celle-ci ═
  EXECUTE 'SET LOCAL ROLE service_role';
  v_r := public.enqueue_subscription_email(v_user, 'sub_b', 'renewal_reminder', 'renewal:sub_b:2027-10-01', '{}'::jsonb, now() - interval '1 minute');
  SELECT array_agg(id) INTO v_ids FROM public.claim_subscription_emails(20);
  v_ok := public.finish_subscription_email(v_ids[1], 'skipped', NULL, 'cancellation_scheduled', NULL);
  v_r2 := public.enqueue_subscription_email(v_user, 'sub_b', 'renewal_reminder', 'renewal:sub_b:2027-10-01', '{}'::jsonb, now() - interval '1 minute');
  EXECUTE 'RESET ROLE';
  SELECT status INTO v_status FROM public.subscription_emails WHERE dedup_key = 'renewal:sub_b:2027-10-01';
  INSERT INTO t_res VALUES (14, 'T8 — rappel `skipped` puis nouvel événement du cycle ⇒ de nouveau `pending`',
    'updated / pending', format('%s / %s', v_r2, v_status), v_r2 = 'updated' AND v_status = 'pending');

  -- ══ T9 — garde-fous des fonctions ═════════════════════════════════════════
  EXECUTE 'SET LOCAL ROLE service_role';
  BEGIN
    PERFORM public.enqueue_subscription_email(NULL, 'sub_x', 'order_confirmation', 'order:sub_x', '{}'::jsonb, now());
    v_err := '(aucune erreur)';
  EXCEPTION WHEN OTHERS THEN v_err := SQLSTATE || ' ' || SQLERRM; END;
  BEGIN
    PERFORM public.enqueue_subscription_email(v_user, 'sub_x', 'spam', 'spam:1', '{}'::jsonb, now());
    v_err2 := '(aucune erreur)';
  EXCEPTION WHEN OTHERS THEN v_err2 := SQLSTATE || ' ' || SQLERRM; END;
  BEGIN
    PERFORM public.finish_subscription_email(1, 'envoye', NULL, NULL, NULL);
    v_err3 := '(aucune erreur)';
  EXCEPTION WHEN OTHERS THEN v_err3 := SQLSTATE || ' ' || SQLERRM; END;
  EXECUTE 'RESET ROLE';
  INSERT INTO t_res VALUES (15, 'T9a — dépôt sans utilisateur refusé', 'email_user_required', v_err, v_err LIKE '%email_user_required%');
  INSERT INTO t_res VALUES (16, 'T9b — type d''e-mail inconnu refusé', '23514', v_err2, v_err2 LIKE '23514%');
  INSERT INTO t_res VALUES (17, 'T9c — statut de clôture inconnu refusé', 'invalid_email_status', v_err3, v_err3 LIKE '%invalid_email_status%');

  -- ══ T10 — 🔴🔴 aucun accès client ═════════════════════════════════════════
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN EXECUTE 'SELECT count(*) FROM public.subscription_emails' INTO v_cnt; v_err := format('(lu %s ligne(s))', v_cnt);
  EXCEPTION WHEN OTHERS THEN v_err := SQLSTATE || ' ' || SQLERRM; END;
  BEGIN PERFORM public.enqueue_subscription_email(v_user, 's', 'order_confirmation', 'order:pirate', '{}'::jsonb, now()); v_err2 := '(aucune erreur)';
  EXCEPTION WHEN OTHERS THEN v_err2 := SQLSTATE || ' ' || SQLERRM; END;
  BEGIN PERFORM public.claim_subscription_emails(20); v_err3 := '(aucune erreur)';
  EXCEPTION WHEN OTHERS THEN v_err3 := SQLSTATE || ' ' || SQLERRM; END;
  EXECUTE 'RESET ROLE';
  INSERT INTO t_res VALUES (18, 'T10a — 🔴 authenticated ne lit pas la file', '42501', v_err, v_err LIKE '42501%');
  INSERT INTO t_res VALUES (19, 'T10b — 🔴🔴 authenticated ne dépose pas', '42501', v_err2, v_err2 LIKE '42501%');
  INSERT INTO t_res VALUES (20, 'T10c — 🔴🔴 authenticated ne réclame pas', '42501', v_err3, v_err3 LIKE '42501%');

  PERFORM set_config('request.jwt.claims', '{}', true);
  EXECUTE 'SET LOCAL ROLE anon';
  BEGIN PERFORM public.finish_subscription_email(1, 'sent', NULL, NULL, NULL); v_err := '(aucune erreur)';
  EXCEPTION WHEN OTHERS THEN v_err := SQLSTATE || ' ' || SQLERRM; END;
  BEGIN PERFORM public.trigger_subscription_emails_drain(); v_err2 := '(aucune erreur)';
  EXCEPTION WHEN OTHERS THEN v_err2 := SQLSTATE || ' ' || SQLERRM; END;
  EXECUTE 'RESET ROLE';
  INSERT INTO t_res VALUES (21, 'T10d — 🔴🔴 anon ne clôt pas', '42501', v_err, v_err LIKE '42501%');
  INSERT INTO t_res VALUES (22, 'T10e — 🔴 anon ne déclenche pas l''appel HTTP (lit Vault)', '42501', v_err2, v_err2 LIKE '42501%');

  -- ══ T11 — suppression du compte : les preuves d'envoi survivent ═══════════
  BEGIN
    DELETE FROM public.profiles WHERE id = v_user;
    v_err := 'ok';
  EXCEPTION WHEN OTHERS THEN v_err := SQLSTATE || ' ' || SQLERRM; END;
  SELECT count(*) INTO v_cnt FROM public.subscription_emails WHERE user_id IS NULL;
  INSERT INTO t_res VALUES (23, 'T11 — compte supprimé : lignes conservées, user_id → NULL',
    'ok / ≥ 3', format('%s / %s', v_err, v_cnt), v_err = 'ok' AND v_cnt >= 3);
END
$t$;

-- ══ T12 — catalogue ═════════════════════════════════════════════════════════
INSERT INTO t_res
SELECT 24, 'T12a — EXECUTE : service_role seul sur les trois fonctions', '3 × (t,f,f)',
       string_agg(format('%s(%s,%s,%s)', p.proname,
         has_function_privilege('service_role', p.oid, 'EXECUTE'),
         has_function_privilege('anon', p.oid, 'EXECUTE'),
         has_function_privilege('authenticated', p.oid, 'EXECUTE')), ' '),
       count(*) = 3 AND bool_and(has_function_privilege('service_role', p.oid, 'EXECUTE')
         AND NOT has_function_privilege('anon', p.oid, 'EXECUTE')
         AND NOT has_function_privilege('authenticated', p.oid, 'EXECUTE'))
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname IN ('enqueue_subscription_email', 'claim_subscription_emails', 'finish_subscription_email');

INSERT INTO t_res
SELECT 25, 'T12b — aucun privilège de table client, RLS active, 0 policy', '(aucun) / t / 0',
       format('%s / %s / %s',
         (SELECT count(*) FROM information_schema.role_table_grants WHERE table_schema = 'public' AND table_name = 'subscription_emails' AND grantee IN ('anon','authenticated')),
         (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.subscription_emails'::regclass),
         (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'subscription_emails')),
       (SELECT count(*) FROM information_schema.role_table_grants WHERE table_schema = 'public' AND table_name = 'subscription_emails' AND grantee IN ('anon','authenticated')) = 0
       AND (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.subscription_emails'::regclass)
       AND (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'subscription_emails') = 0;

INSERT INTO t_res
SELECT 26, 'T12c — job pg_cron toutes les 5 minutes', '*/5 * * * *',
       coalesce(max(schedule), '(absent)'), max(schedule) = '*/5 * * * *'
  FROM cron.job WHERE jobname = 'subscription-emails-drain';

SELECT ordre, CASE WHEN ok THEN '✅' ELSE '❌' END AS r, test, attendu, obtenu FROM t_res ORDER BY ordre;

ROLLBACK;
