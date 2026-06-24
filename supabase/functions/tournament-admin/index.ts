// Edge Function : actions d'administration d'un tournoi.
//
// Appel : POST /functions/v1/tournament-admin
// Headers : Authorization: Bearer <JWT> (OBLIGATOIRE)
// Body JSON :
//   { action, tournament_id, [team_id], [match_id], [winner_id], [status] }
//
// Actions disponibles :
//   create_tournament  — crée un tournoi en draft (garde is_tournament_admin global/série)
//   create_series      — crée une série (réservé admins globaux)
//   update_tournament  — édite un tournoi (champs sauf slug/série/max_teams)
//   grant_admin        — attribue un droit tournoi (réservé admins globaux)
//   revoke_admin       — retire un droit tournoi (réservé admins globaux)
//   open_registration  — passe draft → registration
//   close_registration — passe registration → live
//   validate_team      — valide une équipe (team_id requis)
//   reject_team        — rejette une équipe (team_id requis)
//   seed_bracket       — génère le bracket DE 8 équipes via RPC SECURITY DEFINER
//   start_match        — lance un match ready → in_progress (match_id requis)
//   report_result      — enregistre un résultat (match_id + winner_id requis)
//   undo_result        — annule un résultat (match_id requis)
//   set_status         — force le statut (status requis)
//
// Vérification des droits : JWT user doit être created_by du tournoi OU is_admin().
// Les fonctions SQL SECURITY DEFINER (seed_bracket, report_match_result,
// undo_match_result) utilisent auth.uid() en interne → elles sont appelées via
// un client Supabase initialisé avec le JWT utilisateur (pas service_role).
//
// Codes HTTP :
//   200 succès | 400 payload/état invalide | 401 JWT absent/invalide
//   403 non autorisé | 404 tournoi/match non trouvé | 409 conflit

import { createClient }             from 'https://esm.sh/@supabase/supabase-js@2'
import { handleCors, jsonResponse } from '../_shared/cors.ts'
import { getUser, requireSecret }   from '../_shared/auth.ts'

// ── Regex ─────────────────────────────────────────────────────────────────────
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isUUID(v: unknown): v is string {
  return typeof v === 'string' && UUID_RE.test(v)
}

// ── Statuts de tournoi autorisés pour set_status ──────────────────────────────
const VALID_STATUSES = new Set(['draft', 'registration', 'live', 'finished'])

// ── Mapping erreurs SQL → codes HTTP + messages FR ───────────────────────────
// Les fonctions SECURITY DEFINER RAISE EXCEPTION avec un message contenant
// l'un de ces codes — on teste avec includes() pour robustesse.
interface ErrorMapping {
  contains: string
  status:   number
  message:  string
}

const SQL_ERROR_MAP: ErrorMapping[] = [
  // seed_bracket
  { contains: 'bracket_wrong_team_count', status: 400, message: 'Le nombre d\'équipes validées doit correspondre exactement à la taille du tournoi (4, 8 ou 16).' },
  { contains: 'bracket_unsupported_size', status: 400, message: 'Taille de bracket non supportée (4, 8 ou 16 uniquement).' },
  { contains: 'bracket_already_seeded',   status: 409, message: 'Le bracket a déjà été généré pour ce tournoi.' },
  { contains: 'tournament_wrong_status',  status: 400, message: 'Le statut du tournoi ne permet pas cette opération.' },
  { contains: 'tournament_not_found',     status: 404, message: 'Tournoi introuvable.' },
  { contains: 'tournament_forbidden',     status: 403, message: 'Accès refusé à ce tournoi.' },
  // report_match_result / undo_match_result / start_match
  { contains: 'match_wrong_status',       status: 400, message: 'Le match n\'est pas prêt à être lancé.' },
  { contains: 'match_not_found',          status: 404, message: 'Match introuvable.' },
  { contains: 'match_forbidden',          status: 403, message: 'Accès refusé à ce match.' },
  { contains: 'match_teams_not_set',      status: 400, message: 'Les deux équipes du match ne sont pas encore définies.' },
  { contains: 'winner_not_in_match',      status: 400, message: 'L\'équipe gagnante ne fait pas partie de ce match.' },
  { contains: 'already_reported',         status: 409, message: 'Un résultat a déjà été enregistré pour ce match.' },
  { contains: 'downstream_played',        status: 409, message: 'Impossible d\'annuler : des matchs en aval ont déjà été joués.' },
]

function mapSqlError(msg: string): { status: number; message: string } | null {
  for (const entry of SQL_ERROR_MAP) {
    if (msg.includes(entry.contains)) {
      return { status: entry.status, message: entry.message }
    }
  }
  return null
}

// ── Constantes création ───────────────────────────────────────────────────────
// Alignées sur les CHECK DB (chk_slug_not_reserved, chk_series_slug, chk_tournaments_category).
const RESERVED_TOURNAMENT_SLUGS = new Set(['manage', 'creer', 'match', 'live'])
const RESERVED_SERIES_SLUGS     = new Set(['manage', 'creer', 'live', 'api'])
const VALID_CATEGORIES = new Set(['amis', 'communautaire'])
const SLUG_RE        = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/   // slug tournoi 3-40
const SERIES_SLUG_RE = /^[a-z0-9-]+$/                            // slug série
const TWITCH_RE      = /^https:\/\/(www\.)?twitch\.tv\/.+/
// Thèmes série — liste fermée alignée sur themes.ts + CHECK chk_series_theme_preset.
const THEME_PRESETS  = new Set(['xv2', 'neon', 'forge', 'ocean', 'ember'])
const HEX_RE         = /^#[0-9a-fA-F]{6}$/

function strOrNull(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

function isValidScope(scope: string): boolean {
  return scope === 'global'
    || (scope.startsWith('series:') && scope.length > 'series:'.length)
    || UUID_RE.test(scope)
}

// deno-lint-ignore no-explicit-any
async function isGlobalAdmin(db: any, uid: string): Promise<boolean> {
  const { data } = await db
    .from('tournament_admins').select('id').eq('user_id', uid).eq('scope', 'global').maybeSingle()
  return !!data
}

// ── Validation + construction d'une ligne tournament_series (partagé) ─────────
// Utilisé par create_series (page dédiée) ET resolveOrCreateSeries (création à la
// volée depuis create_tournament). Ne fait PAS la garde d'accès (à l'appelant).
function buildSeriesInsert(
  src: Record<string, unknown>,
): { insert: Record<string, unknown> } | { error: { message: string; status: number } } {
  const slug = typeof src.slug === 'string' ? src.slug.trim().toLowerCase() : ''
  const name = typeof src.display_name === 'string' ? src.display_name.trim() : ''
  if (!SERIES_SLUG_RE.test(slug) || RESERVED_SERIES_SLUGS.has(slug)) {
    return { error: { message: 'Slug de série invalide ou réservé.', status: 400 } }
  }
  if (name.length < 2 || name.length > 60) {
    return { error: { message: 'Nom de série invalide (2 à 60 caractères).', status: 400 } }
  }

  let theme_preset = 'xv2'
  if (src.theme_preset != null && src.theme_preset !== '') {
    theme_preset = String(src.theme_preset)
    if (!THEME_PRESETS.has(theme_preset)) {
      return { error: { message: 'Preset de thème inconnu.', status: 400 } }
    }
  }
  const theme_primary = strOrNull(src.theme_primary)
  const theme_accent  = strOrNull(src.theme_accent)
  if (theme_primary && !HEX_RE.test(theme_primary)) {
    return { error: { message: 'Couleur primaire invalide (format #RRGGBB).', status: 400 } }
  }
  if (theme_accent && !HEX_RE.test(theme_accent)) {
    return { error: { message: 'Couleur accent invalide (format #RRGGBB).', status: 400 } }
  }

  const is_public = src.is_public === undefined ? true : src.is_public !== false
  let sort_order = 0
  if (src.sort_order != null && src.sort_order !== '') {
    sort_order = Number(src.sort_order)
    if (!Number.isInteger(sort_order)) {
      return { error: { message: 'Ordre d\'affichage invalide.', status: 400 } }
    }
  }

  return {
    insert: {
      slug, display_name: name,
      description: strOrNull(src.description),
      logo_url: strOrNull(src.logo_url),
      hero_image_url: strOrNull(src.hero_image_url),
      theme_preset, theme_primary, theme_accent,
      is_public, sort_order,
    },
  }
}

// ── create_series — page dédiée, réservé aux admins GLOBAUX ───────────────────
// deno-lint-ignore no-explicit-any
async function handleCreateSeries(raw: Record<string, unknown>, user: { id: string }, db: any): Promise<Response> {
  if (!await isGlobalAdmin(db, user.id)) {
    return jsonResponse({ error: 'Seul un administrateur global peut créer une série.' }, 403)
  }
  const built = buildSeriesInsert(raw)
  if ('error' in built) {
    return jsonResponse({ error: built.error.message }, built.error.status)
  }
  const { data, error } = await db
    .from('tournament_series').insert(built.insert).select('slug').single()
  if (error) {
    if (error.code === '23505') return jsonResponse({ error: 'Un slug de série identique existe déjà.' }, 409)
    if (error.code === '23514') return jsonResponse({ error: 'Valeur invalide (slug, preset ou couleur).' }, 400)
    console.error('create_series: insert error', error)
    return jsonResponse({ error: 'Erreur lors de la création de la série.' }, 500)
  }
  return jsonResponse({ success: true, slug: data.slug }, 201)
}

// ── Résolution / création de série (bloc isolé, réutilisé par create_tournament).
//    Retourne { series_id } ou { error: {message, status} }.
//    - series_id fourni → exige is_series_admin (global OU admin de cette série).
//    - new_series fourni → CRÉATION de série, réservée aux admins GLOBAUX.
// deno-lint-ignore no-explicit-any
async function resolveOrCreateSeries(
  db: any,
  user: { id: string },
  raw: Record<string, unknown>,
): Promise<{ series_id: string } | { error: { message: string; status: number } }> {
  // Cas 1 : série existante
  if (isUUID(raw.series_id)) {
    const seriesId = raw.series_id as string
    const { data: allowed, error } = await db.rpc('is_series_admin', {
      p_uid: user.id, p_series_id: seriesId,
    })
    if (error) {
      console.error('resolveSeries: is_series_admin error', error)
      return { error: { message: 'Impossible de vérifier les droits.', status: 500 } }
    }
    if (allowed !== true) {
      return { error: { message: 'Tu n\'as pas le droit de créer un tournoi dans cette série.', status: 403 } }
    }
    return { series_id: seriesId }
  }

  // Cas 2 : création d'une nouvelle série à la volée (global admin requis)
  const newSeries = raw.new_series as Record<string, unknown> | undefined
  if (newSeries && typeof newSeries === 'object') {
    if (!await isGlobalAdmin(db, user.id)) {
      return { error: { message: 'Seul un administrateur global peut créer une nouvelle série.', status: 403 } }
    }
    const built = buildSeriesInsert(newSeries)
    if ('error' in built) return built
    const { data: created, error: insErr } = await db
      .from('tournament_series').insert(built.insert).select('id').single()
    if (insErr) {
      if (insErr.code === '23505') return { error: { message: 'Une série avec ce slug existe déjà.', status: 409 } }
      if (insErr.code === '23514') return { error: { message: 'Slug de série réservé ou invalide.', status: 400 } }
      console.error('resolveSeries: insert series error', insErr)
      return { error: { message: 'Erreur lors de la création de la série.', status: 500 } }
    }
    return { series_id: created.id as string }
  }

  return { error: { message: 'Série requise (series_id ou new_series).', status: 400 } }
}

// ── create_tournament — un tournoi appartient TOUJOURS à une série ────────────
// deno-lint-ignore no-explicit-any
async function handleCreateTournament(raw: Record<string, unknown>, user: { id: string }, db: any): Promise<Response> {
  // 1. Série (existante ou nouvelle) + garde par série
  const seriesRes = await resolveOrCreateSeries(db, user, raw)
  if ('error' in seriesRes) {
    return jsonResponse({ error: seriesRes.error.message }, seriesRes.error.status)
  }
  const series_id = seriesRes.series_id

  // 2. Validation des champs du tournoi
  const name = typeof raw.name === 'string' ? raw.name.trim() : ''
  if (name.length < 3 || name.length > 80) {
    return jsonResponse({ error: 'Le nom doit faire 3 à 80 caractères.' }, 400)
  }

  const slug = typeof raw.slug === 'string' ? raw.slug.trim().toLowerCase() : ''
  if (!SLUG_RE.test(slug)) {
    return jsonResponse({ error: 'Slug invalide (3 à 40 caractères : minuscules, chiffres, tirets).' }, 400)
  }
  if (RESERVED_TOURNAMENT_SLUGS.has(slug)) {
    return jsonResponse({ error: `Le slug « ${slug} » est réservé. Choisis-en un autre.` }, 400)
  }

  const format = typeof raw.format === 'string' && raw.format.trim() ? raw.format.trim() : '2V2'
  const map    = typeof raw.map === 'string' && raw.map.trim() ? raw.map.trim() : 'ARAM'

  let starts_at: string | null = null
  if (raw.starts_at) {
    const d = new Date(raw.starts_at as string)
    if (isNaN(d.getTime())) {
      return jsonResponse({ error: 'Date de début invalide.' }, 400)
    }
    starts_at = d.toISOString()   // normalisé UTC
  }

  let category = 'amis'
  if (raw.category != null && raw.category !== '') {
    category = String(raw.category)
    if (!VALID_CATEGORIES.has(category)) {
      return jsonResponse({ error: 'Catégorie invalide (amis ou communautaire).' }, 400)
    }
  }

  const twitch_url = strOrNull(raw.twitch_url)
  if (twitch_url && !TWITCH_RE.test(twitch_url)) {
    return jsonResponse({ error: 'URL Twitch invalide (format https://twitch.tv/…).' }, 400)
  }

  // Nombre d'équipes : 4 / 8 / 16 (détermine la structure du bracket)
  let max_teams = 8
  if (raw.max_teams != null) {
    max_teams = Number(raw.max_teams)
    if (![4, 8, 16].includes(max_teams)) {
      return jsonResponse({ error: 'Nombre d\'équipes invalide (4, 8 ou 16).' }, 400)
    }
  }

  const rules = Array.isArray(raw.rules)
    ? raw.rules.filter((r): r is string => typeof r === 'string' && r.trim() !== '').map((r) => r.trim()).slice(0, 20)
    : []

  // 3. Insertion (status draft, series_id source de vérité)
  const { data: inserted, error: insErr } = await db
    .from('tournaments')
    .insert({
      slug, name, format, map, status: 'draft',
      starts_at, max_teams,
      cashprize_label: strOrNull(raw.cashprize_label),
      cashprize_bonus: strOrNull(raw.cashprize_bonus),
      caster_name:     strOrNull(raw.caster_name),
      twitch_url,
      hero_image_url:  strOrNull(raw.hero_image_url),
      series_id, category, rules,
      created_by: user.id,
    })
    .select('slug, series_id')
    .single()

  if (insErr) {
    if (insErr.code === '23505') return jsonResponse({ error: 'Ce slug est déjà utilisé dans cette série.' }, 409)
    if (insErr.code === '23514') return jsonResponse({ error: 'Slug réservé ou catégorie invalide.' }, 400)
    console.error('create_tournament: insert error', insErr)
    return jsonResponse({ error: 'Erreur lors de la création du tournoi.' }, 500)
  }

  return jsonResponse({ success: true, slug: inserted.slug, series_id: inserted.series_id }, 201)
}

// ── list_admins — liste des droits (réservé aux admins GLOBAUX) ───────────────
// deno-lint-ignore no-explicit-any
async function handleListAdmins(user: { id: string }, db: any): Promise<Response> {
  if (!await isGlobalAdmin(db, user.id)) {
    return jsonResponse({ error: 'Réservé aux administrateurs globaux.' }, 403)
  }
  const { data: rows, error } = await db
    .from('tournament_admins')
    .select('id, user_id, scope, created_at')
    .order('created_at', { ascending: true })
  if (error) {
    console.error('list_admins: select error', error)
    return jsonResponse({ error: 'Erreur lors de la lecture des droits.' }, 500)
  }
  // Résolution des emails (admin API service_role) — best-effort
  const emailById = new Map<string, string>()
  try {
    const { data: list } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 })
    for (const u of (list?.users ?? [])) emailById.set(u.id, u.email ?? '')
  } catch (_e) { /* emails optionnels */ }

  // deno-lint-ignore no-explicit-any
  const admins = (rows ?? []).map((r: any) => ({
    id: r.id, user_id: r.user_id, scope: r.scope, email: emailById.get(r.user_id) ?? null,
  }))
  return jsonResponse({ success: true, admins }, 200)
}

// ── grant_admin / revoke_admin — réservé aux admins GLOBAUX ───────────────────
// deno-lint-ignore no-explicit-any
async function handleAdminGrant(action: string, raw: Record<string, unknown>, user: { id: string }, db: any): Promise<Response> {
  // Seul un admin global peut attribuer/retirer des droits.
  const { data: globalRow, error: gErr } = await db
    .from('tournament_admins')
    .select('id')
    .eq('user_id', user.id)
    .eq('scope', 'global')
    .maybeSingle()
  if (gErr) {
    console.error('admin_grant: lookup error', gErr)
    return jsonResponse({ error: 'Impossible de vérifier les droits.' }, 500)
  }
  if (!globalRow) {
    return jsonResponse({ error: 'Réservé aux administrateurs globaux.' }, 403)
  }

  const target = raw.target_user_id
  if (!isUUID(target)) {
    return jsonResponse({ error: 'target_user_id invalide (UUID attendu).' }, 400)
  }
  const scope = typeof raw.scope === 'string' ? raw.scope.trim() : ''
  if (!isValidScope(scope)) {
    return jsonResponse({ error: 'scope invalide (global | series:NOM | uuid).' }, 400)
  }

  if (action === 'grant_admin') {
    const { error } = await db
      .from('tournament_admins')
      .insert({ user_id: target, scope, granted_by: user.id })
    if (error && error.code !== '23505') {
      console.error('grant_admin: insert error', error)
      return jsonResponse({ error: 'Erreur lors de l\'attribution des droits.' }, 500)
    }
    return jsonResponse({ success: true }, 200)
  }

  // revoke_admin
  const { error } = await db
    .from('tournament_admins')
    .delete()
    .eq('user_id', target)
    .eq('scope', scope)
  if (error) {
    console.error('revoke_admin: delete error', error)
    return jsonResponse({ error: 'Erreur lors du retrait des droits.' }, 500)
  }
  return jsonResponse({ success: true }, 200)
}

Deno.serve(async (req) => {
  // ── Preflight CORS ──────────────────────────────────────────────────────────
  const cors = handleCors(req)
  if (cors) return cors

  try {
    // ── Méthode ─────────────────────────────────────────────────────────────
    if (req.method !== 'POST') {
      return jsonResponse({ error: 'Méthode non autorisée.' }, 405)
    }

    // ── Auth — JWT obligatoire ────────────────────────────────────────────────
    const user = await getUser(req)
    if (!user) {
      return jsonResponse({ error: 'Authentification requise.' }, 401)
    }

    // ── Parsing body ─────────────────────────────────────────────────────────
    let body: unknown
    try {
      body = await req.json()
    } catch {
      return jsonResponse({ error: 'Corps de requête invalide (JSON attendu).' }, 400)
    }

    const raw = body as Record<string, unknown>

    // ── Validation de l'action ────────────────────────────────────────────────
    const action = raw?.action
    if (!action || typeof action !== 'string') {
      return jsonResponse({ error: 'Champ "action" requis.' }, 400)
    }

    // ── Clients DB ────────────────────────────────────────────────────────────
    // Deux clients :
    //   - db (service_role) : lectures/UPDATE directs, bypass RLS
    //   - userDb            : client avec JWT utilisateur — nécessaire pour les
    //                         RPC SECURITY DEFINER qui appellent auth.uid() en interne
    const serviceKey = requireSecret('SUPABASE_SERVICE_ROLE_KEY')
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!

    const db = createClient(supabaseUrl, serviceKey)

    const authHeader = req.headers.get('Authorization')!
    const userDb = createClient(
      supabaseUrl,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )

    // ── Actions SANS tournoi cible (garde propre dans le handler) ─────────────
    if (action === 'create_tournament') {
      return await handleCreateTournament(raw, user, db)
    }
    if (action === 'create_series') {
      return await handleCreateSeries(raw, user, db)
    }
    if (action === 'grant_admin' || action === 'revoke_admin') {
      return await handleAdminGrant(action, raw, user, db)
    }
    if (action === 'list_admins') {
      return await handleListAdmins(user, db)
    }

    // ── Actions liées à UN tournoi : tournament_id requis ─────────────────────
    const tournament_id = raw?.tournament_id
    if (!isUUID(tournament_id)) {
      return jsonResponse({ error: 'tournament_id invalide (UUID attendu).' }, 400)
    }

    // ── Lecture du tournoi ────────────────────────────────────────────────────
    const { data: tournament, error: trnErr } = await db
      .from('tournaments')
      .select('id, status, created_by')
      .eq('id', tournament_id)
      .maybeSingle()

    if (trnErr) {
      console.error('tournament-admin: erreur lecture tournoi', trnErr)
      return jsonResponse({ error: 'Erreur serveur lors de la vérification du tournoi.' }, 500)
    }

    if (!tournament) {
      return jsonResponse({ error: 'Tournoi introuvable.' }, 404)
    }

    // ── Vérification des droits ───────────────────────────────────────────────
    // Le user doit être le créateur du tournoi OU un admin tournoi (table
    // tournament_admins : scope global, série du tournoi, ou ce tournoi précis).
    // is_tournament_admin prend p_uid en paramètre → appelable via service_role.
    const isOwner = tournament.created_by === user.id

    let canManage = isOwner
    if (!canManage) {
      const { data: adminResult, error: adminErr } = await db.rpc('is_tournament_admin', {
        p_uid: user.id, p_tournament: tournament_id,
      })
      if (adminErr) {
        console.error('tournament-admin: erreur is_tournament_admin', adminErr)
        // Fail closed : si on ne peut pas vérifier les droits, on refuse
        return jsonResponse({ error: 'Impossible de vérifier les droits.' }, 500)
      }
      canManage = adminResult === true
    }

    if (!canManage) {
      return jsonResponse({ error: 'Accès refusé : vous n\'êtes pas organisateur de ce tournoi.' }, 403)
    }

    // ── Dispatch selon action ─────────────────────────────────────────────────

    // ────────────────────────────────────────────────────────────────────────────
    if (action === 'open_registration') {
      // Transition : draft → registration
      if (tournament.status !== 'draft') {
        return jsonResponse(
          { error: `Impossible d'ouvrir les inscriptions depuis le statut "${tournament.status}".` },
          400,
        )
      }

      const { error } = await db
        .from('tournaments')
        .update({ status: 'registration' })
        .eq('id', tournament_id)

      if (error) {
        console.error('tournament-admin: open_registration error', error)
        return jsonResponse({ error: 'Erreur lors de l\'ouverture des inscriptions.' }, 500)
      }

      return jsonResponse({ success: true }, 200)
    }

    // ────────────────────────────────────────────────────────────────────────────
    if (action === 'close_registration') {
      // Transition : registration → live
      if (tournament.status !== 'registration') {
        return jsonResponse(
          { error: `Impossible de clore les inscriptions depuis le statut "${tournament.status}".` },
          400,
        )
      }

      const { error } = await db
        .from('tournaments')
        .update({ status: 'live' })
        .eq('id', tournament_id)

      if (error) {
        console.error('tournament-admin: close_registration error', error)
        return jsonResponse({ error: 'Erreur lors de la clôture des inscriptions.' }, 500)
      }

      return jsonResponse({ success: true }, 200)
    }

    // ────────────────────────────────────────────────────────────────────────────
    if (action === 'update_tournament') {
      // Champs éditables UNIQUEMENT (jamais slug ni series_id ni max_teams).
      // Garde : canManage déjà vérifiée (created_by OU is_tournament_admin).
      // deno-lint-ignore no-explicit-any
      const patch: Record<string, any> = {}

      if (raw.name !== undefined) {
        const name = typeof raw.name === 'string' ? raw.name.trim() : ''
        if (name.length < 3 || name.length > 80) {
          return jsonResponse({ error: 'Le nom doit faire 3 à 80 caractères.' }, 400)
        }
        patch.name = name
      }
      if (raw.starts_at !== undefined) {
        if (raw.starts_at === null || raw.starts_at === '') {
          patch.starts_at = null
        } else {
          const d = new Date(raw.starts_at as string)
          if (isNaN(d.getTime())) return jsonResponse({ error: 'Date de début invalide.' }, 400)
          patch.starts_at = d.toISOString()
        }
      }
      if (raw.category !== undefined && raw.category !== null && raw.category !== '') {
        const cat = String(raw.category)
        if (!VALID_CATEGORIES.has(cat)) {
          return jsonResponse({ error: 'Catégorie invalide (amis ou communautaire).' }, 400)
        }
        patch.category = cat
      }
      if (raw.twitch_url !== undefined) {
        const tw = strOrNull(raw.twitch_url)
        if (tw && !TWITCH_RE.test(tw)) {
          return jsonResponse({ error: 'URL Twitch invalide (format https://twitch.tv/…).' }, 400)
        }
        patch.twitch_url = tw
      }
      if (raw.cashprize_label !== undefined) patch.cashprize_label = strOrNull(raw.cashprize_label)
      if (raw.cashprize_bonus !== undefined) patch.cashprize_bonus = strOrNull(raw.cashprize_bonus)
      if (raw.caster_name     !== undefined) patch.caster_name     = strOrNull(raw.caster_name)
      if (raw.hero_image_url  !== undefined) patch.hero_image_url  = strOrNull(raw.hero_image_url)
      if (raw.rules !== undefined && Array.isArray(raw.rules)) {
        patch.rules = raw.rules
          .filter((r): r is string => typeof r === 'string' && r.trim() !== '')
          .map((r) => r.trim()).slice(0, 20)
      }

      if (Object.keys(patch).length === 0) {
        return jsonResponse({ error: 'Aucun champ à mettre à jour.' }, 400)
      }

      const { error } = await db.from('tournaments').update(patch).eq('id', tournament_id)
      if (error) {
        console.error('tournament-admin: update_tournament error', error)
        return jsonResponse({ error: 'Erreur lors de la mise à jour du tournoi.' }, 500)
      }
      return jsonResponse({ success: true }, 200)
    }

    // ────────────────────────────────────────────────────────────────────────────
    if (action === 'validate_team') {
      const team_id = raw?.team_id
      if (!isUUID(team_id)) {
        return jsonResponse({ error: 'team_id invalide (UUID attendu).' }, 400)
      }

      // Sécurité : vérifier que l'équipe appartient bien à ce tournoi
      // avant d'effectuer l'UPDATE, pour éviter de valider une équipe
      // d'un autre tournoi en forgeant la requête.
      const { error } = await db
        .from('tournament_teams')
        .update({ status: 'validated' })
        .eq('id', team_id)
        .eq('tournament_id', tournament_id)

      if (error) {
        console.error('tournament-admin: validate_team error', error)
        return jsonResponse({ error: 'Erreur lors de la validation de l\'équipe.' }, 500)
      }

      return jsonResponse({ success: true }, 200)
    }

    // ────────────────────────────────────────────────────────────────────────────
    if (action === 'reject_team') {
      const team_id = raw?.team_id
      if (!isUUID(team_id)) {
        return jsonResponse({ error: 'team_id invalide (UUID attendu).' }, 400)
      }

      const { error } = await db
        .from('tournament_teams')
        .update({ status: 'rejected' })
        .eq('id', team_id)
        .eq('tournament_id', tournament_id)

      if (error) {
        console.error('tournament-admin: reject_team error', error)
        return jsonResponse({ error: 'Erreur lors du rejet de l\'équipe.' }, 500)
      }

      return jsonResponse({ success: true }, 200)
    }

    // ────────────────────────────────────────────────────────────────────────────
    if (action === 'seed_bracket') {
      // Appel via userDb — seed_bracket utilise auth.uid() pour vérifier les droits
      // en interne (v_created_by <> auth.uid() AND NOT is_admin()).
      // service_role a auth.uid() = NULL → la vérification interne échouerait.
      const { error } = await userDb.rpc('seed_bracket', {
        p_tournament_id: tournament_id,
      })

      if (error) {
        const mapped = mapSqlError(error.message ?? '')
        if (mapped) {
          return jsonResponse({ error: mapped.message }, mapped.status)
        }
        console.error('tournament-admin: seed_bracket error', error)
        return jsonResponse({ error: 'Erreur lors de la génération du bracket.' }, 500)
      }

      return jsonResponse({ success: true, message: 'Bracket généré.' }, 200)
    }

    // ────────────────────────────────────────────────────────────────────────────
    if (action === 'start_match') {
      const match_id = raw?.match_id
      if (!isUUID(match_id)) {
        return jsonResponse({ error: 'match_id invalide (UUID attendu).' }, 400)
      }

      // start_match utilise auth.uid() en interne (created_by / is_admin) →
      // appel via userDb, comme seed_bracket / report_match_result.
      const { error } = await userDb.rpc('start_match', {
        p_match_id: match_id,
      })

      if (error) {
        const mapped = mapSqlError(error.message ?? '')
        if (mapped) {
          return jsonResponse({ error: mapped.message }, mapped.status)
        }
        console.error('tournament-admin: start_match error', error)
        return jsonResponse({ error: 'Erreur lors du lancement du match.' }, 500)
      }

      return jsonResponse({ success: true }, 200)
    }

    // ────────────────────────────────────────────────────────────────────────────
    if (action === 'report_result') {
      const match_id  = raw?.match_id
      const winner_id = raw?.winner_id

      if (!isUUID(match_id)) {
        return jsonResponse({ error: 'match_id invalide (UUID attendu).' }, 400)
      }
      if (!isUUID(winner_id)) {
        return jsonResponse({ error: 'winner_id invalide (UUID attendu).' }, 400)
      }

      // Même logique que seed_bracket : appel via userDb pour auth.uid()
      const { error } = await userDb.rpc('report_match_result', {
        p_match_id:  match_id,
        p_winner_id: winner_id,
      })

      if (error) {
        const mapped = mapSqlError(error.message ?? '')
        if (mapped) {
          return jsonResponse({ error: mapped.message }, mapped.status)
        }
        console.error('tournament-admin: report_result error', error)
        return jsonResponse({ error: 'Erreur lors de l\'enregistrement du résultat.' }, 500)
      }

      return jsonResponse({ success: true }, 200)
    }

    // ────────────────────────────────────────────────────────────────────────────
    if (action === 'undo_result') {
      const match_id = raw?.match_id
      if (!isUUID(match_id)) {
        return jsonResponse({ error: 'match_id invalide (UUID attendu).' }, 400)
      }

      const { error } = await userDb.rpc('undo_match_result', {
        p_match_id: match_id,
      })

      if (error) {
        const mapped = mapSqlError(error.message ?? '')
        if (mapped) {
          return jsonResponse({ error: mapped.message }, mapped.status)
        }
        console.error('tournament-admin: undo_result error', error)
        return jsonResponse({ error: 'Erreur lors de l\'annulation du résultat.' }, 500)
      }

      return jsonResponse({ success: true }, 200)
    }

    // ────────────────────────────────────────────────────────────────────────────
    if (action === 'set_status') {
      const status = raw?.status
      if (!status || typeof status !== 'string' || !VALID_STATUSES.has(status)) {
        return jsonResponse(
          { error: `Statut invalide. Valeurs acceptées : ${[...VALID_STATUSES].join(', ')}.` },
          400,
        )
      }

      const { error } = await db
        .from('tournaments')
        .update({ status })
        .eq('id', tournament_id)

      if (error) {
        console.error('tournament-admin: set_status error', error)
        return jsonResponse({ error: 'Erreur lors de la mise à jour du statut.' }, 500)
      }

      return jsonResponse({ success: true }, 200)
    }

    // ────────────────────────────────────────────────────────────────────────────
    // Action inconnue
    return jsonResponse(
      { error: `Action inconnue : "${action}". Actions valides : create_tournament, create_series, update_tournament, grant_admin, revoke_admin, list_admins, open_registration, close_registration, validate_team, reject_team, seed_bracket, start_match, report_result, undo_result, set_status.` },
      400,
    )

  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erreur inconnue'
    console.error('tournament-admin: unhandled exception', msg)
    return jsonResponse({ error: 'Erreur serveur inattendue.' }, 500)
  }
})
