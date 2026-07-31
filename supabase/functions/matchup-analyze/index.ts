// ════════════════════════════════════════════════════════════════════════════
//  Edge Function : matchup-analyze — analyse IA d'un match up League of Legends
// ════════════════════════════════════════════════════════════════════════════
// Proxy serveur pour l'appel Anthropic : la clé ANTHROPIC_API_KEY reste CÔTÉ
// SERVEUR (secret Supabase), jamais exposée au client WPF. Le prompt est
// reconstruit ici — le client n'envoie que des données structurées.
// Prompt de réponse détaillée : V2 (4 sections), voir buildPrompt + AGENTS.md
// §« Coût réel mesuré de matchup-analyze ». L'ancien format à 6 sections (V1,
// miroir historique de BuildPrompt() de ClaudeService.cs) tronquait à chaque
// analyse 5v5 et coûtait 2,3× plus cher.
//
// Auth : JWT obligatoire (verify_jwt=true dans config.toml + getUser en code).
//
// ── POST /functions/v1/matchup-analyze ──────────────────────────────────────
//   Body : { advanced: boolean, scenario: { mode, allies[], enemies[] } }
//     champ = { name, level, stats?: [{label,value}], build?: string[],
//               role?: 'TOP'|'JUNGLE'|'MID'|'ADC'|'SUPPORT' }
//   `role` est OPTIONNEL : absent/inconnu → prompt identique à l'ancien format
//   (rétrocompatible avec un client WPF/web pré-migration).
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

// Mapping tier → { limite hebdo, modèle }. Les clés accentuées matchent la DB.
//
// ⚠️⚠️ CE COMPTEUR EST PARTAGÉ ENTRE ANALYSE RAPIDE ET ANALYSE DÉTAILLÉE.
// Il n'existe qu'une seule `feature` ('matchup_analyze') et `consume_ai_quota`
// est appelée avec la même limite quel que soit `advanced`. Conséquence directe
// du passage de Maître à 4 : un utilisateur Maître dispose de 4 analyses PAR
// SEMAINE AU TOTAL, rapides et détaillées confondues — pas de 4 détaillées EN
// PLUS des rapides. Quatre analyses rapides épuisent son quota détaillé.
// C'est une limite d'ARCHITECTURE, pas un choix : exprimer « 4 détaillées + N
// rapides » exige les deux compteurs séparés (`matchup_quick` /
// `matchup_detailed`) décrits dans AGENTS.md § Quotas IA différenciés. Tant que
// ce chantier n'est pas fait, 4 est un plafond global.
//
// Calibrage du 4 (Lot 1 chantier budget IA) : une analyse détaillée Sonnet 5v5
// coûte 23,4 crédits mesurés, 32,1 au pire structurel (1400 tokens de sortie).
// 4 × 32,1 = 128,4 sur un budget de 135 crédits/semaine, soit 95 %. Il n'y a
// pas de place pour une 5ᵉ — ne pas remonter sans refaire la mesure.
const TIER_CONFIG: Record<string, { limit: number; model: string }> = {
  'apprenti':    { limit: 3,   model: HAIKU },
  'forgeron':    { limit: 10,  model: HAIKU },
  'maître':      { limit: 4,   model: SONNET },   // 100 → 4 (Lot 1 budget IA)
  // ⚠️ Tiers supérieurs NON recalibrés : toujours 100/sem, soit ~2 340 crédits
  // au coût mesuré. Si leur budget est du même ordre que les 135 de Maître, ils
  // sont encore ~17× au-dessus. Hors périmètre du Lot 1 (qui ne cadrait que
  // Maître) — à trancher avec le budget propre à chacun de ces tiers.
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
interface Champ { name?: unknown; level?: unknown; stats?: unknown; build?: unknown; role?: unknown }
interface Scenario { mode?: unknown; allies?: unknown; enemies?: unknown }

// Rôle par slot (OPTIONNEL — ajouté au contrat sans casser les anciens clients).
// Libellés FR pour enrichir le contexte tactique de l'analyse. Un rôle absent ou
// inconnu n'ajoute rien : le bloc champion reste alors identique à l'ancien format.
const ROLE_LABELS: Record<string, string> = {
  TOP: 'Top', JUNGLE: 'Jungle', MID: 'Mid', ADC: 'ADC', SUPPORT: 'Support',
}
function roleLabel(role: unknown): string | null {
  if (typeof role !== 'string') return null
  return ROLE_LABELS[role.toUpperCase()] ?? null
}

function champBlock(c: Champ, side: string): string {
  const name  = String(c.name ?? '').slice(0, 40)
  const level = Number(c.level) || 1
  // Le rôle n'est injecté que s'il est présent ET valide → sans rôle, la ligne
  // reste strictement identique à l'ancien format (rétrocompatibilité).
  const rl    = roleLabel(c.role)
  const who   = rl ? `${side}, ${rl}` : side
  let s = `\n${name} (${who}) niveau ${level} :\n`
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
  // Prompt V2 (Lot 1 chantier Budget IA, 2026-07-31) — 4 sections au lieu de 6.
  // Mesuré : −57 % de coût sur un 5v5 complet (55,7 → 24,0 crédits) et surtout
  // ZÉRO troncature (l'ancien format à 6 sections saturait max_tokens 5/5 fois
  // dès 4 champions : toute analyse détaillée 5v5 partait coupée).
  // Trois leviers, par ordre d'impact : budget global explicite en mots ; fusion
  // des 3 phases en une section (elles sont CONSERVÉES, une phrase chacune —
  // seul le préambule répété par section disparaît) ; interdiction de recopier
  // les stats (avec 10 champions × 20 stats, leur ré-énoncé était un poste de
  // sortie majeur). Aucun client ne parse les sections (web MatchUpTab.tsx l.310
  // `whiteSpace: pre-wrap`, WPF MatchUpEditorView.xaml.cs l.890 TextBlock
  // unique) : le format de réponse est libre, seule sa LONGUEUR est contrainte.
  return `Tu es un expert League of Legends. Analyse ce match up ${mode} :
${alliesNames} VS ${enemiesNames}
${stats}

Réponds en 400 mots maximum, en français, avec exactement ces 4 sections :

1. Déroulé de partie — une phrase par phase : early (1-10 min), mid (10-20 min), late (20+ min). Qui domine, pourquoi, et l'objectif prioritaire.
2. Forces et faiblesses — exactement 2 puces pour le camp allié et exactement 2 pour le camp ennemi, soit 4 puces au total et pas une de plus. 12 mots maximum par puce. Ne garde que les 2 points les plus décisifs par camp.
3. Conseils tactiques — 3 puces maximum : positionnement, trading pattern, win condition.
4. Difficulté — une note sur 10 suivie d'une seule phrase de justification.

Va droit au but : aucune introduction, aucune conclusion. Appuie-toi sur les stats fournies sans les recopier.`
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
    // max_tokens détaillée : 1400 (Lot 1 chantier Budget IA). Calé sur la sortie
    // maximale RÉELLEMENT observée du prompt V2 (876 tokens sur 16 runs à 1400,
    // 1004 sur les campagnes à 3000) + ~40 % de marge. L'ancienne valeur de 3000
    // n'était pas un budget mais un plafond que le prompt V1 atteignait
    // systématiquement (5/5 runs tronqués dès 4 champions).
    // ⚠️ Ne pas remonter cette valeur sans refaire la mesure : à 4 analyses/sem,
    // 1400 tokens de sortie consomment déjà 95 % du budget hebdo du tier Maître.
    const payload: Record<string, unknown> = {
      model,
      max_tokens: advanced ? 1400 : 400,
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
