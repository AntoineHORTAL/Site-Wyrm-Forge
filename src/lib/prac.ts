// Client helpers du module prac (suivi de joueurs). Appelle l'EF prac-track
// (POST, JWT obligatoire). Calqué sur src/lib/ecailles.ts (callEF).
const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPA_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export interface PracPlayer {
  tracked_player_id: string
  username:  string | null
  game_name: string | null
  tag_line:  string | null
  platform:  string
  linked:    boolean   // false → pas de compte Riot lié, resolve impossible
}

export interface ResolveCandidate {
  match_id:        string
  game_creation:   string   // ISO
  champion_name:   string
  queue_id:        number
  win:             boolean
  kills:           number
  deaths:          number
  assists:         number
  already_tracked: boolean
}

export interface CommitResult {
  inserted:  number
  skipped:   number
  not_found: string[]
}

const QUEUE_LABELS: Record<number, string> = {
  420: 'Solo/Duo', 440: 'Flex', 400: 'Normale', 430: 'Normale', 450: 'ARAM', 700: 'Clash',
}
export function queueLabel(q: number): string {
  return QUEUE_LABELS[q] ?? `File ${q}`
}

// ── Agrégats (chantier 4) ─────────────────────────────────────────────────────
// Appelés en RPC DIRECT (supabase.rpc), pas via l'EF : les fonctions
// prac_top_winrate / prac_player_stats sont GRANT authenticated + garde interne
// (is_prac_admin / self) et lisent profiles en interne (SECURITY DEFINER).
// ⚠️ PostgREST renvoie les colonnes `numeric` en STRING (et `bigint` en number) —
// d'où `num()` pour normaliser à l'affichage.

export interface TopWinrateRow {
  tracked_player_id: string
  profile_id:        string
  username:          string | null
  games:             number
  wins:              number
  winrate:           number | string
  avg_kda:           number | string
  avg_cs_per_min:    number | string
}

export interface TopChampion {
  champion: string
  games:    number
  wins:     number
  winrate:  number   // dans le jsonb → vrai number
}

export interface PlayerStats {
  tracked_player_id: string
  profile_id:        string
  username:          string | null
  games:             number
  wins:              number
  losses:            number
  winrate:           number | string
  avg_kda:           number | string
  avg_kills:         number | string
  avg_deaths:        number | string
  avg_assists:       number | string
  avg_cs_per_min:    number | string
  avg_vision_score:  number | string
  avg_damage_dealt:  number | string
  avg_gold_earned:   number | string
  top_champions:     TopChampion[]
}

// Ligne brute de tracked_matches (SELECT direct via RLS tm_select, admin prac).
export interface TrackedMatchRow {
  id:            string
  match_id:      string
  region:        string
  game_creation: string
  champion_name: string | null
  champion_id:   number | null
  queue_id:      number | null
  win:           boolean | null
  kills:         number | null
  deaths:        number | null
  assists:       number | null
  cs:            number | null
  duration_s:    number | null
  position:      string | null
  vision_score:  number | null
  damage_dealt:  number | null
  gold_earned:   number | null
}

/** Normalise un numeric PostgREST (string|number|null) en number (NaN→0). */
export function num(v: number | string | null | undefined): number {
  if (v === null || v === undefined) return 0
  const n = typeof v === 'number' ? v : parseFloat(v)
  return Number.isFinite(n) ? n : 0
}

/** KDA d'une partie, division par zéro protégée (D=0 → K+A « parfait »). */
export function matchKda(k: number | null, d: number | null, a: number | null): number {
  const kills = k ?? 0, deaths = d ?? 0, assists = a ?? 0
  return deaths === 0 ? kills + assists : (kills + assists) / deaths
}

/** CS/min d'une partie, division par zéro protégée. */
export function csPerMin(cs: number | null, durationS: number | null): number {
  const d = durationS ?? 0
  return d === 0 ? 0 : ((cs ?? 0) / d) * 60
}

/** Appel générique de l'EF prac-track. Retourne { data, error, code? }. */
export async function callPracTrack<T = unknown>(
  body: Record<string, unknown>,
  token: string,
): Promise<{ data: T | null; error: string | null; code?: string }> {
  try {
    const res = await fetch(`${SUPA_URL}/functions/v1/prac-track`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'apikey': SUPA_KEY,
      },
      body: JSON.stringify(body),
    })
    const json = await res.json().catch(() => null) as (T & { error?: string; code?: string }) | null
    if (res.ok) return { data: json as T, error: null }
    return { data: null, error: json?.error ?? `Erreur ${res.status}`, code: json?.code }
  } catch {
    return { data: null, error: 'Erreur réseau' }
  }
}
