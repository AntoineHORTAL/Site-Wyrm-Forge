/**
 * Événement Stripe → e-mails d'abonnement à DÉPOSER dans la file
 * `subscription_emails` (migration 20260911000004). Côté site uniquement : le
 * webhook décide QUOI envoyer et QUAND ; l'Edge Function `subscription-emails`
 * envoie. Module PUR (aucun SDK, aucun `process.env`), testé.
 *
 * ⚠️ Ce module ne doit JAMAIS pouvoir faire échouer le webhook : les
 * constructeurs renvoient `null` plutôt que de lever sur une donnée manquante,
 * et `enqueueSafely` avale toute erreur de dépôt (journalisée, jamais relancée).
 * Un paiement ou une résiliation déjà enregistrés ne sont pas remis en cause
 * par un e-mail.
 *
 * Les gabarits, le calendrier légal du rappel et le traitement de la file vivent
 * dans `supabase/functions/_shared/subscription-emails.ts` (module pur partagé
 * avec l'Edge Function) : un seul calcul de la date d'envoi pour les deux côtés.
 */

import {
  reminderWindow,
  type BillingPeriod,
  type CancellationPayload,
  type EmailKind,
  type EmailPayload,
  type OrderConfirmationPayload,
  type RenewalReminderPayload,
} from '../../../supabase/functions/_shared/subscription-emails'

export interface EmailIntent {
  kind: EmailKind
  /** Clé d'idempotence — un événement Stripe rejoué produit la MÊME clé. */
  dedupKey: string
  userId: string
  subscriptionId: string
  payload: EmailPayload
  /** Pas d'envoi avant (ISO). */
  notBefore: string
}

/** Intervalle Stripe → vocabulaire métier. */
export function periodFromInterval(interval: string | null | undefined): BillingPeriod | null {
  if (interval === 'month') return 'mensuel'
  if (interval === 'year') return 'annuel'
  return null
}

/* ── 1. Confirmation de commande (L221-13) ─────────────────────────────────── */

export function orderConfirmationIntent(i: {
  userId: string
  subscriptionId: string
  tier: string | null
  period: BillingPeriod | null
  amountPaidCents: number | null
  listPriceCents: number | null
  currency: string | null
  firstChargeAt: string
  nextRenewalAt: string | null
  consentId: string | null
}): EmailIntent | null {
  if (!i.tier || !i.period || i.listPriceCents == null || !i.currency) return null
  const payload: OrderConfirmationPayload = {
    tier: i.tier,
    period: i.period,
    amount_paid_cents: i.amountPaidCents ?? i.listPriceCents,
    list_price_cents: i.listPriceCents,
    currency: i.currency,
    first_charge_at: i.firstChargeAt,
    next_renewal_at: i.nextRenewalAt,
    consent_id: i.consentId,
  }
  return {
    kind: 'order_confirmation',
    // Une confirmation par abonnement : `checkout.session.completed` rejoué ⇒ même clé.
    dedupKey: `order:${i.subscriptionId}`,
    userId: i.userId,
    subscriptionId: i.subscriptionId,
    payload,
    notBefore: i.firstChargeAt,
  }
}

/* ── 2. Confirmation de résiliation (L215-1-1) ─────────────────────────────── */

/**
 * La résiliation est-elle programmée sur cet objet abonnement ? Deux formes
 * selon la version d'API et l'origine (portail, API, Dashboard) :
 * `cancel_at_period_end: true`, ou une date `cancel_at`.
 */
export function isCancellationScheduled(s: { cancel_at_period_end?: boolean | null; cancel_at?: number | null }): boolean {
  return s.cancel_at_period_end === true || (typeof s.cancel_at === 'number' && s.cancel_at > 0)
}

/**
 * L'était-elle AVANT cet événement ? Lu dans `previous_attributes`, qui ne
 * contient QUE les champs modifiés : absence des deux champs ⇒ `undefined`, la
 * résiliation n'a pas bougé et il n'y a rien à confirmer.
 */
export function wasCancellationScheduled(prev: Record<string, unknown> | null | undefined): boolean | undefined {
  if (!prev) return undefined
  const hasFlag = Object.prototype.hasOwnProperty.call(prev, 'cancel_at_period_end')
  const hasDate = Object.prototype.hasOwnProperty.call(prev, 'cancel_at')
  if (!hasFlag && !hasDate) return undefined
  return isCancellationScheduled({
    cancel_at_period_end: hasFlag ? (prev.cancel_at_period_end as boolean | null) : false,
    cancel_at: hasDate ? (prev.cancel_at as number | null) : null,
  })
}

/**
 * Moment retenu : `customer.subscription.updated` où la résiliation PASSE à
 * programmée — le plus tôt qui confirme la demande prise en compte (et non
 * `customer.subscription.deleted`, qui n'arrive qu'à la fin de la période).
 */
export function cancellationIntent(i: {
  userId: string
  subscriptionId: string
  eventId: string
  tier: string | null
  period: BillingPeriod | null
  scheduledNow: boolean
  scheduledBefore: boolean | undefined
  accessUntil: string | null
  requestedAt: string
}): EmailIntent | null {
  if (!i.scheduledNow || i.scheduledBefore !== false) return null
  if (!i.tier || !i.accessUntil) return null
  const payload: CancellationPayload = {
    tier: i.tier,
    period: i.period,
    access_until: i.accessUntil,
    requested_at: i.requestedAt,
  }
  return {
    kind: 'cancellation_confirmation',
    // Par ÉVÉNEMENT : un rejeu (même id) ne renvoie rien ; une nouvelle demande
    // après réactivation (autre événement) est confirmée à nouveau.
    dedupKey: `cancel:${i.subscriptionId}:${i.eventId}`,
    userId: i.userId,
    subscriptionId: i.subscriptionId,
    payload,
    notBefore: i.requestedAt,
  }
}

/* ── 3. Rappel avant reconduction annuelle (L215-1) ────────────────────────── */

const LIVE_STATUSES = new Set(['active', 'trialing', 'past_due'])

/**
 * Programmé dès que l'on connaît l'échéance d'un abonnement ANNUEL vivant et non
 * résilié — à la souscription, puis à chaque renouvellement (nouvelle échéance ⇒
 * nouvelle clé ⇒ un rappel par cycle). La date d'envoi vient de
 * `reminderWindow` (un mois calendaire + 15 jours avant l'échéance) ; l'Edge
 * Function revérifie l'abonnement au moment d'envoyer.
 */
export function renewalReminderIntent(i: {
  userId: string
  subscriptionId: string
  tier: string | null
  period: BillingPeriod | null
  status: string | null
  scheduledCancellation: boolean
  renewalAt: string | null
  amountCents: number | null
  currency: string | null
  amountIsEstimate: boolean
}): EmailIntent | null {
  if (i.period !== 'annuel' || i.scheduledCancellation) return null
  if (!LIVE_STATUSES.has(i.status?.trim().toLowerCase() ?? '')) return null
  if (!i.tier || !i.renewalAt || i.amountCents == null || !i.currency) return null

  const payload: RenewalReminderPayload = {
    tier: i.tier,
    period: 'annuel',
    renewal_at: i.renewalAt,
    amount_cents: i.amountCents,
    currency: i.currency,
    amount_is_estimate: i.amountIsEstimate,
  }
  return {
    kind: 'renewal_reminder',
    dedupKey: `renewal:${i.subscriptionId}:${i.renewalAt}`,
    userId: i.userId,
    subscriptionId: i.subscriptionId,
    payload,
    notBefore: reminderWindow(new Date(i.renewalAt)).sendAt.toISOString(),
  }
}

/* ── Dépôt, sans jamais lever ──────────────────────────────────────────────── */

export interface EnqueueReport {
  enqueued: { dedupKey: string; result: string }[]
  failed: { dedupKey: string; error: string }[]
}

/**
 * Dépose chaque intention, isolément. NE LÈVE JAMAIS : une erreur de dépôt est
 * rapportée (et journalisée par l'appelant), elle ne remonte pas au webhook,
 * qui répond 200 à Stripe comme si de rien n'était — l'abonnement, lui, est
 * déjà enregistré.
 */
export async function enqueueSafely(
  intents: (EmailIntent | null)[],
  enqueue: (intent: EmailIntent) => Promise<string>,
): Promise<EnqueueReport> {
  const report: EnqueueReport = { enqueued: [], failed: [] }
  for (const intent of intents) {
    if (!intent) continue
    try {
      report.enqueued.push({ dedupKey: intent.dedupKey, result: await enqueue(intent) })
    } catch (e) {
      report.failed.push({ dedupKey: intent.dedupKey, error: e instanceof Error ? e.message : String(e) })
    }
  }
  return report
}
