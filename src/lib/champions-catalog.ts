// ════════════════════════════════════════════════════════════════════════════
//  champions-catalog — le catalogue DDragon, et les règles de /champions
// ════════════════════════════════════════════════════════════════════════════
// Extrait de `src/app/champions/page.tsx` quand la page est passée en rendu
// SERVEUR (chantier AdSense du 2026-09-12). La page chargeait sa liste dans un
// `useEffect` : un visiteur sans JavaScript — et le robot d'examen AdSense, qui
// récupère le HTML brut — ne voyait qu'un « Chargement… » et une barre de
// filtres vide. Motif de refus constaté : « contenu à faible valeur
// informative ».
//
// Le partage est net :
//   • `fetchChampionCatalog()` est appelée par le Server Component, une fois,
//     avec le cache de `fetch` de Next (ISR) ;
//   • `filterChampions()` est appelée par le composant CLIENT à chaque frappe.
//     Elle vit ici, et pas dans le composant, parce que c'est la seule partie
//     de la page qui mérite un test : le tri accent-insensible et les bornes de
//     difficulté sont exactement ce qui casse en silence.
//
// Module sans import React ni Next : testable tel quel.

const DDN = 'https://ddragon.leagueoflegends.com'

/** Version servie quand DDragon est injoignable — même repli que /patch-notes. */
export const DDRAGON_FALLBACK_VERSION = '15.10.1'

export interface ChampionSummary {
  id: string
  name: string
  title: string
  /** Nom de fichier de l'icône (`Aatrox.png`), à composer avec la version. */
  image: string
  tags: string[]
  /** Note de difficulté Riot, de 1 à 10. */
  difficulty: number
}

export const ALL_TAGS = ['Fighter', 'Tank', 'Mage', 'Assassin', 'Marksman', 'Support'] as const
export type ChampionTag = typeof ALL_TAGS[number]

export type DifficultyRange = 'all' | 'easy' | 'medium' | 'hard'
export type SortBy = 'alpha' | 'diff-asc' | 'diff-desc'

/** Bornes affichées dans les filtres — une seule source pour l'UI et le calcul. */
export const DIFFICULTY_BOUNDS: Record<Exclude<DifficultyRange, 'all'>, [number, number]> = {
  easy:   [1, 3],
  medium: [4, 7],
  hard:   [8, 10],
}

/**
 * Comparaison de noms insensible aux accents ET à la casse.
 *
 * `̀-ͯ` est le bloc des diacritiques combinants : après `NFD`, « Séraphine »
 * s'écrit `S + e + ◌́ + …`, et les retirer rend « seraphine » — ce qui fait
 * qu'une recherche « sera » trouve bien le champion.
 */
export function normalizeName(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/**
 * `champion.json` de DDragon → liste exploitable.
 *
 * Tolérant à dessein : une entrée mal formée est IGNORÉE plutôt que de faire
 * échouer le rendu de toute la page. DDragon est une dépendance externe, et la
 * page doit rester lisible même si Riot publie un champion au format inattendu.
 */
export function parseChampionCatalog(raw: unknown): ChampionSummary[] {
  const data = (raw as { data?: Record<string, unknown> } | null)?.data
  if (!data || typeof data !== 'object') return []

  const out: ChampionSummary[] = []
  for (const entry of Object.values(data)) {
    const c = entry as {
      id?: unknown; name?: unknown; title?: unknown
      image?: { full?: unknown }; tags?: unknown; info?: { difficulty?: unknown }
    }
    if (typeof c?.id !== 'string' || typeof c.name !== 'string') continue
    out.push({
      id: c.id,
      name: c.name,
      title: typeof c.title === 'string' ? c.title : '',
      image: typeof c.image?.full === 'string' ? c.image.full : `${c.id}.png`,
      tags: Array.isArray(c.tags) ? c.tags.filter((t): t is string => typeof t === 'string') : [],
      difficulty: typeof c.info?.difficulty === 'number' ? c.info.difficulty : 0,
    })
  }
  // Ordre alphabétique par défaut : c'est celui du rendu SERVEUR, donc celui que
  // voient un visiteur sans JS et un robot d'indexation.
  return out.sort((a, b) => a.name.localeCompare(b.name, 'fr'))
}

export interface ChampionFilters {
  query: string
  tags: ReadonlySet<string>
  difficulty: DifficultyRange
  sortBy: SortBy
}

/** Filtres neutres — ce que rend le serveur, et l'état initial du client. */
export const NO_FILTERS: ChampionFilters = {
  query: '', tags: new Set(), difficulty: 'all', sortBy: 'alpha',
}

/**
 * Applique recherche, classes, difficulté et tri.
 *
 * Ne MUTE jamais `list` : le tableau reçu est celui rendu par le serveur, et il
 * est réutilisé à chaque frappe.
 */
export function filterChampions(
  list: readonly ChampionSummary[],
  { query, tags, difficulty, sortBy }: ChampionFilters,
): ChampionSummary[] {
  let arr = list as ChampionSummary[]

  const q = normalizeName(query.trim())
  if (q) arr = arr.filter(c => normalizeName(c.name).includes(q))

  // Au moins UNE classe en commun — les classes se cumulent en OU, comme sur la
  // page d'origine : cocher « Tank » et « Mage » montre les deux, pas leur
  // intersection (qui serait presque toujours vide).
  if (tags.size > 0) arr = arr.filter(c => c.tags.some(t => tags.has(t)))

  if (difficulty !== 'all') {
    const [min, max] = DIFFICULTY_BOUNDS[difficulty]
    arr = arr.filter(c => c.difficulty >= min && c.difficulty <= max)
  }

  const byName = (a: ChampionSummary, b: ChampionSummary) => a.name.localeCompare(b.name, 'fr')
  const sorted = [...arr]
  if (sortBy === 'alpha') sorted.sort(byName)
  else if (sortBy === 'diff-asc') sorted.sort((a, b) => a.difficulty - b.difficulty || byName(a, b))
  else sorted.sort((a, b) => b.difficulty - a.difficulty || byName(a, b))

  return sorted
}

export interface ChampionCatalog {
  version: string
  champions: ChampionSummary[]
}

/**
 * Catalogue complet, lu côté SERVEUR.
 *
 * `revalidate: 3600` sur les deux appels : DDragon ne publie qu'à chaque patch
 * (une fois toutes les deux semaines), et la page est régénérée à la même
 * cadence (`export const revalidate` de `app/champions/page.tsx`). Une heure de
 * décalage sur une liste de champions n'a aucune conséquence, et c'est ce qui
 * permet à la page de rester PRÉRENDUE plutôt que de repartir chercher DDragon
 * à chaque visite.
 *
 * En cas d'échec, on renvoie un catalogue VIDE et la version de repli plutôt que
 * de lever : la page rend alors son contenu éditorial et un message, ce qui vaut
 * mieux qu'une erreur 500 sur une page publique.
 */
export async function fetchChampionCatalog(): Promise<ChampionCatalog> {
  try {
    const vRes = await fetch(`${DDN}/api/versions.json`, { next: { revalidate: 3600 } })
    if (!vRes.ok) return { version: DDRAGON_FALLBACK_VERSION, champions: [] }
    const versions = await vRes.json() as string[]
    const version = versions[0] ?? DDRAGON_FALLBACK_VERSION

    const cRes = await fetch(`${DDN}/cdn/${version}/data/fr_FR/champion.json`, {
      next: { revalidate: 3600 },
    })
    if (!cRes.ok) return { version, champions: [] }

    return { version, champions: parseChampionCatalog(await cRes.json()) }
  } catch {
    return { version: DDRAGON_FALLBACK_VERSION, champions: [] }
  }
}

/** URL de l'icône carrée d'un champion. */
export const championIconUrl = (version: string, image: string) =>
  `${DDN}/cdn/${version}/img/champion/${image}`
