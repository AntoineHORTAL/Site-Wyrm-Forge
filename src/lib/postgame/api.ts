// ════════════════════════════════════════════════════════════════════════════
//  postgame/api — client réseau de l'Edge Function postgame-analyze
// ════════════════════════════════════════════════════════════════════════════
// Les 9 combinaisons : 3 profondeurs × 3 modes. Défauts `simple`/`perso`.
//
//   POST { matchId, puuid, platform?, depth, mode }
//   → 200 { analysis, model, depth, mode, truncated, champion, win, opponent,
//           used, limit, remaining, cost, costs, resets_at }
//   → 400 { code:'opponent_unavailable' } — partie sans duel de voie
//   → 429 { over_quota, used, limit, remaining, cost, costs, resets_at }
//   → 401 (JWT) · 404 (match/joueur) · 502 (Anthropic) · 503 (Riot) · 500
//   GET → { used, limit, remaining, model, resets_at, costs } (ne consomme rien)
//
// ⚠️ used/limit/remaining sont des CRÉDITS du pot « Chaleur de la Forge »,
// partagé avec MatchUp — pas un compteur propre à PostGame.
//
// ⚠️ `costs` porte les 9 clés `${depth}_${mode}` : le coût varie de 6 à 31
// crédits selon la combinaison. Un booléen unique de finançabilité serait donc
// faux — `canAffordPostGame` prend la combinaison en paramètre.

import { createClient } from '@/lib/supabase/client'

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPA_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const FN = 'postgame-analyze'

export type PostGameDepth = 'simple' | 'medium' | 'advanced'
export type PostGameMode  = 'perso' | 'adversaire' | 'les_deux'

export const POSTGAME_DEPTHS: PostGameDepth[] = ['simple', 'medium', 'advanced']
export const POSTGAME_MODES:  PostGameMode[]  = ['perso', 'adversaire', 'les_deux']

export const DEPTH_LABEL: Record<PostGameDepth, string> = {
  simple: 'Simple', medium: 'Médium', advanced: 'Avancée',
}
export const MODE_LABEL: Record<PostGameMode, string> = {
  perso: 'Moi', adversaire: 'Adversaire', les_deux: 'Les deux',
}

/** Clé de combinaison — miroir de `comboKey` côté serveur. */
export const comboKey = (d: PostGameDepth, m: PostGameMode): string => `${d}_${m}`

/** 9 clés `${depth}_${mode}`. Toute clé absente vaut 0 = coût inconnu. */
export type PostGameCosts = Record<string, number>

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
  opponent: string | null
  /** `true` quand la partie ne permet pas d'identifier un adversaire de voie. */
  opponentUnavailable: boolean
  /** Combinaison réellement servie — l'en-tête du résultat ne doit pas suivre
   *  les sélecteurs si l'utilisateur les change après coup. */
  depth: PostGameDepth
  mode: PostGameMode
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export function readPostGameQuota(body: any): PostGameQuota {
  const raw = body?.costs
  // On ne retient que les clés numériques : une réponse malformée ne doit pas
  // injecter de NaN dans une décision de finançabilité.
  const costs: PostGameCosts = {}
  if (raw && typeof raw === 'object') {
    for (const [k, v] of Object.entries(raw)) {
      if (Number.isFinite(v)) costs[k] = v as number
    }
  }
  return {
    used:      Number.isFinite(body?.used)      ? body.used      : 0,
    limit:     Number.isFinite(body?.limit)     ? body.limit     : 0,
    remaining: Number.isFinite(body?.remaining) ? body.remaining : 0,
    model:     typeof body?.model === 'string'  ? body.model     : '',
    resetsAt:  typeof body?.resets_at === 'string' ? body.resets_at : null,
    costs,
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// Files sans voies : `teamPosition` y est vide, donc aucun adversaire de voie
// n'est identifiable. Le client s'en sert pour griser les modes concernés AVANT
// tout appel — mais l'autorité reste le serveur (`opponent_unavailable`), car
// la Faille aussi peut ne pas exposer les rôles sur certaines parties.
const LANELESS_QUEUES = new Set([
  450,   // ARAM
  720,   // ARAM Clash
  1700,  // Arena
  1710,  // Arena (variante)
  1300,  // Nexus Blitz
])

/** `false` quand la file ne permet structurellement pas un duel de voie. */
export function hasLaneOpponent(queueId?: number): boolean {
  return queueId === undefined || !LANELESS_QUEUES.has(queueId)
}

/** Coût de la combinaison, ou 0 si inconnu (EF pré-généralisation). */
export function costOfCombo(q: PostGameQuota | null, d: PostGameDepth, m: PostGameMode): number {
  return q?.costs[comboKey(d, m)] ?? 0
}

// Le solde seul ne suffit pas à décider : il faut le comparer au coût de
// L'ACTION DEMANDÉE — et depuis la généralisation, ce coût varie du simple au
// quintuple selon la combinaison (6 → 31 crédits). Un booléen global serait
// donc encore plus faux qu'avant : il faut décider combinaison par combinaison.
// Même logique que canAfford() côté MatchUp.
export function canAffordPostGame(
  q: PostGameQuota | null,
  depth: PostGameDepth = 'simple',
  mode: PostGameMode = 'perso',
): boolean {
  if (!q) return true
  const cost = costOfCombo(q, depth, mode)
  // Coût inconnu → on laisse tenter, le serveur tranche. Un faux « solde
  // épuisé » côté client serait plus grave qu'un 429 propre.
  return cost <= 0 || q.remaining >= cost
}

const EMPTY: PostGameQuota = {
  used: 0, limit: 0, remaining: 0, model: '', resetsAt: null, costs: {},
}

function fail(message: string, extra: Partial<PostGameResult> = {}): PostGameResult {
  return {
    ...EMPTY, success: false, text: message, truncated: false, overQuota: false,
    champion: '', win: null, opponent: null, opponentUnavailable: false,
    depth: 'simple', mode: 'perso', ...extra,
  }
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

export async function analyzePostGame(
  matchId: string, puuid: string, platform?: string,
  depth: PostGameDepth = 'simple', mode: PostGameMode = 'perso',
): Promise<PostGameResult> {
  const token = await accessToken()
  if (!token) return fail('Connecte-toi à ton compte Wyrm Forge pour utiliser l\'analyse IA.')

  let status = 0
  let body: unknown = null
  try {
    const res = await fetch(`${SUPA_URL}/functions/v1/${FN}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: SUPA_KEY },
      body: JSON.stringify({ matchId, puuid, platform, depth, mode }),
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
    // Partie sans adversaire de voie identifiable (ARAM, Arena, ou Faille où
    // Riot n'a pas inféré les rôles). État NOMINAL de la donnée, pas une panne :
    // message explicatif, et le composant rebascule sur le mode « Moi ».
    case 400:
      if (b?.code === 'opponent_unavailable') {
        return fail(
          'Cette partie ne permet pas d\'identifier ton adversaire de voie (ARAM, Arena, ou rôles non détectés). Les modes « Adversaire » et « Les deux » ne sont pas disponibles ici.',
          { opponentUnavailable: true },
        )
      }
      return fail(b?.error ?? 'Requête invalide.')
    case 404: return fail(b?.error ?? 'Partie introuvable.')
    case 429: {
      const q = readPostGameQuota(b)
      const need = Number.isFinite(b?.cost) ? b.cost : costOfCombo(q, depth, mode)
      const text = q.remaining > 0 && need > 0
        ? `Il te reste ${q.remaining} braise${q.remaining > 1 ? 's' : ''}, il en faut ${need} pour cette analyse.`
        : `Chaleur de la Forge épuisée pour cette semaine (${q.used}/${q.limit} braises).`
      return {
        ...q, success: false, text, truncated: false, overQuota: true,
        champion: '', win: null, opponent: null, opponentUnavailable: false,
        depth, mode,
      }
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
    opponent: typeof b.opponent === 'string' ? b.opponent : null,
    opponentUnavailable: false,
    depth, mode,
  }
  /* eslint-enable @typescript-eslint/no-explicit-any */
}
