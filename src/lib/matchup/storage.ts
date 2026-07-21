// ════════════════════════════════════════════════════════════════════════════
//  matchup/storage — persistance localStorage des scénarios MatchUp
// ════════════════════════════════════════════════════════════════════════════
// Stockage éphémère côté navigateur (parité avec le matchups.json local du WPF).
// Clé VERSIONNÉE `wf.matchups.v1` : une bump de version = nouveau namespace, les
// anciennes données n'entrent jamais en conflit avec un futur schéma.
// SSR-safe : hors navigateur (typeof window === 'undefined') toutes les fonctions
// dégradent proprement (lecture → [], écriture → no-op).

import type { MatchUpScenario } from './types'

const KEY = 'wf.matchups.v1'

function getLS(): Storage | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null
    return window.localStorage
  } catch {
    return null   // accès localStorage bloqué (mode privé strict, etc.)
  }
}

function readAll(): MatchUpScenario[] {
  const ls = getLS()
  if (!ls) return []
  try {
    const raw = ls.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as MatchUpScenario[]) : []
  } catch {
    return []   // corruption/JSON invalide → repart propre plutôt que de crasher
  }
}

function writeAll(scenarios: MatchUpScenario[]): void {
  const ls = getLS()
  if (!ls) return
  try {
    ls.setItem(KEY, JSON.stringify(scenarios))
  } catch {
    /* quota dépassé / écriture refusée → best-effort silencieux */
  }
}

// Tous les scénarios, plus récemment modifié en premier (comme la liste WPF/BuildsTab).
export function listScenarios(): MatchUpScenario[] {
  return readAll().sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))
}

export function getScenario(id: string): MatchUpScenario | null {
  return readAll().find(s => s.id === id) ?? null
}

// Upsert par id (crée ou remplace). Pose `updatedAt = now`. Retourne la version écrite.
export function saveScenario(scenario: MatchUpScenario): MatchUpScenario {
  const toSave: MatchUpScenario = { ...scenario, updatedAt: new Date().toISOString() }
  const all = readAll()
  const idx = all.findIndex(s => s.id === toSave.id)
  if (idx >= 0) all[idx] = toSave
  else all.push(toSave)
  writeAll(all)
  return toSave
}

export function deleteScenario(id: string): void {
  writeAll(readAll().filter(s => s.id !== id))
}

// Purge totale du namespace (outil de reset / tests).
export function clearScenarios(): void {
  const ls = getLS()
  if (!ls) return
  try { ls.removeItem(KEY) } catch { /* no-op */ }
}
