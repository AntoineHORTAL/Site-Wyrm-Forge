// ════════════════════════════════════════════════════════════════════════════
//  matchup/storage — persistance localStorage des scénarios MatchUp
// ════════════════════════════════════════════════════════════════════════════
// Stockage éphémère côté navigateur (parité avec le matchups.json local du WPF).
// Clé VERSIONNÉE : namespace actif `wf.matchups.v2` (schéma incluant `role?` par
// champion). Migration DOUCE depuis `wf.matchups.v1` au premier accès — voir readAll.
// SSR-safe : hors navigateur (typeof window === 'undefined') toutes les fonctions
// dégradent proprement (lecture → [], écriture → no-op).

import type { MatchUpScenario } from './types'

const KEY    = 'wf.matchups.v2'   // namespace actif (lecture + écriture)
const KEY_V1 = 'wf.matchups.v1'   // ancien namespace — source de migration, conservé (rollback)

function getLS(): Storage | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null
    return window.localStorage
  } catch {
    return null   // accès localStorage bloqué (mode privé strict, etc.)
  }
}

// Parse tolérant : renvoie un tableau ou [] (corruption/JSON invalide → repart propre).
function parseArr(raw: string | null): MatchUpScenario[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as MatchUpScenario[]) : []
  } catch {
    return []
  }
}

function readAll(): MatchUpScenario[] {
  const ls = getLS()
  if (!ls) return []
  try {
    // v2 fait autorité dès que la clé existe (même vide ou corrompue → []), pour ne
    // jamais re-migrer par-dessus un état v2 légitime.
    const rawV2 = ls.getItem(KEY)
    if (rawV2 !== null) return parseArr(rawV2)

    // v2 absent → migration douce depuis v1. Backfill `role: undefined` implicite :
    // les scénarios v1 n'ont pas le champ, il reste absent (= aucun rôle assigné).
    // v1 n'est PAS supprimé (rollback + zéro perte de données).
    const rawV1 = ls.getItem(KEY_V1)
    if (rawV1 === null) return []
    const migrated = parseArr(rawV1)
    try { ls.setItem(KEY, JSON.stringify(migrated)) } catch { /* best-effort */ }
    return migrated
  } catch {
    return []
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

// Purge totale (outil de reset / tests) — les DEUX namespaces (v2 actif + v1
// résiduel) pour qu'un reset ne laisse pas d'ancienne donnée re-migrable.
export function clearScenarios(): void {
  const ls = getLS()
  if (!ls) return
  try { ls.removeItem(KEY); ls.removeItem(KEY_V1) } catch { /* no-op */ }
}
