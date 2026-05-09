'use client'

import { useState } from 'react'
import { useTheme } from '@/components/providers/ThemeProvider'

const filterCategories = [
  { icon: '⚔️', label: 'Dégâts' },
  { icon: '🛡️', label: 'Défense' },
  { icon: '💜', label: 'Magie' },
  { icon: '🏹', label: 'AD' },
  { icon: '🩸', label: 'Lifesteal' },
  { icon: '⚡', label: 'Vitesse' },
  { icon: '🔮', label: 'AP' },
  { icon: '💀', label: 'Létal' },
  { icon: '❄️', label: 'Ralentir' },
  { icon: '🔥', label: 'Mage' },
  { icon: '🌀', label: 'CDR' },
  { icon: '💛', label: 'Mana' },
  { icon: '👁️', label: 'Vision' },
  { icon: '🐉', label: 'Tank' },
  { icon: '🎯', label: 'Crit' },
  { icon: '💫', label: 'Support' },
  { icon: '🌟', label: 'Épique' },
  { icon: '⚗️', label: 'Potion' },
]

const items = [
  { name: "Trinity Force", price: 3333, color: '#EF9F27' },
  { name: "Rabadon's", price: 3600, color: '#7F77DD' },
  { name: 'Zhonya', price: 3250, color: '#FAC775' },
  { name: 'Infinity Edge', price: 3400, color: '#BA7517' },
  { name: 'Sunfire', price: 3000, color: '#E24B4A' },
  { name: 'Eclipse', price: 3100, color: '#5DCAA5' },
  { name: 'Liandrys', price: 3000, color: '#7F77DD' },
  { name: "Warmog's", price: 3000, color: '#E24B4A' },
  { name: 'Titanic', price: 3300, color: '#3A8AC9' },
  { name: 'Everfrost', price: 3200, color: '#4ABEC4' },
  { name: 'Ludens', price: 3000, color: '#7F77DD' },
  { name: 'Shadowflame', price: 3000, color: '#BC6FE2' },
  { name: 'Kraken', price: 2900, color: '#3A8AC9' },
  { name: 'Hullbreaker', price: 3000, color: '#5DCAA5' },
  { name: 'Sterak', price: 3100, color: '#BA7517' },
  { name: 'Galeforce', price: 3400, color: '#FAC775' },
  { name: 'Muramana', price: 2900, color: '#3A8AC9' },
  { name: 'Stridebreaker', price: 3300, color: '#5DCAA5' },
]

export default function BuildsTab() {
  const { theme } = useTheme()
  const c = theme === 'mythic'
  const [search, setSearch] = useState('')
  const [buildName, setBuildName] = useState('')
  const [selectedChamp, setSelectedChamp] = useState('')
  const [selectedItems, setSelectedItems] = useState<string[]>([])
  const [activeFilters, setActiveFilters] = useState<string[]>([])

  const filtered = items.filter(item =>
    item.name.toLowerCase().includes(search.toLowerCase())
  )

  function toggleItem(name: string) {
    setSelectedItems(prev =>
      prev.includes(name) ? prev.filter(i => i !== name) : [...prev, name]
    )
  }

  return (
    <div>
      {/* Topbar */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10,
        padding: '10px 14px', marginBottom: 14, borderRadius: 6,
        background: c ? 'rgba(42,21,71,0.3)' : '#18181B',
        border: `1px solid ${c ? 'rgba(186,117,23,0.2)' : '#27272A'}`,
        fontSize: 12,
      }}>
        <button style={{
          padding: '5px 14px', background: 'transparent',
          border: `1px solid ${c ? 'rgba(186,117,23,0.3)' : '#27272A'}`,
          borderRadius: 4, color: 'var(--text)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12,
        }}>← Retour</button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ color: 'var(--text-muted)' }}>Nom :</span>
          <input
            style={{
              background: c ? 'rgba(20,10,35,0.6)' : '#18181B',
              border: `1px solid ${c ? 'rgba(186,117,23,0.3)' : '#27272A'}`,
              borderRadius: 4, padding: '5px 10px', color: '#F5F2FA',
              fontFamily: 'inherit', fontSize: 12, outline: 'none', width: 130,
            }}
            value={buildName}
            onChange={e => setBuildName(e.target.value)}
            placeholder="Mon build..."
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ color: 'var(--text-muted)' }}>Champion :</span>
          <input
            style={{
              background: c ? 'rgba(20,10,35,0.6)' : '#18181B',
              border: `1px solid ${c ? 'rgba(186,117,23,0.3)' : '#27272A'}`,
              borderRadius: 4, padding: '5px 10px', color: '#F5F2FA',
              fontFamily: 'inherit', fontSize: 12, outline: 'none', width: 110,
            }}
            value={selectedChamp}
            onChange={e => setSelectedChamp(e.target.value)}
            placeholder="Champion..."
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
          <span style={{ color: 'var(--text-muted)' }}>Détails :</span>
          <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>
            {selectedItems.length} item{selectedItems.length !== 1 ? 's' : ''} sélectionné{selectedItems.length !== 1 ? 's' : ''}
          </span>
        </div>
        <button style={{
          padding: '5px 14px',
          background: 'linear-gradient(135deg, #7F77DD, #534AB7)',
          border: 'none', borderRadius: 4,
          color: 'white', fontSize: 12, fontWeight: 600,
          cursor: 'pointer', fontFamily: 'inherit',
        }}>Sauver</button>
      </div>

      {/* Main layout */}
      <div className="dash-grid-builds">
        {/* Filters */}
        <div className="dash-filters-hide" style={{
          background: c ? 'rgba(20,10,35,0.5)' : '#18181B',
          border: `1px solid ${c ? 'rgba(186,117,23,0.2)' : '#27272A'}`,
          borderRadius: 6, padding: '10px 8px',
        }}>
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, color: c ? '#BA7517' : '#7F77DD', marginBottom: 10 }}>
            Filtres
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 4 }}>
            {filterCategories.map((f) => (
              <button
                key={f.label}
                onClick={() => setActiveFilters(prev =>
                  prev.includes(f.label) ? prev.filter(x => x !== f.label) : [...prev, f.label]
                )}
                title={f.label}
                style={{
                  width: '100%', aspectRatio: '1',
                  background: activeFilters.includes(f.label)
                    ? (c ? 'rgba(186,117,23,0.2)' : 'rgba(127,119,221,0.2)')
                    : (c ? 'rgba(42,21,71,0.4)' : '#27272A'),
                  border: `1px solid ${activeFilters.includes(f.label) ? (c ? '#BA7517' : '#7F77DD') : (c ? 'rgba(186,117,23,0.2)' : '#27272A')}`,
                  borderRadius: 4, fontSize: 14, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                {f.icon}
              </button>
            ))}
          </div>
          {activeFilters.length > 0 && (
            <button
              onClick={() => setActiveFilters([])}
              style={{
                marginTop: 8, background: 'none', border: 'none',
                color: '#E24B4A', fontSize: 11, cursor: 'pointer', width: '100%',
              }}
            >✕ Reset</button>
          )}
        </div>

        {/* Items grid */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input
            style={{
              background: c ? 'rgba(20,10,35,0.6)' : '#18181B',
              border: `1px solid ${c ? 'rgba(186,117,23,0.3)' : '#27272A'}`,
              borderRadius: 6, padding: '10px 14px', color: '#F5F2FA',
              fontFamily: 'inherit', fontSize: 13, outline: 'none',
            }}
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="🔍 Rechercher un item..."
          />
          <div className="dash-items-grid" style={{
            background: c ? 'rgba(20,10,35,0.4)' : '#0F0F11',
            border: `1px solid ${c ? 'rgba(186,117,23,0.15)' : '#27272A'}`,
            borderRadius: 6, padding: 12, maxHeight: 560, overflowY: 'auto',
          }}>
            {filtered.map((item) => (
              <div
                key={item.name}
                onClick={() => toggleItem(item.name)}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  gap: 4, cursor: 'pointer', padding: 4, borderRadius: 4,
                  background: selectedItems.includes(item.name)
                    ? (c ? 'rgba(186,117,23,0.15)' : 'rgba(127,119,221,0.15)')
                    : 'transparent',
                  transition: 'background 0.15s',
                  outline: selectedItems.includes(item.name)
                    ? `1px solid ${c ? '#BA7517' : '#7F77DD'}`
                    : 'none',
                }}
              >
                <div style={{
                  width: '100%', aspectRatio: '1', borderRadius: 4,
                  background: `linear-gradient(135deg, ${item.color}33, ${item.color}66)`,
                  border: `1px solid ${item.color}44`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 9, color: item.color, fontWeight: 700, textAlign: 'center',
                  padding: 2, lineHeight: 1.2,
                }}>
                  {item.name.slice(0, 4)}
                </div>
                <div style={{ fontSize: 10, color: c ? '#FAC775' : '#EF9F27', fontWeight: 600 }}>
                  {item.price}g
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Edit panel */}
        <div className="dash-edit-panel" style={{
          background: c ? 'rgba(20,10,35,0.5)' : '#18181B',
          border: `1px solid ${c ? 'rgba(186,117,23,0.2)' : '#27272A'}`,
          borderRadius: 6, padding: 14,
          display: 'flex', flexDirection: 'column', gap: 8,
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#F5F2FA', marginBottom: 4 }}>
            Build actuel
          </div>
          {selectedItems.length === 0 ? (
            <p style={{ color: 'var(--text-dim)', fontSize: 12 }}>
              Clique sur des items dans la grille pour les ajouter.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {selectedItems.map((itemName) => {
                const item = items.find(i => i.name === itemName)!
                return (
                  <div key={itemName} style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '8px 10px', borderRadius: 6,
                    background: c ? 'rgba(42,21,71,0.4)' : '#27272A',
                    border: `1px solid ${c ? 'rgba(186,117,23,0.2)' : '#3F3F46'}`,
                  }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: 4, flexShrink: 0,
                      background: `linear-gradient(135deg, ${item.color}33, ${item.color}66)`,
                      border: `1px solid ${item.color}44`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 8, color: item.color, fontWeight: 700,
                    }}>{item.name.slice(0, 4)}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, color: '#F5F2FA', fontWeight: 500 }}>{item.name}</div>
                      <div style={{ fontSize: 10, color: c ? '#FAC775' : '#EF9F27' }}>{item.price}g</div>
                    </div>
                    <button onClick={() => toggleItem(itemName)} style={{
                      background: 'none', border: 'none', color: '#E24B4A',
                      cursor: 'pointer', fontSize: 14, padding: 0,
                    }}>×</button>
                  </div>
                )
              })}
              <div style={{
                marginTop: 8, paddingTop: 8,
                borderTop: `1px solid ${c ? 'rgba(186,117,23,0.2)' : '#27272A'}`,
                fontSize: 12, color: c ? '#FAC775' : '#EF9F27', fontWeight: 600,
              }}>
                Total : {selectedItems.reduce((sum, name) => sum + (items.find(i => i.name === name)?.price || 0), 0)}g
              </div>
            </div>
          )}
          <button style={{
            marginTop: 'auto', width: '100%', padding: 12,
            background: 'transparent',
            border: `1px dashed ${c ? 'rgba(186,117,23,0.4)' : '#3F3F46'}`,
            borderRadius: 6, color: 'var(--text)',
            fontFamily: 'inherit', fontSize: 13, cursor: 'pointer',
          }}>
            + Ajouter un bloc
          </button>
        </div>
      </div>
    </div>
  )
}
