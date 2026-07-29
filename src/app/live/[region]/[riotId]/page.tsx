'use client'

/**
 * Lot D1 — coquille « Live Game » : /live/[region]/GameName%23TAG
 *
 * Ce lot livre uniquement LES 9 ÉTATS D'INTERFACE (contrat normatif
 * AGENTS.md § « Contrat client normatif — riot-live-game (Lot D0/E0) »).
 * Le rendu de la composition (10 joueurs, bans, rangs) arrive au Lot D3 :
 * ici, un succès `in_game:true` n'affiche qu'un placeholder sobre.
 *
 * 'use client' est OBLIGATOIRE : en SSR toutes les requêtes partiraient de
 * l'IP Vercel, et les limiteurs IP de riot-live-game (isRateLimited 20/min,
 * checkIpRateLimit 30/h — tous deux par IP) verraient un seul client pour
 * tout le site. Même motif que /summoner et /matches.
 *
 * L'appel réseau est fait INLINE dans la page pour ce lot (le Lot D2
 * l'extraira dans src/lib/live-game.ts avec les types/labels). La fonction
 * `fetchLiveGame` ci-dessous est volontairement isolée (une seule
 * responsabilité, aucune dépendance à React) pour que cette extraction soit
 * triviale — pas de fetch éparpillé dans le composant.
 */
import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPA_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Mappe les labels d'affichage vers les codes plateforme Riot (ex: EUW → euw1)
// — copié de /summoner et /matches (dette de duplication déjà actée dans ce
// repo, cf. AGENTS.md § queue_id → libellé FR : « ne pas synchroniser les
// listes entre elles après coup »).
const REGION_ALIASES: Record<string, string> = {
  EUW: 'euw1', EUNE: 'eun1', NA: 'na1', KR: 'kr',
  BR: 'br1', JP: 'jp1', OCE: 'oc1', TR: 'tr1',
}

// Vrai PUUID Riot ≈ 78 caractères URL-safe, JAMAIS un UUID v4 (le format
// "8-4-4-4-12" à 36 caractères est le GUID anonymisé du LCU — piège déjà
// coûteux ailleurs dans ce repo, cf. riot-live-game/index.ts). Regex EXACTE
// du backend : on valide côté client avec la même forme.
const PUUID_RE = /^[A-Za-z0-9_-]{70,128}$/

// Table de libellés normative — nouvelle constante DÉDIÉE à Live Game
// (AGENTS.md § D. Tables de libellés normatives : « le site recopie cette
// liste une fois »). Ne pas la fusionner avec les QUEUES de /summoner,
// /matches ou /match — ce sont trois listes distinctes déjà divergentes,
// documentées comme dette acceptée.
const QUEUE_LABELS_LIVE: Record<number, string> = {
  0: 'Personnalisée', 400: 'Normale Draft', 420: 'Classée Solo/Duo',
  430: 'Normale Aveugle', 440: 'Classée Flex', 450: 'ARAM', 700: 'Clash',
  900: 'URF', 1020: 'Légendes Uniques', 1400: 'Ultime Spellbook',
  1700: 'Arena', 1900: 'URF (pick)',
}

// Verrou de rafraîchissement, en secondes (AGENTS.md §F, décision actée).
// Il couvre les DEUX boutons — « Actualiser » comme « Réessayer » — et pas
// seulement le cas riot_busy : au Lot D4 une consultation coûtera 11 jetons
// (1 riot-live-game + 10 riot-rank) sur un bucket de 20/min/IP, et comme
// `isRateLimited` s'exécute AVANT le cache, même un HIT consomme un jeton.
// Deux chargements dans la même minute suffisent donc à produire des 429
// partiels. Poser le verrou dès D1 évite d'expédier un bouton qui viole le
// contrat et de devoir y repenser plus tard.
const REFRESH_COOLDOWN_S = 30

/**
 * Type union discriminé des états d'interface — un seul champ `kind` porte
 * la décision de rendu, jamais un empilement de booléens. Les variantes
 * transitoires transportent les données d'interpolation (retry_after_s,
 * resets_in) nécessaires au texte FR normatif, lu UNIQUEMENT dans le corps
 * JSON (jamais les headers HTTP — _shared/cors.ts n'expose aucun header
 * custom au navigateur, cf. AGENTS.md §F).
 */
type LiveGameState =
  | { kind: 'loading' }
  | { kind: 'not_in_game' }                                   // état #2 — NOMINAL
  | { kind: 'disabled' }                                       // état #3 — 403 kill-switch, NOMINAL
  | { kind: 'not_found' }                                      // état #4 — 404
  | { kind: 'bad_request' }                                    // état #5 — 400
  | { kind: 'rate_limited'; retryAfterS: number | null }       // état #6 — 429 (nos limiteurs)
  | { kind: 'quota_exceeded'; resetsIn: number }                // état #7 — 503 quota_exceeded
  | { kind: 'riot_busy'; retryAfterS: number }                  // état #8 — 503 riot_busy
  | { kind: 'server_error'; network: boolean }                  // état #9 — 500 / réseau
  | { kind: 'in_game'; queueId: number; participantCount: number } // succès — placeholder D1, rendu D3

/** Formate `resets_in` (secondes avant minuit UTC) en libellé FR arrondi. */
function formatResetsIn(seconds: number): string {
  if (seconds < 60) return `${Math.max(1, Math.round(seconds))} s`
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`
  return `${Math.round(seconds / 3600)} h`
}

/**
 * Appelle riot-live-game et traduit la réponse en état d'interface.
 * Discriminant = LE COUPLE (status, body.reason), jamais le seul statut
 * HTTP — deux 503 de sens opposé (quota_exceeded = notre circuit breaker,
 * riot_busy = délestage transitoire côté Riot) exigent deux traitements
 * différents (AGENTS.md §F).
 */
async function fetchLiveGame(params: {
  platform: string
  puuid: string | null
  gameName: string
  tagLine: string
}): Promise<LiveGameState> {
  const qp: Record<string, string> = { platform: params.platform }
  // Chemin canonique (1 seul appel Riot côté serveur) si un puuid valide est
  // fourni ; sinon chemin de confort par Riot ID (2 appels serveur).
  if (params.puuid) qp.puuid = params.puuid
  else { qp.gameName = params.gameName; qp.tagLine = params.tagLine }

  let res: Response
  try {
    res = await fetch(
      `${SUPA_URL}/functions/v1/riot-live-game?${new URLSearchParams(qp).toString()}`,
      { headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` } },
    )
  } catch {
    return { kind: 'server_error', network: true }
  }

  // deno-lint n'existe pas côté client, mais même prudence : le corps peut
  // être vide/non-JSON sur certaines erreurs réseau intermédiaires (proxy).
  const body: Record<string, unknown> | null = await res.json().catch(() => null)

  if (res.ok) {
    if (body && body.in_game === true) {
      const game = body.game as { queue_id?: number } | undefined
      const participants = body.participants as unknown[] | undefined
      return { kind: 'in_game', queueId: game?.queue_id ?? 0, participantCount: participants?.length ?? 0 }
    }
    return { kind: 'not_in_game' }
  }

  switch (res.status) {
    case 400: return { kind: 'bad_request' }
    case 403: return { kind: 'disabled' }
    case 404: return { kind: 'not_found' }
    case 429: return { kind: 'rate_limited', retryAfterS: typeof body?.retry_after_s === 'number' ? body.retry_after_s : null }
    case 503:
      // Le discriminant est `body.reason`, jamais le statut seul (voir §F).
      if (body?.reason === 'riot_busy') {
        return { kind: 'riot_busy', retryAfterS: typeof body?.retry_after_s === 'number' ? body.retry_after_s : 30 }
      }
      return { kind: 'quota_exceeded', resetsIn: typeof body?.resets_in === 'number' ? body.resets_in : 0 }
    default: return { kind: 'server_error', network: false }
  }
}

export default function LiveGamePage() {
  const { region: rawRegion, riotId: riotIdEncoded } =
    useParams<{ region: string; riotId: string }>()
  const router = useRouter()
  const searchParams = useSearchParams()

  // Normalise la région : accepte les labels (EUW) et les codes plateforme
  // (euw1) — même motif que /summoner.
  const region = REGION_ALIASES[(rawRegion ?? '').toUpperCase()] ?? rawRegion ?? 'euw1'

  const riotId   = decodeURIComponent(riotIdEncoded ?? '')
  const hashIdx  = riotId.indexOf('#')
  const gameName = hashIdx >= 0 ? riotId.slice(0, hashIdx) : riotId
  const tagLine  = hashIdx >= 0 ? riotId.slice(hashIdx + 1) : ''
  const riotIdValid = hashIdx >= 0 && gameName.length > 0 && tagLine.length > 0

  // ?puuid= optionnel (viendra de /summoner au Lot D5) — ignoré silencieusement
  // s'il est mal formé plutôt que de faire échouer la page : ce n'est qu'une
  // optimisation de chemin d'appel, jamais une entrée obligatoire.
  const puuidQP  = searchParams.get('puuid')
  const validPuuid = puuidQP && PUUID_RE.test(puuidQP) ? puuidQP : null

  const [state, setState] = useState<LiveGameState>({ kind: 'loading' })
  // Secondes restantes avant de pouvoir re-solliciter l'EF. Un seul compteur
  // pour les deux boutons : sans ça, le message « Réessaie dans 20s » d'un 429
  // s'afficherait à côté d'un bouton immédiatement cliquable — deux consignes
  // contradictoires dans le même bloc.
  const [cooldown, setCooldown] = useState(0)

  const runFetch = useCallback(() => {
    // Riot ID malformé (pas de '#') ET pas de puuid utilisable en substitut
    // → état 400 local, sans appel réseau (le premier réflexe de test d'un
    // dev est justement de casser l'URL ; inutile de solliciter l'EF).
    if (!validPuuid && !riotIdValid) {
      setState({ kind: 'bad_request' })
      return
    }
    setState({ kind: 'loading' })
    fetchLiveGame({ platform: region, puuid: validPuuid, gameName, tagLine }).then(next => {
      setState(next)
      // Le délai imposé par le serveur prime s'il dépasse notre verrou : Riot
      // (riot_busy) comme nos propres limiteurs (429) annoncent un `retry_after_s`
      // qu'il serait absurde de raccourcir côté client.
      const imposed =
        next.kind === 'riot_busy'    ? next.retryAfterS :
        next.kind === 'rate_limited' ? (next.retryAfterS ?? 0) : 0
      setCooldown(Math.max(REFRESH_COOLDOWN_S, imposed))
    })
  }, [region, gameName, tagLine, riotIdValid, validPuuid])

  // Pas d'auto-poll en V1 (AGENTS.md §F) : un seul fetch au montage / au
  // changement d'URL, jamais de boucle. Le rafraîchissement est manuel
  // (boutons ci-dessous).
  useEffect(() => { runFetch() }, [runFetch])

  // Décompte du verrou : purement visuel, il ne redéclenche JAMAIS de fetch
  // de lui-même — c'est précisément ce qui distingue un verrou d'un retry
  // automatique, interdit ici (un riot_busy a déjà consommé un appel Riot).
  useEffect(() => {
    if (cooldown <= 0) return
    const id = setTimeout(() => setCooldown(c => Math.max(0, c - 1)), 1000)
    return () => clearTimeout(id)
  }, [cooldown])

  const canRetry = ['rate_limited', 'quota_exceeded', 'riot_busy', 'server_error'].includes(state.kind)
  const locked = cooldown > 0

  return (
    <main style={{
      minHeight: '100vh', padding: '24px clamp(12px, 4vw, 40px)',
      maxWidth: 900, margin: '0 auto', color: '#F5F2FA',
    }}>
      <button onClick={() => router.back()} style={{
        background: 'transparent', border: 'none', cursor: 'pointer',
        color: 'var(--text-muted)', fontSize: 13, padding: '6px 0',
        marginBottom: 20, display: 'flex', alignItems: 'center', gap: 6,
      }}>← Retour</button>

      <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>
        Partie en direct
      </h1>
      <div style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 24 }}>
        {riotIdValid ? <>{gameName}<span style={{ color: 'var(--text-dim)' }}>#{tagLine}</span> — {region.toUpperCase()}</>
                     : 'Riot ID invalide'}
      </div>

      {state.kind === 'loading' && (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
          Recherche d&apos;une partie en cours…
        </div>
      )}

      {/* État #2 — in_game:false. NOMINAL : le cas le plus fréquent (la
          majorité des joueurs, la majorité du temps) — traitement neutre,
          jamais de rouge ni d'icône d'alerte. */}
      {state.kind === 'not_in_game' && (
        <div style={{
          textAlign: 'center', padding: '48px 32px', borderRadius: 12,
          background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)',
        }}>
          <div style={{ fontSize: 14, color: 'var(--text-muted)' }}>
            Ce joueur n&apos;est pas en partie actuellement.
          </div>
        </div>
      )}

      {/* État #3 — 403 kill-switch. NOMINAL, même famille visuelle que
          SoonScreen (Dashboard.tsx) : bordure en pointillés neutre, jamais
          rouge. Le message brut de l'EF n'est JAMAIS montré tel quel. */}
      {state.kind === 'disabled' && (
        <div style={{
          textAlign: 'center', padding: '60px 32px', borderRadius: 12,
          border: '2px dashed #27272A',
        }}>
          <div style={{ fontSize: 36, marginBottom: 16 }}>🎮</div>
          <h3 style={{ fontSize: 18, fontWeight: 600, color: '#F5F2FA', marginBottom: 8 }}>
            Le suivi de partie en direct arrive bientôt.
          </h3>
          <p style={{ color: 'var(--text-dim)', fontSize: 13 }}>Reste à l&apos;affût — ça arrive bientôt.</p>
        </div>
      )}

      {/* États #4/#5 — erreurs de requête (404 / 400). */}
      {(state.kind === 'not_found' || state.kind === 'bad_request') && (
        <div style={{
          padding: '14px 18px', borderRadius: 8, fontSize: 13,
          background: 'rgba(226,75,74,0.08)', border: '1px solid rgba(226,75,74,0.3)',
          color: '#E24B4A',
        }}>
          {state.kind === 'not_found' ? 'Invocateur introuvable.' : 'Requête invalide.'}
        </div>
      )}

      {/* États #6/#7/#8/#9 — erreurs transitoires, retry manuel disponible. */}
      {(state.kind === 'rate_limited' || state.kind === 'quota_exceeded' ||
        state.kind === 'riot_busy' || state.kind === 'server_error') && (
        <div style={{
          padding: '14px 18px', borderRadius: 8, fontSize: 13,
          background: 'rgba(226,75,74,0.08)', border: '1px solid rgba(226,75,74,0.3)',
          color: '#E24B4A', marginBottom: 14,
        }}>
          {state.kind === 'rate_limited' && (
            state.retryAfterS != null
              ? `Trop de recherches. Réessaie dans ${state.retryAfterS}s.`
              : 'Trop de requêtes. Réessaie dans une minute.'
          )}
          {state.kind === 'quota_exceeded' &&
            `Service temporairement indisponible. Réessaie dans ${formatResetsIn(state.resetsIn)}.`}
          {state.kind === 'riot_busy' &&
            `Le service Riot est momentanément saturé. Réessaie dans ${state.retryAfterS} secondes.`}
          {state.kind === 'server_error' &&
            (state.network ? 'Erreur réseau, vérifie ta connexion.' : 'Erreur serveur inattendue.')}
        </div>
      )}

      {/* Succès — placeholder D1, le rendu des 10 joueurs arrive au Lot D3. */}
      {state.kind === 'in_game' && (
        <div style={{
          textAlign: 'center', padding: '48px 32px', borderRadius: 12,
          background: 'rgba(93,202,165,0.06)', border: '1px solid rgba(93,202,165,0.25)',
        }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#5DCAA5', marginBottom: 6 }}>
            Partie en cours trouvée — {state.participantCount} joueurs
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
            {QUEUE_LABELS_LIVE[state.queueId] ?? `File #${state.queueId}`} (queue_id={state.queueId})
          </div>
        </div>
      )}

      {canRetry && (
        <div style={{ textAlign: 'center', marginTop: 8 }}>
          <button
            onClick={runFetch}
            disabled={locked}
            style={{
              padding: '8px 18px', borderRadius: 6, fontSize: 12,
              cursor: locked ? 'not-allowed' : 'pointer',
              background: locked ? 'rgba(255,255,255,0.03)' : 'rgba(127,119,221,0.08)',
              border: '1px solid rgba(127,119,221,0.25)',
              color: locked ? 'var(--text-dim)' : 'var(--text-muted)',
              opacity: locked ? 0.6 : 1,
            }}
          >
            {locked ? `Réessaie dans ${cooldown}s…` : 'Réessayer'}
          </button>
        </div>
      )}

      {/* Nominal : pas d'auto-poll, mais un rafraîchissement manuel reste
          utile pour "not_in_game" (le joueur peut lancer une partie) et pour
          "in_game" (revoir l'état courant) sans jamais boucler seul. */}
      {(state.kind === 'not_in_game' || state.kind === 'in_game') && (
        <div style={{ textAlign: 'center', marginTop: 12 }}>
          <button
            onClick={runFetch}
            disabled={locked}
            style={{
              padding: '8px 18px', borderRadius: 6, fontSize: 12,
              cursor: locked ? 'not-allowed' : 'pointer',
              background: locked ? 'rgba(255,255,255,0.03)' : 'rgba(127,119,221,0.08)',
              border: '1px solid rgba(127,119,221,0.25)',
              color: locked ? 'var(--text-dim)' : 'var(--text-muted)',
              opacity: locked ? 0.6 : 1,
            }}
          >
            {locked ? `Actualiser (${cooldown}s)` : 'Actualiser'}
          </button>
        </div>
      )}
    </main>
  )
}
