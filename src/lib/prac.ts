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
