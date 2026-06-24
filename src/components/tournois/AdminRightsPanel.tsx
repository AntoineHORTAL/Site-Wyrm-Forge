'use client'

// AdminRightsPanel — gestion des droits admin tournoi (réservé admin GLOBAL).
// grant/revoke via l'EF (revérifie global). Liste via list_admins. Confirmation
// sur la révocation (destructif).

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { callTournamentEF, type TournamentSeries } from '@/lib/tournois'

interface AdminRow { id: string; user_id: string; scope: string; email: string | null }
type ScopeKind = 'global' | 'series' | 'tournament'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const input: React.CSSProperties = {
  background: 'rgba(20,9,28,0.8)', border: '1px solid rgba(47,111,222,0.35)', borderRadius: 4,
  padding: '8px 10px', color: '#fff', fontFamily: 'Rajdhani, sans-serif', fontSize: 13, outline: 'none',
}
const btn: React.CSSProperties = {
  background: 'rgba(28,58,110,0.6)', border: '1px solid rgba(47,111,222,0.4)', borderRadius: 4,
  color: '#8fc6f5', fontFamily: 'Rajdhani, sans-serif', fontWeight: 600, fontSize: 13,
  padding: '8px 14px', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '.05em',
}

export default function AdminRightsPanel({ series }: { series: TournamentSeries[] }) {
  const [admins, setAdmins] = useState<AdminRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]   = useState<string | null>(null)
  const [busy, setBusy]     = useState(false)
  const [confirmId, setConfirmId] = useState<string | null>(null)

  const [targetUser, setTargetUser] = useState('')
  const [scopeKind, setScopeKind]   = useState<ScopeKind>('global')
  const [scopeSerie, setScopeSerie] = useState(series[0]?.slug ?? '')
  const [scopeTournament, setScopeTournament] = useState('')

  async function token(): Promise<string | null> {
    const { data: { session } } = await createClient().auth.getSession()
    return session?.access_token ?? null
  }

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    const t = await token()
    if (!t) { setError('Session expirée.'); setLoading(false); return }
    const { data, error: e } = await callTournamentEF<{ admins: AdminRow[] }>(
      'tournament-admin', { action: 'list_admins' }, t,
    )
    setLoading(false)
    if (e) { setError(e); return }
    setAdmins(data?.admins ?? [])
  }, [])

  useEffect(() => { load() }, [load])

  function buildScope(): string | null {
    if (scopeKind === 'global') return 'global'
    if (scopeKind === 'series') return scopeSerie ? `series:${scopeSerie}` : null
    return UUID_RE.test(scopeTournament.trim()) ? scopeTournament.trim() : null
  }

  async function grant() {
    if (busy) return
    setError(null)
    if (!UUID_RE.test(targetUser.trim())) { setError('UUID utilisateur invalide.'); return }
    const scope = buildScope()
    if (!scope) { setError('Scope invalide.'); return }
    setBusy(true)
    const t = await token()
    if (!t) { setError('Session expirée.'); setBusy(false); return }
    const { error: e } = await callTournamentEF('tournament-admin',
      { action: 'grant_admin', target_user_id: targetUser.trim(), scope }, t)
    setBusy(false)
    if (e) { setError(e); return }
    setTargetUser('')
    load()
  }

  async function revoke(row: AdminRow) {
    if (busy) return
    setBusy(true); setError(null)
    const t = await token()
    if (!t) { setError('Session expirée.'); setBusy(false); return }
    const { error: e } = await callTournamentEF('tournament-admin',
      { action: 'revoke_admin', target_user_id: row.user_id, scope: row.scope }, t)
    setBusy(false); setConfirmId(null)
    if (e) { setError(e); return }
    load()
  }

  return (
    <section style={{ padding: '20px', borderRadius: 8, background: 'rgba(20,9,28,0.5)', border: '1px solid rgba(47,111,222,0.25)', marginTop: 28 }}>
      <h2 className="xv2-display" style={{ fontSize: 18, color: '#fff', margin: '0 0 16px' }}>GESTION DES DROITS</h2>

      {error && <p role="alert" className="xv2-data" style={{ color: '#ff8787', fontSize: 13, margin: '0 0 12px' }}>{error}</p>}

      {/* Attribution */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 18 }}>
        <input value={targetUser} onChange={(e) => setTargetUser(e.target.value)} placeholder="UUID utilisateur" style={{ ...input, minWidth: 280 }} />
        <select value={scopeKind} onChange={(e) => setScopeKind(e.target.value as ScopeKind)} style={input}>
          <option value="global">Global</option>
          <option value="series">Une série</option>
          <option value="tournament">Un tournoi</option>
        </select>
        {scopeKind === 'series' && (
          <select value={scopeSerie} onChange={(e) => setScopeSerie(e.target.value)} style={input}>
            {series.map((s) => <option key={s.id} value={s.slug}>{s.display_name}</option>)}
          </select>
        )}
        {scopeKind === 'tournament' && (
          <input value={scopeTournament} onChange={(e) => setScopeTournament(e.target.value)} placeholder="UUID tournoi" style={{ ...input, minWidth: 280 }} />
        )}
        <button onClick={grant} disabled={busy} style={{ ...btn, color: '#fff', background: 'linear-gradient(135deg, #1c3a6e 0%, #2f6fde 100%)', border: 'none' }}>
          Attribuer
        </button>
      </div>

      {/* Liste */}
      {loading ? (
        <p className="xv2-data" style={{ color: '#6e85a0', fontSize: 13 }}>Chargement…</p>
      ) : admins.length === 0 ? (
        <p className="xv2-data" style={{ color: '#6e85a0', fontSize: 13 }}>Aucun droit attribué.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {admins.map((a) => (
            <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '8px 12px', borderRadius: 5, background: 'rgba(28,58,110,0.2)', border: '1px solid rgba(47,111,222,0.2)' }}>
              <span className="xv2-data" style={{ color: '#fff', fontSize: 13, flex: 1, minWidth: 200 }}>
                {a.email ?? a.user_id}
              </span>
              <span className="xv2-data" style={{ color: '#8fc6f5', fontSize: 12 }}>{a.scope}</span>
              {confirmId === a.id ? (
                <button onClick={() => revoke(a)} disabled={busy} style={{ ...btn, color: '#fff', background: '#e03131', border: 'none' }}>
                  Confirmer le retrait ?
                </button>
              ) : (
                <button onClick={() => setConfirmId(a.id)} style={{ ...btn, color: '#ff8787', borderColor: 'rgba(224,49,49,0.4)' }}>
                  Révoquer
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
