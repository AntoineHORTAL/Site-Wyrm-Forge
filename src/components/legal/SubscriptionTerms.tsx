import Link from 'next/link'
import { List, Todo } from '@/components/legal/LegalPage'
import { PRICING_TIERS, FREE_MONTHS_ON_ANNUAL } from '@/lib/pricing-tiers'
import { formatPrice } from '@/locales/landing'

/* Clauses d'abonnement PARTAGÉES par les CGU (§ 8) et les CGV (§ 2 à 5).
 *
 * Un seul texte rendu à deux endroits, plutôt que deux copies : les deux
 * documents doivent dire EXACTEMENT la même chose sur le prix, la reconduction,
 * l'impayé et la résiliation, et deux copies finiraient par diverger — c'est
 * alors la moins favorable au professionnel qui l'emporterait (art. L211-1 :
 * un doute s'interprète en faveur du consommateur).
 *
 * Les MONTANTS viennent de `PRICING_TIERS`, la même source que la grille
 * tarifaire : le document légal ne peut pas annoncer un autre prix que la page
 * de vente. ⚠️ Un changement de prix n'est pas pour autant « automatique » côté
 * contrat : il impose d'avancer la date des CGV (`CGV_VERSION`) et d'informer
 * les abonnés en cours — voir `PriceChanges` ci-dessous.
 *
 * Chaque affirmation de ces clauses correspond à un comportement VÉRIFIÉ du
 * code au 2026-09-11 — la source est citée en commentaire à côté. Modifier le
 * comportement sans relire le texte, c'est rendre le contrat faux. */

const tier = (name: string) => {
  const t = PRICING_TIERS.find(p => p.name === name)
  if (!t) throw new Error(`Palier ${name} absent de PRICING_TIERS`)
  return t
}
const eur = (n: number) => formatPrice(n, 'fr')

/** Paliers, contenu et prix. */
export function SubscriptionOffer() {
  const forgeron = tier('Forgeron')
  const maitre = tier('Maître')

  return (
    <>
      <p>Wyrm Forge propose trois paliers, sur le site comme dans l&apos;application de bureau :</p>
      <List>
        <li><strong>Apprenti — gratuit.</strong> Accès au site et à l&apos;application de bureau,
          avec des limites d&apos;usage. Cette offre gratuite reste disponible en permanence.</li>
        <li><strong>Forgeron — {eur(forgeron.monthly)} par mois, ou {eur(forgeron.annual)} par
          an.</strong> Limites d&apos;usage relevées.</li>
        <li><strong>Maître — {eur(maitre.monthly)} par mois, ou {eur(maitre.annual)} par
          an.</strong> Limites d&apos;usage les plus larges, et un modèle d&apos;intelligence
          artificielle plus avancé pour les analyses.</li>
      </List>
      <p style={{ marginTop: 10 }}>
        Le tarif annuel équivaut à {FREE_MONTHS_ON_ANNUAL} mois offerts par rapport au tarif
        mensuel.
      </p>
      {/* Réserve IA : `TIER_CONFIG` de supabase/functions/matchup-analyze et
          postgame-analyze (pot commun `consume_ai_credits`, semaine calendaire
          lundi 00:00 UTC, aucun report). Seule limite réellement appliquée côté
          serveur à ce jour — c'est pourquoi elle est chiffrée ici. */}
      <p style={{ marginTop: 10 }}>
        <strong>Analyses par intelligence artificielle</strong> — chaque palier dispose d&apos;une
        réserve hebdomadaire de crédits (« Chaleur de la Forge »), commune à toutes les analyses
        IA : <strong>15 crédits</strong> pour Apprenti, <strong>65</strong> pour Forgeron,{' '}
        <strong>135</strong> pour Maître. Chaque analyse consomme un nombre de crédits qui dépend
        de son type, indiqué dans l&apos;interface. La réserve se renouvelle chaque lundi à
        0 h (UTC) ; les crédits non utilisés ne sont pas reportés.
      </p>
      {/* Grille tarifaire ALIGNÉE sur ces chiffres le 2026-09-11 (décision HORTAL :
          la réalité serveur fait foi) ; `landing.test.ts` verrouille la concordance
          grille ↔ `TIER_CONFIG`. Les AUTRES limites de la grille (blocs d'overlay,
          imports workshop, builds…) ne sont pas encore appliquées côté serveur :
          l'abonné reçoit donc au moins ce qui est annoncé, jamais moins. */}
      <p style={{ marginTop: 10 }}>
        Le détail des autres fonctionnalités et limites de chaque palier est présenté sur la
        grille tarifaire au moment de la souscription.
      </p>
    </>
  )
}

/** Prix, devise, moyens de paiement, codes promo, date de prélèvement. */
export function PaymentTerms() {
  return (
    <List>
      {/* À COMPLÉTER PAR HORTAL — régime de TVA en attente de Dougs (voir le
          commentaire de mentions-legales/page.tsx). Assujetti → « prix TTC » ;
          franchise en base → « TVA non applicable, art. 293 B du CGI ». Les deux
          mentions sont exclusives : ne pas écrire « TTC » par défaut. */}
      <li>Les prix sont indiqués <strong>en euros</strong>.{' '}
        <Todo>mention de TVA : prix TTC, ou « TVA non applicable, art. 293 B du CGI »</Todo></li>
      {/* Paiement : Stripe Checkout (`/api/stripe/checkout`), aucune donnée de
          carte ne transite par nos serveurs. */}
      <li>Le paiement est traité par notre prestataire <strong>Stripe</strong>, sur une page de
        paiement sécurisée. Aucune donnée de carte bancaire n&apos;est transmise à Wyrm Forge ni
        conservée par nous.</li>
      {/* Moyens configurés côté Stripe, relevés le 2026-09-11 en mode TEST
          (payment_method_configurations : card, apple_pay, google_pay, link).
          ⚠️ À re-vérifier en mode LIVE avant l'ouverture des ventes : la
          configuration live est distincte et ne se recopie pas. */}
      <li>Moyens de paiement acceptés : <strong>carte bancaire</strong> et, selon ton appareil et
        ton navigateur, les portefeuilles électroniques proposés par Stripe (Apple Pay,
        Google Pay, Link). Les moyens disponibles sont ceux affichés sur la page de paiement.</li>
      {/* `allow_promotion_codes: true` dans la route de checkout. */}
      <li>Un <strong>code promotionnel</strong> peut être saisi sur la page de paiement. Le
        montant de la réduction, sa durée et ses éventuelles conditions y sont affichés avant la
        validation du paiement ; à l&apos;issue de la durée de la réduction, le prix normal
        s&apos;applique.</li>
      {/* Stripe Billing : facturation à la souscription, puis à chaque échéance
          du cycle (billing_cycle_anchor = date de souscription). */}
      <li>Le prix de la première période est prélevé <strong>à la souscription</strong>.
        L&apos;abonnement est ensuite renouvelé automatiquement <strong>à la date anniversaire
        de la souscription</strong> — chaque mois ou chaque année selon la périodicité
        choisie — et le prix de la nouvelle période est prélevé ce jour-là sur le moyen de
        paiement enregistré.</li>
      <li>Chaque paiement donne lieu à un reçu émis par Stripe.{' '}
        <Todo>confirmer l&apos;envoi automatique des reçus par e-mail dans le Dashboard Stripe (mode live)</Todo></li>
    </List>
  )
}

/** Durée, absence d'engagement, chemin de résiliation. */
export function CancellationTerms() {
  return (
    <>
      <List>
        <li><strong>Aucune durée minimale d&apos;engagement.</strong> L&apos;abonnement se
          poursuit par périodes successives d&apos;un mois ou d&apos;un an, tant qu&apos;il
          n&apos;est pas résilié.</li>
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
        <li><strong>Résiliable à tout moment, en quelques clics</strong> : depuis ta page{' '}
          <Link href="/profil" style={{ color: 'var(--gold-pale)' }}>Profil</Link>, section
          « Abonnement », bouton <strong>« Résilier mon abonnement »</strong>, qui ouvre
          directement l&apos;écran de résiliation de la page sécurisée de Stripe, puis
          confirmation. Tu peux aussi nous écrire à{' '}
          <a href="mailto:contact@wyrm-forge.com" style={{ color: 'var(--gold-pale)' }}>
            contact@wyrm-forge.com</a>.</li>
        {/* `cancel_at_period_end` : le webhook conserve le palier jusqu'à
            `current_period_end`, puis `customer.subscription.deleted` le retire. */}
        <li>La résiliation prend effet <strong>à la fin de la période déjà payée</strong> :
          aucun nouveau prélèvement n&apos;a lieu, et tu conserves l&apos;accès à ton palier
          jusqu&apos;à cette date. Tant qu&apos;elle n&apos;est pas atteinte, tu peux annuler ta
          résiliation depuis le portail.</li>
        <li>Le bouton « Moyen de paiement et factures » ouvre le même portail pour consulter tes
          factures, changer de moyen de paiement ou réactiver un abonnement résilié avant son
          échéance. S&apos;il te propose de changer de palier ou de périodicité, le prix et la
          date d&apos;effet du changement te sont indiqués avant validation.</li>
      </List>
    </>
  )
}

/** Politique d'impayé — traduction en clair de `resolveTierOutcome` (plans.ts). */
export function UnpaidPolicy() {
  return (
    <List>
      {/* `past_due` → GRACE_STATUSES : palier conservé pendant les relances. */}
      <li>Si un prélèvement échoue, Stripe procède à <strong>de nouvelles tentatives pendant
        environ une semaine</strong>, et t&apos;invite à mettre à jour ton moyen de paiement.
        <strong> Ton accès à ton palier est maintenu pendant cette période.</strong></li>
      {/* `unpaid` → REVOKED_STATUSES : retour à `apprenti`. */}
      <li>Si le paiement n&apos;a toujours pas abouti au terme de ces tentatives,
        l&apos;abonnement est suspendu pour impayé et ton compte <strong>repasse au palier
        gratuit Apprenti</strong>. Tes contenus sont conservés ; seules les limites du palier
        gratuit s&apos;appliquent de nouveau. Tu peux souscrire de nouveau à tout moment.</li>
      {/* `incomplete`, `paused`, `canceled`, `incomplete_expired` → REVOKED. */}
      <li>L&apos;accès payant n&apos;est pas ouvert tant qu&apos;un premier paiement attend
        encore sa validation (par exemple une authentification auprès de ta banque), ni pendant
        une éventuelle suspension de l&apos;abonnement, et il prend fin à la date d&apos;effet
        d&apos;une résiliation.</li>
      {/* Statut Stripe inconnu → accès CONSERVÉ, borné par la fin de période. */}
      <li>Dans toute autre situation technique non prévue ci-dessus, l&apos;accès déjà payé est
        conservé jusqu&apos;à la fin de la période en cours.</li>
    </List>
  )
}

/** Évolution des prix et du contenu d'un abonnement en cours. */
export function PriceChanges() {
  return (
    <p>
      Nous pouvons faire évoluer nos prix et le contenu de nos paliers. Un nouveau prix ne
      s&apos;applique à un abonnement en cours qu&apos;à partir d&apos;un renouvellement, et
      seulement après que tu en as été informé par e-mail au moins 30 jours à l&apos;avance ;
      tu peux résilier avant cette date sans frais. Une modification qui réduirait de manière
      significative le contenu de ton palier est soumise à la même information préalable et
      t&apos;ouvre le même droit de résilier sans frais.
    </p>
  )
}
