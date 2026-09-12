-- Migration 20260911000004 : file d'envoi des e-mails transactionnels
-- d'abonnement (confirmation de commande L221-13, confirmation de résiliation
-- L215-1-1, rappel avant reconduction annuelle L215-1).
--
-- ════════════════════════════════════════════════════════════════════════════
--  LE PRINCIPE — un e-mail qui échoue ne fait JAMAIS échouer un paiement
-- ════════════════════════════════════════════════════════════════════════════
-- Le webhook Stripe (`/api/stripe/webhook`, site) ne parle pas à Resend : il
-- DÉPOSE une ligne ici (`enqueue_subscription_email`), après avoir enregistré
-- l'abonnement. L'Edge Function `subscription-emails`, déclenchée par pg_cron
-- toutes les 5 minutes (§ 5), RÉCLAME les lignes dues, envoie, puis CLÔT.
-- Deux processus distincts : Resend en panne ⇒ des lignes `failed` relancées
-- plus tard, et un webhook qui a répondu 200 comme d'habitude.
--
-- ════════════════════════════════════════════════════════════════════════════
--  JAMAIS DEUX FOIS LE MÊME E-MAIL
-- ════════════════════════════════════════════════════════════════════════════
--   1. `dedup_key` UNIQUE : un événement Stripe rejoué redépose la même clé ⇒
--      aucune seconde ligne (confirmations : `ON CONFLICT DO NOTHING` de fait).
--   2. claim-then-send (patron de l'ancien `prac_notify_claim`) : une ligne
--      passe `sending` AVANT l'envoi, sous `FOR UPDATE SKIP LOCKED` ; deux
--      exécutions concurrentes ne peuvent pas réclamer la même.
--   3. `Idempotency-Key = dedup_key` chez Resend : une ligne restée `sending`
--      après un plantage est reprise au bout de 15 min SANS doublon si l'envoi
--      avait en fait réussi. (C'était la dette V1 de prac : une ligne bloquée ne
--      repartait jamais — inacceptable pour une obligation légale.)
--
-- Consommateurs : site (webhook, via service_role) et EF `subscription-emails`.
-- L'app WPF n'est pas concernée.
--
-- Dépend de : profiles(id) (baseline), fn_set_updated_at() (20260606000012),
-- pg_cron + pg_net (baseline), Vault (natif Supabase).
-- Idempotent : IF NOT EXISTS, CREATE OR REPLACE, DROP/CREATE TRIGGER,
-- unschedule/schedule du job cron.

-- ════════════════════════════════════════════════════════════════════════════
--  1. TABLE subscription_emails — file ET journal d'envoi
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.subscription_emails (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

  -- ON DELETE SET NULL, comme `checkout_consent_log` : la ligne ENVOYÉE est la
  -- preuve qu'une information légale a été donnée (la charge de la preuve pèse
  -- sur le professionnel). Une ligne EN ATTENTE d'un compte supprimé n'a plus de
  -- destinataire : le worker la clôt en `skipped`.
  user_id                uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  stripe_subscription_id text,

  kind                   text NOT NULL
                         CHECK (kind IN ('order_confirmation', 'cancellation_confirmation', 'renewal_reminder')),

  -- Clé d'idempotence, construite par le site (`src/lib/stripe/subscription-emails.ts`) :
  --   order:<sub>                     une confirmation par abonnement
  --   cancel:<sub>:<event Stripe>     une par demande de résiliation
  --   renewal:<sub>:<échéance ISO>    un rappel par cycle de reconduction
  dedup_key              text NOT NULL UNIQUE CHECK (char_length(dedup_key) BETWEEN 1 AND 200),

  -- Données du gabarit, calculées par le webhook depuis les objets Stripe. Pas
  -- d'adresse e-mail ici : le destinataire est relu dans auth.users à l'envoi.
  payload                jsonb NOT NULL DEFAULT '{}'::jsonb
                         CHECK (jsonb_typeof(payload) = 'object' AND pg_column_size(payload) <= 8192),

  -- Pas d'envoi avant cette date. `now()` pour les confirmations ; pour un
  -- rappel annuel, « un mois calendaire + 15 jours avant l'échéance » (calcul et
  -- justification : `reminderWindow`, supabase/functions/_shared/subscription-emails.ts).
  not_before             timestamptz NOT NULL DEFAULT now(),

  status                 text NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending', 'sending', 'sent', 'failed', 'skipped')),
  attempts               integer NOT NULL DEFAULT 0,
  next_attempt_at        timestamptz,
  claimed_at             timestamptz,

  recipient              text,       -- adresse au moment de l'envoi (preuve)
  provider_message_id    text,       -- id Resend
  last_error             text,
  sent_at                timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.subscription_emails IS
  'File et journal des e-mails d abonnement (L221-13, L215-1-1, L215-1). Ecriture via enqueue/claim/finish_subscription_email (service_role) uniquement.';

-- Réclamation : seules les lignes vivantes, par date d'échéance.
CREATE INDEX IF NOT EXISTS idx_subscription_emails_due
  ON public.subscription_emails (not_before, id)
  WHERE status IN ('pending', 'failed', 'sending');

CREATE INDEX IF NOT EXISTS idx_subscription_emails_subscription
  ON public.subscription_emails (stripe_subscription_id);

CREATE INDEX IF NOT EXISTS idx_subscription_emails_user
  ON public.subscription_emails (user_id);

DROP TRIGGER IF EXISTS trg_subscription_emails_updated_at ON public.subscription_emails;
CREATE TRIGGER trg_subscription_emails_updated_at
  BEFORE UPDATE ON public.subscription_emails
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

-- ════════════════════════════════════════════════════════════════════════════
--  2. RLS + MOINDRE PRIVILÈGE — aucun accès client
-- ════════════════════════════════════════════════════════════════════════════
-- Journal interne : RLS sans policy + REVOKE ALL (42501 pour un client). Même
-- modèle que `checkout_consent_log` et `app_events`.
ALTER TABLE public.subscription_emails ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.subscription_emails FROM anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════════
--  3. DÉPÔT — enqueue_subscription_email (appelé par le webhook Stripe)
-- ════════════════════════════════════════════════════════════════════════════
-- Idempotent par `dedup_key`. Seul un RAPPEL encore non envoyé peut être mis à
-- jour (montant ou date recalculés à un événement ultérieur, ou rappel
-- `skipped` réactivé si l'abonné annule sa résiliation) ; une confirmation déjà
-- déposée n'est jamais modifiée, une ligne `sent` jamais touchée.
-- Retour : 'inserted' | 'updated' | 'unchanged'.
CREATE OR REPLACE FUNCTION public.enqueue_subscription_email(
  p_user_id         uuid,
  p_subscription_id text,
  p_kind            text,
  p_dedup_key       text,
  p_payload         jsonb,
  p_not_before      timestamptz
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted boolean;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'email_user_required';
  END IF;

  INSERT INTO public.subscription_emails AS e
    (user_id, stripe_subscription_id, kind, dedup_key, payload, not_before)
  VALUES
    (p_user_id, p_subscription_id, p_kind, p_dedup_key, COALESCE(p_payload, '{}'::jsonb), COALESCE(p_not_before, now()))
  ON CONFLICT (dedup_key) DO UPDATE
     SET payload    = EXCLUDED.payload,
         not_before = EXCLUDED.not_before,
         status     = 'pending',
         last_error = NULL
   WHERE e.kind = 'renewal_reminder'
     AND e.status IN ('pending', 'skipped')
  RETURNING (xmax = 0) INTO v_inserted;

  IF NOT FOUND THEN
    RETURN 'unchanged';
  END IF;
  RETURN CASE WHEN v_inserted THEN 'inserted' ELSE 'updated' END;
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════
--  4. RÉCLAMATION ET CLÔTURE — claim-then-send (appelées par l'Edge Function)
-- ════════════════════════════════════════════════════════════════════════════
-- Lignes RÉCLAMABLES (⚠️ même prédicat que § 5, garder les deux alignés) :
--   • `pending` dont la date d'envoi est atteinte ;
--   • `failed` dont la relance est due, dans la limite de 8 tentatives ;
--   • `sending` depuis plus de 15 min (exécution plantée entre l'envoi et la
--     clôture) — sans doublon grâce à l'Idempotency-Key Resend (24 h).
CREATE OR REPLACE FUNCTION public.claim_subscription_emails(p_limit integer DEFAULT 20)
RETURNS SETOF public.subscription_emails
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.subscription_emails e
     SET status     = 'sending',
         attempts   = e.attempts + 1,
         claimed_at = now()
   WHERE e.id IN (
     SELECT d.id
       FROM public.subscription_emails d
      WHERE (d.status = 'pending' AND d.not_before <= now())
         OR (d.status = 'failed'  AND d.attempts < 8 AND d.next_attempt_at <= now())
         OR (d.status = 'sending' AND d.attempts < 8 AND d.claimed_at < now() - interval '15 minutes')
      ORDER BY d.not_before, d.id
      LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100)
      FOR UPDATE SKIP LOCKED
   )
  RETURNING e.*;
END;
$$;

-- Clôture d'une ligne réclamée. Ne touche QUE une ligne `sending` : une clôture
-- tardive (ligne déjà reprise et close par une autre exécution) est sans effet.
-- Relance exponentielle : 15 min, 30 min, 1 h, 2 h, 4 h, puis 6 h (plafond) —
-- 8 tentatives ≈ 20 h avant abandon, visible en `failed`.
CREATE OR REPLACE FUNCTION public.finish_subscription_email(
  p_id                  bigint,
  p_status              text,
  p_provider_message_id text,
  p_error               text,
  p_recipient           text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows int;
BEGIN
  IF p_status NOT IN ('sent', 'failed', 'skipped') THEN
    RAISE EXCEPTION 'invalid_email_status';
  END IF;

  UPDATE public.subscription_emails
     SET status              = p_status,
         provider_message_id = COALESCE(p_provider_message_id, provider_message_id),
         recipient           = COALESCE(p_recipient, recipient),
         last_error          = CASE WHEN p_status = 'sent' THEN NULL ELSE left(p_error, 500) END,
         sent_at             = CASE WHEN p_status = 'sent' THEN now() ELSE sent_at END,
         next_attempt_at     = CASE WHEN p_status = 'failed'
                                 THEN now() + LEAST(interval '6 hours', interval '15 minutes' * power(2, GREATEST(attempts - 1, 0)))
                                 ELSE NULL END
   WHERE id = p_id
     AND status = 'sending';

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows = 1;
END;
$$;

-- Les trois fonctions : EXECUTE à service_role SEUL. Forme en trois
-- instructions imposée par 20260909000002 (grants NOMINATIFS des DEFAULT
-- PRIVILEGES : un REVOKE FROM PUBLIC seul ne suffit pas).
REVOKE ALL ON FUNCTION public.enqueue_subscription_email(uuid, text, text, text, jsonb, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enqueue_subscription_email(uuid, text, text, text, jsonb, timestamptz) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_subscription_email(uuid, text, text, text, jsonb, timestamptz) TO service_role;

REVOKE ALL ON FUNCTION public.claim_subscription_emails(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_subscription_emails(integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_subscription_emails(integer) TO service_role;

REVOKE ALL ON FUNCTION public.finish_subscription_email(bigint, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finish_subscription_email(bigint, text, text, text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finish_subscription_email(bigint, text, text, text, text) TO service_role;

-- ════════════════════════════════════════════════════════════════════════════
--  5. DÉCLENCHEMENT — pg_cron toutes les 5 minutes → Edge Function
-- ════════════════════════════════════════════════════════════════════════════
-- 5 minutes : la confirmation de commande doit partir « avant le début de
-- l'exécution du service » (L221-13) — au plus près du paiement. Le rappel
-- annuel, lui, n'a besoin que d'un passage quotidien : il profite du même job.
--
-- La fonction n'appelle l'EF QUE s'il y a quelque chose à faire (même prédicat
-- que `claim_subscription_emails`) : le cas nominal — file vide — ne coûte
-- aucune invocation.
--
-- URL et jeton lus dans Vault à CHAQUE appel (patron de 20260901000001) : rien
-- de sensible dans `cron.job`. ⚠️ PRÉ-REQUIS MANUEL, par environnement :
--   select vault.create_secret('<valeur de SUBSCRIPTION_EMAILS_TOKEN>', 'subscription_emails_token', 'X-Internal-Token de l EF subscription-emails');
--   select vault.create_secret('https://<ref>.supabase.co/functions/v1/subscription-emails', 'subscription_emails_url', 'URL de l EF subscription-emails');
-- Sans eux : warning dans les logs Postgres et aucun appel — la file se remplit,
-- rien n'est perdu, tout part dès que la configuration est posée.
CREATE OR REPLACE FUNCTION public.trigger_subscription_emails_drain()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, net
AS $fn$
DECLARE
  v_token text;
  v_url   text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.subscription_emails d
     WHERE (d.status = 'pending' AND d.not_before <= now())
        OR (d.status = 'failed'  AND d.attempts < 8 AND d.next_attempt_at <= now())
        OR (d.status = 'sending' AND d.attempts < 8 AND d.claimed_at < now() - interval '15 minutes')
  ) THEN
    RETURN;
  END IF;

  SELECT max(CASE WHEN name = 'subscription_emails_token' THEN decrypted_secret END),
         max(CASE WHEN name = 'subscription_emails_url'   THEN decrypted_secret END)
    INTO v_token, v_url
    FROM vault.decrypted_secrets
   WHERE name IN ('subscription_emails_token', 'subscription_emails_url');

  IF v_token IS NULL OR v_url IS NULL THEN
    RAISE WARNING 'trigger_subscription_emails_drain: config Vault incomplete (token=%, url=%) - e-mails en attente non envoyes',
      (v_token IS NOT NULL), (v_url IS NOT NULL);
    RETURN;
  END IF;

  PERFORM net.http_post(
    url     => v_url,
    body    => '{}'::jsonb,
    params  => '{}'::jsonb,
    headers => jsonb_build_object('Content-Type', 'application/json', 'X-Internal-Token', v_token),
    timeout_milliseconds => 60000
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.trigger_subscription_emails_drain() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.trigger_subscription_emails_drain() FROM anon, authenticated;

DO $cron$
BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'subscription-emails-drain';
  PERFORM cron.schedule('subscription-emails-drain', '*/5 * * * *',
                        'select public.trigger_subscription_emails_drain()');
END
$cron$;

-- ── Auto-vérification — le `db push` ÉCHOUE si l'état visé n'est pas atteint ──
DO $$
DECLARE
  v_fn text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    RAISE NOTICE 'Rôle « anon » absent — vérification ignorée (Postgres hors Supabase).';
    RETURN;
  END IF;

  FOREACH v_fn IN ARRAY ARRAY[
    'public.enqueue_subscription_email(uuid,text,text,text,jsonb,timestamptz)',
    'public.claim_subscription_emails(integer)',
    'public.finish_subscription_email(bigint,text,text,text,text)'
  ] LOOP
    IF has_function_privilege('anon', v_fn::regprocedure, 'EXECUTE')
       OR has_function_privilege('authenticated', v_fn::regprocedure, 'EXECUTE') THEN
      RAISE EXCEPTION 'Révocation incomplète : % reste exécutable par anon ou authenticated.', v_fn;
    END IF;
    IF NOT has_function_privilege('service_role', v_fn::regprocedure, 'EXECUTE') THEN
      RAISE EXCEPTION 'Sur-révocation : service_role a perdu l''accès à %.', v_fn;
    END IF;
  END LOOP;

  IF has_function_privilege('anon', 'public.trigger_subscription_emails_drain()'::regprocedure, 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.trigger_subscription_emails_drain()'::regprocedure, 'EXECUTE') THEN
    RAISE EXCEPTION 'trigger_subscription_emails_drain (lit Vault) reste exécutable par un client.';
  END IF;

  IF has_table_privilege('anon', 'public.subscription_emails', 'SELECT')
     OR has_table_privilege('authenticated', 'public.subscription_emails', 'SELECT') THEN
    RAISE EXCEPTION 'subscription_emails reste lisible par anon ou authenticated.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'subscription-emails-drain') THEN
    RAISE EXCEPTION 'Job pg_cron subscription-emails-drain absent.';
  END IF;
END $$;
