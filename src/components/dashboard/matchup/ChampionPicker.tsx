'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import { champImgUrl, type DDChampFull } from '@/lib/matchup/ddragon'

// ════════════════════════════════════════════════════════════════════════════
//  ChampionPicker — overlay de sélection de champion (Lot 2.2)
// ════════════════════════════════════════════════════════════════════════════
// Modale légère : champ de recherche + grille d'icônes DDragon. La recherche est
// insensible à la casse ET aux accents (Kaï'Sa → "kaisa"). Fermeture au clic sur
// le fond, à Échap, ou à la sélection.

// Normalise pour la recherche : minuscules + accents retirés (NFD → strip combinants).
function norm(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

export default function ChampionPicker({
  champs, version, searchPlaceholder, emptyLabel, onPick, onClose, c,
}: {
  champs: DDChampFull[]
  version: string
  /* Libellés injectés par le parent : cette vue d'overlay n'a pas d'autre raison
     de dépendre du contexte de langue. */
  searchPlaceholder: string
  emptyLabel: string
  onPick: (champ: DDChampFull) => void
  onClose: () => void
  c: boolean
}) {
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // Focus auto sur le champ de recherche + fermeture à Échap.
  useEffect(() => {
    inputRef.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const filtered = useMemo(() => {
    const q = norm(query.trim())
    if (!q) return champs
    return champs.filter(ch => norm(ch.name).includes(q))
  }, [champs, query])

  const accent = c ? '#BA7517' : '#7F77DD'

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 'min(560px, 100%)', maxHeight: '80vh',
          display: 'flex', flexDirection: 'column',
          background: c ? '#1A1A1A' : '#0F0F11',
          border: `1px solid ${c ? 'rgba(186,117,23,0.35)' : '#27272A'}`,
          borderRadius: 12, overflow: 'hidden',
        }}
      >
        <div style={{ padding: 14, borderBottom: `1px solid ${c ? 'rgba(186,117,23,0.2)' : '#27272A'}` }}>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={searchPlaceholder}
            style={{
              width: '100%', padding: '10px 12px', borderRadius: 8, fontSize: 14,
              color: 'var(--text)', background: c ? 'rgba(255,255,255,0.04)' : '#18181B',
              border: `1px solid ${c ? 'rgba(186,117,23,0.25)' : '#27272A'}`, outline: 'none',
            }}
          />
        </div>

        <div
          style={{
            padding: 12, overflowY: 'auto',
            display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(84px, 1fr))', gap: 8,
          }}
        >
          {filtered.length === 0 && (
            <p style={{ gridColumn: '1/-1', color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: 20 }}>
              {emptyLabel}
            </p>
          )}
          {filtered.map(ch => (
            <button
              key={ch.id}
              onClick={() => onPick(ch)}
              title={ch.name}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                padding: 6, borderRadius: 8, cursor: 'pointer',
                background: 'transparent', border: '1px solid transparent',
                transition: 'all .12s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = c ? 'rgba(186,117,23,0.12)' : '#1D1D20'; e.currentTarget.style.borderColor = accent }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'transparent' }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={champImgUrl(version, ch.image)}
                alt={ch.name}
                loading="lazy"
                width={48} height={48}
                style={{ borderRadius: 6, display: 'block' }}
              />
              <span style={{ fontSize: 10, color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.1, maxWidth: 72, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {ch.name}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
