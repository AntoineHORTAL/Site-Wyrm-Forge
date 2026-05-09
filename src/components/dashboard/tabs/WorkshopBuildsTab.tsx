'use client'

import { useState } from 'react'
import { useTheme } from '@/components/providers/ThemeProvider'

const communityBuilds = [
  { id: 1, name: 'Lethality Zed S15',    champ: 'ZE', champName: 'Zed',       role: 'Mid',    rating: 4.9, votes: 1240, author: 'ProMid99',   tags: ['Létal', 'Full AD'] },
  { id: 2, name: 'Tanky Vi Engage',      champ: 'VI', champName: 'Vi',        role: 'Jungle', rating: 4.7, votes: 832,  author: 'JungleKing',  tags: ['Tank', 'Engage'] },
  { id: 3, name: 'AP Kayn Full Magic',   champ: 'KA', champName: 'Kayn',      role: 'Jungle', rating: 4.6, votes: 614,  author: 'DarkHarvest', tags: ['AP', 'Magic'] },
  { id: 4, name: 'Crit Hecarim Hyper',   champ: 'HE', champName: 'Hecarim',   role: 'Jungle', rating: 4.8, votes: 723,  author: 'SpeedKing',   tags: ['Crit', 'Mobile'] },
  { id: 5, name: 'Yasuo Full Crit',      champ: 'YA', champName: 'Yasuo',     role: 'Mid',    rating: 4.5, votes: 501,  author: 'WindBlade',   tags: ['Crit', 'AD'] },
  { id: 6, name: 'Jarvan Support Tank',  champ: 'JA', champName: 'Jarvan IV', role: 'Support',rating: 4.4, votes: 388,  author: 'IronFlag',    tags: ['Tank', 'Utility'] },
]

const roles = ['Tous', 'Mid', 'Jungle', 'Support', 'ADC', 'Top']

export default function WorkshopBuildsTab() {
  const { theme } = useTheme()
  const c = theme === 'mythic'
  const [search, setSearch] = useState('')
  const [role, setRole] = useState('Tous')
  const border = c ? 'rgba(186,117,23,0.2)' : '#27272A'
  const bg = c ? 'rgba(42,21,71,0.4)' : '#18181B'

  const filtered = communityBuilds.filter(b =>
    (role === 'Tous' || b.role === role) &&
    b.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
        Parcours, vote et importe les builds créés par la communauté.
      </p>

      {/* Filters */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="🔍 Rechercher un build..."
          style={{
            flex: '1 1 200px', padding: '9px 14px', borderRadius: 8,
            background: c ? 'rgba(20,10,35,0.6)' : '#18181B',
            border: `1px solid ${border}`, color: '#F5F2FA',
            fontFamily: 'inherit', fontSize: 13, outline: 'none',
          }}
        />
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {roles.map(r => (
            <button key={r} onClick={() => setRole(r)} style={{
              padding: '7px 14px', borderRadius: 20, fontSize: 12, fontWeight: 500,
              border: `1px solid ${role === r ? (c ? '#BA7517' : '#7F77DD') : border}`,
              background: role === r ? (c ? 'rgba(186,117,23,0.15)' : 'rgba(127,119,221,0.15)') : 'transparent',
              color: role === r ? (c ? '#FAC775' : '#FAFAFA') : 'var(--text-muted)',
              cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
            }}>{r}</button>
          ))}
        </div>
      </div>

      {/* Build cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
        {filtered.map(b => (
          <div key={b.id} style={{
            padding: 18, borderRadius: 10, background: bg, border: `1px solid ${border}`,
            display: 'flex', flexDirection: 'column', gap: 12,
            transition: 'border-color 0.15s', cursor: 'pointer',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 40, height: 40, borderRadius: 8, flexShrink: 0,
                background: 'linear-gradient(135deg, #7F77DD, #534AB7)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 700, fontSize: 13, color: 'white',
              }}>{b.champ}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#F5F2FA', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {b.name}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>{b.champName} · {b.role}</div>
              </div>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {b.tags.map(tag => (
                <span key={tag} style={{
                  fontSize: 11, padding: '3px 8px', borderRadius: 4,
                  background: c ? 'rgba(186,117,23,0.1)' : 'rgba(127,119,221,0.1)',
                  border: `1px solid ${c ? 'rgba(186,117,23,0.25)' : 'rgba(127,119,221,0.25)'}`,
                  color: c ? '#FAC775' : '#7F77DD',
                }}>{tag}</span>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto' }}>
              <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>par {b.author}</div>
              <div style={{ display: 'flex', align: 'center', gap: 12 }}>
                <span style={{ fontSize: 12, color: c ? '#BA7517' : '#EF9F27', fontWeight: 600 }}>★ {b.rating}</span>
                <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{b.votes} votes</span>
              </div>
            </div>

            <button style={{
              width: '100%', padding: '9px',
              background: 'linear-gradient(135deg, #7F77DD, #534AB7)',
              border: 'none', borderRadius: 6,
              color: 'white', fontSize: 13, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit',
            }}>
              Importer le build
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
