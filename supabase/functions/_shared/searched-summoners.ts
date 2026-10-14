// Fire-and-forget upsert dans searched_summoners.
// Utilisé UNIQUEMENT par riot-matches, pour le Riot ID recherché : la table ne
// doit contenir que de vraies recherches (purgées après 6 mois sans nouvelle
// recherche, pg_cron 20261014000001). Ne pas y ajouter d'autres appelants.
//
// 🔒 Un joueur opposé (riot_privacy_exclusions, 20261014000003) n'y est jamais
// écrit. La table est publique et sans PUUID : la garde ne peut pas être en
// base, elle est ici, en échec fermé (voir privacy-exclusion.ts).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { mayRecordPlayer } from './privacy-exclusion.ts'

function db() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
}

export function upsertSearchedSummoner(region: string, gameName: string, tagLine: string, puuid: string): void {
  if (!gameName || !tagLine || !region) return
  const client = db()
  ;(async () => {
    const allowed = await mayRecordPlayer(puuid, async (p) => {
      const { data, error } = await client
        .from('riot_privacy_exclusions')
        .select('puuid')
        .eq('puuid', p)
        .maybeSingle()
      if (error) throw error
      return data !== null
    })
    if (!allowed) return
    await client
      .from('searched_summoners')
      .upsert(
        { region, game_name: gameName, tag_line: tagLine, last_seen: new Date().toISOString() },
        { onConflict: 'region,game_name,tag_line' },
      )
  })().catch(() => {})
}
