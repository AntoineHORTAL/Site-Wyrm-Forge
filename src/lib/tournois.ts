// Types et helpers partagés du module Tournois.
// Source de vérité : tables Supabase tournaments / tournament_teams / matches
// + vues tournament_standings / tournament_players_public.

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPA_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// ── Routing sous-domaine (2 niveaux : série → tournoi) ───────────────────────
// En PROD, le module est servi sur tournaments.wyrm-forge.com :
//   /                      → listing des écosystèmes (séries)
//   /[serie]               → vitrine d'une série
//   /[serie]/[slug]        → page tournoi
//   /[serie]/[slug]/match/[code], /[serie]/[slug]/admin
//   /manage, /manage/creer → back-office (admin)
// src/proxy.ts réécrit ces chemins publics vers /tournois/... en interne.
// En LOCAL / preview (NEXT_PUBLIC_TOURNOIS_HOST absent), on cible directement
// /tournois/... (le sous-domaine n'existe pas).
//
// ⚠️ NEXT_PUBLIC_TOURNOIS_HOST ne doit être défini QUE sur l'environnement
//    Production de Vercel — jamais en .env.local ni en Preview.
//
// Convention (déviation validée) : navigation in-app via chemins RELATIFS
// (préserve SPA + Realtime), URL ABSOLUE réservée au canonical/OG/cross-domaine.
// Les segments serie/slug doivent déjà être en minuscules (le proxy normalise sinon).

function tournoisHostBase(): string | null {
  const h = process.env.NEXT_PUBLIC_TOURNOIS_HOST
  if (!h) return null
  return /^https?:\/\//.test(h) ? h.replace(/\/$/, '') : `https://${h}`
}

// `pub` = chemin PUBLIC canonique (sans préfixe /tournois), ex. '/', '/xv2',
// '/xv2/noel', '/xv2/noel/match/M7', '/manage', '/manage/creer'.
function navFromPublic(pub: string): string {
  const p = pub || '/'
  if (tournoisHostBase()) return p                      // prod : relatif sur le sous-domaine
  if (p === '/') return '/tournois'                     // local : listing
  if (p.startsWith('/?')) return `/tournois${p.slice(1)}`
  return `/tournois${p}`                                // local : /tournois/...
}

function absFromPublic(pub: string): string {
  const base = tournoisHostBase()
  if (base) return `${base}${pub || '/'}`               // prod : https://tournaments…/…
  const site = (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/$/, '')
  return `${site}${navFromPublic(pub)}`                 // local : http://localhost:3000/tournois/…
}

// ── Chemins RELATIFS (navigation in-app) ──────────────────────────────────────
/** Listing des écosystèmes (racine). */
export function ecosystemsPath(): string { return navFromPublic('/') }
/** Vitrine d'une série (+ query optionnelle, ex. '?categorie=amis'). */
export function seriesPath(serie: string, sub: string = ''): string { return navFromPublic(`/${serie}${sub}`) }
/** Page tournoi (+ sous-chemin optionnel : '/admin', '/match/M7', '?tab=bracket'). */
export function tournamentPath(serie: string, slug: string, sub: string = ''): string {
  return navFromPublic(`/${serie}/${slug}${sub}`)
}
/** Back-office (+ sous-chemin optionnel : '/creer'). */
export function managePath(sub: string = ''): string { return navFromPublic(`/manage${sub}`) }

// ── URL ABSOLUES (canonical / OG / cross-domaine) ─────────────────────────────
/** URL absolue du listing (lien depuis le site principal). */
export function ecosystemsUrl(): string { return absFromPublic('/') }
/** URL absolue d'une vitrine de série. */
export function seriesUrl(serie: string): string { return absFromPublic(`/${serie}`) }
/** URL absolue canonique d'un tournoi (+ sous-chemin optionnel). */
export function tournamentUrl(serie: string, slug: string, sub: string = ''): string {
  return absFromPublic(`/${serie}/${slug}${sub}`)
}

// ── Types alignés sur le schéma DB ───────────────────────────────────────────

export type TournamentStatus  = 'draft' | 'registration' | 'live' | 'finished'
export type MatchStatus       = 'pending' | 'ready' | 'in_progress' | 'finished'
export type TeamStatus        = 'pending' | 'validated' | 'rejected'
export type TournamentCategory = 'amis' | 'communautaire'

/** Écosystème / série (table tournament_series) — pilote l'URL + la vitrine. */
export interface TournamentSeries {
  id:             string
  slug:           string       // minuscule, segment d'URL
  display_name:   string       // casse exacte affichée (ex. 'XV2')
  description:    string | null
  logo_url:       string | null
  hero_image_url: string | null
  sort_order:     number
  is_public:      boolean
  theme_preset:   string       // clé de preset (liste fermée — voir lib/tournois/themes.ts)
  theme_primary:  string | null // override hex de la dominante
  theme_accent:   string | null // override hex de l'accent
  created_at:     string
}

export interface Tournament {
  id:              string
  slug:            string
  name:            string
  format:          string
  map:             string
  status:          TournamentStatus
  starts_at:       string | null
  max_teams:       number
  cashprize_label: string | null
  cashprize_bonus: string | null
  caster_name:     string | null
  twitch_url:      string | null
  hero_image_url:  string | null
  rules:           unknown          // jsonb — normaliser via parseRules()
  series_id:       string           // FK tournament_series — source de vérité
  category:        TournamentCategory
  /** @deprecated remplacé par series_id (FK). Ne plus utiliser. */
  series:          string | null
  created_by:      string
  created_at:      string
}

export interface TournamentTeam {
  id:            string
  tournament_id: string
  name:          string
  seed:          number | null
  status:        TeamStatus
  created_at:    string
}

export interface TournamentMatch {
  id:                    string
  tournament_id:         string
  code:                  string             // 'M1'..'M14'
  bracket:               'winner' | 'loser' | 'final'
  round:                 number
  position:              number
  team_a:                string | null
  team_b:                string | null
  winner_id:             string | null
  next_match_id:         string | null
  next_match_slot:       'a' | 'b' | null
  loser_next_match_id:   string | null
  loser_next_match_slot: 'a' | 'b' | null
  status:                MatchStatus
  started_at:            string | null
}

// Ligne de la vue tournament_standings (déjà triée points DESC côté SQL)
export interface StandingRow {
  tournament_id:   string
  tournament_slug: string
  team_id:         string
  team_name:       string
  seed:            number | null
  wins:            number
  losses:          number
  points:          number
  riot_pseudos:    string[]
}

// Joueur public (vue tournament_players_public — jamais de discord_pseudo)
export interface TournamentPlayerPublic {
  id:          string
  team_id:     string
  riot_pseudo: string
  user_id:     string | null
  created_at:  string
}

// ── Filtres de la liste /tournois — pilotés par ?statut= ────────────────────

export interface StatusFilter {
  id:     string                    // valeur du searchParam ?statut=
  label:  string
  status: TournamentStatus | null   // null = tous
}

export const STATUS_FILTERS: StatusFilter[] = [
  { id: 'tous',     label: 'Tous',     status: null },
  { id: 'avenir',   label: 'À venir',  status: 'registration' },
  { id: 'encours',  label: 'En cours', status: 'live' },
  { id: 'termines', label: 'Terminés', status: 'finished' },
]

export function resolveFilter(statut: string | undefined): StatusFilter {
  return STATUS_FILTERS.find((f) => f.id === statut) ?? STATUS_FILTERS[0]
}

// ── Normalisation du jsonb rules ─────────────────────────────────────────────
// La colonne rules est un jsonb libre — on ne garde que les strings.

export function parseRules(rules: unknown): string[] {
  if (!Array.isArray(rules)) return []
  return rules.filter((r): r is string => typeof r === 'string')
}

// ── Appel Edge Function tournois ─────────────────────────────────────────────
// Comme callEF (lib/ecailles) mais avec token OPTIONNEL :
// tournament-register accepte les inscriptions anonymes.

export async function callTournamentEF<T = unknown>(
  name: 'tournament-register' | 'tournament-admin',
  body: Record<string, unknown>,
  token?: string | null,
): Promise<{ data: T | null; error: string | null; status: number }> {
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'apikey': SUPA_KEY,
    }
    if (token) headers['Authorization'] = `Bearer ${token}`

    const res = await fetch(`${SUPA_URL}/functions/v1/${name}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    })

    if (res.ok) {
      const data = await res.json() as T
      return { data, error: null, status: res.status }
    }
    const err = await res.json().catch(() => ({ error: `Erreur ${res.status}` })) as { error?: string }
    return { data: null, error: err.error ?? `Erreur ${res.status}`, status: res.status }
  } catch {
    return { data: null, error: 'Erreur réseau — réessaie dans un instant.', status: 0 }
  }
}

// ── Helpers d'affichage ──────────────────────────────────────────────────────

export const TOURNAMENT_STATUS_LABELS: Record<TournamentStatus, string> = {
  draft:        'Brouillon',
  registration: 'Inscriptions ouvertes',
  live:         'En cours',
  finished:     'Terminé',
}

export const TOURNAMENT_STATUS_COLORS: Record<TournamentStatus, string> = {
  draft:        '#8fa0bb',
  registration: '#f06ad8',
  live:         '#5DCAA5',
  finished:     '#888888',
}

// ── Création de tournoi (page /creer) ────────────────────────────────────────

// Slugs de tournoi réservés — aligné sur le CHECK chk_slug_not_reserved (DB) et
// sur l'Edge Function. Les noms de séries ne sont plus réservés (segment distinct).
export const RESERVED_TOURNAMENT_SLUGS = ['manage', 'creer', 'match', 'live']

// Slugs de SÉRIE réservés — aligné sur chk_series_slug (DB).
export const RESERVED_SERIES_SLUGS = ['manage', 'creer', 'live', 'api']

export const TOURNAMENT_CATEGORIES = ['amis', 'communautaire'] as const

// Règles XV2 par défaut (pré-remplissage de l'éditeur de règles).
export const DEFAULT_XV2_RULES: string[] = [
  'Format Double Élimination',
  'Matchs en Best-of-1',
  'Grande Finale en match unique (pas de reset du bracket)',
  'Carte ARAM — règles standards',
  'Présence Discord obligatoire pendant tout le tournoi',
]

export const TEAM_SIZES = [4, 8, 16] as const

/** Slugifie un nom : sans accents, minuscules, tirets, ≤ 40 caractères. */
export function slugify(input: string): string {
  return input
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')   // retire les accents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}

/** Places restantes = max_teams - équipes pending+validated (rejected libère sa place). */
export function remainingSlots(t: Pick<Tournament, 'max_teams'>, teams: TournamentTeam[]): number {
  const taken = teams.filter((tm) => tm.status === 'pending' || tm.status === 'validated').length
  return Math.max(0, t.max_teams - taken)
}
