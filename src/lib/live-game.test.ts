import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  TEAM_ORDER, TEAM_CHAOS, teamSide, splitTeams,
  QUEUE_LABELS_LIVE, queueLabel,
  normalizePlatform, isKnownPlatform, KNOWN_PLATFORMS,
  isValidPuuid, parseRiotId,
  elapsedSeconds, formatElapsed, formatResetsIn,
  stateTone, stateMessage, cooldownFor, REFRESH_COOLDOWN_S,
  mapLiveGameResponse, fetchLiveGame, buildLiveHref,
  pickRankedEntry, winratePct, mapRankResponse, fetchParticipantRanks,
  MAX_RANK_CALLS_PER_LOAD, SOLO_QUEUE, FLEX_QUEUE,
  type LiveGameInfo, type LiveGameState,
} from './live-game'

// PUUID réaliste : 78 caractères URL-safe (JAMAIS un UUID v4).
const PUUID = 'a'.repeat(78)

const GAME: LiveGameInfo = {
  game_id: 7331, platform_id: 'EUW1', queue_id: 420, map_id: 11,
  game_mode: 'CLASSIC', game_type: 'MATCHED_GAME',
  game_start_time: 1_700_000_000_000, game_length_s: 137,
  banned_champions: [{ champion_id: 64, team_id: 100, pick_turn: 1 }],
}

const okBody = (over: Record<string, unknown> = {}) => ({
  in_game: true,
  game: GAME,
  participants: [
    {
      puuid: PUUID, riot_id: 'Faker#T1', team_id: 100, champion_id: 103,
      spell1_id: 4, spell2_id: 14, profile_icon_id: 29,
      perks: { perk_ids: [8112, 8143], perk_style: 8100, perk_sub_style: 8300 },
      bot: false,
    },
  ],
  ranks: null,
  requested_puuid: PUUID,
  ...over,
})

// ─────────────────────────────────────────────────────────────────────────────
describe('team_id — table critique §B', () => {
  it('100 = ORDER (bleu), 200 = CHAOS (rouge)', () => {
    // Garde-fou d'inversion : côté WPF team_id est la clé de jointure des
    // rangs, une inversion produit des données fausses ET plausibles.
    expect(TEAM_ORDER).toBe(100)
    expect(TEAM_CHAOS).toBe(200)
    expect(teamSide(100)).toBe('order')
    expect(teamSide(200)).toBe('chaos')
  })
  it('valeur hors {100,200} → null, jamais un camp par défaut', () => {
    expect(teamSide(0)).toBeNull()
    expect(teamSide(300)).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// STOP D3 — séparation des camps en partie MIROIR
// ─────────────────────────────────────────────────────────────────────────────
describe('splitTeams — STOP D3 : partie miroir', () => {
  // Yasuo (157) joué DES DEUX CÔTÉS, et Lux (99) aussi. Si la répartition
  // s'appuyait sur le champion (id ou nom), ces joueurs seraient ambigus.
  const mirror = [
    { puuid: 'blue-yasuo', team_id: 100, champion_id: 157 },
    { puuid: 'blue-lux', team_id: 100, champion_id: 99 },
    { puuid: 'blue-lee', team_id: 100, champion_id: 64 },
    { puuid: 'red-yasuo', team_id: 200, champion_id: 157 },
    { puuid: 'red-lux', team_id: 200, champion_id: 99 },
    { puuid: 'red-zed', team_id: 200, champion_id: 238 },
  ]

  it('sépare par team_id, JAMAIS par champion', () => {
    const t = splitTeams(mirror)
    expect(t.order.map(p => p.puuid)).toEqual(['blue-yasuo', 'blue-lux', 'blue-lee'])
    expect(t.chaos.map(p => p.puuid)).toEqual(['red-yasuo', 'red-lux', 'red-zed'])
    expect(t.unknown).toEqual([])
  })

  it('le même champion_id existe des deux côtés sans fusion ni perte', () => {
    const t = splitTeams(mirror)
    // Yasuo présent une fois dans chaque camp — jamais dédupliqué.
    expect(t.order.filter(p => p.champion_id === 157)).toHaveLength(1)
    expect(t.chaos.filter(p => p.champion_id === 157)).toHaveLength(1)
    // Aucun participant perdu : 6 entrées en entrée, 6 en sortie.
    expect(t.order.length + t.chaos.length + t.unknown.length).toBe(mirror.length)
  })

  it('les puuid restent uniques → clé React sûre en partie miroir', () => {
    // champion_id NE PEUT PAS servir de clé React ici : 157 apparaît 2 fois.
    const champIds = mirror.map(p => p.champion_id)
    expect(new Set(champIds).size).toBeLessThan(champIds.length)
    const puuids = mirror.map(p => p.puuid)
    expect(new Set(puuids).size).toBe(puuids.length)
  })

  it('composition complète 5v5 avec miroir → 5 et 5', () => {
    const full = [
      ...[1, 2, 3, 4, 5].map(i => ({ puuid: `b${i}`, team_id: 100, champion_id: i === 1 ? 157 : i })),
      ...[1, 2, 3, 4, 5].map(i => ({ puuid: `r${i}`, team_id: 200, champion_id: i === 1 ? 157 : i + 100 })),
    ]
    const t = splitTeams(full)
    expect(t.order).toHaveLength(5)
    expect(t.chaos).toHaveLength(5)
  })

  it('team_id inattendu → `unknown`, jamais rattaché arbitrairement à un camp', () => {
    const t = splitTeams([...mirror, { puuid: 'ghost', team_id: 300, champion_id: 1 }])
    expect(t.unknown.map(p => p.puuid)).toEqual(['ghost'])
    expect(t.order).toHaveLength(3)
    expect(t.chaos).toHaveLength(3)
  })

  it('fonctionne aussi sur les bans (même forme team_id)', () => {
    const bans = [
      { champion_id: 157, team_id: 100, pick_turn: 1 },
      { champion_id: 157, team_id: 200, pick_turn: 2 }, // ban miroir : légal
      { champion_id: -1, team_id: 200, pick_turn: 4 },  // ban passé
    ]
    const t = splitTeams(bans)
    expect(t.order).toHaveLength(1)
    expect(t.chaos).toHaveLength(2)
  })

  it('liste vide → trois listes vides, pas de throw', () => {
    expect(splitTeams([])).toEqual({ order: [], chaos: [], unknown: [] })
  })
})

describe('libellés de file §D', () => {
  it('couvre les 12 queue_id normatifs', () => {
    expect(Object.keys(QUEUE_LABELS_LIVE).map(Number).sort((a, b) => a - b))
      .toEqual([0, 400, 420, 430, 440, 450, 700, 900, 1020, 1400, 1700, 1900])
    expect(queueLabel(420)).toBe('Classée Solo/Duo')
    expect(queueLabel(450)).toBe('ARAM')
  })
  it('file inconnue → libellé neutre, jamais undefined', () => {
    expect(queueLabel(1234)).toBe('File #1234')
  })
})

describe('plateforme', () => {
  it('accepte libellés et codes, insensible à la casse', () => {
    expect(normalizePlatform('EUW')).toBe('euw1')
    expect(normalizePlatform('euw')).toBe('euw1')
    expect(normalizePlatform('euw1')).toBe('euw1')
    expect(normalizePlatform('EUW1')).toBe('euw1')
    expect(normalizePlatform('LAN')).toBe('la1')
  })
  it('les 11 plateformes de ROUTING sont reconnues', () => {
    expect(KNOWN_PLATFORMS).toHaveLength(11)
    for (const p of KNOWN_PLATFORMS) expect(isKnownPlatform(p)).toBe(true)
    expect(isKnownPlatform('xx9')).toBe(false)
    expect(isKnownPlatform('')).toBe(false)
  })
})

describe('PUUID — jamais un UUID v4', () => {
  it('accepte un vrai PUUID (78 car. URL-safe)', () => {
    expect(isValidPuuid(PUUID)).toBe(true)
    expect(isValidPuuid('A-b_' + 'x'.repeat(70))).toBe(true)
  })
  it('refuse le GUID anonymisé du LCU (UUID v4, 36 car.)', () => {
    expect(isValidPuuid('3f2504e0-4f89-41d3-9a0c-0305e82c3301')).toBe(false)
  })
  it('refuse vide / null / trop court / charset invalide', () => {
    expect(isValidPuuid('')).toBe(false)
    expect(isValidPuuid(null)).toBe(false)
    expect(isValidPuuid('abc')).toBe(false)
    expect(isValidPuuid('!'.repeat(78))).toBe(false)
  })
})

describe('parseRiotId', () => {
  it('sépare nom et tag, gère le # encodé', () => {
    expect(parseRiotId('Faker#T1')).toEqual({ gameName: 'Faker', tagLine: 'T1', valid: true })
    expect(parseRiotId('Faker%23T1')).toEqual({ gameName: 'Faker', tagLine: 'T1', valid: true })
  })
  it('invalide sans # ou avec une partie vide', () => {
    expect(parseRiotId('Faker').valid).toBe(false)
    expect(parseRiotId('Faker#').valid).toBe(false)
    expect(parseRiotId('#T1').valid).toBe(false)
  })
  it('ne throw pas sur un encodage cassé', () => {
    expect(() => parseRiotId('%E0%A4%A')).not.toThrow()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// STOP D2 — le cœur du lot
// ─────────────────────────────────────────────────────────────────────────────
describe('buildLiveHref — Lot D5, point d’entrée depuis /summoner', () => {
  it('propage un PUUID valide → chemin canonique de l’EF (1 appel Riot, pas 2)', () => {
    const href = buildLiveHref('euw1', 'Hortal', 'EUW', PUUID)
    expect(href).toBe(`/live/euw1/Hortal%23EUW?puuid=${PUUID}`)
  })

  it('sans PUUID → repli sur le Riot ID seul, lien toujours valide', () => {
    for (const missing of [undefined, null, '']) {
      expect(buildLiveHref('euw1', 'Hortal', 'EUW', missing)).toBe('/live/euw1/Hortal%23EUW')
    }
  })

  it('PUUID mal formé OMIS plutôt que propagé (l’EF le rejetterait en 400)', () => {
    // Le GUID anonymisé du LCU — 36 caractères, jamais un vrai PUUID Riot.
    const lcuGuid = '5b3f8d2e-1a4c-4f7b-9e2d-3c8a7f1b6d40'
    expect(buildLiveHref('euw1', 'Hortal', 'EUW', lcuGuid)).toBe('/live/euw1/Hortal%23EUW')
  })

  it('encode le # et les caractères spéciaux du Riot ID', () => {
    // Le `#` DOIT être encodé : non encodé, tout ce qui suit devient un
    // fragment et le tag disparaîtrait côté serveur comme côté routeur.
    const href = buildLiveHref('kr', 'Hide on bush', 'KR1', null)
    expect(href).toBe('/live/kr/Hide%20on%20bush%23KR1')
    expect(href).not.toContain('#')
  })

  it('l’URL produite se relit avec parseRiotId (aller-retour sans perte)', () => {
    const href = buildLiveHref('euw1', 'Ho rtal', 'EUW', PUUID)
    const segment = href.split('/')[3].split('?')[0]
    const parsed = parseRiotId(segment)
    expect(parsed).toEqual({ gameName: 'Ho rtal', tagLine: 'EUW', valid: true })
  })
})

describe('elapsedSeconds — STOP D2', () => {
  it('calcule l’écoulé depuis game_start_time', () => {
    expect(elapsedSeconds(GAME.game_start_time, GAME.game_start_time + 137_000)).toBe(137)
    expect(elapsedSeconds(GAME.game_start_time, GAME.game_start_time + 1_500)).toBe(1)
  })

  it('NE RENVOIE JAMAIS de valeur négative (horloge client en retard)', () => {
    // Décalage NTP / fuseau mal réglé : l'écart brut serait -60 s.
    expect(elapsedSeconds(GAME.game_start_time, GAME.game_start_time - 60_000)).toBe(0)
    expect(elapsedSeconds(GAME.game_start_time, GAME.game_start_time - 1)).toBe(0)
    expect(elapsedSeconds(GAME.game_start_time, 0)).toBe(0)
    // Balayage : aucun `now` antérieur au départ ne doit produire un négatif.
    for (let d = 1; d <= 100_000; d += 997) {
      expect(elapsedSeconds(GAME.game_start_time, GAME.game_start_time - d)).toBe(0)
    }
  })

  it('NE REPART JAMAIS de game_length_s', () => {
    // game_length_s est figé par le TTL serveur (jusqu'à 5 min de retard).
    // Ici il vaut 137 alors que l'écoulé réel est 900 s : c'est 900 qui doit
    // sortir. Si un jour quelqu'un « replie » sur game_length_s, ce test casse.
    const now = GAME.game_start_time + 900_000
    expect(elapsedSeconds(GAME.game_start_time, now)).toBe(900)
    expect(elapsedSeconds(GAME.game_start_time, now)).not.toBe(GAME.game_length_s)

    // Même partie, game_length_s absurde : le résultat est inchangé.
    const menteur: LiveGameInfo = { ...GAME, game_length_s: 99_999 }
    expect(elapsedSeconds(menteur.game_start_time, now)).toBe(900)
  })

  it('refuse structurellement l’objet game entier (garde anti-régression)', () => {
    // La signature ne prend qu'un nombre : passer l'objet ne peut pas donner
    // un chrono « par accident » via game_length_s.
    // @ts-expect-error — vérification de robustesse à l'exécution
    expect(elapsedSeconds(GAME, Date.now())).toBeNull()
  })

  it('game_start_time === 0 → null (écran de chargement), jamais 0', () => {
    // §C : afficher « En chargement », surtout pas un chrono à 00:00.
    expect(elapsedSeconds(0, Date.now())).toBeNull()
    expect(elapsedSeconds(0, Date.now())).not.toBe(0)
  })

  it('valeurs non exploitables → null', () => {
    expect(elapsedSeconds(NaN, Date.now())).toBeNull()
    expect(elapsedSeconds(-1, Date.now())).toBeNull()
    expect(elapsedSeconds(Infinity, Date.now())).toBeNull()
    expect(elapsedSeconds(GAME.game_start_time, NaN)).toBeNull()
  })

  it('utilise Date.now() par défaut', () => {
    vi.useFakeTimers()
    vi.setSystemTime(GAME.game_start_time + 300_000)
    expect(elapsedSeconds(GAME.game_start_time)).toBe(300)
    vi.useRealTimers()
  })
})

describe('formatElapsed', () => {
  it('formate M:SS puis H:MM:SS', () => {
    expect(formatElapsed(0)).toBe('0:00')
    expect(formatElapsed(9)).toBe('0:09')
    expect(formatElapsed(137)).toBe('2:17')
    expect(formatElapsed(3600)).toBe('1:00:00')
    expect(formatElapsed(3661)).toBe('1:01:01')
  })
  it('null → tiret (jamais 00:00 sur un chrono inconnu)', () => {
    expect(formatElapsed(null)).toBe('—')
  })
  it('ne rend jamais un négatif', () => {
    expect(formatElapsed(-42)).toBe('0:00')
  })
})

describe('formatResetsIn', () => {
  it('arrondit en s / min / h', () => {
    expect(formatResetsIn(30)).toBe('30 s')
    expect(formatResetsIn(120)).toBe('2 min')
    expect(formatResetsIn(10_800)).toBe('3 h')
  })
  it('0 ou invalide → libellé neutre, jamais « 0 s »', () => {
    expect(formatResetsIn(0)).toBe('un instant')
    expect(formatResetsIn(NaN)).toBe('un instant')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('mapLiveGameResponse — discriminant (status, reason)', () => {
  it('200 in_game:true → in_game avec game + participants', () => {
    const s = mapLiveGameResponse(200, okBody())
    expect(s.kind).toBe('in_game')
    if (s.kind !== 'in_game') throw new Error('unreachable')
    expect(s.game.queue_id).toBe(420)
    expect(s.game.game_start_time).toBe(GAME.game_start_time)
    expect(s.participants).toHaveLength(1)
    expect(s.participants[0].team_id).toBe(TEAM_ORDER)
    expect(s.requestedPuuid).toBe(PUUID)
  })

  it('200 in_game:false → not_in_game (NOMINAL, pas un 404)', () => {
    expect(mapLiveGameResponse(200, { in_game: false, requested_puuid: PUUID }))
      .toEqual({ kind: 'not_in_game' })
  })

  it('200 au corps illisible → not_in_game, jamais une erreur', () => {
    expect(mapLiveGameResponse(200, null)).toEqual({ kind: 'not_in_game' })
  })

  it('400 / 403 / 404 → bad_request / disabled / not_found', () => {
    expect(mapLiveGameResponse(400, { error: 'x' }).kind).toBe('bad_request')
    expect(mapLiveGameResponse(403, { error: 'x' }).kind).toBe('disabled')
    expect(mapLiveGameResponse(404, { error: 'Invocateur introuvable.' }).kind).toBe('not_found')
  })

  it('429 → rate_limited, retry_after_s lu dans le CORPS', () => {
    expect(mapLiveGameResponse(429, { error: 'x', retry_after_s: 42 }))
      .toEqual({ kind: 'rate_limited', retryAfterS: 42 })
    // Premier limiteur : pas de retry_after_s dans le corps.
    expect(mapLiveGameResponse(429, { error: 'x' }))
      .toEqual({ kind: 'rate_limited', retryAfterS: null })
  })

  it('LES DEUX 503 SONT DISTINGUÉS par body.reason', () => {
    const busy = mapLiveGameResponse(503, { error: 'x', reason: 'riot_busy', retry_after_s: 25 })
    expect(busy).toEqual({ kind: 'riot_busy', retryAfterS: 25 })

    const quota = mapLiveGameResponse(503, { error: 'x', reason: 'quota_exceeded', resets_in: 10_800 })
    expect(quota).toEqual({ kind: 'quota_exceeded', resetsIn: 10_800 })

    // Le statut seul ne suffit pas : même code, deux états opposés.
    expect(busy.kind).not.toBe(quota.kind)
  })

  it('503 sans reason connue → server_error (jamais maquillé en quota)', () => {
    // L'EF relaie tel quel un 5xx de Riot : ne pas inventer « quota épuisé ».
    expect(mapLiveGameResponse(503, { error: 'Riot API 503' }))
      .toEqual({ kind: 'server_error', network: false })
  })

  it('riot_busy sans retry_after_s → repli 30 s', () => {
    expect(mapLiveGameResponse(503, { reason: 'riot_busy' }))
      .toEqual({ kind: 'riot_busy', retryAfterS: 30 })
  })

  it('500 et statuts inattendus → server_error', () => {
    expect(mapLiveGameResponse(500, { error: 'x' })).toEqual({ kind: 'server_error', network: false })
    expect(mapLiveGameResponse(418, null)).toEqual({ kind: 'server_error', network: false })
  })

  it('tolère un corps partiel sans throw', () => {
    const s = mapLiveGameResponse(200, { in_game: true })
    expect(s.kind).toBe('in_game')
    if (s.kind !== 'in_game') throw new Error('unreachable')
    expect(s.participants).toEqual([])
    expect(s.game.banned_champions).toEqual([])
    expect(s.game.game_start_time).toBe(0)
    expect(elapsedSeconds(s.game.game_start_time, Date.now())).toBeNull()
  })

  it('participant dégénéré : riot_id vide et bot conservés fidèlement', () => {
    const s = mapLiveGameResponse(200, okBody({
      participants: [{ puuid: PUUID, team_id: 200, champion_id: 1, bot: true }],
    }))
    if (s.kind !== 'in_game') throw new Error('unreachable')
    expect(s.participants[0].riot_id).toBe('')   // repli d'affichage côté UI (§C)
    expect(s.participants[0].bot).toBe(true)     // à étiqueter « IA », pas de rang
    expect(s.participants[0].perks.perk_ids).toEqual([])
  })
})

describe('tonalité — aucun état normal affiché comme une erreur', () => {
  it('not_in_game et disabled sont NOMINAUX', () => {
    expect(stateTone({ kind: 'not_in_game' })).toBe('nominal')
    expect(stateTone({ kind: 'disabled' })).toBe('nominal')
    expect(stateTone({ kind: 'in_game', game: GAME, participants: [], requestedPuuid: '' })).toBe('nominal')
  })
  it('les états d’échec sont des erreurs', () => {
    const errs: LiveGameState[] = [
      { kind: 'not_found' }, { kind: 'bad_request' },
      { kind: 'rate_limited', retryAfterS: null },
      { kind: 'quota_exceeded', resetsIn: 60 },
      { kind: 'riot_busy', retryAfterS: 20 },
      { kind: 'server_error', network: false },
    ]
    for (const e of errs) expect(stateTone(e)).toBe('error')
  })
})

describe('stateMessage — textes FR normatifs §E', () => {
  it('reprend les libellés du contrat', () => {
    expect(stateMessage({ kind: 'not_in_game' })).toBe('Ce joueur n’est pas en partie actuellement.')
    expect(stateMessage({ kind: 'disabled' })).toBe('Le suivi de partie en direct arrive bientôt.')
    expect(stateMessage({ kind: 'not_found' })).toBe('Invocateur introuvable.')
    expect(stateMessage({ kind: 'bad_request' })).toBe('Requête invalide.')
    expect(stateMessage({ kind: 'rate_limited', retryAfterS: 20 })).toBe('Trop de recherches. Réessaie dans 20s.')
    expect(stateMessage({ kind: 'rate_limited', retryAfterS: null })).toBe('Trop de requêtes. Réessaie dans une minute.')
    expect(stateMessage({ kind: 'riot_busy', retryAfterS: 25 }))
      .toBe('Le service Riot est momentanément saturé. Réessaie dans 25 secondes.')
    expect(stateMessage({ kind: 'quota_exceeded', resetsIn: 10_800 }))
      .toBe('Service temporairement indisponible. Réessaie dans 3 h.')
    expect(stateMessage({ kind: 'server_error', network: true })).toBe('Erreur réseau, vérifie ta connexion.')
    expect(stateMessage({ kind: 'server_error', network: false })).toBe('Erreur serveur inattendue.')
  })
  it('le message brut de l’EF n’est jamais montré pour le kill-switch', () => {
    expect(stateMessage({ kind: 'disabled' })).not.toMatch(/désactiv/i)
  })
})

describe('cooldownFor — le délai serveur prime, jamais raccourci', () => {
  it('plancher = verrou local de 30 s', () => {
    expect(cooldownFor({ kind: 'not_in_game' })).toBe(REFRESH_COOLDOWN_S)
    expect(cooldownFor({ kind: 'riot_busy', retryAfterS: 5 })).toBe(REFRESH_COOLDOWN_S)
    expect(cooldownFor({ kind: 'rate_limited', retryAfterS: null })).toBe(REFRESH_COOLDOWN_S)
  })
  it('un retry_after_s plus long l’emporte', () => {
    expect(cooldownFor({ kind: 'riot_busy', retryAfterS: 90 })).toBe(90)
    expect(cooldownFor({ kind: 'rate_limited', retryAfterS: 45 })).toBe(45)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('fetchLiveGame — couche réseau', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

  const stubEnv = () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://x.supabase.co')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key')
  }

  /** Stub de fetch qui mémorise l'URL appelée (aucun cast de tuple à faire). */
  const stubFetch = (body: unknown, status = 200) => {
    const seen = { url: '', calls: 0 }
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      seen.url = url
      seen.calls++
      return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status })
    }))
    return seen
  }

  it('chemin canonique : envoie ?puuid, pas gameName/tagLine', async () => {
    stubEnv()
    const seen = stubFetch(okBody())

    const s = await fetchLiveGame({ platform: 'euw1', puuid: PUUID, gameName: 'Faker', tagLine: 'T1' })
    expect(s.kind).toBe('in_game')
    const url = new URL(seen.url)
    expect(url.searchParams.get('puuid')).toBe(PUUID)
    expect(url.searchParams.get('gameName')).toBeNull()
    expect(url.pathname).toBe('/functions/v1/riot-live-game')
  })

  it('chemin de confort : envoie gameName + tagLine quand puuid est absent', async () => {
    stubEnv()
    const seen = stubFetch({ in_game: false })

    const s = await fetchLiveGame({ platform: 'kr', puuid: null, gameName: 'Hide on bush', tagLine: 'KR1' })
    expect(s).toEqual({ kind: 'not_in_game' })
    const url = new URL(seen.url)
    expect(url.searchParams.get('gameName')).toBe('Hide on bush')
    expect(url.searchParams.get('tagLine')).toBe('KR1')
    expect(url.searchParams.get('platform')).toBe('kr')
    expect(url.searchParams.get('puuid')).toBeNull()
  })

  it('panne réseau → server_error{network:true}, jamais un throw', async () => {
    stubEnv()
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
    await expect(fetchLiveGame({ platform: 'euw1', puuid: PUUID, gameName: '', tagLine: '' }))
      .resolves.toEqual({ kind: 'server_error', network: true })
  })

  it('corps non-JSON sur une erreur → état dérivé du seul statut', async () => {
    stubEnv()
    stubFetch('<html>502</html>', 502)
    await expect(fetchLiveGame({ platform: 'euw1', puuid: PUUID, gameName: '', tagLine: '' }))
      .resolves.toEqual({ kind: 'server_error', network: false })
  })

  it('503 riot_busy traversé de bout en bout', async () => {
    stubEnv()
    stubFetch({ error: 'saturé', reason: 'riot_busy', retry_after_s: 27 }, 503)
    await expect(fetchLiveGame({ platform: 'euw1', puuid: PUUID, gameName: '', tagLine: '' }))
      .resolves.toEqual({ kind: 'riot_busy', retryAfterS: 27 })
  })

  it('env absente → server_error sans appel réseau', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '')
    const seen = stubFetch({ in_game: false })
    await expect(fetchLiveGame({ platform: 'euw1', puuid: PUUID, gameName: '', tagLine: '' }))
      .resolves.toEqual({ kind: 'server_error', network: false })
    expect(seen.calls).toBe(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Lot D4 — rangs
// ─────────────────────────────────────────────────────────────────────────────
const solo = (tier = 'GOLD', rank = 'II') => ({
  queueType: SOLO_QUEUE, tier, rank, lp: 42, wins: 60, losses: 40,
})
const flex = () => ({ queueType: FLEX_QUEUE, tier: 'SILVER', rank: 'I', lp: 10, wins: 5, losses: 5 })

describe('pickRankedEntry — Solo/Duo prioritaire, Flex en repli', () => {
  it('choisit Solo/Duo quand les deux existent', () => {
    expect(pickRankedEntry([flex(), solo()])?.queueType).toBe(SOLO_QUEUE)
  })
  it('retombe sur Flex si pas de Solo/Duo', () => {
    expect(pickRankedEntry([flex()])?.queueType).toBe(FLEX_QUEUE)
  })
  it('ignore les autres files (TFT, arena…)', () => {
    expect(pickRankedEntry([{ queueType: 'RANKED_TFT', tier: 'GOLD' }])).toBeNull()
  })
  it('liste vide / non-tableau / entrées cassées → null', () => {
    expect(pickRankedEntry([])).toBeNull()
    expect(pickRankedEntry(null)).toBeNull()
    expect(pickRankedEntry([null, { nope: 1 }])).toBeNull()
  })
})

describe('winratePct', () => {
  it('arrondit correctement', () => {
    expect(winratePct(60, 40)).toBe(60)
    expect(winratePct(1, 2)).toBe(33)
  })
  it('0 partie → 0, jamais NaN', () => {
    expect(winratePct(0, 0)).toBe(0)
    expect(Number.isNaN(winratePct(0, 0))).toBe(false)
  })
})

describe('mapRankResponse — 4 états distincts', () => {
  it('200 + entrée classée → ranked avec winrate et games', () => {
    const r = mapRankResponse(200, { puuid: PUUID, entries: [solo()] })
    expect(r.status).toBe('ranked')
    if (r.status !== 'ranked') throw new Error('unreachable')
    expect(r.entry.tier).toBe('GOLD')
    expect(r.winrate).toBe(60)
    expect(r.games).toBe(100)
  })
  it('200 sans entrée → unranked (réponse VALIDE, pas un échec)', () => {
    expect(mapRankResponse(200, { puuid: PUUID, entries: [] })).toEqual({ status: 'unranked' })
  })
  it('429 / 503 / 500 → unavailable', () => {
    for (const s of [429, 503, 500, 404]) {
      expect(mapRankResponse(s, { error: 'x' })).toEqual({ status: 'unavailable' })
    }
  })
  it('le chemin ?puuid= ne fournit PAS profileIconId — on ne le suppose jamais', () => {
    // Asymétrie de contrat documentée : seul `entries` est garanti ici.
    const r = mapRankResponse(200, { puuid: PUUID, entries: [solo()] })
    expect(r.status).toBe('ranked')
  })
})

describe('fetchParticipantRanks — dégradation PAR JOUEUR (STOP D4)', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

  const P = (n: number, bot = false) => ({ puuid: `puuid-${n}`.padEnd(78, 'x'), bot })
  const TEN = Array.from({ length: 10 }, (_, i) => P(i))

  const stubEnv = () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://x.supabase.co')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key')
  }

  /** `failFor` : liste d'index dont l'appel échoue (rejet réseau ou statut). */
  const stubRanks = (failFor: number[] = [], mode: 'reject' | 'status' = 'reject', status = 503) => {
    const seen = { urls: [] as string[] }
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      seen.urls.push(url)
      const idx = TEN.findIndex(p => url.includes(encodeURIComponent(p.puuid)))
      if (failFor.includes(idx)) {
        if (mode === 'reject') throw new TypeError('network down')
        return new Response(JSON.stringify({ error: 'x' }), { status })
      }
      return new Response(JSON.stringify({ puuid: 'p', entries: [solo()] }), { status: 200 })
    }))
    return seen
  }

  it('10 joueurs classés → 10 appels, 10 rangs', async () => {
    stubEnv(); const seen = stubRanks()
    const res = await fetchParticipantRanks(TEN, 'euw1')
    expect(seen.urls).toHaveLength(10)
    expect(res.callsIssued).toBe(10)
    expect(Object.values(res.ranks).every(r => r.status === 'ranked')).toBe(true)
  })

  it('UN rejet ne vide PAS la grille — 9 rangs survivent', async () => {
    // C'est exactement ce que `Promise.all` casserait : un seul rejet ferait
    // échouer la promesse entière et laisserait les 10 lignes sans rang.
    stubEnv(); stubRanks([3], 'reject')
    const res = await fetchParticipantRanks(TEN, 'euw1')
    const vals = Object.values(res.ranks)
    expect(vals.filter(r => r.status === 'ranked')).toHaveLength(9)
    expect(res.ranks[TEN[3].puuid]).toEqual({ status: 'unavailable' })
  })

  it('plusieurs échecs mêlés à des succès : chacun isolé', async () => {
    stubEnv(); stubRanks([0, 4, 9], 'status', 429)
    const res = await fetchParticipantRanks(TEN, 'euw1')
    expect(Object.values(res.ranks).filter(r => r.status === 'ranked')).toHaveLength(7)
    expect(Object.values(res.ranks).filter(r => r.status === 'unavailable')).toHaveLength(3)
  })

  it('TOUS en échec → 10 « unavailable », toujours pas de throw', async () => {
    stubEnv(); stubRanks([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], 'reject')
    const res = await fetchParticipantRanks(TEN, 'euw1')
    expect(Object.values(res.ranks).every(r => r.status === 'unavailable')).toBe(true)
  })

  it('les bots sont exclus AVANT tout appel (aucun jeton gaspillé)', async () => {
    stubEnv()
    const withBots = [...TEN.slice(0, 8), P(8, true), P(9, true)]
    const seen = stubRanks()
    const res = await fetchParticipantRanks(withBots, 'euw1')
    expect(seen.urls).toHaveLength(8)     // 10 participants, 8 appels
    expect(res.callsIssued).toBe(8)
    expect(res.ranks[withBots[8].puuid]).toEqual({ status: 'bot' })
  })

  it('envoie bien ?puuid= et ?platform=', async () => {
    stubEnv(); const seen = stubRanks()
    await fetchParticipantRanks([P(0)], 'kr')
    const u = new URL(seen.urls[0])
    expect(u.pathname).toBe('/functions/v1/riot-rank')
    expect(u.searchParams.get('platform')).toBe('kr')
    expect(u.searchParams.get('puuid')).toBe(P(0).puuid)
  })

  it('remonte le plus grand retry_after_s des 429 (pour prolonger le verrou)', async () => {
    stubEnv()
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const idx = TEN.findIndex(p => url.includes(encodeURIComponent(p.puuid)))
      if (idx === 2) return new Response(JSON.stringify({ retry_after_s: 20 }), { status: 429 })
      if (idx === 5) return new Response(JSON.stringify({ retry_after_s: 47 }), { status: 429 })
      return new Response(JSON.stringify({ entries: [solo()] }), { status: 200 })
    }))
    const res = await fetchParticipantRanks(TEN, 'euw1')
    expect(res.retryAfterS).toBe(47)
  })

  it('aucun 429 → retryAfterS null (le verrou de 30 s suffit)', async () => {
    stubEnv(); stubRanks()
    expect((await fetchParticipantRanks(TEN, 'euw1')).retryAfterS).toBeNull()
  })

  it('env absente → tout « unavailable », zéro appel', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '')
    const seen = stubRanks()
    const res = await fetchParticipantRanks(TEN, 'euw1')
    expect(seen.urls).toHaveLength(0)
    expect(res.callsIssued).toBe(0)
    expect(Object.values(res.ranks).every(r => r.status === 'unavailable')).toBe(true)
  })

  it('le coût annoncé borne bien une partie pleine', async () => {
    stubEnv(); stubRanks()
    const res = await fetchParticipantRanks(TEN, 'euw1')
    // 10 riot-rank + 1 riot-live-game = 11 jetons, sur DEUX buckets distincts
    // (isRateLimited est indexé par function_name).
    expect(res.callsIssued).toBeLessThanOrEqual(MAX_RANK_CALLS_PER_LOAD)
  })
})
