// ════════════════════════════════════════════════════════════════════════════
//  matchup/payload — construction PURE du payload matchup-analyze (Lot 3)
// ════════════════════════════════════════════════════════════════════════════
// Partie sans I/O du client EF (voir matchup/api.ts pour le réseau). Miroir de
// BuildScenario / ChampPayload de ClaudeService.cs (WPF). Isolé ici pour rester
// testable sans dépendance au client Supabase (alias @/…).
//
// Contrat FIXÉ côté EF/WPF — repris strictement :
//   scenario = { mode, allies[], enemies[] }
//   champ    = { name, level, stats: [{label,value}], build?: string[] }

import { statAtLevel } from '../champion-stats'
import type { MatchUpScenario, MatchUpChampion, BuildRef } from './types'

export interface ApiChampStat { label: string; value: string }
export interface ApiChamp {
  name: string
  level: number
  stats: ApiChampStat[]
  build?: string[]
}
export interface ApiScenario {
  mode: string
  allies: ApiChamp[]
  enemies: ApiChamp[]
}

// Contexte de résolution des noms d'items d'un build (les blocs slim ne portent
// que des itemId ; le nom vient de DDragon ou du snapshot temp).
export interface BuildNameContext {
  itemNameById: Record<string, string>
  savedById: Record<string, { blocks: { items: { itemId: string; count: number }[] }[] }>
}

// État du quota hebdomadaire (GET, ou champs communs aux réponses 200/429).
export interface QuotaState {
  used: number
  limit: number
  remaining: number
  model: string
  resetsAt: string | null   // ISO
}

// Résultat d'analyse — miroir de MatchUpAnalysisResult (C#).
export interface MatchUpAnalysisResult extends QuotaState {
  success: boolean       // true = text est l'analyse ; false = message d'erreur FR
  text: string
  truncated: boolean     // stop_reason = max_tokens
  overQuota: boolean     // plafond hebdo atteint (HTTP 429)
}

// ── Résolution des noms d'items d'un build ────────────────────────────────────
export function buildItemNames(build: BuildRef, ctx: BuildNameContext): string[] {
  if (build.kind === 'temp') {
    return build.blocks.flatMap(b => b.items).map(it => it.name).filter(Boolean)
  }
  if (build.kind === 'saved') {
    const sb = ctx.savedById[build.buildId]
    if (!sb) return []
    return sb.blocks.flatMap(b => b.items).map(si => ctx.itemNameById[si.itemId]).filter(Boolean)
  }
  return []
}

// Payload d'un champion (miroir ChampPayload) : stats scalées au niveau (base +
// perlevel*(niveau-1), formatées "F1"), + noms d'items du build. On itère TOUTES
// les clés baseStats comme le WPF (l'EF tronque à 20 lignes).
function champPayload(c: MatchUpChampion, ctx: BuildNameContext): ApiChamp {
  const stats: ApiChampStat[] = []
  for (const [key, val] of Object.entries(c.baseStats)) {
    const per = c.baseStats[key + 'perlevel'] ?? 0
    const scaled = statAtLevel(val, per, c.level)
    stats.push({ label: key, value: scaled.toFixed(1) })
  }
  const names = buildItemNames(c.build, ctx)
  const out: ApiChamp = { name: c.champ!.name, level: c.level, stats }
  if (names.length) out.build = names
  return out
}

// Construit le scénario envoyé à l'EF — seuls les slots occupés (avec champion)
// sont inclus (l'EF exige un nom par champion, ≥1 par camp).
export function buildScenarioPayload(scenario: MatchUpScenario, ctx: BuildNameContext): ApiScenario {
  return {
    mode:    scenario.mode,
    allies:  scenario.allies.filter(c => c.champ).map(c => champPayload(c, ctx)),
    enemies: scenario.enemies.filter(c => c.champ).map(c => champPayload(c, ctx)),
  }
}

// ── Mapping des réponses ──────────────────────────────────────────────────────
/* eslint-disable @typescript-eslint/no-explicit-any */
export function readQuota(body: any): QuotaState {
  return {
    used:      Number.isFinite(body?.used)      ? body.used      : 0,
    limit:     Number.isFinite(body?.limit)     ? body.limit     : 0,
    remaining: Number.isFinite(body?.remaining) ? body.remaining : 0,
    model:     typeof body?.model === 'string'  ? body.model     : '',
    resetsAt:  typeof body?.resets_at === 'string' ? body.resets_at : null,
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// Date de reset au format FR local (miroir "dddd d MMMM à HH'h'mm" du WPF).
export function formatResetFr(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const date = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${date} à ${hh}h${mm}`
}

// Message FR du plafond hebdomadaire (429) — miroir de ClaudeService.
export function overQuotaMessage(q: QuotaState): string {
  const suffix = q.resetsAt ? ` Réinitialisation le ${formatResetFr(q.resetsAt)}.` : ''
  return `Quota d'analyses atteint pour cette semaine (${q.used}/${q.limit}).${suffix}`
}
