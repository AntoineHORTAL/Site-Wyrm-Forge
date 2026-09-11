/**
 * Suppression de compte ⇄ abonnement Stripe — un compte supprimé ne doit plus
 * JAMAIS être prélevé.
 *
 * Module PUR (aucun SDK, aucun `process.env`), comme `plans.ts` et
 * `checkout-consent.ts` : les effets Stripe et Supabase sont INJECTÉS par les
 * routes, ce qui permet de tester l'ordre et les décisions sans réseau.
 *
 * ════════════════════════════════════════════════════════════════════════════
 *  LE PROBLÈME
 * ════════════════════════════════════════════════════════════════════════════
 * Supprimer un compte efface `stripe_subscriptions` par CASCADE, mais ne touche
 * pas à Stripe : l'abonnement continuait d'y vivre, et d'être renouvelé. Et il
 * n'existe AUCUN code de suppression — la personne dépose une demande
 * (`deletion_requests`), la suppression effective est faite à la main.
 *
 * ════════════════════════════════════════════════════════════════════════════
 *  LA RÉPONSE — deux étages
 * ════════════════════════════════════════════════════════════════════════════
 *  1. À LA DEMANDE (`/api/account/deletion-request`) — décision HORTAL du
 *     2026-09-11 : résiliation en FIN DE PÉRIODE (`cancel_at_period_end`).
 *     Aucun prélèvement futur, l'accès payé court jusqu'à l'échéance (ou
 *     jusqu'à la suppression effective si elle vient avant), pas de
 *     remboursement. Stripe est traité AVANT l'enregistrement de la demande :
 *     si Stripe échoue, la demande n'est pas enregistrée. L'ordre inverse
 *     laisserait exister une demande « acceptée » avec un abonnement qui se
 *     renouvelle encore.
 *     Si la personne annule ensuite sa demande, l'abonnement RESTE résilié :
 *     le réactiver automatiquement pourrait relancer un prélèvement qu'elle
 *     n'attend plus. Elle peut le réactiver elle-même depuis le portail.
 *
 *  2. FILET, dans le webhook — pour tout compte supprimé SANS passer par la
 *     demande (suppression manuelle au Dashboard Supabase, compte d'équipe…) :
 *     tout événement Stripe qui concerne un compte dont le profil n'existe plus
 *     résilie l'abonnement immédiatement ; une facture de renouvellement encore
 *     en brouillon (`invoice.created`) est figée avant d'être prélevée.
 */

/** Ce que la décision a besoin de savoir d'un abonnement Stripe. */
export interface SubscriptionLite {
  id: string
  status: string
  cancel_at_period_end: boolean | null
}

/**
 *  • `schedule`   — `cancel_at_period_end: true` : plus de renouvellement,
 *                   l'accès déjà payé court jusqu'à l'échéance.
 *  • `cancel_now` — résiliation immédiate : rien n'a été encaissé pour la
 *                   période (`incomplete`) ou l'abonnement ne facture plus
 *                   (`paused`), il n'y a donc aucun accès payé à préserver.
 *  • `skip`       — déjà terminé, ou déjà programmé pour s'arrêter.
 */
export type DeletionAction = 'schedule' | 'cancel_now' | 'skip'

const ENDED = new Set(['canceled', 'incomplete_expired'])
const CANCEL_NOW = new Set(['incomplete', 'paused'])

export function deletionActionFor(sub: SubscriptionLite): DeletionAction {
  const status = sub.status?.trim().toLowerCase() ?? ''
  if (ENDED.has(status)) return 'skip'
  if (CANCEL_NOW.has(status)) return 'cancel_now'
  if (sub.cancel_at_period_end === true) return 'skip'
  // active, trialing, past_due, unpaid… ET tout statut inconnu : programmer la
  // fin est le choix sûr — il supprime tout renouvellement futur sans couper
  // un accès peut-être déjà payé.
  //
  // ⚠️ `past_due` : `cancel_at_period_end` n'annule PAS la relance de la
  // facture DÉJÀ échue, qui porte sur la période en cours (consommée). Ce
  // prélèvement-là reste dû ; aucun prélèvement FUTUR n'aura lieu.
  return 'schedule'
}

/** Dédoublonne par identifiant — deux sources (table + recherche Stripe) peuvent se recouper. */
export function uniqueSubscriptions<T extends { id: string }>(lists: T[][]): T[] {
  const seen = new Map<string, T>()
  for (const list of lists) for (const s of list) if (!seen.has(s.id)) seen.set(s.id, s)
  return [...seen.values()]
}

export type StopBillingResult =
  | { ok: true; scheduled: string[]; canceled: string[] }
  /**
   * `stage: 'stripe'` — Stripe a échoué : la demande N'EST PAS enregistrée.
   *                     Les abonnements déjà traités avant l'échec restent
   *                     traités (on ne réactive jamais un prélèvement).
   * `stage: 'record'` — Stripe a abouti, l'enregistrement de la demande non :
   *                     plus aucun prélèvement futur, mais pas de demande.
   */
  | { ok: false; stage: 'stripe' | 'record'; scheduled: string[]; canceled: string[]; error: unknown }

/**
 * Arrête la facturation, PUIS enregistre la demande de suppression — dans cet
 * ordre, et la seconde étape n'a lieu que si la première a entièrement abouti.
 */
export async function stopBillingThenRecordDeletion<R>(deps: {
  /** Tous les abonnements rattachables au compte (table ET recherche Stripe). */
  findSubscriptions: () => Promise<SubscriptionLite[]>
  schedule: (subscriptionId: string) => Promise<void>
  cancelNow: (subscriptionId: string) => Promise<void>
  recordRequest: () => Promise<R>
}): Promise<StopBillingResult & { record?: R }> {
  const scheduled: string[] = []
  const canceled: string[] = []

  try {
    const subs = await deps.findSubscriptions()
    // Séquentiel et pas `Promise.all` : au premier échec on s'arrête, et on
    // sait exactement ce qui a été fait.
    for (const sub of subs) {
      const action = deletionActionFor(sub)
      if (action === 'schedule') { await deps.schedule(sub.id); scheduled.push(sub.id) }
      else if (action === 'cancel_now') { await deps.cancelNow(sub.id); canceled.push(sub.id) }
    }
  } catch (error) {
    return { ok: false, stage: 'stripe', scheduled, canceled, error }
  }

  try {
    const record = await deps.recordRequest()
    return { ok: true, scheduled, canceled, record }
  } catch (error) {
    return { ok: false, stage: 'record', scheduled, canceled, error }
  }
}

/**
 * Sous-ensemble du client Stripe dont le filet a besoin. Structurel : le vrai
 * client `Stripe` s'y conforme, et les tests passent un faux — ce module reste
 * sans dépendance au SDK.
 */
export interface StripeRenewalClient {
  subscriptions: {
    cancel(id: string, params?: { invoice_now?: boolean; prorate?: boolean }): Promise<unknown>
  }
  invoices: {
    retrieve(id: string): Promise<{ status: string | null }>
    update(id: string, params: { auto_advance: boolean }): Promise<unknown>
    voidInvoice(id: string): Promise<unknown>
  }
}

/**
 * Coupe un renouvellement AVANT prélèvement : résilie l'abonnement, puis
 * neutralise la facture de renouvellement déjà créée.
 *
 *  • brouillon          → FIGÉE (`frozen`, `auto_advance: false`) : jamais
 *                         finalisée, donc jamais prélevée. Cas nominal
 *                         d'`invoice.created`.
 *  • finalisée, ouverte → annulée (`voided`) — course entre finalisation et webhook ;
 *  • déjà payée         → `paid` : trop tard, remboursement MANUEL (l'appelant journalise).
 *
 * ⚠️ PAS de suppression du brouillon : Stripe refuse de supprimer une facture
 * issue d'un abonnement (seules les factures ponctuelles se suppriment). Constaté
 * au smoke test du 2026-09-11 (`scripts/stripe-deletion-smoke.ts`) : la
 * suppression échouait, et c'est la résiliation seule qui empêchait déjà la
 * finalisation. Le gel est la ceinture en plus des bretelles.
 *
 * Résilier d'abord : même si la facture ne pouvait plus être traitée, aucun
 * renouvellement SUIVANT n'aura lieu.
 */
export async function cancelAndDiscardRenewal(
  stripe: StripeRenewalClient,
  subscriptionId: string,
  invoiceId: string,
): Promise<'frozen' | 'voided' | 'paid' | 'other'> {
  await stripe.subscriptions.cancel(subscriptionId, { invoice_now: false, prorate: false })
  const invoice = await stripe.invoices.retrieve(invoiceId)
  if (invoice.status === 'draft') {
    await stripe.invoices.update(invoiceId, { auto_advance: false })
    return 'frozen'
  }
  if (invoice.status === 'open') {
    await stripe.invoices.voidInvoice(invoiceId)
    return 'voided'
  }
  return invoice.status === 'paid' ? 'paid' : 'other'
}

/**
 * FILET DU WEBHOOK — faut-il résilier cet abonnement parce que son compte n'existe plus ?
 *
 * Seulement si le compte est IDENTIFIÉ (`userId` non nul) ET que son profil a
 * disparu. Un abonnement qu'on ne sait rattacher à personne (créé hors de notre
 * parcours) n'est jamais résilié sur cette seule base : on ne coupe pas un
 * client sur une absence d'information.
 */
export function shouldStopBillingForDeletedAccount(input: {
  userId: string | null
  profileExists: boolean
  status: string | null | undefined
}): boolean {
  if (!input.userId || input.profileExists) return false
  const status = input.status?.trim().toLowerCase() ?? ''
  return !ENDED.has(status)
}
