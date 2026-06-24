'use client'

import { useState, useEffect } from 'react'
import { useTheme } from '@/components/providers/ThemeProvider'
import { createClient } from '@/lib/supabase/client'

interface OwnedCosmetic {
  id: number
  cosmetic_id: number
  cosmetic_type: string
  is_equipped: boolean
  cosmetics: {
    slug: string
    name: string
    type: string
    rarity: string
    image_url: string | null
  } | null
}

const TYPE_LABELS: Record<string, string> = {
  badge:        'Badges',
  avatar:       'Avatars',
  avatar_frame: "Cadres d'avatar",
  avatar_anim:  'Avatars animés',
}

export default function EquipmentPanel() {
  const { theme } = useTheme()
  const c = theme === 'mythic'
  const supabase = createClient()

  const [items, setItems] = useState<OwnedCosmetic[]>([])
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState<Record<number, boolean>>({})
  const [badgeLimitError, setBadgeLimitError] = useState(false)

  const accent = c ? '#EF9F27' : '#7F77DD'
  const border = c ? 'rgba(186,117,23,0.2)' : '#27272A'

  useEffect(() => { loadInventory() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadInventory() {
    setLoading(true)
    const { data } = await supabase
      .from('user_cosmetics')
      .select('id, cosmetic_id, cosmetic_type, is_equipped, cosmetics(slug, name, type, rarity, image_url)')
      .order('cosmetic_type', { ascending: true })
    if (data) setItems(data as unknown as OwnedCosmetic[])
    setLoading(false)
  }

  async function toggleEquip(item: OwnedCosmetic) {
    if (acting[item.id]) return
    setBadgeLimitError(false)
    setActing(prev => ({ ...prev, [item.id]: true }))

    const fn = item.is_equipped ? 'unequip_cosmetic' : 'equip_cosmetic'
    const { error } = await supabase.rpc(fn, { p_cosmetic_id: item.cosmetic_id })

    if (error?.message?.includes('badge_limit_reached')) {
      setBadgeLimitError(true)
    }

    await loadInventory()
    setActing(prev => ({ ...prev, [item.id]: false }))
  }

  if (loading) {
    return <div style={{ color: 'var(--text-muted)', fontSize: 14, padding: '20px 0' }}>Chargement…</div>
  }

  if (items.length === 0) {
    return (
      <div style={{
        textAlign: 'center', padding: '60px 32px', borderRadius: 10,
        border: `1.5px dashed ${border}`,
      }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>👜</div>
        <h3 style={{ color: '#F5F2FA', fontSize: 17, fontWeight: 600, margin: '0 0 8px' }}>
          Inventaire vide
        </h3>
        <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: 0 }}>
          Achète des cosmétiques dans la boutique pour les équiper ici.
        </p>
      </div>
    )
  }

  const grouped = items.reduce<Record<string, OwnedCosmetic[]>>((acc, item) => {
    const t = item.cosmetic_type
    if (!acc[t]) acc[t] = []
    acc[t].push(item)
    return acc
  }, {})

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      {Object.entries(grouped).map(([type, group]) => {
        const isBadge      = type === 'badge'
        const equippedCount = isBadge ? group.filter(i => i.is_equipped).length : 0
        const badgeAtLimit  = isBadge && equippedCount >= 5

        return (
          <div key={type}>
            <h3 style={{
              fontSize: 13, fontWeight: 600, textTransform: 'uppercase',
              letterSpacing: 1.2, color: 'var(--text-muted)', marginBottom: 4,
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              {TYPE_LABELS[type] ?? type}
              {isBadge && (
                <span style={{
                  fontSize: 11, fontWeight: 500, textTransform: 'none',
                  letterSpacing: 0, color: badgeAtLimit ? accent : 'var(--text-dim)',
                }}>
                  {equippedCount}/5
                </span>
              )}
            </h3>

            {/* Message limite badges */}
            {isBadge && badgeLimitError && (
              <div style={{
                fontSize: 11, color: accent, marginBottom: 8,
                padding: '5px 10px', borderRadius: 6,
                background: c ? 'rgba(186,117,23,0.08)' : 'rgba(127,119,221,0.08)',
                border: `1px solid ${c ? 'rgba(186,117,23,0.2)' : 'rgba(127,119,221,0.2)'}`,
              }}>
                5 badges max — retire un badge avant d&apos;en équiper un autre.
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
              {group.map(item => {
                const canEquip = !item.is_equipped && (!isBadge || !badgeAtLimit)
                const isDisabled = acting[item.id] || (!item.is_equipped && isBadge && badgeAtLimit)

                return (
                  <div key={item.id} style={{
                    display: 'flex', alignItems: 'center', gap: 14,
                    padding: '10px 14px', borderRadius: 8,
                    border: `1px solid ${item.is_equipped
                      ? (c ? 'rgba(186,117,23,0.4)' : 'rgba(127,119,221,0.4)')
                      : border}`,
                    background: item.is_equipped
                      ? (c ? 'rgba(186,117,23,0.07)' : 'rgba(127,119,221,0.07)')
                      : 'rgba(255,255,255,0.02)',
                  }}>
                    {/* Miniature */}
                    <div style={{
                      width: 40, height: 40, borderRadius: 6, flexShrink: 0, overflow: 'hidden',
                      background: 'rgba(255,255,255,0.05)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {item.cosmetics?.image_url
                        ? <img src={item.cosmetics.image_url} alt={item.cosmetics.name ?? ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : <span style={{ fontSize: 18 }}>🐉</span>
                      }
                    </div>

                    {/* Nom */}
                    <div style={{ flex: 1 }}>
                      <span style={{ fontSize: 14, fontWeight: 500, color: '#F5F2FA' }}>
                        {item.cosmetics?.name ?? '—'}
                      </span>
                      {item.is_equipped && (
                        <span style={{
                          marginLeft: 8, fontSize: 10, fontWeight: 600,
                          textTransform: 'uppercase', letterSpacing: 0.8, color: accent,
                        }}>Équipé</span>
                      )}
                    </div>

                    {/* Bouton */}
                    <button
                      onClick={() => toggleEquip(item)}
                      disabled={isDisabled}
                      style={{
                        padding: '6px 14px', borderRadius: 7, fontSize: 12, fontWeight: 600,
                        fontFamily: 'inherit',
                        cursor: isDisabled ? (acting[item.id] ? 'wait' : 'not-allowed') : 'pointer',
                        border: `1px solid ${item.is_equipped ? border : canEquip ? accent : border}`,
                        background: item.is_equipped ? 'transparent'
                          : canEquip ? (c ? 'rgba(186,117,23,0.12)' : 'rgba(127,119,221,0.1)') : 'transparent',
                        color: item.is_equipped ? 'var(--text-muted)'
                          : canEquip ? accent : 'var(--text-dim)',
                        opacity: isDisabled && !item.is_equipped ? 0.45 : 1,
                        transition: 'all 0.15s',
                      }}
                    >
                      {acting[item.id] ? '…' : item.is_equipped ? 'Retirer' : 'Équiper'}
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
