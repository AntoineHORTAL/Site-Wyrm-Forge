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
      playerXp:    number[]
      playerCs:    number[]
    }
    const timelineFrames: TimelineFrame[] = []

    // Achats d'items et levels-up de sorts par participantId
    type ItemEvent  = { ts: number; itemId: number; type: 'PURCHASED' | 'SOLD' | 'UNDONE' }
    type SkillEvent = { ts: number; slot: number /* 1=Q 2=W 3=E 4=R */ }
    const itemEvents:  Record<number, ItemEvent[]>  = {}
    const skillEvents: Record<number, SkillEvent[]> = {}

    // Kills (events CHAMPION_KILL) + Wards (placement et destruction) au niveau global de la partie
    type Pos = { x: number; y: number }
    type KillEvent = {
      ts: number; killerId: number; victimId: number;
      assistingIds: number[]; position: Pos; teamId: number
    }
    type WardEvent = {
      ts: number; creatorId: number; teamId: number;
      wardType: string; action: 'PLACED' | 'KILLED'; position?: Pos
    }
    // Events macro (tours, inhibs, drakes, baron, héraut, voidgrubs, atakhan, game end)
    // Utilisés notamment par l'app desktop pour la timeline visuelle post-game.
    type TimelineEvent = {
      ts: number; type: string; subType?: string
      killerId?: number; teamId?: number
      laneType?: string; towerType?: string; buildingType?: string
      monsterType?: string; monsterSubType?: string
      winningTeam?: number
    }
    const kills: KillEvent[] = []
    const wards: WardEvent[] = []
    const events: TimelineEvent[] = []

    // Helper : récupère la position d'un participant au timestamp ts (frame la plus proche AVANT ts).
    // Utilisé pour les WARD_PLACED qui n'ont pas de position dans le payload Riot.
    function positionAt(participantId: number, ts: number): { x: number; y: number } | undefined {
      if (!tl?.info?.frames) return undefined
      let best = null, bestDelta = Infinity
      // deno-lint-ignore no-explicit-any
      for (const f of tl.info.frames as any[]) {
        if ((f.timestamp ?? 0) > ts) break
        const delta = ts - (f.timestamp ?? 0)
        if (delta < bestDelta) { best = f; bestDelta = delta }
      }
      if (!best) return undefined
      const pf = best.participantFrames?.[participantId]
      if (!pf?.position) return undefined
      return { x: pf.position.x ?? 0, y: pf.position.y ?? 0 }
    }

    if (tl?.info?.frames) {
      // deno-lint-ignore no-explicit-any
      tl.info.frames.forEach((frame: any) => {
        // 1. Events : drakes, items, skills
        // deno-lint-ignore no-explicit-any
        (frame.events ?? []).forEach((ev: any) => {
          // Drakes typés
          if (ev.type === 'ELITE_MONSTER_KILL' && ev.monsterType === 'DRAGON') {
            const teamId = ev.killerTeamId ?? participantTeam[ev.killerId] ?? 0
            const kind   = DRAKE_KIND[ev.monsterSubType] ?? 'dragon'
            if (teamId === 100 || teamId === 200) drakesByTeam[teamId].push(kind)
          }
          // Items
          if (ev.type === 'ITEM_PURCHASED' && ev.participantId && ev.itemId) {
            if (!itemEvents[ev.participantId]) itemEvents[ev.participantId] = []
            itemEvents[ev.participantId].push({ ts: ev.timestamp ?? 0, itemId: ev.itemId, type: 'PURCHASED' })
          }
          if (ev.type === 'ITEM_SOLD' && ev.participantId && ev.itemId) {
            if (!itemEvents[ev.participantId]) itemEvents[ev.participantId] = []
            itemEvents[ev.participantId].push({ ts: ev.timestamp ?? 0, itemId: ev.itemId, type: 'SOLD' })
          }
          if (ev.type === 'ITEM_UNDO' && ev.participantId && ev.beforeId) {
            if (!itemEvents[ev.participantId]) itemEvents[ev.participantId] = []
            itemEvents[ev.participantId].push({ ts: ev.timestamp ?? 0, itemId: ev.beforeId, type: 'UNDONE' })
          }
          // Skills
          if (ev.type === 'SKILL_LEVEL_UP' && ev.participantId && ev.skillSlot) {
            if (!skillEvents[ev.participantId]) skillEvents[ev.participantId] = []
            skillEvents[ev.participantId].push({ ts: ev.timestamp ?? 0, slot: ev.skillSlot })
          }
          // Kills (CHAMPION_KILL : a position {x,y}, killerId, victimId, assistingParticipantIds)
          if (ev.type === 'CHAMPION_KILL' && ev.position) {
            const killerId = ev.killerId ?? 0
            const victimId = ev.victimId ?? 0
            const killerTeam = participantTeam[killerId] ?? 0
            kills.push({
              ts: ev.timestamp ?? 0,
              killerId, victimId,
              assistingIds: ev.assistingParticipantIds ?? [],
              position: { x: ev.position.x ?? 0, y: ev.position.y ?? 0 },
              teamId: killerTeam,
            })
          }
          // Wards : WARD_PLACED n'a PAS de position dans match-v5.
          // On déduit la position via la frame la plus proche (cf positionAt).
          if (ev.type === 'WARD_PLACED' && ev.creatorId) {
            const teamId = participantTeam[ev.creatorId] ?? 0
            const pos = ev.position
              ? { x: ev.position.x ?? 0, y: ev.position.y ?? 0 }
              : positionAt(ev.creatorId, ev.timestamp ?? 0)
            wards.push({
              ts: ev.timestamp ?? 0, creatorId: ev.creatorId, teamId,
              wardType: ev.wardType ?? 'UNKNOWN', action: 'PLACED',
              position: pos,
            })
          }
          // WARD_KILL : la position de la ward détruite est généralement fournie
          if (ev.type === 'WARD_KILL' && ev.killerId) {
            const teamId = participantTeam[ev.killerId] ?? 0
            const pos = ev.position
              ? { x: ev.position.x ?? 0, y: ev.position.y ?? 0 }
              : positionAt(ev.killerId, ev.timestamp ?? 0)
            wards.push({
              ts: ev.timestamp ?? 0, creatorId: ev.killerId, teamId,
              wardType: ev.wardType ?? 'UNKNOWN', action: 'KILLED',
              position: pos,
            })
          }
          // Events macro pour timeline post-game (app desktop) : tours, inhibs,
          // drakes (typés), barons, hérauts, voidgrubs, atakhan, fin de partie.
          if (ev.type === 'BUILDING_KILL') {
            events.push({
              ts: ev.timestamp ?? 0, type: 'BUILDING_KILL',
              killerId: ev.killerId ?? 0,
              teamId:   ev.teamId   ?? 0,
              laneType:     ev.laneType,
              towerType:    ev.towerType,
              buildingType: ev.buildingType,
            })
          }
          if (ev.type === 'ELITE_MONSTER_KILL') {
            events.push({
              ts: ev.timestamp ?? 0, type: 'ELITE_MONSTER_KILL',
              killerId: ev.killerId ?? 0,
              teamId:   ev.killerTeamId ?? participantTeam[ev.killerId] ?? 0,
              monsterType:    ev.monsterType,
              monsterSubType: ev.monsterSubType,
            })
          }
          if (ev.type === 'GAME_END') {
            events.push({
              ts: ev.timestamp ?? 0, type: 'GAME_END',
              winningTeam: ev.winningTeam ?? 0,
            })
          }
        })

        // 2. Snapshot par équipe + par joueur
        const teamGold: [number, number] = [0, 0]
        const teamXp:   [number, number] = [0, 0]
        const teamCs:   [number, number] = [0, 0]
        const playerGold:  number[] = new Array(10).fill(0)
        const playerLevel: number[] = new Array(10).fill(1)
        const playerXp:    number[] = new Array(10).fill(0)
        const playerCs:    number[] = new Array(10).fill(0)

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
          playerXp[idx]      = pf.xp ?? 0
          playerCs[idx]      = cs
        })

        timelineFrames.push({
          ts: frame.timestamp ?? 0,
          teamGold, teamXp, teamCs,
          playerGold, playerLevel, playerXp, playerCs,
        })
      })
    }

    // deno-lint-ignore no-explicit-any
    const participants = m.info.participants.map((p: any, idx: number) => ({
      // participantId Riot = idx+1 — on récupère les events timeline associés.
      itemEvents:  itemEvents[idx + 1]  ?? [],
      skillEvents: skillEvents[idx + 1] ?? [],
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
      mapId:         m.info.mapId ?? 11,
      participants,
      teams,
      timeline:      timelineFrames,
      kills,
      wards,
      events,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erreur inconnue'
    return jsonResponse({ error: msg }, 500)
  }
})
