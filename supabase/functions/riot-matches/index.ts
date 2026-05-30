// Edge Function : historique des dernières parties d'un joueur LoL.
// Accès public — la clé Riot reste côté serveur.
//
// Appel : GET /functions/v1/riot-matches?gameName=X&tagLine=Y&platform=euw1&count=5
//      ou GET /functions/v1/riot-matches?puuid=X&platform=euw1&count=5
// Headers : apikey: <SUPABASE_ANON_KEY>
//
// Flow : account-v1 (puuid) → match-v5 (IDs) → match-v5 (détails en parallèle) → format slim
import { handleCors, jsonResponse } from '../_shared/cors.ts'
import { requireSecret } from '../_shared/auth.ts'
import { cacheGet, cacheSet, cacheGetStale } from '../_shared/cache.ts'
import { isRateLimited } from '../_shared/rate-limit.ts'
import { isCircuitOpen, incrementQuota, secondsUntilMidnightUtc } from '../_shared/circuit-breaker.ts'

const FN = 'riot-matches'

const ROUTING: Record<string, string> = {
  euw1: 'europe', eun1: 'europe', tr1: 'europe', ru: 'europe',
  na1: 'americas', br1: 'americas', la1: 'americas', la2: 'americas', oc1: 'americas',
  kr: 'asia', jp1: 'asia',
}

// UUID v4 format used by Riot for PUUIDs
const PUUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Strips invisible Unicode characters (zero-width, bidi marks, BOM) that
 * some clients inject around Riot IDs via copy-paste.
 */
function sanitize(s: string): string {
  return s
    .replace(/[​-‏‪-‮⁠-⁯﻿]/g, '')
    .trim()
}

const QUEUES: Record<number, string> = {
  420: 'Classée Solo/Duo', 440: 'Classée Flex',
  400: 'Normale Draft',    430: 'Normale Aveugle',
  450: 'ARAM',             900: 'URF',
  1020: 'Légendes Uniques', 1400: 'Ultime Spellbook',
  1900: 'URF (pick)', 0: 'Personnalisée', 1700: 'Arena',
}

Deno.serve(async (req) => {
  const cors = handleCors(req)
  if (cors) return cors

  try {
    const url        = new URL(req.url)
    const puuidParam  = url.searchParams.get('puuid')
    const gameNameRaw = url.searchParams.get('gameName')
    const tagLineRaw  = url.searchParams.get('tagLine')
    const platform    = url.searchParams.get('platform') ?? 'euw1'
    const count       = Math.min(Math.max(Number(url.searchParams.get('count') ?? '5'), 1), 20)
    const start       = Math.min(Math.max(Number(url.searchParams.get('start') ?? '0'), 0), 200)

    if (!puuidParam && (!gameNameRaw || !tagLineRaw)) {
      return jsonResponse({ error: 'puuid OU (gameName + tagLine) requis.' }, 400)
    }

    // Validate platform against known list to prevent SSRF via hostname injection
    if (!Object.hasOwn(ROUTING, platform)) {
      return jsonResponse({ error: 'Région invalide.' }, 400)
    }

    // Validate puuid format to prevent path injection
    if (puuidParam && !PUUID_RE.test(puuidParam)) {
      return jsonResponse({ error: 'Format PUUID invalide.' }, 400)
    }

    // Rate limiting
    if (await isRateLimited(req, FN)) {
      return jsonResponse({ error: 'Trop de requêtes. Réessaie dans une minute.' }, 429)
    }

    // Build cache key from available params (before any Riot resolution)
    const cacheKey = puuidParam
      ? `matches:${platform}:puuid:${puuidParam}:${start}:${count}`
      : `matches:${platform}:${sanitize(gameNameRaw!).toLowerCase()}:${sanitize(tagLineRaw!).toLowerCase()}:${start}:${count}`

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

    // Track actual Riot calls for quota accounting
    let riotCalls = 0

    // Resolve PUUID from Riot ID if not provided directly
    let puuid: string
    if (puuidParam) {
      puuid = sanitize(puuidParam)
    } else {
      const gameName = sanitize(gameNameRaw!)
      const tagLine  = sanitize(tagLineRaw!)
      const acctRes  = await fetch(
        `https://${routing}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`,
        { headers },
      )
      riotCalls++
      if (!acctRes.ok) {
        if (acctRes.status === 404) return jsonResponse({ error: 'Invocateur introuvable. Vérifie ton Riot ID.' }, 404)
        return jsonResponse({ error: `Riot API ${acctRes.status}` }, acctRes.status)
      }
      const acct = await acctRes.json()
      puuid = acct.puuid
    }

    // Fetch match IDs
    const idsRes = await fetch(
      `https://${routing}.api.riotgames.com/lol/match/v5/matches/by-puuid/${encodeURIComponent(puuid)}/ids?start=${start}&count=${count}`,
      { headers },
    )
    riotCalls++
    if (!idsRes.ok) {
      return jsonResponse({ error: `Riot API ${idsRes.status}` }, idsRes.status)
    }
    const matchIds: string[] = await idsRes.json()

    // Fetch match details in parallel
    const matchDetails = await Promise.all(
      matchIds.map((id) =>
        fetch(`https://${routing}.api.riotgames.com/lol/match/v5/matches/${encodeURIComponent(id)}`, { headers })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
      ),
    )
    riotCalls += matchIds.length

    // deno-lint-ignore no-explicit-any
    const matches = matchDetails
      .filter(Boolean)
      // deno-lint-ignore no-explicit-any
      .map((m: any) => {
        // deno-lint-ignore no-explicit-any
        const me = m.info.participants.find((p: any) => p.puuid === puuid)
        if (!me) return null

        const cs = (me.totalMinionsKilled ?? 0) + (me.neutralMinionsKilled ?? 0)
        // deno-lint-ignore no-explicit-any
        const myTeam    = m.info.teams.find((t: any) => t.teamId === me.teamId)
        const teamKills = myTeam?.objectives?.champion?.kills ?? 0

        return {
          matchId:         m.metadata.matchId,
          championId:      me.championId,
          championName:    me.championName,
          queueId:         m.info.queueId,
          queueName:       QUEUES[m.info.queueId] ?? 'Partie',
          kills:           me.kills,
          deaths:          me.deaths,
          assists:         me.assists,
          cs,
          duration:        m.info.gameDuration,
          win:             me.win,
          gameCreation:    m.info.gameCreation,
          summoner1Id:     me.summoner1Id,
          summoner2Id:     me.summoner2Id,
          keystoneId:      me.perks?.styles?.[0]?.selections?.[0]?.perk ?? 0,
          secondaryStyleId: me.perks?.styles?.[1]?.style ?? 0,
          items:           [me.item0, me.item1, me.item2, me.item3, me.item4, me.item5],
          trinket:         me.item6,
          position:        me.teamPosition || me.individualPosition || '',
          visionScore:     me.visionScore ?? 0,
          damageDealt:     me.totalDamageDealtToChampions ?? 0,
          goldEarned:      me.goldEarned ?? 0,
          teamKills,
          pentaKills:      me.pentaKills ?? 0,
          quadraKills:     me.quadraKills ?? 0,
          tripleKills:     me.tripleKills ?? 0,
        }
      })
      .filter(Boolean)

    const result = { puuid, matches }
    await cacheSet(cacheKey, FN, result)
    await incrementQuota(FN, riotCalls)

    return jsonResponse(result, 200, { 'X-Cache': 'MISS' })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erreur inconnue'
    return jsonResponse({ error: msg }, 500)
  }
})
