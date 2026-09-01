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
//   Flow : auth → lecture tier (profiles) → mapping tier→{crédits,modèle} →
//          consume_ai_credits (débit atomique du coût réel) → appel Anthropic →
//          refund si échec Anthropic → réponse { analysis, used, limit, ... }.
//   Le mapping tier→crédits/modèle vit ICI (pas en DB). Modèle : Haiku pour
//   Apprenti/Forgeron, Sonnet pour Maître et tiers supérieurs.
//
// ── Quota : pot de crédits « Chaleur de la Forge » ──────────────────────────
//   `used`/`limit`/`remaining` sont des CRÉDITS (1 crédit = 0,001 $ estimé),
//   PAS un nombre d'analyses. Le pot est unique par (utilisateur, semaine) et
//   FONGIBLE entre toutes les features IA présentes et futures : la clé de
//   compteur est 'ai_credits', jamais un nom de feature. Chaque appel débite
//   son coût réel, calculé serveur d'après (modèle, advanced) — voir
//   COST_CREDITS. Le client ne transmet jamais de coût.
//
// ── GET /functions/v1/matchup-analyze ───────────────────────────────────────
//   État du solde de la semaine, sans rien consommer :
//   { used, limit, remaining, model, resets_at, costs: { quick, detailed } }.
//   `costs` est nécessaire au client : un solde seul ne dit plus si l'action
//   est finançable (20 crédits payent une rapide à 17, pas une détaillée à 33).
//
// Codes HTTP : 200 · 400 (payload) · 401 (JWT) · 405 (méthode) ·
//              429 (crédits insuffisants) · 502 (échec Anthropic) · 500.
// ════════════════════════════════════════════════════════════════════════════
import { createClient }             from 'https://esm.sh/@supabase/supabase-js@2'
import { handleCors, jsonResponse } from '../_shared/cors.ts'
import { getUser, requireSecret }   from '../_shared/auth.ts'

// Pot de crédits « Chaleur de la Forge » : UNE seule clé de compteur, partagée
// par toutes les features IA (MatchUp, PostGame, …). Pot fongible, premier
// arrivé premier servi. Ne JAMAIS réintroduire de clé par feature ici : ce
// serait recloisonner le budget que ce chantier vient d'unifier.
const CREDIT_FEATURE = 'ai_credits'
const HAIKU   = 'claude-haiku-4-5'
const SONNET  = 'claude-sonnet-5'

// ── Coût d'un appel, en crédits (1 crédit = 0,001 $) ─────────────────────────
// Tarif PIRE CAS (discipline actée au Lot 1) : input maximal mesuré sur un 5v5
// complet + sortie au plafond max_tokens, arrondi au crédit supérieur.
//   détaillée : 3699 tok in + 1400 tok out   ·   rapide : 3446 tok in + 400 out
//
// ⚠️ LE COÛT DÉPEND DU MODÈLE, pas seulement de `advanced`. Le cadrage ne citait
// que 32,1 / 16,3 — ce sont les chiffres SONNET. Les appliquer aux tiers Haiku
// (Apprenti, Forgeron) les surfacturerait d'un facteur 3 : Haiku est à 1 $/5 $
// par MTok contre 3 $/15 $ pour Sonnet. D'où une entrée par modèle.
// Le coût est TOUJOURS calculé ici, côté serveur, et jamais transmis par le
// client (patron intent→grant).
const COST_CREDITS: Record<string, { quick: number; detailed: number }> = {
  [SONNET]: { quick: 17, detailed: 33 },   // 16,3 / 32,1 arrondis au supérieur
  [HAIKU]:  { quick:  6, detailed: 11 },   //  5,4 / 10,7 arrondis au supérieur
}
function costOf(model: string, advanced: boolean): number {
  const row = COST_CREDITS[model] ?? COST_CREDITS[SONNET]   // défaut = le plus cher
  return advanced ? row.detailed : row.quick
}

// Mapping tier → { budget hebdo EN CRÉDITS, modèle }. Clés accentuées = valeurs DB.
// Le budget n'est plus un nombre d'analyses : c'est un solde fongible que chaque
// appel décrémente de son coût réel. Ce qu'un tier peut s'offrir en découle :
//   Apprenti 15 cr  (Haiku)  → 1 détaillée (11) ou 2 rapides (6)
//   Forgeron 65 cr  (Haiku)  → 5 détaillées ou 10 rapides
//   Maître  135 cr  (Sonnet) → 4 détaillées (132) ou 7 rapides
// Les 4 détaillées de Maître restent donc exactement le calibrage du Lot 1.
const TIER_CONFIG: Record<string, { credits: number; model: string }> = {
  'apprenti':    { credits: 15,  model: HAIKU },
  'forgeron':    { credits: 65,  model: HAIKU },
  'maître':      { credits: 135, model: SONNET },
  // ⚠️ NON DÉFINI par le cadrage « Chaleur de la Forge », qui n'a acté que
  // Apprenti/Forgeron/Maître. Aligné sur Maître faute de valeur propre : c'est
  // le choix conservateur côté budget, mais il ne différencie plus ce tier
  // payant supérieur. À trancher avec son budget réel.
  // (`architecte` / `architecte+` retirés de l'offre — migration
  //  20260901000004. Leur budget valait déjà celui de Maître : les comptes
  //  basculés n'ont rien perdu.)
  'légion':      { credits: 135, model: SONNET },
}
// Défaut prudent si tier inconnu/absent : plancher gratuit (Apprenti).
const DEFAULT_CONFIG = TIER_CONFIG['apprenti']

function resolveConfig(tier: string | null, role: string | null): { credits: number; model: string } {
  // ⚠️ Budget admin NON défini par le cadrage non plus. 1000 crédits (~1 $/sem)
  // = large de côté usage, mais BORNÉ : un pot infini rendrait toute fuite ou
  // boucle de test invisible dans le budget.
  if (role === 'admin') return { credits: 1000, model: SONNET }
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
    const { credits: limit, model } = resolveConfig(profile?.tier ?? null, profile?.role ?? null)
    // Grille de coûts du tier — renvoyée au client pour qu'il sache ce qu'il
    // peut s'offrir. Un solde restant ne suffit plus à décider : 20 crédits
    // financent une rapide (17) mais pas une détaillée (33). Le client a donc
    // besoin des DEUX coûts, pas seulement du solde.
    const costs = { quick: costOf(model, false), detailed: costOf(model, true) }

    // ── GET : lecture pure du solde (affichage « X braises ») ─────────────
    if (req.method === 'GET') {
      const { data: row } = await db
        .from('usage_counters')
        .select('count')
        .eq('user_id', user.id)
        .eq('feature', CREDIT_FEATURE)
        .eq('period_start', weekStartUTC())
        .maybeSingle()
      const used = row?.count ?? 0
      return jsonResponse({
        used, limit, remaining: Math.max(limit - used, 0),
        model, resets_at: nextWeekStartISO(), costs,
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

    // ── Débit atomique du coût de l'appel (avant tout appel payant) ────────
    // Le coût est calculé ICI à partir du modèle du tier — jamais transmis par
    // le client (patron intent→grant) : un coût soumis par le client serait un
    // moyen trivial de s'offrir des analyses à 1 crédit.
    const cost = costOf(model, advanced)
    const { data: used, error: quotaErr } = await db.rpc('consume_ai_credits', {
      p_user_id: user.id, p_cost: cost, p_limit: limit,
    })
    if (quotaErr) {
      console.error('matchup-analyze: consume_ai_credits error', quotaErr)
      return jsonResponse({ error: 'Erreur serveur (quota).' }, 500)
    }
    // NULL → solde insuffisant : aucune écriture, donc aucun appel Anthropic.
    // On renvoie le solde RÉEL (pas `used: limit`) : contrairement au modèle
    // « N analyses », un refus ne signifie plus un solde à zéro — il peut rester
    // 20 crédits, assez pour une rapide mais pas pour la détaillée demandée.
    // Le client a besoin du vrai reste pour afficher le bon message.
    if (used === null || used === undefined) {
      const { data: row } = await db
        .from('usage_counters')
        .select('count')
        .eq('user_id', user.id)
        .eq('feature', CREDIT_FEATURE)
        .eq('period_start', weekStartUTC())
        .maybeSingle()
      const spent = row?.count ?? 0
      return jsonResponse(
        { error: 'Crédits IA insuffisants pour cette analyse cette semaine.',
          over_quota: true, used: spent, limit,
          remaining: Math.max(limit - spent, 0),
          cost, model, resets_at: nextWeekStartISO(), costs },
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

    // ── Échec Anthropic → remboursement des crédits débités + 502 ─────────
    // Même montant que le débit : une panne fournisseur ne coûte rien à l'user.
    if (!anthropicOk) {
      const { error: refundErr } = await db.rpc('refund_ai_credits', {
        p_user_id: user.id, p_cost: cost,
      })
      if (refundErr) console.error('matchup-analyze: refund_ai_credits failed', refundErr)
      return jsonResponse({ error: 'Le service d\'analyse est momentanément indisponible.' }, 502)
    }

    // ── Succès ────────────────────────────────────────────────────────────
    // used/limit/remaining sont désormais des CRÉDITS, plus un nombre d'analyses.
    return jsonResponse({
      analysis, model, advanced, truncated,
      used, limit, remaining: Math.max(limit - (used as number), 0),
      cost, costs, resets_at: nextWeekStartISO(),
    })
  } catch (e) {
    console.error('matchup-analyze: unhandled exception', e instanceof Error ? e.message : String(e))
    return jsonResponse({ error: 'Erreur serveur inattendue.' }, 500)
  }
})
