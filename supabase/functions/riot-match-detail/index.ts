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
    const headers = { 'X-Riot-Token': apiKey }

    // 1. Match (détails)  +  2. Timeline (pour les types de drakes) en parallèle
    const [res, tlRes] = await Promise.all([
      fetch(`https://${routing}.api.riotgames.com/lol/match/v5/matches/${matchId}`,           { headers }),
      fetch(`https://${routing}.api.riotgames.com/lol/match/v5/matches/${matchId}/timeline`, { headers }),
    ])
    if (!res.ok) {
      return jsonResponse({ error: `Riot API ${res.status}` }, res.status)
    }
    // deno-lint-ignore no-explicit-any
    const m: any = await res.json()
    // Timeline est facultative — si elle échoue on poursuit sans drakes typés.
    // deno-lint-ignore no-explicit-any
    const tl: any = tlRes.ok ? await tlRes.json() : null

    // ── Extraction des drakes typés par équipe depuis la timeline ──
    // Mapping monsterSubType (Riot) → nom court (matche les noms de fichiers _xxx.png).
    const DRAKE_KIND: Record<string, string> = {
      WATER_DRAGON:    'oceandrake',
      FIRE_DRAGON:     'infernaldrake',
      EARTH_DRAGON:    'mountaindrake',
      AIR_DRAGON:      'clouddrake',
      HEXTECH_DRAGON:  'hextechdrake',
      CHEMTECH_DRAGON: 'chemtechdrake',
      ELDER_DRAGON:    'elderdrake',
    }
    // Indexation participantId → teamId pour résoudre killerTeamId si absent
    // deno-lint-ignore no-explicit-any
    const participantTeam: Record<number, number> = {}
    // deno-lint-ignore no-explicit-any
    m.info.participants.forEach((p: any, i: number) => { participantTeam[i + 1] = p.teamId })

    const drakesByTeam: Record<number, string[]> = { 100: [], 200: [] }

    // ── Agrégation des frames timeline (1 frame ≈ 1 minute) ──
    // Pour chaque frame, on calcule les totaux par équipe (or, xp, cs)
    // ainsi que les valeurs par joueur (or, level) pour pouvoir tracer
    // les courbes côté client.
    type TimelineFrame = {
      ts: number
      teamGold:    [number, number]   // [bleu, rouge]
      teamXp:      [number, number]
      teamCs:      [number, number]
      playerGold:  number[]           // index 0..9 (participantId-1)
      playerLevel: number[]
    }
    const timelineFrames: TimelineFrame[] = []

    if (tl?.info?.frames) {
      // deno-lint-ignore no-explicit-any
      tl.info.frames.forEach((frame: any) => {
        // 1. Drakes typés via events
        // deno-lint-ignore no-explicit-any
        (frame.events ?? []).forEach((ev: any) => {
          if (ev.type === 'ELITE_MONSTER_KILL' && ev.monsterType === 'DRAGON') {
            const teamId = ev.killerTeamId ?? participantTeam[ev.killerId] ?? 0
            const kind   = DRAKE_KIND[ev.monsterSubType] ?? 'dragon'
            if (teamId === 100 || teamId === 200) drakesByTeam[teamId].push(kind)
          }
        })

        // 2. Snapshot par équipe + par joueur
        const teamGold: [number, number] = [0, 0]
        const teamXp:   [number, number] = [0, 0]
        const teamCs:   [number, number] = [0, 0]
        const playerGold:  number[] = new Array(10).fill(0)
        const playerLevel: number[] = new Array(10).fill(1)

        // deno-lint-ignore no-explicit-any
        Object.entries(frame.participantFrames ?? {}).forEach(([pid, pf]: [string, any]) => {
          const idx    = Number(pid) - 1
          const teamId = participantTeam[Number(pid)]
          const teamIdx = teamId === 100 ? 0 : 1
          const cs = (pf.minionsKilled ?? 0) + (pf.jungleMinionsKilled ?? 0)
          teamGold[teamIdx] += pf.totalGold ?? 0
          teamXp[teamIdx]   += pf.xp ?? 0
          teamCs[teamIdx]   += cs
          playerGold[idx]    = pf.totalGold ?? 0
          playerLevel[idx]   = pf.level ?? 1
        })

        timelineFrames.push({
          ts: frame.timestamp ?? 0,
          teamGold, teamXp, teamCs, playerGold, playerLevel,
        })
      })
    }

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
      // Stats supplémentaires
      damageObjectives: p.damageDealtToObjectives ?? 0,
      damageTurrets:    p.damageDealtToTurrets ?? 0,
      damageBuildings:  p.damageDealtToBuildings ?? 0,
      totalHeal:        p.totalHeal ?? 0,
      healOnTeammates:  p.totalHealsOnTeammates ?? 0,
      timeCcOthers:     p.timeCCingOthers ?? 0,
      longestLife:      p.longestTimeSpentLiving ?? 0,
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
        voidgrub:   t.objectives?.horde?.kills      ?? 0,
        champion:   t.objectives?.champion?.kills   ?? 0,
      },
      // Liste des drakes pris dans l'ordre, typés (ex: ['infernaldrake', 'oceandrake', 'elderdrake'])
      drakes: drakesByTeam[t.teamId] ?? [],
    }))

    return jsonResponse({
      matchId:       m.metadata.matchId,
      gameCreation:  m.info.gameCreation,
      gameDuration:  m.info.gameDuration,
      queueId:       m.info.queueId,
      gameVersion:   m.info.gameVersion,
      participants,
      teams,
      timeline:      timelineFrames,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erreur inconnue'
    return jsonResponse({ error: msg }, 500)
  }
})
