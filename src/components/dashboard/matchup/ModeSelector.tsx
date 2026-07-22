'use client'

import type { MatchUpMode } from '@/lib/matchup/types'

const MODES: MatchUpMode[] = ['1v1', '2v2', '1v2', '2v1', '5v5']

// Sélecteur de format du scénario (1v1 → 5v5). Le changement de mode ajuste le
// nombre de slots par camp côté parent (resizeToMode).
export default function ModeSelector({
  mode, onChange, c,
}: {
  mode: MatchUpMode
  onChange: (m: MatchUpMode) => void
  c: boolean
}) {
  const accent = c ? '#BA7517' : '#7F77DD'
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
      {MODES.map(m => {
        const active = m === mode
        return (
          <button
            key={m}
            onClick={() => onChange(m)}
            style={{
              padding: '6px 16px',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: active ? 700 : 500,
              cursor: 'pointer',
              color: active ? '#fff' : 'var(--text-muted)',
              background: active ? accent : (c ? 'rgba(255,255,255,0.03)' : '#18181B'),
              border: `1px solid ${active ? accent : (c ? 'rgba(186,117,23,0.2)' : '#27272A')}`,
              transition: 'all .12s',
            }}
          >
            {m}
          </button>
        )
      })}
    </div>
  )
}
