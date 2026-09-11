import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import type Stripe from 'stripe'
import { createClient } from '@/lib/supabase/server'
import { getStripe, SITE_URL } from '@/lib/stripe/server'
import { stripeMode } from '@/lib/stripe/plans'
import { canCancelSubscription, type SubscriptionRow } from '@/lib/stripe/subscription-view'

/**
 * Ouverture d'une session du **Billing Portal** de Stripe — l'écran hébergé où
 * l'abonné change de carte, télécharge ses factures et résilie.
 *
 * POST, sans corps (ou `{}`) → 200 `{ url }` : le portail, page d'accueil.
 * POST `{ flow: 'cancel' }`   → 200 `{ url }` : le portail ouvert DIRECTEMENT
 *   sur l'écran de résiliation (`flow_data.type = 'subscription_cancel'`).
 *   C'est le bouton « Résilier mon abonnement » de `/profil` — décret
 *   n° 2023-417 (art. L215-1-1) : la résiliation doit être accessible sous une
 *   mention sans ambiguïté, pas cachée derrière « gérer ». 409 `not_cancellable`
 *   si l'abonnement ne peut pas l'être (`canCancelSubscription`, même règle que
 *   l'interface).
 *
 * Le navigateur y redirige, pleine page, exactement comme pour le checkout
 * (domaine tiers, hors du routeur Next).
 *
 * ⚠️ Le flux `subscription_cancel` exige que la résiliation soit ACTIVÉE dans la
 * configuration du portail (Dashboard → Billing → Customer portal), en test ET
 * en live. Relevé en test le 2026-09-11 : activée, mode `at_period_end`.
 *
 * ⚠️ **Configuration manuelle requise côté Stripe** : le portail doit être
 * activé et enregistré dans Dashboard → Settings → Billing → Customer portal,
 * EN MODE LIVE comme en mode test (les deux configurations sont distinctes).
 * Sans elle, l'API répond « No configuration provided » et cette route renvoie
 * un 502 — c'est une configuration absente, pas un bug de code.
 *
 * ════════════════════════════════════════════════════════════════════════════
 *  CETTE ROUTE N'ÉCRIT RIEN
 * ════════════════════════════════════════════════════════════════════════════
 * Même règle que `/api/stripe/checkout`, et pour la même raison : le webhook est
 * le SEUL chemin d'écriture sur les paliers. Une résiliation faite dans le
 * portail revient ici sous forme de `customer.subscription.updated`, puis
 * `deleted` à la fin de la période — c'est cet événement, et lui seul, qui
 * redescend `profiles.tier`. Écrire quoi que ce soit depuis cette route
 * créerait une seconde vérité, désynchronisée de Stripe dès le premier
 * changement fait depuis le Dashboard.
 *
 * `runtime = 'nodejs'` : le SDK Stripe s'appuie sur des API Node.
 */
export const runtime = 'nodejs'

function fail(code: string, status: number) {
  return NextResponse.json({ error: code }, { status })
}

export async function POST(request: NextRequest) {
  // Corps FACULTATIF : l'ancien appel sans corps reste valide (portail simple).
  const body = await request.json().catch(() => null) as { flow?: unknown } | null
  const wantsCancel = body?.flow === 'cancel'

  // ── 1. Qui demande ? ────────────────────────────────────────────────────────
  //
  // `getUser()` et jamais `getSession()`, comme sur le checkout : `getSession`
  // relit le cookie sans le faire valider par le serveur d'auth. Le portail
  // donne accès à l'historique de facturation et au moyen de paiement — une
  // identité déduite d'un cookie présent n'y suffit pas.
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) return fail('not_authenticated', 401)

  // ── 2. A-t-il seulement un client Stripe ? ──────────────────────────────────
  //
  // Lecture sous le JWT de l'utilisateur : la policy `ss_select_own` lui donne SA
  // ligne et rien d'autre. Aucun `service_role` ici — la question posée est
  // « quel est MON identifiant client ? », et c'est la RLS qui garantit la
  // réponse, pas une clause `.eq()` qu'on pourrait oublier d'écrire.
  //
  // ⚠️ Le `stripe_customer_id` ne vient JAMAIS du corps de la requête. L'accepter
  // du navigateur ouvrirait à n'importe qui les factures et le moyen de paiement
  // de n'importe quel abonné : c'est le pendant exact de « le montant n'est
  // jamais transmis par le client » côté checkout.
  const { data: row, error: readError } = await supabase
    .from('stripe_subscriptions')
    .select('stripe_customer_id, stripe_subscription_id, status, cancel_at_period_end, current_period_end')
    .eq('user_id', user.id)
    .maybeSingle<SubscriptionRow>()

  if (readError) {
    console.error('[stripe/portal] lecture stripe_subscriptions:', readError.message)
    return fail('portal_failed', 502)
  }

  const customerId = row?.stripe_customer_id
  if (!customerId) {
    // Cas NORMAL, pas une panne : cette personne n'a jamais eu d'abonnement, il
    // n'y a rien à gérer. 404 plutôt que 403 — ce n'est pas un refus d'accès,
    // c'est une ressource qui n'existe pas. L'interface n'affiche d'ailleurs le
    // bouton que si `canManageBilling` (cf. `resolveSubscriptionView`) ; ce code
    // est le filet, pour un appel direct ou une page laissée ouverte trop
    // longtemps.
    return fail('no_customer', 404)
  }

  // Résiliation directe : l'identifiant d'abonnement vient de la MÊME ligne lue
  // sous le JWT — jamais du corps de la requête, pour la même raison que le
  // client Stripe (on ne résilie pas l'abonnement de quelqu'un d'autre).
  if (wantsCancel && !canCancelSubscription(row)) return fail('not_cancellable', 409)

  const flowData: Stripe.BillingPortal.SessionCreateParams.FlowData | undefined = wantsCancel
    ? {
        type: 'subscription_cancel',
        subscription_cancel: { subscription: row!.stripe_subscription_id! },
        // Une fois la résiliation confirmée, retour direct sur /profil, qui
        // affiche la date de fin dès que le webhook l'a enregistrée.
        after_completion: { type: 'redirect', redirect: { return_url: `${SITE_URL}/profil` } },
      }
    : undefined

  // ── 3. La session de portail ────────────────────────────────────────────────
  try {
    const stripe = getStripe()

    // Mode déduit de la CLÉ, jamais d'un drapeau séparé — même règle que le
    // checkout, et journalisé pour la même raison : pouvoir constater dans les
    // logs sur quel mode une session a réellement été ouverte.
    const mode = stripeMode(process.env.STRIPE_SECRET_KEY)

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      // ⚠️ Origine de CONFIANCE (`SITE_URL`), jamais celle tirée de la requête :
      // le header `Host` est contrôlé par l'appelant, et cette URL est celle où
      // Stripe renvoie quelqu'un qui sort de son espace de facturation.
      //
      // Retour sur `/profil` — c'est de là que part le bouton. La page relit
      // `profiles` à chaque montage, donc une résiliation prise en compte par le
      // webhook entre-temps s'y voit ; si le webhook n'est pas encore passé, la
      // page affiche l'état d'avant, ce qui reste vrai : l'accès court jusqu'à
      // la fin de la période payée.
      return_url: `${SITE_URL}/profil`,
      ...(flowData ? { flow_data: flowData } : {}),
    })

    if (!session.url) {
      console.error('[stripe/portal] session créée sans URL', { id: session.id })
      return fail('portal_unavailable', 502)
    }

    console.log('[stripe/portal] session ouverte', {
      mode, user_id: user.id, session_id: session.id, flow: wantsCancel ? 'cancel' : 'home',
    })

    return NextResponse.json({ url: session.url })
  } catch (err) {
    // Le message Stripe peut nommer des identifiants de compte : logs serveur
    // uniquement, jamais la réponse HTTP. C'est ici qu'atterrit le « No
    // configuration provided » d'un portail non activé au Dashboard.
    console.error('[stripe/portal]', err instanceof Error ? err.message : err)
    return fail('portal_failed', 502)
  }
}

/**
 * Rien à lire ici. Un GET explicite en 405 vaut mieux que le 404 par défaut : il
 * distingue « route absente » de « mauvaise méthode » quand on diagnostique un
 * déploiement.
 */
export async function GET() {
  return NextResponse.json({ error: 'method_not_allowed' }, { status: 405 })
}
