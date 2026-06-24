// Edge Function : rotation gratuite des champions LoL.
// Accès public — données publiques Riot, clé protégée côté serveur.
//
// Appel : GET /functions/v1/riot-rotation?platform=euw1
// Headers : apikey: <SUPABASE_ANON_KEY>
//
// Réponse : { freeChampionIds: number[], freeChampionIdsForNewPlayers: number[], maxNewPlayerLevel: number }
import { handleCors, jsonResponse } from '../_shared/cors.ts'
import { requireSecret } from '../_shared/auth.ts'
import { cacheGet, cacheSet, cacheGetStale } from '../_shared/cache.ts'
import { isRateLimited } from '../_shared/rate-limit.ts'
import { isCircuitOpen, incrementQuota, secondsUntilMidnightUtc } from '../_shared/circuit-breaker.ts'

const FN = 'riot-rotation'

const ROUTING: Record<string, string> = {
  euw1: 'europe', eun1: 'europe', tr1: 'europe', ru: 'europe',
  na1: 'americas', br1: 'americas', la1: 'americas', la2: 'americas', oc1: 'americas',
  kr: 'asia', jp1: 'asia',
}

Deno.serve(async (req) => {
  const cors = handleCors(req)
  if (cors) return cors

  try {
    const url      = new URL(req.url)
    const platform = url.searchParams.get('platform') ?? 'euw1'

    // Validate platform against known list to prevent SSRF via hostname injection
    if (!Object.hasOwn(ROUTING, platform)) {
      return jsonResponse({ error: 'Région invalide.' }, 400)
    }

    // Rate limiting — blocks bots before any DB/Riot work
    if (await isRateLimited(req, FN)) {
      return jsonResponse({ error: 'Trop de requêtes. Réessaie dans une minute.' }, 429)
    }

    const cacheKey = `rotation:${platform}`

    // Cache read (fresh)
    const cached = await cacheGet(cacheKey)
    if (cached !== null) {
      return jsonResponse(cached, 200, { 'X-Cache': 'HIT' })
    }

    // Circuit breaker — check before any real Riot call
    if (await isCircuitOpen()) {
      const stale = await cacheGetStale(cacheKey)
      if (stale !== null) {
        return jsonResponse(stale, 200, { 'X-Cache': 'STALE' })
      }
      return jsonResponse(
        { error: 'Service temporairement indisponible.', reason: 'quota_exceeded', resets_in: secondsUntilMidnightUtc() },
        503,
      )
    }

    const apiKey = requireSecret('RIOT_API_KEY')

    const res = await fetch(
      `https://${platform}.api.riotgames.com/lol/platform/v3/champion-rotations`,
      { headers: { 'X-Riot-Token': apiKey } },
    )

    if (!res.ok) {
      // Never forward Riot's error body — it may contain internal details (C1 fix)
      return jsonResponse({ error: `Riot API ${res.status}` }, res.status)
    }

    const data = await res.json()
    await cacheSet(cacheKey, FN, data)
    await incrementQuota(FN)

    return jsonResponse(data, 200, { 'X-Cache': 'MISS' })
  } catch (e) {
    console.error('riot-rotation: unhandled exception', e instanceof Error ? e.message : String(e))
    return jsonResponse({ error: 'Erreur serveur inattendue.' }, 500)
  }
})
