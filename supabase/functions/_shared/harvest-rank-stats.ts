// Fire-and-forget harvest des stats par rang.
// Appelé depuis riot-matches après cache miss, start===0.
// Lit le rang depuis riot_cache sans appel Riot supplémentaire.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

function db() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
}

interface MatchSample {
  matchId: string
  queueId: number
  position: string
  kills: number; deaths: number; assists: number
  cs: number; duration: number
  visionScore: number; damageDealt: number; goldEarned: number
  win: boolean
}

export function harvestRankStats(
  platform: string,
  gameName: string,
  tagLine: string,
  puuid: string,
  matches: MatchSample[],
): void {
  if (!puuid || !gameName || !tagLine || matches.length === 0) return

  ;(async () => {
    try {
      const client = db()
      const rankCacheKey = `rank:${platform}:${gameName.toLowerCase()}:${tagLine.toLowerCase()}`

      const { data: cacheRow } = await client
        .from('riot_cache')
        .select('response_body')
        .eq('cache_key', rankCacheKey)
        .maybeSingle()

      if (!cacheRow?.response_body) return

      // deno-lint-ignore no-explicit-any
      const entries: { queueType: string; tier: string }[] = (cacheRow.response_body as any).entries ?? []
      const soloTier = entries.find(e => e.queueType === 'RANKED_SOLO_5x5')?.tier
      const flexTier = entries.find(e => e.queueType === 'RANKED_FLEX_SR')?.tier

      // Ranked only + filtre remakes (< 5 minutes)
      const ranked = matches.filter(
        m => (m.queueId === 420 || m.queueId === 440) && m.duration >= 300,
      )
      if (ranked.length === 0) return

      const samples = ranked
        // deno-lint-ignore no-explicit-any
        .map((m): any => {
          const tier = m.queueId === 420 ? soloTier : flexTier
          if (!tier) return null
          const csPerMin = m.duration > 0
            ? Math.round((m.cs / (m.duration / 60)) * 100) / 100
            : 0
          return {
            puuid,
            match_id:     m.matchId,
            region:       platform,
            queue:        m.queueId,
            tier,
            role:         m.position || 'FILL',
            kills:        m.kills,
            deaths:       m.deaths,
            assists:      m.assists,
            cs_per_min:   csPerMin,
            vision_score: m.visionScore,
            damage_dealt: m.damageDealt,
            gold_earned:  m.goldEarned,
            duration_s:   m.duration,
            win:          m.win,
          }
        })
        .filter(Boolean)

      if (samples.length === 0) return

      await client
        .from('rank_stat_samples')
        .upsert(samples, { onConflict: 'puuid,match_id', ignoreDuplicates: true })
    } catch {
      // fire-and-forget : silencieux
    }
  })()
}
