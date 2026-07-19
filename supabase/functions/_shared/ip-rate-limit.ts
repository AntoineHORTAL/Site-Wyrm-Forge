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

// ── Limiteur DÉTAIL (F3 Lot 2) — « 1 unité par MATCH DISTINCT » ──────────────
// Différent du limiteur recherche (call-count) : ici on borne le nombre de
// MATCHS DISTINCTS dont un visiteur anonyme consulte le détail par heure. On
// stocke donc un dictionnaire { matchId → epoch ms } (clé `rate:detail:ip:{ip}`,
// SÉPARÉE de `rate:ip:{ip}` de la recherche), on élague > 1h, et :
//   • re-consulter un match DÉJÀ dans la fenêtre = gratuit (aucun débit).
//   • un match nouveau = +1 s'il reste du budget, sinon refus.
// Décision produit actée : le cache riot-match-detail est permanent, donc une
// re-vue ne coûte rien côté Riot → ne pas la recompter côté quota.

export const DETAIL_RATE_LIMIT = 10                 // matchs distincts autorisés
export const DETAIL_WINDOW_MS  = 60 * 60 * 1000     // par IP et par heure (glissante)

export interface DetailBackend {
  get(key: string): Promise<Record<string, number> | null>
  set(key: string, views: Record<string, number>, ttlMs: number): Promise<void>
}

export interface DetailPeek {
  ip: string; limit: number; used: number; remaining: number; viewedIds: string[]
}
export interface DetailCommit {
  allowed: boolean; ip: string; remaining: number; alreadyViewed: boolean; retryAfterS: number
}

const detailKey = (ip: string) => `rate:detail:ip:${ip}`

/** Élague les entrées expirées ; garde uniquement les matchs vus dans la fenêtre. */
function pruneViews(stored: Record<string, number> | null, now: number, windowMs: number): Record<string, number> {
  const out: Record<string, number> = {}
  if (stored) {
    for (const [id, ts] of Object.entries(stored)) {
      if (typeof ts === 'number' && ts > now - windowMs) out[id] = ts
    }
  }
  return out
}

/** Lecture SEULE du quota détail (aucune mutation) — alimente l'affichage « X/10 ». */
export async function peekDetailRateLimit(
  req: Request,
  backend: DetailBackend,
  opts?: { limit?: number; windowMs?: number; now?: number },
): Promise<DetailPeek> {
  const limit    = opts?.limit ?? DETAIL_RATE_LIMIT
  const windowMs = opts?.windowMs ?? DETAIL_WINDOW_MS
  const now      = opts?.now ?? Date.now()
  const ip       = extractIp(req)

  const recent    = pruneViews(await backend.get(detailKey(ip)), now, windowMs)
  const viewedIds = Object.keys(recent)
  const used      = viewedIds.length
  return { ip, limit, used, remaining: Math.max(0, limit - used), viewedIds }
}

/**
 * Enregistre la consultation du détail de `matchId` pour l'IP. Idempotent par
 * match dans la fenêtre : re-consulter le même match ne débite rien. Refuse si
 * le budget de matchs distincts est atteint ET que le match est nouveau.
 */
export async function commitDetailRateLimit(
  req: Request,
  backend: DetailBackend,
  matchId: string,
  opts?: { limit?: number; windowMs?: number; now?: number },
): Promise<DetailCommit> {
  const limit    = opts?.limit ?? DETAIL_RATE_LIMIT
  const windowMs = opts?.windowMs ?? DETAIL_WINDOW_MS
  const now      = opts?.now ?? Date.now()
  const ip       = extractIp(req)
  const key      = detailKey(ip)

  const recent = pruneViews(await backend.get(key), now, windowMs)
  const used   = Object.keys(recent).length

  // Re-vue d'un match déjà compté → gratuit, aucun débit.
  if (recent[matchId] !== undefined) {
    return { allowed: true, ip, remaining: Math.max(0, limit - used), alreadyViewed: true, retryAfterS: 0 }
  }

  // Budget atteint pour un match NOUVEAU → refus.
  if (used >= limit) {
    const oldest      = Math.min(...Object.values(recent))
    const retryAfterS = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000))
    return { allowed: false, ip, remaining: 0, alreadyViewed: false, retryAfterS }
  }

  recent[matchId] = now
  await backend.set(key, recent, windowMs)
  return { allowed: true, ip, remaining: Math.max(0, limit - Object.keys(recent).length), alreadyViewed: false, retryAfterS: 0 }
}

/** Backend riot_cache pour le limiteur détail (dictionnaire matchId→ts). */
export function riotCacheDetailBackend(fn = 'detail-quota'): DetailBackend {
  return {
    async get(key) {
      try {
        const { cacheGet } = await cacheMod()
        const body = await cacheGet(key)
        return (body && typeof body === 'object' && !Array.isArray(body))
          ? (body as Record<string, number>)
          : null
      } catch {
        return null // fail-open : pas de compteur → on laisse passer
      }
    },
    async set(key, views, ttlMs) {
      try {
        const { cacheSet } = await cacheMod()
        await cacheSet(key, fn, views, new Date(Date.now() + ttlMs).toISOString())
      } catch {
        // fail-open : on ne casse pas la consultation si l'écriture échoue
      }
    },
  }
}
