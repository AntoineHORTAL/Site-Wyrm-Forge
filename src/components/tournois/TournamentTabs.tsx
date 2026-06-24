'use client'

// TournamentTabs — Client Component
// Navigation URL-driven entre les 3 vues du tournoi

import { useSearchParams, useRouter } from 'next/navigation'
import { tournamentPath } from '@/lib/tournois'

export type TournamentTab = 'presentation' | 'bracket' | 'classement'

interface Tab {
  id:    TournamentTab
  label: string
}

const TABS: Tab[] = [
  { id: 'presentation', label: 'Présentation' },
  { id: 'bracket',      label: 'Bracket'      },
  { id: 'classement',   label: 'Classement'   },
]

interface TournamentTabsProps {
  defaultTab?: TournamentTab
  serie:       string
  slug:        string
}

export default function TournamentTabs({ defaultTab = 'presentation', serie, slug }: TournamentTabsProps) {
  const searchParams = useSearchParams()
  const router       = useRouter()

  const activeTab = (searchParams.get('tab') as TournamentTab | null) ?? defaultTab

  function handleTab(tabId: TournamentTab) {
    router.replace(tournamentPath(serie, slug, `?tab=${tabId}`), { scroll: false })
  }

  return (
    <nav
      aria-label="Navigation tournoi"
      style={{
        display: 'flex',
        gap: 8,
        padding: '0 0 2px',
        borderBottom: '2px solid rgba(47,111,222,0.25)',
        flexWrap: 'wrap',
      }}
    >
      {TABS.map((tab) => {
        const isActive = tab.id === activeTab
        return (
          <button
            key={tab.id}
            onClick={() => handleTab(tab.id)}
            aria-current={isActive ? 'page' : undefined}
            style={{
              background: 'none',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              position: 'relative',
              bottom: -2,
            }}
          >
            <span
              style={{
                display: 'inline-block',
                transform: 'skewX(-12deg)',
                background: isActive
                  ? 'linear-gradient(135deg, #1c3a6e 0%, #2f6fde 100%)'
                  : 'rgba(20,9,28,0.6)',
                border: isActive
                  ? '2px solid #2f6fde'
                  : '2px solid rgba(47,111,222,0.25)',
                borderBottom: isActive ? '2px solid #14091c' : '2px solid rgba(47,111,222,0.25)',
                padding: '9px 22px',
                transition: 'background 0.15s, border-color 0.15s',
                boxShadow: isActive ? '0 0 14px rgba(47,111,222,0.4)' : 'none',
              }}
            >
              <span
                className="xv2-data"
                style={{
                  display: 'inline-block',
                  transform: 'skewX(12deg)',
                  color: isActive ? '#fff' : '#8fa0bb',
                  fontSize: 14,
                  letterSpacing: '.06em',
                  textTransform: 'uppercase',
                  userSelect: 'none',
                  transition: 'color 0.15s',
                }}
              >
                {isActive && (
                  <span style={{ color: '#f06ad8', marginRight: 6 }}>✕</span>
                )}
                {tab.label}
              </span>
            </span>
          </button>
        )
      })}
    </nav>
  )
}
