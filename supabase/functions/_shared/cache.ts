// Cache helper for Riot API responses.
// Uses service_role to read/write riot_cache — never exposed to the client.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const TTL_MS: Record<string, number> = {
  'riot-rotation':     6 * 60 * 60 * 1000, // 6 hours — weekly rotation
  'riot-rank':             5 * 60 * 1000,  // 5 min   — rank changes per game
  'riot-matches':          3 * 60 * 1000,  // 3 min   — list changes after each game
  'riot-match-detail':            -1,      // permanent — completed matches are immutable
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

/** Upserts a response in the cache with the appropriate TTL for functionName. */
export async function cacheSet(key: string, fn: string, body: unknown): Promise<void> {
  await db()
    .from('riot_cache')
    .upsert(
      { cache_key: key, function_name: fn, response_body: body, expires_at: expiresAt(fn), hit_count: 0, last_hit_at: null },
      { onConflict: 'cache_key' },
    )
}
