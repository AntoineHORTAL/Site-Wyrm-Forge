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
import {
  shouldStopBillingForDeletedAccount,
  cancelAndDiscardRenewal,
} from '@/lib/stripe/account-deletion'
import {
  cancellationIntent,
  enqueueSafely,
  isCancellationScheduled,
  orderConfirmationIntent,
  periodFromInterval,
  renewalReminderIntent,
  wasCancellationScheduled,
  type EmailIntent,
} from '@/lib/stripe/subscription-emails'

/** La RPC a-t-elle appliqué l'événement ? Faux seulement pour un événement périmé ou sans client. */
function isApplied(result: unknown): boolean {
  return (result as { applied?: boolean } | null)?.applied !== false
}

/**
 * Réception des événements Stripe — le SEUL endroit qui fait changer un palier.
 *
 * Événements traités :
 *   • `checkout.session.completed`      — l'abonnement vient d'être souscrit
 *   • `customer.subscription.updated`   — renouvellement, changement de palier,
 *                                          résiliation programmée, ET les échecs
 *                                          de paiement (`past_due` / `unpaid`)
 *   • `customer.subscription.deleted`   — fin effective
 *   • `invoice.created`                 — FILET « compte supprimé » uniquement
 *                                          (voir `stopBillingForDeletedAccount`)
 *
 * E-mails d'abonnement (confirmation de commande, de résiliation, rappel de
 * reconduction annuelle) : cette route ne fait que les METTRE EN FILE, après
 * l'enregistrement, sans jamais pouvoir échouer à cause d'eux — voir
 * `queueSubscriptionEmails`. L'envoi est fait par l'EF `subscription-emails`.
 *
 * ⚠️ `invoice.created` doit être COCHÉ dans la configuration de l'endpoint
 * (Dashboard Stripe → Developers → Webhooks), en test ET en live. Sans lui, le
 * filet ne voit la facture de renouvellement qu'une fois prélevée.
 *
 * Tout autre événement → 200 `{ ignored: true }`. Un webhook qui répond en
 * erreur est retenté par Stripe, indéfiniment : ne jamais échouer sur ce qu'on
 * a simplement choisi de ne pas traiter. Le filtrage vit donc dans la fonction,
 * pas dans le déclencheur.
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

/** Le profil existe-t-il encore ? Une erreur de lecture REMONTE (500 → rejeu Stripe). */
async function profileExists(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
): Promise<boolean> {
  const { data, error } = await admin.from('profiles').select('id').eq('id', userId).maybeSingle()
  if (error) throw new Error(`lecture profiles: ${error.message}`)
  return data !== null
}

/**
 * FILET « COMPTE SUPPRIMÉ » — un compte qui n'existe plus ne doit plus jamais
 * être prélevé.
 *
 * La demande de suppression passe normalement par `/api/account/deletion-request`,
 * qui programme la fin de l'abonnement AVANT d'enregistrer la demande. Ce filet
 * couvre tout le reste : suppression faite à la main dans le Dashboard Supabase,
 * compte supprimé avant la mise en place de cette route, etc. Résiliation
 * IMMÉDIATE : il n'y a plus de compte auquel conserver un accès.
 *
 * Il répare aussi une boucle : sans lui, un événement pour un compte supprimé
 * faisait échouer la RPC sur la clé étrangère `profiles`, donc un 500, donc un
 * rejeu Stripe pendant trois jours.
 *
 * Renvoie la réponse à donner à Stripe, ou `null` si le compte existe (suite
 * normale du traitement).
 */
async function stopBillingForDeletedAccount(
  admin: ReturnType<typeof createAdminClient>,
  stripe: Stripe,
  userId: string,
  subscription: { id: string; status: string | null },
): Promise<NextResponse | null> {
  const exists = await profileExists(admin, userId)
  if (exists) return null

  if (shouldStopBillingForDeletedAccount({ userId, profileExists: exists, status: subscription.status })) {
    await stripe.subscriptions.cancel(subscription.id, { invoice_now: false, prorate: false })
    console.warn('[stripe/webhook] compte supprimé — abonnement résilié immédiatement', {
      user_id: userId, subscription_id: subscription.id,
    })
    return NextResponse.json({ handled: true, reason: 'account_deleted', canceled: true })
  }
  return NextResponse.json({ ignored: true, reason: 'account_deleted', canceled: false })
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

/**
 * Met en file les e-mails d'abonnement que cet événement appelle — APRÈS
 * l'enregistrement de l'abonnement, et sans JAMAIS pouvoir le remettre en cause.
 *
 * ⚠️ Ne lève jamais, par construction : tout est dans un try/catch, et le dépôt
 * passe par `enqueueSafely`. Un e-mail qui ne peut pas être mis en file est
 * journalisé en `console.error` (à envoyer à la main), et le webhook répond 200
 * comme d'habitude. L'ENVOI, lui, n'a pas lieu ici : l'Edge Function
 * `subscription-emails` s'en charge, dans un autre processus.
 *
 *  • `checkout.session.completed`                → confirmation de commande (L221-13)
 *  • `customer.subscription.updated`, résiliation
 *    qui PASSE à programmée                      → confirmation de résiliation (L215-1-1)
 *  • tout événement d'un abonnement ANNUEL vivant → rappel de reconduction programmé (L215-1)
 */
async function queueSubscriptionEmails(
  admin: ReturnType<typeof createAdminClient>,
  stripe: Stripe,
  args: {
    event: Stripe.Event
    userId: string
    subscription: Stripe.Subscription
    session?: Stripe.Checkout.Session
    /** Faux si l'événement était périmé (garde d'ordre) : pas de confirmation de résiliation. */
    applied: boolean
  },
): Promise<void> {
  const { event, userId, subscription, session, applied } = args
  try {
    const item      = subscription.items?.data?.[0]
    const price     = item?.price && typeof item.price === 'object' ? item.price : null
    const listPrice = price?.unit_amount != null ? price.unit_amount * (item?.quantity ?? 1) : null
    const currency  = price?.currency ?? null
    const period    = periodFromInterval(price?.recurring?.interval)
      ?? (periodForPriceId(idOf(item?.price), priceEnv()) as 'mensuel' | 'annuel' | null)
    const tier      = tierOf(subscription)
    const renewalAt = periodEndOf(subscription)
    const cancelled = isCancellationScheduled(subscription)

    const intents: (EmailIntent | null)[] = []

    if (session) {
      intents.push(orderConfirmationIntent({
        userId, subscriptionId: subscription.id, tier, period,
        amountPaidCents: session.amount_total ?? null,
        listPriceCents: listPrice,
        currency: session.currency ?? currency,
        firstChargeAt: unixToIso(event.created) ?? new Date().toISOString(),
        nextRenewalAt: renewalAt,
        consentId: session.metadata?.consent_id ?? subscription.metadata?.consent_id ?? null,
      }))
    }

    if (event.type === 'customer.subscription.updated' && applied) {
      const previous = (event.data as { previous_attributes?: Record<string, unknown> }).previous_attributes
      intents.push(cancellationIntent({
        userId, subscriptionId: subscription.id, eventId: event.id, tier, period,
        scheduledNow: cancelled,
        scheduledBefore: wasCancellationScheduled(previous),
        accessUntil: unixToIso(subscription.cancel_at ?? null) ?? renewalAt,
        requestedAt: unixToIso(event.created) ?? new Date().toISOString(),
      }))
    }

    if (period === 'annuel' && !cancelled && renewalAt) {
      // Montant de la PROCHAINE facture, remises comprises — aperçu Stripe. En
      // cas d'échec, repli sur le prix catalogue, signalé comme estimation.
      let amount = listPrice
      let amountCurrency = currency
      let estimate = true
      try {
        const preview = await stripe.invoices.createPreview({ subscription: subscription.id })
        amount = preview.amount_due
        amountCurrency = preview.currency
        estimate = false
      } catch (e) {
        console.warn('[stripe/webhook] aperçu de facture indisponible — montant du rappel estimé', {
          subscription_id: subscription.id, error: e instanceof Error ? e.message : e,
        })
      }
      intents.push(renewalReminderIntent({
        userId, subscriptionId: subscription.id, tier, period,
        status: subscription.status, scheduledCancellation: cancelled,
        renewalAt, amountCents: amount, currency: amountCurrency, amountIsEstimate: estimate,
      }))
    }

    const report = await enqueueSafely(intents, async (intent) => {
      const { data, error } = await admin.rpc('enqueue_subscription_email', {
        p_user_id:         intent.userId,
        p_subscription_id: intent.subscriptionId,
        p_kind:            intent.kind,
        p_dedup_key:       intent.dedupKey,
        p_payload:         intent.payload,
        p_not_before:      intent.notBefore,
      })
      if (error) throw new Error(error.message)
      return String(data)
    })

    if (report.failed.length > 0) {
      console.error('[stripe/webhook] e-mail NON mis en file — obligation légale à traiter À LA MAIN', {
        user_id: userId, subscription_id: subscription.id, failed: report.failed,
      })
    } else if (report.enqueued.length > 0) {
      console.log('[stripe/webhook] e-mails mis en file', { subscription_id: subscription.id, enqueued: report.enqueued })
    }
  } catch (e) {
    console.error('[stripe/webhook] préparation des e-mails en échec — abonnement NON affecté', {
      subscription_id: subscription.id, error: e instanceof Error ? e.message : e,
    })
  }
}

export async function POST(request: NextRequest) {
  // ── 1. Signature ───────────────────────────────────────────────────────────
  //
  // C'est LA barrière de cette route : elle est publique par nécessité (Stripe
  // doit pouvoir l'appeler sans compte). Sans vérification, n'importe qui
  // POSTerait un `customer.subscription.updated` fabriqué et s'offrirait Maître.
  // La signature couvre le CORPS, et pas seulement l'appelant : un jeton partagé
  // en en-tête authentifierait l'expéditeur sans garantir que la charge utile
  // n'a pas été réécrite en route.
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

        // Compte supprimé pendant le paiement : l'abonnement est coupé, mais le
        // premier paiement, lui, est passé — à rembourser À LA MAIN (log dédié).
        const deleted = await stopBillingForDeletedAccount(admin, stripe, userId, subscription)
        if (deleted) {
          console.error('[stripe/webhook] paiement reçu pour un compte supprimé — REMBOURSEMENT MANUEL', {
            user_id: userId, session: session.id,
          })
          return deleted
        }

        const result = await applySubscription(admin, userId, subscription, event.created)
        // APRÈS l'enregistrement ; ne lève jamais (voir `queueSubscriptionEmails`).
        await queueSubscriptionEmails(admin, stripe, {
          event, userId, subscription, session, applied: isApplied(result),
        })
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

        const deleted = await stopBillingForDeletedAccount(admin, stripe, userId, subscription)
        if (deleted) return deleted

        // `deleted` : Stripe livre l'objet avec `status: 'canceled'`, donc
        // `resolveTierOutcome` le révoque sans traitement particulier ici. On
        // ne force PAS le statut à la main — si Stripe livrait un jour autre
        // chose, la politique doit voir la vraie valeur, pas la nôtre.
        const result = await applySubscription(admin, userId, subscription, event.created)
        // APRÈS l'enregistrement ; ne lève jamais (voir `queueSubscriptionEmails`).
        await queueSubscriptionEmails(admin, stripe, {
          event, userId, subscription, applied: isApplied(result),
        })
        return NextResponse.json({ received: true, result })
      }

      // ── Filet : facture de renouvellement d'un compte SUPPRIMÉ ─────────────
      //
      // Stripe crée la facture de renouvellement en BROUILLON et attend la
      // réponse des webhooks `invoice.created` avant de la finaliser et de
      // prélever. C'est le dernier moment où l'on peut encore empêcher le
      // prélèvement. On ne traite QUE ce cas : pour un compte qui existe, rien
      // à faire ici, les `customer.subscription.*` suivront.
      case 'invoice.created': {
        const invoice = event.data.object
        const details = invoice.parent?.subscription_details
        if (!details || invoice.status !== 'draft') {
          return NextResponse.json({ ignored: true, reason: 'not_a_draft_subscription_invoice' })
        }

        const subscriptionId = idOf(details.subscription)
        const userId = await resolveUserId(
          admin, details.metadata?.user_id ?? null, idOf(invoice.customer),
        )
        if (!subscriptionId || !userId) {
          return NextResponse.json({ ignored: true, reason: 'user_not_resolved' })
        }

        if (await profileExists(admin, userId)) {
          return NextResponse.json({ ignored: true, reason: 'account_active' })
        }

        // Statut réel de l'abonnement, relu : la facture n'en porte pas.
        const subscription = await stripe.subscriptions.retrieve(subscriptionId)
        if (!shouldStopBillingForDeletedAccount({ userId, profileExists: false, status: subscription.status })) {
          return NextResponse.json({ ignored: true, reason: 'account_deleted', canceled: false })
        }

        // Geste partagé avec le smoke test Stripe (`account-deletion.ts`) :
        // résilier, puis figer le brouillon (Stripe refuse de SUPPRIMER une
        // facture d'abonnement) ou annuler une facture déjà finalisée.
        const outcome = await cancelAndDiscardRenewal(stripe, subscriptionId, invoice.id!)
        if (outcome === 'paid') {
          console.error('[stripe/webhook] facture PAYÉE pour un compte supprimé — REMBOURSEMENT MANUEL', {
            user_id: userId, invoice: invoice.id,
          })
        }
        console.warn('[stripe/webhook] compte supprimé — renouvellement coupé', {
          user_id: userId, subscription_id: subscriptionId, invoice: invoice.id, outcome,
        })
        return NextResponse.json({ handled: true, reason: 'account_deleted', canceled: true, invoice: outcome })
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
