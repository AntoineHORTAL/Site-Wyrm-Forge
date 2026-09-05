'use client'

import { useState, useEffect } from 'react'
import { useTheme } from '@/components/providers/ThemeProvider'
import { useFlag, useFeatureFlags } from '@/components/providers/FeatureFlagsProvider'
import { ComingSoonScreen } from '@/components/dashboard/FeatureScreens'
import BalanceHistory from '@/components/ecailles/BalanceHistory'
import QuestsPanel from '@/components/ecailles/QuestsPanel'
import ShopPanel from '@/components/ecailles/ShopPanel'
import EquipmentPanel from '@/components/ecailles/EquipmentPanel'
import { useDashboard } from '@/locales/dashboard'
import type { EcaillesDict } from '@/locales/dashboard/ecailles'

type SubView = 'balance' | 'quetes' | 'boutique' | 'equipement'

/* Les `id` sont structurels (état local, jamais traduits) ; le libellé est résolu
   dans la langue courante au moment du rendu. */
const VIEWS: { id: SubView; label: (e: EcaillesDict) => string }[] = [
  { id: 'balance',    label: e => e.viewBalance   },
  { id: 'quetes',     label: e => e.viewQuests    },
  { id: 'boutique',   label: e => e.viewShop      },
  { id: 'equipement', label: e => e.viewEquipment },
]

interface Props {
  isAdmin?: boolean
  balance: number
  balanceLoading: boolean
  onRefreshBalance: () => void
  forgeRequest: number
}

export default function EcaillesTab({ isAdmin = false, balance, balanceLoading, onRefreshBalance, forgeRequest }: Props) {
  const { theme } = useTheme()
  const c = theme === 'mythic'
  const d = useDashboard()

  // forgeRequest > 0 = navigation via le bouton "+" → atterrir sur Quêtes
  const [view, setView] = useState<SubView>(forgeRequest > 0 ? 'quetes' : 'balance')

  // ⚠️ Les trois flags étaient lus ICI, par une requête `app_settings` au montage
  // de l'onglet, avec son propre `flagsLoading`. Ils viennent désormais du
  // provider : une seule requête pour tout le site, un poll de 60 s au lieu d'une
  // lecture one-shot, et la hiérarchie `parent_key` déjà appliquée — couper
  // `ecailles_enabled` éteint mécaniquement la boutique et les quêtes, sans que
  // ce composant ait à connaître la relation.
  const ecaillesEnabled = useFlag('ecailles_enabled')
  const shopEnabled     = useFlag('shop_enabled')
  const questsEnabled   = useFlag('quests_enabled')
  const { isLoading: flagsLoading } = useFeatureFlags()

  const accent = c ? '#EF9F27' : '#7F77DD'
  const border = c ? 'rgba(186,117,23,0.2)' : '#27272A'

  // Chaque nouvel appui sur "+" bascule la sous-vue sur Quêtes (même si déjà monté)
  useEffect(() => {
    if (forgeRequest > 0) setView('quetes')
  }, [forgeRequest])

  // Attente du premier chargement — conservée telle quelle. Sans elle, un
  // non-admin verrait l'écran « bientôt » pendant une fraction de seconde avant
  // que le catalogue n'arrive, puis la Forge : exactement le flash que le
  // `isLoading` du provider existe pour éviter.
  if (flagsLoading) {
    return <div style={{ color: 'var(--text-muted)', fontSize: 14, padding: '20px 0' }}>{d.common.loading}</div>
  }

  // Écran "bientôt" pour les non-admins quand la feature est désactivée.
  // Le JSX vivait ici ; il est passé dans `FeatureScreens` pour que Scénarios —
  // et les prochains flags de lancement — n'aient pas à le redupliquer.
  if (!isAdmin && !ecaillesEnabled) {
    return <ComingSoonScreen title={d.ecailles.soonTitle} text={d.ecailles.soonText} />
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
            {v.label(d.ecailles)}
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
