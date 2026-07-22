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
// La clé Anthropic reste CÔTÉ SERVEUR. Le mapping de messages FR est identique à
// ClaudeService (statut 0/401/429/502/autre/vide). La logique pure (payload,
// formats) vit dans matchup/payload.ts (testée).

import { createClient } from '@/lib/supabase/client'
import {
  buildScenarioPayload, readQuota, overQuotaMessage,
  type BuildNameContext, type MatchUpAnalysisResult, type QuotaState,
} from './payload'
import type { MatchUpScenario } from './types'

export type { BuildNameContext, MatchUpAnalysisResult, QuotaState, ApiScenario } from './payload'
export { buildScenarioPayload, formatResetFr } from './payload'

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPA_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const FN = 'matchup-analyze'

function fail(message: string): MatchUpAnalysisResult {
  return { success: false, text: message, truncated: false, overQuota: false, used: 0, limit: 0, remaining: 0, model: '', resetsAt: null }
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
  if (!token) return fail('Connecte-toi à ton compte Wyrm Forge pour utiliser l\'analyse IA.')

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
    return fail('Erreur réseau — vérifie ta connexion internet.')   // statut 0
  }

  switch (status) {
    case 401: return fail('Connecte-toi à ton compte Wyrm Forge pour utiliser l\'analyse IA.')
    case 429: {
      const q = readQuota(body)
      return { ...q, success: false, truncated: false, overQuota: true, text: overQuotaMessage(q) }
    }
    case 502: return fail('Le service d\'analyse est momentanément indisponible. Réessaie dans un instant.')
  }

  if (status !== 200 || !body) return fail('Erreur inattendue du service d\'analyse.')

  const q = readQuota(body)
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const text = typeof (body as any).analysis === 'string' ? (body as any).analysis : ''
  const truncated = (body as any).truncated === true
  /* eslint-enable @typescript-eslint/no-explicit-any */
  if (!text.trim()) return fail('Analyse vide renvoyée par le service.')
  return { ...q, success: true, truncated, overQuota: false, text }
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
