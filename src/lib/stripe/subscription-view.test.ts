import { describe, it, expect } from 'vitest'
import { resolveSubscriptionView, canCancelSubscription, type SubscriptionRow } from './subscription-view'
import { FREE_TIER } from '../subscription'

/** Ligne d'abonnement type — surchargée champ par champ dans chaque test. */
function row(over: Partial<SubscriptionRow> = {}): SubscriptionRow {
  return {
    stripe_customer_id: 'cus_123',
    status: 'active',
    cancel_at_period_end: false,
    current_period_end: '2026-10-09T00:00:00.000Z',
    ...over,
  }
}

const EXPIRES = '2026-10-09T00:00:00.000Z'

describe('les trois situations d\'un compte', () => {
  it('palier gratuit → `free`, aucune date affichée', () => {
    const v = resolveSubscriptionView({ tier: FREE_TIER, tierExpiresAt: null })

    expect(v.kind).toBe('free')
    expect(v.expiresAt).toBeNull()
  })

  it('palier payant AVEC date → `paid`, la date est affichée', () => {
    const v = resolveSubscriptionView({ tier: 'forgeron', tierExpiresAt: EXPIRES, subscription: row() })

    expect(v.kind).toBe('paid')
    expect(v.expiresAt).toBe(EXPIRES)
  })

  it('palier payant SANS date → `lifetime` — `null` veut dire « à vie » ici', () => {
    // C'est la convention du schéma (badge « à vie » de l'en-tête,
    // `SubscriptionReminder` qui exclut ces comptes). Traiter ce cas comme un
    // abonnement afficherait « renouvellement le … » sans aucune date.
    const v = resolveSubscriptionView({ tier: 'maître', tierExpiresAt: null })

    expect(v.kind).toBe('lifetime')
    expect(v.expiresAt).toBeNull()
  })

  it('ignore une date traînant sur un palier gratuit', () => {
    // Un `apprenti` n'a rien qui expire : afficher une échéance héritée d'un
    // ancien abonnement laisserait croire à un accès encore en cours.
    const v = resolveSubscriptionView({ tier: FREE_TIER, tierExpiresAt: EXPIRES })

    expect(v.kind).toBe('free')
    expect(v.expiresAt).toBeNull()
  })
})

describe('le palier se lit comme partout ailleurs', () => {
  it('normalise la casse — `isPaidTier` le fait déjà, on ne le refait pas ici', () => {
    expect(resolveSubscriptionView({ tier: 'Apprenti', tierExpiresAt: null }).kind).toBe('free')
    expect(resolveSubscriptionView({ tier: '  MAÎTRE ', tierExpiresAt: null }).kind).toBe('lifetime')
  })

  it('un palier INCONNU est payant par défaut, jamais gratuit en silence', () => {
    // Même raisonnement que `isPaidTier` : un palier ajouté demain doit garder
    // ses accès, pas les perdre sans que personne ne s'en aperçoive.
    const v = resolveSubscriptionView({ tier: 'monarque', tierExpiresAt: EXPIRES, subscription: row() })

    expect(v.kind).toBe('paid')
  })

  it('profil non chargé → `free`, et un palier affichable malgré tout', () => {
    // La section ne doit jamais rendre un libellé vide : `subscriptionTierLabel`
    // reçoit une valeur, quitte à ce que ce soit le repli gratuit.
    for (const tier of [null, undefined, '', '   ']) {
      const v = resolveSubscriptionView({ tier, tierExpiresAt: null })
      expect(v.kind).toBe('free')
      expect(v.tier).toBe(FREE_TIER)
    }
  })

  it('renvoie la valeur BRUTE du palier — accent compris', () => {
    // C'est cette valeur qui indexe `subscriptionTierLabel` et `TIER_COLORS` :
    // la normaliser ici casserait les deux (`maitre` n'y existe pas).
    expect(resolveSubscriptionView({ tier: 'maître', tierExpiresAt: EXPIRES }).tier).toBe('maître')
  })
})

describe('accès au portail de facturation', () => {
  it("ouvert dès qu'un client Stripe existe", () => {
    const v = resolveSubscriptionView({ tier: 'forgeron', tierExpiresAt: EXPIRES, subscription: row() })

    expect(v.canManageBilling).toBe(true)
  })

  it('reste ouvert à un ancien abonné redescendu au gratuit', () => {
    // Factures, moyen de paiement et réactivation vivent dans le portail. Le
    // fermer ici obligerait cette personne à écrire un mail.
    const v = resolveSubscriptionView({
      tier: FREE_TIER,
      tierExpiresAt: null,
      subscription: row({ status: 'canceled' }),
    })

    expect(v.kind).toBe('free')
    expect(v.canManageBilling).toBe(true)
  })

  it('fermé sans ligne d\'abonnement — rien à gérer', () => {
    // C'est exactement ce que la route `/api/stripe/portal` refuse en 404 :
    // le bouton ne doit jamais être affiché dans un cas qu'elle rejette.
    expect(resolveSubscriptionView({ tier: FREE_TIER, tierExpiresAt: null }).canManageBilling).toBe(false)
    expect(resolveSubscriptionView({ tier: 'maître', tierExpiresAt: EXPIRES, subscription: null }).canManageBilling).toBe(false)
  })

  it('fermé si la ligne existe SANS `stripe_customer_id`', () => {
    const v = resolveSubscriptionView({
      tier: 'forgeron',
      tierExpiresAt: EXPIRES,
      subscription: row({ stripe_customer_id: null }),
    })

    expect(v.canManageBilling).toBe(false)
  })
})

describe('résiliation programmée', () => {
  it('signale `cancel_at_period_end` — même date, sens opposé', () => {
    const v = resolveSubscriptionView({
      tier: 'maître',
      tierExpiresAt: EXPIRES,
      subscription: row({ cancel_at_period_end: true }),
    })

    expect(v.kind).toBe('paid')
    expect(v.cancelAtPeriodEnd).toBe(true)
    expect(v.expiresAt).toBe(EXPIRES)
  })

  it('faux par défaut, y compris sans abonnement ou sur un `null` en base', () => {
    expect(resolveSubscriptionView({ tier: 'forgeron', tierExpiresAt: EXPIRES }).cancelAtPeriodEnd).toBe(false)
    expect(resolveSubscriptionView({
      tier: 'forgeron', tierExpiresAt: EXPIRES, subscription: row({ cancel_at_period_end: null }),
    }).cancelAtPeriodEnd).toBe(false)
  })
})

describe('incident de paiement — verdict délégué à plans.ts', () => {
  it.each([
    ['past_due', true],
    ['unpaid',   true],
    ['active',   false],
    ['trialing', false],
    ['canceled', false],
  ])('statut %s → paymentIssue %s', (status, attendu) => {
    const v = resolveSubscriptionView({
      tier: 'forgeron', tierExpiresAt: EXPIRES, subscription: row({ status }),
    })

    expect(v.paymentIssue).toBe(attendu)
  })

  it('`past_due` signale un incident SANS retirer le palier', () => {
    // Les deux notions sont distinctes et doivent le rester : la politique de
    // `resolveTierOutcome` conserve l'accès pendant les relances de Stripe.
    const v = resolveSubscriptionView({
      tier: 'maître', tierExpiresAt: EXPIRES, subscription: row({ status: 'past_due' }),
    })

    expect(v.paymentIssue).toBe(true)
    expect(v.kind).toBe('paid')
  })

  it('aucun statut connu → aucun incident annoncé', () => {
    expect(resolveSubscriptionView({ tier: 'forgeron', tierExpiresAt: EXPIRES }).paymentIssue).toBe(false)
    expect(resolveSubscriptionView({
      tier: 'forgeron', tierExpiresAt: EXPIRES, subscription: row({ status: null }),
    }).paymentIssue).toBe(false)
  })
})

describe('le rôle admin reste ORTHOGONAL à l\'abonnement', () => {
  it('signale le rôle sans toucher au palier ni au bouton', () => {
    // La RPC `stripe_apply_subscription_event` enregistre l'abonnement d'un
    // admin mais ne reporte rien sur son palier (`admin_untouched`). La section
    // doit pouvoir le dire — sans pour autant lui fermer le portail, puisqu'il
    // a bien un moyen de paiement à gérer.
    const v = resolveSubscriptionView({
      tier: 'maître', tierExpiresAt: null, role: 'admin', subscription: row(),
    })

    expect(v.isAdmin).toBe(true)
    expect(v.kind).toBe('lifetime')
    expect(v.canManageBilling).toBe(true)
  })

  it('un non-admin n\'est jamais marqué admin', () => {
    expect(resolveSubscriptionView({ tier: 'forgeron', tierExpiresAt: EXPIRES, role: 'user' }).isAdmin).toBe(false)
    expect(resolveSubscriptionView({ tier: 'forgeron', tierExpiresAt: EXPIRES }).isAdmin).toBe(false)
  })
})

describe('bouton « Résilier mon abonnement » (décret 2023-417)', () => {
  const sub = (over: Partial<SubscriptionRow> = {}) => row({ stripe_subscription_id: 'sub_123', ...over })

  it.each(['active', 'trialing', 'past_due', 'unpaid', 'paused'])('abonnement %s ⇒ résiliable', (status) => {
    expect(canCancelSubscription(sub({ status }))).toBe(true)
  })

  it.each(['canceled', 'incomplete', 'incomplete_expired', 'statut_inconnu', null])(
    'statut %s ⇒ pas de bouton (il mènerait à une erreur Stripe)',
    (status) => expect(canCancelSubscription(sub({ status }))).toBe(false),
  )

  it('résiliation déjà programmée ⇒ pas de bouton (la date de fin s’affiche à la place)', () => {
    expect(canCancelSubscription(sub({ cancel_at_period_end: true }))).toBe(false)
  })

  it('sans identifiant d’abonnement (webhook pas encore passé) ⇒ pas de bouton', () => {
    expect(canCancelSubscription(row({ stripe_subscription_id: null }))).toBe(false)
    expect(canCancelSubscription(row())).toBe(false)
    expect(canCancelSubscription(null)).toBe(false)
  })

  it('la vue reprend exactement la même règle, indépendamment du palier affiché', () => {
    // Un admin (palier de rôle) ou un compte « à vie » qui paie quand même doit
    // pouvoir résilier : la décision ne dépend que de l'abonnement.
    for (const tier of ['forgeron', 'maître', 'apprenti']) {
      const v = resolveSubscriptionView({ tier, tierExpiresAt: null, role: 'admin', subscription: sub() })
      expect(v.canCancel).toBe(true)
    }
    expect(resolveSubscriptionView({ tier: 'forgeron', tierExpiresAt: EXPIRES, subscription: null }).canCancel).toBe(false)
  })
})
