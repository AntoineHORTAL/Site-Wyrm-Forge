'use client'

import { useTheme } from '@/components/providers/ThemeProvider'

const stats = [
  { label: 'Parties jouées', value: '142' },
  { label: 'Winrate', value: '54%', positive: true },
  { label: 'KDA moyen', value: '3.8' },
  { label: 'CS/min', value: '7.2' },
]

const matches = [
  { champ: 'ZI', champName: 'Zed', mode: 'Classée Solo', kda: '12/3/5', cs: '218 CS', duration: '32min', result: 'win' },
  { champ: 'KA', champName: 'Kayn', mode: 'Classée Solo', kda: '7/5/11', cs: '180 CS', duration: '38min', result: 'loss' },
  { champ: 'JA', champName: 'Jarvan IV', mode: 'Flex 5v5', kda: '4/2/18', cs: '95 CS', duration: '28min', result: 'win' },
  { champ: 'VI', champName: 'Vi', mode: 'Classée Solo', kda: '9/6/14', cs: '142 CS', duration: '41min', result: 'win' },
  { champ: 'HE', champName: 'Hecarim', mode: 'Normale', kda: '6/8/9', cs: '165 CS', duration: '35min', result: 'loss' },
]

export default function AccueilTab() {
  const { theme } = useTheme()
  const c = theme === 'mythic'

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 24 }}>
        {stats.map((s, i) => (
          <div key={i} style={{
            padding: '16px 20px', borderRadius: 8,
            background: c ? 'rgba(42,21,71,0.4)' : '#18181B',
            border: `1px solid ${c ? 'rgba(186,117,23,0.2)' : '#27272A'}`,
          }}>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1 }}>
              {s.label}
            </div>
            <div style={{
              fontSize: 22, fontWeight: 600,
              color: s.positive ? '#5DCAA5' : '#F5F2FA',
            }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {matches.map((m, i) => (
          <div key={i} style={{
            display: 'grid', gridTemplateColumns: 'auto 1fr auto auto auto',
            alignItems: 'center', gap: 16,
            padding: '14px 18px', borderRadius: 8,
            background: c ? 'rgba(42,21,71,0.4)' : '#18181B',
            border: `1px solid ${c ? 'rgba(186,117,23,0.15)' : '#27272A'}`,
            borderLeft: `3px solid ${m.result === 'win' ? '#5DCAA5' : '#E24B4A'}`,
          }}>
            <div style={{
              width: 36, height: 36, borderRadius: '50%',
              background: 'linear-gradient(135deg, #7F77DD, #534AB7)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 600, fontSize: 13, color: 'white',
            }}>{m.champ}</div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#F5F2FA' }}>{m.champName}</div>
              <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>{m.mode}</div>
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{m.kda}</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{m.cs} · {m.duration}</div>
            <div style={{
              fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1,
              color: m.result === 'win' ? '#5DCAA5' : '#E24B4A',
            }}>
              {m.result === 'win' ? 'Victoire' : 'Défaite'}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
