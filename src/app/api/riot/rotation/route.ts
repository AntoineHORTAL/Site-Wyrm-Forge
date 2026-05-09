import { NextResponse } from 'next/server'

// Mapping platform → routing régional (pour account/match v5)
const PLATFORM_ROUTING: Record<string, string> = {
  euw1: 'europe', eun1: 'europe', tr1: 'europe', ru: 'europe',
  na1: 'americas', br1: 'americas', la1: 'americas', la2: 'americas', oc1: 'americas',
  kr: 'asia', jp1: 'asia',
}

export async function GET(req: Request) {
  const apiKey = process.env.RIOT_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'Clé API Riot non configurée.' }, { status: 503 })
  }

  const { searchParams } = new URL(req.url)
  const platform = searchParams.get('platform') ?? 'euw1'

  try {
    const res = await fetch(
      `https://${platform}.api.riotgames.com/lol/platform/v3/champion-rotations`,
      {
        headers: { 'X-Riot-Token': apiKey },
        next: { revalidate: 3600 }, // cache 1h — la rotation change peu
      }
    )

    if (!res.ok) {
      const body = await res.text()
      return NextResponse.json(
        { error: `Riot API ${res.status}`, detail: body },
        { status: res.status }
      )
    }

    const data = await res.json()
    return NextResponse.json(data)
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? 'Erreur inconnue' }, { status: 500 })
  }
}
