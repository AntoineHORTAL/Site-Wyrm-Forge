'use client'

import { useTheme } from '@/components/providers/ThemeProvider'

const champions = [
  { initials: 'ZE', name: 'Zed',       role: 'Mid',     games: 38, wr: 61, kda: '4.2', cs: '7.8' },
  { initials: 'KA', name: 'Kayn',      role: 'Jungle',  games: 29, wr: 55, kda: '3.9', cs: '6.4' },
  { initials: 'JA', name: 'Jarvan IV', role: 'Jungle',  games: 21, wr: 48, kda: '3.1', cs: '5.2' },
  { initials: 'VI', name: 'Vi',        role: 'Jungle',  games: 18, wr: 67, kda: '5.0', cs: '6.9' },
  { initials: 'HE', name: 'Hecarim',   role: 'Jungle',  games: 16, wr: 44, kda: '2.8', cs: '7.1' },
  { initials: 'YA', name: 'Yasuo',     role: 'Mid',     games: 14, wr: 50, kda: '3.3', cs: '8.1' },
]

const weeks = ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8']
const wrData = [48, 52, 49, 55, 58, 53, 61, 54]
const maxWr = 70

const metrics = [
  { label: 'Winrate global',  value: '54%',  delta: '+2%',  up: true },
  { label: 'KDA moyen',       value: '3.8',  delta: '+0.4', up: true },
  { label: 'CS / min',        value: '7.2',  delta: '-0.3', up: false },
  { label: 'Vision score',    value: '24',   delta: '+3',   up: true },
  { label: 'Dégâts / partie', value: '18.4k',delta: '+1.2k',up: true },
  { label: 'Parties (30j)',   value: '62',   delta: '+8',   up: true },
]

export default function StatsTab() {
  const { theme } = useTheme()
  const c = theme === 'mythic'
  const border = c ? 'rgba(186,117,23,0.2)' : '#27272A'
  const bg = c ? 'rgba(42,21,71,0.4)' : '#18181B'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
        {metrics.map((m, i) => (
          <div key={i} style={{ padding: '16px 18px', borderRadius: 8, background: bg, border: `1px solid ${border}` }}>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
              {m.label}
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#F5F2FA', marginBottom: 4 }}>{m.value}</div>
            <div style={{ fontSize: 12, color: m.up ? '#5DCAA5' : '#E24B4A', fontWeight: 500 }}>
              {m.up ? '▲' : '▼'} {m.delta} ce mois
            </div>
          </div>
        ))}
      </div>

      {/* Winrate chart */}
      <div style={{ padding: 20, borderRadius: 10, background: bg, border: `1px solid ${border}` }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#F5F2FA', marginBottom: 16 }}>
          Winrate par semaine (%)
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, height: 100 }}>
          {wrData.map((v, i) => (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <div style={{ fontSize: 10, color: v >= 55 ? '#5DCAA5' : 'var(--text-dim)', fontWeight: 600 }}>{v}%</div>
              <div style={{
                width: '100%', borderRadius: '4px 4px 0 0',
                height: `${(v / maxWr) * 80}px`,
                background: v >= 55
                  ? (c ? 'rgba(93,202,165,0.7)' : '#5DCAA5')
                  : (c ? 'rgba(127,119,221,0.4)' : 'rgba(127,119,221,0.5)'),
                transition: 'height 0.3s',
              }} />
              <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>{weeks[i]}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Champion stats table */}
      <div style={{ borderRadius: 10, background: bg, border: `1px solid ${border}`, overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: `1px solid ${border}` }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#F5F2FA' }}>Champions joués</div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: c ? 'rgba(20,10,35,0.4)' : '#0F0F11' }}>
                {['Champion', 'Rôle', 'Parties', 'Winrate', 'KDA', 'CS/min'].map(h => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', color: 'var(--text-dim)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600 }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {champions.map((ch, i) => (
                <tr key={i} style={{ borderTop: `1px solid ${border}` }}>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{
                        width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
                        background: 'linear-gradient(135deg, #7F77DD, #534AB7)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 11, fontWeight: 700, color: 'white',
                      }}>{ch.initials}</div>
                      <span style={{ color: '#F5F2FA', fontWeight: 500 }}>{ch.name}</span>
                    </div>
                  </td>
                  <td style={{ padding: '12px 16px', color: 'var(--text-muted)' }}>{ch.role}</td>
                  <td style={{ padding: '12px 16px', color: 'var(--text-muted)' }}>{ch.games}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{ color: ch.wr >= 55 ? '#5DCAA5' : ch.wr < 48 ? '#E24B4A' : 'var(--text-muted)', fontWeight: 600 }}>
                      {ch.wr}%
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px', color: 'var(--text-muted)' }}>{ch.kda}</td>
                  <td style={{ padding: '12px 16px', color: 'var(--text-muted)' }}>{ch.cs}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
