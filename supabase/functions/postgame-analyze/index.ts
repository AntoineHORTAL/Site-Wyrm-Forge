// ════════════════════════════════════════════════════════════════════════════
//  Edge Function : postgame-analyze — bilan IA d'une partie terminée
// ════════════════════════════════════════════════════════════════════════════
// LES 9 COMBINAISONS : 3 profondeurs (simple/medium/advanced) × 3 modes
// (perso/adversaire/les_deux). La première brique n'en ouvrait qu'une
// (simple × perso) pour valider le patron EF/prompt/coût ; le contrat portait
// déjà `depth`/`mode`, donc cette généralisation ne casse aucun client — les
// défauts restent `simple`/`perso`.
//
// ⚠️ Le prompt vit dans `_shared/postgame-prompt.ts` (module PUR) pour que le
// script de mesure `scripts/postgame-measure.ts` importe le prompt EXACT de
// production. `simple × perso` y est verrouillé byte-à-byte par un test : ce
// prompt est déjà tarifé en prod, le modifier rendrait son prix faux.
//
// ⚠️ Aucun enrichissement de `riot-match-detail` n'a été nécessaire : runes,
// sorts, ordre des compétences, courbes, objectifs, bans et faits d'armes sont
// TOUS déjà dans le cache v3. Pas de bump de clé de cache, donc pas de
// re-paiement d'appels Riot sur les matchs déjà consultés.
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
import {
import { isFeatureEnabled } from '../_shared/feature-flags.ts'
  buildPostGamePrompt, comboKey, DEPTHS, MODES, MAX_TOKENS,
  type PostGameDepth, type PostGameMode, type PlayerFacts, type MatchFacts,
} from '../_shared/postgame-prompt.ts'

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
  // `architecte` / `architecte+` retirés de l'offre (migration 20260901000004).
  // Même budget que Maître : les comptes basculés n'ont rien perdu.
  'légion':      { credits: 135, model: SONNET },
}
const DEFAULT_CONFIG = TIER_CONFIG['apprenti']

function resolveConfig(tier: string | null, role: string | null) {
  if (role === 'admin') return { credits: 1000, model: SONNET }
  return (tier && TIER_CONFIG[tier]) || DEFAULT_CONFIG
}

// ── Grille de coûts : 9 combinaisons × 2 modèles, en crédits ────────────────
// ⚠️ CHAQUE VALEUR EST MESURÉE, aucune n'est extrapolée depuis une autre — la
// mesure du Lot 1 a montré que le template pilote le coût, donc un ratio
// observé sur une combinaison ne se transpose pas à une autre.
// Protocole (identique à celui de `simple_perso`) : cas synthétiques aux
// PLAFONDS STRUCTURELS de l'EF (25 achats, 15 morts, 18 skills, 8 points de
// courbe, 25 objectifs, 2 joueurs complets en mode `les_deux`), appels réels
// non mockés, `usage.input_tokens`/`output_tokens` de la réponse Anthropic.
// Tarif pire cas = entrée max mesurée × prix in + MAX_TOKENS × prix out,
// arrondi au crédit supérieur. Script rejouable : `scripts/postgame-measure.ts`.
//
// 1 crédit = 0,001 $. Sonnet 5 : 3 $/15 $ par MTok — Haiku 4.5 : 1 $/5 $.
// ⚠️ Sonnet est en tarif d'introduction jusqu'au 31/08/2026 : ces chiffres sont
// au tarif STANDARD, donc déjà valables après la hausse.
//
// ✅ MESURÉ le 2026-08-01 — 54 appels réels (9 combinaisons × 2 modèles ×
// 3 runs : 2 au pire cas pour la variance + 1 typique). **0 troncature.**
// Marge de sortie : simple 32 %, medium 29 %, advanced 33 %.
//
// Contrôle de non-régression : `simple_perso` est retombé sur 17/6, soit
// exactement le tarif déjà en production — l'invariant byte-à-byte du prompt
// tient, et le protocole de mesure est reproductible.
//
// 🪤 Piège de méthode : un premier passage à 1 run par combinaison donnait des
// sorties max bien plus basses (404 au lieu de 614 sur `simple_adversaire`).
// Calibrer les plafonds sur un échantillon unique aurait mené à des
// troncatures en production. Toujours au moins 2 runs sur le pire cas.
type CostTable = Record<string, number>
const COST_CREDITS: Record<string, CostTable> = {
  [SONNET]: {
    simple_perso:   17, simple_adversaire:   17, simple_les_deux:   20,
    medium_perso:   22, medium_adversaire:   22, medium_les_deux:   25,
    advanced_perso: 27, advanced_adversaire: 27, advanced_les_deux: 31,
  },
  [HAIKU]: {
    simple_perso:    6, simple_adversaire:    6, simple_les_deux:    7,
    medium_perso:    7, medium_adversaire:    7, medium_les_deux:    8,
    advanced_perso:  9, advanced_adversaire:  9, advanced_les_deux: 10,
  },
}

const costsFor = (model: string): CostTable => COST_CREDITS[model] ?? COST_CREDITS[SONNET]
const costOf = (model: string, depth: PostGameDepth, mode: PostGameMode): number =>
  costsFor(model)[comboKey(depth, mode)] ?? costsFor(SONNET)[comboKey(depth, mode)] ?? 0

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
// Un seul fetch de version pour les 4 dictionnaires, mémoïsé comme eux.
let _version: string | null = null
async function ddragonVersion(): Promise<string> {
  if (_version) return _version
  const versions = await (await fetch('https://ddragon.leagueoflegends.com/api/versions.json')).json()
  _version = versions[0] as string
  return _version
}

/** Charge un dictionnaire DDragon `id → nom`, mémoïsé. `{}` si indisponible. */
async function ddragonNames(
  file: string,
  pick: (data: Record<string, unknown>) => Record<string, string>,
  cache: { v: Record<string, string> | null },
): Promise<Record<string, string>> {
  if (cache.v) return cache.v
  try {
    const v = await ddragonVersion()
    const doc = await (await fetch(
      `https://ddragon.leagueoflegends.com/cdn/${v}/data/fr_FR/${file}`)).json()
    cache.v = pick(doc)
  } catch {
    cache.v = {}
  }
  return cache.v
}

const _items    = { v: null as Record<string, string> | null }
const _champs   = { v: null as Record<string, string> | null }
const _spells   = { v: null as Record<string, string> | null }
const _runes    = { v: null as Record<string, string> | null }

// deno-lint-ignore no-explicit-any
const byId = (d: any): Record<string, string> => {
  const out: Record<string, string> = {}
  for (const [id, it] of Object.entries(d.data as Record<string, { name: string }>)) out[id] = it.name
  return out
}
// champion.json / summoner.json sont indexés par CLÉ (« Ahri »), pas par id
// numérique — c'est `data[x].key` qui porte l'id que renvoie l'API match.
// deno-lint-ignore no-explicit-any
const byNumericKey = (d: any): Record<string, string> => {
  const out: Record<string, string> = {}
  for (const it of Object.values(d.data as Record<string, { key: string; name: string }>)) {
    out[String(it.key)] = it.name
  }
  return out
}

const itemNames  = () => ddragonNames('item.json',     byId,          _items)
const champNames = () => ddragonNames('champion.json', byNumericKey,  _champs)
const spellNames = () => ddragonNames('summoner.json', byNumericKey,  _spells)

// runesReforged.json a une forme propre : arbres → slots → runes.
async function runeNames(): Promise<Record<string, string>> {
  if (_runes.v) return _runes.v
  try {
    const v = await ddragonVersion()
    // deno-lint-ignore no-explicit-any
    const trees: any[] = await (await fetch(
      `https://ddragon.leagueoflegends.com/cdn/${v}/data/fr_FR/runesReforged.json`)).json()
    const out: Record<string, string> = {}
    for (const tree of trees) {
      out[String(tree.id)] = tree.name
      for (const slot of tree.slots ?? []) {
        for (const r of slot.runes ?? []) out[String(r.id)] = r.name
      }
    }
    _runes.v = out
  } catch {
    _runes.v = {}
  }
  return _runes.v
}

// Fragments de stats (statPerks) : absents de runesReforged.json, libellés en dur.
const STAT_SHARDS: Record<number, string> = {
  5001: 'PV', 5002: 'Armure', 5003: 'Résistance magique',
  5005: 'Vitesse d\'attaque', 5007: 'Hâte de compétences',
  5008: 'Force adaptative', 5011: 'PV', 5013: 'Célérité',
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

// ── Extraction des faits depuis la réponse riot-match-detail ────────────────
// Le prompt lui-même vit dans `_shared/postgame-prompt.ts` (module pur, importé
// aussi par le script de mesure). Ici on ne fait que TRADUIRE la réponse Riot
// en `PlayerFacts`/`MatchFacts`, en respectant des plafonds structurels : ces
// plafonds sont ce qui borne le coût d'entrée « pire cas » de chaque palier.
const CAP_PURCHASES = 25   // ordre d'achat
const CAP_DEATHS    = 15   // morts listées
const CAP_SKILLS    = 18   // montées de compétences
const CAP_CURVE     = 8    // points de courbe (1 tous les 5 min)
const CAP_OBJECTIVES = 25  // événements d'objectifs

const SKILL_LETTER = ['', 'Q', 'W', 'E', 'R']

/** Un point de courbe toutes les 5 minutes — pas une ligne par frame. */
// deno-lint-ignore no-explicit-any
function buildCurve(frames: any[], idx: number): string[] {
  const out: string[] = []
  for (const f of frames) {
    const min = Math.round((f.ts ?? 0) / 60000)
    if (min === 0 || min % 5 !== 0) continue
    const gold = f.playerGold?.[idx] ?? 0
    const xp   = f.playerXp?.[idx]   ?? 0
    const cs   = f.playerCs?.[idx]   ?? 0
    out.push(`${min}min ${(gold / 1000).toFixed(1)}k or / ${(xp / 1000).toFixed(1)}k XP / ${cs} CS`)
    if (out.length >= CAP_CURVE) break
  }
  return out
}

interface NameDicts {
  items: Record<string, string>; champs: Record<string, string>
  spells: Record<string, string>; runes: Record<string, string>
}

// deno-lint-ignore no-explicit-any
function playerFacts(
  p: any, pid: number, durationS: number, depth: string,
  // deno-lint-ignore no-explicit-any
  body: any, dicts: NameDicts,
): PlayerFacts {
  const nameOf = (id: number) => (id ? (dicts.items[String(id)] ?? `objet ${id}`) : null)
  // deno-lint-ignore no-explicit-any
  const deaths: any[] = (body?.kills ?? []).filter((k: any) => k.victimId === pid)

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
      .slice(0, CAP_PURCHASES)
      .map((e: { ts: number; name: string }) => `${mmss(e.ts)} ${e.name}`),
    // deno-lint-ignore no-explicit-any
    deathList: deaths.slice(0, CAP_DEATHS).map((k: any) =>
      `${mmss(k.ts)} — ${deathZone(k.position?.x ?? 0, k.position?.y ?? 0, p.teamId ?? 100)}`),
  }

  if (depth !== 'simple') {
    facts.level = p.level ?? 1
    facts.summoners = [p.summoner1Id, p.summoner2Id]
      .map((id: number) => dicts.spells[String(id)])
      .filter(Boolean) as string[]
    const sel: number[] = p.perks?.selected ?? []
    const shards = p.perks?.statPerks ?? {}
    facts.runes = [
      ...sel.map((id) => dicts.runes[String(id)]).filter(Boolean),
      ...[shards.offense, shards.flex, shards.defense]
        .map((id: number) => STAT_SHARDS[id]).filter(Boolean),
    ] as string[]
    // deno-lint-ignore no-explicit-any
    facts.skillOrder = (p.skillEvents ?? [])
      .slice(0, CAP_SKILLS)
      .map((e: any) => SKILL_LETTER[e.slot] ?? '')
      .filter(Boolean)
    facts.curve = buildCurve(body?.timeline ?? [], pid - 1)
  }

  if (depth === 'advanced') {
    const mk: string[] = []
    if (p.pentaKills)  mk.push(`${p.pentaKills} penta`)
    if (p.quadraKills) mk.push(`${p.quadraKills} quadra`)
    if (p.tripleKills) mk.push(`${p.tripleKills} triple`)
    if (p.doubleKills) mk.push(`${p.doubleKills} double`)
    facts.multikills = mk.join(', ')
    facts.totalHeal = p.totalHeal ?? 0
    facts.healOnTeammates = p.healOnTeammates ?? 0
    facts.timeCcOthers = p.timeCcOthers ?? 0
    facts.longestLife = p.longestLife ?? 0
    facts.goldEarned = p.goldEarned ?? 0
  }

  return facts
}

const TEAM_FR = (id: number) => (id === 100 ? 'bleue' : 'rouge')

// deno-lint-ignore no-explicit-any
function matchFacts(body: any, champs: Record<string, string>): MatchFacts {
  // deno-lint-ignore no-explicit-any
  const evs: any[] = body?.events ?? []
  const objectiveLog: string[] = []
  for (const e of evs) {
    if (objectiveLog.length >= CAP_OBJECTIVES) break
    const team = TEAM_FR(e.teamId ?? 0)
    if (e.type === 'BUILDING_KILL') {
      const what = e.buildingType === 'INHIBITOR_BUILDING'
        ? 'Inhibiteur'
        : `Tour ${String(e.towerType ?? '').replace('_TURRET', '').toLowerCase() || ''}`.trim()
      const lane = String(e.laneType ?? '').replace('_LANE', '').toLowerCase()
      objectiveLog.push(`${mmss(e.ts)} ${what}${lane ? ` ${lane}` : ''} (${team})`)
    } else if (e.type === 'ELITE_MONSTER_KILL') {
      const kind = e.monsterType === 'DRAGON'
        ? `Drake ${String(e.monsterSubType ?? '').replace('_DRAGON', '').toLowerCase()}`.trim()
        : e.monsterType === 'RIFTHERALD' ? 'Héraut'
        : e.monsterType === 'BARON_NASHOR' ? 'Baron'
        : e.monsterType === 'HORDE' ? 'Larve du Néant'
        : String(e.monsterType ?? 'Monstre')
      objectiveLog.push(`${mmss(e.ts)} ${kind} (${team})`)
    }
  }

  // deno-lint-ignore no-explicit-any
  const teamObjectives = (body?.teams ?? []).map((t: any) => {
    const o = t.objectives ?? {}
    return `${TEAM_FR(t.teamId)} : ${o.tower ?? 0} tours, ${o.dragon ?? 0} drakes, ${o.baron ?? 0} baron, ${o.herald ?? 0} héraut`
  })

  // deno-lint-ignore no-explicit-any
  const bans = (body?.teams ?? []).flatMap((t: any) => t.bans ?? [])
    .filter((id: number) => id > 0)
    .map((id: number) => champs[String(id)] ?? `champion ${id}`)

  return { objectiveLog, teamObjectives, bans }
}

/**
 * Adversaire de voie : même `teamPosition`, équipe opposée.
 *
 * ⚠️ `teamPosition` est VIDE sur les modes sans voies (ARAM, Arena) et,
 * occasionnellement, sur la Faille quand Riot n'a pas pu inférer le rôle. Ce
 * n'est PAS une erreur : c'est un état nominal de la donnée. On renvoie alors
 * `null`, et l'appelant refuse la combinaison AVANT tout débit de crédits —
 * le client affiche un message clair, jamais une erreur rouge.
 */
// deno-lint-ignore no-explicit-any
function findOpponent(parts: any[], self: any): { p: any; idx: number } | null {
  const pos = String(self?.teamPosition ?? '')
  if (!pos) return null
  const idx = parts.findIndex((p) =>
    p.teamId !== self.teamId && String(p.teamPosition ?? '') === pos)
  return idx < 0 ? null : { p: parts[idx], idx }
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
    // ── Kill switch `postgame_ai_enabled` ─────────────────────────────────
    //
    // ⚠️ Ne coupe que le POST, pour la même raison qu'à `matchup-analyze` et
    // bien que ce flag soit 'notice' et non 'degraded' : le GET lit le solde de
    // « Chaleur de la Forge », qui est le MÊME pot que celui du match-up
    // (`consume_ai_credits` / `usage_counters`). Couper la lecture du solde
    // depuis ici casserait l'affichage des braises d'une feature qui, elle,
    // n'est pas coupée. Le GET ne fait aucun appel Claude et n'écrit rien.
    //
    // isFeatureEnabled est fail-closed : une erreur DB retourne false.
    if (req.method === 'POST' && !await isFeatureEnabled('postgame_ai_enabled')) {
      return jsonResponse({ error: 'L\'analyse IA d\'après-partie est actuellement désactivée.' }, 403)
    }

    const user = await getUser(req)
    if (!user) return jsonResponse({ error: 'Authentification requise.' }, 401)

    const db = createClient(
      Deno.env.get('SUPABASE_URL')!,
      requireSecret('SUPABASE_SERVICE_ROLE_KEY'),
    )

    const { data: profile } = await db
      .from('profiles').select('tier, role').eq('id', user.id).maybeSingle()
    const { credits: limit, model } = resolveConfig(profile?.tier ?? null, profile?.role ?? null)
    // Les 9 coûts, pas seulement celui de l'action en cours : le client en a
    // besoin pour griser les combinaisons qu'il ne peut PAS s'offrir, et pour
    // afficher le prix qui change quand on bascule de profondeur ou de mode.
    const costs = costsFor(model)

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
    // Les 9 combinaisons sont désormais ouvertes. Défauts inchangés
    // (`simple`/`perso`) : un client pré-généralisation qui n'envoie pas ces
    // champs obtient exactement le même résultat qu'avant.
    const depth = String(body.depth ?? 'simple') as PostGameDepth
    const mode  = String(body.mode  ?? 'perso')  as PostGameMode
    if (!DEPTHS.includes(depth) || !MODES.includes(mode)) {
      return jsonResponse({ error: 'Combinaison profondeur/mode inconnue.' }, 400)
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

    // ── Adversaire de voie — AVANT tout débit de crédits ──────────────────
    // Un mode « adversaire »/« les_deux » sur une partie sans voies (ARAM,
    // Arena, ou Faille où Riot n'a pas inféré le rôle) est un état NOMINAL de
    // la donnée, pas une panne : on refuse la combinaison proprement, avec un
    // code que le client traduit en message clair. Zéro crédit débité, zéro
    // appel Anthropic. Le contrôle est ici et pas seulement côté client, parce
    // que `teamPosition` n'est connu qu'après avoir chargé le détail du match.
    const needsOpponent = mode !== 'perso'
    const opp = needsOpponent ? findOpponent(parts, p) : null
    if (needsOpponent && !opp) {
      return jsonResponse({
        error: 'Cette partie ne permet pas d\'identifier un adversaire de voie.',
        code: 'opponent_unavailable',
      }, 400)
    }

    const dicts: NameDicts = {
      items:  await itemNames(),
      champs: depth === 'advanced' ? await champNames() : {},
      spells: depth !== 'simple'   ? await spellNames() : {},
      runes:  depth !== 'simple'   ? await runeNames()  : {},
    }

    const durationS = Number(match.body?.gameDuration ?? 0) || 1
    const selfFacts = playerFacts(p, pid, durationS, depth, match.body, dicts)
    const oppFacts  = opp ? playerFacts(opp.p, opp.idx + 1, durationS, depth, match.body, dicts) : null
    const mFacts: MatchFacts | null =
      depth === 'advanced' ? matchFacts(match.body, dicts.champs) : null

    const prompt = buildPostGamePrompt({
      self: selfFacts, opponent: oppFacts, match: mFacts, depth, mode,
    })

    // ── Débit du pot de crédits (avant tout appel payant) ─────────────────
    const cost = costOf(model, depth, mode)
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
      model, max_tokens: MAX_TOKENS[depth],
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
      champion: selfFacts.champion, win: selfFacts.win,
      // Champion adverse quand la combinaison en implique un — le client
      // l'affiche en en-tête (« Ahri vs Zed ») sans avoir à le redemander.
      opponent: oppFacts?.champion ?? null,
      used, limit, remaining: Math.max(limit - (used as number), 0),
      cost, costs, resets_at: nextWeekStartISO(),
    })
  } catch (e) {
    console.error('postgame-analyze: unhandled exception', e instanceof Error ? e.message : String(e))
    return jsonResponse({ error: 'Erreur serveur inattendue.' }, 500)
  }
})
