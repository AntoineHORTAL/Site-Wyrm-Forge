-- Migration 20260911000003 : preuve de la demande expresse d'exécution
-- immédiate, recueillie AVANT l'ouverture d'une session Stripe Checkout.
--
-- ════════════════════════════════════════════════════════════════════════════
--  CE QUE CETTE TABLE PROUVE
-- ════════════════════════════════════════════════════════════════════════════
-- Art. L221-25 du Code de la consommation : si le consommateur veut que le
-- service commence avant la fin du délai de rétractation, le professionnel
-- « recueille sa demande expresse ». Sans elle, un abonné qui se rétracte dans
-- les 14 jours ne doit RIEN, même après usage (al. 3). Avec elle, il doit le
-- prorata du service fourni. C'est au professionnel de prouver le recueil —
-- d'où une ligne par acceptation, écrite AVANT le paiement, portant :
--   • QUI     — `user_id`, issu du JWT vérifié par la route (`getUser()`) ;
--   • QUAND   — `accepted_at`, horloge de la BASE, jamais celle du navigateur ;
--   • QUOI    — `consent_text`, le texte EXACT affiché, en toutes lettres, avec
--               sa `consent_version` et sa `locale` : si le texte change demain,
--               chaque ligne dit encore ce qui a été accepté ce jour-là ;
--   • POUR QUOI — `plan` / `period`, et `terms_version` (version des CGV).
-- Le lien vers Stripe est posé dans l'autre sens : la route écrit l'`id` de la
-- ligne dans les `metadata` de la session ET de l'abonnement (`consent_id`).
--
-- Consommateur : `/api/stripe/checkout` UNIQUEMENT (site). L'app WPF ne vend
-- rien et ne lit pas cette table — aucun impact sur le second client.
--
-- ════════════════════════════════════════════════════════════════════════════
--  POURQUOI UNE TABLE, ET PAS UNE COLONNE SUR `profiles`
-- ════════════════════════════════════════════════════════════════════════════
-- Un booléen « a accepté » sur `profiles` ne prouve rien : ni quand, ni quel
-- texte, ni pour quel achat — et il serait écrasé au deuxième abonnement. Et
-- `profiles` est partagée avec l'app WPF : pas de contrat inutile entre deux
-- clients qui ne se déploient pas ensemble (même raisonnement que
-- `stripe_subscriptions`, 20260909000003).
--
-- ════════════════════════════════════════════════════════════════════════════
--  UNE PREUVE NE SE RÉÉCRIT PAS
-- ════════════════════════════════════════════════════════════════════════════
--   • aucune policy, et `REVOKE ALL` pour anon/authenticated : aucun client n'y
--     lit ni n'y écrit, pas même sa propre ligne (modèle de journal interne) ;
--   • un seul chemin d'écriture : `record_checkout_consent`, EXECUTE réservé à
--     `service_role`, appelé par la route APRÈS validation du corps. Le TEXTE
--     vient du module `src/lib/stripe/checkout-consent.ts`, jamais du navigateur ;
--   • trigger d'immuabilité : tout UPDATE est refusé, SAUF la mise à NULL de
--     `user_id` (voir ci-dessous).
--
-- ⚠️ `user_id … ON DELETE SET NULL`, pas CASCADE. À la suppression d'un compte,
-- la ligne perd son lien direct avec la personne mais SURVIT : l'abonnement
-- Stripe garde `consent_id` dans ses métadonnées, la preuve reste donc
-- opposable en cas de litige ou de rétrofacturation. CASCADE effacerait la
-- preuve au moment exact où un différend est le plus probable. Durée de
-- conservation annoncée dans la politique de confidentialité (§ 6).
--
-- Dépend de : profiles(id) (baseline). Aucune dépendance au module Stripe.
-- Idempotent : CREATE … IF NOT EXISTS + CREATE OR REPLACE + DROP/CREATE TRIGGER.

-- ════════════════════════════════════════════════════════════════════════════
--  1. TABLE checkout_consent_log
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.checkout_consent_log (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- NULL uniquement après suppression du compte (ON DELETE SET NULL, voir
  -- l'en-tête). La RPC, elle, refuse un NULL : une preuve naît toujours
  -- rattachée à quelqu'un.
  user_id         uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,

  -- `PlanKey` ASCII (`forgeron`, `maitre`), pas la valeur accentuée de
  -- `profiles.tier`. PAS de CHECK sur une liste de paliers : le jour où un
  -- palier devient achetable, un CHECK oublié bloquerait TOUTES ses ventes au
  -- stade de la preuve. La liste fait foi dans `plans.ts` (`isPlanKey`).
  plan            text        NOT NULL CHECK (char_length(plan) BETWEEN 1 AND 32),

  -- Vocabulaire métier figé, lui : deux périodicités, et leur changement
  -- serait de toute façon une refonte (prix, CGV, rappel annuel).
  period          text        NOT NULL CHECK (period IN ('mensuel', 'annuel')),

  consent_version text        NOT NULL CHECK (char_length(consent_version) BETWEEN 1 AND 64),
  locale          text        NOT NULL CHECK (char_length(locale) BETWEEN 2 AND 10),

  -- Le texte affiché, EN ENTIER. Bornes : un texte vide ne prouve rien, un
  -- texte de plusieurs pages n'est pas une case à cocher.
  consent_text    text        NOT NULL CHECK (char_length(consent_text) BETWEEN 20 AND 2000),

  -- Version des CGV en vigueur au moment de l'acceptation (`CGV_VERSION`).
  terms_version   text        NOT NULL CHECK (char_length(terms_version) BETWEEN 1 AND 32),

  -- Horloge de la BASE. Jamais un horodatage fourni par le client.
  accepted_at     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.checkout_consent_log IS
  'Preuve de la demande expresse d execution immediate (art. L221-25 C. conso), ecrite AVANT la session Stripe. Immuable. Ecriture via record_checkout_consent (service_role) uniquement.';

-- Retrouver les preuves d'un compte (demande d'accès RGPD, litige).
CREATE INDEX IF NOT EXISTS idx_checkout_consent_log_user
  ON public.checkout_consent_log (user_id, accepted_at DESC);

-- ════════════════════════════════════════════════════════════════════════════
--  2. RLS + MOINDRE PRIVILÈGE — aucun accès client, lecture comprise
-- ════════════════════════════════════════════════════════════════════════════
-- Modèle `app_events` / journal interne : RLS activée, AUCUNE policy, et
-- `REVOKE ALL` sans aucun GRANT. Un client obtient 42501 (privilège), garantie
-- plus forte qu'un filtrage RLS à 0 ligne. Le REVOKE est indispensable : les
-- DEFAULT PRIVILEGES de Supabase accordent ALL à anon ET authenticated sur
-- toute table neuve (oubli réparé après coup sur `scenarios`, 20260901000003).
ALTER TABLE public.checkout_consent_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.checkout_consent_log FROM anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════════
--  3. IMMUABILITÉ — une preuve ne se réécrit pas
-- ════════════════════════════════════════════════════════════════════════════
-- Même `service_role` (qui contourne la RLS) ne peut pas modifier une ligne.
--
-- ⚠️ UNE exception, et elle est obligatoire : `ON DELETE SET NULL` est exécuté
-- par Postgres comme un UPDATE de la ligne référençante, et ce trigger le VOIT.
-- Sans l'exception, supprimer un compte ayant souscrit échouerait sur ce
-- trigger — la demande d'effacement RGPD deviendrait impossible à traiter.
-- L'exception est étroite : `user_id` passe à NULL et RIEN d'autre ne bouge.
--
-- DELETE n'est pas bloqué : aucun client n'a le privilège (§ 2), et la purge à
-- l'échéance de conservation doit rester possible sans désactiver de trigger.
CREATE OR REPLACE FUNCTION public.fn_checkout_consent_log_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.user_id IS NULL
     AND (to_jsonb(NEW) - 'user_id') = (to_jsonb(OLD) - 'user_id') THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'checkout_consent_log_immutable'
    USING DETAIL = 'Une preuve de consentement ne se modifie pas. Seule l''anonymisation (user_id -> NULL) est admise.';
END;
$$;

DROP TRIGGER IF EXISTS trg_checkout_consent_log_immutable ON public.checkout_consent_log;
CREATE TRIGGER trg_checkout_consent_log_immutable
  BEFORE UPDATE ON public.checkout_consent_log
  FOR EACH ROW EXECUTE FUNCTION public.fn_checkout_consent_log_immutable();

-- ════════════════════════════════════════════════════════════════════════════
--  4. ÉCRITURE — record_checkout_consent
-- ════════════════════════════════════════════════════════════════════════════
-- Appelée par `/api/stripe/checkout` (client `service_role`, `src/lib/supabase/
-- admin.ts`) AVANT `stripe.checkout.sessions.create`. Renvoie l'`id` de la
-- ligne, que la route pose dans les métadonnées Stripe. Une EXCEPTION ici
-- (profil inexistant → 23503, texte hors bornes → 23514) fait échouer la route
-- AVANT toute session : pas de paiement sans preuve.
--
-- La fonction ne décide de RIEN — ni du texte, ni de la version courante :
-- `checkConsent` (TypeScript, testé) l'a déjà fait. Même partage des rôles que
-- `stripe_apply_subscription_event`.
CREATE OR REPLACE FUNCTION public.record_checkout_consent(
  p_user_id         uuid,
  p_plan            text,
  p_period          text,
  p_consent_version text,
  p_locale          text,
  p_consent_text    text,
  p_terms_version   text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  -- La colonne tolère NULL (anonymisation) ; une NOUVELLE preuve, jamais.
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'consent_user_required';
  END IF;

  INSERT INTO public.checkout_consent_log (
    user_id, plan, period, consent_version, locale, consent_text, terms_version
  )
  VALUES (
    p_user_id, p_plan, p_period, p_consent_version, p_locale, p_consent_text, p_terms_version
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.record_checkout_consent IS
  'Enregistre la preuve de demande expresse avant une session Stripe Checkout. Renvoie l id de la preuve. EXECUTE reserve a service_role.';

-- Forme en TROIS instructions, imposée par la règle de 20260909000002 : les
-- DEFAULT PRIVILEGES du projet accordent EXECUTE NOMINATIVEMENT à anon et
-- authenticated ; un REVOKE … FROM PUBLIC seul ne les retire pas. Ici, une
-- fonction ouverte laisserait n'importe qui fabriquer des preuves au `curl`.
REVOKE ALL ON FUNCTION public.record_checkout_consent(
  uuid, text, text, text, text, text, text
) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.record_checkout_consent(
  uuid, text, text, text, text, text, text
) FROM anon, authenticated;

GRANT EXECUTE ON FUNCTION public.record_checkout_consent(
  uuid, text, text, text, text, text, text
) TO service_role;

-- ── Auto-vérification — le `db push` ÉCHOUE si l'état visé n'est pas atteint ──
-- Même dispositif que 20260909000002 / 20260909000003, dans les deux sens.
DO $$
DECLARE
  v_fn CONSTANT text := 'public.record_checkout_consent(uuid,text,text,text,text,text,text)';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    RAISE NOTICE 'Rôle « anon » absent — vérification ignorée (Postgres hors Supabase).';
    RETURN;
  END IF;

  IF has_function_privilege('anon', v_fn::regprocedure, 'EXECUTE')
     OR has_function_privilege('authenticated', v_fn::regprocedure, 'EXECUTE') THEN
    RAISE EXCEPTION
      'Révocation incomplète : record_checkout_consent reste exécutable par anon ou authenticated.';
  END IF;

  -- Sans ce GRANT, TOUT checkout échouerait au stade de la preuve (503).
  IF NOT has_function_privilege('service_role', v_fn::regprocedure, 'EXECUTE') THEN
    RAISE EXCEPTION
      'Sur-révocation : service_role a perdu l''accès à record_checkout_consent — plus aucun paiement possible.';
  END IF;

  IF has_table_privilege('anon', 'public.checkout_consent_log', 'SELECT')
     OR has_table_privilege('authenticated', 'public.checkout_consent_log', 'SELECT')
     OR has_table_privilege('authenticated', 'public.checkout_consent_log', 'INSERT') THEN
    RAISE EXCEPTION
      'checkout_consent_log reste accessible à anon ou authenticated — REVOKE non appliqué.';
  END IF;
END $$;
