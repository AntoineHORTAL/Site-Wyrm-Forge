// ════════════════════════════════════════════════════════════════════════════
//  matchup/ddragon — chargement des données DDragon pour l'éditeur MatchUp
// ════════════════════════════════════════════════════════════════════════════
// Loader dédié MatchUp (self-contained). Reprend la source DDragon de BuildsTab
// (versions.json + champion.json + item.json en fr_FR) MAIS conserve en plus le
// champ `stats` des champions (base + perlevel) requis pour le scaling par niveau.
// Résultat mémoïsé au niveau module (une seule salve réseau par session).

import type { RawStats } from '../champion-stats'

const DDN = 'https://ddragon.leagueoflegends.com'

export interface DDChampFull {
  id: string        // clé DDragon, ex "Ahri"
  name: string      // nom affiché, ex "Ahri"
  image: string     // fichier icône, ex "Ahri.png"
  stats: RawStats   // stats de base + perlevel (hp, hpperlevel, armor, ...)
}

export interface DDItemFull {
  id: string
  name: string
  image: string
  gold: number
  tags: string[]
  stats: RawStats
}

export interface DDragonData {
  version: string
  champs: DDChampFull[]
  items: DDItemFull[]
}

let _cache: DDragonData | null = null

// Réinitialise le cache module (usage tests uniquement).
export function clearDDragonCache(): void {
  _cache = null
}

export async function loadDDragon(): Promise<DDragonData> {
  if (_cache) return _cache

  const versions: string[] = await (await fetch(`${DDN}/api/versions.json`)).json()
  const v = versions[0]

  const [cData, iData] = await Promise.all([
    fetch(`${DDN}/cdn/${v}/data/fr_FR/champion.json`).then(r => r.json()),
    fetch(`${DDN}/cdn/${v}/data/fr_FR/item.json`).then(r => r.json()),
  ])

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const champs: DDChampFull[] = Object.values(cData.data as Record<string, any>)
    .map((ch: any) => ({ id: ch.id, name: ch.name, image: ch.image.full, stats: ch.stats ?? {} }))
    .sort((a, b) => a.name.localeCompare(b.name))

  const items: DDItemFull[] = Object.entries(iData.data as Record<string, any>)
    .filter(([, it]: [string, any]) => it.maps?.['11'] && it.gold?.purchasable)  // Faille de l'invocateur + achetables
    .map(([id, it]: [string, any]) => ({
      id,
      name:  it.name,
      image: it.image.full,
      gold:  it.gold?.total ?? 0,
      tags:  it.tags ?? [],
      stats: it.stats ?? {},
    }))
  /* eslint-enable @typescript-eslint/no-explicit-any */

  _cache = { version: v, champs, items }
  return _cache
}

export const champImgUrl = (version: string, image: string) => `${DDN}/cdn/${version}/img/champion/${image}`
export const itemImgUrl  = (version: string, image: string) => `${DDN}/cdn/${version}/img/item/${image}`
