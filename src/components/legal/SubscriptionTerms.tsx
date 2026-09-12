'use client'

import { List } from '@/components/legal/LegalBlocks'
import { useLanguage } from '@/components/providers/LanguageProvider'
import { PRICING_TIERS, FREE_MONTHS_ON_ANNUAL } from '@/lib/pricing-tiers'
import { formatPrice } from '@/locales/landing'
import { subscriptionDicts } from '@/locales/legal/subscription'

/* Clauses d'abonnement PARTAGÉES par les CGU (§ 8) et les CGV (§ 2 à 5).
 *
 * Un seul texte rendu à deux endroits, plutôt que deux copies : les deux
 * documents doivent dire EXACTEMENT la même chose sur le prix, la reconduction,
 * l'impayé et la résiliation, et deux copies finiraient par diverger — c'est
 * alors la moins favorable au professionnel qui l'emporterait (art. L211-1 :
 * un doute s'interprète en faveur du consommateur).
 *
 * Les TEXTES vivent dans `src/locales/legal/subscription.tsx` (FR + EN) depuis
 * le chantier de traduction : le fichier ne porte plus que la mise en forme et
 * l'injection des montants. Il est importé DIRECTEMENT, sans passer par
 * `locales/legal/index` — voir l'avertissement de cycle en tête de ce module.
 *
 * Les MONTANTS viennent de `PRICING_TIERS`, la même source que la grille
 * tarifaire : le document légal ne peut pas annoncer un autre prix que la page
 * de vente, et il l'affiche dans la langue lue (« 3 € » / « €3 »). ⚠️ Un
 * changement de prix n'est pas pour autant « automatique » côté contrat : il
 * impose d'avancer la date des CGV (`CGV_VERSION`) et d'informer les abonnés en
 * cours — voir `PriceChanges` ci-dessous.
 *
 * Chaque affirmation de ces clauses correspond à un comportement VÉRIFIÉ du
 * code au 2026-09-11 — la source est citée en commentaire à côté. Modifier le
 * comportement sans relire le texte, c'est rendre le contrat faux. */

const tier = (name: string) => {
  const t = PRICING_TIERS.find(p => p.name === name)
  if (!t) throw new Error(`Palier ${name} absent de PRICING_TIERS`)
  return t
}

/** Dictionnaire des clauses dans la langue courante. */
const useSubscriptionTerms = () => subscriptionDicts[useLanguage().lang]

/** Paliers, contenu et prix. */
export function SubscriptionOffer() {
  const { lang } = useLanguage()
  const d = useSubscriptionTerms()
  const eur = (n: number) => formatPrice(n, lang)

  const forgeron = tier('Forgeron')
  const maitre = tier('Maître')

  return (
    <>
      <p>{d.offerIntro}</p>
      <List>
        <li>{d.offerFree}</li>
        <li>{d.offerForgeron(eur(forgeron.monthly), eur(forgeron.annual))}</li>
        <li>{d.offerMaitre(eur(maitre.monthly), eur(maitre.annual))}</li>
      </List>
      <p style={{ marginTop: 10 }}>
        {d.offerAnnualEquivalence.replace('{months}', String(FREE_MONTHS_ON_ANNUAL))}
      </p>
      {/* Réserve IA : `TIER_CONFIG` de supabase/functions/matchup-analyze et
          postgame-analyze (pot commun `consume_ai_credits`, semaine calendaire
          lundi 00:00 UTC, aucun report). Seule limite réellement appliquée côté
          serveur à ce jour — c'est pourquoi elle est chiffrée ici. */}
      <p style={{ marginTop: 10 }}>{d.offerAiCredits}</p>
      {/* Grille tarifaire ALIGNÉE sur ces chiffres le 2026-09-11 (décision HORTAL :
          la réalité serveur fait foi) ; `landing.test.ts` verrouille la concordance
          grille ↔ `TIER_CONFIG`. Les AUTRES limites de la grille (blocs d'overlay,
          imports workshop, builds…) ne sont pas encore appliquées côté serveur :
          l'abonné reçoit donc au moins ce qui est annoncé, jamais moins. */}
      <p style={{ marginTop: 10 }}>{d.offerOtherLimits}</p>
    </>
  )
}

/** Prix, devise, moyens de paiement, codes promo, date de prélèvement. */
export function PaymentTerms() {
  const d = useSubscriptionTerms()
  return (
    <List>
      {/* À COMPLÉTER PAR HORTAL — régime de TVA en attente de Dougs (voir le
          commentaire de `locales/legal/mentions.tsx`). Assujetti → « prix TTC » ;
          franchise en base → « TVA non applicable, art. 293 B du CGI ». Les deux
          mentions sont exclusives : ne pas écrire « TTC » par défaut. */}
      <li>{d.paymentCurrency}</li>
      {/* Paiement : Stripe Checkout (`/api/stripe/checkout`), aucune donnée de
          carte ne transite par nos serveurs. */}
      <li>{d.paymentProcessor}</li>
      {/* Moyens configurés côté Stripe, relevés le 2026-09-11 en mode TEST
          (payment_method_configurations : card, apple_pay, google_pay, link).
          ⚠️ À re-vérifier en mode LIVE avant l'ouverture des ventes : la
          configuration live est distincte et ne se recopie pas. */}
      <li>{d.paymentMethods}</li>
      {/* `allow_promotion_codes: true` dans la route de checkout. */}
      <li>{d.paymentPromo}</li>
      {/* Stripe Billing : facturation à la souscription, puis à chaque échéance
          du cycle (billing_cycle_anchor = date de souscription). */}
      <li>{d.paymentSchedule}</li>
      <li>{d.paymentReceipts}</li>
    </List>
  )
}

/** Durée, absence d'engagement, chemin de résiliation. */
export function CancellationTerms() {
  const d = useSubscriptionTerms()
  return (
    <List>
      <li>{d.cancelNoCommitment}</li>
      {/* Chemin réel : SubscriptionSection de src/app/profil/page.tsx → bouton
          `cancelSubscription` (« Résilier mon abonnement ») → POST
          /api/stripe/portal `{ flow: 'cancel' }` → portail Stripe ouvert
          DIRECTEMENT sur l'écran de résiliation (flux `subscription_cancel`),
          configuré en `at_period_end`, sans prorata (relevé le 2026-09-11 en
          mode TEST). Décret n° 2023-417 : mention sans ambiguïté.
          ⚠️ Le portail (test) a le sondage « motif de résiliation » ACTIVÉ : d'où
          « quelques clics » et pas un nombre exact. À désactiver ou à garder
          facultatif en live — la résiliation ne doit jamais être conditionnée à
          une réponse. */}
      <li>{d.cancelPath}</li>
      {/* `cancel_at_period_end` : le webhook conserve le palier jusqu'à
          `current_period_end`, puis `customer.subscription.deleted` le retire. */}
      <li>{d.cancelEffect}</li>
      {/* L215-1-1 : confirmation de la résiliation — gabarit
          `cancellation_confirmation` de l'EF `subscription-emails`. */}
      <li>{d.cancelConfirmationEmail}</li>
      <li>{d.cancelPortal}</li>
    </List>
  )
}

/** Politique d'impayé — traduction en clair de `resolveTierOutcome` (plans.ts). */
export function UnpaidPolicy() {
  const d = useSubscriptionTerms()
  return (
    <List>
      {/* `past_due` → GRACE_STATUSES : palier conservé pendant les relances. */}
      <li>{d.unpaidRetries}</li>
      {/* `unpaid` → REVOKED_STATUSES : retour à `apprenti`. */}
      <li>{d.unpaidRevoked}</li>
      {/* `incomplete`, `paused`, `canceled`, `incomplete_expired` → REVOKED. */}
      <li>{d.unpaidPending}</li>
      {/* Statut Stripe inconnu → accès CONSERVÉ, borné par la fin de période. */}
      <li>{d.unpaidFallback}</li>
    </List>
  )
}

/** Évolution des prix et du contenu d'un abonnement en cours. */
export function PriceChanges() {
  const d = useSubscriptionTerms()
  return <p>{d.priceChanges}</p>
}
