'use client'

/**
 * Bandeau dashboard : signale une demande de suivi « prac » en attente.
 *
 * Affiché UNIQUEMENT si un dossier tracked_players en status='pending' existe
 * pour l'utilisateur courant. Composant isolé (même motif que DeletionRequest
 * dans /profil) : son propre useEffect, point-lookup indexé NON bloquant (jamais
 * dans le chemin de chargement principal de page.tsx), et `return null` tant qu'on
 * charge OU si aucun dossier pending → aucun flash, aucun layout shift, et coût
 * imperceptible pour l'immense majorité des joueurs (qui n'ont jamais de dossier).
 *
 * Lecture via la policy RLS tp_select (Lot A) — aucune policy supplémentaire.
 */
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

const supabase = createClient()

export default function ConsentBanner() {
  const [pending, setPending] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function check() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { if (!cancelled) setLoading(false); return }
      // profile_id est unique-indexé ; le filtre status='pending' rend le lookup
      // ponctuel et renvoie 0 ligne (data = null, pas une erreur) pour 99 % des users.
      const { data } = await supabase
        .from('tracked_players')
        .select('status')
        .eq('profile_id', user.id)
        .eq('status', 'pending')
        .maybeSingle()
      if (!cancelled) {
        setPending(!!data)
        setLoading(false)
      }
    }
    check()
    return () => { cancelled = true }
  }, [])

  if (loading || !pending) return null

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
      marginBottom: 20, padding: '12px 18px', borderRadius: 8,
      background: 'rgba(127,119,221,0.10)',
      border: '1px solid rgba(127,119,221,0.3)',
      borderLeft: '3px solid #7F77DD',
    }}>
      <div style={{ flex: 1, minWidth: 200 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#F5F2FA', marginBottom: 2 }}>
          Une demande de suivi t&apos;attend
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          Un organisateur souhaite suivre tes performances. À toi d&apos;accepter ou de refuser.
        </div>
      </div>
      <Link href="/consent" style={{
        padding: '8px 16px', borderRadius: 6, fontSize: 13, fontWeight: 600,
        textDecoration: 'none', whiteSpace: 'nowrap',
        background: 'rgba(127,119,221,0.18)', border: '1px solid #7F77DD', color: '#F5F2FA',
      }}>Voir la demande</Link>
    </div>
  )
}
