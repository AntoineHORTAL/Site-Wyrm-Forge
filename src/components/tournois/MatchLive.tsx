'use client'

// MatchLive — Client Component de la page match /tournois/[slug]/match/[code].
// Deux responsabilités :
//   1. Realtime sur LE match courant (channel matches filtré tournament_id, patch
//      local de la ligne dont l'id correspond) → statut/vainqueur en direct.
//   2. Actions organisateur (Lancer / Reporter / Annuler) — visibles uniquement si
//      canManage (garde serveur created_by/admin) ET revérifiées par l'EF
//      tournament-admin (jamais confiance au front). Aucun bouton joueur.
//
// La matchup (team_a/team_b) peut changer si un résultat amont est annulé/rejoué :
// on garde donc les maps teams + joueurs complètes et on résout depuis l'état vivant.

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { callTournamentEF, type TournamentMatch, type MatchStatus } from '@/lib/tournois'

export interface MatchTeamInfo {
  name: string
  seed: number | null
}

interface MatchLiveProps {
  tournamentId: string
  initialMatch: TournamentMatch
  teams:        Record<string, MatchTeamInfo>   // id → infos (toutes les équipes du tournoi)
  teamPlayers:  Record<string, string[]>        // id → pseudos Riot
  canManage:    boolean
}

const MATCH_STATUS_LABELS: Record<MatchStatus, string> = {
  pending:     'En attente',
  ready:       'Prêt',
  in_progress: 'En cours',
  finished:    'Terminé',
}

const MATCH_STATUS_COLORS: Record<MatchStatus, string> = {
  pending:     '#8fa0bb',
  ready:       '#8fc6f5',
  in_progress: '#5DCAA5',
  finished:    '#f06ad8',
}

const btnStyle: React.CSSProperties = {
  background: 'rgba(28,58,110,0.6)',
  border: '1px solid rgba(47,111,222,0.4)',
  borderRadius: 4,
  color: '#8fc6f5',
  fontFamily: 'Rajdhani, sans-serif',
  fontWeight: 600,
  fontSize: 14,
  textTransform: 'uppercase',
  letterSpacing: '.05em',
  padding: '9px 18px',
  cursor: 'pointer',
}

export default function MatchLive({
  tournamentId, initialMatch, teams, teamPlayers, canManage,
}: MatchLiveProps) {
  const router = useRouter()
  const [match, setMatch] = useState<TournamentMatch>(initialMatch)

  // ── Realtime : patch de la ligne match courante ────────────────────────────
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`match-${initialMatch.id}`)
      .on(
        'postgres_changes',
        {
          event:  'UPDATE',
          schema: 'public',
          table:  'matches',
          filter: `tournament_id=eq.${tournamentId}`,
        },
        (payload) => {
          const row = payload.new as TournamentMatch
          if (row.id === initialMatch.id) setMatch(row)
        },
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [initialMatch.id, tournamentId])

  // ── Action organisateur via EF (revérifiée côté serveur) ───────────────────
  const [busy, setBusy]           = useState<string | null>(null)
  const [error, setError]         = useState<string | null>(null)
  const [pick, setPick]           = useState<string>('')
  const [confirming, setConfirming] = useState(false)

  const run = useCallback(async (
    key: string,
    action: 'start_match' | 'report_result' | 'undo_result',
    extra: Record<string, unknown> = {},
  ) => {
    if (busy) return
    setBusy(key)
    setError(null)

    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      setError('Session expirée — reconnecte-toi.')
      setBusy(null)
      return
    }

    const { error: efError } = await callTournamentEF(
      'tournament-admin',
      { action, tournament_id: tournamentId, match_id: match.id, ...extra },
      session.access_token,
    )

    setBusy(null)
    if (efError) { setError(efError); return }

    setConfirming(false)
    router.refresh()   // l'état vivant arrive aussi par Realtime, mais on resynchronise
  }, [busy, match.id, tournamentId, router])

  // ── Données dérivées de l'état vivant ──────────────────────────────────────
  const finished   = match.status === 'finished'
  const inProgress = match.status === 'in_progress'
  const ready      = match.status === 'ready'

  function teamBlock(teamId: string | null, slot: 'a' | 'b') {
    const team    = teamId ? teams[teamId] : undefined
    const players = teamId ? (teamPlayers[teamId] ?? []) : []
    const isWinner = finished && match.winner_id != null && match.winner_id === teamId

    return (
      <div
        style={{
          flex: 1,
          minWidth: 0,
          padding: '20px 22px',
          background: isWinner ? 'rgba(240,106,216,0.08)' : 'rgba(28,58,110,0.18)',
          border: isWinner ? '1.5px solid var(--xv2-pink)' : '1px solid rgba(47,111,222,0.22)',
          borderRadius: 8,
          textAlign: slot === 'a' ? 'left' : 'right',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, justifyContent: slot === 'a' ? 'flex-start' : 'flex-end' }}>
          {team?.seed != null && (
            <span className="xv2-data" style={{ color: '#6e85a0', fontSize: 13 }}>.{team.seed}</span>
          )}
          <span
            className="xv2-display"
            style={{
              fontSize: 'clamp(18px, 3.5vw, 26px)',
              color: team ? (isWinner ? 'var(--xv2-pink)' : '#fff') : 'rgba(255,255,255,0.3)',
            }}
          >
            {team ? team.name : 'À déterminer'}
          </span>
          {isWinner && (
            <span className="xv2-data" style={{ color: 'var(--xv2-pink)', fontSize: 12, letterSpacing: '.08em' }}>
              ★ VAINQUEUR
            </span>
          )}
        </div>

        {players.length > 0 && (
          <ul style={{ listStyle: 'none', margin: '12px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {players.map((p, i) => (
              <li key={`${teamId}-${i}`} className="xv2-data" style={{ color: '#8fa0bb', fontSize: 14 }}>
                {p}
              </li>
            ))}
          </ul>
        )}
      </div>
    )
  }

  return (
    <section
      aria-label={`Match ${match.code}`}
      className="xv2-bg"
      style={{ borderRadius: 10, padding: 'clamp(20px, 4vw, 32px)', display: 'flex', flexDirection: 'column', gap: 20 }}
    >
      {/* En-tête match : code + statut */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <span className="xv2-display" style={{ fontSize: 20, color: '#fff' }}>
          MATCH {match.code}
        </span>
        <span
          className="xv2-data"
          style={{
            fontSize: 13,
            letterSpacing: '.08em',
            textTransform: 'uppercase',
            color: MATCH_STATUS_COLORS[match.status],
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          {inProgress && <span className="xv2-badge-live">EN COURS</span>}
          {MATCH_STATUS_LABELS[match.status]}
        </span>
      </div>

      {/* Affrontement */}
      <div style={{ display: 'flex', alignItems: 'stretch', gap: 14, flexWrap: 'wrap' }}>
        {teamBlock(match.team_a, 'a')}
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span className="xv2-display" style={{ color: '#6e85a0', fontSize: 18 }}>VS</span>
        </div>
        {teamBlock(match.team_b, 'b')}
      </div>

      {/* ── Contrôles organisateur (revérifiés côté EF) ── */}
      {canManage && (
        <div
          style={{
            borderTop: '1px solid rgba(255,255,255,0.08)',
            paddingTop: 18,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          <span className="xv2-data" style={{ color: '#8fa0bb', fontSize: 12, letterSpacing: '.08em', textTransform: 'uppercase' }}>
            Contrôles organisateur
          </span>

          {error && (
            <p role="alert" className="xv2-data" style={{
              margin: 0, padding: '9px 14px', borderRadius: 4, fontSize: 14,
              background: 'rgba(224,49,49,0.12)', border: '1px solid rgba(224,49,49,0.4)', color: '#ff8787',
            }}>
              {error}
            </p>
          )}

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            {/* Lancer */}
            {ready && (
              <button
                style={{ ...btnStyle, color: '#fff', background: 'linear-gradient(135deg, #1c3a6e 0%, #2f6fde 100%)', border: 'none' }}
                disabled={busy !== null}
                onClick={() => run('start', 'start_match')}
              >
                {busy === 'start' ? '…' : 'Lancer le match'}
              </button>
            )}

            {/* Reporter — sélection vainqueur + confirmation */}
            {(ready || inProgress) && (
              <>
                <select
                  value={pick}
                  aria-label={`Vainqueur du match ${match.code}`}
                  onChange={(e) => { setPick(e.target.value); setConfirming(false) }}
                  style={{ ...btnStyle, padding: '8px 10px', background: 'rgba(20,9,28,0.85)', textTransform: 'none' }}
                >
                  <option value="">Vainqueur…</option>
                  {match.team_a && <option value={match.team_a}>{teams[match.team_a]?.name ?? '?'}</option>}
                  {match.team_b && <option value={match.team_b}>{teams[match.team_b]?.name ?? '?'}</option>}
                </select>
                {pick && !confirming && (
                  <button style={btnStyle} disabled={busy !== null} onClick={() => setConfirming(true)}>
                    Reporter le résultat
                  </button>
                )}
                {pick && confirming && (
                  <button
                    style={{ ...btnStyle, color: '#fff', background: 'linear-gradient(135deg, #1c3a6e 0%, #2f6fde 100%)', border: 'none' }}
                    disabled={busy !== null}
                    onClick={() => run('report', 'report_result', { winner_id: pick })}
                  >
                    {busy === 'report' ? '…' : `Confirmer ${teams[pick]?.name ?? ''} ?`}
                  </button>
                )}
              </>
            )}

            {/* Annuler */}
            {finished && (
              <button
                style={{ ...btnStyle, color: '#ff8787', borderColor: 'rgba(224,49,49,0.4)' }}
                disabled={busy !== null}
                onClick={() => run('undo', 'undo_result')}
              >
                {busy === 'undo' ? '…' : 'Annuler le résultat'}
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
