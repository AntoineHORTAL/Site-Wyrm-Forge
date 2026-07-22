import { describe, it, expect } from 'vitest'
import {
  buildScenarioPayload, buildItemNames, formatResetFr, overQuotaMessage, readQuota,
  type BuildNameContext,
} from './payload'
import { createScenario, setChampion, setLevel, setBuild, type BuildRef } from './types'

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

describe('readQuota — lecture tolérante des champs de quota', () => {
  it('lit used/limit/remaining/model/resets_at', () => {
    expect(readQuota({ used: 2, limit: 3, remaining: 1, model: 'claude-haiku-4-5', resets_at: '2026-07-27T00:00:00Z' }))
      .toEqual({ used: 2, limit: 3, remaining: 1, model: 'claude-haiku-4-5', resetsAt: '2026-07-27T00:00:00Z' })
  })
  it('champs manquants → valeurs par défaut', () => {
    expect(readQuota(null)).toEqual({ used: 0, limit: 0, remaining: 0, model: '', resetsAt: null })
  })
})

describe('formatResetFr / overQuotaMessage', () => {
  it('null / date invalide → chaîne vide', () => {
    expect(formatResetFr(null)).toBe('')
    expect(formatResetFr('pas une date')).toBe('')
  })
  it('produit une date FR avec heure au format HHhMM', () => {
    expect(formatResetFr('2026-07-27T00:00:00.000Z')).toMatch(/ à \d{2}h\d{2}$/)
  })
  it('message de plafond reprend used/limit', () => {
    const msg = overQuotaMessage({ used: 3, limit: 3, remaining: 0, model: '', resetsAt: null })
    expect(msg).toBe('Quota d\'analyses atteint pour cette semaine (3/3).')
  })
})
