// F2 — Lot 1 : modèle de calcul « avant / après achat » (PUR, sans réseau ni stockage).
//
// Toute la donnée d'entrée provient de `riot-match-detail`, DÉJÀ chargé côté client
// sur la page de match (timeline frames + itemEvents + kills). Ce module ne fetch
// rien et ne stocke rien : il dérive uniquement des chiffres à partir de `detail`.
//
// ⚠️ Cadrage d'honnêteté (NON négociable, cohérent avec la discipline du projet) :
// ces chiffres décrivent « les stats du joueur PENDANT que cet item était dans son
// inventaire » — une CORRÉLATION temporelle. Jamais un « impact causé par l'item »
// ni une attribution causale. La fenêtre « après » cumule aussi les level-ups, les
// achats suivants et l'état de la partie.

// ── Types d'entrée (sous-ensemble minimal de la réponse riot-match-detail) ──
export interface PurchaseEvent {
  ts: number
  itemId: number
  type: 'PURCHASED' | 'SOLD' | 'UNDONE'
}

// On ne consomme ici que les champs cumulés nécessaires aux deltas de fenêtre.
export interface ImpactFrame {
  ts: number
  playerGold: number[]                       // totalGold cumulé, indexé par participant (0-9)
  playerCs?: number[]                         // CS cumulé
  playerStats?: ({ dmgChampions: number } | null)[]  // dégâts champions cumulés (cache v2)
}

export interface KillEventLite {
  ts: number
  killerId: number                            // participantId 1-based
  victimId: number
  assistingIds: number[]
}

// Sous-ensemble du catalogue DDragon item.json (`data[id]`).
export interface CatalogItem {
  name?: string
  gold?: { total?: number }
  tags?: string[]
  into?: string[]
}
export type ItemCatalog = Record<string, CatalogItem>

// ── Constantes de cadrage (tunables — exposées pour ajustement après validation) ──
export const MIN_ITEM_GOLD    = 400    // sous ce prix → composant / consommable
export const COMPLETED_GOLD   = 1100   // au-dessus : gardé même s'il a un `into` (items qui se transforment)
export const GROUP_MS         = 8000   // achats complétés à < 8 s = une même acquisition (même back)
export const SHORT_WINDOW_MS  = 45000  // fenêtre < 45 s → per-minute non fiable (flag `short`)

// Trinkets / wards : terminaux mais jamais des items de build.
const TRINKET_IDS = new Set(['3340', '3363', '3364', '3330', '2055', '2056'])

/**
 * Un item est « significatif » (item de build complété) si :
 *  - présent au catalogue, hors trinket/ward, hors consommable ;
 *  - pas un composant : soit aucun `into`, soit assez cher pour être un item final
 *    qui se transforme (`gold.total >= COMPLETED_GOLD`) ;
 *  - `gold.total >= MIN_ITEM_GOLD` (élimine composants bon marché et Dark Seal-like).
 */
export function isSignificantItem(itemId: number, catalog: ItemCatalog): boolean {
  const it = catalog[String(itemId)]
  if (!it) return false
  if (TRINKET_IDS.has(String(itemId))) return false
  const tags = it.tags ?? []
  if (tags.includes('Consumable')) return false
  if (tags.includes('Trinket')) return false
  const gold = it.gold?.total ?? 0
  if (gold < MIN_ITEM_GOLD) return false
  const hasInto = (it.into?.length ?? 0) > 0
  if (hasInto && gold < COMPLETED_GOLD) return false   // composant bon marché
  return true
}

// Achats nets : applique les UNDO (retire le dernier PURCHASED du même item).
// Même logique que `cleanedPurchases` de la page (ItemImpact).
export function cleanPurchases(itemEvents: PurchaseEvent[]): PurchaseEvent[] {
  const out: PurchaseEvent[] = []
  for (const ev of itemEvents) {
    if (ev.type === 'UNDONE') {
      for (let i = out.length - 1; i >= 0; i--) {
        if (out[i].type === 'PURCHASED' && out[i].itemId === ev.itemId) { out.splice(i, 1); break }
      }
    } else if (ev.type === 'PURCHASED') {
      out.push(ev)
    }
  }
  return out
}

export interface Cluster { ts: number; itemIds: number[] }

/**
 * Regroupe les achats significatifs complétés à < `groupMs` d'intervalle en une
 * seule « acquisition » (un même back complète parfois 2 items presque en même
 * temps → une seule fenêtre avant/après plutôt que 2 micro-fenêtres vides).
 */
export function buildClusters(
  itemEvents: PurchaseEvent[],
  catalog: ItemCatalog,
  groupMs: number = GROUP_MS,
): Cluster[] {
  const purchases = cleanPurchases(itemEvents)
    .filter(ev => isSignificantItem(ev.itemId, catalog))
    .sort((a, b) => a.ts - b.ts)

  const clusters: Cluster[] = []
  for (const ev of purchases) {
    const last = clusters[clusters.length - 1]
    if (last && ev.ts - last.ts < groupMs) last.itemIds.push(ev.itemId)
    else clusters.push({ ts: ev.ts, itemIds: [ev.itemId] })
  }
  return clusters
}

// ── Interpolation d'une stat cumulée à un instant arbitraire ──
// Les stats cumulées (or, CS, dégâts) sont monotones → interpolation linéaire
// entre les 2 frames encadrantes (les bornes de fenêtre = ts d'achat, non alignés
// sur les frames ~60 s). Renvoie null si la stat est absente (matchs pré-cache-v2).
type Pick = (f: ImpactFrame) => number | null | undefined
function frameVal(f: ImpactFrame, pick: Pick): number | null {
  const v = pick(f)
  return typeof v === 'number' ? v : null
}
function cumAt(frames: ImpactFrame[], ts: number, pick: Pick): number | null {
  if (frames.length === 0) return null
  if (ts <= frames[0].ts) return frameVal(frames[0], pick)
  const lastF = frames[frames.length - 1]
  if (ts >= lastF.ts) return frameVal(lastF, pick)
  for (let i = 0; i < frames.length - 1; i++) {
    const a = frames[i], b = frames[i + 1]
    if (ts >= a.ts && ts <= b.ts) {
      const va = frameVal(a, pick), vb = frameVal(b, pick)
      if (va === null || vb === null) return va ?? vb
      const t = (ts - a.ts) / Math.max(b.ts - a.ts, 1)
      return va + (vb - va) * t
    }
  }
  return frameVal(lastF, pick)
}

function countKda(kills: KillEventLite[], pid: number, start: number, end: number) {
  let k = 0, d = 0, a = 0
  for (const e of kills) {
    if (e.ts < start || e.ts >= end) continue
    if (e.killerId === pid) k++
    if (e.victimId === pid) d++
    if (e.assistingIds?.includes(pid)) a++
  }
  return { k, d, a }
}

export interface WindowStats {
  startMs: number
  endMs: number
  durationMs: number
  short: boolean                              // fenêtre trop courte pour un per-minute fiable
  totals: {
    dmgChampions: number | null               // null = donnée absente (pas cache v2)
    gold: number
    cs: number | null
    kills: number; deaths: number; assists: number
  }
  perMin: {                                   // rates par minute (fenêtres de durées inégales)
    dmgChampions: number | null
    gold: number | null
    cs: number | null
    kills: number | null; deaths: number | null; assists: number | null
  }
}

export interface ItemImpactRow {
  ts: number                                  // instant d'acquisition (1er item du cluster)
  itemIds: number[]                           // items complétés dans cette acquisition
  before: WindowStats                         // segment précédent (avant l'achat)
  after: WindowStats                          // segment suivant (après l'achat, jusqu'au prochain / fin)
}

function windowStats(
  frames: ImpactFrame[], kills: KillEventLite[], pid: number, idx: number,
  start: number, end: number,
): WindowStats {
  const dur = Math.max(end - start, 0)

  const goldS = cumAt(frames, start, f => f.playerGold?.[idx])
  const goldE = cumAt(frames, end,   f => f.playerGold?.[idx])
  const csS   = cumAt(frames, start, f => f.playerCs?.[idx])
  const csE   = cumAt(frames, end,   f => f.playerCs?.[idx])
  const dmgS  = cumAt(frames, start, f => f.playerStats?.[idx]?.dmgChampions)
  const dmgE  = cumAt(frames, end,   f => f.playerStats?.[idx]?.dmgChampions)

  const gold = goldS !== null && goldE !== null ? Math.max(goldE - goldS, 0) : 0
  const cs   = csS   !== null && csE   !== null ? Math.max(csE - csS, 0)     : null
  const dmg  = dmgS  !== null && dmgE  !== null ? Math.max(dmgE - dmgS, 0)   : null

  const { k, d, a } = countKda(kills, pid, start, end)
  const perMin = (v: number | null): number | null =>
    v === null ? null : dur > 0 ? v / (dur / 60000) : 0

  return {
    startMs: start, endMs: end, durationMs: dur, short: dur < SHORT_WINDOW_MS,
    totals: { dmgChampions: dmg, gold, cs, kills: k, deaths: d, assists: a },
    perMin: {
      dmgChampions: perMin(dmg), gold: perMin(gold), cs: perMin(cs),
      kills: perMin(k), deaths: perMin(d), assists: perMin(a),
    },
  }
}

/**
 * Pour chaque acquisition significative, calcule les stats du segment AVANT
 * (période précédente) et du segment APRÈS (période suivante, jusqu'à la prochaine
 * acquisition ou la fin de partie). Segments = intervalles entre acquisitions.
 */
export function computeItemImpact(input: {
  itemEvents: PurchaseEvent[]
  frames: ImpactFrame[]
  kills: KillEventLite[]
  catalog: ItemCatalog
  myIdx: number                               // index 0-based du joueur consulté
  gameDurationMs: number
}): ItemImpactRow[] {
  const { itemEvents, frames, kills, catalog, myIdx, gameDurationMs } = input
  const pid = myIdx + 1
  const clusters = buildClusters(itemEvents, catalog)
  if (clusters.length === 0) return []

  // Bornes de segments : [0, c0, c1, ..., c_{n-1}, gameEnd]
  const bounds = [0, ...clusters.map(c => c.ts), gameDurationMs]

  return clusters.map((c, i) => ({
    ts: c.ts,
    itemIds: c.itemIds,
    before: windowStats(frames, kills, pid, myIdx, bounds[i],     bounds[i + 1]),
    after:  windowStats(frames, kills, pid, myIdx, bounds[i + 1], bounds[i + 2]),
  }))
}
