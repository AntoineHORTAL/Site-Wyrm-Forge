// F3 — Lot 1 : rate limit par IP visiteur pour la recherche publique.
//
// 10 recherches / IP / heure, fenêtre GLISSANTE, stockée dans `riot_cache`
// (clé `rate:ip:{ip}`, `response_body` = liste d'horodatages epoch ms de la
// dernière heure). Vrai glissant : à chaque appel on ne garde que les
// horodatages < 1h, on refuse si ≥ 10, sinon on ajoute « maintenant ».
//
// La logique (extraction IP + fenêtre glissante) est PURE et prend un
// `RateBackend` injectable → testable hors Deno (Node/curl). Le backend
// `riot_cache` réel est fourni par `riotCacheBackend()` (import dynamique de
// cache.ts, exécuté seulement côté Deno/Edge Function).
//
// ⚠️ Compromis assumé : read-modify-write via riot_cache n'est PAS atomique
// (choix « KV détourné » plutôt que la fonction SQL atomique). Deux requêtes
// simultanées de la MÊME IP peuvent sur-compter d'une unité. Acceptable pour de
// l'anti-scraping (pas une frontière de sécurité).

export const IP_RATE_LIMIT = 10                 // recherches autorisées
export const IP_WINDOW_MS  = 60 * 60 * 1000     // par IP et par heure (glissante)

export interface RateBackend {
  get(key: string): Promise<number[] | null>
  set(key: string, timestamps: number[], ttlMs: number): Promise<void>
}

export interface RateResult {
  allowed: boolean
  ip: string
  remaining: number      // recherches restantes dans la fenêtre (0 si refusé)
  retryAfterS: number    // secondes avant qu'un créneau se libère (0 si autorisé)
}

/**
 * IP réelle du visiteur derrière Vercel : `x-forwarded-for` (entrée la plus à
 * gauche = client d'origine), repli `x-real-ip`. `'unknown'` si aucun.
 */
export function extractIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for')
  if (xff) {
    const first = xff.split(',')[0].trim()
    if (first) return first
  }
  const xr = req.headers.get('x-real-ip')
  if (xr && xr.trim()) return xr.trim()
  return 'unknown'
}

/**
 * Vérifie ET incrémente le compteur glissant pour l'IP de la requête.
 * Ne bloque jamais sur erreur backend en amont (l'appelant décide) : ici on
 * suppose un backend fiable ; les erreurs riot_cache sont absorbées dans
 * `riotCacheBackend` (fail-open) pour ne pas casser la recherche publique.
 */
export async function checkIpRateLimit(
  req: Request,
  backend: RateBackend,
  opts?: { limit?: number; windowMs?: number; now?: number },
): Promise<RateResult> {
  const limit    = opts?.limit ?? IP_RATE_LIMIT
  const windowMs = opts?.windowMs ?? IP_WINDOW_MS
  const now      = opts?.now ?? Date.now()
  const ip       = extractIp(req)
  const key      = `rate:ip:${ip}`

  const stored = (await backend.get(key)) ?? []
  const recent = stored.filter(ts => ts > now - windowMs)

  if (recent.length >= limit) {
    const oldest      = Math.min(...recent)
    const retryAfterS = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000))
    return { allowed: false, ip, remaining: 0, retryAfterS }
  }

  recent.push(now)
  await backend.set(key, recent, windowMs)
  return { allowed: true, ip, remaining: limit - recent.length, retryAfterS: 0 }
}

// ── Backend riot_cache réel (Deno / Edge Function uniquement) ────────────────
// Import dynamique de cache.ts : garde ce module chargeable hors Deno (tests
// Node n'appellent jamais ce chemin, ils injectent un backend mémoire).
let _cacheMod: typeof import('./cache.ts') | null = null
async function cacheMod() {
  if (!_cacheMod) _cacheMod = await import('./cache.ts')
  return _cacheMod
}

export function riotCacheBackend(fn = 'public-search'): RateBackend {
  return {
    async get(key) {
      try {
        const { cacheGet } = await cacheMod()
        const body = await cacheGet(key)
        return Array.isArray(body) ? (body as number[]) : null
      } catch {
        return null // fail-open : pas de compteur → on laisse passer
      }
    },
    async set(key, timestamps, ttlMs) {
      try {
        const { cacheSet } = await cacheMod()
        await cacheSet(key, fn, timestamps, new Date(Date.now() + ttlMs).toISOString())
      } catch {
        // fail-open : on ne casse pas la recherche si l'écriture échoue
      }
    },
  }
}
