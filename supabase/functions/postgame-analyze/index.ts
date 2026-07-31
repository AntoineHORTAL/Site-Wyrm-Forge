// ════════════════════════════════════════════════════════════════════════════
//  Edge Function : postgame-analyze — bilan IA d'une partie terminée
// ════════════════════════════════════════════════════════════════════════════
// PREMIÈRE BRIQUE du chantier PostGame : une seule combinaison sur les 9 prévues
// (3 profondeurs × 3 modes) — profondeur « Simple », mode « bilan perso ».
// L'objectif est de valider le patron EF/prompt/coût avant de généraliser ;
// `depth` et `mode` sont donc acceptés mais bornés à leur unique valeur admise,
// pour que l'ouverture aux autres combinaisons ne change pas le contrat client.
//
// Reprend intégralement le patron matchup-analyze : proxy Anthropic SERVEUR
// (ANTHROPIC_API_KEY jamais exposée), JWT obligatoire, débit du pot de crédits
// « Chaleur de la Forge » via consume_ai_credits, remboursement sur panne.
//
// ── POST /functions/v1/postgame-analyze ─────────────────────────────────────
//   Body : { matchId, puuid, platform?, depth?: 'simple', mode?: 'perso' }
//   `platform` est déduite du préfixe du matchId si absente (EUW1_… → euw1).
//   Flow : auth → tier → riot-match-detail (interne) → extraction du joueur →
//          prompt → consume_ai_credits → Anthropic → refund si échec.
//
// ── GET /functions/v1/postgame-analyze ──────────────────────────────────────
//   État du solde, sans rien consommer :
//   { used, limit, remaining, model, resets_at, costs: { simple_perso } }.
//   Même sémantique que matchup-analyze : ce sont des CRÉDITS, pas un nombre
//   d'analyses, et `costs` est indispensable au client pour savoir s'il peut
//   se permettre l'action.
//
// Codes : 200 · 400 · 401 · 404 (match ou joueur introuvable) · 405 ·
//         429 (crédits insuffisants) · 502 (Anthropic KO) · 503 (Riot) · 500.
// ════════════════════════════════════════════════════════════════════════════
import { createClient }             from 'https://esm.sh/@supabase/supabase-js@2'
import { handleCors, jsonResponse } from '../_shared/cors.ts'
import { getUser, requireSecret }   from '../_shared/auth.ts'

const CREDIT_FEATURE = 'ai_credits'   // pot partagé — jamais une clé par feature
const HAIKU  = 'claude-haiku-4-5'
const SONNET = 'claude-sonnet-5'

// Budget hebdo par tier, en crédits. Identique à matchup-analyze : le pot est
// FONGIBLE entre toutes les features IA, donc c'est le même solde qui est
// débité ici. Ne pas introduire de budget propre à PostGame.
const TIER_CONFIG: Record<string, { credits: number; model: string }> = {
  'apprenti':    { credits: 15,  model: HAIKU },
  'forgeron':    { credits: 65,  model: HAIKU },
  'maître':      { credits: 135, model: SONNET },
  'légion':      { credits: 135, model: SONNET },
  'architecte':  { credits: 135, model: SONNET },
  'architecte+': { credits: 135, model: SONNET },
}
const DEFAULT_CONFIG = TIER_CONFIG['apprenti']

function resolveConfig(tier: string | null, role: string | null) {
  if (role === 'admin') return { credits: 1000, model: SONNET }
  return (tier && TIER_CONFIG[tier]) || DEFAULT_CONFIG
}

// ── Coût de la combinaison « simple + perso », en crédits ───────────────────
// MESURÉ pour CETTE combinaison (26 appels réels, 4 cas × 2 modèles : partie
// courte/moyenne/longue + pire cas aux plafonds de l'EF). PAS repris de MatchUp :
// le contenu diffère, il fallait le chiffrer à part.
//   entrée max mesurée : 974 tok (Haiku) / 1140 (Sonnet), aux plafonds
//   structurels (25 achats + 15 morts) avec de vrais noms d'objets FR
//   sortie max observée : 317 (Haiku) / 543 (Sonnet) sur 900 → 40 % de marge
//   0 troncature sur les 26 runs
// Tarif pire cas = entrée max × sortie au plafond MAX_TOKENS, arrondi au crédit
// supérieur (discipline du Lot 1).
//
// La sortie est quasi constante quelle que soit la taille de l'entrée (~290
// Haiku, ~400 Sonnet) : c'est le template de réponse qui pilote le coût, pas le
// volume de données. Ne pas rallonger les consignes sans re-mesurer.
const MAX_TOKENS = 900
const COST_CREDITS: Record<string, { simple_perso: number }> = {
  [SONNET]: { simple_perso: 17 },   // 1140×3 + 900×15 = 0,01692 $ → 16,92 cr
  [HAIKU]:  { simple_perso: 6 },    //  974×1 + 900×5  = 0,00547 $ →  5,47 cr
}
const costOf = (model: string) =>
  (COST_CREDITS[model] ?? COST_CREDITS[SONNET]).simple_perso

// ── Fenêtre semaine (miroir du date_trunc('week') SQL) ──────────────────────
function weekStartUTC(d = new Date()): string {
  const day = (d.getUTCDay() + 6) % 7
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day))
    .toISOString().slice(0, 10)
}
function nextWeekStartISO(d = new Date()): string {
  const day = (d.getUTCDay() + 6) % 7
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day + 7)).toISOString()
}

// ── Validation d'entrée ─────────────────────────────────────────────────────
const ROUTING_KEYS = new Set([
  'euw1', 'eun1', 'tr1', 'ru', 'na1', 'br1', 'la1', 'la2', 'oc1', 'kr', 'jp1',
])
const MATCH_ID_RE = /^[A-Z0-9]+_\d+$/
// Vrai PUUID Riot : 78 car., charset [A-Za-z0-9_-]. JAMAIS un UUID v4 — c'est le
// GUID anonymisé du LCU, piège documenté dans AGENTS.md § riot-matches.
const PUUID_RE = /^[A-Za-z0-9_-]{70,128}$/

// ── DDragon : noms d'items, mémoïsés au niveau module ───────────────────────
// Les instances Deno sont réutilisées entre requêtes : un seul fetch par
// instance chaude. Pas de mise en cache DB — `riot_cache.function_name` porte
// une contrainte CHECK qu'il faudrait étendre par migration pour rien.
// Échec DDragon → on dégrade proprement (l'item devient « objet inconnu »),
// jamais d'erreur remontée à l'utilisateur pour un libellé cosmétique.
let _items: Record<string, string> | null = null
async function itemNames(): Promise<Record<string, string>> {
  if (_items) return _items
  try {
    const versions = await (await fetch('https://ddragon.leagueoflegends.com/api/versions.json')).json()
    const data = await (await fetch(
      `https://ddragon.leagueoflegends.com/cdn/${versions[0]}/data/fr_FR/item.json`)).json()
    const out: Record<string, string> = {}
    for (const [id, it] of Object.entries(data.data as Record<string, { name: string }>)) {
      out[id] = it.name
    }
    _items = out
  } catch {
    _items = {}
  }
  return _items
}

// ── Zone approximative d'une mort ───────────────────────────────────────────
// La carte fait ~14 870 unités de côté, base bleue (équipe 100) en bas-gauche.
// Heuristique volontairement grossière et documentée : la diagonale bas-gauche
// → haut-droite sépare la voie du bas de la voie du haut ; la bande centrale
// autour de cette diagonale est le mid/la rivière. La somme x+y situe la moitié
// de carte. Suffisant pour un bilan (« mort à 12 min, moitié adverse »), pas
// pour une analyse de positionnement fine.
function deathZone(x: number, y: number, teamId: number): string {
  const d = x - y
  const lane = Math.abs(d) < 2500 ? 'milieu/rivière' : (d > 0 ? 'voie du bas' : 'voie du haut')
  const ownHalf = teamId === 100 ? (x + y) < 14870 : (x + y) > 14870
  return `${lane}, ${ownHalf ? 'moitié alliée' : 'moitié adverse'}`
}

const mmss = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

// ── Construction du prompt ──────────────────────────────────────────────────
// Condensé DÈS LE DÉPART (leçon du Lot 1 : le coût est piloté par le template
// de réponse, pas par le volume d'entrée). Budget global explicite en mots,
// sections numérotées avec plafond par section, interdiction de recopier les
// chiffres fournis. Ne pas « enrichir » ce bloc sans re-mesurer le coût.
interface PlayerFacts {
  champion: string; position: string; win: boolean; durationS: number
  kills: number; deaths: number; assists: number
  cs: number; csPerMin: string
  damageDealt: number; damageTaken: number
  visionScore: number; wardsPlaced: number; wardsKilled: number; controlWards: number
  build: string[]; trinket: string
  purchases: string[]     // « 8:14 Écho de Luden »
  deathList: string[]     // « 12:03 — voie du bas, moitié adverse »
}

function buildPrompt(f: PlayerFacts): string {
  const res = f.win ? 'Victoire' : 'Défaite'
  const dur = mmss(f.durationS * 1000)
  return `Tu es un coach League of Legends. Fais le bilan de la partie d'un joueur.

${f.champion}${f.position ? ` (${f.position})` : ''} — ${res} en ${dur}
KDA ${f.kills}/${f.deaths}/${f.assists} · ${f.cs} CS (${f.csPerMin}/min)
Dégâts infligés aux champions ${f.damageDealt} · dégâts subis ${f.damageTaken}
Vision ${f.visionScore} · ${f.wardsPlaced} balises posées, ${f.wardsKilled} détruites, ${f.controlWards} balises de contrôle
Build final : ${f.build.join(', ') || 'aucun objet'}${f.trinket ? ` · ${f.trinket}` : ''}
Ordre d'achat : ${f.purchases.join(' → ') || 'aucun achat enregistré'}
Morts : ${f.deathList.length ? f.deathList.join(' · ') : 'aucune'}

Réponds en 300 mots maximum, en français, avec exactement ces 4 sections :

1. Ce qui a marché — 2 puces maximum, 15 mots par puce.
2. Ce qui a coûté la partie — 2 puces maximum, 15 mots par puce. Appuie-toi sur le timing des morts et sur l'ordre d'achat.
3. La priorité pour la prochaine partie — une seule action concrète, 2 phrases maximum.
4. Note de performance — /10 suivi d'une seule phrase de justification.

Va droit au but : aucune introduction, aucune conclusion. Les chiffres ci-dessus te servent à juger, ne les recopie pas dans ta réponse.`
}

// ── Appel interne à riot-match-detail ───────────────────────────────────────
// Réutilise l'EF existante plutôt que de refrapper Riot : bénéficie de son
// cache permanent, de son comptage de quota et de son circuit breaker.
async function fetchMatch(matchId: string, platform: string) {
  const base = Deno.env.get('SUPABASE_URL')!
  const anon = requireSecret('SUPABASE_ANON_KEY')
  const qs = new URLSearchParams({ matchId, platform })
  const res = await fetch(`${base}/functions/v1/riot-match-detail?${qs}`, {
    headers: { apikey: anon, Authorization: `Bearer ${anon}` },
  })
  const body = await res.json().catch(() => null)
  return { ok: res.ok, status: res.status, body }
}

Deno.serve(async (req) => {
  const cors = handleCors(req)
  if (cors) return cors

  try {
    const user = await getUser(req)
    if (!user) return jsonResponse({ error: 'Authentification requise.' }, 401)

    const db = createClient(
      Deno.env.get('SUPABASE_URL')!,
      requireSecret('SUPABASE_SERVICE_ROLE_KEY'),
    )

    const { data: profile } = await db
      .from('profiles').select('tier, role').eq('id', user.id).maybeSingle()
    const { credits: limit, model } = resolveConfig(profile?.tier ?? null, profile?.role ?? null)
    const costs = { simple_perso: costOf(model) }

    // ── GET : lecture pure du solde ───────────────────────────────────────
    if (req.method === 'GET') {
      const { data: row } = await db
        .from('usage_counters').select('count')
        .eq('user_id', user.id).eq('feature', CREDIT_FEATURE)
        .eq('period_start', weekStartUTC()).maybeSingle()
      const used = row?.count ?? 0
      return jsonResponse({
        used, limit, remaining: Math.max(limit - used, 0),
        model, resets_at: nextWeekStartISO(), costs,
      })
    }

    if (req.method !== 'POST') return jsonResponse({ error: 'Méthode non autorisée.' }, 405)

    let body: Record<string, unknown>
    try { body = await req.json() } catch {
      return jsonResponse({ error: 'Corps de requête invalide (JSON attendu).' }, 400)
    }

    const matchId = String(body.matchId ?? '').trim()
    const puuid   = String(body.puuid ?? '').trim()
    // Bornées à leur unique valeur admise tant que les 8 autres combinaisons
    // n'existent pas : mieux vaut un 400 explicite qu'une analyse « simple »
    // silencieusement rendue pour une profondeur que le client croyait obtenir.
    const depth = String(body.depth ?? 'simple')
    const mode  = String(body.mode  ?? 'perso')
    if (depth !== 'simple' || mode !== 'perso') {
      return jsonResponse({ error: 'Seule la combinaison depth=simple, mode=perso est disponible.' }, 400)
    }
    if (!MATCH_ID_RE.test(matchId)) return jsonResponse({ error: 'Format matchId invalide.' }, 400)
    if (!PUUID_RE.test(puuid))      return jsonResponse({ error: 'Format PUUID invalide.' }, 400)

    const platform = String(body.platform ?? matchId.split('_')[0]).toLowerCase()
    if (!ROUTING_KEYS.has(platform)) return jsonResponse({ error: 'Région invalide.' }, 400)

    // ── Détail du match ───────────────────────────────────────────────────
    const match = await fetchMatch(matchId, platform)
    if (!match.ok) {
      // 404 upstream = match inexistant ; le reste (429/503) est transitoire et
      // relayé tel quel pour que le client puisse reproposer l'action.
      const status = match.status === 404 ? 404 : (match.status === 429 ? 429 : 503)
      return jsonResponse(
        { error: match.body?.error ?? 'Détail du match indisponible.' }, status)
    }

    // deno-lint-ignore no-explicit-any
    const parts: any[] = match.body?.participants ?? []
    const idx = parts.findIndex((p) => p.puuid === puuid)
    if (idx < 0) return jsonResponse({ error: 'Ce joueur ne figure pas dans cette partie.' }, 404)
    const p   = parts[idx]
    const pid = idx + 1   // participantId Riot = index + 1 (convention de riot-match-detail)

    const names = await itemNames()
    const nameOf = (id: number) => (id ? (names[String(id)] ?? `objet ${id}`) : null)

    const durationS = Number(match.body?.gameDuration ?? 0) || 1
    // deno-lint-ignore no-explicit-any
    const deaths: any[] = (match.body?.kills ?? []).filter((k: any) => k.victimId === pid)

    const facts: PlayerFacts = {
      champion: String(p.championName ?? ''),
      position: String(p.teamPosition ?? ''),
      win: p.win === true,
      durationS,
      kills: p.kills ?? 0, deaths: p.deaths ?? 0, assists: p.assists ?? 0,
      cs: p.cs ?? 0,
      csPerMin: ((p.cs ?? 0) / (durationS / 60)).toFixed(1),
      damageDealt: p.damageDealt ?? 0, damageTaken: p.damageTaken ?? 0,
      visionScore: p.visionScore ?? 0, wardsPlaced: p.wardsPlaced ?? 0,
      wardsKilled: p.wardsKilled ?? 0, controlWards: p.controlWards ?? 0,
      build: (p.items ?? []).map(nameOf).filter(Boolean) as string[],
      trinket: nameOf(p.trinket) ?? '',
      // Achats seulement (ni ventes ni annulations) : le fil chronologique de
      // construction, sans le bruit des allers-retours en boutique.
      // deno-lint-ignore no-explicit-any
      purchases: (p.itemEvents ?? [])
        .filter((e: any) => e.type === 'PURCHASED')
        .map((e: any) => ({ ts: e.ts, name: nameOf(e.itemId) }))
        .filter((e: { name: string | null }) => e.name)
        .slice(0, 25)
        .map((e: { ts: number; name: string }) => `${mmss(e.ts)} ${e.name}`),
      // deno-lint-ignore no-explicit-any
      deathList: deaths.slice(0, 15).map((k: any) =>
        `${mmss(k.ts)} — ${deathZone(k.position?.x ?? 0, k.position?.y ?? 0, p.teamId ?? 100)}`),
    }

    const prompt = buildPrompt(facts)

    // ── Débit du pot de crédits (avant tout appel payant) ─────────────────
    const cost = costOf(model)
    const { data: used, error: quotaErr } = await db.rpc('consume_ai_credits', {
      p_user_id: user.id, p_cost: cost, p_limit: limit,
    })
    if (quotaErr) {
      console.error('postgame-analyze: consume_ai_credits error', quotaErr)
      return jsonResponse({ error: 'Erreur serveur (quota).' }, 500)
    }
    if (used === null || used === undefined) {
      const { data: row } = await db
        .from('usage_counters').select('count')
        .eq('user_id', user.id).eq('feature', CREDIT_FEATURE)
        .eq('period_start', weekStartUTC()).maybeSingle()
      const spent = row?.count ?? 0
      return jsonResponse(
        { error: 'Crédits IA insuffisants pour cette analyse cette semaine.',
          over_quota: true, used: spent, limit,
          remaining: Math.max(limit - spent, 0),
          cost, model, resets_at: nextWeekStartISO(), costs },
        429,
      )
    }

    // ── Appel Anthropic ───────────────────────────────────────────────────
    const payload: Record<string, unknown> = {
      model, max_tokens: MAX_TOKENS,
      messages: [{ role: 'user', content: prompt }],
    }
    if (model.startsWith('claude-sonnet')) payload.thinking = { type: 'disabled' }

    let analysis = '', truncated = false, anthropicOk = false
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
        analysis    = doc.content[0].text as string
        truncated   = doc.stop_reason === 'max_tokens'
        anthropicOk = true
      } else {
        console.error('postgame-analyze: Anthropic error', res.status, doc?.error ?? doc)
      }
    } catch (e) {
      console.error('postgame-analyze: Anthropic fetch failed', e instanceof Error ? e.message : String(e))
    }

    if (!anthropicOk) {
      const { error: refundErr } = await db.rpc('refund_ai_credits', {
        p_user_id: user.id, p_cost: cost,
      })
      if (refundErr) console.error('postgame-analyze: refund_ai_credits failed', refundErr)
      return jsonResponse({ error: 'Le service d\'analyse est momentanément indisponible.' }, 502)
    }

    return jsonResponse({
      analysis, model, depth, mode, truncated,
      champion: facts.champion, win: facts.win,
      used, limit, remaining: Math.max(limit - (used as number), 0),
      cost, costs, resets_at: nextWeekStartISO(),
    })
  } catch (e) {
    console.error('postgame-analyze: unhandled exception', e instanceof Error ? e.message : String(e))
    return jsonResponse({ error: 'Erreur serveur inattendue.' }, 500)
  }
})
