'use client'

/**
 * Modale de rappel de fin d'abonnement — affichée à J-1 (veille) et le jour J.
 *
 * Lit `tier_expires_at` déjà chargé dans page.tsx (aucune requête supplémentaire).
 * Exclusions : admins + comptes à vie (`tier_expires_at` null) + non-abonnés
 * (`apprenti`). Rien si déjà expiré (la popup « expiré » est hors scope de ce ticket).
 *
 * Comparaison en date CALENDAIRE LOCALE de l'utilisateur (pas l'instant UTC brut).
 * Dédup 1×/jour via localStorage (clé `wf_sub_reminder:<phase>:<yyyy-mm-dd>` locale),
 * marquée à l'affichage → exactement 2 apparitions distinctes (J-1 puis jour J),
 * jamais une popup qui réapparaît à chaque interaction / changement d'onglet.
 *
 * « Renouveler » ouvre l'onglet tarifs (caché) DANS le dashboard via le callback
 * onRenew (setActiveTab('tarifs')) — pas de redirection vers la landing, qui n'est
 * pas montée quand l'utilisateur est connecté.
 */
import { useEffect, useState } from 'react'
import { useTheme } from '@/components/providers/ThemeProvider'

interface Props {
  tier: string
  tierExpiresAt: string | null
  isAdmin: boolean
  onRenew: () => void
}

type Phase = 'j1' | 'jour-j'

// Minuit local du jour de `d` — base de comparaison en date calendaire locale.
function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function localYmd(d: Date): string {
  const m   = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

export default function SubscriptionReminder({ tier, tierExpiresAt, isAdmin, onRenew }: Props) {
  const { theme } = useTheme()
  const c = theme === 'mythic'
  const [phase, setPhase] = useState<Phase | null>(null)

  useEffect(() => {
    // Exclusions : admin, compte à vie (null), ou non-abonné (apprenti).
    if (isAdmin || !tierExpiresAt || tier === 'apprenti') return

    const today    = startOfLocalDay(new Date())
    const expiry   = startOfLocalDay(new Date(tierExpiresAt))
    const diffDays = Math.round((expiry.getTime() - today.getTime()) / 86_400_000)

    // J-1 = expire demain ; jour J = expire aujourd'hui. Sinon (déjà expiré ou
    // plus d'un jour restant) : aucune popup.
    const p: Phase | null = diffDays === 1 ? 'j1' : diffDays === 0 ? 'jour-j' : null
    if (!p) return

    // Dédup 1×/jour : (phase, date locale). Marqué dès l'affichage → pas de
    // réapparition à chaque re-render / navigation d'onglet le même jour.
    const key = `wf_sub_reminder:${p}:${localYmd(today)}`
    try {
      if (localStorage.getItem(key)) return
      localStorage.setItem(key, '1')
    } catch { /* localStorage indispo (navigation privée stricte) → on affiche sans dédup */ }

    setPhase(p)
  }, [tier, tierExpiresAt, isAdmin])

  if (!phase) return null

  const close = () => setPhase(null)

  return (
    <div
      onClick={close}
      style={{
        position: 'fixed', inset: 0, zIndex: 120,
        background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          position: 'relative',
          background: c ? '#130720' : '#18181B',
          border: `1px solid ${c ? 'rgba(186,117,23,0.3)' : '#27272A'}`,
          borderRadius: 16, padding: '32px 30px', width: '100%', maxWidth: 400,
          boxShadow: '0 24px 64px rgba(0,0,0,0.55)', textAlign: 'center',
        }}
      >
        <button
          onClick={close}
          aria-label="Fermer"
          style={{
            position: 'absolute', top: 10, right: 14, background: 'none', border: 'none',
            color: 'var(--text-muted)', fontSize: 24, lineHeight: 1, cursor: 'pointer',
          }}
        >×</button>

        <div style={{ fontSize: 40, marginBottom: 12 }}>⏳</div>

        <div style={{ fontSize: 18, fontWeight: 700, color: '#F5F2FA', marginBottom: 10 }}>
          {phase === 'j1' ? 'Ton abonnement expire demain' : "Ton abonnement expire aujourd'hui"}
        </div>

        <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: 24 }}>
          Renouvelle dès maintenant pour garder l&apos;accès à toutes tes fonctionnalités
          Wyrm Forge sans interruption.
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={() => { onRenew(); close() }}
            style={{
              padding: '10px 22px', borderRadius: 8, fontSize: 14, fontWeight: 600,
              whiteSpace: 'nowrap', cursor: 'pointer', border: 'none',
              background: c ? '#BA7517' : '#7F77DD', color: '#fff',
            }}
          >Renouveler</button>
          <button
            onClick={close}
            style={{
              padding: '10px 22px', borderRadius: 8, fontSize: 14, fontWeight: 600,
              background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer',
              border: `1px solid ${c ? 'rgba(186,117,23,0.3)' : '#3F3F46'}`,
            }}
          >Plus tard</button>
        </div>
      </div>
    </div>
  )
}
