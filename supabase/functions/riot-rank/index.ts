// Edge Function : rang Solo/Duo + Flex d'un joueur via league-v4.
// Accès public — la clé Riot reste côté serveur.
//
// Appel : GET /functions/v1/riot-rank?gameName=X&tagLine=Y&platform=euw1
// Headers : apikey: <SUPABASE_ANON_KEY>
//
// Réponse : { puuid, summonerId, entries: [{ queueType, tier, rank, lp, wins, losses, ... }] }
import { handleCors, jsonResponse } from '../_shared/cors.ts'
import { requireSecret } from '../_shared/auth.ts'
import { cacheGet, cacheSet, cacheGetStale } from '../_shared/cache.ts'
import { isRateLimited } from '../_shared/rate-limit.ts'
import { isCircuitOpen, incrementQuota, secondsUntilMidnightUtc } from '../_shared/circuit-breaker.ts'

const FN = 'riot-rank'

const ROUTING: Record<string, string> = {
  euw1: 'europe', eun1: 'europe', tr1: 'europe', ru: 'europe',
  na1: 'americas', br1: 'americas', la1: 'americas', la2: 'americas', oc1: 'americas',
  kr: 'asia', jp1: 'asia',
}

function sanitize(s: string): string {
  return s.replace(/[​-‏‪-‮⁠-⁯﻿]/g, '').trim()
}

Deno.serve(async (req) => {
  const cors = handleCors(req)
  if (cors) return cors

  try {
    const url        = new URL(req.url)
    const gameNameRaw = url.searchParams.get('gameName')
    const tagLineRaw  = url.searchParams.get('tagLine')
    const platform    = url.searchParams.get('platform') ?? 'euw1'

    if (!gameNameRaw || !tagLineRaw) {
      return jsonResponse({ error: 'gameName et tagLine requis.' }, 400)
    }

    // Validate platform against known list to prevent SSRF via hostname injection
    if (!Object.hasOwn(ROUTING, platform)) {
      return jsonResponse({ error: 'Région invalide.' }, 400)
    }

    const gameName = sanitize(gameNameRaw)
    const tagLine  = sanitize(tagLineRaw)

    // Rate limiting
    if (await isRateLimited(req, FN)) {
      return jsonResponse({ error: 'Trop de requêtes. Réessaie dans une minute.' }, 429)
    }

    const cacheKey = `rank:${platform}:${gameName.toLowerCase()}:${tagLine.toLowerCase()}`

    // Cache read (fresh)
    const cached = await cacheGet(cacheKey)
    if (cached !== null) {
      return jsonResponse(cached, 200, { 'X-Cache': 'HIT' })
    }

    // Circuit breaker
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

    const apiKey  = requireSecret('RIOT_API_KEY')
    const routing = ROUTING[platform]
    const headers = { 'X-Riot-Token': apiKey }

    // 1. PUUID via account-v1
    const acctRes = await fetch(
      `https://${routing}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`,
      { headers },
    )
    if (!acctRes.ok) {
      if (acctRes.status === 404) return jsonResponse({ error: 'Invocateur introuvable.' }, 404)
      return jsonResponse({ error: `Riot API ${acctRes.status}` }, acctRes.status)
    }
    const { puuid } = await acctRes.json()

    // 2. SummonerId via summoner-v4
    const sumRes = await fetch(
      `https://${platform}.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${encodeURIComponent(puuid)}`,
      { headers },
    )
    if (!sumRes.ok) {
      return jsonResponse({ error: `Riot API ${sumRes.status}` }, sumRes.status)
    }
    const sum = await sumRes.json()
    const summonerId: string    = sum.id              ?? ''
    const profileIconId: number = sum.profileIconId   ?? 29
    const summonerLevel: number = sum.summonerLevel   ?? 1

    // 3. Entries league-v4
    const leagueRes = await fetch(
      `https://${platform}.api.riotgames.com/lol/league/v4/entries/by-summoner/${encodeURIComponent(summonerId)}`,
      { headers },
    )
    if (!leagueRes.ok) {
      return jsonResponse({ error: `Riot API ${leagueRes.status}` }, leagueRes.status)
    }
    // deno-lint-ignore no-explicit-any
    const rawEntries: any[] = await leagueRes.json()

    // deno-lint-ignore no-explicit-any
    const entries = rawEntries.map((e: any) => ({
      queueType: e.queueType,
      tier:      e.tier,
      rank:      e.rank,
      lp:        e.leaguePoints ?? 0,
      wins:      e.wins ?? 0,
      losses:    e.losses ?? 0,
      veteran:   e.veteran ?? false,
      hotStreak: e.hotStreak ?? false,
      freshBlood: e.freshBlood ?? false,
      inactive:  e.inactive ?? false,
    }))

    const result = { puuid, summonerId, profileIconId, summonerLevel, entries }
    await cacheSet(cacheKey, FN, result)
    await incrementQuota(FN)

    return jsonResponse(result, 200, { 'X-Cache': 'MISS' })
  } catch (e) {
    console.error('riot-rank: unhandled exception', e instanceof Error ? e.message : String(e))
    return jsonResponse({ error: 'Erreur serveur inattendue.' }, 500)
  }
})
