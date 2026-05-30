// Global daily circuit breaker for Riot API calls.
// Counts only cache-miss calls (actual Riot requests) via fn_riot_quota_increment.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Riot API calls emitted per Edge Function request in the cache-miss scenario.
// riot-matches uses a dynamic count passed at call time.
const RIOT_CALLS: Record<string, number> = {
  'riot-rank':         3,  // account-v1 + summoner-v4 + league-v4
  'riot-match-detail': 2,  // match + timeline (parallel)
  'riot-rotation':     1,
}

function db() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
}

function secondsUntilMidnightUtc(): number {
  const now      = new Date()
  const midnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1))
  return Math.floor((midnight.getTime() - now.getTime()) / 1000)
}

/** Returns true if the daily quota is exhausted and no Riot calls should be made. Fails open on error. */
export async function isCircuitOpen(): Promise<boolean> {
  try {
    const { data, error } = await db().rpc('fn_riot_quota_check')
    if (error || !data?.length) return false
    return data[0]?.circuit_open === true
  } catch {
    return false
  }
}

/**
 * Increments the daily quota counter after a successful cache miss.
 * Pass actualCalls for riot-matches where the count depends on the request params.
 */
export async function incrementQuota(fn: string, actualCalls?: number): Promise<void> {
  const calls = actualCalls ?? RIOT_CALLS[fn] ?? 1
  try {
    await db().rpc('fn_riot_quota_increment', {
      p_calls:         calls,
      p_function_name: fn,
    })
  } catch { /* fire-and-forget: quota tracking must not break the response */ }
}

export { secondsUntilMidnightUtc }
