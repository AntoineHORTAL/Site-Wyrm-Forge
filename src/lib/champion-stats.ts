// ════════════════════════════════════════════════════════════════════════════
//  champion-stats — calcul centralisé des stats de champion (Wyrm Forge)
// ════════════════════════════════════════════════════════════════════════════
// Centralise deux calculs qui vivaient inline :
//   • scaling stat de base par niveau — `src/app/champion/[id]/page.tsx` affichait
//     `data.stats.hp` (+ `+hpperlevel/niveau`) au niveau 1 : `statAtLevel(base, per, 1)`
//     redonne exactement la valeur de base (identité au niveau 1).
//   • agrégation des stats d'items d'un build — `BuildsTab.tsx` sommait
//     `item.stats[k] * count` sur tous les blocs : `aggregateItemStats`.
// Portage web du calcul WPF `MatchUpEditorView` (GetStatAtLevel / GetItemStat).
// Miroir de la formule C# : `base + perLevel * (level - 1)`.

export type RawStats = Record<string, number>

// Paires (clé de base → clé perlevel) des stats DDragon scalables au niveau.
// `movespeed` et `attackrange` n'ont pas de composante perlevel (perLevelKey null).
export const BASE_STAT_KEYS: { key: string; perLevelKey: string | null }[] = [
  { key: 'hp',           perLevelKey: 'hpperlevel' },
  { key: 'mp',           perLevelKey: 'mpperlevel' },
  { key: 'armor',        perLevelKey: 'armorperlevel' },
  { key: 'spellblock',   perLevelKey: 'spellblockperlevel' },
  { key: 'attackdamage', perLevelKey: 'attackdamageperlevel' },
  { key: 'attackspeed',  perLevelKey: 'attackspeedperlevel' },
  { key: 'hpregen',      perLevelKey: 'hpregenperlevel' },
  { key: 'mpregen',      perLevelKey: 'mpregenperlevel' },
  { key: 'crit',         perLevelKey: 'critperlevel' },
  { key: 'movespeed',    perLevelKey: null },
  { key: 'attackrange',  perLevelKey: null },
]

// Stat de base scalée au niveau. Niveau 1 → valeur de base (identité).
// Tolère undefined/null (traités comme 0), comme les `?? 0` du code d'origine.
export function statAtLevel(base: number, perLevel: number, level: number): number {
  return (base ?? 0) + (perLevel ?? 0) * (level - 1)
}

// Toutes les stats de base scalées à `level`, indexées par clé de base DDragon.
export function scaledBaseStats(stats: RawStats, level: number): RawStats {
  const out: RawStats = {}
  for (const { key, perLevelKey } of BASE_STAT_KEYS) {
    const base = stats[key] ?? 0
    const per  = perLevelKey ? (stats[perLevelKey] ?? 0) : 0
    out[key] = statAtLevel(base, per, level)
  }
  return out
}

// Bloc de build minimal pour l'agrégation (structurellement compatible avec
// `BuildBlock` de BuildsTab et `MatchUpBuildBlock` de matchup/types).
export interface StatBlock {
  items: { item: { stats: RawStats }; count: number }[]
}

// Somme des stats d'items sur tous les blocs — miroir EXACT de l'ancienne
// boucle `statTotals` de BuildsTab (aucun changement de sémantique).
export function aggregateItemStats(blocks: StatBlock[]): RawStats {
  const totals: RawStats = {}
  for (const b of blocks) {
    for (const { item, count } of b.items) {
      for (const [k, v] of Object.entries(item.stats)) {
        totals[k] = (totals[k] ?? 0) + v * count
      }
    }
  }
  return totals
}
