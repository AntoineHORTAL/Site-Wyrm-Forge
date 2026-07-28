// Fire-and-forget harvest des stats par rang.
// Appelé depuis riot-matches après cache miss, start===0.
// Lit le rang depuis riot_cache sans appel Riot supplémentaire.
//
// C2 (Lot C, dual-read) : riot-rank écrit désormais DEUX clés avec le même corps
// pour chaque résolution par Riot ID — la clé historique `rank:{platform}:{gn}:{tl}`
// (source d'origine, inchangée) ET la nouvelle `rank:{platform}:puuid:{puuid}`
// (voir bandeau de couplage en tête de riot-rank/index.ts). On lit ici la clé
// puuid EN PREMIER (source la plus stable — un Riot ID peut changer, un puuid
// non), avec repli sur la clé historique si absente (couvre une entrée déposée
// avant le déploiement du dual-write, ou un cache expiré côté puuid mais pas
// côté historique). Sûr par construction : les deux formes de corps exposent le
// même `entries[].queueType`/`.tier` utilisés ci-dessous.
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

      // C2 : clé puuid d'abord, repli sur la clé historique (voir bandeau ci-dessus).
      const puuidCacheKey      = `rank:${platform}:puuid:${puuid}`
      const historicalCacheKey = `rank:${platform}:${gameName.toLowerCase()}:${tagLine.toLowerCase()}`

      let cacheRow: { response_body: unknown } | null = null

      const { data: byPuuid } = await client
        .from('riot_cache')
        .select('response_body')
        .eq('cache_key', puuidCacheKey)
        .maybeSingle()
      cacheRow = byPuuid ?? null

      if (!cacheRow?.response_body) {
        const { data: byHistorical } = await client
          .from('riot_cache')
          .select('response_body')
          .eq('cache_key', historicalCacheKey)
          .maybeSingle()
        cacheRow = byHistorical ?? null
      }

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
