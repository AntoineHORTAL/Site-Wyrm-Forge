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
  spells: {
    id: string; name: string; description: string; image: { full: string }
    cooldownBurn: string; costBurn: string; rangeBurn: string; tooltip: string
  }[]
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
                    <TagBadge key={t} tag={t} />
                  ))}
                  <span style={{
                    padding: '2px 8px', borderRadius: 3, fontSize: 11,
                    background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.1)',
                    color: 'var(--text-muted)',
                  }} title="Note de complexité de jeu attribuée par Riot, de 1 (facile) à 10 (très difficile).">
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
                  description={cleanHtml(sp.description)}
                  imgSrc={`${DDN}/cdn/${version}/img/spell/${sp.image.full}`}
                  cooldown={sp.cooldownBurn}
                  cost={sp.costBurn}
                  range={sp.rangeBurn}
                  tooltip={sp.tooltip}
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
                  <SkinTile key={sk.id}
                    champId={data.id}
                    skinNum={sk.num}
                    skinName={sk.name === 'default' ? 'Classique' : sk.name}
                    active={skinIdx === i}
                    onClick={() => setSkinIdx(i)}
                  />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </main>
  )
}

// ── Tile de skin avec chaîne de fallbacks (tile → loading → splash) ──
function SkinTile({ champId, skinNum, skinName, active, onClick }: {
  champId: string; skinNum: number; skinName: string
  active: boolean; onClick: () => void
}) {
  // Plusieurs URLs DDragon possibles selon la disponibilité du skin
  const sources = [
    `${DDN}/cdn/img/champion/tiles/${champId}_${skinNum}.jpg`,
    `${DDN}/cdn/img/champion/loading/${champId}_${skinNum}.jpg`,
    `${DDN}/cdn/img/champion/splash/${champId}_${skinNum}.jpg`,
  ]
  const [srcIdx, setSrcIdx] = useState(0)
  const [failed, setFailed] = useState(false)

  return (
    <div
      onClick={onClick}
      style={{
        cursor: 'pointer', borderRadius: 5, overflow: 'hidden',
        border: active ? '2px solid #EF9F27' : '1px solid rgba(255,255,255,0.05)',
        transition: 'transform 120ms',
        background: '#0a0612',
      }}
    >
      {!failed ? (
        <img
          src={sources[srcIdx]}
          alt={skinName}
          loading="lazy"
          style={{ width: '100%', display: 'block', aspectRatio: '4 / 3', objectFit: 'cover' }}
          onError={() => {
            if (srcIdx < sources.length - 1) setSrcIdx(srcIdx + 1)
            else setFailed(true)
          }}
        />
      ) : (
        <div style={{
          width: '100%', aspectRatio: '4 / 3',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'linear-gradient(135deg, #2a1545, #534AB7)',
          color: 'rgba(255,255,255,0.4)', fontSize: 11,
        }}>Image indisponible</div>
      )}
      <div style={{
        padding: '4px 6px', fontSize: 10, color: 'var(--text-muted)',
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>
        {skinName}
      </div>
    </div>
  )
}

// ── Tag de classe champion avec tooltip explicatif au hover ──
const TAG_DESCRIPTIONS: Record<string, string> = {
  Fighter:    'Combattant — corps-à-corps polyvalent, équilibre entre dégâts et résistance. Souvent en TOP ou JUNGLE.',
  Tank:       'Tank — encaisse les dégâts pour protéger son équipe. Initie les combats. Souvent en TOP ou SUPPORT.',
  Mage:       'Mage — utilise principalement des sorts et de la puissance magique (AP) pour infliger ses dégâts.',
  Assassin:   'Assassin — explose une cible isolée en un combo. Très mobile, fragile. Souvent en MID ou JUNGLE.',
  Marksman:   'Tireur (ADC) — dégâts soutenus à distance via auto-attaques. Position en BOT lane.',
  Support:    'Support — protège l\'ADC, sécurise la vision, initie ou pacifie les combats. Position en BOT.',
  Specialist: 'Spécialiste — kit unique sortant des archétypes classiques (ex: Heimerdinger, Yuumi).',
}

function TagBadge({ tag }: { tag: string }) {
  const [hover, setHover] = useState(false)
  const desc = TAG_DESCRIPTIONS[tag]
  return (
    <span
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: 'relative', cursor: desc ? 'help' : 'default',
        padding: '2px 8px', borderRadius: 3, fontSize: 11, fontWeight: 600,
        background: 'rgba(127,119,221,0.20)', border: '1px solid rgba(127,119,221,0.4)',
        color: '#F5F2FA', display: 'inline-flex', alignItems: 'center',
      }}
    >
      {tag}
      {hover && desc && (
        <span style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 30,
          maxWidth: 280, padding: '8px 12px', borderRadius: 6,
          background: 'rgba(8,5,18,0.97)',
          border: '1px solid rgba(127,119,221,0.4)',
          color: '#F5F2FA', fontSize: 11, fontWeight: 400, letterSpacing: 0,
          lineHeight: 1.4, whiteSpace: 'normal', textAlign: 'left',
          boxShadow: '0 4px 16px rgba(0,0,0,0.4)', pointerEvents: 'none',
        }}>
          {desc}
        </span>
      )}
    </span>
  )
}

// ── Type de dégâts d'un sort ──
// DDragon n'a PAS de champ structuré "type de dégâts". On le dérive des balises sémantiques
// natives présentes dans le tooltip Riot : <physicalDamage>, <magicDamage>, <trueDamage>.
// Un sort hybride peut contenir plusieurs balises → on renvoie TOUS les types trouvés
// (multi-badge), plutôt que d'en choisir un arbitrairement.
type DamageKind = 'physical' | 'magic' | 'true'

const DAMAGE_TYPE_META: Record<DamageKind, { label: string; color: string; bg: string; border: string }> = {
  physical: { label: 'Physique', color: '#EF9F27', bg: 'rgba(239,159,39,0.12)',  border: 'rgba(239,159,39,0.35)' },
  magic:    { label: 'Magique',  color: '#7F77DD', bg: 'rgba(127,119,221,0.14)', border: 'rgba(127,119,221,0.40)' },
  true:     { label: 'Vrai',     color: '#E8E4F0', bg: 'rgba(255,255,255,0.08)', border: 'rgba(255,255,255,0.28)' },
}

function getDamageTypes(tooltip?: string): DamageKind[] {
  if (!tooltip) return []
  const t = tooltip.toLowerCase()
  const types: DamageKind[] = []
  if (t.includes('<physicaldamage')) types.push('physical')
  if (t.includes('<magicdamage'))    types.push('magic')
  if (t.includes('<truedamage'))     types.push('true')
  return types
}

// ── Sous-composant : une carte de sort ──
function SpellCard({ slot, name, description, imgSrc, cooldown, cost, range, tooltip }: {
  slot: string; name: string; description: string; imgSrc: string
  cooldown?: string; cost?: string; range?: string; tooltip?: string
}) {
  const damageTypes = getDamageTypes(tooltip)

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
        {/* Badges de type de dégâts, dérivés des balises du tooltip (multi-badge pour hybrides).
            ⚠️ NOMBRES de dégâts par rang (ex: "60/95/130/165/200 (+0.6 AP)") : NON disponibles via
            DDragon — `effectBurn` est vidé (que des "0") et `vars` est vide pour les champions
            modernes ; les valeurs vivent dans le tooltip sous forme de placeholders {{ }} que
            DDragon ne résout pas. Les obtenir nécessite Community Dragon (spellCalculations) ou une
            table curatée → chantier séparé DIFFÉRÉ (B13). NE PAS re-tenter via effectBurn/vars. */}
        {damageTypes.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 5 }}>
            {damageTypes.map(dt => {
              const m = DAMAGE_TYPE_META[dt]
              return (
                <span key={dt} style={{
                  padding: '1px 8px', borderRadius: 3, fontSize: 10, fontWeight: 700, letterSpacing: 0.3,
                  background: m.bg, border: `1px solid ${m.border}`, color: m.color,
                }}>{m.label}</span>
              )
            })}
          </div>
        )}
        <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4, whiteSpace: 'pre-wrap', maxHeight: 140, overflowY: 'auto' }}
          className="thin-scroll">
          {description}
        </div>
      </div>
    </div>
  )
}
