/**
 * Lot D2 — couche cliente de l'Edge Function `riot-live-game`.
 *
 * Extraction du fetch inline du Lot D1 (annoncée en tête de
 * `src/app/live/[region]/[riotId]/page.tsx`) : types du contrat, traduction
 * des réponses en états d'interface, libellés, et calcul du chrono.
 *
 * Référence normative : AGENTS.md § « Contrat client normatif —
 * riot-live-game (Lot D0/E0) ». En cas de divergence entre ce fichier et
 * `supabase/functions/riot-live-game/index.ts`, **le code de l'EF fait foi**.
 *
 * Ce module est PUR sauf `fetchLiveGame` (seule fonction réseau) :
 *  - aucun import `@/…` (l'alias n'est pas configuré dans vitest — même
 *    contrainte que `src/lib/matchup/payload.ts`, séparé de `api.ts` pour
 *    cette raison exacte) ;
 *  - aucune lecture de `process.env` au chargement du module (elle est faite
 *    À L'APPEL dans `fetchLiveGame`), sinon l'import du module en test
 *    planterait sur les assertions `!` de variables absentes.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types du contrat (miroir strict de GameBody / Participant côté EF)
// ─────────────────────────────────────────────────────────────────────────────

export type LiveBannedChampion = { champion_id: number; team_id: number; pick_turn: number }

export type LivePerks = { perk_ids: number[]; perk_style: number; perk_sub_style: number }

export type LiveParticipant = {
  puuid: string
  /** Peut être '' (cf. §C) → repli d'affichage sur le nom du champion. */
  riot_id: string
  /** 100 = ORDER (bleu), 200 = CHAOS (rouge). Voir TEAM_ORDER / TEAM_CHAOS. */
  team_id: number
  champion_id: number
  spell1_id: number
  spell2_id: number
  profile_icon_id: number
  perks: LivePerks
  /** Bot : pas de rang réel, ne jamais lui résoudre un rang via riot-rank. */
  bot: boolean
}

export type LiveGameInfo = {
  game_id: number
  platform_id: string
  queue_id: number
  map_id: number
  game_mode: string
  game_type: string
  /** Epoch ms. 0 = écran de chargement (voir `elapsedSeconds`). */
  game_start_time: number
  /**
   * ⚠️ FIGÉ par le TTL de cache serveur (jusqu'à 5 min en partie). Présent
   * pour fidélité au contrat, mais **ne doit JAMAIS être affiché ni servir
   * de base au chrono** — voir `elapsedSeconds`.
   */
  game_length_s: number
  banned_champions: LiveBannedChampion[]
}

// ─────────────────────────────────────────────────────────────────────────────
// ⚠️ TABLE CRITIQUE — team_id (AGENTS.md §B)
// ─────────────────────────────────────────────────────────────────────────────
// Une inversion ici ne plante RIEN : côté site elle déplace juste une carte de
// gauche à droite, mais côté WPF `team_id` est la clé de jointure des rangs
// (avec champion_id) — une inversion y produirait des données fausses ET
// plausibles (chaque joueur affiche un rang crédible, celui du mauvais
// adversaire). Aucun test visuel superficiel ne le détecte. Ne pas « corriger »
// ces constantes sans revérifier contre le client Riot, champion par champion.
export const TEAM_ORDER = 100 // vocabulaire Live Client Data : ORDER — bleu
export const TEAM_CHAOS = 200 // vocabulaire Live Client Data : CHAOS — rouge

export type TeamSide = 'order' | 'chaos'

/** `null` pour toute valeur hors {100, 200} — jamais de repli arbitraire sur un camp. */
export function teamSide(teamId: number): TeamSide | null {
  if (teamId === TEAM_ORDER) return 'order'
  if (teamId === TEAM_CHAOS) return 'chaos'
  return null
}

export type SplitTeams<T> = { order: T[]; chaos: T[]; unknown: T[] }

/**
 * Répartit les participants (ou les bans) en deux camps — **STOP D3**.
 *
 * ⚠️ La répartition se fait EXCLUSIVEMENT sur `team_id`, jamais sur le
 * champion. En partie miroir (le même champion joué des deux côtés, cas
 * fréquent en ARAM et possible en Draft via un swap), tout regroupement par
 * `champion_id` ou par nom de champion serait ambigu : les deux occurrences
 * se confondraient et un joueur pourrait basculer dans le mauvais camp.
 *
 * Corollaire côté rendu : les clés React ne doivent JAMAIS dériver du
 * champion — `champion_id` n'est pas unique dans une partie miroir. Utiliser
 * `puuid` (unique par participant).
 *
 * `unknown` recueille les `team_id` inattendus au lieu de les faire
 * silencieusement disparaître de l'écran.
 */
export function splitTeams<T extends { team_id: number }>(rows: T[]): SplitTeams<T> {
  const out: SplitTeams<T> = { order: [], chaos: [], unknown: [] }
  for (const row of rows) {
    const side = teamSide(row.team_id)
    if (side === 'order') out.order.push(row)
    else if (side === 'chaos') out.chaos.push(row)
    else out.unknown.push(row)
  }
  return out
}

// ─────────────────────────────────────────────────────────────────────────────
// Libellés (AGENTS.md §D — « le site recopie cette liste UNE fois »)
// ─────────────────────────────────────────────────────────────────────────────
// Liste DÉDIÉE à Live Game. Ne pas la fusionner avec les trois `Record<number,
// string>` déjà divergents du repo (/summoner, /match, lib/prac.ts) : cette
// dette existante est documentée et volontairement laissée telle quelle.
export const QUEUE_LABELS_LIVE: Record<number, string> = {
  0: 'Personnalisée',
  400: 'Normale Draft',
  420: 'Classée Solo/Duo',
  430: 'Normale Aveugle',
  440: 'Classée Flex',
  450: 'ARAM',
  700: 'Clash',
  900: 'URF',
  1020: 'Légendes Uniques',
  1400: 'Ultime Spellbook',
  1700: 'Arena',
  1900: 'URF (pick)',
}

/** File inconnue → libellé neutre plutôt qu'une ligne vide ou un `undefined`. */
export function queueLabel(queueId: number): string {
  return QUEUE_LABELS_LIVE[queueId] ?? `File #${queueId}`
}

// ─────────────────────────────────────────────────────────────────────────────
// Entrées : plateforme, Riot ID, PUUID
// ─────────────────────────────────────────────────────────────────────────────

/** Les 11 plateformes de la table ROUTING de l'EF — validation côté client. */
export const KNOWN_PLATFORMS = [
  'euw1', 'eun1', 'tr1', 'ru', 'na1', 'br1', 'la1', 'la2', 'oc1', 'kr', 'jp1',
] as const

/** Libellés d'URL usuels → codes plateforme Riot (mêmes alias que /summoner). */
const REGION_ALIASES: Record<string, string> = {
  EUW: 'euw1', EUNE: 'eun1', NA: 'na1', KR: 'kr', BR: 'br1',
  JP: 'jp1', OCE: 'oc1', TR: 'tr1', RU: 'ru', LAN: 'la1', LAS: 'la2',
}

/** Accepte les libellés (`EUW`) comme les codes (`euw1`, `EUW1`). */
export function normalizePlatform(raw: string | undefined | null): string {
  const up = (raw ?? '').trim().toUpperCase()
  if (up in REGION_ALIASES) return REGION_ALIASES[up]
  return up.toLowerCase()
}

export function isKnownPlatform(platform: string): boolean {
  return (KNOWN_PLATFORMS as readonly string[]).includes(platform)
}

/**
 * Vrai PUUID Riot ≈ 78 caractères URL-safe. **JAMAIS un UUID v4** : le format
 * « 8-4-4-4-12 » à 36 caractères est le GUID ANONYMISÉ du LCU, refusé par
 * l'API Riot (piège déjà coûteux dans ce repo). Regex identique à celle de
 * l'EF — la valider ici évite un aller-retour réseau garanti perdant.
 */
export const PUUID_RE = /^[A-Za-z0-9_-]{70,128}$/

export function isValidPuuid(value: string | null | undefined): value is string {
  return typeof value === 'string' && PUUID_RE.test(value)
}

export type ParsedRiotId = { gameName: string; tagLine: string; valid: boolean }

/** `GameName#TAG` → parties. Le `#` peut être encodé (`%23`) dans l'URL. */
export function parseRiotId(raw: string): ParsedRiotId {
  const decoded = (() => {
    try { return decodeURIComponent(raw ?? '') } catch { return raw ?? '' }
  })()
  const idx = decoded.indexOf('#')
  const gameName = idx >= 0 ? decoded.slice(0, idx) : decoded
  const tagLine = idx >= 0 ? decoded.slice(idx + 1) : ''
  return { gameName, tagLine, valid: idx >= 0 && gameName.length > 0 && tagLine.length > 0 }
}

// ─────────────────────────────────────────────────────────────────────────────
// Chrono — STOP D2
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Secondes écoulées depuis le début de la partie, calculées CÔTÉ CLIENT.
 *
 * ⚠️ Ne prend délibérément QUE `gameStartTime`, jamais l'objet `LiveGameInfo`
 * entier : `game_length_s` est figé par le TTL de cache serveur (jusqu'à 5 min
 * de retard) et ne doit jamais servir de base au chrono. Restreindre la
 * signature rend cette régression structurellement impossible — un futur
 * « repli sur game_length_s » exigerait de changer la signature, donc d'y
 * repenser (AGENTS.md §C).
 *
 * Retourne `null` (jamais 0) quand aucun chrono n'a de sens :
 *  - `gameStartTime === 0` → écran de chargement : afficher « En chargement »,
 *    surtout PAS un compteur à 00:00 ;
 *  - valeur absente / non finie → donnée inexploitable.
 *
 * Sinon, valeur **toujours ≥ 0** : si l'horloge locale est en retard sur celle
 * de Riot (décalage NTP, fuseau mal réglé), l'écart négatif est ramené à 0
 * plutôt qu'affiché en « -12:34 ».
 */
export function elapsedSeconds(gameStartTime: number, nowMs: number = Date.now()): number | null {
  if (!Number.isFinite(gameStartTime) || gameStartTime <= 0) return null
  if (!Number.isFinite(nowMs)) return null
  return Math.max(0, Math.floor((nowMs - gameStartTime) / 1000))
}

/** Secondes → `M:SS` (ou `H:MM:SS` au-delà de l'heure). `null` → « — ». */
export function formatElapsed(seconds: number | null): string {
  if (seconds === null) return '—'
  const s = Math.max(0, Math.floor(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`
}

/** Formate `resets_in` (secondes avant minuit UTC) en libellé FR arrondi. */
export function formatResetsIn(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return 'un instant'
  if (seconds < 60) return `${Math.max(1, Math.round(seconds))} s`
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`
  return `${Math.round(seconds / 3600)} h`
}

// ─────────────────────────────────────────────────────────────────────────────
// États d'interface (AGENTS.md §E — les 9 états)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Union discriminée : un seul champ `kind` porte la décision de rendu, jamais
 * un empilement de booléens. Les variantes transitoires transportent leurs
 * données d'interpolation, lues UNIQUEMENT dans le corps JSON — jamais dans
 * les headers HTTP (`_shared/cors.ts` n'expose aucun header custom au
 * navigateur, cf. §F).
 */
export type LiveGameState =
  | { kind: 'loading' }                                          // état #1
  | { kind: 'not_in_game' }                                      // état #2 — NOMINAL
  | { kind: 'disabled' }                                         // état #3 — 403 kill-switch, NOMINAL
  | { kind: 'not_found' }                                        // état #4 — 404
  | { kind: 'bad_request' }                                      // état #5 — 400
  | { kind: 'rate_limited'; retryAfterS: number | null }         // état #6 — 429 (NOS limiteurs)
  | { kind: 'quota_exceeded'; resetsIn: number }                 // état #7 — 503 quota_exceeded
  | { kind: 'riot_busy'; retryAfterS: number }                   // état #8 — 503 riot_busy
  | { kind: 'server_error'; network: boolean }                   // état #9 — 500 / réseau
  | {
      kind: 'in_game'
      game: LiveGameInfo
      participants: LiveParticipant[]
      requestedPuuid: string
    }

export type StateTone = 'loading' | 'nominal' | 'error'

/**
 * Gravité visuelle d'un état. Existe pour rendre TESTABLE la règle « aucun
 * état normal n'est affiché comme une erreur » (STOP D1) : `not_in_game` (le
 * cas le plus fréquent) et `disabled` (kill-switch) sont des états NOMINAUX,
 * jamais rouges.
 */
export function stateTone(state: LiveGameState): StateTone {
  switch (state.kind) {
    case 'loading': return 'loading'
    case 'not_in_game':
    case 'disabled':
    case 'in_game': return 'nominal'
    default: return 'error'
  }
}

/** Texte FR normatif de l'état (§E). Une seule source pour ces chaînes. */
export function stateMessage(state: LiveGameState): string {
  switch (state.kind) {
    case 'loading':      return 'Recherche d’une partie en cours…'
    case 'not_in_game':  return 'Ce joueur n’est pas en partie actuellement.'
    case 'disabled':     return 'Le suivi de partie en direct arrive bientôt.'
    case 'not_found':    return 'Invocateur introuvable.'
    case 'bad_request':  return 'Requête invalide.'
    case 'rate_limited':
      return state.retryAfterS != null
        ? `Trop de recherches. Réessaie dans ${state.retryAfterS}s.`
        : 'Trop de requêtes. Réessaie dans une minute.'
    case 'quota_exceeded':
      return `Service temporairement indisponible. Réessaie dans ${formatResetsIn(state.resetsIn)}.`
    case 'riot_busy':
      return `Le service Riot est momentanément saturé. Réessaie dans ${state.retryAfterS} secondes.`
    case 'server_error':
      return state.network ? 'Erreur réseau, vérifie ta connexion.' : 'Erreur serveur inattendue.'
    case 'in_game':      return 'Partie en cours.'
  }
}

/**
 * Verrou de rafraîchissement, en secondes (§F, décision actée). Couvre les
 * DEUX boutons (« Actualiser » et « Réessayer »), pas seulement `riot_busy` :
 * au Lot D4 une consultation coûtera 11 jetons (1 riot-live-game + 10
 * riot-rank) sur un bucket de 20/min/IP, et comme `isRateLimited` s'exécute
 * AVANT le cache, même un HIT consomme un jeton. Deux chargements dans la même
 * minute suffisent donc à produire des 429 partiels.
 */
export const REFRESH_COOLDOWN_S = 30

/** Délai à respecter avant le prochain appel, verrou local et serveur confondus. */
export function cooldownFor(state: LiveGameState): number {
  // Le délai imposé par le serveur prime s'il dépasse notre verrou : il serait
  // absurde de raccourcir côté client un `retry_after_s` annoncé par Riot
  // (riot_busy) ou par nos propres limiteurs (429).
  const imposed =
    state.kind === 'riot_busy' ? state.retryAfterS :
    state.kind === 'rate_limited' ? (state.retryAfterS ?? 0) : 0
  return Math.max(REFRESH_COOLDOWN_S, imposed)
}

// ─────────────────────────────────────────────────────────────────────────────
// Traduction réponse HTTP → état (PURE, testable sans réseau)
// ─────────────────────────────────────────────────────────────────────────────

function asNumber(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

function normalizeGame(raw: unknown): LiveGameInfo {
  const g = (raw ?? {}) as Record<string, unknown>
  const bans = Array.isArray(g.banned_champions) ? g.banned_champions : []
  return {
    game_id: asNumber(g.game_id, 0),
    platform_id: typeof g.platform_id === 'string' ? g.platform_id : '',
    queue_id: asNumber(g.queue_id, 0),
    map_id: asNumber(g.map_id, 0),
    game_mode: typeof g.game_mode === 'string' ? g.game_mode : '',
    game_type: typeof g.game_type === 'string' ? g.game_type : '',
    game_start_time: asNumber(g.game_start_time, 0),
    game_length_s: asNumber(g.game_length_s, 0),
    banned_champions: bans.map((b) => {
      const bb = (b ?? {}) as Record<string, unknown>
      return {
        champion_id: asNumber(bb.champion_id, 0),
        team_id: asNumber(bb.team_id, 0),
        pick_turn: asNumber(bb.pick_turn, 0),
      }
    }),
  }
}

function normalizeParticipants(raw: unknown): LiveParticipant[] {
  if (!Array.isArray(raw)) return []
  return raw.map((p) => {
    const pp = (p ?? {}) as Record<string, unknown>
    const perks = (pp.perks ?? {}) as Record<string, unknown>
    return {
      puuid: typeof pp.puuid === 'string' ? pp.puuid : '',
      riot_id: typeof pp.riot_id === 'string' ? pp.riot_id : '',
      team_id: asNumber(pp.team_id, 0),
      champion_id: asNumber(pp.champion_id, 0),
      spell1_id: asNumber(pp.spell1_id, 0),
      spell2_id: asNumber(pp.spell2_id, 0),
      profile_icon_id: asNumber(pp.profile_icon_id, 0),
      perks: {
        perk_ids: Array.isArray(perks.perk_ids)
          ? perks.perk_ids.filter((x): x is number => typeof x === 'number')
          : [],
        perk_style: asNumber(perks.perk_style, 0),
        perk_sub_style: asNumber(perks.perk_sub_style, 0),
      },
      bot: pp.bot === true,
    }
  })
}

/**
 * Traduit une réponse de l'EF en état d'interface.
 *
 * ⚠️ Le discriminant est **le COUPLE (status, body.reason)**, jamais le statut
 * seul (§F) : deux 503 de sens opposé cohabitent — `quota_exceeded` (NOTRE
 * circuit breaker : quota Riot journalier épuisé, tout le site est coupé,
 * rare) et `riot_busy` (Riot déleste lui-même, ~1 appel sur 3 mesuré sur
 * spectator EUW1, transitoire et fréquent). Les confondre afficherait le
 * mauvais message dans la moitié des cas.
 *
 * `reason` est lu POSITIVEMENT pour les deux : un 503 sans `reason` connue
 * (l'EF relaie tel quel un 5xx de Riot, cf. `if (!specRes.ok)`) tombe en
 * `server_error` plutôt que d'être maquillé en « quota épuisé » — un message
 * faux serait pire qu'un message générique.
 */
export function mapLiveGameResponse(status: number, body: unknown): LiveGameState {
  const b = (body ?? null) as Record<string, unknown> | null

  if (status >= 200 && status < 300) {
    if (b && b.in_game === true) {
      return {
        kind: 'in_game',
        game: normalizeGame(b.game),
        participants: normalizeParticipants(b.participants),
        requestedPuuid: typeof b.requested_puuid === 'string' ? b.requested_puuid : '',
      }
    }
    // `in_game: false` — état NOMINAL, jamais une erreur. Un 2xx au corps
    // illisible retombe ici aussi : « pas en partie » est le repli le moins
    // trompeur pour un succès qu'on n'arrive pas à lire.
    return { kind: 'not_in_game' }
  }

  switch (status) {
    case 400:
      return { kind: 'bad_request' }
    case 403:
      // Kill-switch `live_game_enabled`. L'EF peut aussi relayer un 403 Riot
      // (clé invalide/expirée) sous ce même statut : indistinguable côté
      // client, et « arrive bientôt » reste le message le moins alarmant des
      // deux pour un visiteur — la panne de clé se diagnostique côté serveur.
      return { kind: 'disabled' }
    case 404:
      // Vient d'account-v1 UNIQUEMENT (Riot ID inexistant). Jamais de
      // spectator-v5 : « pas en partie » y est traduit en 200 porteur.
      return { kind: 'not_found' }
    case 429:
      return { kind: 'rate_limited', retryAfterS: typeof b?.retry_after_s === 'number' ? b.retry_after_s : null }
    case 503:
      if (b?.reason === 'riot_busy') {
        return { kind: 'riot_busy', retryAfterS: asNumber(b.retry_after_s, 30) }
      }
      if (b?.reason === 'quota_exceeded') {
        return { kind: 'quota_exceeded', resetsIn: asNumber(b.resets_in, 0) }
      }
      return { kind: 'server_error', network: false }
    default:
      return { kind: 'server_error', network: false }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Couche réseau (seule fonction impure du module)
// ─────────────────────────────────────────────────────────────────────────────

export type FetchLiveGameParams = {
  platform: string
  /** Chemin canonique : 1 seul appel Riot côté serveur. */
  puuid: string | null
  /** Chemin de confort (2 appels serveur) — utilisé si `puuid` est absent. */
  gameName: string
  tagLine: string
}

/**
 * Appelle `riot-live-game` et renvoie directement l'état d'interface.
 * Ne throw jamais : une panne réseau devient `server_error{network:true}`,
 * un corps non-JSON est traité comme absent.
 */
export async function fetchLiveGame(params: FetchLiveGameParams): Promise<LiveGameState> {
  // Lecture à l'APPEL (pas au chargement du module) — voir en-tête de fichier.
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supaKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supaUrl || !supaKey) return { kind: 'server_error', network: false }

  const qp: Record<string, string> = { platform: params.platform }
  if (params.puuid) qp.puuid = params.puuid
  else { qp.gameName = params.gameName; qp.tagLine = params.tagLine }

  let res: Response
  try {
    res = await fetch(
      `${supaUrl}/functions/v1/riot-live-game?${new URLSearchParams(qp).toString()}`,
      { headers: { apikey: supaKey, Authorization: `Bearer ${supaKey}` } },
    )
  } catch {
    return { kind: 'server_error', network: true }
  }

  const body = await res.json().catch(() => null)
  return mapLiveGameResponse(res.status, body)
}
