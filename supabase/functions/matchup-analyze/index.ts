// ════════════════════════════════════════════════════════════════════════════
//  Edge Function : matchup-analyze — analyse IA d'un match up League of Legends
// ════════════════════════════════════════════════════════════════════════════
// Proxy serveur pour l'appel Anthropic : la clé ANTHROPIC_API_KEY reste CÔTÉ
// SERVEUR (secret Supabase), jamais exposée au client WPF. Reprend le prompt
// validé au sondage (miroir de BuildPrompt() de ClaudeService.cs).
//
// Auth : JWT obligatoire (verify_jwt=true dans config.toml + getUser en code).
//
// ── POST /functions/v1/matchup-analyze ──────────────────────────────────────
//   Body : { advanced: boolean, scenario: { mode, allies[], enemies[] } }
//     champ = { name, level, stats?: [{label,value}], build?: string[] }
//   Flow : auth → lecture tier (profiles) → mapping tier→{limite,modèle} →
//          consume_ai_quota (réservation atomique) → appel Anthropic →
//          refund si échec Anthropic → réponse { analysis, used, limit, ... }.
//   Le mapping tier→limite/modèle vit ICI (pas en DB). Modèle : Haiku pour
//   Apprenti/Forgeron, Sonnet pour Maître et tiers supérieurs.
//
// ── GET /functions/v1/matchup-analyze ───────────────────────────────────────
//   Retourne l'état du quota de la semaine courante pour l'affichage « X/N ».
//   { used, limit, remaining, model, resets_at }. Ne consomme rien.
//
// Codes HTTP : 200 · 400 (payload) · 401 (JWT) · 405 (méthode) ·
//              429 (quota hebdo atteint) · 502 (échec Anthropic) · 500.
// ════════════════════════════════════════════════════════════════════════════
import { createClient }             from 'https://esm.sh/@supabase/supabase-js@2'
import { handleCors, jsonResponse } from '../_shared/cors.ts'
import { getUser, requireSecret }   from '../_shared/auth.ts'

const FEATURE = 'matchup_analyze'
const HAIKU   = 'claude-haiku-4-5'
const SONNET  = 'claude-sonnet-5'

// Mapping tier → { limite hebdo, modèle }. Soft-cap 100 sur les tiers "illimités"
// (garde-fou anti-abus coût Sonnet). Les clés accentuées matchent les valeurs DB.
const TIER_CONFIG: Record<string, { limit: number; model: string }> = {
  'apprenti':    { limit: 3,   model: HAIKU },
  'forgeron':    { limit: 10,  model: HAIKU },
  'maître':      { limit: 100, model: SONNET },
  'légion':      { limit: 100, model: SONNET },
  'architecte':  { limit: 100, model: SONNET },
  'architecte+': { limit: 100, model: SONNET },
}
// Défaut prudent si tier inconnu/absent : plancher gratuit (Apprenti).
const DEFAULT_CONFIG = TIER_CONFIG['apprenti']

function resolveConfig(tier: string | null, role: string | null): { limit: number; model: string } {
  if (role === 'admin') return { limit: 100, model: SONNET }
  return (tier && TIER_CONFIG[tier]) || DEFAULT_CONFIG
}

// ── Fenêtre semaine (miroir du date_trunc('week', now() at time zone 'UTC') SQL) ──
// Lundi 00:00 UTC de la semaine courante, format 'YYYY-MM-DD'.
function weekStartUTC(d = new Date()): string {
  const day = (d.getUTCDay() + 6) % 7 // 0 = lundi
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day))
  return monday.toISOString().slice(0, 10)
}
// Prochain lundi 00:00 UTC (ISO complet) — pour l'affichage "reset le …".
function nextWeekStartISO(d = new Date()): string {
  const day = (d.getUTCDay() + 6) % 7
  const nextMonday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day + 7))
  return nextMonday.toISOString()
}

// ── Construction du prompt (miroir de BuildPrompt() de ClaudeService.cs) ──────
interface Champ { name?: unknown; level?: unknown; stats?: unknown; build?: unknown }
interface Scenario { mode?: unknown; allies?: unknown; enemies?: unknown }

function champBlock(c: Champ, side: string): string {
  const name  = String(c.name ?? '').slice(0, 40)
  const level = Number(c.level) || 1
  let s = `\n${name} (${side}) niveau ${level} :\n`
  if (Array.isArray(c.stats)) {
    for (const st of (c.stats as { label?: unknown; value?: unknown }[]).slice(0, 20)) {
      s += `  ${String(st.label ?? '').slice(0, 30)}: ${String(st.value ?? '')}\n`
    }
  }
  if (Array.isArray(c.build) && c.build.length) {
    const items = (c.build as unknown[]).slice(0, 6).map((i) => String(i).slice(0, 60))
    s += `  Build : ${items.join(', ')}\n`
  }
  return s
}

function buildPrompt(scenario: Scenario, advanced: boolean): string {
  const mode    = String(scenario.mode ?? '1v1').slice(0, 20)
  const allies  = scenario.allies  as Champ[]
  const enemies = scenario.enemies as Champ[]
  const alliesNames  = allies.map((c) => String(c.name ?? '')).join(' + ')
  const enemiesNames = enemies.map((c) => String(c.name ?? '')).join(' + ')

  let stats = ''
  for (const a of allies)  stats += champBlock(a, 'allié')
  for (const e of enemies) stats += champBlock(e, 'ennemi')

  if (!advanced) {
    return `Tu es un expert League of Legends. Analyse ce match up ${mode} en 3-4 phrases maximum, de façon succincte :
${alliesNames} VS ${enemiesNames}
${stats}
Donne uniquement : qui domine en early/late et la principale force/faiblesse de chaque côté.`
  }
  return `Tu es un expert League of Legends. Analyse en détail ce match up ${mode} :
${alliesNames} VS ${enemiesNames}
${stats}

Fournis une analyse complète incluant :
1. Phase de lane (early game 1-10 min) : qui domine et pourquoi
2. Mid game (10-20 min) : pics de puissance, objectifs prioritaires
3. Late game (20+ min) : qui scale le mieux
4. Forces et faiblesses de chaque côté
5. Conseils tactiques spécifiques (positionnement, trading pattern, win conditions)
6. Note de difficulté du match up (1-10)
Sois précis et basé sur les stats fournies.`
}

// Valide la forme minimale du scénario. Retourne un message d'erreur ou null.
function validateScenario(s: unknown): string | null {
  if (!s || typeof s !== 'object') return 'scenario manquant.'
  const sc = s as Scenario
  const allies  = sc.allies
  const enemies = sc.enemies
  if (!Array.isArray(allies) || !Array.isArray(enemies)) return 'allies/enemies doivent être des listes.'
  if (allies.length === 0 || enemies.length === 0)       return 'chaque camp doit avoir au moins un champion.'
  if (allies.length + enemies.length > 10)               return 'trop de champions (max 10).'
  for (const c of [...allies, ...enemies]) {
    if (!c || typeof c !== 'object' || !(c as Champ).name) return 'chaque champion doit avoir un nom.'
  }
  return null
}

Deno.serve(async (req) => {
  const cors = handleCors(req)
  if (cors) return cors

  try {
    // ── Auth (JWT obligatoire) ────────────────────────────────────────────
    const user = await getUser(req)
    if (!user) return jsonResponse({ error: 'Authentification requise.' }, 401)

    // ── Client service_role (bypass RLS : lecture tier + RPC quota) ───────
    const db = createClient(
      Deno.env.get('SUPABASE_URL')!,
      requireSecret('SUPABASE_SERVICE_ROLE_KEY'),
    )

    // ── Tier de l'utilisateur → limite + modèle ───────────────────────────
    const { data: profile } = await db
      .from('profiles')
      .select('tier, role')
      .eq('id', user.id)
      .maybeSingle()
    const { limit, model } = resolveConfig(profile?.tier ?? null, profile?.role ?? null)

    // ── GET : lecture pure du quota (affichage « X/N ») ───────────────────
    if (req.method === 'GET') {
      const { data: row } = await db
        .from('usage_counters')
        .select('count')
        .eq('user_id', user.id)
        .eq('feature', FEATURE)
        .eq('period_start', weekStartUTC())
        .maybeSingle()
      const used = row?.count ?? 0
      return jsonResponse({
        used, limit, remaining: Math.max(limit - used, 0),
        model, resets_at: nextWeekStartISO(),
      })
    }

    if (req.method !== 'POST') return jsonResponse({ error: 'Méthode non autorisée.' }, 405)

    // ── Parsing + validation du body ──────────────────────────────────────
    let body: { advanced?: unknown; scenario?: unknown }
    try {
      body = await req.json()
    } catch {
      return jsonResponse({ error: 'Corps de requête invalide (JSON attendu).' }, 400)
    }
    const advanced = body.advanced === true
    const invalid  = validateScenario(body.scenario)
    if (invalid) return jsonResponse({ error: invalid }, 400)

    const prompt = buildPrompt(body.scenario as Scenario, advanced)

    // ── Réservation atomique d'un slot de quota (avant tout appel payant) ──
    const { data: used, error: quotaErr } = await db.rpc('consume_ai_quota', {
      p_user_id: user.id, p_feature: FEATURE, p_limit: limit,
    })
    if (quotaErr) {
      console.error('matchup-analyze: consume_ai_quota error', quotaErr)
      return jsonResponse({ error: 'Erreur serveur (quota).' }, 500)
    }
    // NULL → plafond hebdomadaire atteint : aucun appel Anthropic.
    if (used === null || used === undefined) {
      return jsonResponse(
        { error: 'Quota d\'analyses atteint pour cette semaine.', over_quota: true,
          used: limit, limit, remaining: 0, resets_at: nextWeekStartISO() },
        429,
      )
    }

    // ── Appel Anthropic (clé serveur) ─────────────────────────────────────
    // Sonnet : thinking désactivé (writeup structuré, pas une tâche de raisonnement →
    // évite que l'adaptive thinking mange le budget max_tokens). Haiku : off par défaut.
    const payload: Record<string, unknown> = {
      model,
      max_tokens: advanced ? 3000 : 400,
      messages: [{ role: 'user', content: prompt }],
    }
    if (model.startsWith('claude-sonnet')) payload.thinking = { type: 'disabled' }

    let anthropicOk = false
    let analysis = ''
    let truncated = false
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key':         requireSecret('ANTHROPIC_API_KEY'),
          'anthropic-version': '2023-06-01',
          'content-type':      'application/json',
        },
        body: JSON.stringify(payload),
      })
      const doc = await res.json()
      if (res.ok && !doc.error && Array.isArray(doc.content) && doc.content[0]?.text) {
        analysis  = doc.content[0].text as string
        truncated = doc.stop_reason === 'max_tokens'   // avertissement, pas troncature muette
        anthropicOk = true
      } else {
        console.error('matchup-analyze: Anthropic error', res.status, doc?.error ?? doc)
      }
    } catch (e) {
      console.error('matchup-analyze: Anthropic fetch failed', e instanceof Error ? e.message : String(e))
    }

    // ── Échec Anthropic → refund du slot réservé + 502 ────────────────────
    if (!anthropicOk) {
      const { error: refundErr } = await db.rpc('refund_ai_quota', {
        p_user_id: user.id, p_feature: FEATURE,
      })
      if (refundErr) console.error('matchup-analyze: refund_ai_quota failed', refundErr)
      return jsonResponse({ error: 'Le service d\'analyse est momentanément indisponible.' }, 502)
    }

    // ── Succès ────────────────────────────────────────────────────────────
    return jsonResponse({
      analysis, model, advanced, truncated,
      used, limit, remaining: Math.max(limit - (used as number), 0),
      resets_at: nextWeekStartISO(),
    })
  } catch (e) {
    console.error('matchup-analyze: unhandled exception', e instanceof Error ? e.message : String(e))
    return jsonResponse({ error: 'Erreur serveur inattendue.' }, 500)
  }
})
