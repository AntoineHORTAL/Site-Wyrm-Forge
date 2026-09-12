'use client'

import Link from 'next/link'
import { Todo } from '@/components/legal/LegalBlocks'
import type { Lang } from '@/locales/landing'

/**
 * Clauses d'abonnement PARTAGÉES par les CGU (§ 8) et les CGV (§ 2 à 5) — le
 * texte, dans les deux langues. Le rendu vit dans
 * `src/components/legal/SubscriptionTerms.tsx`.
 *
 * Un seul texte rendu à deux endroits, plutôt que deux copies : les deux
 * documents doivent dire EXACTEMENT la même chose sur le prix, la reconduction,
 * l'impayé et la résiliation, et deux copies finiraient par diverger — c'est
 * alors la moins favorable au professionnel qui l'emporterait (art. L211-1 :
 * un doute s'interprète en faveur du consommateur). La contrainte vaut
 * désormais aussi ENTRE LES LANGUES : `typeof subscriptionFr` force
 * `subscriptionEn` à porter exactement les mêmes clauses.
 *
 * ⚠️ Module FEUILLE, importé directement par `SubscriptionTerms.tsx` et pas via
 * `./index` : l'index importe les dictionnaires de pages, qui rendent eux-mêmes
 * `<SubscriptionOffer />`. Passer par l'index formerait un cycle.
 *
 * ⚠️ Les MONTANTS ne sont pas dans le dictionnaire : ils viennent de
 * `PRICING_TIERS` et sont injectés déjà formatés dans la langue courante. Le
 * document légal ne peut pas annoncer un autre prix que la page de vente.
 *
 * ⚠️ Noms de paliers : la valeur en base (`profiles.tier`) reste « Forgeron » /
 * « Maître », mais le libellé AFFICHÉ suit la langue, comme sur la grille
 * tarifaire et dans la modale de paiement (`pricing.tiers[i].name` de
 * `locales/landing.ts`, qui dit « Blacksmith » et « Master » en anglais). Un
 * contrat qui nommerait le palier autrement que l'écran de souscription serait
 * illisible pour l'abonné.
 */

/** Clause dont le texte dépend de montants déjà formatés dans la bonne langue. */
type PricedClause = (monthly: string, annual: string) => React.ReactNode

export const subscriptionFr = {
  /* ── Paliers, contenu et prix ── */
  offerIntro: "Wyrm Forge propose trois paliers, sur le site comme dans l'application de bureau :",
  offerFree: (
    <><strong>Apprenti — gratuit.</strong> Accès au site et à l&apos;application de bureau,
      avec des limites d&apos;usage. Cette offre gratuite reste disponible en permanence.</>
  ),
  offerForgeron: ((monthly, annual) => (
    <><strong>Forgeron — {monthly} par mois, ou {annual} par an.</strong> Limites d&apos;usage
      relevées.</>
  )) as PricedClause,
  offerMaitre: ((monthly, annual) => (
    <><strong>Maître — {monthly} par mois, ou {annual} par an.</strong> Limites d&apos;usage
      les plus larges, et un modèle d&apos;intelligence artificielle plus avancé pour les
      analyses.</>
  )) as PricedClause,
  /** `{months}` = `FREE_MONTHS_ON_ANNUAL`. */
  offerAnnualEquivalence:
    'Le tarif annuel équivaut à {months} mois offerts par rapport au tarif mensuel.',
  offerAiCredits: (
    <>
      <strong>Analyses par intelligence artificielle</strong> — chaque palier dispose d&apos;une
      réserve hebdomadaire de crédits (« Chaleur de la Forge »), commune à toutes les analyses
      IA : <strong>15 crédits</strong> pour Apprenti, <strong>65</strong> pour Forgeron,{' '}
      <strong>135</strong> pour Maître. Chaque analyse consomme un nombre de crédits qui dépend
      de son type, indiqué dans l&apos;interface. La réserve se renouvelle chaque lundi à
      0 h (UTC) ; les crédits non utilisés ne sont pas reportés.
    </>
  ),
  offerOtherLimits:
    'Le détail des autres fonctionnalités et limites de chaque palier est présenté sur la '
    + 'grille tarifaire au moment de la souscription.',

  /* ── Prix, devise, moyens de paiement, codes promo, date de prélèvement ── */
  paymentCurrency: (
    <>Les prix sont indiqués <strong>en euros</strong>.{' '}
      <Todo>mention de TVA : prix TTC, ou « TVA non applicable, art. 293 B du CGI »</Todo></>
  ),
  paymentProcessor: (
    <>Le paiement est traité par notre prestataire <strong>Stripe</strong>, sur une page de
      paiement sécurisée. Aucune donnée de carte bancaire n&apos;est transmise à Wyrm Forge ni
      conservée par nous.</>
  ),
  paymentMethods: (
    <>Moyens de paiement acceptés : <strong>carte bancaire</strong> et, selon ton appareil et
      ton navigateur, les portefeuilles électroniques proposés par Stripe (Apple Pay,
      Google Pay, Link). Les moyens disponibles sont ceux affichés sur la page de paiement.</>
  ),
  paymentPromo: (
    <>Un <strong>code promotionnel</strong> peut être saisi sur la page de paiement. Le
      montant de la réduction, sa durée et ses éventuelles conditions y sont affichés avant la
      validation du paiement ; à l&apos;issue de la durée de la réduction, le prix normal
      s&apos;applique.</>
  ),
  paymentSchedule: (
    <>Le prix de la première période est prélevé <strong>à la souscription</strong>.
      L&apos;abonnement est ensuite renouvelé automatiquement <strong>à la date anniversaire
      de la souscription</strong> — chaque mois ou chaque année selon la périodicité
      choisie — et le prix de la nouvelle période est prélevé ce jour-là sur le moyen de
      paiement enregistré.</>
  ),
  paymentReceipts: (
    <>Chaque paiement donne lieu à un reçu émis par Stripe.{' '}
      <Todo>confirmer l&apos;envoi automatique des reçus par e-mail dans le Dashboard Stripe
        (mode live)</Todo></>
  ),

  /* ── Durée, absence d'engagement, chemin de résiliation ── */
  cancelNoCommitment: (
    <><strong>Aucune durée minimale d&apos;engagement.</strong> L&apos;abonnement se
      poursuit par périodes successives d&apos;un mois ou d&apos;un an, tant qu&apos;il
      n&apos;est pas résilié.</>
  ),
  cancelPath: (
    <><strong>Résiliable à tout moment, en quelques clics</strong> : depuis ta page{' '}
      <Link href="/profil" style={{ color: 'var(--gold-pale)' }}>Profil</Link>, section
      « Abonnement », bouton <strong>« Résilier mon abonnement »</strong>, qui ouvre
      directement l&apos;écran de résiliation de la page sécurisée de Stripe, puis
      confirmation. Tu peux aussi nous écrire à{' '}
      <a href="mailto:contact@wyrm-forge.com" style={{ color: 'var(--gold-pale)' }}>
        contact@wyrm-forge.com</a>.</>
  ),
  cancelEffect: (
    <>La résiliation prend effet <strong>à la fin de la période déjà payée</strong> :
      aucun nouveau prélèvement n&apos;a lieu, et tu conserves l&apos;accès à ton palier
      jusqu&apos;à cette date. Tant qu&apos;elle n&apos;est pas atteinte, tu peux annuler ta
      résiliation depuis le portail.</>
  ),
  cancelConfirmationEmail: (
    <>Ta résiliation t&apos;est confirmée par e-mail, avec la date jusqu&apos;à laquelle
      ton accès reste actif.</>
  ),
  cancelPortal: (
    <>Le bouton « Moyen de paiement et factures » ouvre le même portail pour consulter tes
      factures, changer de moyen de paiement ou réactiver un abonnement résilié avant son
      échéance. S&apos;il te propose de changer de palier ou de périodicité, le prix et la
      date d&apos;effet du changement te sont indiqués avant validation.</>
  ),

  /* ── Politique d'impayé ── */
  unpaidRetries: (
    <>Si un prélèvement échoue, Stripe procède à <strong>de nouvelles tentatives pendant
      environ une semaine</strong>, et t&apos;invite à mettre à jour ton moyen de paiement.
      <strong> Ton accès à ton palier est maintenu pendant cette période.</strong></>
  ),
  unpaidRevoked: (
    <>Si le paiement n&apos;a toujours pas abouti au terme de ces tentatives,
      l&apos;abonnement est suspendu pour impayé et ton compte <strong>repasse au palier
      gratuit Apprenti</strong>. Tes contenus sont conservés ; seules les limites du palier
      gratuit s&apos;appliquent de nouveau. Tu peux souscrire de nouveau à tout moment.</>
  ),
  unpaidPending: (
    <>L&apos;accès payant n&apos;est pas ouvert tant qu&apos;un premier paiement attend
      encore sa validation (par exemple une authentification auprès de ta banque), ni pendant
      une éventuelle suspension de l&apos;abonnement, et il prend fin à la date d&apos;effet
      d&apos;une résiliation.</>
  ),
  unpaidFallback: (
    <>Dans toute autre situation technique non prévue ci-dessus, l&apos;accès déjà payé est
      conservé jusqu&apos;à la fin de la période en cours.</>
  ),

  /* ── Évolution des prix et du contenu d'un abonnement en cours ── */
  priceChanges: (
    <>
      Nous pouvons faire évoluer nos prix et le contenu de nos paliers. Un nouveau prix ne
      s&apos;applique à un abonnement en cours qu&apos;à partir d&apos;un renouvellement, et
      seulement après que tu en as été informé par e-mail au moins 30 jours à l&apos;avance ;
      tu peux résilier avant cette date sans frais. Une modification qui réduirait de manière
      significative le contenu de ton palier est soumise à la même information préalable et
      t&apos;ouvre le même droit de résilier sans frais.
    </>
  ),
}

export type SubscriptionDict = typeof subscriptionFr

export const subscriptionEn: SubscriptionDict = {
  offerIntro:
    'Wyrm Forge offers three tiers, on the website as well as in the desktop application:',
  offerFree: (
    <><strong>Apprentice — free.</strong> Access to the website and to the desktop application,
      with usage limits. This free tier remains permanently available.</>
  ),
  offerForgeron: ((monthly, annual) => (
    <><strong>Blacksmith — {monthly} per month, or {annual} per year.</strong> Higher usage
      limits.</>
  )) as PricedClause,
  offerMaitre: ((monthly, annual) => (
    <><strong>Master — {monthly} per month, or {annual} per year.</strong> The widest usage
      limits, and a more advanced artificial intelligence model for analyses.</>
  )) as PricedClause,
  offerAnnualEquivalence:
    'The annual rate amounts to {months} months free compared with the monthly rate.',
  offerAiCredits: (
    <>
      <strong>Artificial intelligence analyses</strong> — each tier has a weekly allowance of
      credits (“Forge Heat”), shared across every AI analysis: <strong>15 credits</strong> for
      Apprentice, <strong>65</strong> for Blacksmith, <strong>135</strong> for Master. Each
      analysis consumes a number of credits that depends on its type, shown in the interface.
      The allowance is renewed every Monday at 00:00 (UTC); unused credits are not carried over.
    </>
  ),
  offerOtherLimits:
    'The detail of the other features and limits of each tier is presented on the pricing '
    + 'table at the time of subscription.',

  paymentCurrency: (
    <>Prices are stated <strong>in euros</strong>.{' '}
      <Todo>VAT wording: prices inclusive of VAT, or the French small-business exemption
        “TVA non applicable, art. 293 B du CGI” (VAT not applicable)</Todo></>
  ),
  paymentProcessor: (
    <>Payment is handled by our provider <strong>Stripe</strong>, on a secure payment page. No
      bank card data is transmitted to Wyrm Forge, nor stored by us.</>
  ),
  paymentMethods: (
    <>Accepted means of payment: <strong>bank card</strong> and, depending on your device and
      your browser, the electronic wallets offered by Stripe (Apple Pay, Google Pay, Link). The
      available means are those displayed on the payment page.</>
  ),
  paymentPromo: (
    <>A <strong>promotional code</strong> may be entered on the payment page. The amount of the
      discount, its duration and any conditions attached to it are displayed there before the
      payment is confirmed; once the discount period ends, the standard price applies.</>
  ),
  paymentSchedule: (
    <>The price of the first period is charged <strong>on subscription</strong>. The
      subscription is then renewed automatically <strong>on the anniversary date of the
      subscription</strong> — every month or every year depending on the frequency chosen — and
      the price of the new period is charged that day to the payment method on file.</>
  ),
  paymentReceipts: (
    <>Every payment gives rise to a receipt issued by Stripe.{' '}
      <Todo>confirm that automatic receipt emails are enabled in the Stripe Dashboard
        (live mode)</Todo></>
  ),

  cancelNoCommitment: (
    <><strong>No minimum commitment period.</strong> The subscription continues for successive
      periods of one month or one year, for as long as it is not cancelled.</>
  ),
  cancelPath: (
    <><strong>Cancellable at any time, in a few clicks</strong>: from your{' '}
      <Link href="/profil" style={{ color: 'var(--gold-pale)' }}>Profile</Link> page,
      “Subscription” section, button <strong>“Cancel my subscription”</strong>, which opens the
      cancellation screen of Stripe&apos;s secure page directly, then confirmation. You may also
      write to us at{' '}
      <a href="mailto:contact@wyrm-forge.com" style={{ color: 'var(--gold-pale)' }}>
        contact@wyrm-forge.com</a>.</>
  ),
  cancelEffect: (
    <>Cancellation takes effect <strong>at the end of the period already paid for</strong>: no
      further charge is made, and you keep access to your tier until that date. Until that date
      is reached, you may reverse your cancellation from the portal.</>
  ),
  cancelConfirmationEmail: (
    <>Your cancellation is confirmed to you by email, stating the date until which your access
      remains active.</>
  ),
  cancelPortal: (
    <>The “Payment method and invoices” button opens the same portal, to view your invoices,
      change your payment method or reactivate a subscription cancelled before its expiry date.
      If it offers you a change of tier or of billing frequency, the price and the effective
      date of the change are shown to you before you confirm.</>
  ),

  unpaidRetries: (
    <>If a charge fails, Stripe makes <strong>further attempts over about one week</strong>, and
      invites you to update your payment method.
      <strong> Your access to your tier is maintained during that period.</strong></>
  ),
  unpaidRevoked: (
    <>If the payment still has not succeeded at the end of those attempts, the subscription is
      suspended for non-payment and your account <strong>returns to the free Apprentice
      tier</strong>. Your content is kept; only the limits of the free tier apply again. You may
      subscribe again at any time.</>
  ),
  unpaidPending: (
    <>Paid access is not opened while a first payment is still awaiting validation (for example
      an authentication with your bank), nor during any suspension of the subscription, and it
      ends on the effective date of a cancellation.</>
  ),
  unpaidFallback: (
    <>In any other technical situation not covered above, access already paid for is kept until
      the end of the current period.</>
  ),

  priceChanges: (
    <>
      We may change our prices and the content of our tiers. A new price applies to an ongoing
      subscription only from a renewal onwards, and only after you have been informed of it by
      email at least 30 days in advance; you may cancel before that date free of charge. A
      change that would significantly reduce the content of your tier is subject to the same
      prior information and gives you the same right to cancel free of charge.
    </>
  ),
}

export const subscriptionDicts: Record<Lang, SubscriptionDict> = {
  fr: subscriptionFr,
  en: subscriptionEn,
}
