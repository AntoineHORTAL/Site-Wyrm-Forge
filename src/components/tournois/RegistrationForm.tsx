'use client'

// RegistrationForm — inscription d'une équipe (2 joueurs) à un tournoi.
// POST vers l'Edge Function tournament-register (JWT optionnel : si l'utilisateur
// est connecté, son user_id est lié au joueur 1 côté serveur).
// États gérés : succès inline, erreurs FR (renvoyées par l'EF), places restantes.

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  callTournamentEF,
  remainingSlots,
  type Tournament,
  type TournamentTeam,
} from '@/lib/tournois'

interface RegistrationFormProps {
  tournament:   Tournament
  teams:        TournamentTeam[]
  onRegistered: () => void
}

interface PlayerFields {
  riot_pseudo:    string
  discord_pseudo: string
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'rgba(20,9,28,0.8)',
  border: '1px solid rgba(47,111,222,0.35)',
  borderRadius: 4,
  padding: '10px 12px',
  color: '#fff',
  fontFamily: 'Rajdhani, sans-serif',
  fontSize: 14,
  outline: 'none',
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  color: '#8fc6f5',
  fontSize: 12,
  textTransform: 'uppercase',
  letterSpacing: '.08em',
  marginBottom: 6,
}

export default function RegistrationForm({ tournament, teams, onRegistered }: RegistrationFormProps) {
  const [teamName, setTeamName] = useState('')
  const [players, setPlayers]   = useState<PlayerFields[]>([
    { riot_pseudo: '', discord_pseudo: '' },
    { riot_pseudo: '', discord_pseudo: '' },
  ])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError]           = useState<string | null>(null)
  const [success, setSuccess]       = useState(false)

  const remaining = remainingSlots(tournament, teams)
  const isFull    = remaining <= 0

  function setPlayer(index: number, field: keyof PlayerFields, value: string) {
    setPlayers((prev) => prev.map((p, i) => (i === index ? { ...p, [field]: value } : p)))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (submitting || isFull) return

    setSubmitting(true)
    setError(null)

    // JWT optionnel — lie le user_id du demandeur si connecté
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()

    const { error: efError } = await callTournamentEF(
      'tournament-register',
      {
        tournament_id: tournament.id,
        team_name:     teamName.trim(),
        players:       players.map((p) => ({
          riot_pseudo:    p.riot_pseudo.trim(),
          discord_pseudo: p.discord_pseudo.trim(),
        })),
      },
      session?.access_token,
    )

    setSubmitting(false)

    if (efError) {
      setError(efError)
      return
    }

    setSuccess(true)
    onRegistered()
  }

  return (
    <section
      aria-label="Inscription au tournoi"
      style={{
        padding: '28px 24px',
        background: 'rgba(20,9,28,0.6)',
        border: '1px solid rgba(240,106,216,0.3)',
        borderRadius: 8,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
        <h2 className="xv2-display" style={{ fontSize: 22, color: '#fff', margin: 0 }}>
          INSCRIS TON ÉQUIPE
        </h2>
        <span
          className="xv2-data"
          style={{
            color: isFull ? '#e03131' : '#5DCAA5',
            fontSize: 13,
            textTransform: 'uppercase',
            letterSpacing: '.06em',
          }}
        >
          {isFull
            ? 'Inscriptions complètes'
            : `${remaining} place${remaining > 1 ? 's' : ''} restante${remaining > 1 ? 's' : ''}`}
        </span>
      </div>

      {/* Succès inline — remplace le formulaire */}
      {success ? (
        <div
          role="status"
          style={{
            padding: '18px 20px',
            background: 'rgba(93,202,165,0.12)',
            border: '1px solid rgba(93,202,165,0.4)',
            borderRadius: 6,
          }}
        >
          <p className="xv2-display" style={{ margin: '0 0 6px', fontSize: 16, color: '#5DCAA5' }}>
            ÉQUIPE INSCRITE !
          </p>
          <p className="xv2-data" style={{ margin: 0, color: '#8fa0bb', fontSize: 14 }}>
            Ton équipe <strong style={{ color: '#fff' }}>{teamName}</strong> est en attente de
            validation par l&apos;organisateur. Reste joignable sur Discord.
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit}>
          {/* Nom d'équipe */}
          <div style={{ marginBottom: 18 }}>
            <label htmlFor="reg-team-name" className="xv2-data" style={labelStyle}>
              Nom d&apos;équipe
            </label>
            <input
              id="reg-team-name"
              type="text"
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              required
              minLength={3}
              maxLength={24}
              placeholder="LES SANTAS"
              disabled={isFull || submitting}
              style={inputStyle}
            />
          </div>

          {/* Joueurs */}
          <div className="xv2-reg-players">
            {players.map((p, i) => (
              <fieldset
                key={i}
                style={{
                  border: '1px solid rgba(47,111,222,0.25)',
                  borderRadius: 6,
                  padding: '14px 16px',
                  margin: 0,
                }}
              >
                <legend className="xv2-display" style={{ fontSize: 14, color: '#f06ad8', padding: '0 8px' }}>
                  JOUEUR {i + 1}
                </legend>
                <div style={{ marginBottom: 12 }}>
                  <label htmlFor={`reg-riot-${i}`} className="xv2-data" style={labelStyle}>
                    Riot ID
                  </label>
                  <input
                    id={`reg-riot-${i}`}
                    type="text"
                    value={p.riot_pseudo}
                    onChange={(e) => setPlayer(i, 'riot_pseudo', e.target.value)}
                    required
                    placeholder="Faker#T1"
                    disabled={isFull || submitting}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label htmlFor={`reg-discord-${i}`} className="xv2-data" style={labelStyle}>
                    Pseudo Discord
                  </label>
                  <input
                    id={`reg-discord-${i}`}
                    type="text"
                    value={p.discord_pseudo}
                    onChange={(e) => setPlayer(i, 'discord_pseudo', e.target.value)}
                    required
                    placeholder="faker_lol"
                    disabled={isFull || submitting}
                    style={inputStyle}
                  />
                </div>
              </fieldset>
            ))}
          </div>

          {/* Erreur FR renvoyée par l'EF */}
          {error && (
            <p
              role="alert"
              className="xv2-data"
              style={{
                margin: '16px 0 0',
                padding: '10px 14px',
                background: 'rgba(224,49,49,0.12)',
                border: '1px solid rgba(224,49,49,0.4)',
                borderRadius: 4,
                color: '#ff8787',
                fontSize: 14,
              }}
            >
              {error}
            </p>
          )}

          <div style={{ marginTop: 20 }}>
            <button
              type="submit"
              disabled={isFull || submitting}
              className="xv2-btn-primary"
              style={{
                opacity: isFull || submitting ? 0.5 : 1,
                cursor: isFull || submitting ? 'not-allowed' : 'pointer',
                border: 'none',
              }}
            >
              {submitting ? 'Inscription…' : isFull ? 'Complet' : 'Inscrire l\'équipe'}
            </button>
          </div>
        </form>
      )}
    </section>
  )
}
