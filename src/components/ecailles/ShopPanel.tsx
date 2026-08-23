'use client'

import { useState, useEffect } from 'react'
import { useTheme } from '@/components/providers/ThemeProvider'
import { createClient } from '@/lib/supabase/client'
import { callEF } from '@/lib/ecailles'
import { useDashboard, useLang } from '@/locales/dashboard'
import { formatNumber } from '@/lib/intl'

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

/* Les libellés de rareté et de type sont traduits — voir `shop.rarities` /
   `shop.types` dans src/locales/dashboard/ecailles.ts. Les COULEURS, elles, sont du
   style : elles restent indexées par la valeur métier `cosmetics.rarity`. */

export default function ShopPanel({ shopEnabled, onBalanceChange }: Props) {
  const { theme } = useTheme()
  const c = theme === 'mythic'
  const supabase = createClient()
  const d = useDashboard()
  const lang = useLang()
  const sh = d.ecailles.shop

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
      // Les motifs testés sont la réponse de l'Edge Function : clés, pas du texte affiché.
      let msg = sh.errUnexpected
      if (error.includes('402') || error.includes('insufficient')) msg = sh.errBalance
      else if (error.includes('409') || error.includes('already_owned')) msg = sh.errOwned
      else if (error.includes('404') || error.includes('unavailable'))   msg = sh.errUnavailable
      setErrors(prev => ({ ...prev, [id]: msg }))
    } else {
      setOwnedIds(prev => new Set([...prev, id]))
      onBalanceChange()
    }

    setBuying(prev => ({ ...prev, [id]: false }))
  }

  if (loading) {
    return <div style={{ color: 'var(--text-muted)', fontSize: 14, padding: '20px 0' }}>{d.common.loading}</div>
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
          {sh.closed}
        </div>
      )}

      {cosmetics.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '60px 32px', borderRadius: 10,
          border: `1.5px dashed ${border}`,
        }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>🏪</div>
          <h3 style={{ color: '#F5F2FA', fontSize: 17, fontWeight: 600, margin: '0 0 8px' }}>
            {sh.emptyTitle}
          </h3>
          <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: 0 }}>
            {sh.emptyText}
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
                    }}>{sh.rarities[item.rarity as keyof typeof sh.rarities] ?? item.rarity}</span>
                    <span style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      {sh.types[item.type as keyof typeof sh.types] ?? item.type}
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
                    {formatNumber(item.price_scales, lang)}
                    <img src="/icons/ecaille.png" alt={d.ecailles.scalesAlt} width={15} height={15} />
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
                    {owned ? sh.owned : buying[item.id] ? sh.buying : sh.buy}
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
