// Fire-and-forget upsert dans searched_summoners.
// Utilisé depuis riot-matches et riot-match-detail via service_role.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

function db() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
}

export function upsertSearchedSummoner(region: string, gameName: string, tagLine: string): void {
  if (!gameName || !tagLine || !region) return
  db()
    .from('searched_summoners')
    .upsert(
      { region, game_name: gameName, tag_line: tagLine, last_seen: new Date().toISOString() },
      { onConflict: 'region,game_name,tag_line' },
    )
    .then(() => {})
    .catch(() => {})
}
