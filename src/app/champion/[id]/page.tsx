'use client'

/**
 * Page de détail d'un champion : /champion/Braum
 *
 * Récupère depuis DDragon :
 *   - le détail complet du champion (stats, sorts, passif, skins, lore)
 *   - les recommandations de Riot (items recommandés)
 *
 * Source officielle, pas de scraping. Pas de win rate (Riot ne l'expose pas).
 */
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'

const DDN = 'https://ddragon.leagueoflegends.com'

interface ChampionData {
  id: string; key: string; name: string; title: string; lore: string; blurb: string
  partype: string // ressource : Mana, Énergie, etc.
  image: { full: string }
  info: { attack: number; defense: number; magic: number; difficulty: number }
  stats: Record<string, number>
  tags: string[] // ex: Fighter, Tank
  passive: { name: string; description: string; image: { full: string } }
  spells: { id: string; name: string; description: string; image: { full: string }; cooldownBurn: string; costBurn: string; rangeBurn: string; tooltip: string }[]
  skins: { id: string; num: number; name: string }[]
  allytips: string[]
  enemytips: string[]
  recommended?: unknown[]
}

export default function ChampionPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [version, setVersion] = useState('')
  const [data,    setData]    = useState<ChampionData | null>(null)
  const [error,   setError]   = useState('')
  const [loading, setLoading] = useState(true)
  const [skinIdx, setSkinIdx] = useState(0)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    async function load() {
      setLoading(true); setError('')
      try {
        const vRes = await fetch(`${DDN}/api/versions.json`)
        const vList: string[] = await vRes.json()
        if (cancelled) return
        const v = vList[0]
        setVersion(v)
        const res = await fetch(`${DDN}/cdn/${v}/data/fr_FR/champion/${id}.json`)
        const j = await res.json()
        if (cancelled) return
        const d = j.data?.[id as string]
        if (!d) { setError('Champion introuvable.'); return }
        setData(d)
      } catch {
        if (!cancelled) setError('Impossible de charger le champion.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [id])

  const cleanHtml = (s: string) => s.replace(/<br\s*\/?>/g, '\n').replace(/<[^>]+>/g, '')

  return (
    <main style={{
      minHeight: '100vh', padding: '24px clamp(12px, 4vw, 40px)',
      maxWidth: 1400, margin: '0 auto', color: '#F5F2FA',
    }}>
      <button onClick={() => router.back()} style={{
        background: 'transparent', border: 'none', cursor: 'pointer',
        color: 'var(--text-muted)', fontSize: 13, padding: '6px 0',
        marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6,
      }}>
        ← Retour
      </button>

      {loading && <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>Chargement…</div>}
      {error && <div style={{ color: '#E24B4A', padding: 16, fontSize: 14 }}>{error}</div>}

      {data && version && !loading && (
        <>
          {/* En-tête : splash + nom + tags + difficulté */}
          <header style={{
            position: 'relative', minHeight: 280, borderRadius: 12, overflow: 'hidden',
            marginBottom: 18,
            background: '#0a0612',
          }}>
            <img
              src={`${DDN}/cdn/img/champion/splash/${data.id}_${data.skins[skinIdx]?.num ?? 0}.jpg`}
              alt=""
              style={{
                width: '100%', height: 280, objectFit: 'cover', objectPosition: 'center 20%',
                opacity: 0.65,
              }}
              onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
            />
            <div style={{
              position: 'absolute', inset: 0,
              background: 'linear-gradient(180deg, rgba(8,5,18,0.0) 30%, rgba(8,5,18,0.95) 100%)',
            }} />
            <div style={{
              position: 'absolute', bottom: 16, left: 18, right: 18,
              display: 'flex', alignItems: 'flex-end', gap: 14, flexWrap: 'wrap',
            }}>
              <img src={`${DDN}/cdn/${version}/img/champion/${data.image.full}`}
                alt="" style={{ width: 80, height: 80, borderRadius: 6, border: '2px solid #EF9F27' }} />
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: 2 }}>
                  {data.title?.toUpperCase()}
                </div>
                <h1 style={{ fontSize: 36, fontWeight: 800, color: '#F5F2FA', margin: '2px 0' }}>
                  {data.name}
                </h1>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                  {data.tags?.map(t => (
                    <span key={t} style={{
                      padding: '2px 8px', borderRadius: 3, fontSize: 11, fontWeight: 600,
                      background: 'rgba(127,119,221,0.20)', border: '1px solid rgba(127,119,221,0.4)',
                      color: '#F5F2FA',
                    }}>{t}</span>
                  ))}
                  <span style={{
                    padding: '2px 8px', borderRadius: 3, fontSize: 11,
                    background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.1)',
                    color: 'var(--text-muted)',
                  }}>
                    Difficulté {data.info.difficulty}/10
                  </span>
                </div>
              </div>
            </div>
          </header>

          {/* Info combat / def / magie / diff (4 jauges) */}
          <section style={{
            display: 'grid', gap: 8,
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            marginBottom: 18,
          }}>
            {[
              { label: 'Attaque',   v: data.info.attack,    c: '#E24B4A' },
              { label: 'Défense',   v: data.info.defense,   c: '#5DCAA5' },
              { label: 'Magie',     v: data.info.magic,     c: '#7F77DD' },
              { label: 'Difficulté', v: data.info.difficulty, c: '#EF9F27' },
            ].map(s => (
              <div key={s.label} style={{
                padding: '10px 14px', borderRadius: 6,
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.06)',
              }}>
                <div style={{ fontSize: 10, color: 'var(--text-dim)', letterSpacing: 1, marginBottom: 4 }}>
                  {s.label.toUpperCase()}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ flex: 1, height: 8, background: 'rgba(255,255,255,0.05)', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ width: `${(s.v / 10) * 100}%`, height: '100%', background: s.c }} />
                  </div>
                  <span style={{ minWidth: 32, fontSize: 12, fontWeight: 600, color: s.c }}>{s.v}/10</span>
                </div>
              </div>
            ))}
          </section>

          {/* Lore */}
          <section style={{
            marginBottom: 18, padding: '14px 18px', borderRadius: 10,
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.06)',
          }}>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
              Histoire
            </div>
            <p style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--text-muted)', whiteSpace: 'pre-wrap' }}>
              {data.lore}
            </p>
          </section>

          {/* Stats brutes */}
          <section style={{
            marginBottom: 18, padding: '14px 18px', borderRadius: 10,
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.06)',
          }}>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
              Stats au niveau 1 — Ressource : {data.partype}
            </div>
            <div style={{
              display: 'grid', gap: 6,
              gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
              fontSize: 12,
            }}>
              {[
                { label: 'PV',          val: data.stats.hp,           per: data.stats.hpperlevel },
                { label: 'Mana/Énergie', val: data.stats.mp,          per: data.stats.mpperlevel },
                { label: 'Armure',      val: data.stats.armor,        per: data.stats.armorperlevel },
                { label: 'Résist. Mag.', val: data.stats.spellblock,  per: data.stats.spellblockperlevel },
                { label: 'AD',          val: data.stats.attackdamage, per: data.stats.attackdamageperlevel },
                { label: 'AS base',     val: data.stats.attackspeed,  per: data.stats.attackspeedperlevel },
                { label: 'Vitesse',     val: data.stats.movespeed,    per: 0 },
                { label: 'Portée AA',   val: data.stats.attackrange,  per: 0 },
              ].map(s => (
                <div key={s.label} style={{
                  padding: '8px 10px', borderRadius: 5,
                  background: 'rgba(0,0,0,0.2)',
                }}>
                  <div style={{ fontSize: 10, color: 'var(--text-dim)', marginBottom: 2 }}>{s.label}</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#F5F2FA' }}>{s.val}</div>
                  {s.per > 0 && (
                    <div style={{ fontSize: 9, color: '#5DCAA5' }}>+{s.per}/niveau</div>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* Sorts (passif + 4 actifs) */}
          <section style={{
            marginBottom: 18, padding: '14px 18px', borderRadius: 10,
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.06)',
          }}>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
              Sorts
            </div>
            <div style={{
              display: 'grid', gap: 8,
              gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            }}>
              {/* Passif */}
              <SpellCard
                slot="P"
                name={data.passive.name}
                description={cleanHtml(data.passive.description)}
                imgSrc={`${DDN}/cdn/${version}/img/passive/${data.passive.image.full}`}
              />
              {/* Q W E R */}
              {data.spells.map((sp, i) => (
                <SpellCard key={i}
                  slot={['Q','W','E','R'][i]}
                  name={sp.name}
                  description={cleanHtml(sp.tooltip ?? sp.description)}
                  imgSrc={`${DDN}/cdn/${version}/img/spell/${sp.image.full}`}
                  cooldown={sp.cooldownBurn}
                  cost={sp.costBurn}
                  range={sp.rangeBurn}
                />
              ))}
            </div>
          </section>

          {/* Tips */}
          {(data.allytips?.length > 0 || data.enemytips?.length > 0) && (
            <section style={{
              display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', marginBottom: 18,
            }}>
              {data.allytips?.length > 0 && (
                <div style={{
                  padding: '14px 18px', borderRadius: 10,
                  background: 'rgba(93,202,165,0.05)',
                  border: '1px solid rgba(93,202,165,0.2)',
                }}>
                  <div style={{ fontSize: 11, color: '#5DCAA5', fontWeight: 700, letterSpacing: 1, marginBottom: 8 }}>
                    CONSEILS POUR JOUER {data.name.toUpperCase()}
                  </div>
                  {data.allytips.map((t, i) => (
                    <div key={i} style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: 6, paddingLeft: 14, position: 'relative' }}>
                      <span style={{ position: 'absolute', left: 0, color: '#5DCAA5' }}>•</span>
                      {t}
                    </div>
                  ))}
                </div>
              )}
              {data.enemytips?.length > 0 && (
                <div style={{
                  padding: '14px 18px', borderRadius: 10,
                  background: 'rgba(226,75,74,0.05)',
                  border: '1px solid rgba(226,75,74,0.2)',
                }}>
                  <div style={{ fontSize: 11, color: '#E24B4A', fontWeight: 700, letterSpacing: 1, marginBottom: 8 }}>
                    CONSEILS CONTRE {data.name.toUpperCase()}
                  </div>
                  {data.enemytips.map((t, i) => (
                    <div key={i} style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: 6, paddingLeft: 14, position: 'relative' }}>
                      <span style={{ position: 'absolute', left: 0, color: '#E24B4A' }}>•</span>
                      {t}
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* Skins (galerie) */}
          {data.skins.length > 1 && (
            <section style={{
              marginBottom: 18, padding: '14px 18px', borderRadius: 10,
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.06)',
            }}>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                Skins ({data.skins.length})
              </div>
              <div style={{
                display: 'grid', gap: 6,
                gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
              }}>
                {data.skins.map((sk, i) => (
                  <div key={sk.id}
                    onClick={() => setSkinIdx(i)}
                    style={{
                      cursor: 'pointer', borderRadius: 5, overflow: 'hidden',
                      border: skinIdx === i ? '2px solid #EF9F27' : '1px solid rgba(255,255,255,0.05)',
                      transition: 'transform 120ms',
                    }}
                  >
                    <img src={`${DDN}/cdn/img/champion/tiles/${data.id}_${sk.num}.jpg`}
                      alt={sk.name}
                      style={{ width: '100%', display: 'block' }}
                      onError={e => { (e.currentTarget as HTMLImageElement).style.opacity = '0.3' }} />
                    <div style={{
                      padding: '4px 6px', fontSize: 10, color: 'var(--text-muted)',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>
                      {sk.name === 'default' ? 'Classique' : sk.name}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </main>
  )
}

// ── Sous-composant : une carte de sort ──
function SpellCard({ slot, name, description, imgSrc, cooldown, cost, range }: {
  slot: string; name: string; description: string; imgSrc: string
  cooldown?: string; cost?: string; range?: string
}) {
  return (
    <div style={{
      display: 'flex', gap: 10, padding: 12, borderRadius: 6,
      background: 'rgba(0,0,0,0.25)',
      border: '1px solid rgba(255,255,255,0.04)',
    }}>
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <img src={imgSrc} alt="" style={{ width: 56, height: 56, borderRadius: 4 }} />
        <span style={{
          position: 'absolute', bottom: -3, left: -3, fontSize: 10, fontWeight: 700,
          padding: '1px 6px', borderRadius: 3, background: '#7F77DD', color: '#fff',
        }}>{slot}</span>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#F5F2FA', marginBottom: 2 }}>{name}</div>
        {(cooldown || cost || range) && (
          <div style={{ fontSize: 10, color: 'var(--text-dim)', display: 'flex', gap: 8, marginBottom: 4 }}>
            {cooldown && <span>⏱ {cooldown}s</span>}
            {cost     && <span>💧 {cost}</span>}
            {range    && <span>📏 {range}</span>}
          </div>
        )}
        <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4, whiteSpace: 'pre-wrap', maxHeight: 140, overflowY: 'auto' }}>
          {description}
        </div>
      </div>
    </div>
  )
}
