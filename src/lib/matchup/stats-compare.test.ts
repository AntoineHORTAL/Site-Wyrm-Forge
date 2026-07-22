import { describe, it, expect } from 'vitest'
import { computeRadar, normalizeAxis, RADAR_AXES, type RadarAxisValue } from './stats-compare'
import type { MatchUpChampion, BuildRef } from './types'
import type { SavedBuildLite, ItemStatsIndex } from './build-resolve'

function champ(over: Partial<MatchUpChampion>): MatchUpChampion {
  return { champ: { id: 'X', name: 'X', image: 'X.png' }, level: 1, build: { kind: 'none' }, baseStats: {}, ...over }
}
const empty: MatchUpChampion = { champ: null, level: 1, build: { kind: 'none' }, baseStats: {} }
const val = (rows: RadarAxisValue[], key: string) => rows.find(r => r.key === key)!

describe('computeRadar — base scalée + contribution items', () => {
  it('base scalée au niveau (base + perlevel*(niveau-1))', () => {
    const ally = champ({ level: 3, baseStats: { hp: 590, hpperlevel: 96, attackdamage: 53, attackdamageperlevel: 3 } })
    const rows = computeRadar([ally], [empty], {}, {})
    expect(val(rows, 'hp').ally).toBe(590 + 96 * 2)          // 782
    expect(val(rows, 'attackdamage').ally).toBe(53 + 3 * 2)  // 59
    expect(val(rows, 'hp').enemy).toBe(0)                    // camp vide
  })

  it('ajoute la contribution des items (temp) à la stat de base', () => {
    const build: BuildRef = { kind: 'temp', blocks: [{ id: 'b', name: 'B', items: [
      { id: 'I', name: 'I', image: 'I.png', stats: { FlatHPPoolMod: 200, FlatArmorMod: 30 }, count: 1 },
    ] }] }
    const ally = champ({ level: 1, baseStats: { hp: 640, armor: 20 }, build })
    const rows = computeRadar([ally], [empty], {}, {})
    expect(val(rows, 'hp').ally).toBe(640 + 200)     // base + item
    expect(val(rows, 'armor').ally).toBe(20 + 30)
  })

  it('résout la contribution items d\'un build sauvegardé via l\'index DDragon', () => {
    const savedById: Record<string, SavedBuildLite> = {
      s1: { id: 's1', blocks: [{ items: [{ itemId: 'IE', count: 1 }] }] },
    }
    const itemStats: ItemStatsIndex = { IE: { FlatPhysicalDamageMod: 70 } }
    const ally = champ({ level: 1, baseStats: { attackdamage: 60 }, build: { kind: 'saved', buildId: 's1' } })
    const rows = computeRadar([ally], [empty], savedById, itemStats)
    expect(val(rows, 'attackdamage').ally).toBe(60 + 70)
  })

  it('somme sur toute l\'équipe et ignore les slots vides', () => {
    const a1 = champ({ baseStats: { hp: 500 } })
    const a2 = champ({ baseStats: { hp: 700 } })
    const rows = computeRadar([a1, empty, a2], [empty], {}, {})
    expect(val(rows, 'hp').ally).toBe(1200)
  })

  it('attackrange = base seule (aucune clé item)', () => {
    expect(RADAR_AXES.find(a => a.key === 'attackrange')!.itemKey).toBeNull()
    const ally = champ({ level: 5, baseStats: { attackrange: 550 } })
    const rows = computeRadar([ally], [empty], {}, {})
    expect(val(rows, 'attackrange').ally).toBe(550)   // pas de perlevel → constant
  })
})

describe('normalizeAxis — normalisation par axe', () => {
  it('le plus grand atteint 1, l\'autre est proportionnel', () => {
    expect(normalizeAxis(782, 840)).toEqual({ ally: 782 / 840, enemy: 1 })
    expect(normalizeAxis(1000, 250)).toEqual({ ally: 1, enemy: 0.25 })
  })
  it('deux zéros → 0/0 (pas de division par zéro)', () => {
    expect(normalizeAxis(0, 0)).toEqual({ ally: 0, enemy: 0 })
  })
})
