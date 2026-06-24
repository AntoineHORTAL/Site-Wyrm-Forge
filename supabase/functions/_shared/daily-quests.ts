// Module partagé : sélection déterministe du set de quêtes journalier.
//
// Utilisé par quest-claim ET quest-status pour que les deux EF exposent
// exactement le même set au même instant — sans aucun état partagé.
//
// Garantie de déterminisme : mêmes entrées (dayStr + pool) → même sortie,
// toujours. Cela évite qu'un utilisateur puisse réclamer une quête qui n'est
// pas dans le set affiché par quest-status (ou vice-versa).

export interface QuestDef {
  slug: string
  category: 'lol' | 'app'
  cost_tier: 'free' | 'riot_detail'
  // Les autres champs (name, reward, criteria, etc.) sont transmis tels quels
  [key: string]: unknown
}

// ── Hash FNV-1a 32 bits ──────────────────────────────────────────────────────
// Algorithme choisi : FNV-1a (Fowler–Noll–Vo) 32 bits.
// Pas de dépendance externe, implémentation inline, résultat positif garanti
// via masque 32 bits non signé. Même résultat sur tous les runtimes JS/Deno.
//
// Référence : http://www.isthe.com/chongo/tech/comp/fnv/
function fnv1a32(s: string): number {
  let hash = 0x811c9dc5 // offset basis FNV-1a 32 bits

  for (let i = 0; i < s.length; i++) {
    // XOR avec l'octet courant, puis multiplication par la prime FNV-1a 32 bits
    hash ^= s.charCodeAt(i)
    // Multiplication 32 bits avec troncature (>>> 0 force le non-signé)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }

  return hash // toujours positif (>>> 0 produit un uint32)
}

// ── Sélection circulaire dans un sous-pool ───────────────────────────────────
// Parcourt le tableau circulairement à partir d'un index de départ
// et retourne jusqu'à `count` éléments en appliquant le prédicat `accept`.
// Si `fallback` est true, prend les éléments même s'ils n'acceptent pas le
// prédicat (évite de retourner moins que demandé quand le pool est petit).
function pickCircular<T>(
  pool: T[],
  startIdx: number,
  count: number,
  accept: (item: T) => boolean,
  fallback = true,
): T[] {
  if (pool.length === 0) return []

  const result: T[] = []
  const rejected: T[] = [] // candidats refusés, utilisés en fallback

  for (let i = 0; i < pool.length && result.length < count; i++) {
    const item = pool[(startIdx + i) % pool.length]
    if (accept(item)) {
      result.push(item)
    } else {
      rejected.push(item)
    }
  }

  // Si on n'a pas atteint `count` items, compléter avec les refusés
  if (fallback && result.length < count) {
    for (const item of rejected) {
      if (result.length >= count) break
      result.push(item)
    }
  }

  return result
}

// ── API publique ─────────────────────────────────────────────────────────────

/**
 * Calcule le set de quêtes du jour de façon déterministe.
 *
 * Algorithme :
 *   1. Trier le pool par slug (lexicographique) — CRITIQUE pour déterminisme
 *      cross-Edge-Function. Deux EF avec le même pool non trié pourraient
 *      recevoir des ordres différents selon les requêtes DB.
 *   2. Hasher dayStr avec FNV-1a 32 bits pour obtenir un seed positif stable.
 *   3. Séparer en lolPool / appPool.
 *   4. Tirer 2 quêtes lol avec contrainte ≤1 riot_detail.
 *   5. Tirer 1 quête app avec un index décalé (×31) pour éviter la corrélation.
 *   6. Retourner [lol1, lol2, app1] dans un ordre stable.
 *
 * @param dayStr  Date au format 'YYYY-MM-DD' (UTC, horloge serveur).
 * @param pool    Toutes les quêtes actives + pool_eligible.
 * @param K       Taille du set (défaut 3 : 2 lol + 1 app).
 */
export function selectDailySet(dayStr: string, pool: QuestDef[], K = 3): QuestDef[] {
  // Étape 1 : tri stable par slug — garantit un ordre identique quelle que
  // soit la façon dont Supabase renvoie les lignes.
  const sorted = [...pool].sort((a, b) => a.slug.localeCompare(b.slug))

  // Étape 2 : seed déterministe
  const seed = fnv1a32(dayStr)

  // Étape 3 : séparation en sous-pools
  const lolPool = sorted.filter(q => q.category === 'lol')
  const appPool = sorted.filter(q => q.category === 'app')

  const result: QuestDef[] = []

  // Étape 4 : 2 quêtes lol avec contrainte ≤1 riot_detail
  if (lolPool.length > 0) {
    const startLol  = seed % lolPool.length
    const isDetail  = (q: QuestDef) => q.cost_tier === 'riot_detail'

    // Premier tirage : pas de contrainte
    const [first] = pickCircular(lolPool, startLol, 1, () => true)

    if (first) {
      result.push(first)

      if (lolPool.length >= 2) {
        // Décaler d'une position pour ne pas retirer la même quête
        const startSecond = (startLol + 1) % lolPool.length

        if (isDetail(first)) {
          // La première est riot_detail → la deuxième DOIT être free.
          // fallback=false : on préfère retourner 1 quête lol plutôt que d'en
          // retourner 2 riot_detail si le pool ne contient que des riot_detail restants.
          // (Avec le pool actuel 6 free / 8 lol ce cas ne se produit pas,
          // mais on le garantit structurellement pour les évolutions futures.)
          const acceptFreeOnly = (q: QuestDef) => q.slug !== first.slug && !isDetail(q)
          const [second] = pickCircular(lolPool, startSecond, 1, acceptFreeOnly, false)
          if (second) result.push(second)
        } else {
          // La première est free → la deuxième peut être n'importe quelle quête lol
          const acceptAny = (q: QuestDef) => q.slug !== first.slug
          const [second] = pickCircular(lolPool, startSecond, 1, acceptAny, true)
          if (second) result.push(second)
        }
      }
    }
  }

  // Étape 5 : 1 quête app avec index décalé (×31) pour rotation distincte
  if (appPool.length > 0) {
    // ×31 est un multiplicateur classique pour disperser le hash sur un
    // second sous-pool indépendamment du premier tirage lol
    const startApp = (seed * 31) % appPool.length
    const [app1]   = pickCircular(appPool, startApp, 1, () => true)
    if (app1) result.push(app1)
  }

  // Cas dégénérés silencieux : si K < result.length, tronquer.
  // Si result.length < K, on retourne ce qu'on a sans crash.
  return result.slice(0, K)
}
