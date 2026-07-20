'use client'

import { useState, useEffect } from 'react'
import { useTheme } from '@/components/providers/ThemeProvider'
import { createClient } from '@/lib/supabase/client'
import { callEF } from '@/lib/ecailles'

interface Cosmetic {
  id: number
  slug: string
  type: string
  name: string
  description: string | null
  rarity: string
  price_scales: number
  image_url: string | null
}

interface Props {
  shopEnabled: boolean
  onBalanceChange: () => void
}

const RARITY_COLORS: Record<string, string> = {
  common:    '#A1A1AA',
  rare:      '#7F77DD',
  legendary: '#EF9F27',
}

const RARITY_LABELS: Record<string, string> = {
  common:    'Commun',
  rare:      'Rare',
  legendary: 'Légendaire',
}

const TYPE_LABELS: Record<string, string> = {
  badge:        'Badge',
  avatar:       'Avatar',
  avatar_frame: "Cadre d'avatar",
  avatar_anim:  'Avatar animé',
}

export default function ShopPanel({ shopEnabled, onBalanceChange }: Props) {
  const { theme } = useTheme()
  const c = theme === 'mythic'
  const supabase = createClient()

  const [cosmetics, setCosmetics] = useState<Cosmetic[]>([])
  const [ownedIds, setOwnedIds] = useState<Set<number>>(new Set())
  const [loading, setLoading] = useState(true)
  const [buying, setBuying] = useState<Record<number, boolean>>({})
  const [errors, setErrors] = useState<Record<number, string>>({})

  const accent = c ? '#EF9F27' : '#7F77DD'
  const border = c ? 'rgba(186,117,23,0.2)' : '#27272A'

  useEffect(() => { loadData() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadData() {
    setLoading(true)
    const now = new Date().toISOString()
    const [{ data: cats }, { data: owned }] = await Promise.all([
      supabase
        .from('cosmetics')
        .select('id, slug, type, name, description, rarity, price_scales, image_url')
        .eq('is_active', true)
        .or(`available_from.is.null,available_from.lte.${now}`)
        .or(`available_until.is.null,available_until.gte.${now}`)
        .order('rarity', { ascending: false })
        .order('price_scales', { ascending: true }),
      supabase.from('user_cosmetics').select('cosmetic_id'),
    ])

    if (cats) setCosmetics(cats as Cosmetic[])
    if (owned) setOwnedIds(new Set((owned as { cosmetic_id: number }[]).map(r => r.cosmetic_id)))
    setLoading(false)
  }

  async function buy(id: number) {
    if (buying[id]) return
    setBuying(prev => ({ ...prev, [id]: true }))
    setErrors(prev => { const e = { ...prev }; delete e[id]; return e })

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setBuying(prev => ({ ...prev, [id]: false })); return }

    const { error } = await callEF('shop-purchase', { cosmetic_id: id }, session.access_token)

    if (error) {
      let msg = 'Erreur inattendue'
      if (error.includes('402') || error.includes('insufficient')) msg = 'Solde insuffisant'
      else if (error.includes('409') || error.includes('already_owned')) msg = 'Déjà possédé'
      else if (error.includes('404') || error.includes('unavailable'))   msg = 'Cosmétique indisponible'
      setErrors(prev => ({ ...prev, [id]: msg }))
    } else {
      setOwnedIds(prev => new Set([...prev, id]))
      onBalanceChange()
    }

    setBuying(prev => ({ ...prev, [id]: false }))
  }

  if (loading) {
    return <div style={{ color: 'var(--text-muted)', fontSize: 14, padding: '20px 0' }}>Chargement…</div>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Bandeau boutique fermée */}
      {!shopEnabled && (
        <div style={{
          padding: '10px 16px', borderRadius: 8,
          background: 'rgba(226,75,74,0.08)', border: '1px solid rgba(226,75,74,0.25)',
          color: '#E24B4A', fontSize: 13,
        }}>
          La boutique est temporairement fermée.
        </div>
      )}

      {cosmetics.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '60px 32px', borderRadius: 10,
          border: `1.5px dashed ${border}`,
        }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>🏪</div>
          <h3 style={{ color: '#F5F2FA', fontSize: 17, fontWeight: 600, margin: '0 0 8px' }}>
            La boutique se prépare
          </h3>
          <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: 0 }}>
            Les cosmétiques arrivent bientôt. Accumule tes Écailles en attendant !
          </p>
        </div>
      ) : (
        <div className="shop-grid">
          {cosmetics.map(item => {
            const owned = ownedIds.has(item.id)
            const rarityColor = RARITY_COLORS[item.rarity] ?? '#A1A1AA'
            return (
              <div key={item.id} style={{
                borderRadius: 10,
                border: `1px solid ${owned ? 'rgba(93,202,165,0.35)' : border}`,
                background: 'rgba(255,255,255,0.02)',
                padding: 16,
                display: 'flex', flexDirection: 'column', gap: 10,
              }}>
                {/* Image */}
                <div style={{
                  width: '100%', aspectRatio: '1', borderRadius: 8, overflow: 'hidden',
                  background: 'rgba(255,255,255,0.04)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {item.image_url
                    ? <img src={item.image_url} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <span style={{ fontSize: 32 }}>🐉</span>
                  }
                </div>

                {/* Info */}
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
                    <span style={{
                      fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8,
                      color: rarityColor, padding: '2px 6px', borderRadius: 4,
                      background: `${rarityColor}20`,
                    }}>{RARITY_LABELS[item.rarity] ?? item.rarity}</span>
                    <span style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      {TYPE_LABELS[item.type] ?? item.type}
                    </span>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#F5F2FA' }}>{item.name}</div>
                  {item.description && (
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.4 }}>
                      {item.description}
                    </div>
                  )}
                  {errors[item.id] && (
                    <div style={{ fontSize: 11, color: '#E24B4A', marginTop: 4 }}>{errors[item.id]}</div>
                  )}
                </div>

                {/* Prix + bouton */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: accent, display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
                    {item.price_scales.toLocaleString('fr-FR')}
                    <img src="/icons/ecaille.png" alt="Écailles" width={15} height={15} />
                  </span>
                  <button
                    onClick={() => buy(item.id)}
                    disabled={owned || !shopEnabled || buying[item.id]}
                    style={{
                      padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                      fontFamily: 'inherit',
                      cursor: owned || !shopEnabled ? 'default' : buying[item.id] ? 'wait' : 'pointer',
                      border: owned ? '1px solid rgba(93,202,165,0.4)' : `1px solid ${accent}`,
                      background: owned ? 'transparent' : c ? 'rgba(186,117,23,0.15)' : 'rgba(127,119,221,0.12)',
                      color: owned ? '#5DCAA5' : accent,
                      opacity: !shopEnabled && !owned ? 0.5 : 1,
                      transition: 'all 0.15s', whiteSpace: 'nowrap',
                    }}
                  >
                    {owned ? '✓ Possédé' : buying[item.id] ? 'Achat…' : 'Acheter'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
