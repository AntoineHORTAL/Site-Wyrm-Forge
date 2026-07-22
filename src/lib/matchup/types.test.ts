import { describe, it, expect } from 'vitest'
import {
  createScenario, resizeToMode, setChampion, setLevel, setBuild, clampLevel,
  slotCounts, emptyChampion, MIN_LEVEL, MAX_LEVEL,
  type ChampRef, type BuildRef,
} from './types'

const AHRI: ChampRef = { id: 'Ahri', name: 'Ahri', image: 'Ahri.png' }
const AHRI_STATS = { hp: 590, hpperlevel: 96, attackdamage: 53 }

describe('slotCounts / resizeToMode — parité modes', () => {
  it('slotCounts couvre les 5 modes', () => {
    expect(slotCounts('1v1')).toEqual({ allies: 1, enemies: 1 })
    expect(slotCounts('2v2')).toEqual({ allies: 2, enemies: 2 })
    expect(slotCounts('1v2')).toEqual({ allies: 1, enemies: 2 })
    expect(slotCounts('2v1')).toEqual({ allies: 2, enemies: 1 })
    expect(slotCounts('5v5')).toEqual({ allies: 5, enemies: 5 })
  })

  it('resizeToMode conserve les champions existants et complète avec des slots vides', () => {
    let s = createScenario('1v1')
    s = setChampion(s, 'allies', 0, AHRI, AHRI_STATS)
    const grown = resizeToMode(s, '5v5')
    expect(grown.allies).toHaveLength(5)
    expect(grown.allies[0].champ).toEqual(AHRI)          // conservé
    expect(grown.allies[1].champ).toBeNull()             // complété vide
  })

  it('resizeToMode tronque les slots en trop', () => {
    let s = createScenario('5v5')
    s = setChampion(s, 'enemies', 0, AHRI, AHRI_STATS)
    const shrunk = resizeToMode(s, '1v1')
    expect(shrunk.enemies).toHaveLength(1)
    expect(shrunk.enemies[0].champ).toEqual(AHRI)
  })
})

describe('clampLevel — bornes 1..18', () => {
  it('borne basse et haute', () => {
    expect(clampLevel(0)).toBe(MIN_LEVEL)
    expect(clampLevel(-3)).toBe(MIN_LEVEL)
    expect(clampLevel(25)).toBe(MAX_LEVEL)
    expect(clampLevel(18)).toBe(18)
  })
  it('tronque les décimales', () => {
    expect(clampLevel(7.9)).toBe(7)
  })
  it('valeur non finie → niveau minimum (input vidé)', () => {
    expect(clampLevel(NaN)).toBe(MIN_LEVEL)
  })
})

describe('setChampion — pose / retrait de champion', () => {
  it('pose le champion + fige le snapshot de stats, sans muter l\'original', () => {
    const s0 = createScenario('1v1')
    const s1 = setChampion(s0, 'allies', 0, AHRI, AHRI_STATS)
    expect(s1.allies[0].champ).toEqual(AHRI)
    expect(s1.allies[0].baseStats).toEqual(AHRI_STATS)
    // immutabilité : l'original reste vide
    expect(s0.allies[0].champ).toBeNull()
    expect(s1).not.toBe(s0)
  })

  it('retirer (champ=null) réinitialise le slot à vide', () => {
    let s = createScenario('1v1')
    s = setLevel(s, 'allies', 0, 11)
    s = setChampion(s, 'allies', 0, AHRI, AHRI_STATS)
    s = setChampion(s, 'allies', 0, null)
    expect(s.allies[0]).toEqual(emptyChampion())
  })

  it('changer de champion réinitialise le build', () => {
    let s = createScenario('1v1')
    s = setChampion(s, 'allies', 0, AHRI, AHRI_STATS)
    // forcer un build temp puis re-poser un champion
    s.allies[0].build = { kind: 'temp', blocks: [] }
    const s2 = setChampion(s, 'allies', 0, { id: 'Zed', name: 'Zed', image: 'Zed.png' }, { hp: 654 })
    expect(s2.allies[0].build).toEqual({ kind: 'none' })
  })

  it('index hors bornes → scénario inchangé', () => {
    const s = createScenario('1v1')
    expect(setChampion(s, 'allies', 5, AHRI, AHRI_STATS)).toBe(s)
  })
})

describe('setLevel — niveau simulé', () => {
  it('applique le niveau clampé au bon slot', () => {
    let s = createScenario('2v2')
    s = setLevel(s, 'enemies', 1, 18)
    expect(s.enemies[1].level).toBe(18)
    expect(s.enemies[0].level).toBe(1)   // les autres inchangés
  })
  it('clamp appliqué (niveau > 18)', () => {
    let s = createScenario('1v1')
    s = setLevel(s, 'allies', 0, 42)
    expect(s.allies[0].level).toBe(MAX_LEVEL)
  })
  it('index hors bornes → scénario inchangé', () => {
    const s = createScenario('1v1')
    expect(setLevel(s, 'enemies', 3, 5)).toBe(s)
  })
})

describe('setBuild — build attaché au slot', () => {
  const TEMP: BuildRef = { kind: 'temp', blocks: [{ id: 'x', name: 'Build', items: [] }] }

  it('attache un build sans toucher champion ni niveau', () => {
    let s = createScenario('1v1')
    s = setChampion(s, 'allies', 0, AHRI, AHRI_STATS)
    s = setLevel(s, 'allies', 0, 9)
    const s2 = setBuild(s, 'allies', 0, { kind: 'saved', buildId: 'b1' })
    expect(s2.allies[0].build).toEqual({ kind: 'saved', buildId: 'b1' })
    expect(s2.allies[0].champ).toEqual(AHRI)   // champion préservé
    expect(s2.allies[0].level).toBe(9)         // niveau préservé
  })

  it('remplace un build existant et peut détacher (none)', () => {
    let s = createScenario('1v1')
    s = setBuild(s, 'enemies', 0, TEMP)
    expect(s.enemies[0].build).toEqual(TEMP)
    s = setBuild(s, 'enemies', 0, { kind: 'none' })
    expect(s.enemies[0].build).toEqual({ kind: 'none' })
  })

  it('index hors bornes → scénario inchangé', () => {
    const s = createScenario('1v1')
    expect(setBuild(s, 'allies', 9, TEMP)).toBe(s)
  })
})
