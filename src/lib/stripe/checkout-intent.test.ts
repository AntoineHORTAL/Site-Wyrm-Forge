import { describe, it, expect } from 'vitest'
import {
  CHECKOUT_INTENT_KEY,
  CHECKOUT_INTENT_TTL_MS,
  rememberCheckoutIntent,
  peekCheckoutIntent,
  takeCheckoutIntent,
  clearCheckoutIntent,
  type IntentStorage,
} from './checkout-intent'

/**
 * Faux stockage — trois méthodes, exactement l'interface `IntentStorage`.
 *
 * C'est ce qui permet de tester la reprise d'abonnement SANS jsdom : la logique
 * (validation, péremption, consommation unique) ne touche jamais `window`, elle
 * reçoit son stockage en paramètre.
 */
function fakeStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => { data.set(k, v) },
    removeItem: (k: string) => { data.delete(k) },
  } satisfies IntentStorage & { data: Map<string, string> }
}

/** Stockage qui lève à chaque accès — mode privé, stockage désactivé. */
const throwingStorage: IntentStorage = {
  getItem() { throw new Error('storage refusé') },
  setItem() { throw new Error('storage refusé') },
  removeItem() { throw new Error('storage refusé') },
}

const T0 = 1_757_000_000_000 // instant de référence, arbitraire mais fixe

describe('mémorisation du palier cliqué', () => {
  it('relit exactement ce qui a été cliqué — palier ET périodicité', () => {
    // La périodicité compte autant que le palier : reprendre un « Maître »
    // cliqué en annuel sur un checkout mensuel facturerait le mauvais prix.
    const s = fakeStorage()
    rememberCheckoutIntent(s, 'maitre', 'annuel', T0)

    expect(peekCheckoutIntent(s, T0)).toEqual({ plan: 'maitre', period: 'annuel', at: T0 })
  })

  it("écrase l'intention précédente — seul le dernier clic compte", () => {
    const s = fakeStorage()
    rememberCheckoutIntent(s, 'forgeron', 'mensuel', T0)
    rememberCheckoutIntent(s, 'maitre', 'annuel', T0)

    expect(peekCheckoutIntent(s, T0)?.plan).toBe('maitre')
  })

  it('ne renvoie rien quand rien n\'a été cliqué', () => {
    expect(peekCheckoutIntent(fakeStorage(), T0)).toBeNull()
  })
})

describe('consommation UNIQUE', () => {
  it('`take` efface : un second appel ne relance pas de checkout', () => {
    // C'est l'invariant central du chantier. Sans lui, un échec d'ouverture du
    // checkout relancerait un paiement au rendu suivant — et le double montage
    // du mode strict de React en déclencherait deux d'emblée.
    const s = fakeStorage()
    rememberCheckoutIntent(s, 'forgeron', 'mensuel', T0)

    expect(takeCheckoutIntent(s, T0)).toMatchObject({ plan: 'forgeron' })
    expect(takeCheckoutIntent(s, T0)).toBeNull()
    expect(s.data.has(CHECKOUT_INTENT_KEY)).toBe(false)
  })

  it('`peek` ne consomme PAS — la navigation lit sans détruire', () => {
    // `page.tsx` lit l'intention pour ouvrir l'onglet `tarifs` ; si cette
    // lecture consommait, `Pricing` monterait sur une intention déjà disparue.
    const s = fakeStorage()
    rememberCheckoutIntent(s, 'maitre', 'mensuel', T0)

    expect(peekCheckoutIntent(s, T0)).not.toBeNull()
    expect(peekCheckoutIntent(s, T0)).not.toBeNull()
    expect(takeCheckoutIntent(s, T0)).not.toBeNull()
  })

  it('`clear` retire l\'intention sans rien lire', () => {
    const s = fakeStorage()
    rememberCheckoutIntent(s, 'forgeron', 'annuel', T0)
    clearCheckoutIntent(s)

    expect(s.data.has(CHECKOUT_INTENT_KEY)).toBe(false)
  })
})

describe('péremption', () => {
  it('accepte une intention à la limite EXACTE du TTL', () => {
    const s = fakeStorage()
    rememberCheckoutIntent(s, 'forgeron', 'mensuel', T0)

    expect(peekCheckoutIntent(s, T0 + CHECKOUT_INTENT_TTL_MS)).not.toBeNull()
  })

  it('refuse — et EFFACE — une intention périmée', () => {
    // L'effacement compte autant que le refus : une intention laissée en place
    // serait relue, re-parsée et re-rejetée à chaque rendu.
    const s = fakeStorage()
    rememberCheckoutIntent(s, 'forgeron', 'mensuel', T0)

    expect(peekCheckoutIntent(s, T0 + CHECKOUT_INTENT_TTL_MS + 1)).toBeNull()
    expect(s.data.has(CHECKOUT_INTENT_KEY)).toBe(false)
  })

  it("couvre confortablement un aller-retour OAuth", () => {
    // Le chemin le plus long : quitter le site pour Google, créer un compte,
    // revenir. Cinq minutes doivent passer sans discussion.
    const s = fakeStorage()
    rememberCheckoutIntent(s, 'maitre', 'annuel', T0)

    expect(peekCheckoutIntent(s, T0 + 5 * 60 * 1000)).not.toBeNull()
  })
})

describe('robustesse — ce qui sort du navigateur est une chaîne, pas un type', () => {
  it.each([
    ['JSON invalide',        'pas du json'],
    ['tableau',              '[]'],
    ['null',                 'null'],
    ['palier inventé',       '{"plan":"monarque","period":"mensuel","at":1}'],
    ['palier gratuit',       '{"plan":"apprenti","period":"mensuel","at":1}'],
    ['périodicité inventée', '{"plan":"forgeron","period":"hebdo","at":1}'],
    ['horodatage absent',    '{"plan":"forgeron","period":"mensuel"}'],
    ['horodatage NaN',       '{"plan":"forgeron","period":"mensuel","at":"hier"}'],
  ])('écarte %s', (_libellé, brut) => {
    // Un `plan` inventé traverserait sinon tout le composant pour finir en 400
    // côté route — autant l'écarter ici, là où la question a un nom.
    const s = fakeStorage({ [CHECKOUT_INTENT_KEY]: brut })

    expect(peekCheckoutIntent(s, T0)).toBeNull()
    expect(s.data.has(CHECKOUT_INTENT_KEY)).toBe(false)
  })
})

describe('stockage indisponible — jamais une erreur, jamais de reprise', () => {
  it('traite un stockage absent (`null`) comme « pas de reprise »', () => {
    // Rendu serveur : `sessionIntentStorage()` renvoie `null`. Le parcours
    // manuel reste entier, seule la reprise automatique disparaît.
    expect(() => rememberCheckoutIntent(null, 'forgeron', 'mensuel', T0)).not.toThrow()
    expect(peekCheckoutIntent(null, T0)).toBeNull()
    expect(takeCheckoutIntent(null, T0)).toBeNull()
    expect(() => clearCheckoutIntent(null)).not.toThrow()
  })

  it('absorbe un stockage qui LÈVE — navigation privée, quota dépassé', () => {
    expect(() => rememberCheckoutIntent(throwingStorage, 'maitre', 'annuel', T0)).not.toThrow()
    expect(peekCheckoutIntent(throwingStorage, T0)).toBeNull()
    expect(() => takeCheckoutIntent(throwingStorage, T0)).not.toThrow()
    expect(() => clearCheckoutIntent(throwingStorage)).not.toThrow()
  })
})
