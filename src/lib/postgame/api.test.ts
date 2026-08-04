import { describe, it, expect } from 'vitest'
import {
  readPostGameQuota, canAffordPostGame, costOfCombo, comboKey, hasLaneOpponent,
  POSTGAME_DEPTHS, POSTGAME_MODES,
  type PostGameQuota,
} from '@/lib/postgame/api'

// Le solde seul ne décide pas : il se compare au coût de L'ACTION. Depuis la
// généralisation aux 9 combinaisons, ce coût va de 6 à 31 crédits — un booléen
// global de finançabilité serait donc encore plus faux qu'avant.

// Grille RÉELLE mesurée le 2026-08-01 (54 appels Anthropic non mockés).
// Ces valeurs doivent rester synchronisées avec COST_CREDITS de l'EF : si
// elles divergent, le client grise les mauvaises combinaisons.
const HAIKU_COSTS = {
  simple_perso: 6, simple_adversaire: 6, simple_les_deux: 7,
  medium_perso: 7, medium_adversaire: 7, medium_les_deux: 8,
  advanced_perso: 9, advanced_adversaire: 9, advanced_les_deux: 10,
}
const SONNET_COSTS = {
  simple_perso: 17, simple_adversaire: 17, simple_les_deux: 20,
  medium_perso: 22, medium_adversaire: 22, medium_les_deux: 25,
  advanced_perso: 27, advanced_adversaire: 27, advanced_les_deux: 31,
}

const quota = (over: Partial<PostGameQuota> = {}): PostGameQuota => ({
  used: 12, limit: 15, remaining: 3, model: 'claude-haiku-4-5',
  resetsAt: '2026-08-03T00:00:00.000Z',
  costs: HAIKU_COSTS,
  ...over,
})

describe('canAffordPostGame — finançabilité par COMBINAISON', () => {
  it('cas de test réel : 3 braises, aucune combinaison finançable', () => {
    const q = quota()
    for (const d of POSTGAME_DEPTHS) for (const m of POSTGAME_MODES) {
      expect(canAffordPostGame(q, d, m), comboKey(d, m)).toBe(false)
    }
  })

  it('le défaut sans argument reste simple/perso (rétrocompatible)', () => {
    expect(canAffordPostGame(quota({ remaining: 6 }))).toBe(true)
    expect(canAffordPostGame(quota({ remaining: 5 }))).toBe(false)
  })

  // LE cas qui justifie l'existence de la fonction : un solde intermédiaire
  // finance les combinaisons bon marché mais pas les chères.
  it('Apprenti à 7 braises : simple oui, advanced non', () => {
    const q = quota({ remaining: 7 })
    expect(canAffordPostGame(q, 'simple', 'perso')).toBe(true)
    expect(canAffordPostGame(q, 'simple', 'les_deux')).toBe(true)     // 7
    expect(canAffordPostGame(q, 'medium', 'les_deux')).toBe(false)    // 8
    expect(canAffordPostGame(q, 'advanced', 'les_deux')).toBe(false)  // 10
  })

  it('bornes inclusives au coût exact, sur les deux modèles', () => {
    for (const [costs, price] of [
      [HAIKU_COSTS,  10],
      [SONNET_COSTS, 31],
    ] as const) {
      const q = quota({ costs, remaining: price })
      expect(canAffordPostGame(q, 'advanced', 'les_deux')).toBe(true)
      expect(canAffordPostGame({ ...q, remaining: price - 1 }, 'advanced', 'les_deux')).toBe(false)
    }
  })

  it('quota inconnu → on laisse tenter, le serveur tranche', () => {
    for (const d of POSTGAME_DEPTHS) for (const m of POSTGAME_MODES) {
      expect(canAffordPostGame(null, d, m)).toBe(true)
    }
  })

  it('coût absent (EF pré-généralisation) → finançable, jamais de faux blocage', () => {
    const q = quota({ costs: { simple_perso: 6 }, remaining: 0 })
    // Clé connue → refusé sur le solde.
    expect(canAffordPostGame(q, 'simple', 'perso')).toBe(false)
    // Clés absentes → coût inconnu → on tente.
    expect(canAffordPostGame(q, 'advanced', 'les_deux')).toBe(true)
  })
})

describe('Budget par tier — la grille mesurée doit rester vivable', () => {
  // Garde-fou de cadrage : chaque combinaison doit rester dans un ordre de
  // grandeur cohérent avec MatchUp, dont le pot est PARTAGÉ.
  const MATCHUP_DETAILED_SONNET = 33

  it('aucune combinaison PostGame ne dépasse une analyse détaillée MatchUp', () => {
    for (const c of Object.values(SONNET_COSTS)) {
      expect(c).toBeLessThanOrEqual(MATCHUP_DETAILED_SONNET)
    }
  })

  it('un Apprenti (15 cr, Haiku) peut s\'offrir CHAQUE combinaison au moins une fois', () => {
    // Propriété importante : le tier gratuit ne doit être exclu d'aucune
    // combinaison, sinon le dégating de l'onglet n'aurait servi à rien.
    for (const c of Object.values(HAIKU_COSTS)) expect(c).toBeLessThanOrEqual(15)
  })

  it('un Maître (135 cr, Sonnet) finance au moins 4 analyses les plus chères', () => {
    expect(Math.floor(135 / SONNET_COSTS.advanced_les_deux)).toBeGreaterThanOrEqual(4)
  })

  it('le coût croît avec la profondeur et avec le mode « les deux »', () => {
    for (const costs of [HAIKU_COSTS, SONNET_COSTS]) {
      for (const m of POSTGAME_MODES) {
        expect(costs[`simple_${m}` as keyof typeof costs])
          .toBeLessThanOrEqual(costs[`medium_${m}` as keyof typeof costs])
        expect(costs[`medium_${m}` as keyof typeof costs])
          .toBeLessThanOrEqual(costs[`advanced_${m}` as keyof typeof costs])
      }
      for (const d of POSTGAME_DEPTHS) {
        expect(costs[`${d}_les_deux` as keyof typeof costs])
          .toBeGreaterThan(costs[`${d}_perso` as keyof typeof costs])
      }
    }
  })
})

describe('hasLaneOpponent — parties sans duel de voie', () => {
  it('refuse ARAM et Arena', () => {
    expect(hasLaneOpponent(450)).toBe(false)   // ARAM
    expect(hasLaneOpponent(1700)).toBe(false)  // Arena
  })

  it('accepte les files de Faille', () => {
    for (const q of [400, 420, 430, 440]) expect(hasLaneOpponent(q)).toBe(true)
  })

  it('queueId inconnu → on laisse tenter (le serveur reste l\'autorité)', () => {
    expect(hasLaneOpponent(undefined)).toBe(true)
    expect(hasLaneOpponent(99999)).toBe(true)
  })
})

describe('readPostGameQuota — lecture défensive', () => {
  it('lit les 9 clés de coût', () => {
    const q = readPostGameQuota({
      used: 12, limit: 15, remaining: 3, model: 'claude-haiku-4-5',
      resets_at: '2026-08-03T00:00:00.000Z', costs: HAIKU_COSTS,
    })
    expect(Object.keys(q.costs)).toHaveLength(9)
    expect(costOfCombo(q, 'advanced', 'les_deux')).toBe(10)
  })

  it('ignore les valeurs de coût non numériques plutôt que d\'injecter NaN', () => {
    const q = readPostGameQuota({ costs: { simple_perso: 'six', medium_perso: 7 } })
    expect(q.costs.simple_perso).toBeUndefined()
    expect(q.costs.medium_perso).toBe(7)
    expect(costOfCombo(q, 'simple', 'perso')).toBe(0)
  })

  it('retombe sur des zéros sur un corps vide ou absent', () => {
    for (const body of [null, undefined, {}, { used: 'x', costs: null }]) {
      const q = readPostGameQuota(body)
      expect(q.used).toBe(0)
      expect(q.remaining).toBe(0)
      expect(q.costs).toEqual({})
      expect(canAffordPostGame(q, 'advanced', 'les_deux')).toBe(true)
    }
  })
})
