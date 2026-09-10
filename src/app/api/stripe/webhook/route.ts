import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import type Stripe from 'stripe'
import { createAdminClient } from '@/lib/supabase/admin'
import { getStripe, priceEnv, requireEnv } from '@/lib/stripe/server'
import {
  planForPriceId,
  periodForPriceId,
  resolveTierOutcome,
  isKnownStatus,
  isPaymentIssue,
  unixToIso,
  TIER_BY_PLAN,
} from '@/lib/stripe/plans'

/**
 * Réception des événements Stripe — le SEUL endroit qui fait changer un palier.
 *
 * Événements traités :
 *   • `checkout.session.completed`      — l'abonnement vient d'être souscrit
 *   • `customer.subscription.updated`   — renouvellement, changement de palier,
 *                                          résiliation programmée, ET les échecs
 *                                          de paiement (`past_due` / `unpaid`)
 *   • `customer.subscription.deleted`   — fin effective
 *
 * Tout autre événement → 200 `{ ignored: true }`. Un webhook qui répond en
 * erreur est retenté par Stripe, indéfiniment : ne jamais échouer sur ce qu'on
 * a simplement choisi de ne pas traiter. Même règle que `prac-notify`, dont le
 * filtrage vit lui aussi dans la fonction et pas dans le déclencheur.
 *
 * `runtime = 'nodejs'` : la vérification de signature et le SDK Stripe ont
 * besoin des API Node.
 */
export const runtime = 'nodejs'

/**
 * ⚠️ Le corps doit être lu BRUT (`request.text()`), jamais `request.json()`.
 *
 * La signature Stripe porte sur les octets exacts du corps. Passer par un parse
 * JSON puis un re-`stringify` change l'ordre des clés et l'échappement : la
 * signature ne correspond plus, et toutes les livraisons sont rejetées. C'est
 * le piège n°1 de cette intégration, et il se manifeste par un webhook qui
 * « ne marche pas » sans autre symptôme qu'un 400.
 */
async function readEvent(request: NextRequest): Promise<Stripe.Event> {
  const signature = request.headers.get('stripe-signature')
  if (!signature) throw new Error('signature absente')

  const raw = await request.text()
  const stripe = getStripe()

  // `constructEventAsync` et non `constructEvent` : la variante synchrone exige
  // un `CryptoProvider` node natif, l'asynchrone marche partout (Node, Edge,
  // workers). Aucune raison de dépendre du runtime pour vérifier une signature.
  return stripe.webhooks.constructEventAsync(
    raw,
    signature,
    requireEnv('STRIPE_WEBHOOK_SECRET'),
  )
}

/** Un identifiant Stripe est soit une chaîne, soit l'objet étendu. */
function idOf(ref: string | { id: string } | null | undefined): string | null {
  if (!ref) return null
  return typeof ref === 'string' ? ref : ref.id
}

/**
 * À quel compte Wyrm Forge appartient cet abonnement ?
 *
 * Trois sources, essayées dans cet ordre — elles ne sont PAS interchangeables :
 *
 *  1. `metadata.user_id` de l'abonnement — posé par la route de checkout via
 *     `subscription_data.metadata`. Survit à tous les `customer.subscription.*`,
 *     y compris déclenchés depuis le Dashboard Stripe.
 *  2. `client_reference_id` de la session — n'existe QUE sur
 *     `checkout.session.completed`, mais y est le plus fiable.
 *  3. La table `stripe_subscriptions`, par `stripe_customer_id` — le seul
 *     recours pour un abonnement créé HORS de notre parcours (créé à la main
 *     dans le Dashboard, ou migré), qui n'a aucune métadonnée à nous.
 *
 * `null` si aucune ne répond : l'événement est alors acquitté sans effet plutôt
 * que d'écrire un palier sur un compte deviné.
 */
async function resolveUserId(
  admin: ReturnType<typeof createAdminClient>,
  fromMetadata: string | null,
  customerId: string | null,
): Promise<string | null> {
  if (fromMetadata) return fromMetadata
  if (!customerId) return null

  const { data, error } = await admin
    .from('stripe_subscriptions')
    .select('user_id')
    .eq('stripe_customer_id', customerId)
    .maybeSingle()

  if (error) {
    console.error('[stripe/webhook] lookup user_id:', error.message)
    return null
  }
  return data?.user_id ?? null
}

/**
 * Fin de la période payée.
 *
 * ⚠️ Depuis l'API 2025-xx, `current_period_end` N'EST PLUS sur l'objet
 * `Subscription` : Stripe l'a descendu sur chaque `SubscriptionItem`. Lire
 * `subscription.current_period_end` renvoie donc `undefined` — silencieusement,
 * puisque le champ n'existe simplement plus au typage. On prend le maximum des
 * items : un abonnement à article unique (notre cas) donne trivialement la
 * bonne valeur, et un futur abonnement multi-articles donne la date jusqu'à
 * laquelle l'accès est réellement payé.
 */
function periodEndOf(subscription: Stripe.Subscription): string | null {
  const ends = subscription.items?.data
    ?.map(item => item.current_period_end)
    .filter((v): v is number => typeof v === 'number' && v > 0)

  if (!ends || ends.length === 0) return null
  return unixToIso(Math.max(...ends))
}

/** Le palier acheté, déduit du prix souscrit — et à défaut des métadonnées. */
function tierOf(subscription: Stripe.Subscription): string | null {
  const priceId = idOf(subscription.items?.data?.[0]?.price)
  const plan = planForPriceId(priceId, priceEnv())
  if (plan) return TIER_BY_PLAN[plan]

  // Repli : un prix hors catalogue (créé au Dashboard sans variable
  // d'environnement) mais dont l'abonnement porte encore nos métadonnées.
  // Ne devine jamais — relit ce que la route de checkout a écrit.
  const fromMeta = subscription.metadata?.tier
  return fromMeta && fromMeta.trim().length > 0 ? fromMeta.trim() : null
}

/**
 * Applique un abonnement : une seule écriture, atomique, via la RPC.
 *
 * ⚠️ Jamais un `.from('profiles').update({ tier })` : le `service_role`
 * passerait, et court-circuiterait du même coup la garde d'ordre des événements
 * et l'exclusion des admins, toutes deux portées par la fonction SQL.
 */
async function applySubscription(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  subscription: Stripe.Subscription,
  eventCreated: number,
) {
  const customerId = idOf(subscription.customer)
  if (!customerId) {
    console.error('[stripe/webhook] abonnement sans client', { id: subscription.id })
    return { applied: false, reason: 'no_customer' }
  }

  const priceId          = idOf(subscription.items?.data?.[0]?.price)
  const tier             = tierOf(subscription)
  const currentPeriodEnd = periodEndOf(subscription)
  const status           = subscription.status

  // Un statut hors des huit documentés par Stripe conserve l'accès (voir
  // `resolveTierOutcome`) mais mérite d'être vu : c'est le signal que Stripe a
  // fait évoluer son modèle et que la politique doit être relue.
  if (!isKnownStatus(status)) {
    console.error('[stripe/webhook] statut Stripe INCONNU — politique à relire', {
      status, subscription_id: subscription.id,
    })
  }

  if (isPaymentIssue(status)) {
    console.warn('[stripe/webhook] incident de paiement', {
      status, user_id: userId, subscription_id: subscription.id,
      // `past_due` conserve le palier (Stripe relance), `unpaid` le retire.
      acces_conserve: status === 'past_due',
    })
  }

  const outcome = resolveTierOutcome({ status, tier, currentPeriodEnd })

  const { data, error } = await admin.rpc('stripe_apply_subscription_event', {
    p_user_id:              userId,
    p_customer_id:          customerId,
    p_subscription_id:      subscription.id,
    p_status:               status,
    p_price_id:             priceId,
    p_tier:                 tier,
    p_current_period_end:   currentPeriodEnd,
    p_cancel_at_period_end: subscription.cancel_at_period_end ?? false,
    p_effective_tier:       outcome.tier,
    p_effective_expires_at: outcome.expiresAt,
    // Le `created` de l'ÉVÉNEMENT, pas `now()` : c'est lui qui ordonne des
    // livraisons que Stripe ne garantit pas dans l'ordre.
    p_event_at:             unixToIso(eventCreated),
  })

  if (error) {
    // Erreur DB : on remonte pour répondre 500 → Stripe retentera, et la garde
    // d'ordre rendra le rejeu inoffensif.
    throw new Error(`rpc stripe_apply_subscription_event: ${error.message}`)
  }

  console.log('[stripe/webhook] abonnement appliqué', {
    user_id: userId,
    status,
    tier_effectif: outcome.tier,
    periode: periodForPriceId(priceId, priceEnv()),
    resultat: data,
  })

  return data
}

export async function POST(request: NextRequest) {
  // ── 1. Signature ───────────────────────────────────────────────────────────
  //
  // C'est LA barrière de cette route : elle est publique par nécessité (Stripe
  // doit pouvoir l'appeler sans compte). Sans vérification, n'importe qui
  // POSTerait un `customer.subscription.updated` fabriqué et s'offrirait Maître.
  // Même rôle que le `X-Internal-Token` de `prac-notify`, en plus solide : la
  // signature couvre le corps, pas seulement l'appelant.
  let event: Stripe.Event
  try {
    event = await readEvent(request)
  } catch (err) {
    console.error('[stripe/webhook] signature invalide:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'invalid_signature' }, { status: 400 })
  }

  const admin = createAdminClient()
  const stripe = getStripe()

  try {
    switch (event.type) {
      // ── Souscription initiale ────────────────────────────────────────────
      case 'checkout.session.completed': {
        const session = event.data.object

        // Une session `payment` (le futur Kit sur mesure, lot 4) passera par le
        // même webhook : elle n'a pas d'abonnement et n'a rien à faire ici.
        if (session.mode !== 'subscription') {
          return NextResponse.json({ ignored: true, reason: 'not_a_subscription' })
        }

        const subscriptionId = idOf(session.subscription)
        if (!subscriptionId) {
          console.error('[stripe/webhook] checkout sans abonnement', { id: session.id })
          return NextResponse.json({ ignored: true, reason: 'no_subscription' })
        }

        // La session ne porte qu'une référence : on relit l'abonnement pour
        // avoir le statut et la fin de période FAISANT AUTORITÉ, plutôt que de
        // les déduire du fait qu'un paiement a abouti.
        const subscription = await stripe.subscriptions.retrieve(subscriptionId)

        const userId = await resolveUserId(
          admin,
          session.client_reference_id
            ?? session.metadata?.user_id
            ?? subscription.metadata?.user_id
            ?? null,
          idOf(session.customer) ?? idOf(subscription.customer),
        )

        if (!userId) {
          // Acquitté sans effet : réessayer ne ferait pas apparaître l'identité
          // manquante, et un 500 ferait boucler Stripe sur un cas insoluble.
          console.error('[stripe/webhook] compte introuvable', { session: session.id })
          return NextResponse.json({ ignored: true, reason: 'user_not_resolved' })
        }

        const result = await applySubscription(admin, userId, subscription, event.created)
        return NextResponse.json({ received: true, result })
      }

      // ── Cycle de vie : renouvellement, changement, impayé, résiliation ────
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const subscription = event.data.object

        const userId = await resolveUserId(
          admin,
          subscription.metadata?.user_id ?? null,
          idOf(subscription.customer),
        )

        if (!userId) {
          console.error('[stripe/webhook] compte introuvable', { subscription: subscription.id })
          return NextResponse.json({ ignored: true, reason: 'user_not_resolved' })
        }

        // `deleted` : Stripe livre l'objet avec `status: 'canceled'`, donc
        // `resolveTierOutcome` le révoque sans traitement particulier ici. On
        // ne force PAS le statut à la main — si Stripe livrait un jour autre
        // chose, la politique doit voir la vraie valeur, pas la nôtre.
        const result = await applySubscription(admin, userId, subscription, event.created)
        return NextResponse.json({ received: true, result })
      }

      default:
        return NextResponse.json({ ignored: true, reason: 'unhandled_event' })
    }
  } catch (err) {
    // 500 → Stripe retentera. C'est le comportement voulu pour une panne DB ou
    // réseau : la garde d'ordre (`last_event_at`) rend le rejeu inoffensif, et
    // `ON CONFLICT` rend l'écriture idempotente.
    console.error('[stripe/webhook]', event.type, err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'webhook_failed' }, { status: 500 })
  }
}
