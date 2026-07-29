'use client'

/**
 * Live Game — /live/[region]/GameName%23TAG
 *
 * Lot D1 : les 9 états d'interface du contrat normatif (AGENTS.md § « Contrat
 * client normatif — riot-live-game (Lot D0/E0) »).
 * Lot D2 : types, fetch, libellés et chrono extraits dans `src/lib/live-game.ts`
 * (module pur + testé) — cette page ne porte plus que le rendu et l'état React.
 * Lot D3 : composition des deux équipes (`LiveComposition`) + cartes DDragon
 * partagées (`src/lib/ddragon.ts`).
 *
 * Les rangs des 10 joueurs arrivent au Lot D4 (`ranks` vaut toujours `null`
 * en V1, ils viennent de 10 appels séparés à `riot-rank`).
 *
 * 'use client' est OBLIGATOIRE : en SSR toutes les requêtes partiraient de
 * l'IP Vercel, et les limiteurs IP de riot-live-game (isRateLimited 20/min,
 * checkIpRateLimit 30/h — tous deux par IP) verraient un seul client pour
 * tout le site. Même motif que /summoner et /matches.
 *
 * ⚠️ Piège de test : une partie PERSONNALISÉE n'est jamais exposée par
 * spectator-v5 (limite Riot, pas un bug). Lancer une perso pour « tester
 * vite » produit donc un `in_game:false` parfaitement normal — ne pas le
 * diagnostiquer comme un défaut d'intégration.
 */
import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import {
  fetchLiveGame, fetchParticipantRanks, normalizePlatform, isKnownPlatform,
  parseRiotId, isValidPuuid, queueLabel, elapsedSeconds, formatElapsed,
  stateMessage, cooldownFor,
  type LiveGameState, type RanksByPuuid,
} from '@/lib/live-game'
import { loadDDragonMaps, type DDragonMaps } from '@/lib/ddragon'
import LiveComposition from '@/components/live/LiveComposition'

export default function LiveGamePage() {
  const { region: rawRegion, riotId: riotIdEncoded } =
    useParams<{ region: string; riotId: string }>()
  const router = useRouter()
  const searchParams = useSearchParams()

  const platform = normalizePlatform(rawRegion)
  const { gameName, tagLine, valid: riotIdValid } = parseRiotId(riotIdEncoded ?? '')

  // ?puuid= optionnel, posé par le lien de /summoner (Lot D5, `buildLiveHref`)
  // — ignoré silencieusement s'il est mal formé plutôt que de faire échouer la
  // page : ce n'est qu'une optimisation de chemin d'appel (1 appel Riot au
  // lieu de 2), jamais une entrée obligatoire. Une URL collée à la main sans
  // puuid reste parfaitement valide.
  const puuidQP = searchParams.get('puuid')
  const validPuuid = isValidPuuid(puuidQP) ? puuidQP : null

  const [state, setState] = useState<LiveGameState>({ kind: 'loading' })
  // Secondes restantes avant de pouvoir re-solliciter l'EF. Un seul compteur
  // pour les deux boutons : sans ça, le message « Réessaie dans 20s » d'un 429
  // s'afficherait à côté d'un bouton immédiatement cliquable — deux consignes
  // contradictoires dans le même bloc.
  const [cooldown, setCooldown] = useState(0)
  // Horloge du chrono : re-rendu à la seconde. L'écoulé est TOUJOURS recalculé
  // depuis game_start_time (jamais game_length_s, figé jusqu'à 5 min par le
  // TTL de cache serveur) — voir `elapsedSeconds`.
  const [nowMs, setNowMs] = useState(() => Date.now())
  // Cartes DDragon (champions / sorts / runes). Chargées EN PARALLÈLE de l'EF
  // et indépendamment d'elle : un échec DDragon dégrade les icônes en carrés
  // neutres, il ne doit jamais empêcher d'afficher la composition.
  const [dd, setDd] = useState<DDragonMaps | null>(null)
  // Rangs des participants (Lot D4). Résolus APRÈS la partie, en un second
  // temps : la composition s'affiche immédiatement, les rangs se remplissent
  // ensuite. Un échec par joueur ne touche que sa ligne.
  const [ranks, setRanks] = useState<RanksByPuuid>({})
  const [ranksLoading, setRanksLoading] = useState(false)

  const runFetch = useCallback(() => {
    // Entrées invalides → état 400 local, sans appel réseau : le premier
    // réflexe de test d'un dev est justement de casser l'URL, inutile de
    // solliciter l'EF (ni de consommer un jeton de rate limit).
    if (!isKnownPlatform(platform) || (!validPuuid && !riotIdValid)) {
      setState({ kind: 'bad_request' })
      return
    }
    setState({ kind: 'loading' })
    setRanks({})
    fetchLiveGame({ platform, puuid: validPuuid, gameName, tagLine }).then(next => {
      setState(next)
      setCooldown(cooldownFor(next))
      if (next.kind !== 'in_game') return

      // Rangs : jusqu'à 10 appels riot-rank, en allSettled (voir
      // fetchParticipantRanks). Volontairement NON await'é ici — la
      // composition est déjà rendue, les rangs arrivent en second.
      setRanksLoading(true)
      fetchParticipantRanks(next.participants, platform).then(res => {
        setRanks(res.ranks)
        setRanksLoading(false)
        // Si un appel riot-rank a été rate-limité, le délai qu'il impose peut
        // dépasser notre verrou de 30 s : on prolonge plutôt que de rouvrir le
        // bouton sur un budget déjà épuisé.
        if (res.retryAfterS != null) {
          setCooldown(c => Math.max(c, res.retryAfterS!))
        }
      })
    })
  }, [platform, gameName, tagLine, riotIdValid, validPuuid])

  // Pas d'auto-poll en V1 (AGENTS.md §F) : un seul fetch au montage / au
  // changement d'URL, jamais de boucle. Le rafraîchissement est manuel.
  useEffect(() => { runFetch() }, [runFetch])

  // DDragon : une seule fois au montage (le loader est mémoïsé au niveau
  // module, donc gratuit sur les visites suivantes). Volontairement hors de
  // `runFetch` : « Actualiser » ne doit pas retélécharger le patch.
  useEffect(() => {
    let cancelled = false
    loadDDragonMaps()
      .then(maps => { if (!cancelled) setDd(maps) })
      .catch(() => { /* icônes dégradées, la composition reste lisible */ })
    return () => { cancelled = true }
  }, [])

  // Décompte du verrou : purement visuel, il ne redéclenche JAMAIS de fetch
  // de lui-même — c'est précisément ce qui distingue un verrou d'un retry
  // automatique, interdit ici (un riot_busy a déjà consommé un appel Riot).
  useEffect(() => {
    if (cooldown <= 0) return
    const id = setTimeout(() => setCooldown(c => Math.max(0, c - 1)), 1000)
    return () => clearTimeout(id)
  }, [cooldown])

  // Tic du chrono — purement local (aucune requête), actif uniquement pendant
  // une partie dont le minuteur a démarré.
  const chronoRunning = state.kind === 'in_game' && state.game.game_start_time > 0
  useEffect(() => {
    if (!chronoRunning) return
    const id = setInterval(() => setNowMs(Date.now()), 1000)
    return () => clearInterval(id)
  }, [chronoRunning])

  const canRetry = ['rate_limited', 'quota_exceeded', 'riot_busy', 'server_error'].includes(state.kind)
  const locked = cooldown > 0

  const refreshBtnStyle = {
    padding: '8px 18px', borderRadius: 6, fontSize: 12,
    cursor: locked ? 'not-allowed' : 'pointer',
    background: locked ? 'rgba(255,255,255,0.03)' : 'rgba(127,119,221,0.08)',
    border: '1px solid rgba(127,119,221,0.25)',
    color: locked ? 'var(--text-dim)' : 'var(--text-muted)',
    opacity: locked ? 0.6 : 1,
  } as const

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
        {riotIdValid ? <>{gameName}<span style={{ color: 'var(--text-dim)' }}>#{tagLine}</span> — {platform.toUpperCase()}</>
                     : 'Riot ID invalide'}
      </div>

      {state.kind === 'loading' && (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
          {stateMessage(state)}
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
            {stateMessage(state)}
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
            {stateMessage(state)}
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
          {stateMessage(state)}
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
          {stateMessage(state)}
        </div>
      )}

      {/* Succès — bandeau de partie + composition des deux équipes (Lot D3). */}
      {state.kind === 'in_game' && (() => {
        // §C : game_start_time === 0 ⇒ écran de chargement, surtout PAS un
        // chrono à 00:00. `elapsedSeconds` renvoie null dans ce cas.
        const elapsed = elapsedSeconds(state.game.game_start_time, nowMs)
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              gap: 12, flexWrap: 'wrap',
              padding: '12px 16px', borderRadius: 12,
              background: 'rgba(93,202,165,0.06)', border: '1px solid rgba(93,202,165,0.25)',
            }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#5DCAA5' }}>
                {queueLabel(state.game.queue_id)}
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                {elapsed === null ? 'En chargement' : formatElapsed(elapsed)}
              </div>
            </div>

            <LiveComposition
              game={state.game}
              participants={state.participants}
              requestedPuuid={state.requestedPuuid}
              dd={dd}
              ranks={ranks}
              ranksLoading={ranksLoading}
            />
          </div>
        )
      })()}

      {canRetry && (
        <div style={{ textAlign: 'center', marginTop: 8 }}>
          <button onClick={runFetch} disabled={locked} style={refreshBtnStyle}>
            {locked ? `Réessaie dans ${cooldown}s…` : 'Réessayer'}
          </button>
        </div>
      )}

      {/* Nominal : pas d'auto-poll, mais un rafraîchissement manuel reste
          utile pour "not_in_game" (le joueur peut lancer une partie) et pour
          "in_game" (revoir l'état courant) sans jamais boucler seul. */}
      {(state.kind === 'not_in_game' || state.kind === 'in_game') && (
        <div style={{ textAlign: 'center', marginTop: 12 }}>
          <button onClick={runFetch} disabled={locked} style={refreshBtnStyle}>
            {locked ? `Actualiser (${cooldown}s)` : 'Actualiser'}
          </button>
        </div>
      )}
    </main>
  )
}
