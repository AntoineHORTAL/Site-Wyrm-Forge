-- Migration 20260909000003 : abonnements Stripe Billing (paliers Forgeron / Maître).
--
-- ════════════════════════════════════════════════════════════════════════════
--  POURQUOI UNE TABLE À CÔTÉ DE `profiles`, ET NON DES COLONNES `stripe_*`
-- ════════════════════════════════════════════════════════════════════════════
-- `profiles` est PARTAGÉE avec l'app de bureau WPF : toute colonne ajoutée là
-- devient du contrat entre deux clients qui ne se déploient pas ensemble. Or
-- l'app n'a rien à faire de l'identifiant client Stripe — elle lit `tier` et
-- `tier_expires_at`, et c'est tout ce qu'elle doit continuer de lire.
--
-- Le second argument est un argument de SÉCURITÉ, et il pèse plus lourd. Le
-- trigger `trg_protect_privilege_columns` (20260614000001) protège une LISTE
-- NOMMÉE de colonnes : role, tier, tier_expires_at, certified. Une colonne
-- `stripe_customer_id` ajoutée à `profiles` ne serait PAS dans cette liste, donc
-- serait librement écrivable par n'importe quel `authenticated` via PostgREST —
-- et c'est la clé par laquelle le webhook retrouve un utilisateur. Un compte
-- Apprenti qui s'attribue le `stripe_customer_id` d'un abonné hériterait de son
-- abonnement au prochain événement. La table dédiée ci-dessous n'a AUCUNE policy
-- d'écriture : le problème ne se pose pas.
--
-- ════════════════════════════════════════════════════════════════════════════
--  L'ARGENT CHANGE DE MAIN → LA BARRIÈRE EST EN BASE
-- ════════════════════════════════════════════════════════════════════════════
-- Même raisonnement que `kit_orders` (20260908000001), et pour la même raison :
-- le verrou « palier payant » des Scénarios est purement côté client, ici la
-- même erreur serait payante. D'où :
--   • AUCUNE policy INSERT / UPDATE / DELETE sur `stripe_subscriptions` → RLS
--     activée sans policy = deny total pour anon ET authenticated ;
--   • le SEUL chemin d'écriture est `stripe_apply_subscription_event` (§ 3),
--     SECURITY DEFINER, dont l'EXECUTE n'est accordé qu'à `service_role` — donc
--     joignable uniquement depuis la route `/api/stripe/webhook`, qui détient la
--     clé service role. Ni le navigateur ni un JWT utilisateur n'y accèdent.
--
-- ════════════════════════════════════════════════════════════════════════════
--  QUI DÉCIDE DU PALIER ? LE CODE, PAS LA BASE
-- ════════════════════════════════════════════════════════════════════════════
-- La fonction ne traduit PAS un statut Stripe en palier : elle reçoit déjà
-- `p_effective_tier` / `p_effective_expires_at` et se contente de les appliquer.
-- La politique (past_due garde son palier, unpaid le perd, …) vit dans
-- `src/lib/stripe/plans.ts`, module pur et TESTÉ. Dupliquer cette table de
-- décision en PL/pgSQL garantirait qu'un jour les deux divergent, et c'est la
-- version non testée qui gagnerait — c'est elle qui écrit.
--
-- Dépend de : profiles(id) (baseline), fn_set_updated_at() (20260606000012).
-- Idempotent : CREATE ... IF NOT EXISTS + DROP/CREATE POLICY/TRIGGER +
--              CREATE OR REPLACE FUNCTION. Rejouable sans effet de bord.

-- ════════════════════════════════════════════════════════════════════════════
--  1. TABLE stripe_subscriptions
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.stripe_subscriptions (
  -- UN abonnement courant par compte. C'est une clé primaire et pas un simple
  -- index unique : le modèle commercial est « un palier à la fois » (cf.
  -- `profiles.tier`, valeur unique et exclusive). Un futur add-on cumulable
  -- (kit sur mesure, Légion) n'a rien à faire ici — il aura sa table, comme
  -- `kit_orders` a la sienne.
  user_id                uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,

  -- Le client Stripe. UNIQUE : deux comptes Wyrm Forge ne peuvent pas pointer le
  -- même client Stripe, sinon un événement d'abonnement serait ambigu.
  -- C'est aussi la clé de correspondance des événements `customer.subscription.*`,
  -- qui ne portent PAS de `client_reference_id` (seul le checkout en a un).
  stripe_customer_id     text NOT NULL UNIQUE,

  -- NULL tant que le checkout n'a pas abouti (ligne créée à la création du
  -- client Stripe). UNIQUE mais nullable : Postgres autorise plusieurs NULL.
  stripe_subscription_id text UNIQUE,

  -- Statut Stripe BRUT (`active`, `past_due`, `unpaid`, `canceled`, …). Stocké
  -- tel quel, sans CHECK : Stripe peut en ajouter, et une valeur inconnue doit
  -- pouvoir être écrite puis lue plutôt que faire échouer un webhook — un
  -- webhook en erreur est retenté indéfiniment par Stripe.
  status                 text,

  -- Prix Stripe souscrit — c'est lui qui porte la périodicité (mensuel/annuel).
  price_id               text,

  -- Palier ACHETÉ (`forgeron` / `maître`), conservé même quand il n'est plus
  -- effectif. Répond à « à quoi cette personne a-t-elle souscrit ? » sans
  -- dépendre de `profiles.tier`, qui peut avoir été redescendu à `apprenti`.
  tier                   text,

  -- Fin de la période PAYÉE. Recopiée dans `profiles.tier_expires_at` par la
  -- fonction du § 3. ⚠️ Depuis l'API 2025-xx, Stripe ne porte plus cette valeur
  -- sur l'objet Subscription mais sur ses `items` — voir `plans.ts`.
  current_period_end     timestamptz,

  -- L'abonné a résilié mais garde son accès jusqu'à `current_period_end`.
  -- Distinct de `status='canceled'`, qui est la fin effective.
  cancel_at_period_end   boolean     NOT NULL DEFAULT false,

  -- ⚠️ GARDE D'ORDRE — pas un champ d'audit décoratif.
  --
  -- Stripe ne garantit PAS l'ordre de livraison des webhooks, et retente les
  -- échecs. Sans cette colonne, un `customer.subscription.updated` (active)
  -- livré en retard APRÈS un `deleted` réactiverait l'abonnement d'un compte
  -- résilié. On y met le `created` de l'ÉVÉNEMENT Stripe (pas `now()`), et le
  -- § 3 refuse d'appliquer un événement plus ancien que le dernier appliqué.
  --
  -- `-infinity` en défaut : toute ligne préexistante accepte le premier
  -- événement qui se présente.
  last_event_at          timestamptz NOT NULL DEFAULT '-infinity',

  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.stripe_subscriptions IS
  'Abonnements Stripe Billing. Ecriture exclusivement via stripe_apply_subscription_event (service_role). profiles.tier reste la source de verite du palier pour le site ET l app WPF.';

-- Retrouver un abonné depuis un événement `customer.subscription.*`.
CREATE INDEX IF NOT EXISTS idx_stripe_subscriptions_customer
  ON public.stripe_subscriptions (stripe_customer_id);

DROP TRIGGER IF EXISTS trg_stripe_subscriptions_updated_at ON public.stripe_subscriptions;
CREATE TRIGGER trg_stripe_subscriptions_updated_at
  BEFORE UPDATE ON public.stripe_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

-- ════════════════════════════════════════════════════════════════════════════
--  2. RLS + MOINDRE PRIVILÈGE
-- ════════════════════════════════════════════════════════════════════════════
ALTER TABLE public.stripe_subscriptions ENABLE ROW LEVEL SECURITY;

-- Lecture : son propre abonnement, et rien d'autre. Pas d'exception admin ici —
-- l'AdminTab lit déjà `profiles.tier` / `tier_expires_at`, qui est ce qu'il
-- affiche ; lui ouvrir les identifiants Stripe de tout le monde n'ajouterait
-- rien qu'il utilise. À rouvrir explicitement le jour où un écran en a besoin.
--
-- `(select auth.uid())` et non `auth.uid()` nu : forme des policies récentes du
-- repo, évaluée une fois en initplan plutôt qu'une fois par ligne.
DROP POLICY IF EXISTS ss_select_own ON public.stripe_subscriptions;
CREATE POLICY ss_select_own ON public.stripe_subscriptions
  FOR SELECT TO authenticated
  USING ((select auth.uid()) = user_id);

-- Aucune policy INSERT / UPDATE / DELETE : RLS activée + absence de policy =
-- deny total pour les rôles client. `service_role` contourne la RLS, c'est par
-- lui que la fonction du § 3 est appelée.

-- ⚠️ REVOKE avant GRANT : Supabase applique des DEFAULT PRIVILEGES accordant ALL
-- à `anon` ET `authenticated` sur toute table neuve. Sans ce REVOKE, le refus
-- d'écriture ne tiendrait qu'à l'absence de policy — même oubli que celui que
-- `20260901000003` a dû réparer après coup sur `scenarios`.
REVOKE ALL   ON public.stripe_subscriptions FROM anon, authenticated;
GRANT  SELECT ON public.stripe_subscriptions TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
--  3. APPLICATION D'UN ÉVÉNEMENT — stripe_apply_subscription_event
-- ════════════════════════════════════════════════════════════════════════════
-- Point d'écriture UNIQUE, appelé par `/api/stripe/webhook` après vérification
-- de la signature Stripe. Fait les deux écritures — la ligne d'abonnement et le
-- palier de `profiles` — dans UNE transaction : un webhook interrompu entre les
-- deux laisserait sinon un palier qui ne correspond à aucun abonnement.
--
-- Retour jsonb, jamais d'exception sur un cas métier : le webhook doit répondre
-- 200 à un événement périmé, sinon Stripe le retente en boucle.
--   { applied: bool, profile_updated: bool, reason: text }
CREATE OR REPLACE FUNCTION public.stripe_apply_subscription_event(
  p_user_id              uuid,
  p_customer_id          text,
  p_subscription_id      text,
  p_status               text,
  p_price_id             text,
  p_tier                 text,
  p_current_period_end   timestamptz,
  p_cancel_at_period_end boolean,
  p_effective_tier       text,
  p_effective_expires_at timestamptz,
  p_event_at             timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows int;
  v_role text;
BEGIN
  -- ── Écriture de l'abonnement, avec la garde d'ordre ────────────────────────
  --
  -- `>=` et non `>` : `checkout.session.completed` et le premier
  -- `customer.subscription.updated` portent souvent le MÊME `created` à la
  -- seconde près. Avec `>`, le second serait rejeté comme périmé alors qu'il
  -- porte l'information la plus complète. À timestamp égal, le dernier arrivé
  -- gagne ; c'est l'événement STRICTEMENT plus ancien qu'on refuse.
  INSERT INTO public.stripe_subscriptions AS s (
    user_id, stripe_customer_id, stripe_subscription_id, status, price_id,
    tier, current_period_end, cancel_at_period_end, last_event_at
  )
  VALUES (
    p_user_id, p_customer_id, p_subscription_id, p_status, p_price_id,
    p_tier, p_current_period_end, COALESCE(p_cancel_at_period_end, false),
    -- `last_event_at` est NOT NULL et pilote la garde d'ordre : un NULL y
    -- ferait échouer l'INSERT, et rendrait la comparaison du DO UPDATE nulle
    -- (donc jamais vraie, donc tout événement rejeté en silence).
    COALESCE(p_event_at, now())
  )
  ON CONFLICT (user_id) DO UPDATE SET
    stripe_customer_id     = EXCLUDED.stripe_customer_id,
    stripe_subscription_id = EXCLUDED.stripe_subscription_id,
    status                 = EXCLUDED.status,
    price_id               = EXCLUDED.price_id,
    tier                   = EXCLUDED.tier,
    current_period_end     = EXCLUDED.current_period_end,
    cancel_at_period_end   = EXCLUDED.cancel_at_period_end,
    last_event_at          = EXCLUDED.last_event_at
  WHERE EXCLUDED.last_event_at >= s.last_event_at;

  GET DIAGNOSTICS v_rows = ROW_COUNT;

  -- 0 ligne = la clause WHERE de l'ON CONFLICT a refusé la mise à jour, donc
  -- l'événement est plus ancien que le dernier appliqué.
  IF v_rows = 0 THEN
    RETURN jsonb_build_object('applied', false, 'profile_updated', false, 'reason', 'stale_event');
  END IF;

  -- ── Report du palier sur profiles ──────────────────────────────────────────
  --
  -- Un ADMIN est laissé tranquille. Son palier est un marqueur de rôle géré à la
  -- main (cf. `effectiveTier` dans SessionProvider, et l'exclusion des admins
  -- dans SubscriptionReminder / AdminTab) : le redescendre à `apprenti` parce
  -- qu'un abonnement de test a expiré ferait perdre un accès qui ne vient pas de
  -- Stripe. L'abonnement est quand même enregistré ci-dessus — seul le report
  -- est sauté.
  SELECT role INTO v_role FROM public.profiles WHERE id = p_user_id;

  IF v_role IS NULL THEN
    RETURN jsonb_build_object('applied', true, 'profile_updated', false, 'reason', 'no_profile');
  END IF;

  IF v_role = 'admin' THEN
    RETURN jsonb_build_object('applied', true, 'profile_updated', false, 'reason', 'admin_untouched');
  END IF;

  UPDATE public.profiles
     SET tier            = p_effective_tier,
         tier_expires_at = p_effective_expires_at
   WHERE id = p_user_id;

  RETURN jsonb_build_object('applied', true, 'profile_updated', true, 'reason', 'ok');
END;
$$;

COMMENT ON FUNCTION public.stripe_apply_subscription_event IS
  'Applique un evenement Stripe : upsert stripe_subscriptions (garde d ordre sur last_event_at) + report du palier sur profiles. EXECUTE reserve a service_role.';

-- ⚠️ SECURITY DEFINER : la fonction s'exécute avec les droits de son
-- propriétaire (postgres), donc elle contourne la RLS ET le trigger
-- `trg_protect_privilege_columns` — qui ne bloque que `current_user =
-- 'authenticated'`. C'est voulu : écrire `profiles.tier` est précisément son
-- travail. La barrière n'est donc PAS dans le corps de la fonction, elle est
-- dans le GRANT ci-dessous. Ne jamais l'accorder à `authenticated` : ce serait
-- rendre l'auto-attribution de palier accessible à n'importe quel navigateur.
-- Forme en TROIS instructions, imposée par la règle de `20260909000002` : les
-- DEFAULT PRIVILEGES du projet Supabase accordent EXECUTE **nominativement** à
-- `anon` et `authenticated` sur toute fonction neuve de `public`, et un
-- `REVOKE … FROM PUBLIC` ne retire PAS un grant nominatif. Le REVOKE FROM PUBLIC
-- seul passerait la relecture de code et laisserait la fonction appelable au
-- `curl` avec la clé anon. Ici ce serait l'auto-attribution de palier.
REVOKE ALL ON FUNCTION public.stripe_apply_subscription_event(
  uuid, text, text, text, text, text, timestamptz, boolean, text, timestamptz, timestamptz
) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.stripe_apply_subscription_event(
  uuid, text, text, text, text, text, timestamptz, boolean, text, timestamptz, timestamptz
) FROM anon, authenticated;

GRANT EXECUTE ON FUNCTION public.stripe_apply_subscription_event(
  uuid, text, text, text, text, text, timestamptz, boolean, text, timestamptz, timestamptz
) TO service_role;

-- ── Auto-vérification — une révocation qui ne révoque rien est le bug visé ────
-- Même dispositif que `20260909000002` : le `db push` ÉCHOUE si l'état visé
-- n'est pas atteint, dans les deux sens. Relire le REVOKE dans le fichier ne
-- prouve rien — c'est précisément ce qu'avaient fait les migrations du kit.
DO $$
DECLARE
  v_fn CONSTANT text :=
    'public.stripe_apply_subscription_event(uuid,text,text,text,text,text,timestamptz,boolean,text,timestamptz,timestamptz)';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    RAISE NOTICE 'Rôle « anon » absent — vérification ignorée (Postgres hors Supabase).';
    RETURN;
  END IF;

  IF has_function_privilege('anon', v_fn::regprocedure, 'EXECUTE')
     OR has_function_privilege('authenticated', v_fn::regprocedure, 'EXECUTE') THEN
    RAISE EXCEPTION
      'Révocation incomplète : stripe_apply_subscription_event reste exécutable par anon ou authenticated.';
  END IF;

  -- Contrôle inverse : sans ce GRANT, le webhook tomberait en 42501 et Stripe
  -- retenterait indéfiniment un événement qui ne peut pas aboutir.
  IF NOT has_function_privilege('service_role', v_fn::regprocedure, 'EXECUTE') THEN
    RAISE EXCEPTION
      'Sur-révocation : `service_role` a perdu l''accès à stripe_apply_subscription_event.';
  END IF;
END $$;
