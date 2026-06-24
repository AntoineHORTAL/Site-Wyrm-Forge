'use client'

import { useState, useEffect } from 'react'
import { useTheme } from '@/components/providers/ThemeProvider'
import { createClient } from '@/lib/supabase/client'
import BalanceHistory from '@/components/ecailles/BalanceHistory'
import QuestsPanel from '@/components/ecailles/QuestsPanel'
import ShopPanel from '@/components/ecailles/ShopPanel'
import EquipmentPanel from '@/components/ecailles/EquipmentPanel'

type SubView = 'balance' | 'quetes' | 'boutique' | 'equipement'

const VIEWS: { id: SubView; label: string }[] = [
  { id: 'balance',    label: 'Solde & Historique' },
  { id: 'quetes',     label: 'Quêtes'             },
  { id: 'boutique',   label: 'Boutique'            },
  { id: 'equipement', label: 'Mon Équipement'      },
]

interface Props {
  isAdmin?: boolean
  balance: number
  balanceLoading: boolean
  onRefreshBalance: () => void
  ecaillesEnabled: boolean
  forgeRequest: number
}

export default function EcaillesTab({ isAdmin = false, balance, balanceLoading, onRefreshBalance, ecaillesEnabled, forgeRequest }: Props) {
  const { theme } = useTheme()
  const c = theme === 'mythic'
  const supabase = createClient()

  // forgeRequest > 0 = navigation via le bouton "+" → atterrir sur Quêtes
  const [view, setView] = useState<SubView>(forgeRequest > 0 ? 'quetes' : 'balance')
  const [shopEnabled, setShopEnabled]     = useState(false)
  const [questsEnabled, setQuestsEnabled] = useState(false)
  const [flagsLoading, setFlagsLoading]   = useState(true)

  const accent = c ? '#EF9F27' : '#7F77DD'
  const border = c ? 'rgba(186,117,23,0.2)' : '#27272A'

  // Chaque nouvel appui sur "+" bascule la sous-vue sur Quêtes (même si déjà monté)
  useEffect(() => {
    if (forgeRequest > 0) setView('quetes')
  }, [forgeRequest])

  useEffect(() => {
    supabase
      .from('app_settings')
      .select('key, value')
      .in('key', ['shop_enabled', 'quests_enabled'])
      .then(({ data }) => {
        if (data) {
          const m = Object.fromEntries((data as { key: string; value: string }[]).map(r => [r.key, r.value === 'true']))
          setShopEnabled(m['shop_enabled']     ?? false)
          setQuestsEnabled(m['quests_enabled'] ?? false)
        }
        setFlagsLoading(false)
      })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (flagsLoading) {
    return <div style={{ color: 'var(--text-muted)', fontSize: 14, padding: '20px 0' }}>Chargement…</div>
  }

  // Écran "bientôt" pour les non-admins quand la feature est désactivée
  if (!isAdmin && !ecaillesEnabled) {
    return (
      <div style={{
        textAlign: 'center', padding: '60px 32px', borderRadius: 12,
        border: `2px dashed ${c ? 'rgba(186,117,23,0.25)' : '#27272A'}`,
      }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>🔥</div>
        <h3 style={{ fontSize: 20, fontWeight: 600, color: '#F5F2FA', marginBottom: 8 }}>
          La Forge arrive bientôt
        </h3>
        <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: '0 auto', maxWidth: 380 }}>
          Le système d'Écailles, les quêtes journalières et la boutique de cosmétiques seront disponibles prochainement.
        </p>
      </div>
    )
  }

  return (
    <div>
      {/* ── Sélecteur de sous-vue ── */}
      <div style={{
        display: 'flex', gap: 4, marginBottom: 28,
        background: 'rgba(255,255,255,0.03)', borderRadius: 10,
        padding: 4, border: `1px solid ${border}`,
        flexWrap: 'wrap',
      }}>
        {VIEWS.map(v => (
          <button
            key={v.id}
            onClick={() => setView(v.id)}
            style={{
              flex: 1, minWidth: 110,
              padding: '7px 12px', borderRadius: 7, fontSize: 13,
              fontWeight: view === v.id ? 600 : 400,
              fontFamily: 'inherit', cursor: 'pointer', border: 'none',
              background: view === v.id
                ? (c ? 'rgba(186,117,23,0.2)' : 'rgba(127,119,221,0.15)')
                : 'transparent',
              color: view === v.id ? accent : 'var(--text-muted)',
              transition: 'all 0.15s',
            }}
          >
            {v.label}
          </button>
        ))}
      </div>

      {view === 'balance'    && <BalanceHistory balance={balance} balanceLoading={balanceLoading} />}
      {view === 'quetes'     && <QuestsPanel questsEnabled={questsEnabled} onBalanceChange={onRefreshBalance} />}
      {view === 'boutique'   && <ShopPanel shopEnabled={shopEnabled} onBalanceChange={onRefreshBalance} />}
      {view === 'equipement' && <EquipmentPanel />}
    </div>
  )
}
