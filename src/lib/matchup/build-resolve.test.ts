import { describe, it, expect } from 'vitest'
import { buildToStatBlocks, resolveBuildStats, type SavedBuildLite, type ItemStatsIndex } from './build-resolve'
import type { BuildRef } from './types'

// Index DDragon fictif : itemId → stats.
const ITEM_STATS: ItemStatsIndex = {
  IE:    { FlatPhysicalDamageMod: 70, FlatCritChanceMod: 0.2 },
  Zeal:  { PercentAttackSpeedMod: 0.15, FlatCritChanceMod: 0.2 },
  Cloth: { FlatArmorMod: 15 },
}

const SAVED: Record<string, SavedBuildLite> = {
  b1: { id: 'b1', blocks: [{ items: [{ itemId: 'IE', count: 1 }, { itemId: 'Zeal', count: 2 }] }] },
}

describe('buildToStatBlocks / resolveBuildStats', () => {
  it('none → aucun bloc → stats vides', () => {
    expect(buildToStatBlocks({ kind: 'none' }, SAVED, ITEM_STATS)).toEqual([])
    expect(resolveBuildStats({ kind: 'none' }, SAVED, ITEM_STATS)).toEqual({})
  })

  it('temp → stats inline agrégées (snapshot autonome, index ignoré)', () => {
    const build: BuildRef = {
      kind: 'temp',
      blocks: [{
        id: 'x', name: 'Build',
        items: [
          { id: 'A', name: 'A', image: 'A.png', stats: { FlatHPPoolMod: 100 }, count: 2 },
          { id: 'B', name: 'B', image: 'B.png', stats: { FlatArmorMod: 30 }, count: 1 },
        ],
      }],
    }
    expect(resolveBuildStats(build, {}, {})).toEqual({ FlatHPPoolMod: 200, FlatArmorMod: 30 })
  })

  it('saved → stats résolues via l\'index DDragon, count appliqué', () => {
    const stats = resolveBuildStats({ kind: 'saved', buildId: 'b1' }, SAVED, ITEM_STATS)
    // IE×1 + Zeal×2
    expect(stats.FlatPhysicalDamageMod).toBe(70)
    expect(stats.PercentAttackSpeedMod).toBeCloseTo(0.30, 5)
    expect(stats.FlatCritChanceMod).toBeCloseTo(0.2 + 0.2 * 2, 5)
  })

  it('saved introuvable (build supprimé) → stats vides, pas de crash', () => {
    expect(resolveBuildStats({ kind: 'saved', buildId: 'ghost' }, SAVED, ITEM_STATS)).toEqual({})
  })

  it('saved avec item absent de l\'index → 0 stat pour cet item (dégradation gracieuse)', () => {
    const saved: Record<string, SavedBuildLite> = {
      b: { id: 'b', blocks: [{ items: [{ itemId: 'IE', count: 1 }, { itemId: 'UNKNOWN', count: 3 }] }] },
    }
    const stats = resolveBuildStats({ kind: 'saved', buildId: 'b' }, saved, ITEM_STATS)
    expect(stats.FlatPhysicalDamageMod).toBe(70)   // seul IE compte, UNKNOWN → {}
  })
})
