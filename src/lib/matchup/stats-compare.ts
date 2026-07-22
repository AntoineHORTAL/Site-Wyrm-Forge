// ════════════════════════════════════════════════════════════════════════════
//  matchup/stats-compare — agrégats de comparaison Alliés vs Ennemis (Lot 2.4)
// ════════════════════════════════════════════════════════════════════════════
// Miroir pur de `AddStatsComparison` du WPF (MatchUpEditorView) : pour chaque axe
// (stat de base scalable), le total d'un camp = Σ sur les champions de
//   [ stat de base scalée au niveau ]  +  [ contribution des items du build ].
// La stat de base utilise les clés DDragon (hp, attackdamage…) ; la contribution
// item utilise la clé item correspondante (FlatHPPoolMod…) — mapping `itemKey`.
// `attackrange` n'a pas d'équivalent item → base seule (comme le WPF).
//
// Formule base scalée = base + perLevel*(niveau-1), identique à GetStatAtLevel /
// statAtLevel. Parité assumée avec le WPF, y compris pour attackspeed (perlevel
// DDragon en points, sommé tel quel) : la comparaison est relative par axe.

import { statAtLevel } from '../champion-stats'
import { resolveBuildStats, type SavedBuildLite, type ItemStatsIndex } from './build-resolve'
import type { MatchUpChampion } from './types'

// Un axe du radar : clé DDragon de base, libellé court, clé item à sommer (ou null).
export interface RadarAxisDef {
  key: string
  label: string
  itemKey: string | null
}

// 11 axes — miroir exact de statLabels/statItemKeys du WPF.
export const RADAR_AXES: RadarAxisDef[] = [
  { key: 'hp',           label: 'PV',         itemKey: 'FlatHPPoolMod' },
  { key: 'hpregen',      label: 'Régén PV',   itemKey: 'FlatHPRegenMod' },
  { key: 'mp',           label: 'Mana',       itemKey: 'FlatMPPoolMod' },
  { key: 'mpregen',      label: 'Régén mana', itemKey: 'FlatMPRegenMod' },
  { key: 'armor',        label: 'Armure',     itemKey: 'FlatArmorMod' },
  { key: 'spellblock',   label: 'Rés. mag.',  itemKey: 'FlatSpellBlockMod' },
  { key: 'attackdamage', label: 'AD',         itemKey: 'FlatPhysicalDamageMod' },
  { key: 'attackspeed',  label: 'Vit. att.',  itemKey: 'PercentAttackSpeedMod' },
  { key: 'attackrange',  label: 'Portée',     itemKey: null },
  { key: 'movespeed',    label: 'Vit. dépl.', itemKey: 'FlatMovementSpeedMod' },
  { key: 'crit',         label: 'Crit',       itemKey: 'FlatCritChanceMod' },
]

// Valeur d'un axe : totaux bruts des deux camps (avant normalisation d'affichage).
export interface RadarAxisValue {
  key: string
  label: string
  ally: number
  enemy: number
}

// Total d'un camp pour chaque axe (Σ base scalée + contribution items).
function teamTotals(
  team: MatchUpChampion[],
  savedById: Record<string, SavedBuildLite>,
  itemStats: ItemStatsIndex,
): Record<string, number> {
  const totals: Record<string, number> = {}
  for (const ax of RADAR_AXES) totals[ax.key] = 0

  for (const champ of team) {
    if (!champ.champ) continue   // slot vide ignoré
    const items = resolveBuildStats(champ.build, savedById, itemStats)
    for (const ax of RADAR_AXES) {
      const base = statAtLevel(
        champ.baseStats[ax.key] ?? 0,
        champ.baseStats[ax.key + 'perlevel'] ?? 0,
        champ.level,
      )
      const item = ax.itemKey ? (items[ax.itemKey] ?? 0) : 0
      totals[ax.key] += base + item
    }
  }
  return totals
}

// Totaux par axe pour les deux camps.
export function computeRadar(
  allies: MatchUpChampion[],
  enemies: MatchUpChampion[],
  savedById: Record<string, SavedBuildLite>,
  itemStats: ItemStatsIndex,
): RadarAxisValue[] {
  const a = teamTotals(allies, savedById, itemStats)
  const e = teamTotals(enemies, savedById, itemStats)
  return RADAR_AXES.map(ax => ({ key: ax.key, label: ax.label, ally: a[ax.key], enemy: e[ax.key] }))
}

// Normalisation PAR AXE (unités hétérogènes : PV ~2000 vs crit ~0.2) : le camp le
// plus élevé atteint le bord (1), l'autre est proportionnel. max ≤ 0 → 0/0.
export function normalizeAxis(ally: number, enemy: number): { ally: number; enemy: number } {
  const max = Math.max(ally, enemy)
  if (max <= 0) return { ally: 0, enemy: 0 }
  return { ally: ally / max, enemy: enemy / max }
}
