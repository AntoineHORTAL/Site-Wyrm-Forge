// Edge Function : rang Solo/Duo + Flex d'un joueur via league-v4.
// Accès public — la clé Riot reste côté serveur.
//
// Appel (chemin historique, Riot ID) : GET /functions/v1/riot-rank?gameName=X&tagLine=Y&platform=euw1
// Appel (chemin C3, puuid)           : GET /functions/v1/riot-rank?puuid=X&platform=euw1
// Headers : apikey: <SUPABASE_ANON_KEY>
//
// Réponse (chemin Riot ID) : { puuid, summonerId, profileIconId, summonerLevel, entries: [...] }
// Réponse (chemin puuid)   : { puuid, entries: [...] } — ⚠️ ASYMÉTRIE VOLONTAIRE : PAS de
//   summonerId/profileIconId/summonerLevel sur ce chemin. Le front ne doit JAMAIS supposer
//   ces champs présents quand l'appel a été fait par puuid (voir §Lot C3 plus bas). Sans
//   incidence connue : le seul consommateur prévu (live game) obtient déjà profileIconId
//   via spectator-v5.
//
// ─────────────────────────────────────────────────────────────────────────────
// ⚠️ COUPLAGE CACHÉ AVEC `_shared/harvest-rank-stats.ts` — LIS CECI AVANT DE TOUCHER
// AUX CLÉS DE CACHE CI-DESSOUS.
//
// `harvestRankStats` (appelé depuis riot-matches) reconstruit LITTÉRALEMENT la clé
// de cache écrite ici pour lire le tier du joueur SANS appel Riot supplémentaire :
//   rank:${platform}:${gameName.toLowerCase()}:${tagLine.toLowerCase()}
// Aucune constante partagée, aucun test — si cette clé cesse de correspondre,
// `rank_stat_samples` cesse silencieusement de se remplir (aucune erreur visible,
// juste une dégradation muette de la Vue B de /summoner sous le seuil de 50 samples).
//
// Stratégie retenue (Lot C, dual-write / dual-read) pour introduire un pivot par
// puuid SANS casser ce couplage :
//   - C1 (ici, chemin Riot ID) : on écrit DEUX clés avec le MÊME corps —
//     la clé historique `rank:{platform}:{gn}:{tl}` (INCHANGÉE au caractère près,
//     c'est elle que harvestRankStats reconstruit) ET une nouvelle clé
//     `rank:{platform}:puuid:{puuid}`. Purement additif, zéro appel Riot de plus.
//   - C2 (dans harvest-rank-stats.ts) : lecture de la clé puuid EN PREMIER, avec
//     repli sur la clé historique si absente — sûr par construction car les deux
//     formes de corps exposent `entries[].queueType`/`.tier`.
//   - C3 (chemin `?puuid=`, ci-dessous) : lit/écrit UNIQUEMENT la clé puuid.
//     Sur ce chemin le Riot ID (gameName/tagLine) est INCONNU par construction —
//     ne JAMAIS deviner ni écrire la clé historique ici, ça produirait une entrée
//     avec un contenu potentiellement incohérent sous une clé que harvestRankStats
//     pourrait relire à tort pour un autre appelant.
// ─────────────────────────────────────────────────────────────────────────────
import { handleCors, jsonResponse } from '../_shared/cors.ts'
import { requireSecret } from '../_shared/auth.ts'
import { cacheGet, cacheSet, cacheGetStale, cacheGetNegative, cacheSetNegative } from '../_shared/cache.ts'
import { isRateLimited } from '../_shared/rate-limit.ts'
import { isCircuitOpen, incrementQuota, secondsUntilMidnightUtc } from '../_shared/circuit-breaker.ts'
import { isFeatureEnabled } from '../_shared/feature-flags.ts'

const FN = 'riot-rank'

const ROUTING: Record<string, string> = {
  euw1: 'europe', eun1: 'europe', tr1: 'europe', ru: 'europe',
  na1: 'americas', br1: 'americas', la1: 'americas', la2: 'americas', oc1: 'americas',
  kr: 'asia', jp1: 'asia',
}

// Même regex EXACTE que riot-matches (`PUUID_RE`) — un vrai PUUID Riot fait 78
// caractères, charset [A-Za-z0-9_-]. Piège documenté (AGENTS.md) : NE PAS valider
// un UUID v4 (36 car., format 8-4-4-4-12) — c'est le GUID anonymisé du LCU, pas
// un vrai PUUID Riot.
const PUUID_RE = /^[A-Za-z0-9_-]{70,128}$/

function sanitize(s: string): string {
  return s.replace(/[​-‏‪-‮⁠-⁯﻿]/g, '').trim()
}

// deno-lint-ignore no-explicit-any
function mapEntries(rawEntries: any[]): any[] {
  // deno-lint-ignore no-explicit-any
  return rawEntries.map((e: any) => ({
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
}

// C3 — résolution des entrées de rang à partir d'un puuid.
//
// UN SEUL appel Riot : `league-v4/entries/by-puuid`, vérifié en conditions réelles
// le 2026-07-28 (200 + vraies entrées de rang).
//
// L'implémentation initiale passait par summoner-v4 by-puuid → league-v4
// `by-summoner`, faute de doc confirmant la variante by-puuid. Ce couple s'est
// révélé MORT en production (403) : voir le bandeau « PANNE RÉSOLUE » d'AGENTS.md.
// Ne pas y revenir.
//
// profileIconId/summonerLevel ne sont volontairement PAS exposés ici (asymétrie de
// contrat documentée en tête de fichier) : ils viennent de summoner-v4, que ce
// chemin n'appelle plus du tout.
async function fetchRankEntriesByPuuid(
  platform: string,
  puuid: string,
  headers: Record<string, string>,
): Promise<
  | { ok: true; entries: unknown[]; callsUsed: number }
  | { ok: false; status: number; callsUsed: number }
> {
  // UN SEUL appel : league-v4 `entries/by-puuid`.
  // L'ancien couple summoner-v4 by-puuid → league-v4 `by-summoner` est MORT en
  // production (constaté le 2026-07-28) : summoner-v4 répond 200, mais league-v4
  // `by-summoner` renvoie 403 — Riot a retiré les variantes par summonerId.
  // Diagnostic établi par le delta de `riot_daily_quota.calls_by_function` :
  // +3 sur le chemin Riot ID et +2 sur le chemin puuid, donc l'échec est bien au
  // dernier appel de chaque chaîne, pas au premier.
  const leagueRes = await fetch(
    `https://${platform}.api.riotgames.com/lol/league/v4/entries/by-puuid/${encodeURIComponent(puuid)}`,
    { headers },
  )
  if (!leagueRes.ok) return { ok: false, status: leagueRes.status, callsUsed: 1 }
  // deno-lint-ignore no-explicit-any
  const rawEntries: any[] = await leagueRes.json()
  return { ok: true, entries: mapEntries(rawEntries), callsUsed: 1 }
}

Deno.serve(async (req) => {
  const cors = handleCors(req)
  if (cors) return cors

  try {
    // Kill switch `riot_history_enabled` — même flag que riot-matches et
    // riot-match-detail. Vérifié avant tout parsing et tout appel Riot.
    // isFeatureEnabled est fail-closed : une erreur DB retourne false.
    const enabled = await isFeatureEnabled('riot_history_enabled')
    if (!enabled) {
      return jsonResponse({ error: 'L\'historique de parties est actuellement désactivé.' }, 403)
    }

    const url        = new URL(req.url)
    const puuidRaw    = url.searchParams.get('puuid')
    const gameNameRaw = url.searchParams.get('gameName')
    const tagLineRaw  = url.searchParams.get('tagLine')
    const platform    = url.searchParams.get('platform') ?? 'euw1'

    // Validate platform against known list to prevent SSRF via hostname injection
    // (partagé par les deux chemins, avant tout branchement)
    if (!Object.hasOwn(ROUTING, platform)) {
      return jsonResponse({ error: 'Région invalide.' }, 400)
    }

    // ── C3 : chemin par puuid ────────────────────────────────────────────────
    // Prioritaire si `puuid` est fourni (le WPF live game n'a pas de Riot ID sous
    // la main, seulement le puuid résolu par ailleurs). Rien à voir avec le
    // chemin gameName/tagLine ci-dessous : clé de cache dédiée, jamais la clé
    // historique (voir bandeau de couplage en tête de fichier).
    if (puuidRaw) {
      if (!PUUID_RE.test(puuidRaw)) {
        return jsonResponse({ error: 'Format PUUID invalide.' }, 400)
      }

      if (await isRateLimited(req, FN)) {
        return jsonResponse({ error: 'Trop de requêtes. Réessaie dans une minute.' }, 429)
      }

      const puuidCacheKey = `rank:${platform}:puuid:${puuidRaw}`

      const cached = await cacheGet(puuidCacheKey)
      if (cached !== null) {
        return jsonResponse(cached, 200, { 'X-Cache': 'HIT' })
      }

      const neg = await cacheGetNegative(puuidCacheKey)
      if (neg !== null) {
        return jsonResponse(neg.body, neg.status, { 'X-Cache': 'HIT-NEG' })
      }

      if (await isCircuitOpen()) {
        const stale = await cacheGetStale(puuidCacheKey)
        if (stale !== null) {
          return jsonResponse(stale, 200, { 'X-Cache': 'STALE' })
        }
        return jsonResponse(
          { error: 'Service temporairement indisponible.', reason: 'quota_exceeded', resets_in: secondsUntilMidnightUtc() },
          503,
        )
      }

      const apiKey  = requireSecret('RIOT_API_KEY')
      const headers = { 'X-Riot-Token': apiKey }

      const resolved = await fetchRankEntriesByPuuid(platform, puuidRaw, headers)
      if (!resolved.ok) {
        await incrementQuota(FN, resolved.callsUsed)
        const body = resolved.status === 404
          ? { error: 'Invocateur introuvable.' }
          : { error: `Riot API ${resolved.status}` }
        // Négatif écrit SOUS LA CLÉ PUUID uniquement — jamais la clé historique,
        // le Riot ID est inconnu sur ce chemin.
        if (resolved.status === 404) await cacheSetNegative(puuidCacheKey, FN, 404, body)
        return jsonResponse(body, resolved.status)
      }

      // Réponse volontairement dépourvue de summonerId/profileIconId/summonerLevel
      // (asymétrie de contrat documentée en tête de fichier).
      const puuidResult = { puuid: puuidRaw, entries: resolved.entries }
      await cacheSet(puuidCacheKey, FN, puuidResult)
      await incrementQuota(FN, resolved.callsUsed)

      return jsonResponse(puuidResult, 200, { 'X-Cache': 'MISS' })
    }

    // ── Chemin historique : Riot ID (gameName/tagLine) ──────────────────────
    if (!gameNameRaw || !tagLineRaw) {
      return jsonResponse({ error: 'gameName et tagLine requis.' }, 400)
    }

    const gameName = sanitize(gameNameRaw)
    const tagLine  = sanitize(tagLineRaw)

    // Rate limiting
    if (await isRateLimited(req, FN)) {
      return jsonResponse({ error: 'Trop de requêtes. Réessaie dans une minute.' }, 429)
    }

    // ⚠️ Clé INCHANGÉE au caractère près — c'est celle que harvestRankStats
    // reconstruit littéralement. Ne JAMAIS la renommer/reformater sans mettre à
    // jour harvest-rank-stats.ts EN MÊME TEMPS (voir bandeau en tête de fichier).
    const cacheKey = `rank:${platform}:${gameName.toLowerCase()}:${tagLine.toLowerCase()}`

    // Cache read (fresh)
    const cached = await cacheGet(cacheKey)
    if (cached !== null) {
      return jsonResponse(cached, 200, { 'X-Cache': 'HIT' })
    }

    // 404 mémorisé (R1) — Riot ID inexistant : rejeu gratuit, aucun appel Riot
    const neg = await cacheGetNegative(cacheKey)
    if (neg !== null) {
      return jsonResponse(neg.body, neg.status, { 'X-Cache': 'HIT-NEG' })
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

    // R1 : les 3 appels sont SÉQUENTIELS → on ne compte que ceux réellement
    // consommés au moment de l'échec (1, 2 ou 3), jamais un forfait.
    let riotCalls = 0

    // Échec après consommation d'appels Riot : on compte, et on mémorise les 404
    // (déterministes). 403/429/5xx sont transitoires → jamais mémorisés.
    const failed = async (status: number, body: unknown): Promise<Response> => {
      await incrementQuota(FN, riotCalls)
      if (status === 404) await cacheSetNegative(cacheKey, FN, 404, body)
      return jsonResponse(body, status)
    }

    // 1. PUUID via account-v1
    const acctRes = await fetch(
      `https://${routing}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`,
      { headers },
    )
    riotCalls++
    if (!acctRes.ok) {
      if (acctRes.status === 404) return await failed(404, { error: 'Invocateur introuvable.' })
      return await failed(acctRes.status, { error: `Riot API ${acctRes.status}` })
    }
    const { puuid } = await acctRes.json()

    // 2. SummonerId via summoner-v4
    const sumRes = await fetch(
      `https://${platform}.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${encodeURIComponent(puuid)}`,
      { headers },
    )
    riotCalls++
    if (!sumRes.ok) {
      return await failed(sumRes.status, { error: `Riot API ${sumRes.status}` })
    }
    const sum = await sumRes.json()
    const summonerId: string    = sum.id              ?? ''
    const profileIconId: number = sum.profileIconId   ?? 29
    const summonerLevel: number = sum.summonerLevel   ?? 1

    // 3. Entries league-v4 — variante `by-puuid`.
    // ⚠️ CORRECTIF DE PANNE (2026-07-28) : cet appel utilisait
    // `entries/by-summoner/{summonerId}`, que Riot a retiré — il renvoyait 403,
    // donc riot-rank échouait à TOUS les coups. Aucun 403 n'étant mémorisé
    // (cache négatif réservé aux 404), chaque consultation repartait en appel
    // Riot : le quota journalier de 1000 a été brûlé intégralement les 24 et 25
    // juillet (978 appels riot-rank le 25), ouvrant le circuit breaker et
    // mettant tout le site en 503. Effet collatéral : la clé de cache `rank:`
    // n'étant jamais écrite, `harvestRankStats` sortait immédiatement et
    // `rank_stat_samples` est resté vide (0 ligne) depuis l'origine.
    // summoner-v4 reste appelé juste au-dessus : lui fonctionne, et il fournit
    // profileIconId/summonerLevel que la page /summoner consomme.
    const leagueRes = await fetch(
      `https://${platform}.api.riotgames.com/lol/league/v4/entries/by-puuid/${encodeURIComponent(puuid)}`,
      { headers },
    )
    riotCalls++
    if (!leagueRes.ok) {
      return await failed(leagueRes.status, { error: `Riot API ${leagueRes.status}` })
    }
    // deno-lint-ignore no-explicit-any
    const rawEntries: any[] = await leagueRes.json()
    const entries = mapEntries(rawEntries)

    const result = { puuid, summonerId, profileIconId, summonerLevel, entries }

    // ── C1 : dual-write ──────────────────────────────────────────────────────
    // Deux clés, MÊME corps. La clé historique reste la source lue par
    // harvestRankStats (INCHANGÉE) ; la clé puuid est purement additive et sert
    // le nouveau chemin C3 ainsi que le dual-read C2. Zéro appel Riot en plus.
    await cacheSet(cacheKey, FN, result)
    await cacheSet(`rank:${platform}:puuid:${puuid}`, FN, result)
    await incrementQuota(FN, riotCalls)  // = 3 ici ; compteur explicite, cohérent avec failed()

    return jsonResponse(result, 200, { 'X-Cache': 'MISS' })
  } catch (e) {
    console.error('riot-rank: unhandled exception', e instanceof Error ? e.message : String(e))
    return jsonResponse({ error: 'Erreur serveur inattendue.' }, 500)
  }
})
