// Edge Function : rotation gratuite des champions LoL.
// Pas d'auth — c'est de la donnée publique. La fonction sert juste à cacher la clé Riot.
//
// Appel : GET /functions/v1/riot-rotation?platform=euw1
// Headers : apikey: <SUPABASE_ANON_KEY>
//
// Réponse : { freeChampionIds: number[], freeChampionIdsForNewPlayers: number[], maxNewPlayerLevel: number }
import { corsHeaders, handleCors, jsonResponse } from '../_shared/cors.ts'
import { requireSecret } from '../_shared/auth.ts'

Deno.serve(async (req) => {
  const cors = handleCors(req)
  if (cors) return cors

  try {
    const url = new URL(req.url)
    const platform = url.searchParams.get('platform') ?? 'euw1'

    const apiKey = requireSecret('RIOT_API_KEY')

    const res = await fetch(
      `https://${platform}.api.riotgames.com/lol/platform/v3/champion-rotations`,
      { headers: { 'X-Riot-Token': apiKey } },
    )

    if (!res.ok) {
      const detail = await res.text()
      return jsonResponse({ error: `Riot API ${res.status}`, detail }, res.status)
    }

    const data = await res.json()
    return jsonResponse(data)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erreur inconnue'
    return jsonResponse({ error: msg }, 500)
  }
})
