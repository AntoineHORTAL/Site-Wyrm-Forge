import { describe, it, expect } from 'vitest'
import { statAtLevel, scaledBaseStats, aggregateItemStats, type StatBlock } from './champion-stats'

describe('statAtLevel', () => {
  it('niveau 1 = valeur de base (identité — comme le display champion/[id])', () => {
    expect(statAtLevel(630, 100, 1)).toBe(630)
    expect(statAtLevel(0.625, 0.02, 1)).toBe(0.625)
  })
  it('scale linéairement : base + per*(niveau-1)', () => {
    expect(statAtLevel(630, 100, 5)).toBe(1030)          // 630 + 100*4
    expect(statAtLevel(60, 3.5, 18)).toBeCloseTo(60 + 3.5 * 17)
  })
  it('tolère undefined (→ 0, comme les `?? 0` d’origine)', () => {
    expect(statAtLevel(undefined as unknown as number, undefined as unknown as number, 3)).toBe(0)
  })
})

describe('scaledBaseStats', () => {
  it('scale les clés de base ; movespeed/attackrange sans perlevel', () => {
    const raw = { hp: 600, hpperlevel: 100, movespeed: 340, attackrange: 175 }
    const r = scaledBaseStats(raw, 3)
    expect(r.hp).toBe(800)          // 600 + 100*2
    expect(r.movespeed).toBe(340)   // pas de perlevel → inchangé
    expect(r.attackrange).toBe(175)
  })
  it('clés absentes → 0', () => {
    expect(scaledBaseStats({}, 10).hp).toBe(0)
  })
})

describe('aggregateItemStats — non-régression vs boucle inline BuildsTab', () => {
  const blocks: StatBlock[] = [
    { items: [
      { item: { stats: { FlatHPPoolMod: 100, FlatArmorMod: 20 } }, count: 1 },
      { item: { stats: { FlatHPPoolMod: 50 } }, count: 2 },
    ] },
    { items: [
      { item: { stats: { FlatArmorMod: 15, FlatPhysicalDamageMod: 40 } }, count: 1 },
    ] },
  ]

  // Reproduction EXACTE de l'ancienne boucle `statTotals` remplacée dans BuildsTab.
  function inlineLoop(bs: StatBlock[]): Record<string, number> {
    const t: Record<string, number> = {}
    for (const b of bs)
      for (const { item, count } of b.items)
        for (const [k, v] of Object.entries(item.stats)) t[k] = (t[k] ?? 0) + v * count
    return t
  }

  it('produit exactement le même résultat que la boucle qu’il remplace', () => {
    expect(aggregateItemStats(blocks)).toEqual(inlineLoop(blocks))
  })
  it('valeurs attendues (somme × count sur tous les blocs)', () => {
    expect(aggregateItemStats(blocks)).toEqual({
      FlatHPPoolMod: 200,          // 100 + 50*2
      FlatArmorMod: 35,            // 20 + 15
      FlatPhysicalDamageMod: 40,
    })
  })
  it('build vide → {}', () => {
    expect(aggregateItemStats([])).toEqual({})
  })
})
