// Edge Function : composition de la partie en cours d'un joueur (spectator-v5).
// Accès public — la clé Riot reste côté serveur. Gardée par le feature flag
// `live_game_enabled` (app_settings, kill-switch, cf. migration
// 20260728000001_riot_live_game_socle.sql — Lot A, déjà livré).
//
// Appel :
//   GET /functions/v1/riot-live-game?puuid=<puuid>&platform=euw1        (canonique)
//   GET /functions/v1/riot-live-game?gameName=X&tagLine=Y&platform=euw1 (confort)
// Headers : apikey: <SUPABASE_ANON_KEY>
//
// Réponse :
//   - En partie     → 200 { in_game: true, game: {...}, participants: [...], requested_puuid, ranks: null }
//   - Pas en partie  → 200 { in_game: false, requested_puuid }   ← état NOMINAL, jamais un 404 (décision 1)
//   - Riot ID inconnu (account-v1) → 404 { error: 'Invocateur introuvable.' }
import { handleCors, jsonResponse }         from '../_shared/cors.ts'
import { requireSecret }                    from '../_shared/auth.ts'
import { isFeatureEnabled }                  from '../_shared/feature-flags.ts'
import { cacheGet, cacheSet, cacheGetStale, cacheGetNegative, cacheSetNegative } from '../_shared/cache.ts'
import { isRateLimited }                     from '../_shared/rate-limit.ts'
import { checkIpRateLimit, riotCacheBackend } from '../_shared/ip-rate-limit.ts'
import { isCircuitOpen, incrementQuota, secondsUntilMidnightUtc } from '../_shared/circuit-breaker.ts'

const FN = 'riot-live-game'

const ROUTING: Record<string, string> = {
  euw1: 'europe', eun1: 'europe', tr1: 'europe', ru: 'europe',
  na1: 'americas', br1: 'americas', la1: 'americas', la2: 'americas', oc1: 'americas',
  kr: 'asia', jp1: 'asia',
}

// Vrai PUUID Riot ≈ 78 caractères URL-safe ([A-Za-z0-9_-]), JAMAIS un UUID v4
// (le format "8-4-4-4-12" à 36 caractères est le GUID ANONYMISÉ du LCU, invalide
// côté API Riot). Regex EXACTE de riot-matches — piège déjà coûteux, ne pas
// réintroduire un pattern UUID ici. Charset borné = anti path-injection ; le
// puuid est en plus encodeURIComponent'd avant tout appel Riot.
const PUUID_RE = /^[A-Za-z0-9_-]{70,128}$/

/** Retire les caractères Unicode invisibles (zero-width, marques bidi, BOM). */
function sanitize(s: string): string {
  return s.replace(/[​-‏‪-‮⁠-⁯﻿]/g, '').trim()
}

// ── TTL (décision 2, chiffres actés) ─────────────────────────────────────────
// "Pas en partie" est l'état le plus volatil (un joueur peut lancer une partie
// à tout moment) : 30s évite qu'une IP unique brûle le circuit breaker journalier
// (1000 appels) en ~50 min tout en restant réactif pendant la phase de lane.
const TTL_NOT_IN_GAME_MS = 30 * 1000
// "En partie" : la donnée spectator est immuable une fois la game lancée → TTL
// large (5 min, décision produit D3), pas besoin de la re-fetch en continu.
const TTL_IN_GAME_MS = 5 * 60 * 1000
// Exception : écran de chargement (gameStartTime === 0, minuteur pas encore
// démarré) — les données peuvent encore changer (dodge, etc.) → même TTL court
// que "pas en partie".
const TTL_LOADING_MS = 30 * 1000

type BannedChampion = { champion_id: number; team_id: number; pick_turn: number }
type Perks = { perk_ids: number[]; perk_style: number; perk_sub_style: number }
type Participant = {
  puuid: string; riot_id: string; team_id: number; champion_id: number
  spell1_id: number; spell2_id: number; profile_icon_id: number
  perks: Perks; bot: boolean
}
// Corps STRICTEMENT centré partie — jamais de `requested_puuid` ici (règle
// absolue, décision 3) : ce même objet est écrit sous 10 clés puuid différentes
// (une par participant), donc il ne doit rien contenir qui varie selon le
// destinataire. `requested_puuid` est ajouté À LA RÉPONSE, après lecture du
// cache, jamais au corps stocké.
type GameBody = {
  in_game: true
  game: {
    game_id: number; platform_id: string; queue_id: number; map_id: number
    game_mode: string; game_type: string; game_start_time: number; game_length_s: number
    banned_champions: BannedChampion[]
  }
  participants: Participant[]
  // Emplacement réservé pour l'enrichissement serveur futur (winrate par champion,
  // Scope Raisonnable) — toujours `null` en V1, présent pour que les clients
  // n'aient jamais à être redéployés le jour où le serveur le remplit (même
  // motif que `role?` optionnel de matchup-analyze : rétrocompatible par
  // construction).
  ranks: null
}
type NotInGameBody = { in_game: false }

const puuidKey = (platform: string, puuid: string) => `live:${platform}:puuid:${puuid}`
const gameKey  = (platform: string, gameId: number) => `live:${platform}:game:${gameId}`
// Clé confort — dédiée au chemin Riot ID. Distincte des clés puuid ci-dessus :
// elle permet un HIT total (0 appel Riot, même pas account-v1) sur une requête
// gameName/tagLine répétée, exactement comme riot-rank/riot-matches indexent
// leur cache par identité "nom" plutôt que par puuid pour éviter toute
// résolution avant même de savoir si le cache est chaud. Contrairement aux
// clés puuid/game (strictement GameBody), cette entrée est PRIVÉE à une seule
// identité (1 Riot ID = 1 puuid stable) : y stocker le puuid résolu ne viole
// pas la règle absolue ci-dessus, qui ne concerne que le corps PARTAGÉ entre
// les 10 participants.
const nameKey = (platform: string, gameName: string, tagLine: string) =>
  `live:${platform}:name:${gameName.toLowerCase()}:${tagLine.toLowerCase()}`

// deno-lint-ignore no-explicit-any
function mapGameBody(raw: any): GameBody {
  return {
    in_game: true,
    game: {
      game_id:         raw.gameId,
      platform_id:     raw.platformId,
      queue_id:        raw.gameQueueConfigId ?? 0,
      map_id:          raw.mapId,
      game_mode:       raw.gameMode,
      game_type:       raw.gameType,
      game_start_time: raw.gameStartTime ?? 0,
      game_length_s:   raw.gameLength ?? 0,
      // deno-lint-ignore no-explicit-any
      banned_champions: (raw.bannedChampions ?? []).map((b: any) => ({
        champion_id: b.championId,
        team_id:     b.teamId,
        pick_turn:   b.pickTurn,
      })),
    },
    // deno-lint-ignore no-explicit-any
    participants: (raw.participants ?? []).map((p: any) => ({
      puuid:            p.puuid,
      riot_id:          p.riotId ?? '',
      team_id:          p.teamId,
      champion_id:      p.championId,
      spell1_id:        p.spell1Id,
      spell2_id:        p.spell2Id,
      profile_icon_id:  p.profileIconId,
      perks: {
        perk_ids:       p.perks?.perkIds ?? [],
        perk_style:     p.perks?.perkStyle ?? 0,
        perk_sub_style: p.perks?.perkSubStyle ?? 0,
      },
      bot: p.bot ?? false,
    })),
    ranks: null,
  }
}

Deno.serve(async (req) => {
  const cors = handleCors(req)
  if (cors) return cors

  try {
    // 2. Feature flag — vérifié EN PREMIER (avant même de parser les params),
    // même motif que shop-purchase : économiser tout travail quand la
    // fonctionnalité est désactivée. isFeatureEnabled est fail-closed.
    const enabled = await isFeatureEnabled('live_game_enabled')
    if (!enabled) {
      return jsonResponse({ error: 'La fonctionnalité "partie en cours" est actuellement désactivée.' }, 403)
    }

    const url         = new URL(req.url)
    const puuidParam  = url.searchParams.get('puuid')
    const gameNameRaw = url.searchParams.get('gameName')
    const tagLineRaw  = url.searchParams.get('tagLine')
    const platform    = url.searchParams.get('platform') ?? 'euw1'

    // 3. Validation
    if (!puuidParam && (!gameNameRaw || !tagLineRaw)) {
      return jsonResponse({ error: 'puuid OU (gameName + tagLine) requis.' }, 400)
    }
    // Anti-SSRF via injection de hostname
    if (!Object.hasOwn(ROUTING, platform)) {
      return jsonResponse({ error: 'Région invalide.' }, 400)
    }
    if (puuidParam && !PUUID_RE.test(puuidParam)) {
      return jsonResponse({ error: 'Format PUUID invalide.' }, 400)
    }

    // 4. Rate limit atomique (20/min/IP, fenêtre fixe) — vraie barrière anti-rafale.
    if (await isRateLimited(req, FN)) {
      return jsonResponse({ error: 'Trop de requêtes. Réessaie dans une minute.' }, 429)
    }

    // 5. Rate limit IP glissant (anti-scraping soutenu). `riotCacheBackend()`
    // SANS argument = bucket `function_name = 'public-search'` PARTAGÉ avec
    // riot-matches. La clé réelle du compteur (`rate:ip:{ip}`) est construite
    // EN DUR dans checkIpRateLimit — passer un `fn` différent ici ne changerait
    // QUE la colonne `function_name` (observabilité), jamais le bucket compté.
    // Croire le contraire rejouerait le bug documenté de la migration
    // 20260719000001 (limiteurs IP détournant riot_cache comme KV).
    // `limit: 30` = MÊME seuil que riot-matches. Indispensable : le compteur
    // étant partagé, un seuil plus bas ici (le défaut IP_RATE_LIMIT = 10)
    // bloquerait le live game dès la 10ᵉ action alors qu'il resterait 20
    // recherches disponibles — deux verdicts contradictoires sur un seul
    // compteur. Sémantique voulue : « 30 actions Riot coûteuses / IP / h »,
    // toutes pages confondues.
    const ipRl = await checkIpRateLimit(req, riotCacheBackend(), { limit: 30 })
    if (!ipRl.allowed) {
      return jsonResponse(
        { error: 'Trop de recherches. Réessaie plus tard.', retry_after_s: ipRl.retryAfterS },
        429,
        { 'Retry-After': String(ipRl.retryAfterS) },
      )
    }

    // Clé de cache utilisée pour CETTE requête : puuid (canonique, mutualisée)
    // ou nom (confort, dédiée). Le HIT ne coûte AUCUN appel Riot dans les deux cas.
    const identKey = puuidParam
      ? puuidKey(platform, sanitize(puuidParam))
      : nameKey(platform, sanitize(gameNameRaw!), sanitize(tagLineRaw!))

    // 6. Cache read (fresh)
    const cached = await cacheGet(identKey)
    if (cached !== null) {
      if (puuidParam) {
        // Clé puuid : corps déjà strictement centré partie (ou {in_game:false}).
        return jsonResponse({ ...(cached as object), requested_puuid: sanitize(puuidParam) }, 200, { 'X-Cache': 'HIT' })
      }
      // Clé nom : le puuid résolu est empaqueté dans l'entrée (privée à cette
      // identité) — on le retire du corps pour ne renvoyer que le contrat public.
      const { puuid: cachedPuuid, ...rest } = cached as Record<string, unknown> & { puuid: string }
      return jsonResponse({ ...rest, requested_puuid: cachedPuuid }, 200, { 'X-Cache': 'HIT' })
    }

    // 7. 404 mémorisé — Riot ID inexistant (account-v1 uniquement, chemin nom).
    // Il n'existe pas d'équivalent côté chemin puuid : spectator-v5 ne
    // distingue jamais "puuid inconnu" de "pas en partie" (voir plus bas).
    const neg = await cacheGetNegative(identKey)
    if (neg !== null) {
      return jsonResponse(neg.body, neg.status, { 'X-Cache': 'HIT-NEG' })
    }

    // 8. Circuit breaker
    if (await isCircuitOpen()) {
      const stale = await cacheGetStale(identKey)
      if (stale !== null) {
        if (puuidParam) {
          return jsonResponse({ ...(stale as object), requested_puuid: sanitize(puuidParam) }, 200, { 'X-Cache': 'STALE' })
        }
        const { puuid: stalePuuid, ...rest } = stale as Record<string, unknown> & { puuid: string }
        return jsonResponse({ ...rest, requested_puuid: stalePuuid }, 200, { 'X-Cache': 'STALE' })
      }
      return jsonResponse(
        { error: 'Service temporairement indisponible.', reason: 'quota_exceeded', resets_in: secondsUntilMidnightUtc() },
        503,
      )
    }

    const apiKey  = requireSecret('RIOT_API_KEY')
    const headers = { 'X-Riot-Token': apiKey }

    // 9. Appels Riot — compteur RÉEL (1 sur le chemin puuid, 2 sur le chemin
    // Riot ID), jamais un forfait (RIOT_CALLS de circuit-breaker.ts n'a PAS
    // d'entrée pour cette fonction, exactement comme riot-matches).
    let riotCalls = 0

    let puuid: string
    if (puuidParam) {
      puuid = sanitize(puuidParam)
    } else {
      const gameName = sanitize(gameNameRaw!)
      const tagLine  = sanitize(tagLineRaw!)
      const routing  = ROUTING[platform]
      const acctRes  = await fetch(
        `https://${routing}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`,
        { headers },
      )
      riotCalls++
      if (!acctRes.ok) {
        await incrementQuota(FN, riotCalls)
        if (acctRes.status === 404) {
          const body = { error: 'Invocateur introuvable.' }
          await cacheSetNegative(identKey, FN, 404, body)
          return jsonResponse(body, 404)
        }
        return jsonResponse({ error: `Riot API ${acctRes.status}` }, acctRes.status)
      }
      const acct = await acctRes.json()
      puuid = acct.puuid
    }

    // Spectator-v5 — endpoint PLATEFORME (pas régional comme account-v1).
    // ⚠️ Piège : le segment s'appelle "by-summoner" mais prend en réalité un
    // PUUID (pas un summonerId) — nom hérité d'une version antérieure de l'API,
    // ne pas se laisser tromper par le libellé du chemin.
    const specRes = await fetch(
      `https://${platform}.api.riotgames.com/lol/spectator/v5/active-games/by-summoner/${encodeURIComponent(puuid)}`,
      { headers },
    )
    riotCalls++

    // Spectator-v5 renvoie 404 aussi bien pour "puuid inconnu" que pour "pas en
    // partie" — Riot ne distingue pas les deux. C'est SANS IMPORTANCE ici : côté
    // chemin puuid, on n'a de toute façon jamais validé son existence auprès de
    // Riot ; côté chemin nom, l'existence a déjà été confirmée par account-v1
    // juste au-dessus. Donc TOUT 404 de spectator-v5, à ce stade, signifie
    // "pas en partie" — décision 1 : état NOMINAL, jamais un 404 client, 200 porteur.
    if (specRes.status === 404) {
      await incrementQuota(FN, riotCalls)
      const body: NotInGameBody = { in_game: false }
      const ttlIso = new Date(Date.now() + TTL_NOT_IN_GAME_MS).toISOString()
      // Pas de mutualisation possible : "pas en partie" ne révèle aucun autre
      // participant, on écrit uniquement la/les clé(s) de CETTE identité.
      await cacheSet(puuidKey(platform, puuid), FN, body, ttlIso)
      if (!puuidParam) {
        await cacheSet(identKey, FN, { puuid, ...body }, ttlIso)
      }
      return jsonResponse({ ...body, requested_puuid: puuid }, 200, { 'X-Cache': 'MISS' })
    }

    if (!specRes.ok) {
      // 403 (clé expirée) / 429 / 5xx : transitoire, jamais mémorisé (positif ni négatif).
      await incrementQuota(FN, riotCalls)
      return jsonResponse({ error: `Riot API ${specRes.status}` }, specRes.status)
    }

    const raw      = await specRes.json()
    const gameBody = mapGameBody(raw)
    const loading  = gameBody.game.game_start_time === 0
    const ttlIso   = new Date(Date.now() + (loading ? TTL_LOADING_MS : TTL_IN_GAME_MS)).toISOString()

    // Mutualisation (décision 3) : UN appel Riot couvre les 10 joueurs de la
    // partie. Le MÊME corps `gameBody` (strictement centré partie, sans
    // `requested_puuid`) est écrit sous les 10 clés puuid + une clé game
    // (observabilité). N'importe lequel des 10 joueurs qui interroge ensuite
    // cette EF obtient un HIT gratuit, quel que soit celui qui a déclenché le MISS.
    await Promise.all([
      ...gameBody.participants.map((p) => cacheSet(puuidKey(platform, p.puuid), FN, gameBody, ttlIso)),
      cacheSet(gameKey(platform, gameBody.game.game_id), FN, gameBody, ttlIso),
    ])
    // Chemin nom uniquement : mémorise aussi sous la clé confort pour qu'une
    // requête gameName/tagLine répétée soit un HIT total (0 appel Riot, même
    // pas account-v1) tant que la partie est en cours.
    if (!puuidParam) {
      await cacheSet(identKey, FN, { puuid, ...gameBody }, ttlIso)
    }

    await incrementQuota(FN, riotCalls)
    return jsonResponse({ ...gameBody, requested_puuid: puuid }, 200, { 'X-Cache': 'MISS' })
  } catch (e) {
    console.error('riot-live-game: unhandled exception', e instanceof Error ? e.message : String(e))
    return jsonResponse({ error: 'Erreur serveur inattendue.' }, 500)
  }
})
