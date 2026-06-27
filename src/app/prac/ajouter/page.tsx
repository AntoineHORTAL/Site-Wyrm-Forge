'use client'

/**
 * /prac/ajouter — UI de tracking de matchs (désambiguïsation), admin prac only.
 *
 * Garde d'accès portée par src/app/prac/layout.tsx (prac_admins). Flow :
 *   1. Choisir un joueur 'accepted' (EF list).
 *   2. Saisir une fenêtre [from, to].
 *   3. resolve → candidats ; sélection EXPLICITE multi-matchs (jamais de devinette).
 *      Les matchs déjà trackés sont grisés / non sélectionnables.
 *   4. commit → { inserted, skipped, not_found } affiché.
 *
 * Toute la logique sensible vit dans l'EF prac-track (garde is_prac_admin,
 * snapshot serveur, garde de concurrence). Cette page ne fait qu'orchestrer.
 */
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  callPracTrack, queueLabel,
  type PracPlayer, type ResolveCandidate, type CommitResult,
} from '@/lib/prac'

const supabase = createClient()

// Date → valeur d'<input type="datetime-local"> (heure locale, sans secondes)
function toLocalInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

export default function PracAjouterPage() {
  const [token, setToken] = useState<string | null>(null)

  const [players, setPlayers]       = useState<PracPlayer[]>([])
  const [playersError, setPlayersError] = useState('')
  const [selectedId, setSelectedId] = useState('')

  const now = new Date()
  const [from, setFrom] = useState(toLocalInput(new Date(now.getTime() - 24 * 3600 * 1000)))
  const [to,   setTo]   = useState(toLocalInput(now))

  const [candidates, setCandidates] = useState<ResolveCandidate[] | null>(null)
  const [selected, setSelected]     = useState<Set<string>>(new Set())
  const [resolving, setResolving]   = useState(false)
  const [resolveError, setResolveError] = useState('')

  const [committing, setCommitting] = useState(false)
  const [commitResult, setCommitResult] = useState<CommitResult | null>(null)
  const [commitError, setCommitError]   = useState('')

  const selectedPlayer = players.find((p) => p.tracked_player_id === selectedId) ?? null

  // ── Token + liste des joueurs ──────────────────────────────────────────────
  const loadPlayers = useCallback(async (tok: string) => {
    const { data, error } = await callPracTrack<{ players: PracPlayer[] }>({ action: 'list' }, tok)
    if (error) { setPlayersError(error); return }
    setPlayers(data?.players ?? [])
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const tok = data.session?.access_token ?? null
      setToken(tok)
      if (tok) loadPlayers(tok)
    })
  }, [loadPlayers])

  // ── resolve ────────────────────────────────────────────────────────────────
  async function doResolve() {
    if (!token || !selectedPlayer || resolving) return
    setResolving(true); setResolveError(''); setCommitResult(null); setCommitError('')
    setCandidates(null); setSelected(new Set())

    const fromISO = new Date(from).toISOString()
    const toISO   = new Date(to).toISOString()
    if (new Date(from) >= new Date(to)) {
      setResolveError('La date de début doit précéder la date de fin.')
      setResolving(false); return
    }

    const { data, error } = await callPracTrack<{ candidates: ResolveCandidate[] }>(
      { action: 'resolve', tracked_player_id: selectedId, from: fromISO, to: toISO },
      token,
    )
    if (error) { setResolveError(error); setResolving(false); return }
    setCandidates(data?.candidates ?? [])
    setResolving(false)
  }

  // ── commit ─────────────────────────────────────────────────────────────────
  async function doCommit() {
    if (!token || committing || selected.size === 0) return
    setCommitting(true); setCommitError(''); setCommitResult(null)

    const { data, error } = await callPracTrack<CommitResult>(
      { action: 'commit', tracked_player_id: selectedId, match_ids: [...selected] },
      token,
    )
    if (error) { setCommitError(error); setCommitting(false); return }
    setCommitResult(data)
    setCommitting(false)
    // Re-resolve pour rafraîchir les flags already_tracked + vider la sélection
    await doResolve()
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const selectableIds = (candidates ?? []).filter((c) => !c.already_tracked).map((c) => c.match_id)
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selected.has(id))

  return (
    <div>
      <h1 style={{ fontFamily: 'Cinzel, serif', fontSize: 'clamp(24px, 3.5vw, 34px)', margin: '0 0 6px', color: '#fff' }}>
        Ajouter des matchs
      </h1>
      <p style={{ color: '#9b93b5', fontSize: 14, margin: '0 0 24px' }}>
        Sélectionne un joueur suivi et une fenêtre horaire, puis choisis les parties à tracker.
      </p>

      {playersError && <Banner kind="err">{playersError}</Banner>}

      {/* ── Sélection joueur + fenêtre ── */}
      <section style={card}>
        <Label>Joueur suivi</Label>
        {players.length === 0 && !playersError ? (
          <p style={{ color: '#9b93b5', fontSize: 13, margin: 0 }}>Aucun joueur n&apos;a accepté le suivi pour l&apos;instant.</p>
        ) : (
          <select value={selectedId} onChange={(e) => { setSelectedId(e.target.value); setCandidates(null); setCommitResult(null) }} style={input}>
            <option value="">— Choisir un joueur —</option>
            {players.map((p) => (
              <option key={p.tracked_player_id} value={p.tracked_player_id}>
                {p.game_name ? `${p.game_name}#${p.tag_line}` : (p.username ?? 'Joueur')}{p.linked ? '' : ' (non lié)'}
              </option>
            ))}
          </select>
        )}

        {selectedPlayer && !selectedPlayer.linked && (
          <Banner kind="warn">Ce joueur n&apos;a pas lié de compte Riot — la résolution est impossible.</Banner>
        )}

        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 14 }}>
          <div style={{ flex: 1, minWidth: 180 }}>
            <Label>Début</Label>
            <input type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} style={input} />
          </div>
          <div style={{ flex: 1, minWidth: 180 }}>
            <Label>Fin</Label>
            <input type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} style={input} />
          </div>
        </div>

        <button
          onClick={doResolve}
          disabled={resolving || !selectedPlayer || !selectedPlayer.linked}
          style={{ ...btnPrimary, marginTop: 16, opacity: (!selectedPlayer || !selectedPlayer.linked) ? 0.5 : 1 }}
        >
          {resolving ? 'Recherche…' : 'Rechercher les parties'}
        </button>
        {resolveError && <Banner kind="err">{resolveError}</Banner>}
      </section>

      {/* ── Candidats ── */}
      {candidates && (
        <section style={{ ...card, marginTop: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
            <Label>{candidates.length} partie{candidates.length > 1 ? 's' : ''} dans la fenêtre</Label>
            {selectableIds.length > 0 && (
              <button
                onClick={() => setSelected(allSelected ? new Set() : new Set(selectableIds))}
                style={btnGhost}
              >
                {allSelected ? 'Tout désélectionner' : 'Tout sélectionner'}
              </button>
            )}
          </div>

          {candidates.length === 0 ? (
            <p style={{ color: '#9b93b5', fontSize: 13, margin: 0 }}>Aucune partie trouvée dans cette fenêtre.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {candidates.map((c) => {
                const disabled = c.already_tracked
                const checked  = selected.has(c.match_id)
                return (
                  <label
                    key={c.match_id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 8,
                      background: disabled ? 'rgba(255,255,255,0.015)' : checked ? 'rgba(239,159,39,0.10)' : 'rgba(255,255,255,0.03)',
                      border: `1px solid ${checked ? 'rgba(239,159,39,0.4)' : 'rgba(255,255,255,0.08)'}`,
                      cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
                    }}
                  >
                    <input type="checkbox" checked={checked} disabled={disabled} onChange={() => toggle(c.match_id)} />
                    <span style={{ width: 10, height: 10, borderRadius: '50%', flexShrink: 0, background: c.win ? '#5DCAA5' : '#E24B4A' }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, color: '#E9E6F2', fontWeight: 600 }}>
                        {c.champion_name} <span style={{ color: '#9b93b5', fontWeight: 400 }}>· {c.kills}/{c.deaths}/{c.assists}</span>
                      </div>
                      <div style={{ fontSize: 12, color: '#9b93b5' }}>
                        {queueLabel(c.queue_id)} · {new Date(c.game_creation).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        {disabled && <span style={{ color: '#EF9F27' }}> · déjà tracké</span>}
                      </div>
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 700, color: c.win ? '#5DCAA5' : '#E24B4A' }}>{c.win ? 'V' : 'D'}</span>
                  </label>
                )
              })}
            </div>
          )}

          {selectableIds.length > 0 && (
            <button onClick={doCommit} disabled={committing || selected.size === 0} style={{ ...btnPrimary, marginTop: 16, opacity: selected.size === 0 ? 0.5 : 1 }}>
              {committing ? 'Enregistrement…' : `Tracker la sélection (${selected.size})`}
            </button>
          )}
          {commitError && <Banner kind="err">{commitError}</Banner>}
          {commitResult && (
            <Banner kind="ok">
              {commitResult.inserted} ajouté{commitResult.inserted > 1 ? 's' : ''}
              {commitResult.skipped > 0 && `, ${commitResult.skipped} déjà présent${commitResult.skipped > 1 ? 's' : ''}`}
              {commitResult.not_found.length > 0 && `, ${commitResult.not_found.length} introuvable${commitResult.not_found.length > 1 ? 's' : ''}`}.
            </Banner>
          )}
        </section>
      )}
    </div>
  )
}

// ── Présentation (palette shell prac) ─────────────────────────────────────────
const card: React.CSSProperties = {
  padding: '18px 20px', borderRadius: 10,
  background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
}
const input: React.CSSProperties = {
  width: '100%', padding: '9px 11px', borderRadius: 6, fontSize: 14,
  background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.12)',
  color: '#E9E6F2', fontFamily: 'inherit', outline: 'none',
}
const btnPrimary: React.CSSProperties = {
  padding: '9px 18px', borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: 'pointer',
  background: 'rgba(239,159,39,0.18)', border: '1px solid #EF9F27', color: '#fff',
}
const btnGhost: React.CSSProperties = {
  padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
  background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', color: '#E9E6F2',
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.08em', color: '#9b93b5', marginBottom: 6, fontWeight: 600 }}>
      {children}
    </div>
  )
}

function Banner({ kind, children }: { kind: 'ok' | 'err' | 'warn'; children: React.ReactNode }) {
  const c = kind === 'ok' ? '#5DCAA5' : kind === 'warn' ? '#EF9F27' : '#E24B4A'
  return (
    <div style={{
      marginTop: 12, padding: '8px 12px', borderRadius: 6, fontSize: 13,
      background: `${c}1A`, borderLeft: `3px solid ${c}`, color: c,
    }}>{children}</div>
  )
}
