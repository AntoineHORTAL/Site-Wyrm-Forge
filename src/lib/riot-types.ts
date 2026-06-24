// Types Riot partagés entre la page joueur et AccueilTab
export interface MatchInfo {
  matchId: string; championId: number; championName: string
  queueId: number; queueName: string
  kills: number; deaths: number; assists: number
  cs: number; duration: number; win: boolean; gameCreation: number
  summoner1Id: number; summoner2Id: number
  keystoneId: number; secondaryStyleId: number
  items: number[]; trinket: number
  position: string
  visionScore: number; damageDealt: number; goldEarned: number
  teamKills: number
  pentaKills: number; quadraKills: number; tripleKills: number
}

export interface RankEntry {
  queueType: string
  tier: string; rank: string; lp: number
  wins: number; losses: number
  hotStreak: boolean; veteran: boolean
}

export interface RankResponse {
  puuid: string; summonerId: string
  profileIconId?: number; summonerLevel?: number
  entries: RankEntry[]
}
