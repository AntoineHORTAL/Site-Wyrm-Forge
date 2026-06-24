'use client'

// TournamentAdminActions — barre d'actions admin sur la page tournoi.
// Visible UNIQUEMENT si canManage (garde serveur). L'EF revérifie de toute façon
// (open_registration → 403 pour un non-admin appelant en direct).

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { callTournamentEF, tournamentPath, type TournamentStatus } from '@/lib/tournois'

interface Props {
  serie:        string
  slug:         string
  tournamentId: string
  status:       TournamentStatus
}

export default function TournamentAdminActions({ serie, slug, tournamentId, status }: Props) {
  const router = useRouter()
  const [busy, setBusy]   = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function openRegistration() {
    if (busy) return
    setBusy(true); setError(null)
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setError('Session expirée — reconnecte-toi.'); setBusy(false); return }
    const { error: efError } = await callTournamentEF(
      'tournament-admin',
      { action: 'open_registration', tournament_id: tournamentId },
      session.access_token,
    )
    setBusy(false)
    if (efError) { setError(efError); return }
    router.refresh()
  }

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
        padding: '12px 16px', borderRadius: 8,
        background: 'rgba(20,9,28,0.5)', border: '1px solid rgba(47,111,222,0.25)',
      }}
    >
      <span className="xv2-data" style={{ color: '#6e85a0', fontSize: 12, textTransform: 'uppercase', letterSpacing: '.08em' }}>
        Organisateur
      </span>
      <Link href={tournamentPath(serie, slug, '/edit')} className="xv2-data" style={{
        padding: '7px 14px', borderRadius: 4, textDecoration: 'none', fontSize: 13,
        color: '#8fc6f5', background: 'rgba(28,58,110,0.6)', border: '1px solid rgba(47,111,222,0.4)',
        textTransform: 'uppercase', letterSpacing: '.05em',
      }}>
        Modifier le tournoi
      </Link>
      <Link href={tournamentPath(serie, slug, '/admin')} className="xv2-data" style={{
        padding: '7px 14px', borderRadius: 4, textDecoration: 'none', fontSize: 13,
        color: '#8fc6f5', background: 'rgba(28,58,110,0.6)', border: '1px solid rgba(47,111,222,0.4)',
        textTransform: 'uppercase', letterSpacing: '.05em',
      }}>
        Panneau orga
      </Link>
      {status === 'draft' && (
        <button onClick={openRegistration} disabled={busy} className="xv2-data" style={{
          padding: '7px 14px', borderRadius: 4, fontSize: 13, cursor: busy ? 'not-allowed' : 'pointer',
          color: '#fff', background: 'linear-gradient(135deg, #1c3a6e 0%, #2f6fde 100%)', border: 'none',
          textTransform: 'uppercase', letterSpacing: '.05em',
        }}>
          {busy ? '…' : 'Ouvrir les inscriptions'}
        </button>
      )}
      {error && <span role="alert" className="xv2-data" style={{ color: '#ff8787', fontSize: 13 }}>{error}</span>}
    </div>
  )
}
