// Edge Function : rang Solo/Duo + Flex d'un joueur via league-v4.
// AUTH REQUISE — donnée personnelle.
//
// Appel : GET /functions/v1/riot-rank?gameName=X&tagLine=Y&platform=euw1
// Headers : apikey, Authorization: Bearer <user_jwt>
//
// Réponse :
//   { puuid, summonerId, entries: [{ queueType, tier, rank, lp, wins, losses }] }
import { handleCors, jsonResponse } from '../_shared/cors.ts'
import { requireSecret } from '../_shared/auth.ts'

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
    // Accès public (clé anon suffit) — pas de check JWT. Voir config.toml.
    const url = new URL(req.url)
    const gameNameRaw = url.searchParams.get('gameName')
    const tagLineRaw  = url.searchParams.get('tagLine')
    const platform    = url.searchParams.get('platform') ?? 'euw1'

    if (!gameNameRaw || !tagLineRaw) {
      return jsonResponse({ error: 'gameName et tagLine requis.' }, 400)
    }
    const gameName = sanitize(gameNameRaw)
    const tagLine  = sanitize(tagLineRaw)

    const apiKey  = requireSecret('RIOT_API_KEY')
    const routing = ROUTING[platform] ?? 'europe'
    const headers = { 'X-Riot-Token': apiKey }

    // 1. PUUID via account-v1
    const acctRes = await fetch(
      `https://${routing}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`,
      { headers },
    )
    if (!acctRes.ok) {
      if (acctRes.status === 404) {
        return jsonResponse({ error: 'Invocateur introuvable.' }, 404)
      }
      return jsonResponse({ error: `Riot API ${acctRes.status}` }, acctRes.status)
    }
    const { puuid } = await acctRes.json()

    // 2. SummonerId via summoner-v4 (par puuid)
    const sumRes = await fetch(
      `https://${platform}.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${puuid}`,
      { headers },
    )
    if (!sumRes.ok) {
      return jsonResponse({ error: `Summoner API ${sumRes.status}` }, sumRes.status)
    }
    const sum = await sumRes.json()
    const summonerId: string = sum.id ?? ''

    // 3. Entries league-v4
    const leagueRes = await fetch(
      `https://${platform}.api.riotgames.com/lol/league/v4/entries/by-summoner/${summonerId}`,
      { headers },
    )
    if (!leagueRes.ok) {
      return jsonResponse({ error: `League API ${leagueRes.status}` }, leagueRes.status)
    }
    // deno-lint-ignore no-explicit-any
    const rawEntries: any[] = await leagueRes.json()

    // deno-lint-ignore no-explicit-any
    const entries = rawEntries.map((e: any) => ({
      queueType:    e.queueType,          // RANKED_SOLO_5x5, RANKED_FLEX_SR
      tier:         e.tier,               // IRON, BRONZE, … MASTER, GRANDMASTER, CHALLENGER
      rank:         e.rank,               // I, II, III, IV
      lp:           e.leaguePoints ?? 0,
      wins:         e.wins ?? 0,
      losses:       e.losses ?? 0,
      veteran:      e.veteran ?? false,
      hotStreak:    e.hotStreak ?? false,
      freshBlood:   e.freshBlood ?? false,
      inactive:     e.inactive ?? false,
    }))

    return jsonResponse({ puuid, summonerId, entries })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erreur inconnue'
    return jsonResponse({ error: msg }, 500)
  }
})
