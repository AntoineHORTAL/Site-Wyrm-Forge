'use client'

import { useState } from 'react'
import { useTheme } from '@/components/providers/ThemeProvider'

const communityPaths = [
  { id: 1, name: 'Full Clear Blue → Dragon',  champ: 'HE', champName: 'Hecarim',   side: 'Bleu',  rating: 4.9, votes: 2140, author: 'SpeedKing',   tags: ['Early Game', 'Dragon'] },
  { id: 2, name: 'Invade Red Start Cheese',   champ: 'VI', champName: 'Vi',         side: 'Rouge', rating: 4.7, votes: 1380, author: 'JungleKing',  tags: ['Invade', 'Cheese'] },
  { id: 3, name: 'Kayn Red Path + Scuttle',   champ: 'KA', champName: 'Kayn',       side: 'Rouge', rating: 4.6, votes: 980,  author: 'DarkHarvest', tags: ['Farm', 'Scuttle'] },
  { id: 4, name: 'Jarvan Gank Level 3',       champ: 'JA', champName: 'Jarvan IV',  side: 'Bleu',  rating: 4.8, votes: 1620, author: 'IronFlag',    tags: ['Early Gank', 'Bleu'] },
  { id: 5, name: 'Shyvana Dragon Rush',       champ: 'SH', champName: 'Shyvana',    side: 'Bleu',  rating: 4.5, votes: 743,  author: 'DragonRider', tags: ['Dragon', 'Farm'] },
  { id: 6, name: 'Vi Full Clear Fast 6',      champ: 'VI', champName: 'Vi',         side: 'Rouge', rating: 4.4, votes: 612,  author: 'PunchBot',    tags: ['Farm', 'Lvl 6'] },
]

const sides = ['Tous', 'Bleu', 'Rouge']

export default function WorkshopJungleTab() {
  const { theme } = useTheme()
  const c = theme === 'mythic'
  const [search, setSearch] = useState('')
  const [side, setSide] = useState('Tous')
  const border = c ? 'rgba(186,117,23,0.2)' : '#27272A'
  const bg = c ? 'rgba(42,21,71,0.4)' : '#18181B'

  const filtered = communityPaths.filter(p =>
    (side === 'Tous' || p.side === side) &&
    p.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
        Découvre et importe les jungle paths créés par la communauté.
      </p>

      {/* Filters */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="🔍 Rechercher un path..."
          style={{
            flex: '1 1 200px', padding: '9px 14px', borderRadius: 8,
            background: c ? 'rgba(20,10,35,0.6)' : '#18181B',
            border: `1px solid ${border}`, color: '#F5F2FA',
            fontFamily: 'inherit', fontSize: 13, outline: 'none',
          }}
        />
        <div style={{ display: 'flex', gap: 6 }}>
          {sides.map(s => (
            <button key={s} onClick={() => setSide(s)} style={{
              padding: '7px 14px', borderRadius: 20, fontSize: 12, fontWeight: 500,
              border: `1px solid ${side === s
                ? (s === 'Bleu' ? 'rgba(58,138,201,0.6)' : s === 'Rouge' ? 'rgba(226,75,74,0.6)' : (c ? '#BA7517' : '#7F77DD'))
                : border}`,
              background: side === s
                ? (s === 'Bleu' ? 'rgba(58,138,201,0.15)' : s === 'Rouge' ? 'rgba(226,75,74,0.15)' : (c ? 'rgba(186,117,23,0.15)' : 'rgba(127,119,221,0.15)'))
                : 'transparent',
              color: side === s
                ? (s === 'Bleu' ? '#3A8AC9' : s === 'Rouge' ? '#E24B4A' : (c ? '#FAC775' : '#FAFAFA'))
                : 'var(--text-muted)',
              cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
            }}>{s}</button>
          ))}
        </div>
      </div>

      {/* Path cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {filtered.map(p => (
          <div key={p.id} style={{
            padding: '14px 18px', borderRadius: 10, background: bg,
            border: `1px solid ${border}`,
            display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
            transition: 'border-color 0.15s', cursor: 'pointer',
          }}>
            {/* Champ avatar */}
            <div style={{
              width: 42, height: 42, borderRadius: 8, flexShrink: 0,
              background: p.side === 'Bleu'
                ? 'linear-gradient(135deg, rgba(58,138,201,0.4), rgba(58,138,201,0.7))'
                : 'linear-gradient(135deg, rgba(226,75,74,0.4), rgba(226,75,74,0.7))',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 700, fontSize: 13, color: 'white',
            }}>{p.champ}</div>

            {/* Info */}
            <div style={{ flex: 1, minWidth: 140 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#F5F2FA', marginBottom: 3 }}>{p.name}</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{p.champName}</span>
                <span style={{
                  fontSize: 11, padding: '2px 8px', borderRadius: 4,
                  background: p.side === 'Bleu' ? 'rgba(58,138,201,0.15)' : 'rgba(226,75,74,0.15)',
                  color: p.side === 'Bleu' ? '#3A8AC9' : '#E24B4A',
                  border: `1px solid ${p.side === 'Bleu' ? 'rgba(58,138,201,0.3)' : 'rgba(226,75,74,0.3)'}`,
                }}>Côté {p.side}</span>
                {p.tags.map(tag => (
                  <span key={tag} style={{
                    fontSize: 11, padding: '2px 8px', borderRadius: 4,
                    background: c ? 'rgba(186,117,23,0.08)' : 'rgba(127,119,221,0.08)',
                    border: `1px solid ${c ? 'rgba(186,117,23,0.2)' : 'rgba(127,119,221,0.2)'}`,
                    color: c ? '#FAC775' : '#7F77DD',
                  }}>{tag}</span>
                ))}
              </div>
            </div>

            {/* Stats */}
            <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexShrink: 0 }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: c ? '#BA7517' : '#EF9F27' }}>★ {p.rating}</div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{p.votes} votes</div>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>par {p.author}</div>
            </div>

            {/* CTA */}
            <button style={{
              padding: '8px 16px', flexShrink: 0,
              background: 'linear-gradient(135deg, #7F77DD, #534AB7)',
              border: 'none', borderRadius: 6,
              color: 'white', fontSize: 12, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit',
            }}>
              Importer
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
