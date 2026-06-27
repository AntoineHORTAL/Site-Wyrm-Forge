// Edge Function : tracking de matchs pour le module prac (admin-only).
//
// Appel : POST /functions/v1/prac-track
// Headers : Authorization: Bearer <JWT> (OBLIGATOIRE — vérifié en code, verify_jwt=false)
// Body JSON :
//   { action: 'list' }                                              — joueurs accepted (picker UI)
//   { action: 'resolve', tracked_player_id, from, to, start? }
//   { action: 'commit',  tracked_player_id, match_ids[], start? }
//
// Garde : is_prac_admin(auth.uid()) → 403 sinon. Toutes les écritures passent par
// la fonction SECURITY DEFINER prac_commit_tracked_matches (service_role).
//
// resolve : lit riot_puuid/riot_platform du joueur (accepted requis) → appelle
//   riot-matches ?puuid (1 appel, mis en cache) → filtre gameCreation ∈ [from,to]
//   → flag already_tracked. LECTURE SEULE.
// commit  : ré-appelle riot-matches (mêmes params → cache HIT) → ré-extrait le
//   snapshot SERVEUR (jamais les stats client) → INSERT idempotent via la fonction
//   verrouillée (re-check accepted sous FOR SHARE, ferme la race avec revoke).
//
// Codes : 200 | 400 (payload/fenêtre) | 401 (JWT) | 403 (non-admin / joueur non
//   accepted) | 404 (joueur/match introuvable). player_not_linked → 400 + code.
import { createClient }             from 'https://esm.sh/@supabase/supabase-js@2'
import { handleCors, jsonResponse } from '../_shared/cors.ts'
import { getUser, requireSecret }   from '../_shared/auth.ts'

const UUID_RE     = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MATCH_ID_RE = /^[A-Za-z0-9]{2,8}_[0-9]{1,20}$/   // ex: EUW1_1234567890
const MAX_MATCH_IDS = 20                               // une page riot-matches

function isUUID(v: unknown): v is string {
  return typeof v === 'string' && UUID_RE.test(v)
}

// epoch ms → bornes ; null si non parsable
function parseInstant(v: unknown): number | null {
  if (typeof v !== 'string') return null
  const t = Date.parse(v)
  return Number.isNaN(t) ? null : t
}

function clampStart(v: unknown): number {
  const n = Number(v ?? 0)
  if (!Number.isInteger(n) || n < 0) return 0
  return Math.min(n, 200)
}

interface SlimMatch {
  matchId: string; gameCreation: number
  championId: number; championName: string; queueId: number; win: boolean
  kills: number; deaths: number; assists: number; cs: number; duration: number
  position: string; visionScore: number; damageDealt: number; goldEarned: number
}

// ── Joueur tracké + identité Riot (service_role, bypass RLS) ──────────────────
// deno-lint-ignore no-explicit-any
async function loadPlayer(db: any, trackedPlayerId: string): Promise<
  | { ok: true; status: string; puuid: string | null; platform: string }
  | { ok: false; status: number; body: Record<string, unknown> }
> {
  const { data, error } = await db
    .from('tracked_players')
    .select('status, profile:profiles!inner(riot_puuid, riot_platform)')
    .eq('id', trackedPlayerId)
    .maybeSingle()

  if (error) {
    console.error('prac-track: loadPlayer error', error)
    return { ok: false, status: 500, body: { error: 'Erreur serveur.' } }
  }
  if (!data) {
    return { ok: false, status: 404, body: { error: 'Joueur tracké introuvable.' } }
  }
  // L'embed peut être un objet ou un tableau selon la cardinalité PostgREST
  const prof = Array.isArray(data.profile) ? data.profile[0] : data.profile
  return {
    ok: true,
    status: data.status as string,
    puuid: prof?.riot_puuid ?? null,
    platform: prof?.riot_platform ?? 'euw1',
  }
}

// ── Appel interne à riot-matches (réutilise son cache) ────────────────────────
async function fetchMatches(puuid: string, platform: string, start: number): Promise<
  | { ok: true; matches: SlimMatch[] }
  | { ok: false; status: number; error: string }
> {
  const base = Deno.env.get('SUPABASE_URL')!
  const anon = requireSecret('SUPABASE_ANON_KEY')
  const qs = new URLSearchParams({ puuid, platform, count: '20', start: String(start) })
  const res = await fetch(`${base}/functions/v1/riot-matches?${qs.toString()}`, {
    headers: { apikey: anon, Authorization: `Bearer ${anon}` },
  })
  const body = await res.json().catch(() => null)
  if (!res.ok) {
    return { ok: false, status: res.status, error: body?.error ?? 'Erreur riot-matches.' }
  }
  return { ok: true, matches: (body?.matches ?? []) as SlimMatch[] }
}

// snapshot persistable (colonnes tracked_matches) à partir d'un slim riot-matches
function toSnapshot(m: SlimMatch, region: string) {
  return {
    match_id: m.matchId,
    region,
    game_creation: new Date(m.gameCreation).toISOString(),
    champion_id: m.championId,
    champion_name: m.championName,
    queue_id: m.queueId,
    win: m.win,
    kills: m.kills, deaths: m.deaths, assists: m.assists,
    cs: m.cs, duration_s: m.duration,
    position: m.position,
    vision_score: m.visionScore, damage_dealt: m.damageDealt, gold_earned: m.goldEarned,
  }
}

// ── list ──────────────────────────────────────────────────────────────────────
// Joueurs au statut 'accepted' + identité d'affichage (service_role, bypass RLS —
// un admin prac n'est pas forcément admin site, donc on ne dépend pas de la RLS
// profiles). Alimente le picker de l'UI /prac/ajouter.
// deno-lint-ignore no-explicit-any
async function handleList(db: any, uid: string): Promise<Response> {
  // DÉFENSE EN PROFONDEUR — REDONDANCE VOLONTAIRE, NE PAS SUPPRIMER.
  // La garde globale (Deno.serve) vérifie déjà is_prac_admin AVANT le dispatch,
  // donc ce re-check est redondant dans le flux actuel. Il est conservé sciemment :
  // `list` renvoie le roster complet (données protégées par le consentement du
  // chantier 2) ; si un futur refactor déplaçait le dispatch avant la garde globale,
  // ce check resterait la dernière barrière. Ce n'est PAS du code mort à nettoyer.
  const { data: isAdmin, error: adminErr } = await db.rpc('is_prac_admin', { p_uid: uid })
  if (adminErr) {
    console.error('prac-track: handleList is_prac_admin error', adminErr)
    return jsonResponse({ error: 'Impossible de vérifier les droits.' }, 500)
  }
  if (isAdmin !== true) {
    return jsonResponse({ error: 'Accès réservé aux administrateurs prac.' }, 403)
  }

  const { data, error } = await db
    .from('tracked_players')
    .select('id, profile:profiles!inner(username, riot_gamename, riot_tagline, riot_platform, riot_puuid)')
    .eq('status', 'accepted')
    .order('requested_at', { ascending: false })

  if (error) {
    console.error('prac-track: list error', error)
    return jsonResponse({ error: 'Erreur serveur.' }, 500)
  }
  // deno-lint-ignore no-explicit-any
  const players = (data ?? []).map((r: any) => {
    const p = Array.isArray(r.profile) ? r.profile[0] : r.profile
    return {
      tracked_player_id: r.id,
      username:  p?.username ?? null,
      game_name: p?.riot_gamename ?? null,
      tag_line:  p?.riot_tagline ?? null,
      platform:  p?.riot_platform ?? 'euw1',
      linked:    !!p?.riot_puuid,   // false → resolve renverra player_not_linked
    }
  })
  return jsonResponse({ players }, 200)
}

// ── resolve ───────────────────────────────────────────────────────────────────
// deno-lint-ignore no-explicit-any
async function handleResolve(raw: Record<string, unknown>, db: any): Promise<Response> {
  const trackedPlayerId = raw.tracked_player_id
  if (!isUUID(trackedPlayerId)) {
    return jsonResponse({ error: 'tracked_player_id invalide (UUID attendu).' }, 400)
  }
  const fromMs = parseInstant(raw.from)
  const toMs   = parseInstant(raw.to)
  if (fromMs === null || toMs === null || fromMs >= toMs) {
    return jsonResponse({ error: 'Fenêtre invalide (from/to ISO, from < to requis).' }, 400)
  }
  const start = clampStart(raw.start)

  const player = await loadPlayer(db, trackedPlayerId)
  if (!player.ok) return jsonResponse(player.body, player.status)
  // Résolution = post-consentement uniquement (cadrage)
  if (player.status !== 'accepted') {
    return jsonResponse({ error: 'Le joueur n\'a pas (ou plus) accepté le suivi.' }, 403)
  }
  if (!player.puuid) {
    return jsonResponse({ error: 'Le joueur n\'a pas lié de compte Riot.', code: 'player_not_linked' }, 400)
  }

  const fetched = await fetchMatches(player.puuid, player.platform, start)
  if (!fetched.ok) return jsonResponse({ error: fetched.error }, fetched.status)

  // Fenêtre temporelle
  const inWindow = fetched.matches.filter((m) => m.gameCreation >= fromMs && m.gameCreation <= toMs)

  // Flag already_tracked
  const ids = inWindow.map((m) => m.matchId)
  const tracked = new Set<string>()
  if (ids.length > 0) {
    const { data } = await db
      .from('tracked_matches')
      .select('match_id')
      .eq('tracked_player_id', trackedPlayerId)
      .in('match_id', ids)
    for (const row of data ?? []) tracked.add(row.match_id)
  }

  const candidates = inWindow.map((m) => ({
    match_id: m.matchId,
    game_creation: new Date(m.gameCreation).toISOString(),
    champion_name: m.championName,
    queue_id: m.queueId,
    win: m.win,
    kills: m.kills, deaths: m.deaths, assists: m.assists,
    already_tracked: tracked.has(m.matchId),
  }))

  return jsonResponse({ candidates, start, count: candidates.length }, 200)
}

// ── commit ────────────────────────────────────────────────────────────────────
// deno-lint-ignore no-explicit-any
async function handleCommit(raw: Record<string, unknown>, user: { id: string }, db: any): Promise<Response> {
  const trackedPlayerId = raw.tracked_player_id
  if (!isUUID(trackedPlayerId)) {
    return jsonResponse({ error: 'tracked_player_id invalide (UUID attendu).' }, 400)
  }
  const matchIds = raw.match_ids
  if (!Array.isArray(matchIds) || matchIds.length === 0 || matchIds.length > MAX_MATCH_IDS) {
    return jsonResponse({ error: `match_ids : tableau de 1 à ${MAX_MATCH_IDS} ids requis.` }, 400)
  }
  if (!matchIds.every((m) => typeof m === 'string' && MATCH_ID_RE.test(m))) {
    return jsonResponse({ error: 'match_ids : format d\'identifiant de match invalide.' }, 400)
  }
  const requested = [...new Set(matchIds as string[])]
  const start = clampStart(raw.start)

  const player = await loadPlayer(db, trackedPlayerId)
  if (!player.ok) return jsonResponse(player.body, player.status)
  // Check rapide (fail-fast avant le réseau) — l'autorité reste la fonction verrouillée
  if (player.status !== 'accepted') {
    return jsonResponse({ error: 'Le joueur n\'a pas (ou plus) accepté le suivi.' }, 403)
  }
  if (!player.puuid) {
    return jsonResponse({ error: 'Le joueur n\'a pas lié de compte Riot.', code: 'player_not_linked' }, 400)
  }

  const fetched = await fetchMatches(player.puuid, player.platform, start)
  if (!fetched.ok) return jsonResponse({ error: fetched.error }, fetched.status)

  // Ne garder que les match_ids demandés ET présents dans la page (snapshot serveur)
  const byId = new Map(fetched.matches.map((m) => [m.matchId, m]))
  const rows: ReturnType<typeof toSnapshot>[] = []
  const notFound: string[] = []
  for (const id of requested) {
    const m = byId.get(id)
    if (m) rows.push(toSnapshot(m, player.platform))
    else notFound.push(id)
  }
  if (rows.length === 0) {
    return jsonResponse({ error: 'Aucun match sélectionné n\'a été trouvé dans cette page.', not_found: notFound }, 404)
  }

  // Écriture atomique + re-check accepted sous FOR SHARE (ferme la race revoke)
  const { data: inserted, error } = await db.rpc('prac_commit_tracked_matches', {
    p_tracked_player_id: trackedPlayerId,
    p_added_by: user.id,
    p_rows: rows,
  })
  if (error) {
    const msg = error.message ?? ''
    if (msg.includes('player_not_accepted'))      return jsonResponse({ error: 'Le joueur a révoqué son consentement.' }, 403)
    if (msg.includes('tracked_player_not_found')) return jsonResponse({ error: 'Joueur tracké introuvable.' }, 404)
    console.error('prac-track: commit rpc error', error)
    return jsonResponse({ error: 'Erreur lors de l\'enregistrement.' }, 500)
  }

  const insertedN = typeof inserted === 'number' ? inserted : 0
  return jsonResponse({
    inserted: insertedN,
    skipped: rows.length - insertedN,   // doublons (déjà trackés)
    not_found: notFound,
  }, 200)
}

// ── Entrée ──────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  const cors = handleCors(req)
  if (cors) return cors

  try {
    if (req.method !== 'POST') {
      return jsonResponse({ error: 'Méthode non autorisée.' }, 405)
    }

    const user = await getUser(req)
    if (!user) {
      return jsonResponse({ error: 'Authentification requise.' }, 401)
    }

    let body: unknown
    try {
      body = await req.json()
    } catch {
      return jsonResponse({ error: 'Corps de requête invalide (JSON attendu).' }, 400)
    }
    const raw = body as Record<string, unknown>
    const action = raw?.action
    if (action !== 'list' && action !== 'resolve' && action !== 'commit') {
      return jsonResponse({ error: 'action invalide (list | resolve | commit).' }, 400)
    }

    const db = createClient(
      Deno.env.get('SUPABASE_URL')!,
      requireSecret('SUPABASE_SERVICE_ROLE_KEY'),
    )

    // Garde admin prac (is_prac_admin prend l'uid en paramètre → service_role OK)
    const { data: isAdmin, error: adminErr } = await db.rpc('is_prac_admin', { p_uid: user.id })
    if (adminErr) {
      console.error('prac-track: is_prac_admin error', adminErr)
      return jsonResponse({ error: 'Impossible de vérifier les droits.' }, 500)
    }
    if (isAdmin !== true) {
      return jsonResponse({ error: 'Accès réservé aux administrateurs prac.' }, 403)
    }

    if (action === 'list')    return await handleList(db, user.id)
    if (action === 'resolve') return await handleResolve(raw, db)
    return await handleCommit(raw, user, db)
  } catch (e) {
    console.error('prac-track: unhandled exception', e instanceof Error ? e.message : String(e))
    return jsonResponse({ error: 'Erreur serveur inattendue.' }, 500)
  }
})
