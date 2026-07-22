// ════════════════════════════════════════════════════════════════════════════
//  matchup/build-resolve — résolution d'un BuildRef en stats agrégées (Lot 2.3)
// ════════════════════════════════════════════════════════════════════════════
// Pont pur entre le modèle de build d'un slot (`BuildRef`) et le calcul central
// `aggregateItemStats` (champion-stats). Trois cas :
//   • none  → aucun bloc → stats vides.
//   • temp  → blocs inline ; les stats sont DÉJÀ figées dans chaque item snapshot
//             (MatchUpBuildItem.stats), donc auto-suffisant (localStorage stable).
//   • saved → on ne stocke que le buildId ; les blocs du build `item_builds` ne
//             portent que `itemId`+`count` (format slim), donc les stats sont
//             résolues à la volée via l'index DDragon `itemStats[itemId]`.
// Un item introuvable (build supprimé, item retiré de DDragon) dégrade en 0 stat
// plutôt que de planter — parité avec la réhydratation tolérante de BuildsTab.

import { aggregateItemStats, type RawStats, type StatBlock } from '../champion-stats'
import type { BuildRef } from './types'

// Vue minimale d'un build sauvegardé nécessaire à la résolution (sous-ensemble
// des lignes `item_builds` : on ignore name/champ/gold ici, seuls itemId+count
// comptent pour l'agrégation des stats).
export interface SavedBuildBlockLite {
  items: { itemId: string; count: number }[]
}
export interface SavedBuildLite {
  id: string
  blocks: SavedBuildBlockLite[]
}

// Index DDragon : itemId → stats brutes (FlatPhysicalDamageMod, etc.).
export type ItemStatsIndex = Record<string, RawStats>

// Convertit un BuildRef en blocs compatibles `aggregateItemStats`.
export function buildToStatBlocks(
  build: BuildRef,
  savedById: Record<string, SavedBuildLite>,
  itemStats: ItemStatsIndex,
): StatBlock[] {
  if (build.kind === 'none') return []

  if (build.kind === 'temp') {
    return build.blocks.map(b => ({
      items: b.items.map(it => ({ item: { stats: it.stats ?? {} }, count: it.count })),
    }))
  }

  // kind === 'saved' : résoudre les stats depuis l'index DDragon.
  const saved = savedById[build.buildId]
  if (!saved) return []
  return saved.blocks.map(b => ({
    items: b.items.map(si => ({ item: { stats: itemStats[si.itemId] ?? {} }, count: si.count })),
  }))
}

// Stats d'items agrégées d'un build (raccourci buildToStatBlocks + aggregate).
export function resolveBuildStats(
  build: BuildRef,
  savedById: Record<string, SavedBuildLite>,
  itemStats: ItemStatsIndex,
): RawStats {
  return aggregateItemStats(buildToStatBlocks(build, savedById, itemStats))
}
