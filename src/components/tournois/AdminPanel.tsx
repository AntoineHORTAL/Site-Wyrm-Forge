'use client'

// AdminPanel — actions organisateur, branchées sur l'Edge Function tournament-admin.
// Visible uniquement après la garde serveur de /tournois/[slug]/admin
// (created_by ou admin) — l'EF revérifie les droits de toute façon.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  callTournamentEF,
  TOURNAMENT_STATUS_LABELS,
  type Tournament,
  type TournamentTeam,
  type TournamentMatch,
} from '@/lib/tournois'

interface AdminPanelProps {
  tournament: Tournament
  teams:      TournamentTeam[]
  matches:    TournamentMatch[]
}

type AdminAction =
  | 'open_registration' | 'close_registration'
  | 'validate_team' | 'reject_team'
  | 'seed_bracket' | 'start_match' | 'report_result' | 'undo_result'
  | 'set_status'

const TEAM_STATUS_LABELS: Record<TournamentTeam['status'], string> = {
  pending:   'En attente',
  validated: 'Validée',
  rejected:  'Rejetée',
}

const TEAM_STATUS_COLORS: Record<TournamentTeam['status'], string> = {
  pending:   '#8fc6f5',
  validated: '#5DCAA5',
  rejected:  '#e03131',
}

const MATCH_STATUS_LABELS: Record<TournamentMatch['status'], string> = {
  pending:     'En attente',
  ready:       'Prêt',
  in_progress: 'En cours',
  finished:    'Terminé',
}

const btnStyle: React.CSSProperties = {
  background: 'rgba(28,58,110,0.6)',
  border: '1px solid rgba(47,111,222,0.4)',
  borderRadius: 4,
  color: '#8fc6f5',
  fontFamily: 'Rajdhani, sans-serif',
  fontWeight: 600,
  fontSize: 13,
  textTransform: 'uppercase',
  letterSpacing: '.05em',
  padding: '7px 14px',
  cursor: 'pointer',
}

const sectionStyle: React.CSSProperties = {
  padding: '22px 20px',
  background: 'rgba(20,9,28,0.6)',
  border: '1px solid rgba(47,111,222,0.25)',
  borderRadius: 8,
}

function sortByCode(matches: TournamentMatch[]): TournamentMatch[] {
  return [...matches].sort(
    (a, b) => parseInt(a.code.slice(1), 10) - parseInt(b.code.slice(1), 10))
}

export default function AdminPanel({ tournament, teams, matches }: AdminPanelProps) {
  const router = useRouter()

  const [busy, setBusy]               = useState<string | null>(null)  // clé d'action en cours
  const [error, setError]             = useState<string | null>(null)
  const [info, setInfo]               = useState<string | null>(null)
  // Sélection du vainqueur par match (report_result)
  const [winnerPick, setWinnerPick]   = useState<Record<string, string>>({})
  // Confirmation avant report définitif
  const [confirming, setConfirming]   = useState<string | null>(null)

  const validatedCount = teams.filter((t) => t.status === 'validated').length
  const teamName = (id: string | null) =>
    id ? (teams.find((t) => t.id === id)?.name ?? '?') : '—'

  async function run(
    key: string,
    action: AdminAction,
    extra: Record<string, unknown> = {},
  ) {
    if (busy) return
    setBusy(key)
    setError(null)
    setInfo(null)

    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      setError('Session expirée — reconnecte-toi.')
      setBusy(null)
      return
    }

    const { error: efError } = await callTournamentEF(
      'tournament-admin',
      { action, tournament_id: tournament.id, ...extra },
      session.access_token,
    )

    setBusy(null)

    if (efError) {
      setError(efError)
      return
    }

    setInfo('Action effectuée.')
    setConfirming(null)
    router.refresh()   // re-render serveur → props à jour
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Feedback global */}
      {error && (
        <p role="alert" className="xv2-data" style={{
          margin: 0, padding: '10px 14px', borderRadius: 4, fontSize: 14,
          background: 'rgba(224,49,49,0.12)', border: '1px solid rgba(224,49,49,0.4)', color: '#ff8787',
        }}>
          {error}
        </p>
      )}
      {info && !error && (
        <p role="status" className="xv2-data" style={{
          margin: 0, padding: '10px 14px', borderRadius: 4, fontSize: 14,
          background: 'rgba(93,202,165,0.1)', border: '1px solid rgba(93,202,165,0.35)', color: '#5DCAA5',
        }}>
          {info}
        </p>
      )}

      {/* ── Statut du tournoi ── */}
      <section style={sectionStyle} aria-label="Statut du tournoi">
        <h2 className="xv2-display" style={{ fontSize: 18, color: '#fff', margin: '0 0 14px' }}>
          STATUT : <span style={{ color: '#f06ad8' }}>{TOURNAMENT_STATUS_LABELS[tournament.status]}</span>
        </h2>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {tournament.status === 'draft' && (
            <button
              style={btnStyle}
              disabled={busy !== null}
              onClick={() => run('open', 'open_registration')}
            >
              {busy === 'open' ? '…' : 'Ouvrir les inscriptions'}
            </button>
          )}

          {tournament.status === 'registration' && (
            <button
              style={btnStyle}
              disabled={busy !== null}
              onClick={() => run('close', 'close_registration')}
            >
              {busy === 'close' ? '…' : 'Clore les inscriptions'}
            </button>
          )}

          {matches.length === 0 && (tournament.status === 'registration' || tournament.status === 'live') && (
            <button
              style={{
                ...btnStyle,
                background: validatedCount === 8
                  ? 'linear-gradient(135deg, #1c3a6e 0%, #2f6fde 100%)'
                  : btnStyle.background,
                color: validatedCount === 8 ? '#fff' : btnStyle.color,
              }}
              disabled={busy !== null}
              onClick={() => run('seed', 'seed_bracket')}
              title={validatedCount !== 8 ? 'Il faut exactement 8 équipes validées' : undefined}
            >
              {busy === 'seed' ? '…' : `Générer le bracket (${validatedCount}/8 équipes validées)`}
            </button>
          )}
        </div>
      </section>

      {/* ── Équipes ── */}
      <section style={sectionStyle} aria-label="Gestion des équipes">
        <h2 className="xv2-display" style={{ fontSize: 18, color: '#fff', margin: '0 0 14px' }}>
          ÉQUIPES <span className="xv2-data" style={{ fontSize: 13, color: '#8fa0bb' }}>
            ({validatedCount} validée{validatedCount > 1 ? 's' : ''} / {teams.length} inscrite{teams.length > 1 ? 's' : ''})
          </span>
        </h2>

        {teams.length === 0 ? (
          <p className="xv2-data" style={{ color: '#6e85a0', fontSize: 14, margin: 0 }}>
            Aucune équipe inscrite pour le moment.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {teams.map((team) => (
              <div
                key={team.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  flexWrap: 'wrap',
                  padding: '8px 12px',
                  background: 'rgba(28,58,110,0.2)',
                  border: '1px solid rgba(47,111,222,0.2)',
                  borderRadius: 5,
                }}
              >
                <span className="xv2-display" style={{ fontSize: 14, color: '#fff', flex: 1, minWidth: 120 }}>
                  {team.seed != null && (
                    <span style={{ color: '#6e85a0', marginRight: 6, fontSize: 12 }}>.{team.seed}</span>
                  )}
                  {team.name}
                </span>
                <span
                  className="xv2-data"
                  style={{ fontSize: 12, color: TEAM_STATUS_COLORS[team.status], textTransform: 'uppercase', letterSpacing: '.06em' }}
                >
                  {TEAM_STATUS_LABELS[team.status]}
                </span>
                {team.status !== 'validated' && (
                  <button
                    style={{ ...btnStyle, padding: '5px 12px', color: '#5DCAA5', borderColor: 'rgba(93,202,165,0.4)' }}
                    disabled={busy !== null}
                    onClick={() => run(`validate-${team.id}`, 'validate_team', { team_id: team.id })}
                  >
                    {busy === `validate-${team.id}` ? '…' : 'Valider'}
                  </button>
                )}
                {team.status !== 'rejected' && (
                  <button
                    style={{ ...btnStyle, padding: '5px 12px', color: '#ff8787', borderColor: 'rgba(224,49,49,0.4)' }}
                    disabled={busy !== null}
                    onClick={() => run(`reject-${team.id}`, 'reject_team', { team_id: team.id })}
                  >
                    {busy === `reject-${team.id}` ? '…' : 'Rejeter'}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Matchs ── */}
      {matches.length > 0 && (
        <section style={sectionStyle} aria-label="Gestion des matchs">
          <h2 className="xv2-display" style={{ fontSize: 18, color: '#fff', margin: '0 0 14px' }}>
            MATCHS
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {sortByCode(matches).map((m) => {
              const ready      = m.status === 'ready'
              const inProgress = m.status === 'in_progress'
              const finished   = m.status === 'finished'
              const pick       = winnerPick[m.id] ?? ''

              return (
                <div
                  key={m.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    flexWrap: 'wrap',
                    padding: '8px 12px',
                    background: 'rgba(28,58,110,0.2)',
                    border: inProgress
                      ? '1px solid rgba(93,202,165,0.5)'
                      : '1px solid rgba(47,111,222,0.2)',
                    borderRadius: 5,
                  }}
                >
                  <span className="xv2-display" style={{ fontSize: 13, color: '#f06ad8', width: 36 }}>
                    {m.code}
                  </span>
                  <span className="xv2-data" style={{ fontSize: 14, color: '#fff', flex: 1, minWidth: 180 }}>
                    {teamName(m.team_a)} <span style={{ color: '#6e85a0' }}>vs</span> {teamName(m.team_b)}
                    {finished && m.winner_id && (
                      <span style={{ color: '#5DCAA5', marginLeft: 8 }}>→ {teamName(m.winner_id)}</span>
                    )}
                  </span>
                  <span className="xv2-data" style={{
                    fontSize: 12,
                    color: inProgress ? '#5DCAA5' : finished ? '#8fa0bb' : '#8fc6f5',
                    textTransform: 'uppercase',
                    letterSpacing: '.06em',
                  }}>
                    {MATCH_STATUS_LABELS[m.status]}
                  </span>

                  {/* Lancer le match */}
                  {ready && (
                    <button
                      style={{ ...btnStyle, padding: '5px 12px' }}
                      disabled={busy !== null}
                      onClick={() => run(`start-${m.id}`, 'start_match', { match_id: m.id })}
                    >
                      {busy === `start-${m.id}` ? '…' : 'Lancer'}
                    </button>
                  )}

                  {/* Reporter le résultat — choix vainqueur + confirmation */}
                  {(ready || inProgress) && (
                    <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                      <select
                        value={pick}
                        aria-label={`Vainqueur du match ${m.code}`}
                        onChange={(e) => {
                          setWinnerPick((prev) => ({ ...prev, [m.id]: e.target.value }))
                          setConfirming(null)
                        }}
                        style={{
                          ...btnStyle,
                          padding: '5px 8px',
                          background: 'rgba(20,9,28,0.8)',
                          textTransform: 'none',
                        }}
                      >
                        <option value="">Vainqueur…</option>
                        {m.team_a && <option value={m.team_a}>{teamName(m.team_a)}</option>}
                        {m.team_b && <option value={m.team_b}>{teamName(m.team_b)}</option>}
                      </select>
                      {pick && confirming !== m.id && (
                        <button
                          style={{ ...btnStyle, padding: '5px 12px' }}
                          disabled={busy !== null}
                          onClick={() => setConfirming(m.id)}
                        >
                          Reporter
                        </button>
                      )}
                      {pick && confirming === m.id && (
                        <button
                          style={{ ...btnStyle, padding: '5px 12px', color: '#fff', background: 'linear-gradient(135deg, #1c3a6e 0%, #2f6fde 100%)' }}
                          disabled={busy !== null}
                          onClick={() => run(`report-${m.id}`, 'report_result', { match_id: m.id, winner_id: pick })}
                        >
                          {busy === `report-${m.id}` ? '…' : `Confirmer ${teamName(pick)} ?`}
                        </button>
                      )}
                    </span>
                  )}

                  {/* Annuler le résultat */}
                  {finished && (
                    <button
                      style={{ ...btnStyle, padding: '5px 12px', color: '#ff8787', borderColor: 'rgba(224,49,49,0.4)' }}
                      disabled={busy !== null}
                      onClick={() => run(`undo-${m.id}`, 'undo_result', { match_id: m.id })}
                    >
                      {busy === `undo-${m.id}` ? '…' : 'Annuler'}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}
