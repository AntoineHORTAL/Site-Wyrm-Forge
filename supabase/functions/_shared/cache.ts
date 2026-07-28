// Cache helper for Riot API responses.
// Uses service_role to read/write riot_cache — never exposed to the client.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const TTL_MS: Record<string, number> = {
  'riot-rotation':          6 * 60 * 60 * 1000, // fallback — remplacé à l'écriture par nextRotationExpiryIso() (mardi 12:00 UTC)
  'riot-rank':                  5 * 60 * 1000,  // 5 min   — rank changes per game
  'riot-matches':               3 * 60 * 1000,  // 3 min   — list changes after each game
  'riot-match-detail':                    -1,   // permanent — completed matches are immutable
  'patch-notes-generator': 24 * 60 * 60 * 1000, // 24h — DDragon versions list changes rarely
  'patch-notes':            1 * 60 * 60 * 1000, // 1h  — published patch notes list
  // Fallback court seulement — riot-live-game passe TOUJOURS un `expiresAtIso`
  // explicite (4ᵉ paramètre de cacheSet) car le TTL réel varie selon l'état de
  // la partie : 30s (pas en partie / écran de chargement) ou 5 min (en partie).
  // Cette entrée ne sert que si un futur appel oubliait ce paramètre.
  'riot-live-game':            30 * 1000,
}

function db() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
}

function expiresAt(fn: string): string {
  const ttl = TTL_MS[fn] ?? 5 * 60 * 1000
  if (ttl === -1) return '2099-01-01T00:00:00.000Z'
  return new Date(Date.now() + ttl).toISOString()
}

// ── Cache négatif (R1) ───────────────────────────────────────────────────────
// Un 404 Riot consomme un vrai appel : sans mise en cache, le même identifiant
// inexistant est rejouable à l'infini, chaque rejeu coûtant un appel réel.
//
// Stocké sous un préfixe `neg:` DÉDIÉ, jamais sous la clé positive : cacheGet et
// surtout cacheGetStale (fallback circuit ouvert) servent leur payload tel quel
// au client. Une entrée négative logée sous la clé positive serait donc renvoyée
// comme une réponse 200 valide. Le préfixe rend cette confusion impossible.
//
// Seuls les 404 sont mis en cache : ils sont déterministes (l'entité n'existe
// pas). Les 403 (clé expirée), 429 (rate limit Riot) et 5xx sont TRANSITOIRES —
// les cacher prolongerait une panne au lieu de l'absorber.
const NEGATIVE_TTL_MS = 5 * 60 * 1000  // court : un compte/match peut apparaître

const negKey = (key: string) => `neg:${key}`

export type NegativeHit = { status: number; body: unknown }

/** Mémorise brièvement un 404 upstream pour rendre son rejeu gratuit. */
export async function cacheSetNegative(
  key: string, fn: string, status: number, body: unknown,
): Promise<void> {
  await db()
    .from('riot_cache')
    .upsert(
      {
        cache_key:     negKey(key),
        function_name: fn,
        response_body: { status, body },
        expires_at:    new Date(Date.now() + NEGATIVE_TTL_MS).toISOString(),
        hit_count:     0,
        last_hit_at:   null,
      },
      { onConflict: 'cache_key' },
    )
}

/** Retourne le 404 mémorisé pour cette clé, ou null. */
export async function cacheGetNegative(key: string): Promise<NegativeHit | null> {
  const { data } = await db()
    .from('riot_cache')
    .select('response_body')
    .eq('cache_key', negKey(key))
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()
  const hit = data?.response_body as NegativeHit | undefined
  return hit?.status ? hit : null
}

/** Returns cached payload if present and fresh; null on miss. */
export async function cacheGet(key: string): Promise<unknown | null> {
  const { data } = await db()
    .from('riot_cache')
    .select('response_body, hit_count')
    .eq('cache_key', key)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()
  if (!data) return null
  // Fire-and-forget hit counter — never blocks the response
  db()
    .from('riot_cache')
    .update({ hit_count: (data.hit_count ?? 0) + 1, last_hit_at: new Date().toISOString() })
    .eq('cache_key', key)
    .then(() => {})
  return data.response_body
}

/** Returns a stale cached payload (ignores expiry) for circuit-open fallback. */
export async function cacheGetStale(key: string): Promise<unknown | null> {
  const { data } = await db()
    .from('riot_cache')
    .select('response_body')
    .eq('cache_key', key)
    .maybeSingle()
  return data?.response_body ?? null
}

/**
 * Upserts a response in the cache.
 * TTL par défaut = celui de `functionName` ; `expiresAtIso` permet de forcer une
 * date d'expiration calculée (ex : rotation hebdomadaire calée sur le mardi).
 */
export async function cacheSet(key: string, fn: string, body: unknown, expiresAtIso?: string): Promise<void> {
  await db()
    .from('riot_cache')
    .upsert(
      { cache_key: key, function_name: fn, response_body: body, expires_at: expiresAtIso ?? expiresAt(fn), hit_count: 0, last_hit_at: null },
      { onConflict: 'cache_key' },
    )
}
