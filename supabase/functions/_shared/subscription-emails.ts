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
   LANGUE DES E-MAILS
   ════════════════════════════════════════════════════════════════════════════
   D'OÙ VIENT LA LANGUE — `checkout_consent_log.locale`, et rien d'autre.

   Le site n'a AUCUNE préférence de langue persistée : `wf-lang` vit dans le
   `localStorage` du navigateur et ne survit pas au serveur. La seule trace
   durable de la langue dans laquelle une personne a traité avec nous est la
   `locale` enregistrée avec sa demande expresse d'exécution immédiate
   (migration 20260911000003) — écrite au moment exact où elle lisait la page de
   paiement, donc exacte par construction.

     • `order_confirmation`        → la locale de LA preuve de cette commande
       (`payload.consent_id`), déjà relue pour son `consent_text` : aucune
       requête de plus.
     • `cancellation_confirmation`
       `renewal_reminder`          → la DERNIÈRE locale connue du compte
       (`localeOf`), c.-à-d. la preuve la plus récente. L'index
       `idx_checkout_consent_log_user (user_id, accepted_at DESC)` existe déjà :
       pas de migration, pas de colonne, pas de nouveau mécanisme.

   ⚠️ Pourquoi PAS une colonne `locale` sur `stripe_subscriptions` : ce serait
   une migration sur la base PARTAGÉE avec l'app WPF pour stocker une donnée
   déjà déductible, plus un backfill pour les abonnements existants. Et pourquoi
   pas une préférence utilisateur : ce serait inventer un mécanisme là où la
   preuve de consentement répond déjà à la question.

   ⚠️ REPLI SÛR : toute locale inconnue, absente ou illisible ramène au
   FRANÇAIS — le comportement d'avant ce chantier. Le repli est JOURNALISÉ
   (`log('info' | 'warn')`) : un e-mail qui part dans la mauvaise langue doit
   se voir dans les journaux, pas passer inaperçu. */

export type EmailLocale = 'fr' | 'en'
export const EMAIL_LOCALES: readonly EmailLocale[] = ['fr', 'en'] as const
export const DEFAULT_EMAIL_LOCALE: EmailLocale = 'fr'

/**
 * Normalise une valeur venue de la base en langue de gabarit.
 *
 * Tolère les étiquettes régionales (`fr-FR`, `en-GB`) même si la colonne ne
 * contient aujourd'hui que `fr` ou `en` : elle accepte 2 à 10 caractères, et un
 * `en-GB` qui retomberait en français serait le pire des deux mondes.
 * Tout le reste — `null`, chaîne vide, `de`, valeur corrompue — vaut FRANÇAIS.
 */
export function resolveEmailLocale(value: unknown): EmailLocale {
  if (typeof value !== 'string') return DEFAULT_EMAIL_LOCALE
  const tag = value.trim().toLowerCase()
  for (const l of EMAIL_LOCALES) {
    if (tag === l || tag.startsWith(`${l}-`)) return l
  }
  return DEFAULT_EMAIL_LOCALE
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
  /**
   * Langue du gabarit. ABSENTE ⇒ français : c'est le repli sûr, et il garde le
   * comportement d'avant la traduction pour tout appelant qui ne la fournit pas.
   */
  locale?: EmailLocale
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

/* ── Dictionnaire FR / EN ───────────────────────────────────────────────────
   Même convention que `src/locales/legal/*` : le FRANÇAIS fait foi, le type
   anglais en dérive via `typeof`, une clé oubliée ou renommée casse la
   compilation au lieu d'envoyer un e-mail à trous.

   ⚠️ Le dictionnaire vit DANS ce fichier et pas à côté : l'Edge Function tourne
   sous Deno, qui exige l'extension (`./x.ts`), et `tsc` la refuse
   (`allowImportingTsExtensions`) — or ce module est aussi compilé par Next,
   qui l'importe depuis le webhook Stripe. Un module frère serait donc
   importable par l'un ou par l'autre, jamais par les deux.

   ⚠️ Noms de paliers : la valeur en base (`profiles.tier`) reste « Forgeron » /
   « Maître », le libellé AFFICHÉ suit la langue (« Blacksmith » / « Master »),
   comme la grille tarifaire, la modale de paiement et les CGV. */

/** Identique dans les deux langues : c'est une adresse. */
const FOOTER_ADDRESS = 'Wyrm Forge — SASU, 5 Rue du 23 Janvier, 21000 Dijon — contact@wyrm-forge.com'

const emailTextsFr = {
  /** Attribut `lang` du document — lecteurs d'écran et traduction automatique. */
  htmlLang: 'fr',
  /** Locale `Intl` des montants et des dates. */
  intlLocale: 'fr-FR',
  /** Libellés de palier, indexés par `profiles.tier` normalisé. */
  tiers: { forgeron: 'Forgeron', maitre: 'Maître' } as Record<string, string>,
  periods: { mensuel: 'mensuelle', annuel: 'annuelle', unknown: '—' },
  /** Unité de prix : « … par mois ». */
  units: { mensuel: 'mois', annuel: 'an' },
  /** Guillemets de la citation dans la version TEXTE BRUT (le HTML a son <blockquote>). */
  quote: { open: '« ', close: ' »' },
  footerNoticeHtml:
    "E-mail de service lié à ton abonnement : il n'est pas publicitaire et ne comporte pas de lien de désinscription.",
  footerNoticeText: "E-mail de service lié à ton abonnement : il n'est pas publicitaire.",

  order: {
    subject: (tier: string) => `Confirmation de ton abonnement ${tier} — Wyrm Forge`,
    title: (tier: string) => `Ton abonnement ${tier} est confirmé`,
    intro: 'Merci ! Ton abonnement Wyrm Forge est actif. Voici la confirmation de ta commande, à conserver.',
    heading: 'Ta commande',
    tierLine: (tier: string) => `Palier : ${tier}`,
    periodLine: (period: string) => `Périodicité : ${period}`,
    priceLine: (amount: string, unit: string) => `Prix : ${amount} par ${unit}`,
    discountedLine: (amount: string) =>
      `Montant débité pour cette première période, réduction déduite : ${amount}`,
    firstChargeLine: (date: string) => `Premier prélèvement : ${date}`,
    nextRenewalLine: (date: string) =>
      `Prochaine échéance : ${date} — l'abonnement est reconduit automatiquement à cette date, sauf résiliation.`,
    noCommitmentHeading: 'Sans engagement',
    noCommitment:
      'Tu peux résilier à tout moment, avec effet à la fin de la période déjà payée, sans remboursement partiel. Gérer ou résilier ton abonnement :',
    withdrawalHeading: 'Ton droit de rétractation',
    withdrawalIntro:
      "Tu disposes de 14 jours à compter d'aujourd'hui pour te rétracter, sans justification, par simple e-mail à contact@wyrm-forge.com. Avant de payer, tu as demandé à accéder au service immédiatement :",
    withdrawalTerms: (termsVersion: string | null) =>
      `Si tu te rétractes dans ce délai, tu es remboursé, déduction faite du montant correspondant au service fourni jusqu'à ta rétractation. Le formulaire de rétractation et le détail des conditions figurent dans nos conditions générales de vente${termsVersion ? ` (version du ${termsVersion})` : ''} :`,
  },

  cancellation: {
    subject: (tier: string, date: string) => `Résiliation enregistrée — accès ${tier} jusqu'au ${date}`,
    title: 'Ta résiliation est enregistrée',
    intro: (tier: string, date: string) =>
      `Nous confirmons avoir reçu ta demande de résiliation de l'abonnement ${tier}, le ${date}.`,
    accessUntil: (tier: string, date: string) =>
      `Ton accès au palier ${tier} reste actif jusqu'au ${date} inclus.`,
    noRefund:
      "Aucun nouveau prélèvement n'aura lieu. La période déjà payée n'est pas remboursée partiellement (conditions générales, article 10).",
    backToFree: 'À cette date, ton compte repasse au palier gratuit Apprenti. Tes contenus sont conservés.',
    reactivate: "Tu as changé d'avis ? Tu peux réactiver ton abonnement avant cette date :",
    terms: 'Conditions générales de vente :',
  },

  reminder: {
    subject: (tier: string, date: string) => `Reconduction de ton abonnement ${tier} le ${date}`,
    title: (tier: string, date: string) => `Ton abonnement annuel ${tier} sera reconduit le ${date}`,
    /** Encadré apparent exigé par L215-1 — voir `renderReminder`. */
    notice: (date: string) =>
      `Date de reconduction : ${date}. Pour ne pas reconduire ton abonnement, résilie-le avant cette date.`,
    legalIntro: (tier: string, date: string) =>
      `Comme la loi le prévoit (article L215-1 du Code de la consommation), nous te prévenons à l'avance : ton abonnement annuel ${tier} sera reconduit automatiquement le ${date}, pour une nouvelle année.`,
    amountLine: (amount: string, isEstimate: boolean) =>
      `Montant qui sera prélevé : ${amount}${isEstimate ? ' (prix du palier, hors réduction éventuelle)' : ''}.`,
    optOut: (date: string) =>
      `Tu peux choisir de ne pas reconduire : il suffit de résilier avant le ${date}. Tu gardes alors ton accès jusqu'à cette date, sans nouveau prélèvement.`,
    manage: 'Résilier ou gérer ton abonnement :',
    doNothing:
      "Si tu ne fais rien, l'abonnement continue et le montant ci-dessus sera prélevé à la date indiquée. Conditions générales de vente :",
  },
}

export type EmailTexts = typeof emailTextsFr

const emailTextsEn: EmailTexts = {
  htmlLang: 'en',
  // `en-GB` et non `en-US` : même choix que `src/lib/intl.ts` et `formatPrice`
  // sur le site (ordre jour/mois, proche du français). Deux locales anglaises
  // différentes donneraient des dates incohérentes entre l'e-mail et le site.
  intlLocale: 'en-GB',
  tiers: { forgeron: 'Blacksmith', maitre: 'Master' } as Record<string, string>,
  periods: { mensuel: 'monthly', annuel: 'annual', unknown: '—' },
  units: { mensuel: 'month', annuel: 'year' },
  quote: { open: '“', close: '”' },
  footerNoticeHtml:
    'Service email relating to your subscription: it is not marketing and carries no unsubscribe link.',
  footerNoticeText: 'Service email relating to your subscription: it is not marketing.',

  order: {
    subject: (tier: string) => `Confirmation of your ${tier} subscription — Wyrm Forge`,
    title: (tier: string) => `Your ${tier} subscription is confirmed`,
    intro: 'Thank you! Your Wyrm Forge subscription is active. Here is the confirmation of your order, to keep.',
    heading: 'Your order',
    tierLine: (tier: string) => `Tier: ${tier}`,
    periodLine: (period: string) => `Billing frequency: ${period}`,
    priceLine: (amount: string, unit: string) => `Price: ${amount} per ${unit}`,
    discountedLine: (amount: string) =>
      `Amount charged for this first period, discount deducted: ${amount}`,
    firstChargeLine: (date: string) => `First charge: ${date}`,
    nextRenewalLine: (date: string) =>
      `Next due date: ${date} — the subscription renews automatically on that date, unless it is cancelled.`,
    noCommitmentHeading: 'No commitment',
    noCommitment:
      'You may cancel at any time, effective at the end of the period already paid for, with no partial refund. Manage or cancel your subscription:',
    withdrawalHeading: 'Your right of withdrawal',
    withdrawalIntro:
      'You have 14 days from today to withdraw, without giving reasons, by a simple email to contact@wyrm-forge.com. Before paying, you asked to access the service immediately:',
    withdrawalTerms: (termsVersion: string | null) =>
      `If you withdraw within that period, you are refunded, less the amount corresponding to the service supplied up to your withdrawal. The withdrawal form and the full conditions are set out in our terms of sale${termsVersion ? ` (version of ${termsVersion})` : ''}:`,
  },

  cancellation: {
    subject: (tier: string, date: string) => `Cancellation recorded — ${tier} access until ${date}`,
    title: 'Your cancellation is recorded',
    intro: (tier: string, date: string) =>
      `We confirm that we received your request to cancel the ${tier} subscription, on ${date}.`,
    accessUntil: (tier: string, date: string) =>
      `Your access to the ${tier} tier stays active until ${date} inclusive.`,
    noRefund:
      'No further charge will be made. The period already paid for is not partially refunded (terms of use, article 10).',
    backToFree: 'On that date, your account returns to the free Apprentice tier. Your content is kept.',
    reactivate: 'Changed your mind? You can reactivate your subscription before that date:',
    terms: 'Terms of sale:',
  },

  reminder: {
    subject: (tier: string, date: string) => `Renewal of your ${tier} subscription on ${date}`,
    title: (tier: string, date: string) => `Your annual ${tier} subscription will renew on ${date}`,
    notice: (date: string) =>
      `Renewal date: ${date}. To stop your subscription from renewing, cancel it before that date.`,
    legalIntro: (tier: string, date: string) =>
      `As the law requires (article L215-1 of the French Consumer Code), we are telling you in advance: your annual ${tier} subscription will renew automatically on ${date}, for another year.`,
    amountLine: (amount: string, isEstimate: boolean) =>
      `Amount that will be charged: ${amount}${isEstimate ? ' (tier price, before any discount)' : ''}.`,
    optOut: (date: string) =>
      `You may choose not to renew: simply cancel before ${date}. You then keep your access until that date, with no further charge.`,
    manage: 'Cancel or manage your subscription:',
    doNothing:
      'If you do nothing, the subscription continues and the amount above will be charged on the date shown. Terms of sale:',
  },
}

export const EMAIL_TEXTS: Record<EmailLocale, EmailTexts> = {
  fr: emailTextsFr,
  en: emailTextsEn,
}

export function tierLabel(tier: string, locale: EmailLocale = DEFAULT_EMAIL_LOCALE): string {
  const k = tier.trim().toLowerCase()
  // `maître` et `maitre` désignent le même palier : la valeur en base porte
  // l'accent, les métadonnées Stripe la clé ASCII.
  const key = k === 'maître' ? 'maitre' : k
  return EMAIL_TEXTS[locale].tiers[key] ?? (k.charAt(0).toUpperCase() + k.slice(1))
}

export function formatAmount(cents: number, currency: string, locale: EmailLocale = DEFAULT_EMAIL_LOCALE): string {
  return new Intl.NumberFormat(EMAIL_TEXTS[locale].intlLocale, { style: 'currency', currency: currency.toUpperCase() })
    .format(cents / 100)
}

/**
 * Date d'un e-mail, dans la langue lue.
 *
 * ⚠️ `timeZone: 'Europe/Paris'` dans LES DEUX langues, et ce n'est pas un oubli :
 * ce sont des dates CONTRACTUELLES (échéance, fin d'accès, premier prélèvement)
 * fixées par un vendeur français et opposables en droit français. Les afficher
 * dans le fuseau du destinataire les ferait diverger d'un jour de celles que le
 * site, les CGV et le portail Stripe annoncent.
 */
export function formatEmailDate(iso: string, locale: EmailLocale = DEFAULT_EMAIL_LOCALE): string {
  return new Intl.DateTimeFormat(EMAIL_TEXTS[locale].intlLocale, {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris',
  }).format(new Date(iso))
}

function periodLabel(d: EmailTexts, p: BillingPeriod | null): string {
  return p === 'annuel' ? d.periods.annuel : p === 'mensuel' ? d.periods.mensuel : d.periods.unknown
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

/** Paragraphes : tableau de lignes → HTML simple + texte brut, jamais divergents. */
interface Block { kind: 'p' | 'li' | 'h' | 'quote'; text: string; href?: string }

function toHtml(d: EmailTexts, title: string, blocks: Block[]): string {
  const body = blocks.map(b => {
    const t = escapeHtml(b.text)
    const inner = b.href ? `${t} <a href="${escapeHtml(b.href)}" style="color:#B8741A">${escapeHtml(b.href)}</a>` : t
    if (b.kind === 'h') return `<h3 style="margin:22px 0 8px;font-size:15px;color:#1A1A1A">${inner}</h3>`
    if (b.kind === 'li') return `<p style="margin:4px 0 4px 14px">• ${inner}</p>`
    if (b.kind === 'quote') return `<blockquote style="margin:10px 0;padding:10px 14px;border-left:3px solid #EF9F27;background:#FBF6EE">${inner}</blockquote>`
    return `<p style="margin:10px 0">${inner}</p>`
  }).join('\n')
  return `<!doctype html><html lang="${d.htmlLang}"><body style="margin:0;padding:24px;background:#F4F2F7;font-family:Arial,Helvetica,sans-serif;color:#2A2A2A;font-size:14px;line-height:1.55">
<div style="max-width:560px;margin:0 auto;background:#FFFFFF;border-radius:10px;padding:26px 28px">
<h2 style="margin:0 0 14px;font-size:19px;color:#1A1A1A">${escapeHtml(title)}</h2>
${body}
<p style="margin:26px 0 0;font-size:12px;color:#77727F">${FOOTER_ADDRESS}<br>
${d.footerNoticeHtml}</p>
</div></body></html>`
}

function toText(d: EmailTexts, title: string, blocks: Block[]): string {
  const lines = blocks.map(b => {
    const t = b.href ? `${b.text} ${b.href}` : b.text
    if (b.kind === 'h') return `\n${t.toUpperCase()}`
    if (b.kind === 'li') return `  - ${t}`
    if (b.kind === 'quote') return `  ${d.quote.open}${t}${d.quote.close}`
    return t
  })
  return [title, '', ...lines, '', '--', FOOTER_ADDRESS, d.footerNoticeText].join('\n')
}

/* ── LIENS SORTANTS : la langue voyage dans l'URL ──────────────────────────
   Un e-mail ANGLAIS dont le lien pointe sur `/cgv` tout court fait atterrir son
   destinataire sur la version FRANÇAISE : la langue du site vit dans le
   `localStorage`, qui ne franchit ni l'e-mail ni l'appareil. Le cas est la
   règle, pas l'exception — un lien ouvert depuis l'application mail d'un
   téléphone s'ouvre dans un navigateur qui n'a jamais visité le site.

   Les liens des e-mails portent donc `?lang=fr|en`, lu par `LanguageProvider`
   au chargement (`src/lib/lang-param.ts`). Les liens DU SITE, eux, n'en portent
   pas : la navigation normale suit l'état du provider comme avant.

   ⚠️ Le nom du paramètre est écrit DEUX FOIS — ici (module Deno, qui ne peut
   pas importer `src/`) et dans `LANG_PARAM` (`src/lib/lang-param.ts`). Les deux
   côtés sont verrouillés ensemble par `subscription-emails-worker.test.ts`, qui
   compare le lien rendu à cette constante. */
const LANG_PARAM = 'lang'

/**
 * Ajoute la langue à une URL DU SITE (`links.profile`, `links.cgv`, construites
 * comme `${SITE_URL}/…` — ni query ni fragment, le `?` suffit donc ; le `&` est
 * là pour le jour où ce ne serait plus vrai).
 */
function siteLink(url: string, locale: EmailLocale): string {
  return `${url}${url.includes('?') ? '&' : '?'}${LANG_PARAM}=${locale}`
}

/**
 * Lien « gérer mon abonnement ».
 *
 * ⚠️ Le lien « no-code » du portail Stripe, quand il est configuré, n'est PAS
 * estampillé : c'est une URL de Stripe, qui a sa propre gestion de langue — un
 * `?lang=` y serait un paramètre parasite. Seul le repli `/profil` est à nous.
 */
function manageLink(links: EmailLinks, locale: EmailLocale): string {
  return links.portalLogin ?? siteLink(links.profile, locale)
}

export function renderEmail(kind: EmailKind, payload: EmailPayload, ctx: RenderContext): RenderedEmail {
  // Repli sûr : un appelant qui ne fournit pas la langue obtient le français,
  // c'est-à-dire exactement le comportement d'avant la traduction.
  const locale = ctx.locale ?? DEFAULT_EMAIL_LOCALE
  const d = EMAIL_TEXTS[locale]
  if (kind === 'order_confirmation') return renderOrder(d, locale, payload as OrderConfirmationPayload, ctx)
  if (kind === 'cancellation_confirmation') return renderCancellation(d, locale, payload as CancellationPayload, ctx)
  return renderReminder(d, locale, payload as RenewalReminderPayload, ctx)
}

function renderOrder(d: EmailTexts, locale: EmailLocale, p: OrderConfirmationPayload, ctx: RenderContext): RenderedEmail {
  const tier = tierLabel(p.tier, locale)
  const unit = p.period === 'annuel' ? d.units.annuel : d.units.mensuel
  const title = d.order.title(tier)
  const blocks: Block[] = [
    { kind: 'p', text: d.order.intro },
    { kind: 'h', text: d.order.heading },
    { kind: 'li', text: d.order.tierLine(tier) },
    { kind: 'li', text: d.order.periodLine(periodLabel(d, p.period)) },
    { kind: 'li', text: d.order.priceLine(formatAmount(p.list_price_cents, p.currency, locale), unit) },
    ...(p.amount_paid_cents !== p.list_price_cents
      ? [{ kind: 'li' as const, text: d.order.discountedLine(formatAmount(p.amount_paid_cents, p.currency, locale)) }]
      : []),
    { kind: 'li', text: d.order.firstChargeLine(formatEmailDate(p.first_charge_at, locale)) },
    ...(p.next_renewal_at
      ? [{ kind: 'li' as const, text: d.order.nextRenewalLine(formatEmailDate(p.next_renewal_at, locale)) }]
      : []),
    { kind: 'h', text: d.order.noCommitmentHeading },
    { kind: 'p', text: d.order.noCommitment, href: manageLink(ctx.links, locale) },
    { kind: 'h', text: d.order.withdrawalHeading },
    { kind: 'p', text: d.order.withdrawalIntro },
    ...(ctx.consentText ? [{ kind: 'quote' as const, text: ctx.consentText }] : []),
    {
      kind: 'p',
      text: d.order.withdrawalTerms(ctx.termsVersion ? formatEmailDate(ctx.termsVersion, locale) : null),
      href: siteLink(ctx.links.cgv, locale),
    },
  ]
  return { subject: d.order.subject(tier), html: toHtml(d, title, blocks), text: toText(d, title, blocks) }
}

function renderCancellation(d: EmailTexts, locale: EmailLocale, p: CancellationPayload, ctx: RenderContext): RenderedEmail {
  const tier = tierLabel(p.tier, locale)
  const accessUntil = formatEmailDate(p.access_until, locale)
  const title = d.cancellation.title
  const blocks: Block[] = [
    { kind: 'p', text: d.cancellation.intro(tier, formatEmailDate(p.requested_at, locale)) },
    { kind: 'li', text: d.cancellation.accessUntil(tier, accessUntil) },
    { kind: 'li', text: d.cancellation.noRefund },
    { kind: 'li', text: d.cancellation.backToFree },
    { kind: 'p', text: d.cancellation.reactivate, href: manageLink(ctx.links, locale) },
    { kind: 'p', text: d.cancellation.terms, href: siteLink(ctx.links.cgv, locale) },
  ]
  return { subject: d.cancellation.subject(tier, accessUntil), html: toHtml(d, title, blocks), text: toText(d, title, blocks) }
}

function renderReminder(d: EmailTexts, locale: EmailLocale, p: RenewalReminderPayload, ctx: RenderContext): RenderedEmail {
  const tier = tierLabel(p.tier, locale)
  const date = formatEmailDate(p.renewal_at, locale)
  const title = d.reminder.title(tier, date)
  const amount = formatAmount(p.amount_cents, p.currency, locale)
  const blocks: Block[] = [
    // L215-1 : la date limite de non-reconduction doit être mise en évidence,
    // « dans un encadré apparent » — d'où le bloc encadré en tête.
    { kind: 'quote', text: d.reminder.notice(date) },
    { kind: 'p', text: d.reminder.legalIntro(tier, date) },
    { kind: 'li', text: d.reminder.amountLine(amount, p.amount_is_estimate) },
    { kind: 'li', text: d.reminder.optOut(date) },
    { kind: 'p', text: d.reminder.manage, href: manageLink(ctx.links, locale) },
    { kind: 'p', text: d.reminder.doNothing, href: siteLink(ctx.links.cgv, locale) },
  ]
  return { subject: d.reminder.subject(tier, date), html: toHtml(d, title, blocks), text: toText(d, title, blocks) }
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
  /**
   * La preuve de consentement d'UNE commande : son texte, la version des CGV
   * acceptée, et la LANGUE dans laquelle la case a été lue et cochée.
   */
  consentOf(consentId: string): Promise<{ text: string; terms_version: string; locale: string | null } | null>
  /**
   * Dernière langue connue d'un compte — la `locale` de sa preuve de
   * consentement la plus récente (`checkout_consent_log`, index
   * `(user_id, accepted_at DESC)`). `null` si le compte n'en a aucune.
   *
   * C'est la source de langue de la résiliation et du rappel annuel, qui ne
   * sont rattachés à aucune preuve précise. Voir l'en-tête § LANGUE DES E-MAILS.
   */
  localeOf(userId: string): Promise<string | null>
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

/**
 * Langue d'un e-mail de la file.
 *
 *  1. la locale de la preuve de CETTE commande, quand il y en a une
 *     (`order_confirmation`) — exacte par construction ;
 *  2. sinon la dernière locale connue du compte (`localeOf`) ;
 *  3. sinon le FRANÇAIS.
 *
 * ⚠️ Le repli n'est jamais silencieux, et il ne fait jamais échouer l'envoi :
 * une confirmation de commande ou un rappel légal doit partir même si l'on ne
 * sait pas dans quelle langue l'écrire. Un repli est journalisé en `info`
 * (compte sans preuve : normal pour un abonnement d'avant la mise en place du
 * consentement), une panne de lecture en `warn`.
 */
async function localeForRow(
  deps: WorkerDeps,
  row: ClaimedEmail,
  consentLocale: string | null,
): Promise<EmailLocale> {
  if (consentLocale) return resolveEmailLocale(consentLocale)
  if (!row.user_id) return DEFAULT_EMAIL_LOCALE

  let known: string | null = null
  try {
    known = await deps.localeOf(row.user_id)
  } catch (e) {
    deps.log('warn', 'langue indéterminable — e-mail envoyé en français', {
      id: row.id, kind: row.kind, error: e instanceof Error ? e.message : String(e),
    })
    return DEFAULT_EMAIL_LOCALE
  }

  if (!known) {
    deps.log('info', 'aucune langue connue pour ce compte — e-mail envoyé en français', {
      id: row.id, kind: row.kind,
    })
    return DEFAULT_EMAIL_LOCALE
  }

  const locale = resolveEmailLocale(known)
  // `resolveEmailLocale` ne lève jamais : une valeur hors catalogue retombe en
  // français, mais en silence — d'où ce contrôle explicite.
  if (locale === DEFAULT_EMAIL_LOCALE && !known.trim().toLowerCase().startsWith(DEFAULT_EMAIL_LOCALE)) {
    deps.log('warn', 'langue enregistrée hors catalogue — e-mail envoyé en français', {
      id: row.id, kind: row.kind, locale: known,
    })
  }
  return locale
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

      // La preuve n'est relue que pour la confirmation de commande (L221-13 :
      // son texte exact fait partie de la confirmation du contrat). Elle porte
      // au passage la langue de CETTE commande — la plus exacte qui soit.
      let consent: { text: string; terms_version: string; locale: string | null } | null = null
      if (row.kind === 'order_confirmation') {
        const consentId = (row.payload as OrderConfirmationPayload).consent_id
        consent = consentId ? await deps.consentOf(consentId) : null
      }

      const ctx: RenderContext = {
        links: deps.links,
        locale: await localeForRow(deps, row, consent?.locale ?? null),
        consentText: consent?.text ?? null,
        termsVersion: consent?.terms_version ?? null,
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
