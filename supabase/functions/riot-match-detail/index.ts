// Edge Function : détail complet d'un match (les 10 joueurs + objectifs + bans).
// AUTH REQUISE — données détaillées, on protège même si tout est public côté Riot.
//
// Appel : GET /functions/v1/riot-match-detail?matchId=EUW1_XXXX&platform=euw1
// Headers : apikey, Authorization: Bearer <user_jwt>
import { handleCors, jsonResponse } from '../_shared/cors.ts'
import { getUser, requireSecret } from '../_shared/auth.ts'

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
    const user = await getUser(req)
    if (!user) return jsonResponse({ error: 'Non authentifié.' }, 401)

    const url = new URL(req.url)
    const matchIdRaw = url.searchParams.get('matchId')
    const platform   = url.searchParams.get('platform') ?? 'euw1'
    if (!matchIdRaw) return jsonResponse({ error: 'matchId requis.' }, 400)
    const matchId = sanitize(matchIdRaw)

    const apiKey  = requireSecret('RIOT_API_KEY')
    const routing = ROUTING[platform] ?? 'europe'

    const res = await fetch(
      `https://${routing}.api.riotgames.com/lol/match/v5/matches/${matchId}`,
      { headers: { 'X-Riot-Token': apiKey } },
    )
    if (!res.ok) {
      return jsonResponse({ error: `Riot API ${res.status}` }, res.status)
    }
    // deno-lint-ignore no-explicit-any
    const m: any = await res.json()

    // deno-lint-ignore no-explicit-any
    const participants = m.info.participants.map((p: any) => ({
      puuid:           p.puuid,
      riotIdGameName:  p.riotIdGameName ?? p.summonerName ?? '',
      riotIdTagline:   p.riotIdTagline ?? '',
      championId:      p.championId,
      championName:    p.championName,
      teamId:          p.teamId,
      teamPosition:    p.teamPosition || p.individualPosition || '',
      kills:           p.kills,
      deaths:          p.deaths,
      assists:         p.assists,
      cs:              (p.totalMinionsKilled ?? 0) + (p.neutralMinionsKilled ?? 0),
      visionScore:     p.visionScore ?? 0,
      damageDealt:     p.totalDamageDealtToChampions ?? 0,
      damageTaken:     p.totalDamageTaken ?? 0,
      damageMitigated: p.damageSelfMitigated ?? 0,
      goldEarned:      p.goldEarned ?? 0,
      level:           p.champLevel ?? 1,
      summoner1Id:     p.summoner1Id,
      summoner2Id:     p.summoner2Id,
      keystoneId:      p.perks?.styles?.[0]?.selections?.[0]?.perk ?? 0,
      secondaryStyleId: p.perks?.styles?.[1]?.style ?? 0,
      items:           [p.item0, p.item1, p.item2, p.item3, p.item4, p.item5],
      trinket:         p.item6,
      pentaKills:      p.pentaKills ?? 0,
      quadraKills:     p.quadraKills ?? 0,
      tripleKills:     p.tripleKills ?? 0,
      doubleKills:     p.doubleKills ?? 0,
      wardsPlaced:     p.wardsPlaced ?? 0,
      wardsKilled:     p.wardsKilled ?? 0,
      controlWards:    p.detectorWardsPlaced ?? 0,
      win:             p.win,
    }))

    // deno-lint-ignore no-explicit-any
    const teams = m.info.teams.map((t: any) => ({
      teamId:     t.teamId,
      win:        t.win,
      bans:       (t.bans ?? []).map((b: { championId: number; pickTurn: number }) => b.championId),
      objectives: {
        baron:      t.objectives?.baron?.kills      ?? 0,
        dragon:     t.objectives?.dragon?.kills     ?? 0,
        herald:     t.objectives?.riftHerald?.kills ?? 0,
        tower:      t.objectives?.tower?.kills      ?? 0,
        inhibitor:  t.objectives?.inhibitor?.kills  ?? 0,
        voidgrub:   t.objectives?.horde?.kills      ?? 0, // Void Grubs (Larves du Néant)
        champion:   t.objectives?.champion?.kills   ?? 0,
      },
    }))

    return jsonResponse({
      matchId:       m.metadata.matchId,
      gameCreation:  m.info.gameCreation,
      gameDuration:  m.info.gameDuration,
      queueId:       m.info.queueId,
      gameVersion:   m.info.gameVersion,
      participants,
      teams,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erreur inconnue'
    return jsonResponse({ error: msg }, 500)
  }
})
