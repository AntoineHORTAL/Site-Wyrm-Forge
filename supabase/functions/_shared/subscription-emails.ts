// ════════════════════════════════════════════════════════════════════════════
//  E-mails transactionnels d'abonnement — module PUR (aucun import, aucune API
//  Deno ni Node) : partagé par l'Edge Function `subscription-emails`, par le
//  webhook Stripe du site (`src/lib/stripe/subscription-emails.ts`) et par les
//  tests vitest. Même statut que `postgame-prompt.ts`.
// ════════════════════════════════════════════════════════════════════════════
//
// Trois obligations légales, identifiées au chantier CGV (2026-09-11) :
//   • `order_confirmation`        — art. L221-13 C. conso : confirmation du
//                                   contrat sur support durable, avec la demande
//                                   expresse d'exécution immédiate ;
//   • `cancellation_confirmation` — art. L215-1-1 : confirmation de la
//                                   résiliation, date de fin et effets ;
//   • `renewal_reminder`          — art. L215-1 (loi Chatel) : information avant
//                                   la reconduction d'un abonnement ANNUEL.
//
// ARCHITECTURE — le webhook Stripe n'envoie JAMAIS rien. Il dépose une ligne
// dans `subscription_emails` (migration 20260911000004), idempotente par
// `dedup_key`. L'Edge Function, déclenchée par pg_cron, réclame les lignes dues
// (claim-then-send), envoie via Resend, puis clôt la ligne. Un Resend en panne
// ne peut donc ni ralentir ni faire échouer l'enregistrement d'un paiement ou
// d'une résiliation : ce sont deux processus distincts.

export type EmailKind = 'order_confirmation' | 'cancellation_confirmation' | 'renewal_reminder'
export type BillingPeriod = 'mensuel' | 'annuel'

export interface OrderConfirmationPayload {
  /** Valeur de `profiles.tier` (`forgeron`, `maître`). */
  tier: string
  period: BillingPeriod
  /** Montant réellement débité à la souscription, code promo déduit (centimes). */
  amount_paid_cents: number
  /** Prix du palier hors réduction (centimes). */
  list_price_cents: number
  currency: string
  /** Date du premier prélèvement (ISO). */
  first_charge_at: string
  /** Prochaine échéance (ISO), ou null si inconnue. */
  next_renewal_at: string | null
  /** Identifiant de la preuve `checkout_consent_log` — le texte accepté est relu à l'envoi. */
  consent_id: string | null
}

export interface CancellationPayload {
  tier: string
  period: BillingPeriod | null
  /** Date jusqu'à laquelle l'accès reste actif (ISO). */
  access_until: string
  /** Date de prise en compte de la demande (ISO). */
  requested_at: string
}

export interface RenewalReminderPayload {
  tier: string
  period: 'annuel'
  /** Date de reconduction (ISO) — doit rester égale à `current_period_end` au moment de l'envoi. */
  renewal_at: string
  amount_cents: number
  currency: string
  /** Vrai si le montant vient du prix catalogue faute d'aperçu de facture Stripe. */
  amount_is_estimate: boolean
}

export type EmailPayload = OrderConfirmationPayload | CancellationPayload | RenewalReminderPayload

/* ════════════════════════════════════════════════════════════════════════════
   CALENDRIER DU RAPPEL ANNUEL (art. L215-1)
   ════════════════════════════════════════════════════════════════════════════
   La loi : l'information doit partir « au plus tôt trois mois et au plus tard
   un mois avant le terme ».

   ⚠️ POURQUOI PAS « J-30 » : un mois n'est pas 30 jours. Quand le mois qui
   précède l'échéance compte 31 jours (échéance en février, avril, juin, août,
   septembre, novembre ou janvier), « un mois avant » tombe 31 jours avant — un
   envoi à J-30 serait donc HORS DÉLAI sept mois sur douze.

   Point fixe retenu : UN MOIS CALENDAIRE + 15 JOURS avant l'échéance (≈ J-45).
   Il reste toujours dans la fenêtre légale, avec 15 jours de marge pour une
   panne d'envoi (les relances de la file tiennent en quelques heures). La
   limite légale, elle, est calculée à part (`legalDeadline`) : un envoi qui la
   dépasse part quand même, mais il est journalisé comme TARDIF — dans ce cas la
   sanction légale s'applique (résiliation possible à tout moment après la
   reconduction, avec remboursement au prorata), cf. CGV § 5. */

export const REMINDER_MARGIN_DAYS = 15

/**
 * Retire `months` mois calendaires, en ramenant le jour au dernier jour du mois
 * s'il n'existe pas (31 mars − 1 mois = 28/29 février) — la règle usuelle de
 * computation des délais en mois. Calcul en UTC, sur l'instant exact.
 */
export function subtractCalendarMonths(date: Date, months: number): Date {
  const y = date.getUTCFullYear()
  const m = date.getUTCMonth() - months
  const target = new Date(Date.UTC(y, m, 1, date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds(), date.getUTCMilliseconds()))
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()
  target.setUTCDate(Math.min(date.getUTCDate(), lastDay))
  return target
}

export interface ReminderWindow {
  /** Moment prévu pour l'envoi (point fixe). */
  sendAt: Date
  /** Au-delà, l'envoi est hors délai légal (un mois avant l'échéance). */
  legalDeadline: Date
  /** Avant, l'envoi serait trop précoce (trois mois avant l'échéance). */
  legalEarliest: Date
}

export function reminderWindow(renewalAt: Date): ReminderWindow {
  const legalDeadline = subtractCalendarMonths(renewalAt, 1)
  const legalEarliest = subtractCalendarMonths(renewalAt, 3)
  const sendAt = new Date(legalDeadline.getTime() - REMINDER_MARGIN_DAYS * 86_400_000)
  return { sendAt, legalDeadline, legalEarliest }
}

/* ════════════════════════════════════════════════════════════════════════════
   GABARITS
   ════════════════════════════════════════════════════════════════════════════ */

export interface EmailLinks {
  /** Page profil — boutons « Résilier mon abonnement » et « Moyen de paiement et factures ». */
  profile: string
  /** Conditions générales de vente. */
  cgv: string
  /**
   * Lien de connexion au portail Stripe (lien « no-code » du Dashboard Stripe),
   * s'il est configuré — sinon on renvoie vers /profil, qui ouvre le portail.
   */
  portalLogin: string | null
}

export interface RenderContext {
  links: EmailLinks
  /** Texte EXACT de la demande expresse acceptée (relu dans `checkout_consent_log`). */
  consentText?: string | null
  /** Version des CGV en vigueur à la souscription. */
  termsVersion?: string | null
}

export interface RenderedEmail {
  subject: string
  html: string
  text: string
}

const TIER_LABELS: Record<string, string> = { forgeron: 'Forgeron', 'maître': 'Maître', maitre: 'Maître' }

export function tierLabel(tier: string): string {
  const k = tier.trim().toLowerCase()
  return TIER_LABELS[k] ?? (k.charAt(0).toUpperCase() + k.slice(1))
}

export function formatAmount(cents: number, currency: string): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: currency.toUpperCase() }).format(cents / 100)
}

export function formatDateFr(iso: string): string {
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' })
    .format(new Date(iso))
}

function periodLabel(p: BillingPeriod | null): string {
  return p === 'annuel' ? 'annuelle' : p === 'mensuel' ? 'mensuelle' : '—'
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

/** Paragraphes : tableau de lignes → HTML simple + texte brut, jamais divergents. */
interface Block { kind: 'p' | 'li' | 'h' | 'quote'; text: string; href?: string }

function toHtml(title: string, blocks: Block[]): string {
  const body = blocks.map(b => {
    const t = escapeHtml(b.text)
    const inner = b.href ? `${t} <a href="${escapeHtml(b.href)}" style="color:#B8741A">${escapeHtml(b.href)}</a>` : t
    if (b.kind === 'h') return `<h3 style="margin:22px 0 8px;font-size:15px;color:#1A1A1A">${inner}</h3>`
    if (b.kind === 'li') return `<p style="margin:4px 0 4px 14px">• ${inner}</p>`
    if (b.kind === 'quote') return `<blockquote style="margin:10px 0;padding:10px 14px;border-left:3px solid #EF9F27;background:#FBF6EE">${inner}</blockquote>`
    return `<p style="margin:10px 0">${inner}</p>`
  }).join('\n')
  return `<!doctype html><html lang="fr"><body style="margin:0;padding:24px;background:#F4F2F7;font-family:Arial,Helvetica,sans-serif;color:#2A2A2A;font-size:14px;line-height:1.55">
<div style="max-width:560px;margin:0 auto;background:#FFFFFF;border-radius:10px;padding:26px 28px">
<h2 style="margin:0 0 14px;font-size:19px;color:#1A1A1A">${escapeHtml(title)}</h2>
${body}
<p style="margin:26px 0 0;font-size:12px;color:#77727F">Wyrm Forge — SASU, 5 Rue du 23 Janvier, 21000 Dijon — contact@wyrm-forge.com<br>
E-mail de service lié à ton abonnement : il n'est pas publicitaire et ne comporte pas de lien de désinscription.</p>
</div></body></html>`
}

function toText(title: string, blocks: Block[]): string {
  const lines = blocks.map(b => {
    const t = b.href ? `${b.text} ${b.href}` : b.text
    if (b.kind === 'h') return `\n${t.toUpperCase()}`
    if (b.kind === 'li') return `  - ${t}`
    if (b.kind === 'quote') return `  « ${t} »`
    return t
  })
  return [title, '', ...lines, '',
    '--',
    'Wyrm Forge — SASU, 5 Rue du 23 Janvier, 21000 Dijon — contact@wyrm-forge.com',
    "E-mail de service lié à ton abonnement : il n'est pas publicitaire.",
  ].join('\n')
}

function manageLink(links: EmailLinks): string {
  return links.portalLogin ?? links.profile
}

export function renderEmail(kind: EmailKind, payload: EmailPayload, ctx: RenderContext): RenderedEmail {
  if (kind === 'order_confirmation') return renderOrder(payload as OrderConfirmationPayload, ctx)
  if (kind === 'cancellation_confirmation') return renderCancellation(payload as CancellationPayload, ctx)
  return renderReminder(payload as RenewalReminderPayload, ctx)
}

function renderOrder(p: OrderConfirmationPayload, ctx: RenderContext): RenderedEmail {
  const tier = tierLabel(p.tier)
  const unit = p.period === 'annuel' ? 'an' : 'mois'
  const title = `Ton abonnement ${tier} est confirmé`
  const blocks: Block[] = [
    { kind: 'p', text: `Merci ! Ton abonnement Wyrm Forge est actif. Voici la confirmation de ta commande, à conserver.` },
    { kind: 'h', text: 'Ta commande' },
    { kind: 'li', text: `Palier : ${tier}` },
    { kind: 'li', text: `Périodicité : ${periodLabel(p.period)}` },
    { kind: 'li', text: `Prix : ${formatAmount(p.list_price_cents, p.currency)} par ${unit}` },
    ...(p.amount_paid_cents !== p.list_price_cents
      ? [{ kind: 'li' as const, text: `Montant débité pour cette première période, réduction déduite : ${formatAmount(p.amount_paid_cents, p.currency)}` }]
      : []),
    { kind: 'li', text: `Premier prélèvement : ${formatDateFr(p.first_charge_at)}` },
    ...(p.next_renewal_at
      ? [{ kind: 'li' as const, text: `Prochaine échéance : ${formatDateFr(p.next_renewal_at)} — l'abonnement est reconduit automatiquement à cette date, sauf résiliation.` }]
      : []),
    { kind: 'h', text: 'Sans engagement' },
    { kind: 'p', text: `Tu peux résilier à tout moment, avec effet à la fin de la période déjà payée, sans remboursement partiel. Gérer ou résilier ton abonnement :`, href: manageLink(ctx.links) },
    { kind: 'h', text: 'Ton droit de rétractation' },
    { kind: 'p', text: `Tu disposes de 14 jours à compter d'aujourd'hui pour te rétracter, sans justification, par simple e-mail à contact@wyrm-forge.com. Avant de payer, tu as demandé à accéder au service immédiatement :` },
    ...(ctx.consentText ? [{ kind: 'quote' as const, text: ctx.consentText }] : []),
    { kind: 'p', text: `Si tu te rétractes dans ce délai, tu es remboursé, déduction faite du montant correspondant au service fourni jusqu'à ta rétractation. Le formulaire de rétractation et le détail des conditions figurent dans nos conditions générales de vente${ctx.termsVersion ? ` (version du ${formatDateFr(ctx.termsVersion)})` : ''} :`, href: ctx.links.cgv },
  ]
  return { subject: `Confirmation de ton abonnement ${tier} — Wyrm Forge`, html: toHtml(title, blocks), text: toText(title, blocks) }
}

function renderCancellation(p: CancellationPayload, ctx: RenderContext): RenderedEmail {
  const tier = tierLabel(p.tier)
  const title = 'Ta résiliation est enregistrée'
  const blocks: Block[] = [
    { kind: 'p', text: `Nous confirmons avoir reçu ta demande de résiliation de l'abonnement ${tier}, le ${formatDateFr(p.requested_at)}.` },
    { kind: 'li', text: `Ton accès au palier ${tier} reste actif jusqu'au ${formatDateFr(p.access_until)} inclus.` },
    { kind: 'li', text: `Aucun nouveau prélèvement n'aura lieu. La période déjà payée n'est pas remboursée partiellement (conditions générales, article 10).` },
    { kind: 'li', text: `À cette date, ton compte repasse au palier gratuit Apprenti. Tes contenus sont conservés.` },
    { kind: 'p', text: `Tu as changé d'avis ? Tu peux réactiver ton abonnement avant cette date :`, href: manageLink(ctx.links) },
    { kind: 'p', text: `Conditions générales de vente :`, href: ctx.links.cgv },
  ]
  return { subject: `Résiliation enregistrée — accès ${tier} jusqu'au ${formatDateFr(p.access_until)}`, html: toHtml(title, blocks), text: toText(title, blocks) }
}

function renderReminder(p: RenewalReminderPayload, ctx: RenderContext): RenderedEmail {
  const tier = tierLabel(p.tier)
  const date = formatDateFr(p.renewal_at)
  const title = `Ton abonnement annuel ${tier} sera reconduit le ${date}`
  const amount = formatAmount(p.amount_cents, p.currency)
  const blocks: Block[] = [
    // L215-1 : la date limite de non-reconduction doit être mise en évidence,
    // « dans un encadré apparent » — d'où le bloc encadré en tête.
    { kind: 'quote', text: `Date de reconduction : ${date}. Pour ne pas reconduire ton abonnement, résilie-le avant cette date.` },
    { kind: 'p', text: `Comme la loi le prévoit (article L215-1 du Code de la consommation), nous te prévenons à l'avance : ton abonnement annuel ${tier} sera reconduit automatiquement le ${date}, pour une nouvelle année.` },
    { kind: 'li', text: `Montant qui sera prélevé : ${amount}${p.amount_is_estimate ? ' (prix du palier, hors réduction éventuelle)' : ''}.` },
    { kind: 'li', text: `Tu peux choisir de ne pas reconduire : il suffit de résilier avant le ${date}. Tu gardes alors ton accès jusqu'à cette date, sans nouveau prélèvement.` },
    { kind: 'p', text: `Résilier ou gérer ton abonnement :`, href: manageLink(ctx.links) },
    { kind: 'p', text: `Si tu ne fais rien, l'abonnement continue et le montant ci-dessus sera prélevé à la date indiquée. Conditions générales de vente :`, href: ctx.links.cgv },
  ]
  return { subject: `Reconduction de ton abonnement ${tier} le ${date}`, html: toHtml(title, blocks), text: toText(title, blocks) }
}

/* ════════════════════════════════════════════════════════════════════════════
   TRAITEMENT DE LA FILE — claim-then-send, effets injectés
   ════════════════════════════════════════════════════════════════════════════
   Patron repris (pas le code) de l'ancien `prac-notify` : on POSSÈDE un envoi
   avant de l'effectuer. Ici, la possession est donnée par
   `claim_subscription_emails` (UPDATE … status='sending' … FOR UPDATE SKIP
   LOCKED) : deux exécutions concurrentes ne peuvent pas réclamer la même ligne.
   Et chaque envoi porte `Idempotency-Key = dedup_key` chez Resend : si une
   exécution plantait APRÈS l'envoi mais AVANT la clôture, la reprise de la ligne
   bloquée ne produirait pas de doublon côté destinataire.

   Chaque e-mail est isolé : l'échec de l'un n'empêche pas les suivants. */

export interface ClaimedEmail {
  id: number
  user_id: string | null
  stripe_subscription_id: string | null
  kind: EmailKind
  dedup_key: string
  payload: EmailPayload
  attempts: number
}

export interface SubscriptionState {
  status: string | null
  cancel_at_period_end: boolean | null
  current_period_end: string | null
}

export type FinishOutcome =
  | { status: 'sent'; providerId: string | null; recipient: string }
  | { status: 'failed'; error: string; recipient?: string | null }
  | { status: 'skipped'; error: string }

export interface WorkerDeps {
  claim(limit: number): Promise<ClaimedEmail[]>
  recipientOf(userId: string): Promise<string | null>
  subscriptionState(subscriptionId: string): Promise<SubscriptionState | null>
  consentOf(consentId: string): Promise<{ text: string; terms_version: string } | null>
  send(msg: { to: string; subject: string; html: string; text: string; idempotencyKey: string }):
    Promise<{ ok: boolean; id?: string; error?: string; status: number }>
  finish(id: number, outcome: FinishOutcome): Promise<void>
  links: EmailLinks
  now(): Date
  log(level: 'info' | 'warn' | 'error', message: string, data?: Record<string, unknown>): void
}

export interface WorkerReport { claimed: number; sent: number; failed: number; skipped: number }

const LIVE_STATUSES = new Set(['active', 'trialing', 'past_due'])

/**
 * Un rappel de reconduction a-t-il encore un sens au moment de l'envoi ?
 * L'abonnement a pu être résilié, suspendu ou déjà renouvelé depuis la mise en
 * file : on ne prévient pas d'une reconduction qui n'aura pas lieu.
 */
export function reminderStillValid(p: RenewalReminderPayload, s: SubscriptionState | null): string | null {
  if (!s) return 'subscription_not_found'
  if (s.cancel_at_period_end === true) return 'cancellation_scheduled'
  if (!LIVE_STATUSES.has(s.status?.trim().toLowerCase() ?? '')) return `status_${s.status ?? 'null'}`
  if (!s.current_period_end || new Date(s.current_period_end).getTime() !== new Date(p.renewal_at).getTime()) {
    return 'period_changed'
  }
  return null
}

async function safeFinish(deps: WorkerDeps, id: number, outcome: FinishOutcome) {
  try {
    await deps.finish(id, outcome)
  } catch (e) {
    // La ligne reste 'sending' ; elle sera reprise après 15 min, et
    // l'Idempotency-Key empêche un doublon si l'envoi avait réussi.
    deps.log('error', 'finish_subscription_email a échoué', { id, error: e instanceof Error ? e.message : String(e) })
  }
}

export async function processDueEmails(deps: WorkerDeps, limit = 20): Promise<WorkerReport> {
  const rows = await deps.claim(limit)
  const report: WorkerReport = { claimed: rows.length, sent: 0, failed: 0, skipped: 0 }

  for (const row of rows) {
    try {
      if (!row.user_id) {
        await safeFinish(deps, row.id, { status: 'skipped', error: 'account_deleted' })
        report.skipped++
        continue
      }

      if (row.kind === 'renewal_reminder') {
        const p = row.payload as RenewalReminderPayload
        const state = row.stripe_subscription_id ? await deps.subscriptionState(row.stripe_subscription_id) : null
        const invalid = reminderStillValid(p, state)
        if (invalid) {
          await safeFinish(deps, row.id, { status: 'skipped', error: invalid })
          report.skipped++
          continue
        }
        if (deps.now().getTime() > reminderWindow(new Date(p.renewal_at)).legalDeadline.getTime()) {
          deps.log('error', 'rappel de reconduction envoyé HORS DÉLAI légal (L215-1)', { id: row.id, renewal_at: p.renewal_at })
        }
      }

      const to = await deps.recipientOf(row.user_id)
      if (!to) {
        await safeFinish(deps, row.id, { status: 'skipped', error: 'no_recipient' })
        report.skipped++
        continue
      }

      let ctx: RenderContext = { links: deps.links }
      if (row.kind === 'order_confirmation') {
        const consentId = (row.payload as OrderConfirmationPayload).consent_id
        const consent = consentId ? await deps.consentOf(consentId) : null
        ctx = { links: deps.links, consentText: consent?.text ?? null, termsVersion: consent?.terms_version ?? null }
      }

      const mail = renderEmail(row.kind, row.payload, ctx)
      const result = await deps.send({ to, ...mail, idempotencyKey: row.dedup_key })

      if (result.ok) {
        await safeFinish(deps, row.id, { status: 'sent', providerId: result.id ?? null, recipient: to })
        report.sent++
      } else {
        deps.log('warn', 'envoi Resend en échec — relance programmée', { id: row.id, status: result.status, error: result.error })
        await safeFinish(deps, row.id, { status: 'failed', error: result.error ?? `status ${result.status}`, recipient: to })
        report.failed++
      }
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e)
      deps.log('error', 'traitement d’un e-mail en échec', { id: row.id, error })
      await safeFinish(deps, row.id, { status: 'failed', error })
      report.failed++
    }
  }

  return report
}
