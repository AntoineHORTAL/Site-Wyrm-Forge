// ════════════════════════════════════════════════════════════════════════════
//  ddragon — cartes DDragon partagées (champions / sorts d'invocateur / runes)
// ════════════════════════════════════════════════════════════════════════════
// Extraction (Lot D3) d'un bloc STRICTEMENT identique recopié dans
// `app/summoner/[region]/[riotId]/page.tsx`, `app/match/[platform]/[matchId]/page.tsx`
// et `app/matches/[region]/[riotId]/page.tsx` : mêmes constantes d'URL, mêmes
// interfaces ChampInfo/SpellInfo/RuneInfo, même triple fetch, même boucle de
// transformation vers des `Record<number, …>` indexés par ID numérique Riot.
//
// ⚠️ NE PAS confondre avec `src/lib/matchup/ddragon.ts`, qui reste séparé À
// DESSEIN : ce loader-ci indexe par **ID numérique** (championId, spell id,
// perk id) pour résoudre les identifiants renvoyés par l'API Riot ; celui de
// MatchUp indexe par **clé DDragon** et conserve `stats` (base + perlevel) pour
// le scaling par niveau, dont on n'a aucun usage ici. Les fusionner obligerait
// à charger `item.json` (~1 Mo) sur des pages qui n'en ont pas besoin.
//
// Aucun import `@/…` : l'alias n'est pas configuré dans vitest (même contrainte
// que `src/lib/live-game.ts` et `src/lib/matchup/payload.ts`).

const DDN = 'https://ddragon.leagueoflegends.com'

export interface ChampInfo { id: string; name: string; image: string }
export interface SpellInfo { id: string; name: string; image: string }
export interface RuneInfo { id: number; name: string; icon: string }

export interface DDragonMaps {
  version: string
  champs: Record<number, ChampInfo>
  spells: Record<number, SpellInfo>
  runes: Record<number, RuneInfo>
}

// ── URLs d'images (signatures identiques aux copies remplacées) ──────────────
export const champImg = (v: string, img: string) => `${DDN}/cdn/${v}/img/champion/${img}`
export const itemImg = (v: string, id: number) => `${DDN}/cdn/${v}/img/item/${id}.png`
export const spellImg = (v: string, img: string) => `${DDN}/cdn/${v}/img/spell/${img}`
export const runeImg = (path: string) => `${DDN}/cdn/img/${path}`
/** Icône de profil — ajoutée pour Live Game (spectator-v5 renvoie profileIconId). */
export const profileIconImg = (v: string, id: number) => `${DDN}/cdn/${v}/img/profileicon/${id}.png`
/**
 * `item.json` (catalogue complet, ~1 Mo). Volontairement PAS chargé par
 * `loadDDragonMaps` : seules les pages qui affichent des items en ont besoin
 * (/match), les autres n'ont pas à payer ce téléchargement.
 */
export const itemDataUrl = (v: string) => `${DDN}/cdn/${v}/data/fr_FR/item.json`

// ── Parsers PURS (testables sans réseau) ─────────────────────────────────────
// Chaque parser tolère une entrée partielle/inattendue plutôt que de throw :
// une page qui perd ses icônes reste lisible, une page qui crash ne l'est pas.

/* eslint-disable @typescript-eslint/no-explicit-any */

/** `champion.json` → index par championId numérique (`key`, pas `id`). */
export function parseChampions(raw: any): Record<number, ChampInfo> {
  const out: Record<number, ChampInfo> = {}
  const data = raw?.data
  if (!data || typeof data !== 'object') return out
  Object.values(data as Record<string, any>).forEach((ch: any) => {
    const key = Number(ch?.key)
    // `key` est l'identifiant numérique utilisé par l'API Riot ; `id` est la
    // clé texte ("Ahri"). Les confondre donne une carte vide sans erreur.
    if (!Number.isFinite(key)) return
    out[key] = { id: ch.id, name: ch.name, image: ch.image?.full ?? '' }
  })
  return out
}

/** `summoner.json` → index par id de sort d'invocateur. */
export function parseSummonerSpells(raw: any): Record<number, SpellInfo> {
  const out: Record<number, SpellInfo> = {}
  const data = raw?.data
  if (!data || typeof data !== 'object') return out
  Object.values(data as Record<string, any>).forEach((sp: any) => {
    const key = Number(sp?.key)
    if (!Number.isFinite(key)) return
    out[key] = { id: sp.id, name: sp.name, image: sp.image?.full ?? '' }
  })
  return out
}

/**
 * `runesReforged.json` → index PLAT par perk id : arbres ET runes dans la même
 * carte. Voulu — l'API Riot mélange les deux familles d'identifiants
 * (`perkSubStyle` désigne un arbre, `perkIds[0]` une rune), et les IDs ne se
 * chevauchent pas.
 */
export function parseRunes(raw: any): Record<number, RuneInfo> {
  const out: Record<number, RuneInfo> = {}
  if (!Array.isArray(raw)) return out
  raw.forEach((tree: any) => {
    if (!tree || !Number.isFinite(Number(tree.id))) return
    out[tree.id] = { id: tree.id, name: tree.name, icon: tree.icon }
    tree.slots?.forEach((slot: any) =>
      slot?.runes?.forEach((rune: any) => {
        if (!rune || !Number.isFinite(Number(rune.id))) return
        out[rune.id] = { id: rune.id, name: rune.name, icon: rune.icon }
      }),
    )
  })
  return out
}

/* eslint-enable @typescript-eslint/no-explicit-any */

// ── Loader mémoïsé ───────────────────────────────────────────────────────────

let _cache: DDragonMaps | null = null
let _inflight: Promise<DDragonMaps> | null = null

/** Réinitialise le cache module (tests, ou forcer un rechargement de patch). */
export function clearDDragonMapsCache(): void {
  _cache = null
  _inflight = null
}

/**
 * Charge version + cartes champions/sorts/runes. Mémoïsé au niveau module :
 * une seule salve réseau par session, quel que soit le nombre de pages
 * visitées (les copies remplacées re-téléchargeaient tout à chaque navigation).
 *
 * `_inflight` déduplique aussi les appels CONCURRENTS : deux composants montés
 * en même temps partagent la même promesse au lieu de lancer deux salves.
 *
 * La version est toujours `versions[0]` (dernière publiée) — comportement
 * historique du site, à ne pas confondre avec le figeage volontaire sur
 * `14.24.1` de `ScenarioService.MapImageUrl` côté WPF.
 */
export function loadDDragonMaps(): Promise<DDragonMaps> {
  if (_cache) return Promise.resolve(_cache)
  if (_inflight) return _inflight

  _inflight = (async () => {
    const versions: string[] = await (await fetch(`${DDN}/api/versions.json`)).json()
    const v = versions[0]

    const [cData, sData, rData] = await Promise.all([
      fetch(`${DDN}/cdn/${v}/data/fr_FR/champion.json`).then(r => r.json()),
      fetch(`${DDN}/cdn/${v}/data/fr_FR/summoner.json`).then(r => r.json()),
      fetch(`${DDN}/cdn/${v}/data/fr_FR/runesReforged.json`).then(r => r.json()),
    ])

    const maps: DDragonMaps = {
      version: v,
      champs: parseChampions(cData),
      spells: parseSummonerSpells(sData),
      runes: parseRunes(rData),
    }
    _cache = maps
    return maps
  })()

  // Un échec réseau ne doit pas figer une promesse rejetée pour toute la
  // session : on relâche `_inflight` pour que le prochain appel réessaie.
  _inflight.catch(() => { _inflight = null })
  return _inflight
}
