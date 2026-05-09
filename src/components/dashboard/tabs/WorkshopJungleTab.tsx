'use client'

import { useState, useEffect } from 'react'
import { useTheme } from '@/components/providers/ThemeProvider'
import { createClient } from '@/lib/supabase/client'

// ─── Types ─────────────────────────────────────────────────────────────────────
interface PathElement {
  Type?: string | number   // enum sérialisé en int ou string selon la version
  Label?: string
  X?: number; Y?: number
  Order?: number
  HasSmite?: boolean
}

interface WorkshopJunglePath {
  id: string
  titre: string
  description: string
  creator_name: string
  champion: string
  side: string     // "Blue" | "Red"
  patch: string
  elements: PathElement[]
  likes: number
  saves: number
  created_at: string
}

const DDN      = 'https://ddragon.leagueoflegends.com'
const champImg = (v: string, name: string) => `${DDN}/cdn/${v}/img/champion/${name}.png`

// Type 0 = Camp dans l'enum C#
const isCamp = (el: PathElement) => el.Type === 0 || el.Type === 'Camp'

const SIDES = ['Tous', 'Bleu', 'Rouge']

// ─── Component ─────────────────────────────────────────────────────────────────
export default function WorkshopJungleTab() {
  const { theme } = useTheme()
  const c = theme === 'mythic'
  const supabase = createClient()

  const [paths, setPaths]     = useState<WorkshopJunglePath[]>([])
  const [loading, setLoading] = useState(true)
  const [version, setVersion] = useState('')
  const [search, setSearch]   = useState('')
  const [side, setSide]       = useState('Tous')
  const [liking, setLiking]   = useState<string | null>(null)

  const border  = c ? 'rgba(186,117,23,0.2)' : '#27272A'
  const borderH = c ? 'rgba(186,117,23,0.5)' : '#3F3F46'
  const bg      = c ? 'rgba(42,21,71,0.4)'   : '#18181B'
  const accent  = c ? '#BA7517' : '#7F77DD'

  // ── Chargement ────────────────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      try {
        const [vRes, { data: rows, error }] = await Promise.all([
          fetch(`${DDN}/api/versions.json`),
          supabase.from('workshop_junglepaths').select('*').order('created_at', { ascending: false }),
        ])

        const versions: string[] = await vRes.json()
        setVersion(versions[0])

        if (!error && rows) {
          setPaths(rows.map((r: any) => ({
            id:           r.id,
            titre:        r.titre         ?? '',
            description:  r.description   ?? '',
            creator_name: r.creator_name  ?? '',
            champion:     r.champion      ?? '',
            side:         r.side          ?? 'Blue',
            patch:        r.patch         ?? '',
            likes:        r.likes         ?? 0,
            saves:        r.saves         ?? 0,
            created_at:   r.created_at    ?? '',
            elements:     Array.isArray(r.elements) ? r.elements : [],
          })))
        }
      } catch (e) {
        console.error('[JungleWorkshop] load error', e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  // ── Like ──────────────────────────────────────────────────────────────────
  async function handleLike(path: WorkshopJunglePath) {
    if (liking) return
    setLiking(path.id)
    const { error } = await supabase.rpc('increment_jp_likes', { path_id: path.id })
    if (!error)
      setPaths(prev => prev.map(p => p.id === path.id ? { ...p, likes: p.likes + 1 } : p))
    setLiking(null)
  }

  // ── Filtre côté (Blue/Red en DB, Bleu/Rouge dans l'UI) ───────────────────
  const sideEn = side === 'Bleu' ? 'Blue' : side === 'Rouge' ? 'Red' : null

  const filtered = paths.filter(p => {
    if (sideEn && p.side !== sideEn) return false
    if (search && !p.titre.toLowerCase().includes(search.toLowerCase()) &&
        !p.champion.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
        Découvre et importe les jungle paths créés par la communauté.
      </p>

      {/* ── Filtres ── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="🔍 Rechercher un path ou un champion..."
          style={{
            flex: '1 1 200px', padding: '9px 14px', borderRadius: 8,
            background: c ? 'rgba(20,10,35,0.6)' : '#18181B',
            border: `1px solid ${border}`, color: 'var(--text)',
            fontFamily: 'inherit', fontSize: 13, outline: 'none',
          }}
        />
        <div style={{ display: 'flex', gap: 6 }}>
          {SIDES.map(s => {
            const on = side === s
            const sideColor = s === 'Bleu' ? '#3A8AC9' : s === 'Rouge' ? '#E24B4A' : accent
            const sideBg    = s === 'Bleu' ? 'rgba(58,138,201,0.15)' : s === 'Rouge' ? 'rgba(226,75,74,0.15)' : (c ? 'rgba(186,117,23,0.15)' : 'rgba(127,119,221,0.15)')
            const sideBorder= s === 'Bleu' ? 'rgba(58,138,201,0.5)' : s === 'Rouge' ? 'rgba(226,75,74,0.5)' : accent
            return (
              <button key={s} onClick={() => setSide(s)} style={{
                padding: '7px 14px', borderRadius: 20, fontSize: 12, fontWeight: 500,
                border: `1px solid ${on ? sideBorder : border}`,
                background: on ? sideBg : 'transparent',
                color: on ? sideColor : 'var(--text-muted)',
                cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
              }}>{s}</button>
            )
          })}
        </div>
      </div>

      {/* ── Chargement ── */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)', fontSize: 13 }}>
          Chargement des jungle paths…
        </div>
      )}

      {/* ── Aucun résultat ── */}
      {!loading && filtered.length === 0 && (
        <div style={{
          textAlign: 'center', padding: '60px 20px',
          background: c ? 'rgba(20,10,35,0.4)' : '#18181B',
          border: `1px dashed ${border}`, borderRadius: 12,
        }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>🌿</div>
          <div style={{ fontSize: 14, color: 'var(--text-muted)' }}>
            {paths.length === 0 ? 'Aucun jungle path publié pour l\'instant.' : 'Aucun path ne correspond à ta recherche.'}
          </div>
        </div>
      )}

      {/* ── Liste de paths ── */}
      {!loading && filtered.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.map(path => {
            const isBlue     = path.side === 'Blue'
            const sideColor  = isBlue ? '#3A8AC9' : '#E24B4A'
            const sideBg     = isBlue ? 'rgba(58,138,201,0.12)' : 'rgba(226,75,74,0.12)'
            const sideBorder = isBlue ? 'rgba(58,138,201,0.3)' : 'rgba(226,75,74,0.3)'
            const sideLbl    = isBlue ? 'Côté Bleu' : 'Côté Rouge'
            const isLikingThis = liking === path.id

            // Camps visités dans l'ordre
            const camps = path.elements
              .filter(isCamp)
              .filter(el => el.Label)
              .sort((a, b) => (a.Order ?? 99) - (b.Order ?? 99))

            return (
              <div key={path.id} style={{
                padding: '14px 18px', borderRadius: 10, background: bg,
                border: `1px solid ${border}`,
                display: 'flex', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap',
                transition: 'border-color 0.15s',
              }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = borderH)}
                onMouseLeave={e => (e.currentTarget.style.borderColor = border)}
              >
                {/* ── Champion icon ── */}
                <div style={{ flexShrink: 0 }}>
                  {version && path.champion ? (
                    <img
                      src={champImg(version, path.champion)}
                      alt={path.champion}
                      onError={e => {
                        e.currentTarget.style.display = 'none'
                        e.currentTarget.nextElementSibling?.removeAttribute('style')
                      }}
                      style={{ width: 44, height: 44, borderRadius: 8, objectFit: 'cover' }}
                    />
                  ) : null}
                  <div style={{
                    width: 44, height: 44, borderRadius: 8,
                    background: `linear-gradient(135deg, ${isBlue ? 'rgba(58,138,201,0.5),rgba(58,138,201,0.8)' : 'rgba(226,75,74,0.5),rgba(226,75,74,0.8)'})`,
                    display: version && path.champion ? 'none' : 'flex',
                    alignItems: 'center', justifyContent: 'center',
                    fontWeight: 700, fontSize: 14, color: 'white',
                  }}>
                    {path.champion.slice(0, 2).toUpperCase() || '??'}
                  </div>
                </div>

                {/* ── Info ── */}
                <div style={{ flex: 1, minWidth: 160 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#F5F2FA', marginBottom: 5 }}>
                    {path.titre}
                  </div>

                  {/* Badges */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: camps.length > 0 ? 10 : 0 }}>
                    <span style={{
                      fontSize: 11, padding: '2px 8px', borderRadius: 4,
                      background: sideBg, color: sideColor, border: `1px solid ${sideBorder}`,
                    }}>{sideLbl}</span>
                    {path.champion && (
                      <span style={{
                        fontSize: 11, padding: '2px 8px', borderRadius: 4,
                        background: c ? 'rgba(186,117,23,0.08)' : 'rgba(127,119,221,0.08)',
                        color: c ? '#FAC775' : '#7F77DD',
                        border: `1px solid ${c ? 'rgba(186,117,23,0.2)' : 'rgba(127,119,221,0.2)'}`,
                      }}>{path.champion}</span>
                    )}
                    {path.patch && (
                      <span style={{
                        fontSize: 11, padding: '2px 8px', borderRadius: 4,
                        background: 'rgba(255,255,255,0.04)',
                        color: 'var(--text-dim)', border: `1px solid ${border}`,
                      }}>patch {path.patch}</span>
                    )}
                  </div>

                  {/* Séquence de camps */}
                  {camps.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 4 }}>
                      {camps.map((el, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span style={{
                            fontSize: 10, padding: '2px 7px', borderRadius: 3,
                            background: el.HasSmite ? (isBlue ? 'rgba(58,138,201,0.2)' : 'rgba(226,75,74,0.2)') : 'rgba(255,255,255,0.06)',
                            border: `1px solid ${el.HasSmite ? sideBorder : border}`,
                            color: el.HasSmite ? sideColor : 'var(--text-muted)',
                            fontWeight: el.HasSmite ? 600 : 400,
                          }}>
                            {el.Order !== undefined && el.Order >= 0 ? `${el.Order + 1}. ` : ''}{el.Label}
                            {el.HasSmite ? ' ⚡' : ''}
                          </span>
                          {i < camps.length - 1 && (
                            <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>→</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Description */}
                  {path.description && (
                    <div style={{
                      fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5, marginTop: 8,
                      display: '-webkit-box', WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical', overflow: 'hidden',
                    }}>
                      {path.description}
                    </div>
                  )}
                </div>

                {/* ── Actions ── */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, flexShrink: 0 }}>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                    par <span style={{ color: 'var(--text-muted)' }}>{path.creator_name}</span>
                  </div>

                  {/* Like + saves */}
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <button
                      onClick={() => handleLike(path)}
                      disabled={!!isLikingThis}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 4,
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: c ? '#BA7517' : '#7F77DD',
                        fontSize: 12, fontFamily: 'inherit', padding: '2px 6px',
                        opacity: isLikingThis ? 0.5 : 1, transition: 'opacity 0.15s',
                      }}
                    >♥ {path.likes}</button>
                    <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>↓ {path.saves}</span>
                  </div>

                  {/* Import — disponible uniquement dans l'app */}
                  <div title="L'import de jungle paths est disponible dans l'application desktop">
                    <button disabled style={{
                      padding: '7px 14px', borderRadius: 6,
                      background: 'transparent',
                      border: `1px solid ${border}`,
                      color: 'var(--text-dim)', fontSize: 12, fontWeight: 500,
                      cursor: 'not-allowed', fontFamily: 'inherit',
                    }}>
                      Importer dans l'app
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
