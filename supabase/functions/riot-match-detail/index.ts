// Edge Function : détail complet d'un match (10 joueurs + objectifs + timeline).
// Accès public — la clé Riot reste côté serveur.
// Les matches terminés sont immutables : cache permanent (expires 2099).
//
// Appel : GET /functions/v1/riot-match-detail?matchId=EUW1_XXXX&platform=euw1
// Headers : apikey: <SUPABASE_ANON_KEY>
import { createClient }             from 'https://esm.sh/@supabase/supabase-js@2'
import { handleCors, jsonResponse } from '../_shared/cors.ts'
import { requireSecret, getUser }   from '../_shared/auth.ts'
import { cacheGet, cacheSet, cacheGetStale, cacheGetNegative, cacheSetNegative } from '../_shared/cache.ts'
import { isRateLimited } from '../_shared/rate-limit.ts'
import { isCircuitOpen, incrementQuota, secondsUntilMidnightUtc } from '../_shared/circuit-breaker.ts'
import { upsertSearchedSummoner } from '../_shared/searched-summoners.ts'

const FN = 'riot-match-detail'

const ROUTING: Record<string, string> = {
  euw1: 'europe', eun1: 'europe', tr1: 'europe', ru: 'europe',
  na1: 'americas', br1: 'americas', la1: 'americas', la2: 'americas', oc1: 'americas',
  kr: 'asia', jp1: 'asia',
}

// Riot match IDs: region prefix + underscore + numeric ID (e.g. EUW1_1234567890)
const MATCH_ID_RE = /^[A-Z0-9]+_\d+$/

function sanitize(s: string): string {
  return s.replace(/[​-‏‪-‮⁠-⁯﻿]/g, '').trim()
}

// Fire-and-forget : enregistre un événement match_viewed pour les quêtes app.
// Appelé sur HIT, STALE et MISS pour que toute consultation authentifiée compte.
// deno-lint-ignore no-explicit-any
function logMatchViewed(user: any, matchId: string): void {
  if (!user) return
  createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
    .from('app_events')
    // Idempotent : un même (user, match_viewed, matchId) ne crée qu'une ligne.
    // S'appuie sur la contrainte UNIQUE uq_app_events_dedup (totale → pas de
    // prédicat WHERE requis dans onConflict). Ferme le farm d'events de quête.
    .upsert(
      { user_id: user.id, event_type: 'match_viewed', ref_id: matchId },
      { onConflict: 'user_id,event_type,ref_id', ignoreDuplicates: true },
    )
    .then()
    .catch(() => {})
}

Deno.serve(async (req) => {
  const cors = handleCors(req)
  if (cors) return cors

  try {
    const url        = new URL(req.url)
    const matchIdRaw = url.searchParams.get('matchId')
    const platform   = url.searchParams.get('platform') ?? 'euw1'

    if (!matchIdRaw) return jsonResponse({ error: 'matchId requis.' }, 400)

    // Validate platform against known list to prevent SSRF via hostname injection
    if (!Object.hasOwn(ROUTING, platform)) {
      return jsonResponse({ error: 'Région invalide.' }, 400)
    }
    // Cluster régional réel qui sert le match. Résolu ICI (avant la clé de cache)
    // car il en fait partie — un match EUW1_x n'est récupérable que via `europe`.
    const routing = ROUTING[platform]

    const matchId = sanitize(matchIdRaw)

    // Validate matchId format to prevent path injection
    if (!MATCH_ID_RE.test(matchId)) {
      return jsonResponse({ error: 'Format matchId invalide.' }, 400)
    }

    // Rate limiting
    if (await isRateLimited(req, FN)) {
      return jsonResponse({ error: 'Trop de requêtes. Réessaie dans une minute.' }, 429)
    }

    // La clé est SCOPÉE PAR RÉGION (`routing`). Le fetch route via `routing` : un
    // même matchId interrogé avec un platform d'un autre cluster renvoie 404 (match
    // absent de ce cluster). Sans le scope région, ce 404 « mauvaise région » était
    // mis en cache négatif sous une clé globale et bloquait ensuite l'appel légitime
    // avec le bon platform pendant tout le TTL (empoisonnement cross-région). Le
    // positif est scopé de la même façon par cohérence — inoffensif aujourd'hui
    // (contenu identique quelle que soit la région) mais évite le même piège si un
    // futur correctif s'appuie sur cette clé.
    // v2 → v3 (2026-07-31, cadrage PostGame) : ajout des runes COMPLÈTES
    // (6 perks + stat shards) au bloc participant. Le bump est nécessaire parce
    // que le cache de cette EF est PERMANENT (expires 2099) : sans nouvelle clé,
    // les matchs déjà vus resserviraient éternellement un corps sans runes.
    // Les entrées v2 sont LAISSÉES EN PLACE (aucune purge) — elles expirent
    // d'elles-mêmes en 2099 et ne coûtent que du stockage. Prix du bump : les
    // matchs déjà consultés repayent 2 appels Riot à leur prochaine ouverture.
    const cacheKey = `match:v3:${routing}:${matchId}`

    // Résolution parallèle : cache + user JWT — getUser est nécessaire sur HIT aussi
    // (match_viewed doit être loggé quelle que soit la provenance du résultat)
    const [cached, questUser] = await Promise.all([
      cacheGet(cacheKey),
      getUser(req),
    ])

    if (cached !== null) {
      logMatchViewed(questUser, matchId)
      return jsonResponse(cached, 200, { 'X-Cache': 'HIT' })
    }

    // 404 mémorisé (R1) — un matchId inventé mais bien formé passe la regex et
    // coûtait 2 appels Riot (match + timeline) À CHAQUE rejeu, aucun n'étant ni
    // caché ni compté. On sert le 404 mémorisé sans toucher Riot.
    // Pas de logMatchViewed ici : cohérent avec le chemin d'échec d'origine, qui
    // sortait avant le log — un match inexistant ne vaut aucun app_event.
    const neg = await cacheGetNegative(cacheKey)
    if (neg !== null) {
      return jsonResponse(neg.body, neg.status, { 'X-Cache': 'HIT-NEG' })
    }

    // Circuit breaker
    if (await isCircuitOpen()) {
      const stale = await cacheGetStale(cacheKey)
      if (stale !== null) {
        logMatchViewed(questUser, matchId)
        return jsonResponse(stale, 200, { 'X-Cache': 'STALE' })
      }
      return jsonResponse(
        { error: 'Service temporairement indisponible.', reason: 'quota_exceeded', resets_in: secondsUntilMidnightUtc() },
        503,
      )
    }

    const apiKey  = requireSecret('RIOT_API_KEY')
    const headers = { 'X-Riot-Token': apiKey }

    // Fetch match details + timeline in parallel (2 Riot calls)
    const [res, tlRes] = await Promise.all([
      fetch(`https://${routing}.api.riotgames.com/lol/match/v5/matches/${encodeURIComponent(matchId)}`,           { headers }),
      fetch(`https://${routing}.api.riotgames.com/lol/match/v5/matches/${encodeURIComponent(matchId)}/timeline`, { headers }),
    ])
    if (!res.ok) {
      // R1 : les 2 fetch du Promise.all partent toujours (même si le match 404) →
      // 2 appels Riot consommés, ils doivent compter au quota.
      await incrementQuota(FN, 2)
      const body = { error: `Riot API ${res.status}` }
      // Seul le 404 est déterministe (le match n'existe pas) → mémorisable.
      if (res.status === 404) await cacheSetNegative(cacheKey, FN, 404, body)
      return jsonResponse(body, res.status)
    }
    // deno-lint-ignore no-explicit-any
    const m: any = await res.json()
    // Timeline is optional — continue without typed drakes if it fails
    // deno-lint-ignore no-explicit-any
    const tl: any = tlRes.ok ? await tlRes.json() : null

    // ── Drake types by team from timeline ────────────────────────────────────
    const DRAKE_KIND: Record<string, string> = {
      WATER_DRAGON:    'oceandrake',
      FIRE_DRAGON:     'infernaldrake',
      EARTH_DRAGON:    'mountaindrake',
      AIR_DRAGON:      'clouddrake',
      HEXTECH_DRAGON:  'hextechdrake',
      CHEMTECH_DRAGON: 'chemtechdrake',
      ELDER_DRAGON:    'elderdrake',
    }
    // deno-lint-ignore no-explicit-any
    const participantTeam: Record<number, number> = {}
    // deno-lint-ignore no-explicit-any
    m.info.participants.forEach((p: any, i: number) => { participantTeam[i + 1] = p.teamId })

    const drakesByTeam: Record<number, string[]> = { 100: [], 200: [] }

    // ── Timeline frames aggregation ──────────────────────────────────────────
    type PlayerFrameStats = {
      ap: number; ad: number; armor: number; mr: number
      hp: number; hpMax: number; attackSpeed: number; moveSpeed: number
      haste: number; omnivamp: number
      dmgChampions: number; physToChampions: number
      magicToChampions: number; trueToChampions: number
      currentGold: number
    }
    type TimelineFrame = {
      ts: number
      teamGold:    [number, number]
      teamXp:      [number, number]
      teamCs:      [number, number]
      playerGold:  number[]
      playerLevel: number[]
      playerXp:    number[]
      playerCs:    number[]
      playerStats?: PlayerFrameStats[]
    }
    const timelineFrames: TimelineFrame[] = []

    type ItemEvent  = { ts: number; itemId: number; type: 'PURCHASED' | 'SOLD' | 'UNDONE' }
    type SkillEvent = { ts: number; slot: number }
    const itemEvents:  Record<number, ItemEvent[]>  = {}
    const skillEvents: Record<number, SkillEvent[]> = {}

    type Pos = { x: number; y: number }
    type KillEvent = {
      ts: number; killerId: number; victimId: number;
      assistingIds: number[]; position: Pos; teamId: number
    }
    type WardEvent = {
      ts: number; creatorId: number; teamId: number;
      wardType: string; action: 'PLACED' | 'KILLED'; position?: Pos
    }
    type TimelineEvent = {
      ts: number; type: string; subType?: string
      killerId?: number; teamId?: number
      laneType?: string; towerType?: string; buildingType?: string
      monsterType?: string; monsterSubType?: string
      winningTeam?: number
    }
    const kills: KillEvent[]       = []
    const wards: WardEvent[]       = []
    const events: TimelineEvent[]  = []

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
        // deno-lint-ignore no-explicit-any
        ;(frame.events ?? []).forEach((ev: any) => {
          if (ev.type === 'ELITE_MONSTER_KILL' && ev.monsterType === 'DRAGON') {
            const teamId = ev.killerTeamId ?? participantTeam[ev.killerId] ?? 0
            const kind   = DRAKE_KIND[ev.monsterSubType] ?? 'dragon'
            if (teamId === 100 || teamId === 200) drakesByTeam[teamId].push(kind)
          }
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
          if (ev.type === 'SKILL_LEVEL_UP' && ev.participantId && ev.skillSlot) {
            if (!skillEvents[ev.participantId]) skillEvents[ev.participantId] = []
            skillEvents[ev.participantId].push({ ts: ev.timestamp ?? 0, slot: ev.skillSlot })
          }
          if (ev.type === 'CHAMPION_KILL' && ev.position) {
            kills.push({
              ts:           ev.timestamp ?? 0,
              killerId:     ev.killerId ?? 0,
              victimId:     ev.victimId ?? 0,
              assistingIds: ev.assistingParticipantIds ?? [],
              position:     { x: ev.position.x ?? 0, y: ev.position.y ?? 0 },
              teamId:       participantTeam[ev.killerId ?? 0] ?? 0,
            })
          }
          if (ev.type === 'WARD_PLACED' && ev.creatorId) {
            const pos = ev.position
              ? { x: ev.position.x ?? 0, y: ev.position.y ?? 0 }
              : positionAt(ev.creatorId, ev.timestamp ?? 0)
            wards.push({
              ts: ev.timestamp ?? 0, creatorId: ev.creatorId,
              teamId: participantTeam[ev.creatorId] ?? 0,
              wardType: ev.wardType ?? 'UNKNOWN', action: 'PLACED', position: pos,
            })
          }
          if (ev.type === 'WARD_KILL' && ev.killerId) {
            const pos = ev.position
              ? { x: ev.position.x ?? 0, y: ev.position.y ?? 0 }
              : positionAt(ev.killerId, ev.timestamp ?? 0)
            wards.push({
              ts: ev.timestamp ?? 0, creatorId: ev.killerId,
              teamId: participantTeam[ev.killerId] ?? 0,
              wardType: ev.wardType ?? 'UNKNOWN', action: 'KILLED', position: pos,
            })
          }
          if (ev.type === 'BUILDING_KILL') {
            events.push({
              ts: ev.timestamp ?? 0, type: 'BUILDING_KILL',
              killerId: ev.killerId ?? 0, teamId: ev.teamId ?? 0,
              laneType: ev.laneType, towerType: ev.towerType, buildingType: ev.buildingType,
            })
          }
          if (ev.type === 'ELITE_MONSTER_KILL') {
            events.push({
              ts: ev.timestamp ?? 0, type: 'ELITE_MONSTER_KILL',
              killerId: ev.killerId ?? 0,
              teamId: ev.killerTeamId ?? participantTeam[ev.killerId] ?? 0,
              monsterType: ev.monsterType, monsterSubType: ev.monsterSubType,
            })
          }
          if (ev.type === 'GAME_END') {
            events.push({ ts: ev.timestamp ?? 0, type: 'GAME_END', winningTeam: ev.winningTeam ?? 0 })
          }
        })

        const teamGold:  [number, number] = [0, 0]
        const teamXp:    [number, number] = [0, 0]
        const teamCs:    [number, number] = [0, 0]
        const playerGold:  number[] = new Array(10).fill(0)
        const playerLevel: number[] = new Array(10).fill(1)
        const playerXp:    number[] = new Array(10).fill(0)
        const playerCs:    number[] = new Array(10).fill(0)
        const framePlayerStats: (PlayerFrameStats | null)[] = new Array(10).fill(null)

        // deno-lint-ignore no-explicit-any
        Object.entries(frame.participantFrames ?? {}).forEach(([pid, pf]: [string, any]) => {
          const idx     = Number(pid) - 1
          const teamIdx = participantTeam[Number(pid)] === 100 ? 0 : 1
          const cs      = (pf.minionsKilled ?? 0) + (pf.jungleMinionsKilled ?? 0)
          teamGold[teamIdx]  += pf.totalGold ?? 0
          teamXp[teamIdx]    += pf.xp ?? 0
          teamCs[teamIdx]    += cs
          playerGold[idx]     = pf.totalGold ?? 0
          playerLevel[idx]    = pf.level ?? 1
          playerXp[idx]       = pf.xp ?? 0
          playerCs[idx]       = cs
          const cstat = pf.championStats
          const dstat = pf.damageStats
          if (cstat) {
            framePlayerStats[idx] = {
              ap: cstat.abilityPower ?? 0,   ad: cstat.attackDamage ?? 0,
              armor: cstat.armor ?? 0,       mr: cstat.magicResist ?? 0,
              hp: cstat.health ?? 0,         hpMax: cstat.healthMax ?? 0,
              attackSpeed: cstat.attackSpeed ?? 0, moveSpeed: cstat.movementSpeed ?? 0,
              haste: cstat.abilityHaste ?? 0,    omnivamp: cstat.omnivamp ?? 0,
              dmgChampions:    dstat?.totalDamageDoneToChampions       ?? 0,
              physToChampions: dstat?.physicalDamageDoneToChampions    ?? 0,
              magicToChampions: dstat?.magicDamageDoneToChampions      ?? 0,
              trueToChampions: dstat?.trueDamageDoneToChampions        ?? 0,
              currentGold: pf.currentGold ?? 0,
            }
          }
        })

        const hasStats = framePlayerStats.some(s => s !== null)
        timelineFrames.push({
          ts: frame.timestamp ?? 0,
          teamGold, teamXp, teamCs,
          playerGold, playerLevel, playerXp, playerCs,
          ...(hasStats ? { playerStats: framePlayerStats as PlayerFrameStats[] } : {}),
        })
      })
    }

    // ── Runes complètes (cache v3) ───────────────────────────────────────────
    // Riot expose : perks.styles[0] = arbre primaire (4 sélections, la 1re est
    // la keystone), perks.styles[1] = arbre secondaire (2 sélections), et
    // perks.statPerks = les 3 fragments (offense / flex / defense).
    // On aplatit les 6 perks dans l'ordre de jeu — `selected[0]` est donc
    // toujours la keystone. L'ordre par INDEX (0 = primaire, 1 = secondaire)
    // reprend l'hypothèse déjà faite par le calcul de keystoneId ci-dessous :
    // la changer pour un lookup par `description` modifierait silencieusement
    // des valeurs déjà servies.
    type PerkSel = { perk?: number }
    type PerkStyle = { style?: number; selections?: PerkSel[] }
    // deno-lint-ignore no-explicit-any
    function mapPerks(perks: any) {
      const styles: PerkStyle[] = Array.isArray(perks?.styles) ? perks.styles : []
      const ids = (s?: PerkStyle) =>
        (s?.selections ?? []).map((x) => x?.perk ?? 0).filter((n) => n > 0)
      return {
        primaryStyle: styles[0]?.style ?? 0,
        subStyle:     styles[1]?.style ?? 0,
        selected:     [...ids(styles[0]), ...ids(styles[1])],   // 6 ids, keystone en [0]
        statPerks: {
          offense: perks?.statPerks?.offense ?? 0,
          flex:    perks?.statPerks?.flex    ?? 0,
          defense: perks?.statPerks?.defense ?? 0,
        },
      }
    }

    // deno-lint-ignore no-explicit-any
    const participants = m.info.participants.map((p: any, idx: number) => ({
      itemEvents:      itemEvents[idx + 1]  ?? [],
      skillEvents:     skillEvents[idx + 1] ?? [],
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
      damageObjectives:    p.damageDealtToObjectives ?? 0,
      damageTurrets:       p.damageDealtToTurrets ?? 0,
      damageBuildings:     p.damageDealtToBuildings ?? 0,
      physicalDamageDealt: p.physicalDamageDealtToChampions ?? 0,
      magicDamageDealt:    p.magicDamageDealtToChampions   ?? 0,
      trueDamageDealt:     p.trueDamageDealtToChampions     ?? 0,
      totalHeal:        p.totalHeal ?? 0,
      healOnTeammates:  p.totalHealsOnTeammates ?? 0,
      timeCcOthers:     p.timeCCingOthers ?? 0,
      longestLife:      p.longestTimeSpentLiving ?? 0,
      goldEarned:      p.goldEarned ?? 0,
      level:           p.champLevel ?? 1,
      summoner1Id:     p.summoner1Id,
      summoner2Id:     p.summoner2Id,
      // ⚠️ keystoneId / secondaryStyleId sont CONSERVÉS tels quels : six
      // consommateurs les lisent déjà (page /match, /summoner, /matches,
      // AccueilTab côté site ; RiotService + MatchHistoryView côté WPF). Le
      // champ `perks` ci-dessous est purement ADDITIF — ne pas les retirer au
      // prétexte qu'ils sont redondants avec perks.selected[0] / perks.subStyle.
      keystoneId:      p.perks?.styles?.[0]?.selections?.[0]?.perk ?? 0,
      secondaryStyleId: p.perks?.styles?.[1]?.style ?? 0,
      perks:           mapPerks(p.perks),
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
        baron:     t.objectives?.baron?.kills      ?? 0,
        dragon:    t.objectives?.dragon?.kills     ?? 0,
        herald:    t.objectives?.riftHerald?.kills ?? 0,
        tower:     t.objectives?.tower?.kills      ?? 0,
        inhibitor: t.objectives?.inhibitor?.kills  ?? 0,
        voidgrub:  t.objectives?.horde?.kills      ?? 0,
        champion:  t.objectives?.champion?.kills   ?? 0,
      },
      drakes: drakesByTeam[t.teamId] ?? [],
    }))

    const result = {
      matchId:      m.metadata.matchId,
      gameCreation: m.info.gameCreation,
      gameDuration: m.info.gameDuration,
      queueId:      m.info.queueId,
      gameVersion:  m.info.gameVersion,
      mapId:        m.info.mapId ?? 11,
      participants,
      teams,
      timeline:     timelineFrames,
      kills,
      wards,
      events,
    }

    await cacheSet(cacheKey, FN, result)
    await incrementQuota(FN)
    // Alimente searched_summoners avec les 10 participants du match (fire-and-forget)
    // deno-lint-ignore no-explicit-any
    result.participants.forEach((p: any) => {
      if (p.riotIdGameName) upsertSearchedSummoner(platform, p.riotIdGameName, p.riotIdTagline)
    })

    logMatchViewed(questUser, matchId)

    return jsonResponse(result, 200, { 'X-Cache': 'MISS' })
  } catch (e) {
    console.error('riot-match-detail: unhandled exception', e instanceof Error ? e.message : String(e))
    return jsonResponse({ error: 'Erreur serveur inattendue.' }, 500)
  }
})
