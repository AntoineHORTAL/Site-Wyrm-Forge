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
import { cacheGet, cacheSet, cacheGetStale, cacheGetNegative, cacheSetNegative } from '../_shared/cache.ts'
import { isRateLimited } from '../_shared/rate-limit.ts'
import { checkIpRateLimit, riotCacheBackend } from '../_shared/ip-rate-limit.ts'
import { isCircuitOpen, incrementQuota, secondsUntilMidnightUtc } from '../_shared/circuit-breaker.ts'
import { upsertSearchedSummoner } from '../_shared/searched-summoners.ts'
import { harvestRankStats } from '../_shared/harvest-rank-stats.ts'

const FN = 'riot-matches'

const ROUTING: Record<string, string> = {
  euw1: 'europe', eun1: 'europe', tr1: 'europe', ru: 'europe',
  na1: 'americas', br1: 'americas', la1: 'americas', la2: 'americas', oc1: 'americas',
  kr: 'asia', jp1: 'asia',
}

// Real Riot PUUIDs are ~78-char URL-safe strings ([A-Za-z0-9_-]), NOT UUID v4.
// (The 36-char "8-4-4-4-12" UUID shape is the LCU's *anonymized* GUID — invalid for
//  Riot APIs. The previous /^[0-9a-f]{8}-...{12}$/i regex rejected every real PUUID,
//  breaking the by-puuid path. Charset-bounded to prevent path injection; puuid is
//  also encodeURIComponent'd before use below.)
const PUUID_RE = /^[A-Za-z0-9_-]{70,128}$/

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

// ── Cache par PAGE FIXE (R2) ─────────────────────────────────────────────────
// La clé de cache contenait `count` ET `start` : 20 valeurs de count × 201 de
// start = 4020 clés distinctes POUR UN MÊME JOUEUR. Chacune est un MISS → jusqu'à
// 22 appels Riot (account + ids + 20 détails). Faire varier count/start suffisait
// donc à épuiser le quota journalier (1000) en ~45 requêtes — dans les clous du
// rate-limit IP — et à ouvrir le circuit breaker pour TOUT LE MONDE.
//
// Correctif : le cache est indexé par PAGE de 20 alignée, `count`/`start` sortent
// de la clé. Cardinalité 4020 → 11 pages/joueur (start ≤ 200). La fenêtre demandée
// est ensuite découpée côté serveur dans la ou les pages.
//
// PAGE = 10 est calé sur le count réellement demandé par les appelants (profil,
// summoner et AccueilTab = 10 ; StatsTab/WPF/prac = 20), PAS sur le plafond de 20.
// C'est ce qui rend le correctif gratuit : la clé Riot est une Personal Key
// (~100 req/2 min), et une page froide coûte 1 ids + PAGE détails. À PAGE=20 une
// page coûtait 22 appels → ~4 chargements à froid / 2 min pour TOUT le site (vs ~8
// aujourd'hui à count=10) : la cardinalité était réglée en divisant par deux la
// capacité du chemin le plus courant. À PAGE=10, count=10 coûte 12 appels — le prix
// actuel — et count=20 en coûte 24 (2 pages) contre 22 : le surcoût est marginal et
// borné, au lieu d'être payé par la requête la plus fréquente.
// Bornant la rafale à 10 fetch parallèles, on reste aussi sous la limite Riot de
// 20 req/s (au-delà, les détails 429 sont silencieusement droppés par filter(Boolean)).
const PAGE = 10  // fenêtre count ≤ 20 ⇒ au plus 3 pages (2 pour les appelants réels)

// PAGE fait partie de la clé : l'index de page n'a de sens QUE relativement à la
// taille de page. Changer PAGE sans changer la clé ferait relire les pages déjà en
// cache avec la nouvelle sémantique (une page de 20 relue comme une page de 10 →
// mauvais matchs servis pendant tout le TTL). Ici l'invalidation est automatique.
const pageKey = (platform: string, ident: string, idx: number) =>
  `matches:v2:${platform}:${ident}:p${PAGE}_${idx}`

type CachedPage = { puuid: string; matches: unknown[] }

/** Entier borné et TOTAL : tout non-numérique (NaN, Infinity) retombe sur `def`. */
function intParam(raw: string | null, def: number, min: number, max: number): number {
  const n = Number(raw ?? def)
  if (!Number.isFinite(n)) return def
  return Math.min(Math.max(Math.trunc(n), min), max)
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
    // PRÉREQUIS de la pagination (R2) : `Math.min(Math.max(Number('abc'),1),20)`
    // renvoyait NaN. La borne d'origine ne rejetait donc pas le non-numérique, et
    // le NaN se propageait jusqu'à l'URL Riot. Le calcul de pages exige des entiers
    // FINIS : sans ça `lastPage` vaut NaN → `pageIdxs` vide → `[].every()` vaut true
    // → faux HIT sur un tableau vide → crash 500. On totalise donc la coercition.
    // (Ne clôt pas R3 : la forme de l'erreur relayée reste à traiter séparément.)
    const count       = intParam(url.searchParams.get('count'), 5, 1, 20)
    const start       = intParam(url.searchParams.get('start'), 0, 0, 200)

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

    // Rate limiting — deux couches SUPERPOSÉES, complémentaires :
    //  • isRateLimited : 20/min/IP, fenêtre fixe, atomique (SQL SECURITY DEFINER) — anti-rafale,
    //    reste la vraie barrière de sécurité.
    if (await isRateLimited(req, FN)) {
      return jsonResponse({ error: 'Trop de requêtes. Réessaie dans une minute.' }, 429)
    }

    //  • checkIpRateLimit (F3) : 30 recherches/IP/h, fenêtre glissante — anti-scraping soutenu.
    //    Ne compte QUE l'entrée de recherche (start===0) : la pagination « charger plus »
    //    (start>0), riot-rank et riot-match-detail ne consomment pas le budget → une
    //    recherche = un incrément, fidèle au sens « 30 recherches ». Placé avant la lecture
    //    du cache (comme isRateLimited) : un dépassement rejette AVANT toute résolution Riot.
    //    Bucket partagé par IP (clé `rate:ip:{ip}`), non-atomique (compromis assumé, cf. helper).
    //    Valeur généreuse : le burst atomique 20/min + le circuit breaker journalier (1000
    //    appels Riot) restent les vraies barrières ; 30/h borne le scraping soutenu sans
    //    gêner un humain qui consulte plusieurs joueurs.
    if (start === 0) {
      const rl = await checkIpRateLimit(req, riotCacheBackend(), { limit: 30 })
      if (!rl.allowed) {
        return jsonResponse(
          { error: 'Trop de recherches. Réessaie plus tard.', retry_after_s: rl.retryAfterS },
          429,
          { 'Retry-After': String(rl.retryAfterS) },
        )
      }
    }

    // Identité stable — indépendante de count/start (R2)
    const ident = puuidParam
      ? `puuid:${sanitize(puuidParam)}`
      : `${sanitize(gameNameRaw!).toLowerCase()}:${sanitize(tagLineRaw!).toLowerCase()}`

    // Pages couvrant la fenêtre [start, start+count) — contiguës, au plus 3.
    const firstPage = Math.floor(start / PAGE)
    const lastPage  = Math.floor((start + count - 1) / PAGE)
    const pageIdxs: number[] = []
    for (let p = firstPage; p <= lastPage; p++) pageIdxs.push(p)

    // Découpe la fenêtre demandée dans les pages contiguës assemblées
    const sliceWindow = (pages: CachedPage[]): unknown[] =>
      pages.flatMap((p) => p.matches).slice(start - firstPage * PAGE, start - firstPage * PAGE + count)

    // Cache read — toutes les pages de la fenêtre doivent être fraîches
    const cachedPages = await Promise.all(
      pageIdxs.map((p) => cacheGet(pageKey(platform, ident, p))),
    ) as (CachedPage | null)[]

    if (cachedPages.every((p) => p !== null)) {
      const pages = cachedPages as CachedPage[]
      return jsonResponse({ puuid: pages[0].puuid, matches: sliceWindow(pages) }, 200, { 'X-Cache': 'HIT' })
    }

    // 404 mémorisé (R1) — Riot ID inexistant : rejeu gratuit, aucun appel Riot
    const identKey = `matches:v2:${platform}:${ident}`
    const neg = await cacheGetNegative(identKey)
    if (neg !== null) {
      return jsonResponse(neg.body, neg.status, { 'X-Cache': 'HIT-NEG' })
    }

    // Circuit breaker
    if (await isCircuitOpen()) {
      const stale = await cacheGetStale(pageKey(platform, ident, firstPage)) as CachedPage | null
      if (stale !== null) {
        return jsonResponse({ puuid: stale.puuid, matches: sliceWindow([stale]) }, 200, { 'X-Cache': 'STALE' })
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
        // R1 : l'appel Riot a bien été consommé → il compte, même en échec.
        await incrementQuota(FN, riotCalls)
        if (acctRes.status === 404) {
          const body = { error: 'Invocateur introuvable. Vérifie ton Riot ID.' }
          await cacheSetNegative(identKey, FN, 404, body)
          return jsonResponse(body, 404)
        }
        return jsonResponse({ error: `Riot API ${acctRes.status}` }, acctRes.status)
      }
      const acct = await acctRes.json()
      puuid = acct.puuid
    }

    // deno-lint-ignore no-explicit-any
    const toSlim = (matchDetails: any[]): unknown[] => matchDetails
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

    // Charge les pages manquantes (les pages déjà en cache ne sont pas refetchées)
    const loaded: CachedPage[] = []
    for (let i = 0; i < pageIdxs.length; i++) {
      const hit = cachedPages[i]
      if (hit !== null) { loaded.push(hit); continue }

      const idsRes = await fetch(
        `https://${routing}.api.riotgames.com/lol/match/v5/matches/by-puuid/${encodeURIComponent(puuid)}/ids?start=${pageIdxs[i] * PAGE}&count=${PAGE}`,
        { headers },
      )
      riotCalls++
      if (!idsRes.ok) {
        // R1 : account-v1 + ids déjà consommés → ils comptent.
        await incrementQuota(FN, riotCalls)
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

      const page: CachedPage = { puuid, matches: toSlim(matchDetails) }
      await cacheSet(pageKey(platform, ident, pageIdxs[i]), FN, page)
      loaded.push(page)
    }

    const result = { puuid, matches: sliceWindow(loaded) }
    await incrementQuota(FN, riotCalls)
    // Alimente searched_summoners avec le joueur recherché (fire-and-forget)
    if (gameNameRaw && tagLineRaw) {
      upsertSearchedSummoner(platform, sanitize(gameNameRaw), sanitize(tagLineRaw))
    }

    // Alimente rank_stat_samples pour la comparaison de rang (fire-and-forget)
    // Condition : page 0 + appel par Riot ID (pas by-puuid) + page 0 réellement
    // fetchée (MISS) — `cachedPages[0] === null` préserve la sémantique d'origine
    // (`start === 0` + MISS) maintenant que la fenêtre est paginée.
    if (firstPage === 0 && cachedPages[0] === null && gameNameRaw && tagLineRaw) {
      harvestRankStats(platform, sanitize(gameNameRaw), sanitize(tagLineRaw), puuid, loaded[0].matches as any[])
    }

    return jsonResponse(result, 200, { 'X-Cache': 'MISS' })
  } catch (e) {
    console.error('riot-matches: unhandled exception', e instanceof Error ? e.message : String(e))
    return jsonResponse({ error: 'Erreur serveur inattendue.' }, 500)
  }
})
