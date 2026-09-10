import { describe, it, expect } from 'vitest'
import {
  PLAN_KEYS,
  BILLING_PERIODS,
  TIER_BY_PLAN,
  isPlanKey,
  isBillingPeriod,
  priceEnvKey,
  resolvePriceId,
  planForPriceId,
  periodForPriceId,
  resolveTierOutcome,
  isKnownStatus,
  isPaymentIssue,
  unixToIso,
  stripeMode,
} from './plans'
import { FREE_TIER, isPaidTier } from '../subscription'

/** Catalogue de test — mêmes noms de variables que la prod, valeurs factices. */
const ENV = {
  STRIPE_PRICE_FORGERON_MENSUEL: 'price_forgeron_m',
  STRIPE_PRICE_FORGERON_ANNUEL:  'price_forgeron_a',
  STRIPE_PRICE_MAITRE_MENSUEL:   'price_maitre_m',
  STRIPE_PRICE_MAITRE_ANNUEL:    'price_maitre_a',
}

describe('paliers achetables', () => {
  it("n'expose QUE forgeron et maitre — ni légion ni monarque", () => {
    // Le ticket exclut explicitement Légion et Monarque. Les ajouter ici sans
    // créer les prix Stripe correspondants produirait un bouton qui échoue au
    // clic : `resolvePriceId` renverrait `null` et la route refuserait.
    expect([...PLAN_KEYS]).toEqual(['forgeron', 'maitre'])
    expect(isPlanKey('legion')).toBe(false)
    expect(isPlanKey('monarque')).toBe(false)
    expect(isPlanKey('apprenti')).toBe(false)
  })

  it("traduit la clé ASCII en valeur RÉELLE de profiles.tier — l'accent revient ici", () => {
    // C'est le seul endroit du code où `maître` reprend son accent. Si ce
    // mapping se perd, la base reçoit `maitre`, valeur qu'aucun TIER_ORDER,
    // TIER_COLORS ni libellé ne connaît — et l'app WPF non plus.
    expect(TIER_BY_PLAN.maitre).toBe('maître')
    expect(TIER_BY_PLAN.forgeron).toBe('forgeron')
  })

  it('les deux paliers achetables sont bien payants au sens de isPaidTier', () => {
    // Garde de cohérence entre ce module et le verrou d'accès du site : un
    // palier vendu qui ne donnerait pas accès aux fonctionnalités payantes
    // serait un client qui paie pour rien.
    for (const plan of PLAN_KEYS) {
      expect(isPaidTier(TIER_BY_PLAN[plan]), `${plan} doit être payant`).toBe(true)
    }
  })

  it('valide la périodicité', () => {
    expect([...BILLING_PERIODS]).toEqual(['mensuel', 'annuel'])
    expect(isBillingPeriod('mensuel')).toBe(true)
    expect(isBillingPeriod('monthly')).toBe(false)
    expect(isBillingPeriod(null)).toBe(false)
  })
})

describe('catalogue de prix', () => {
  it('compose le nom de variable attendu pour les 4 combinaisons', () => {
    expect(priceEnvKey('forgeron', 'mensuel')).toBe('STRIPE_PRICE_FORGERON_MENSUEL')
    expect(priceEnvKey('forgeron', 'annuel')).toBe('STRIPE_PRICE_FORGERON_ANNUEL')
    expect(priceEnvKey('maitre',   'mensuel')).toBe('STRIPE_PRICE_MAITRE_MENSUEL')
    expect(priceEnvKey('maitre',   'annuel')).toBe('STRIPE_PRICE_MAITRE_ANNUEL')
  })

  it('résout un prix, et renvoie null sur variable absente ou vide', () => {
    expect(resolvePriceId('maitre', 'annuel', ENV)).toBe('price_maitre_a')
    expect(resolvePriceId('maitre', 'annuel', {})).toBeNull()
    expect(resolvePriceId('maitre', 'annuel', { STRIPE_PRICE_MAITRE_ANNUEL: '   ' })).toBeNull()
  })

  it('fait le chemin INVERSE prix → palier et prix → périodicité', () => {
    // Indispensable au webhook : `customer.subscription.updated` ne porte ni
    // client_reference_id ni les métadonnées du checkout quand l'abonnement a
    // été modifié depuis le portail Stripe.
    expect(planForPriceId('price_forgeron_a', ENV)).toBe('forgeron')
    expect(planForPriceId('price_maitre_m', ENV)).toBe('maitre')
    expect(periodForPriceId('price_maitre_m', ENV)).toBe('mensuel')
    expect(periodForPriceId('price_forgeron_a', ENV)).toBe('annuel')
  })

  it('renvoie null sur un prix inconnu plutôt que de deviner un palier', () => {
    // Un prix créé au Dashboard sans variable d'environnement correspondante.
    // Attribuer « le palier le plus probable » offrirait Maître à qui a payé
    // Forgeron, ou l'inverse.
    expect(planForPriceId('price_inconnu', ENV)).toBeNull()
    expect(planForPriceId(null, ENV)).toBeNull()
    expect(planForPriceId(undefined, ENV)).toBeNull()
    expect(periodForPriceId('price_inconnu', ENV)).toBeNull()
  })
})

describe('politique de palier — resolveTierOutcome', () => {
  const PERIOD_END = '2026-10-09T12:00:00.000Z'
  const bought = (status: string) => ({ status, tier: 'maître', currentPeriodEnd: PERIOD_END })

  it('accorde le palier acheté sur active et trialing', () => {
    for (const status of ['active', 'trialing']) {
      const out = resolveTierOutcome(bought(status))
      expect(out, status).toEqual({ tier: 'maître', expiresAt: PERIOD_END, granted: true })
    }
  })

  it('CONSERVE le palier sur past_due — décision explicite, pas un oubli', () => {
    // Stripe relance environ une semaine (Smart Retries) et aboutit la plupart
    // du temps. Couper au premier échec punirait un client qui va payer ; le cas
    // inverse se referme tout seul au passage en `unpaid`, révoqué ci-dessous.
    const out = resolveTierOutcome(bought('past_due'))
    expect(out.granted).toBe(true)
    expect(out.tier).toBe('maître')
  })

  it('RETIRE le palier sur unpaid, canceled, incomplete_expired, incomplete et paused', () => {
    for (const status of ['unpaid', 'canceled', 'incomplete_expired', 'incomplete', 'paused']) {
      const out = resolveTierOutcome(bought(status))
      expect(out, status).toEqual({ tier: FREE_TIER, expiresAt: null, granted: false })
    }
  })

  it('ne renvoie JAMAIS un palier payant sans date d\'expiration', () => {
    // `tier_expires_at = null` signifie « compte à vie » dans ce schéma
    // (SubscriptionReminder, badge « à vie » de /profil). Un abonnement Stripe
    // qui écrirait null offrirait un accès perpétuel à qui a payé un mois.
    for (const status of ['active', 'trialing', 'past_due']) {
      const out = resolveTierOutcome(bought(status))
      if (out.tier !== FREE_TIER) expect(out.expiresAt, status).not.toBeNull()
    }
  })

  it('retombe sur apprenti quand le palier est indéterminé, quel que soit le statut', () => {
    // Prix hors catalogue : il n'y a rien à accorder, on ne sait pas quoi.
    const out = resolveTierOutcome({ status: 'active', tier: null, currentPeriodEnd: PERIOD_END })
    expect(out).toEqual({ tier: FREE_TIER, expiresAt: null, granted: false })
  })

  it('CONSERVE le palier sur un statut inconnu de Stripe', () => {
    // Les huit statuts documentés sont tous traités ; une valeur hors liste
    // signifie que Stripe en a ajouté un. Entre déclasser un client qui paie et
    // laisser un accès de trop jusqu'à ce qu'un humain regarde, on choisit le
    // second — l'accès reste borné par current_period_end.
    expect(isKnownStatus('statut_du_futur')).toBe(false)
    const out = resolveTierOutcome(bought('statut_du_futur'))
    expect(out.granted).toBe(true)
    expect(out.expiresAt).toBe(PERIOD_END)
  })

  it('normalise casse et espaces du statut', () => {
    expect(resolveTierOutcome(bought('  CANCELED ')).granted).toBe(false)
    expect(resolveTierOutcome(bought('Active')).granted).toBe(true)
  })

  it('connaît les huit statuts documentés par Stripe, et eux seuls', () => {
    const documented = [
      'active', 'trialing', 'past_due', 'unpaid',
      'canceled', 'incomplete', 'incomplete_expired', 'paused',
    ]
    for (const s of documented) expect(isKnownStatus(s), s).toBe(true)
  })
})

describe('incident de paiement', () => {
  it('signale past_due et unpaid, et rien d\'autre', () => {
    expect(isPaymentIssue('past_due')).toBe(true)
    expect(isPaymentIssue('unpaid')).toBe(true)
    expect(isPaymentIssue('active')).toBe(false)
    expect(isPaymentIssue('canceled')).toBe(false)
    expect(isPaymentIssue(null)).toBe(false)
    expect(isPaymentIssue(undefined)).toBe(false)
  })

  it('past_due est à la fois un incident ET un accès conservé', () => {
    // Les deux notions sont distinctes et doivent le rester : un bandeau
    // d'alerte s'affiche sans que l'accès soit coupé.
    expect(isPaymentIssue('past_due')).toBe(true)
    expect(resolveTierOutcome({ status: 'past_due', tier: 'forgeron', currentPeriodEnd: null }).granted).toBe(true)
  })
})

describe('utilitaires', () => {
  it('convertit les SECONDES Stripe en ISO — le ×1000 est le piège', () => {
    // Oublier le facteur place la fin de période en 1970 et déclasse tout le monde.
    expect(unixToIso(1_790_000_000)).toBe(new Date(1_790_000_000_000).toISOString())
  })

  it('renvoie null sur une valeur absente ou aberrante plutôt qu\'une Invalid Date', () => {
    expect(unixToIso(null)).toBeNull()
    expect(unixToIso(undefined)).toBeNull()
    expect(unixToIso(0)).toBeNull()
    expect(unixToIso(-1)).toBeNull()
    expect(unixToIso(Number.NaN)).toBeNull()
  })

  it('déduit le mode Stripe de la CLÉ, jamais d\'un drapeau séparé', () => {
    // Même principe qu'`isTestDatabase` : un drapeau `STRIPE_MODE=test` peut
    // diverger de la clé qu'il décrit et affirmerait « mode test » à quelqu'un
    // branché sur du live.
    expect(stripeMode('sk_test_abc')).toBe('test')
    expect(stripeMode('rk_test_abc')).toBe('test')
    expect(stripeMode('sk_live_abc')).toBe('live')
    expect(stripeMode('rk_live_abc')).toBe('live')
  })

  it('reste conservateur : tout ce qui n\'est pas vérifiable est « unknown »', () => {
    expect(stripeMode('whsec_abc')).toBe('unknown')
    expect(stripeMode('')).toBe('unknown')
    expect(stripeMode(null)).toBe('unknown')
    expect(stripeMode(undefined)).toBe('unknown')
  })
})
