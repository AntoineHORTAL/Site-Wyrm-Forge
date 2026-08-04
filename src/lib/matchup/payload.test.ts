import { describe, it, expect } from 'vitest'
import {
  buildScenarioPayload, buildItemNames, formatResetFr, overQuotaMessage, readQuota, canAfford,
  type BuildNameContext, type QuotaState,
} from './payload'
import { createScenario, setChampion, setLevel, setBuild, setRole, type BuildRef } from './types'

const CTX: BuildNameContext = {
  itemNameById: { IE: 'Lame infinie', Zeal: 'Ardeur du zèle' },
  savedById: { s1: { blocks: [{ items: [{ itemId: 'IE', count: 1 }, { itemId: 'Zeal', count: 1 }] }] } },
}

const AHRI = { id: 'Ahri', name: 'Ahri', image: 'Ahri.png' }
const AHRI_STATS = { hp: 590, hpperlevel: 90, attackdamage: 53, attackdamageperlevel: 3 }

describe('buildItemNames — noms d\'items du build', () => {
  it('temp → noms du snapshot', () => {
    const build: BuildRef = { kind: 'temp', blocks: [{ id: 'b', name: 'B', items: [
      { id: 'X', name: 'Item X', image: 'x.png', stats: {}, count: 2 },
    ] }] }
    expect(buildItemNames(build, CTX)).toEqual(['Item X'])
  })
  it('saved → noms résolus via itemNameById', () => {
    expect(buildItemNames({ kind: 'saved', buildId: 's1' }, CTX)).toEqual(['Lame infinie', 'Ardeur du zèle'])
  })
  it('saved introuvable / none → liste vide', () => {
    expect(buildItemNames({ kind: 'saved', buildId: 'ghost' }, CTX)).toEqual([])
    expect(buildItemNames({ kind: 'none' }, CTX)).toEqual([])
  })
})

describe('buildScenarioPayload — miroir ChampPayload WPF', () => {
  it('n\'inclut que les slots occupés, dans le bon camp', () => {
    let s = createScenario('2v2')
    s = setChampion(s, 'allies', 0, AHRI, AHRI_STATS)   // 1 seul allié rempli sur 2
    s = setChampion(s, 'enemies', 1, { id: 'Zed', name: 'Zed', image: 'Zed.png' }, { hp: 654 })
    const p = buildScenarioPayload(s, CTX)
    expect(p.mode).toBe('2v2')
    expect(p.allies.map(a => a.name)).toEqual(['Ahri'])
    expect(p.enemies.map(e => e.name)).toEqual(['Zed'])
  })

  it('stats scalées au niveau, formatées à 1 décimale (F1)', () => {
    let s = createScenario('1v1')
    s = setChampion(s, 'allies', 0, AHRI, AHRI_STATS)
    s = setLevel(s, 'allies', 0, 3)
    const champ = buildScenarioPayload(s, CTX).allies[0]
    const stat = (label: string) => champ.stats.find(x => x.label === label)!.value
    expect(stat('hp')).toBe((590 + 90 * 2).toFixed(1))            // '770.0'
    expect(stat('attackdamage')).toBe((53 + 3 * 2).toFixed(1))    // '59.0'
    // la clé perlevel est aussi émise (parité WPF : itère toutes les clés)
    expect(stat('hpperlevel')).toBe((90).toFixed(1))
  })

  it('attache les noms d\'items du build (omis si aucun)', () => {
    let s = createScenario('1v1')
    s = setChampion(s, 'allies', 0, AHRI, AHRI_STATS)
    expect(buildScenarioPayload(s, CTX).allies[0].build).toBeUndefined()
    s = setBuild(s, 'allies', 0, { kind: 'saved', buildId: 's1' })
    expect(buildScenarioPayload(s, CTX).allies[0].build).toEqual(['Lame infinie', 'Ardeur du zèle'])
  })
})

describe('readQuota — lecture tolérante du solde de crédits', () => {
  it('lit used/limit/remaining/model/resets_at/costs', () => {
    expect(readQuota({
      used: 33, limit: 135, remaining: 102, model: 'claude-sonnet-5',
      resets_at: '2026-07-27T00:00:00Z', costs: { quick: 17, detailed: 33 },
    })).toEqual({
      used: 33, limit: 135, remaining: 102, model: 'claude-sonnet-5',
      resetsAt: '2026-07-27T00:00:00Z', costs: { quick: 17, detailed: 33 },
    })
  })
  it('champs manquants → valeurs par défaut', () => {
    expect(readQuota(null)).toEqual({
      used: 0, limit: 0, remaining: 0, model: '', resetsAt: null,
      costs: { quick: 0, detailed: 0 },
    })
  })
  // Une EF pré-crédits ne renvoie pas `costs` : le repli à 0 doit rendre tout
  // finançable, jamais bloquer l'utilisateur sur un faux « solde épuisé ».
  it('réponse sans `costs` → coûts à 0, rien n\'est bloqué côté client', () => {
    const q = readQuota({ used: 2, limit: 3, remaining: 1, model: 'x' })
    expect(q.costs).toEqual({ quick: 0, detailed: 0 })
    expect(canAfford(q, true)).toBe(true)
  })
})

describe('canAfford — finançabilité par action (pot fongible)', () => {
  const q = (remaining: number): QuotaState => ({
    used: 135 - remaining, limit: 135, remaining, model: 'claude-sonnet-5',
    resetsAt: null, costs: { quick: 17, detailed: 33 },
  })
  it('solde suffisant pour les deux', () => {
    expect(canAfford(q(40), false)).toBe(true)
    expect(canAfford(q(40), true)).toBe(true)
  })
  // Le cas que l'ancien booléen `remaining <= 0` ne savait pas exprimer.
  it('solde intermédiaire → rapide OUI, détaillée NON', () => {
    expect(canAfford(q(20), false)).toBe(true)
    expect(canAfford(q(20), true)).toBe(false)
  })
  it('solde pile au coût → finançable (comparaison inclusive)', () => {
    expect(canAfford(q(33), true)).toBe(true)
    expect(canAfford(q(32), true)).toBe(false)
  })
  it('solde nul → rien de finançable', () => {
    expect(canAfford(q(0), false)).toBe(false)
    expect(canAfford(q(0), true)).toBe(false)
  })
  it('quota inconnu (null) → on laisse tenter, le serveur tranche', () => {
    expect(canAfford(null, true)).toBe(true)
  })
})

// Depuis le dégating de l'onglet (2026-08-01), Match Up est ouvert à TOUS les
// tiers : ce sont ces tiers-là qui tapent le barème Haiku, jusqu'ici non couvert.
// Le tarif dépend du MODÈLE, pas seulement de `advanced` — appliquer les coûts
// Sonnet à un Apprenti le surfacturerait d'un facteur ~3.
describe('canAfford — barème Haiku (Apprenti / Forgeron)', () => {
  const haiku = (remaining: number, limit: number): QuotaState => ({
    used: limit - remaining, limit, remaining, model: 'claude-haiku-4-5',
    resetsAt: null, costs: { quick: 6, detailed: 11 },
  })

  it('Apprenti à plein (15 cr) finance une détaillée à 11 ou une rapide à 6', () => {
    expect(canAfford(haiku(15, 15), false)).toBe(true)
    expect(canAfford(haiku(15, 15), true)).toBe(true)
  })

  it('Apprenti après une détaillée (4 cr restants) ne finance plus rien', () => {
    expect(canAfford(haiku(4, 15), false)).toBe(false)
    expect(canAfford(haiku(4, 15), true)).toBe(false)
  })

  it('Apprenti après une rapide (9 cr) : rapide OUI, détaillée NON', () => {
    // Le cas exact qui justifie `canAfford` plutôt qu'un `remaining <= 0` :
    // le solde est non nul mais ne couvre plus l'action la plus chère.
    expect(canAfford(haiku(9, 15), false)).toBe(true)
    expect(canAfford(haiku(9, 15), true)).toBe(false)
  })

  it('bornes inclusives au coût exact', () => {
    expect(canAfford(haiku(11, 65), true)).toBe(true)
    expect(canAfford(haiku(10, 65), true)).toBe(false)
    expect(canAfford(haiku(6, 65), false)).toBe(true)
    expect(canAfford(haiku(5, 65), false)).toBe(false)
  })

  it('Forgeron à plein (65 cr) finance les deux', () => {
    expect(canAfford(haiku(65, 65), false)).toBe(true)
    expect(canAfford(haiku(65, 65), true)).toBe(true)
  })
})

describe('formatResetFr / overQuotaMessage', () => {
  const base = { model: '', resetsAt: null, costs: { quick: 17, detailed: 33 } }
  it('null / date invalide → chaîne vide', () => {
    expect(formatResetFr(null)).toBe('')
    expect(formatResetFr('pas une date')).toBe('')
  })
  it('produit une date FR avec heure au format HHhMM', () => {
    expect(formatResetFr('2026-07-27T00:00:00.000Z')).toMatch(/ à \d{2}h\d{2}$/)
  })
  it('solde à zéro → message « épuisée » avec used/limit', () => {
    expect(overQuotaMessage({ ...base, used: 135, limit: 135, remaining: 0 }))
      .toBe('Chaleur de la Forge épuisée pour cette semaine (135/135 braises).')
  })
  // Distinction impossible dans l'ancien modèle « N analyses ».
  it('solde restant mais insuffisant → message ciblé sur l\'action', () => {
    expect(overQuotaMessage({ ...base, used: 115, limit: 135, remaining: 20 }, true))
      .toBe('Il te reste 20 braises, il en faut 33 pour une analyse détaillée.')
  })
})

describe('champPayload — rôle optionnel (parité WPF / contrat EF Lot 1)', () => {
  function withAhri() {
    return setChampion(createScenario('1v1'), 'allies', 0, AHRI, AHRI_STATS)
  }

  it('slot sans rôle → clé `role` ABSENTE (prompt EF inchangé)', () => {
    const p = buildScenarioPayload(withAhri(), CTX)
    expect(p.allies[0]).not.toHaveProperty('role')
  })

  it('slot avec rôle → `role` en majuscules dans le payload', () => {
    const s = setRole(withAhri(), 'allies', 0, 'MID')
    const p = buildScenarioPayload(s, CTX)
    expect(p.allies[0].role).toBe('MID')
  })

  it('le rôle suit le bon camp et le bon slot', () => {
    let s = createScenario('2v2')
    s = setChampion(s, 'allies', 1, AHRI, AHRI_STATS)
    s = setRole(s, 'allies', 1, 'TOP')
    s = setChampion(s, 'enemies', 0, AHRI, AHRI_STATS)
    // seul le slot allié 1 est occupé côté allié → il devient l'index 0 du payload
    const p = buildScenarioPayload(s, CTX)
    expect(p.allies[0].role).toBe('TOP')
    expect(p.enemies[0]).not.toHaveProperty('role')
  })

  it('rôle retiré → la clé disparaît du payload', () => {
    let s = setRole(withAhri(), 'allies', 0, 'ADC')
    expect(buildScenarioPayload(s, CTX).allies[0].role).toBe('ADC')
    s = setRole(s, 'allies', 0, null)
    expect(buildScenarioPayload(s, CTX).allies[0]).not.toHaveProperty('role')
  })

  it('rôle invalide venant d\'un localStorage édité → omis, pas propagé', () => {
    const s = withAhri()
    // localStorage est un JSON casté : le type union ne protège rien à l'exécution.
    ;(s.allies[0] as { role?: unknown }).role = 'BOTTOM'   // vocabulaire Riot, pas le nôtre
    expect(buildScenarioPayload(s, CTX).allies[0]).not.toHaveProperty('role')
  })

  it('casse/espaces tolérés (normalisation majuscules)', () => {
    const s = withAhri()
    ;(s.allies[0] as { role?: unknown }).role = ' top '
    expect(buildScenarioPayload(s, CTX).allies[0].role).toBe('TOP')
  })

  it('n\'altère ni les stats ni le build existants', () => {
    let s = setRole(withAhri(), 'allies', 0, 'SUPPORT')
    s = setBuild(s, 'allies', 0, { kind: 'saved', buildId: 's1' })
    const c = buildScenarioPayload(s, CTX).allies[0]
    expect(c.build).toEqual(['Lame infinie', 'Ardeur du zèle'])
    expect(c.stats.length).toBeGreaterThan(0)
    expect(c.name).toBe('Ahri')
  })
})
