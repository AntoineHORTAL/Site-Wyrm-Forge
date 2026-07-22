// ════════════════════════════════════════════════════════════════════════════
//  matchup/types — modèle de données du scénario MatchUp (portage web du WPF)
// ════════════════════════════════════════════════════════════════════════════
// Miroir des modèles WPF `MatchUp` / `MatchUpChampion` (Logiciel-Assistant-LOL).
// Persistance : localStorage éphémère (voir matchup/storage.ts) — parité avec le
// comportement `matchups.json` local du WPF, aucune table Supabase.

import type { RawStats } from '../champion-stats'

export type MatchUpMode = '1v1' | '2v2' | '1v2' | '2v1' | '5v5'

// Rôle d'un slot (OPTIONNEL). Même vocabulaire que l'éditeur Scénarios (`Role`),
// dupliqué ici volontairement tant que le lot UI ne consolide pas un module
// partagé. Sert au futur cap de niveau conditionnel (TOP → 20, sinon 18) et à
// l'enrichissement du prompt d'analyse. Absent = pas de rôle assigné (défaut sûr).
export type MatchUpRole = 'TOP' | 'JUNGLE' | 'MID' | 'ADC' | 'SUPPORT'

// Identité minimale d'un champion pour un slot (sous-ensemble de DDChamp).
export interface ChampRef {
  id: string
  name: string
  image: string   // ex: "Ahri.png" (nom de fichier DDragon)
}

// Item d'un build temporaire (snapshot autonome : nom + stats figés à la sélection).
export interface MatchUpBuildItem {
  id: string
  name: string
  image: string
  stats: RawStats
  count: number
}

export interface MatchUpBuildBlock {
  id: string
  name: string
  items: MatchUpBuildItem[]
}

// Référence de build d'un champion : aucun / build sauvegardé (item_builds) /
// build temporaire ad-hoc (snapshot inline, comme le TempBuild du WPF).
export type BuildRef =
  | { kind: 'none' }
  | { kind: 'saved'; buildId: string }
  | { kind: 'temp';  blocks: MatchUpBuildBlock[] }

export interface MatchUpChampion {
  champ: ChampRef | null
  level: number            // niveau simulé 1..18
  build: BuildRef
  baseStats: RawStats      // snapshot des stats DDragon (base + perlevel) figé à la sélection
  role?: MatchUpRole       // OPTIONNEL — absent = aucun rôle assigné (scénarios v1 migrés)
}

export interface MatchUpScenario {
  id: string
  name: string
  mode: MatchUpMode
  allies: MatchUpChampion[]
  enemies: MatchUpChampion[]
  createdAt: string        // ISO
  updatedAt: string        // ISO
}

// ── Factories ────────────────────────────────────────────────────────────────

// Nombre de slots par camp selon le mode (miroir de GetSlotCounts du WPF).
export function slotCounts(mode: MatchUpMode): { allies: number; enemies: number } {
  switch (mode) {
    case '1v1': return { allies: 1, enemies: 1 }
    case '2v2': return { allies: 2, enemies: 2 }
    case '1v2': return { allies: 1, enemies: 2 }
    case '2v1': return { allies: 2, enemies: 1 }
    case '5v5': return { allies: 5, enemies: 5 }
  }
}

export function emptyChampion(): MatchUpChampion {
  return { champ: null, level: 1, build: { kind: 'none' }, baseStats: {} }
}

function uid(): string {
  return globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2, 11)
}

// Crée un scénario neuf avec le bon nombre de slots vides par camp.
export function createScenario(mode: MatchUpMode = '1v1', name = ''): MatchUpScenario {
  const { allies, enemies } = slotCounts(mode)
  const now = new Date().toISOString()
  return {
    id: uid(),
    name,
    mode,
    allies:  Array.from({ length: allies },  emptyChampion),
    enemies: Array.from({ length: enemies }, emptyChampion),
    createdAt: now,
    updatedAt: now,
  }
}

// Ajuste le nombre de slots d'un scénario à son mode (conserve les champions
// existants, tronque ou complète avec des slots vides). Utilisé au changement
// de mode côté UI (Lot 2).
export function resizeToMode(scenario: MatchUpScenario, mode: MatchUpMode): MatchUpScenario {
  const { allies, enemies } = slotCounts(mode)
  const fit = (list: MatchUpChampion[], n: number): MatchUpChampion[] => {
    const out = list.slice(0, n)
    while (out.length < n) out.push(emptyChampion())
    return out
  }
  return { ...scenario, mode, allies: fit(scenario.allies, allies), enemies: fit(scenario.enemies, enemies) }
}

// ── Mutateurs de slot (purs, testables) — Lot 2.2 ────────────────────────────

export type Side = 'allies' | 'enemies'

export const MIN_LEVEL = 1
export const MAX_LEVEL = 18       // cap standard d'un champion LoL
export const MAX_LEVEL_TOP = 20   // Top ayant complété sa Role Quest (Season 16)

// Cap de niveau CONDITIONNEL au rôle du slot. Seul le Top peut dépasser 18 (20 via
// la Role Quest S16) ; tous les autres rôles — ET l'absence de rôle — restent à 18.
// Défaut sûr : un slot sans rôle assigné n'hérite jamais du cap étendu.
export function maxLevelForRole(role?: MatchUpRole): number {
  return role === 'TOP' ? MAX_LEVEL_TOP : MAX_LEVEL
}

// Ramène un niveau dans [1, cap du rôle] et le tronque à un entier (miroir du clamp
// WPF). Valeur non finie (NaN venant d'un <input> vide) → niveau minimum.
// `role` omis → cap 18 (comportement historique préservé).
export function clampLevel(level: number, role?: MatchUpRole): number {
  if (!Number.isFinite(level)) return MIN_LEVEL
  return Math.min(maxLevelForRole(role), Math.max(MIN_LEVEL, Math.trunc(level)))
}

// Remplace un slot par le résultat de `fn` sans muter l'original (copie immuable).
// Index hors bornes → scénario inchangé (garde défensif).
function updateSlot(
  scenario: MatchUpScenario,
  side: Side,
  index: number,
  fn: (slot: MatchUpChampion) => MatchUpChampion,
): MatchUpScenario {
  const list = scenario[side]
  if (index < 0 || index >= list.length) return scenario
  const next = list.slice()
  next[index] = fn(next[index])
  return { ...scenario, [side]: next }
}

// Pose (ou retire) le champion d'un slot. `champ === null` réinitialise le slot
// à vide (champ/build/stats effacés). Poser un champion fige son snapshot de
// stats DDragon (`baseStats`) et réinitialise le build (l'ancien référençait
// l'ancien champion) ; le niveau simulé est conservé.
export function setChampion(
  scenario: MatchUpScenario,
  side: Side,
  index: number,
  champ: ChampRef | null,
  baseStats: RawStats = {},
): MatchUpScenario {
  return updateSlot(scenario, side, index, slot => {
    if (!champ) return emptyChampion()
    return { ...slot, champ, baseStats, build: { kind: 'none' } }
  })
}

// Change le niveau simulé d'un slot (clampé au cap du rôle du slot : 20 si Top,
// 18 sinon — y compris sans rôle assigné).
export function setLevel(scenario: MatchUpScenario, side: Side, index: number, level: number): MatchUpScenario {
  return updateSlot(scenario, side, index, slot => ({ ...slot, level: clampLevel(level, slot.role) }))
}

// Assigne (ou retire avec `null`) le rôle d'un slot — Lot 3. Re-clampe le niveau
// dans la foulée : quitter Top rabaisse un niveau 19/20 à 18, sinon le scénario
// garderait un niveau devenu illégal pour le nouveau rôle.
export function setRole(scenario: MatchUpScenario, side: Side, index: number, role: MatchUpRole | null): MatchUpScenario {
  return updateSlot(scenario, side, index, slot => {
    const next: MatchUpChampion = { ...slot }
    if (role) next.role = role
    else delete next.role
    next.level = clampLevel(next.level, next.role)
    return next
  })
}

// Attache (ou retire) une référence de build à un slot — Lot 2.3. Ne touche ni
// au champion ni au niveau. `{ kind: 'none' }` détache le build.
export function setBuild(scenario: MatchUpScenario, side: Side, index: number, build: BuildRef): MatchUpScenario {
  return updateSlot(scenario, side, index, slot => ({ ...slot, build }))
}
