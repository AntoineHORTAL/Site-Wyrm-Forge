// ════════════════════════════════════════════════════════════════════════════
//  matchup/api — client réseau de l'Edge Function matchup-analyze (Lot 3)
// ════════════════════════════════════════════════════════════════════════════
// Miroir web de ClaudeService.cs (WPF). Le CONTRAT est fixé côté EF/WPF et repris
// STRICTEMENT — ne pas réinventer un format différent :
//
//   POST { advanced, scenario: { mode, allies[], enemies[] } }
//   → 200 { analysis, model, advanced, truncated, used, limit, remaining, resets_at }
//   → 429 { over_quota, used, limit, remaining:0, resets_at }  (plafond hebdo)
//   → 401 (JWT) · 502 (Anthropic KO) · 500
//   GET → { used, limit, remaining, model, resets_at }  (ne consomme rien)
//
// La clé Anthropic reste CÔTÉ SERVEUR. Le découpage des cas est identique à
// ClaudeService (statut 0/401/429/502/autre/vide), mais ce module mémorise un CODE
// d'erreur et NON un message : le texte est résolu au rendu (`analysisErrorText`),
// sinon il resterait dans la langue de l'appel après une bascule FR/EN.
// La logique pure (payload, formats, messages) vit dans matchup/payload.ts (testée).

import { createClient } from '@/lib/supabase/client'
import {
  buildScenarioPayload, readQuota,
  type BuildNameContext, type MatchUpAnalysisResult, type AnalysisErrorCode, type QuotaState,
} from './payload'
import type { MatchUpScenario } from './types'

export type { BuildNameContext, MatchUpAnalysisResult, AnalysisErrorCode, QuotaState, AnalysisCosts, ApiScenario } from './payload'
export { buildScenarioPayload, formatReset, canAfford, analysisErrorText } from './payload'

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPA_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const FN = 'matchup-analyze'

function fail(error: AnalysisErrorCode, advanced: boolean): MatchUpAnalysisResult {
  return {
    success: false, text: '', error, advanced, truncated: false, overQuota: false,
    used: 0, limit: 0, remaining: 0, model: '', resetsAt: null,
    // Coûts à 0 : sur un échec, l'état de quota est inconnu. `canAfford` renvoie
    // alors true et laisse l'utilisateur retenter — c'est le serveur qui tranche.
    costs: { quick: 0, detailed: 0 },
  }
}

async function accessToken(): Promise<string | null> {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token ?? null
}

// ── Analyse d'un match up (POST) ──────────────────────────────────────────────
export async function analyzeMatchup(
  scenario: MatchUpScenario,
  advanced: boolean,
  ctx: BuildNameContext,
): Promise<MatchUpAnalysisResult> {
  const token = await accessToken()
  if (!token) return fail('signedOut', advanced)

  const payload = { advanced, scenario: buildScenarioPayload(scenario, ctx) }

  let status = 0
  let body: unknown = null
  try {
    const res = await fetch(`${SUPA_URL}/functions/v1/${FN}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`, 'apikey': SUPA_KEY },
      body: JSON.stringify(payload),
    })
    status = res.status
    body = await res.json().catch(() => null)
  } catch {
    return fail('network', advanced)   // statut 0
  }

  switch (status) {
    case 401: return fail('signedOut', advanced)
    case 429: {
      const q = readQuota(body)
      // `advanced` conservé sur le résultat : le message distingue « plus de braises
      // du tout » de « pas assez pour CETTE analyse » (pot fongible, coûts
      // différenciés), et il est composé au rendu, pas ici.
      return { ...q, success: false, text: '', error: 'overQuota', advanced, truncated: false, overQuota: true }
    }
    case 502: return fail('service', advanced)
  }

  if (status !== 200 || !body) return fail('unexpected', advanced)

  const q = readQuota(body)
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const text = typeof (body as any).analysis === 'string' ? (body as any).analysis : ''
  const truncated = (body as any).truncated === true
  /* eslint-enable @typescript-eslint/no-explicit-any */
  if (!text.trim()) return fail('empty', advanced)
  return { ...q, success: true, text, error: null, advanced, truncated, overQuota: false }
}

// ── Lecture du quota (GET, ne consomme rien) ──────────────────────────────────
// Retourne null si non connecté ou erreur → l'appelant masque le compteur.
export async function getQuota(): Promise<QuotaState | null> {
  const token = await accessToken()
  if (!token) return null
  try {
    const res = await fetch(`${SUPA_URL}/functions/v1/${FN}`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}`, 'apikey': SUPA_KEY },
    })
    if (res.status !== 200) return null
    return readQuota(await res.json())
  } catch {
    return null
  }
}
