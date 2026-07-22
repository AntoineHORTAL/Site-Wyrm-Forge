import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { listScenarios, getScenario, saveScenario, deleteScenario, clearScenarios } from './storage'
import { createScenario } from './types'

// localStorage minimal (Map) — l'env vitest est `node`, pas de window par défaut.
function makeLocalStorage(): Storage {
  const m = new Map<string, string>()
  return {
    getItem:    (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem:    (k: string, v: string) => { m.set(k, String(v)) },
    removeItem: (k: string) => { m.delete(k) },
    clear:      () => m.clear(),
    key:        (i: number) => Array.from(m.keys())[i] ?? null,
    get length() { return m.size },
  } as Storage
}

beforeEach(() => { (globalThis as { window?: unknown }).window = { localStorage: makeLocalStorage() } })
afterEach(()  => { delete (globalThis as { window?: unknown }).window })

describe('matchup/storage — CRUD localStorage (wf.matchups.v1)', () => {
  it('liste vide au départ', () => {
    expect(listScenarios()).toEqual([])
  })

  it('save puis read', () => {
    const s = createScenario('2v2', 'Test')
    saveScenario(s)
    expect(getScenario(s.id)?.name).toBe('Test')
    expect(listScenarios()).toHaveLength(1)
  })

  it('save = upsert par id (pas de doublon)', () => {
    const s = createScenario('1v1', 'A')
    saveScenario(s)
    saveScenario({ ...s, name: 'A modifié' })
    expect(listScenarios()).toHaveLength(1)
    expect(getScenario(s.id)?.name).toBe('A modifié')
  })

  it('delete retire le scénario', () => {
    const s = createScenario('1v1', 'X')
    saveScenario(s)
    deleteScenario(s.id)
    expect(getScenario(s.id)).toBeNull()
    expect(listScenarios()).toEqual([])
  })

  it('deux scénarios coexistent, triés par updatedAt desc', () => {
    // saveScenario tamponne updatedAt=now → on pilote l'horloge pour un ordre déterministe.
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    const a = saveScenario(createScenario('1v1', 'Ancien'))
    vi.setSystemTime(new Date('2026-01-01T00:01:00Z'))
    const b = saveScenario(createScenario('1v1', 'Récent'))
    vi.useRealTimers()

    const ids = listScenarios().map(s => s.id)
    expect(ids).toContain(a.id)
    expect(ids[0]).toBe(b.id)   // plus récent en premier
  })

  it('clearScenarios purge tout', () => {
    saveScenario(createScenario('1v1', 'Z'))
    clearScenarios()
    expect(listScenarios()).toEqual([])
  })

  it('localStorage corrompu → liste vide (pas de crash)', () => {
    window.localStorage.setItem('wf.matchups.v1', '{ceci n’est pas du JSON')
    expect(listScenarios()).toEqual([])
  })

  it('SSR-safe : sans window, lecture=[] et écriture=no-op sans throw', () => {
    delete (globalThis as { window?: unknown }).window
    expect(listScenarios()).toEqual([])
    expect(() => saveScenario(createScenario())).not.toThrow()
    expect(() => deleteScenario('x')).not.toThrow()
  })
})

describe('matchup/storage — migration douce v1 → v2', () => {
  // Un scénario "v1" : sérialisé AVANT l'ajout du champ role (donc role absent).
  function v1Scenario() {
    const s = createScenario('1v1', 'Sauvé en v1')
    // createScenario ne pose déjà pas de role → représente fidèlement un scénario v1.
    return s
  }

  it('un scénario v1 se charge après migration : role absent, aucun crash', () => {
    const s = v1Scenario()
    window.localStorage.setItem('wf.matchups.v1', JSON.stringify([s]))

    let loaded: ReturnType<typeof listScenarios> = []
    expect(() => { loaded = listScenarios() }).not.toThrow()

    expect(loaded).toHaveLength(1)
    expect(loaded[0].name).toBe('Sauvé en v1')
    expect(loaded[0].allies[0].role).toBeUndefined()   // backfill undefined
    expect(loaded[0].enemies[0].role).toBeUndefined()
  })

  it('la migration écrit v2 et CONSERVE v1 (rollback, zéro perte)', () => {
    window.localStorage.setItem('wf.matchups.v1', JSON.stringify([v1Scenario()]))
    listScenarios()   // déclenche la migration

    expect(window.localStorage.getItem('wf.matchups.v2')).not.toBeNull()  // v2 peuplé
    expect(window.localStorage.getItem('wf.matchups.v1')).not.toBeNull()  // v1 intact
  })

  it('migration idempotente : v2 fait autorité, pas de re-migration depuis v1', () => {
    window.localStorage.setItem('wf.matchups.v1', JSON.stringify([v1Scenario()]))
    listScenarios()   // migre v1 → v2

    // On modifie v1 après coup : ne doit PLUS influencer les lectures (v2 autoritaire).
    window.localStorage.setItem('wf.matchups.v1', JSON.stringify([createScenario('5v5', 'Fantôme v1')]))
    const after = listScenarios()
    expect(after).toHaveLength(1)
    expect(after[0].name).toBe('Sauvé en v1')   // toujours le scénario migré, pas le fantôme
  })

  it('v2 présent → v1 ignoré (aucune migration)', () => {
    const v2 = createScenario('2v2', 'Direct v2')
    window.localStorage.setItem('wf.matchups.v2', JSON.stringify([v2]))
    window.localStorage.setItem('wf.matchups.v1', JSON.stringify([createScenario('1v1', 'Vieux v1')]))
    const loaded = listScenarios()
    expect(loaded).toHaveLength(1)
    expect(loaded[0].name).toBe('Direct v2')
  })
})
