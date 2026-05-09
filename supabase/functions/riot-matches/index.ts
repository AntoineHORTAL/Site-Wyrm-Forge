// Edge Function : historique des dernières parties d'un joueur LoL.
// AUTH REQUISE — historique = donnée personnelle, on vérifie le JWT Supabase.
//
// Appel : GET /functions/v1/riot-matches?gameName=X&tagLine=Y&platform=euw1&count=5
// Headers : apikey: <SUPABASE_ANON_KEY>, Authorization: Bearer <user_jwt>
//
// Flow : account-v1 (puuid) → match-v5 (IDs) → match-v5 (détails en parallèle) → format slim
import { handleCors, jsonResponse } from '../_shared/cors.ts'
import { getUser, requireSecret } from '../_shared/auth.ts'

const ROUTING: Record<string, string> = {
  euw1: 'europe', eun1: 'europe', tr1: 'europe', ru: 'europe',
  na1: 'americas', br1: 'americas', la1: 'americas', la2: 'americas', oc1: 'americas',
  kr: 'asia', jp1: 'asia',
}

/**
 * Retire les caractères de contrôle invisibles (zero-width, bidi marks, BOM)
 * que certains clients (Discord, terminaux, copier-coller HTML) injectent
 * autour du texte. Sans ce nettoyage, Riot ne reconnaît pas le Riot ID
 * car le pseudo réel est entouré de U+2066/U+2069 par exemple.
 */
function sanitize(s: string): string {
  // U+200B–U+200F : zero-width, LRM, RLM
  // U+202A–U+202E : LRE, RLE, PDF, LRO, RLO (bidi anciens)
  // U+2060–U+206F : word joiner, isolates (U+2066, U+2069), invisibles
  // U+FEFF       : BOM
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
    // 1. Auth
    const user = await getUser(req)
    if (!user) return jsonResponse({ error: 'Non authentifié.' }, 401)

    // 2. Params (nettoyés des caractères invisibles que certains clients injectent)
    const url = new URL(req.url)
    const gameNameRaw = url.searchParams.get('gameName')
    const tagLineRaw  = url.searchParams.get('tagLine')
    const platform    = url.searchParams.get('platform') ?? 'euw1'
    const count       = Math.min(Number(url.searchParams.get('count') ?? '5'), 10)

    if (!gameNameRaw || !tagLineRaw) {
      return jsonResponse({ error: 'gameName et tagLine requis.' }, 400)
    }
    const gameName = sanitize(gameNameRaw)
    const tagLine  = sanitize(tagLineRaw)

    const apiKey  = requireSecret('RIOT_API_KEY')
    const routing = ROUTING[platform] ?? 'europe'
    const headers = { 'X-Riot-Token': apiKey }

    // 3. Compte → puuid
    const acctUrl = `https://${routing}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`
    console.log('[riot-matches] Account lookup', { gameName, tagLine, platform, routing, url: acctUrl })

    const acctRes = await fetch(acctUrl, { headers })
    console.log('[riot-matches] Account response', { status: acctRes.status })

    if (!acctRes.ok) {
      const body = await acctRes.text()
      console.log('[riot-matches] Account error body', body)
      if (acctRes.status === 404) {
        return jsonResponse({ error: 'Invocateur introuvable. Vérifie ton Riot ID.' }, 404)
      }
      return jsonResponse({ error: `Riot API ${acctRes.status}`, detail: body }, acctRes.status)
    }
    const { puuid } = await acctRes.json()

    // 4. IDs des derniers matchs
    const idsRes = await fetch(
      `https://${routing}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?start=0&count=${count}`,
      { headers },
    )
    if (!idsRes.ok) {
      return jsonResponse({ error: `Riot Match List ${idsRes.status}` }, idsRes.status)
    }
    const matchIds: string[] = await idsRes.json()

    // 5. Détails en parallèle
    const matchDetails = await Promise.all(
      matchIds.map((id) =>
        fetch(`https://${routing}.api.riotgames.com/lol/match/v5/matches/${id}`, { headers })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
      ),
    )

    // 6. Format slim pour les clients
    const matches = matchDetails
      .filter(Boolean)
      // deno-lint-ignore no-explicit-any
      .map((m: any) => {
        // deno-lint-ignore no-explicit-any
        const me = m.info.participants.find((p: any) => p.puuid === puuid)
        if (!me) return null

        const cs = me.totalMinionsKilled + (me.neutralMinionsKilled ?? 0)
        return {
          matchId:      m.metadata.matchId,
          championId:   me.championId,
          championName: me.championName,
          queueId:      m.info.queueId,
          queueName:    QUEUES[m.info.queueId] ?? 'Partie',
          kills:        me.kills,
          deaths:       me.deaths,
          assists:      me.assists,
          cs,
          duration:     m.info.gameDuration,
          win:          me.win,
          gameCreation: m.info.gameCreation,
        }
      })
      .filter(Boolean)

    return jsonResponse({ puuid, matches })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erreur inconnue'
    return jsonResponse({ error: msg }, 500)
  }
})
