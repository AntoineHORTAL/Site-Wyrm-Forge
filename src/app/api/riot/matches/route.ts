import { NextResponse } from 'next/server'

const ROUTING: Record<string, string> = {
  euw1: 'europe', eun1: 'europe', tr1: 'europe', ru: 'europe',
  na1: 'americas', br1: 'americas', la1: 'americas', la2: 'americas', oc1: 'americas',
  kr: 'asia', jp1: 'asia',
}

const QUEUES: Record<number, string> = {
  420: 'Classée Solo/Duo', 440: 'Classée Flex',
  400: 'Normale Draft',    430: 'Normale Aveugle',
  450: 'ARAM',             900: 'URF',
  1020: 'Légendes Uniques', 1400: 'Ultime Spellbook',
  1900: 'URF (pick)', 0: 'Personnalisée', 1700: 'Arena',
}

export async function GET(req: Request) {
  const apiKey = process.env.RIOT_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'Clé API Riot non configurée.' }, { status: 503 })
  }

  const { searchParams } = new URL(req.url)
  const gameName = searchParams.get('gameName')
  const tagLine  = searchParams.get('tagLine')
  const platform = searchParams.get('platform') ?? 'euw1'
  const count    = Math.min(Number(searchParams.get('count') ?? '5'), 10)

  if (!gameName || !tagLine) {
    return NextResponse.json({ error: 'gameName et tagLine requis.' }, { status: 400 })
  }

  const routing = ROUTING[platform] ?? 'europe'
  const headers = { 'X-Riot-Token': apiKey }

  try {
    // 1. Compte → puuid
    const acctRes = await fetch(
      `https://${routing}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`,
      { headers }
    )
    if (!acctRes.ok) {
      if (acctRes.status === 404)
        return NextResponse.json({ error: 'Invocateur introuvable. Vérifie ton Riot ID.' }, { status: 404 })
      return NextResponse.json({ error: `Riot API ${acctRes.status}` }, { status: acctRes.status })
    }
    const { puuid } = await acctRes.json()

    // 2. Derniers IDs de match
    const idsRes = await fetch(
      `https://${routing}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?start=0&count=${count}`,
      { headers }
    )
    if (!idsRes.ok)
      return NextResponse.json({ error: `Riot Match List ${idsRes.status}` }, { status: idsRes.status })
    const matchIds: string[] = await idsRes.json()

    // 3. Détails des matchs en parallèle
    const matchDetails = await Promise.all(
      matchIds.map(id =>
        fetch(`https://${routing}.api.riotgames.com/lol/match/v5/matches/${id}`, { headers })
          .then(r => r.ok ? r.json() : null)
          .catch(() => null)
      )
    )

    // 4. Formatter pour le client
    const matches = matchDetails
      .filter(Boolean)
      .map((m: any) => {
        const me = m.info.participants.find((p: any) => p.puuid === puuid)
        if (!me) return null

        const duration = m.info.gameDuration // secondes
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
          duration,
          win:          me.win,
          gameCreation: m.info.gameCreation,
        }
      })
      .filter(Boolean)

    return NextResponse.json({ puuid, matches })
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? 'Erreur inconnue' }, { status: 500 })
  }
}
