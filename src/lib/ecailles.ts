const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPA_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const SOURCE_LABELS: Record<string, string> = {
  quest:      'Quête',
  shop:       'Boutique',
  tournament: 'Tournoi',
  admin:      'Administrateur',
  purchase:   'Achat',
}

export async function callEF<T = unknown>(
  name: string,
  body: Record<string, unknown>,
  token: string,
): Promise<{ data: T | null; error: string | null }> {
  try {
    const res = await fetch(`${SUPA_URL}/functions/v1/${name}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'apikey': SUPA_KEY,
      },
      body: JSON.stringify(body),
    })
    if (res.ok) {
      const data = await res.json() as T
      return { data, error: null }
    }
    const err = await res.json().catch(() => ({ error: `Erreur ${res.status}` })) as { error?: string }
    return { data: null, error: err.error ?? `Erreur ${res.status}` }
  } catch {
    return { data: null, error: 'Erreur réseau' }
  }
}
