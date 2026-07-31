// ════════════════════════════════════════════════════════════════════════════
//  postgame/api — client réseau de l'Edge Function postgame-analyze
// ════════════════════════════════════════════════════════════════════════════
// Première brique du chantier PostGame : UNE seule des 9 combinaisons prévues
// (profondeur « simple » × mode « perso »). Le contrat porte déjà `depth`/`mode`
// pour que l'ouverture des 8 autres ne casse pas ce client.
//
//   POST { matchId, puuid, platform?, depth:'simple', mode:'perso' }
//   → 200 { analysis, model, depth, mode, truncated, champion, win,
//           used, limit, remaining, cost, costs, resets_at }
//   → 429 { over_quota, used, limit, remaining, cost, costs, resets_at }
//   → 401 (JWT) · 404 (match/joueur) · 502 (Anthropic) · 503 (Riot) · 500
//   GET → { used, limit, remaining, model, resets_at, costs } (ne consomme rien)
//
// ⚠️ used/limit/remaining sont des CRÉDITS du pot « Chaleur de la Forge »,
// partagé avec MatchUp — pas un compteur propre à PostGame.

import { createClient } from '@/lib/supabase/client'

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPA_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const FN = 'postgame-analyze'

export interface PostGameCosts { simple_perso: number }

export interface PostGameQuota {
  used: number
  limit: number
  remaining: number
  model: string
  resetsAt: string | null
  costs: PostGameCosts
}

export interface PostGameResult extends PostGameQuota {
  success: boolean
  text: string          // analyse, ou message d'erreur FR
  truncated: boolean
  overQuota: boolean
  champion: string
  win: boolean | null
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export function readPostGameQuota(body: any): PostGameQuota {
  const c = body?.costs
  return {
    used:      Number.isFinite(body?.used)      ? body.used      : 0,
    limit:     Number.isFinite(body?.limit)     ? body.limit     : 0,
    remaining: Number.isFinite(body?.remaining) ? body.remaining : 0,
    model:     typeof body?.model === 'string'  ? body.model     : '',
    resetsAt:  typeof body?.resets_at === 'string' ? body.resets_at : null,
    // Coût à 0 = inconnu → `canAffordPostGame` laisse tenter, le serveur tranche.
    // Un faux « solde épuisé » côté client serait plus grave qu'un 429 propre.
    costs: { simple_perso: Number.isFinite(c?.simple_perso) ? c.simple_perso : 0 },
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// Le solde seul ne suffit pas à décider : il faut le comparer au coût de
// l'action. Même logique que canAfford() côté MatchUp.
export function canAffordPostGame(q: PostGameQuota | null): boolean {
  if (!q) return true
  return q.costs.simple_perso <= 0 || q.remaining >= q.costs.simple_perso
}

const EMPTY: PostGameQuota = {
  used: 0, limit: 0, remaining: 0, model: '', resetsAt: null,
  costs: { simple_perso: 0 },
}

function fail(message: string): PostGameResult {
  return { ...EMPTY, success: false, text: message, truncated: false, overQuota: false, champion: '', win: null }
}

async function accessToken(): Promise<string | null> {
  const { data } = await createClient().auth.getSession()
  return data.session?.access_token ?? null
}

export async function getPostGameQuota(): Promise<PostGameQuota | null> {
  const token = await accessToken()
  if (!token) return null
  try {
    const res = await fetch(`${SUPA_URL}/functions/v1/${FN}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}`, apikey: SUPA_KEY },
    })
    if (res.status !== 200) return null
    return readPostGameQuota(await res.json())
  } catch {
    return null
  }
}

export async function analyzePostGame(matchId: string, puuid: string, platform?: string): Promise<PostGameResult> {
  const token = await accessToken()
  if (!token) return fail('Connecte-toi à ton compte Wyrm Forge pour utiliser l\'analyse IA.')

  let status = 0
  let body: unknown = null
  try {
    const res = await fetch(`${SUPA_URL}/functions/v1/${FN}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: SUPA_KEY },
      body: JSON.stringify({ matchId, puuid, platform, depth: 'simple', mode: 'perso' }),
    })
    status = res.status
    body = await res.json().catch(() => null)
  } catch {
    return fail('Erreur réseau — vérifie ta connexion internet.')
  }

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const b = body as any
  switch (status) {
    case 401: return fail('Connecte-toi à ton compte Wyrm Forge pour utiliser l\'analyse IA.')
    case 404: return fail(b?.error ?? 'Partie introuvable.')
    case 429: {
      const q = readPostGameQuota(b)
      const need = q.costs.simple_perso
      const text = q.remaining > 0 && need > 0
        ? `Il te reste ${q.remaining} braises, il en faut ${need} pour ce bilan.`
        : `Chaleur de la Forge épuisée pour cette semaine (${q.used}/${q.limit} braises).`
      return { ...q, success: false, text, truncated: false, overQuota: true, champion: '', win: null }
    }
    case 502: return fail('Le service d\'analyse est momentanément indisponible. Réessaie dans un instant.')
    case 503: return fail('Les données de la partie sont momentanément indisponibles. Réessaie dans un instant.')
  }
  if (status !== 200 || !b) return fail(b?.error ?? 'Erreur inattendue du service d\'analyse.')

  const text = typeof b.analysis === 'string' ? b.analysis : ''
  if (!text.trim()) return fail('Analyse vide renvoyée par le service.')
  return {
    ...readPostGameQuota(b),
    success: true, text, truncated: b.truncated === true, overQuota: false,
    champion: typeof b.champion === 'string' ? b.champion : '',
    win: typeof b.win === 'boolean' ? b.win : null,
  }
  /* eslint-enable @typescript-eslint/no-explicit-any */
}
