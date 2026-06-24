'use client'

// EcosystemsGrid — grille des séries avec recherche texte (filtre display_name,
// debounce léger, insensible à la casse). Chaque carte montre la couleur de thème
// de la série (préparé pour un grand nombre d'écosystèmes).

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { seriesPath } from '@/lib/tournois'

export interface EcosystemItem {
  slug:           string
  display_name:   string
  description:    string | null
  logo_url:       string | null
  hero_image_url: string | null
  total:          number
  finished:       number
  color:          string   // couleur dominante du thème (hex)
}

export default function EcosystemsGrid({ items }: { items: EcosystemItem[] }) {
  const [raw, setRaw]     = useState('')
  const [query, setQuery] = useState('')

  // Debounce léger (180ms)
  useEffect(() => {
    const id = setTimeout(() => setQuery(raw.trim().toLowerCase()), 180)
    return () => clearTimeout(id)
  }, [raw])

  const filtered = useMemo(
    () => (query ? items.filter((s) => s.display_name.toLowerCase().includes(query)) : items),
    [items, query],
  )

  return (
    <>
      <div style={{ marginBottom: 24 }}>
        <input
          type="search"
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          placeholder="Rechercher un écosystème…"
          aria-label="Rechercher une série"
          style={{
            width: '100%', maxWidth: 420,
            background: 'rgba(20,9,28,0.8)', border: '1px solid rgba(47,111,222,0.35)',
            borderRadius: 6, padding: '10px 14px', color: '#fff',
            fontFamily: 'Rajdhani, sans-serif', fontSize: 15, outline: 'none',
          }}
        />
      </div>

      {filtered.length === 0 ? (
        <p className="xv2-data" style={{ color: '#8fa0bb', fontSize: 15 }}>
          {query ? 'Aucun écosystème ne correspond.' : 'Aucun écosystème pour le moment.'}
        </p>
      ) : (
        <div className="xv2-card-grid">
          {filtered.map((s) => (
            <Link
              key={s.slug}
              href={seriesPath(s.slug)}
              style={{
                display: 'block', textDecoration: 'none', position: 'relative',
                borderRadius: 6, overflow: 'hidden',
                background: 'linear-gradient(160deg, #1c3a6e 0%, #14091c 60%)',
                border: `1px solid ${s.color}55`, minHeight: 180,
              }}
            >
              {/* Liseré couleur de thème */}
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: s.color }} />
              {s.hero_image_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={s.hero_image_url} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.22 }} />
              )}
              <div style={{ position: 'relative', padding: '22px 20px', display: 'flex', flexDirection: 'column', gap: 10, height: '100%' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  {s.logo_url
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={s.logo_url} alt="" style={{ width: 40, height: 40, objectFit: 'contain' }} />
                    : <span style={{ width: 14, height: 14, borderRadius: '50%', background: s.color, display: 'inline-block' }} />}
                  <h2 className="xv2-display" style={{ fontSize: 24, color: '#fff', margin: 0 }}>{s.display_name}</h2>
                </div>
                {s.description && (
                  <p className="xv2-data" style={{ margin: 0, color: '#8fa0bb', fontSize: 14, lineHeight: 1.5 }}>{s.description}</p>
                )}
                <div style={{ marginTop: 'auto', display: 'flex', gap: 18 }}>
                  <span className="xv2-data" style={{ color: s.color, fontSize: 13 }}>
                    {s.total} tournoi{s.total > 1 ? 's' : ''}
                  </span>
                  <span className="xv2-data" style={{ color: '#6e85a0', fontSize: 13 }}>
                    {s.finished} terminé{s.finished > 1 ? 's' : ''}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  )
}
