'use client'

import { useTheme } from '@/components/providers/ThemeProvider'

const overlays = [
  { title: 'Jungle Timer Pro', author: 'JungleKing', uses: '12.4k', rating: '4.9' },
  { title: 'Mid Lane Master', author: 'ProMid99', uses: '8.2k', rating: '4.7' },
  { title: 'ADC Carry Pack', author: 'BotLaneGod', uses: '6.1k', rating: '4.8' },
  { title: 'Support Vision', author: 'SupportGG', uses: '5.8k', rating: '4.6' },
  { title: 'Toplaner Classic', author: 'SplitPusher', uses: '4.3k', rating: '4.5' },
  { title: 'CS Tracker Ultra', author: 'FarmBot', uses: '9.7k', rating: '4.9' },
]

export default function OverlayTab() {
  const { theme } = useTheme()
  const c = theme === 'mythic'

  return (
    <div>
      <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 24 }}>
        Importe un overlay de la communauté ou crée le tien depuis zéro.
      </p>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
        gap: 16,
      }}>
        {overlays.map((o, i) => (
          <div key={i} style={{
            borderRadius: 8, padding: 18, cursor: 'pointer',
            background: c ? 'rgba(42,21,71,0.4)' : '#18181B',
            border: `1px solid ${c ? 'rgba(186,117,23,0.2)' : '#27272A'}`,
            transition: 'all 0.15s',
          }}>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6, color: '#F5F2FA' }}>
              {o.title}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 12 }}>
              par {o.author}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-muted)' }}>
              <span>{o.uses} utilisations</span>
              <span style={{ color: c ? '#BA7517' : '#EF9F27' }}>★ {o.rating}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
