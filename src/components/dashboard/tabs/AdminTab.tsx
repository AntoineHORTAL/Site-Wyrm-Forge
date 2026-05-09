'use client'

import { useState, useEffect, useCallback, Fragment } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useTheme } from '@/components/providers/ThemeProvider'

const CertifiedBadge = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-label="Certifié" style={{ flexShrink: 0, display: 'block' }}>
    <circle cx="12" cy="12" r="10" fill="#3B82F6"/>
    <path d="M8 12.5l2.5 2.5 5.5-6" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
)

interface Profile {
  id: string
  username: string
  email?: string
  tier: string
  role: string
  certified: boolean
  tier_expires_at: string | null
  created_at?: string
}

const TIERS = ['apprenti', 'forgeron', 'maître', 'légion', 'architecte', 'architecte+']

const TIER_COLORS: Record<string, string> = {
  'apprenti':    '#A1A1AA',
  'forgeron':    '#5DCAA5',
  'maître':      '#7F77DD',
  'légion':      '#3A8AC9',
  'architecte':  '#BA7517',
  'architecte+': '#EF9F27',
}

const QUICK_DATES = [
  { label: '1 mois',  days: 30 },
  { label: '3 mois',  days: 90 },
  { label: '6 mois',  days: 180 },
  { label: '1 an',    days: 365 },
]

function addDays(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

function formatDate(iso: string | null): string {
  if (!iso) return 'À vie'
  const d = new Date(iso)
  const now = new Date()
  if (d < now) return '⚠ Expiré'
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function AdminTab() {
  const { theme } = useTheme()
  const c = theme === 'mythic'
  const supabase = createClient()

  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]     = useState('')
  const [editId, setEditId]         = useState<string | null>(null)
  const [saving, setSaving]         = useState(false)
  const [successId, setSuccessId]   = useState<string | null>(null)
  const [confirmCertifyId, setConfirmCertifyId] = useState<string | null>(null)

  // Edit state
  const [eTier, setETier]           = useState('')
  const [eLifetime, setELifetime]   = useState(true)
  const [eDate, setEDate]           = useState('')

  const border = c ? 'rgba(186,117,23,0.2)' : '#27272A'
  const bg     = c ? 'rgba(42,21,71,0.4)'   : '#18181B'

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('profiles')
      .select('id, username, email, tier, role, certified, tier_expires_at, created_at')
      .order('created_at', { ascending: false })
    setProfiles(data ?? [])
    setLoading(false)
  }, [supabase])

  useEffect(() => { load() }, [load])

  function startEdit(p: Profile) {
    setEditId(p.id)
    setETier(p.tier)
    setELifetime(p.tier_expires_at === null)
    setEDate(p.tier_expires_at ? p.tier_expires_at.slice(0, 10) : addDays(365))
  }

  async function toggleCertify(p: Profile) {
    setSaving(true)
    await supabase.from('profiles').update({ certified: !p.certified }).eq('id', p.id)
    await load()
    setConfirmCertifyId(null)
    setSaving(false)
    setSuccessId(p.id)
    setTimeout(() => setSuccessId(null), 2500)
  }

  async function save(id: string) {
    setSaving(true)
    await supabase.from('profiles').update({
      tier: eTier,
      tier_expires_at: eLifetime ? null : (eDate ? new Date(eDate).toISOString() : null),
    }).eq('id', id)
    await load()
    setEditId(null)
    setSaving(false)
    setSuccessId(id)
    setTimeout(() => setSuccessId(null), 2500)
  }

  const filtered = profiles.filter(p =>
    p.username.toLowerCase().includes(search.toLowerCase()) ||
    (p.email ?? '').toLowerCase().includes(search.toLowerCase())
  )

  // Comptes avec expiration définie uniquement (hors "à vie") pour ne pas biaiser les stats
  const withExpiry = profiles.filter(p => p.tier_expires_at !== null && p.role !== 'admin')

  const stats = {
    total:      profiles.length,
    certified:  profiles.filter(p => p.certified).length,
    // Abonnés actifs = tier payant + expiration définie + pas encore expirée
    activeSubscribers: withExpiry.filter(p =>
      p.tier !== 'apprenti' && new Date(p.tier_expires_at!) > new Date()
    ).length,
    expiring: withExpiry.filter(p => {
      const exp = new Date(p.tier_expires_at!)
      const soon = new Date(); soon.setDate(soon.getDate() + 14)
      return exp > new Date() && exp < soon
    }).length,
  }

  // Comptage par tier — hors comptes à vie (tier_expires_at = null) et hors admins
  const tierCounts = TIERS.map(t => ({
    tier: t,
    count: withExpiry.filter(p => p.tier === t && new Date(p.tier_expires_at!) > new Date()).length,
  }))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Admin badge */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '12px 18px', borderRadius: 8,
        background: c ? 'rgba(186,117,23,0.08)' : 'rgba(226,75,74,0.06)',
        border: `1px solid ${c ? 'rgba(186,117,23,0.3)' : 'rgba(226,75,74,0.25)'}`,
      }}>
        <span style={{ fontSize: 18 }}>🛡️</span>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: c ? '#FAC775' : '#F5F2FA' }}>
            Panneau d'administration
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
            Accès réservé aux comptes admin — gestion des utilisateurs et abonnements.
          </div>
        </div>
      </div>

      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10 }}>
        {[
          { label: 'Comptes total',    value: stats.total,              color: '#F5F2FA' },
          { label: 'Certifiés',        value: stats.certified,          color: '#3B82F6' },
          { label: 'Abonnés actifs',   value: stats.activeSubscribers,  color: '#5DCAA5' },
          { label: 'Expire < 14j',     value: stats.expiring,           color: stats.expiring > 0 ? '#E24B4A' : 'var(--text-dim)' },
        ].map((k, i) => (
          <div key={i} style={{ padding: '14px 16px', borderRadius: 8, background: bg, border: `1px solid ${border}` }}>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>{k.label}</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: k.color }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Répartition par tier (hors comptes à vie) */}
      <div style={{ padding: '16px 18px', borderRadius: 10, background: bg, border: `1px solid ${border}` }}>
        <div style={{ fontSize: 12, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12, fontWeight: 600 }}>
          Abonnés actifs par tier <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(hors comptes à vie)</span>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {tierCounts.map(({ tier, count }) => (
            <div key={tier} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 14px', borderRadius: 8,
              background: c ? 'rgba(20,10,35,0.5)' : '#0F0F11',
              border: `1px solid ${count > 0 ? `${TIER_COLORS[tier]}40` : border}`,
            }}>
              <span style={{
                width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                background: TIER_COLORS[tier],
                opacity: count > 0 ? 1 : 0.3,
              }} />
              <span style={{ fontSize: 12, color: count > 0 ? TIER_COLORS[tier] : 'var(--text-dim)', textTransform: 'capitalize', fontWeight: 500 }}>
                {tier}
              </span>
              <span style={{ fontSize: 14, fontWeight: 700, color: count > 0 ? '#F5F2FA' : 'var(--text-dim)' }}>
                {count}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Search */}
      <input
        value={search} onChange={e => setSearch(e.target.value)}
        placeholder="🔍 Rechercher par pseudo ou email..."
        style={{
          padding: '10px 14px', borderRadius: 8, fontSize: 13,
          background: c ? 'rgba(20,10,35,0.6)' : '#18181B',
          border: `1px solid ${border}`, color: '#F5F2FA',
          fontFamily: 'inherit', outline: 'none',
        }}
      />

      {/* Table */}
      <div style={{ borderRadius: 10, background: bg, border: `1px solid ${border}`, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-dim)', fontSize: 14 }}>
            Chargement…
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: c ? 'rgba(20,10,35,0.5)' : '#0F0F11' }}>
                  {['Utilisateur', 'Tier', 'Expiration', 'Rôle', 'Actions'].map(h => (
                    <th key={h} style={{
                      padding: '10px 16px', textAlign: 'left',
                      color: 'var(--text-dim)', fontSize: 11,
                      textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600,
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(p => (
                  <Fragment key={p.id}>
                    {/* Main row */}
                    <tr key={p.id} style={{
                      borderTop: `1px solid ${border}`,
                      background: editId === p.id ? (c ? 'rgba(127,119,221,0.05)' : 'rgba(127,119,221,0.04)') : 'transparent',
                    }}>
                      {/* Username */}
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{
                            width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
                            background: p.role === 'admin'
                              ? 'linear-gradient(135deg, #BA7517, #EF9F27)'
                              : 'linear-gradient(135deg, #7F77DD, #534AB7)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 11, fontWeight: 700, color: 'white',
                          }}>{p.username.slice(0, 2).toUpperCase()}</div>
                          <div>
                            <div style={{ color: '#F5F2FA', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 5 }}>
                              {p.username}
                              {p.certified && <CertifiedBadge size={13} />}
                            </div>
                            {p.email && (
                              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 1 }}>{p.email}</div>
                            )}
                          </div>
                          {successId === p.id && (
                            <span style={{ fontSize: 11, color: '#5DCAA5' }}>✓ Sauvegardé</span>
                          )}
                        </div>
                      </td>

                      {/* Tier */}
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{
                          fontSize: 12, fontWeight: 600,
                          color: TIER_COLORS[p.tier] ?? '#A1A1AA',
                          textTransform: 'capitalize',
                        }}>{p.tier}</span>
                      </td>

                      {/* Expiration */}
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{
                          fontSize: 12,
                          color: !p.tier_expires_at ? '#5DCAA5'
                            : new Date(p.tier_expires_at) < new Date() ? '#E24B4A'
                            : 'var(--text-muted)',
                        }}>{formatDate(p.tier_expires_at)}</span>
                      </td>

                      {/* Role */}
                      <td style={{ padding: '12px 16px' }}>
                        {p.role === 'admin' ? (
                          <span style={{
                            fontSize: 11, padding: '3px 8px', borderRadius: 4,
                            background: c ? 'rgba(186,117,23,0.15)' : 'rgba(226,75,74,0.1)',
                            border: `1px solid ${c ? 'rgba(186,117,23,0.4)' : 'rgba(226,75,74,0.3)'}`,
                            color: c ? '#FAC775' : '#E24B4A', textTransform: 'uppercase', letterSpacing: 1,
                          }}>Admin</span>
                        ) : (
                          <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>Utilisateur</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {/* Modifier (non-admin only) */}
                          {p.role !== 'admin' && (
                            <button
                              onClick={() => { editId === p.id ? setEditId(null) : startEdit(p); setConfirmCertifyId(null) }}
                              style={{
                                padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 500,
                                background: editId === p.id ? 'transparent' : (c ? 'rgba(127,119,221,0.15)' : 'rgba(127,119,221,0.12)'),
                                border: `1px solid ${editId === p.id ? border : (c ? 'rgba(127,119,221,0.4)' : '#7F77DD')}`,
                                color: editId === p.id ? 'var(--text-dim)' : (c ? '#FAFAFA' : '#7F77DD'),
                                cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
                              }}
                            >{editId === p.id ? 'Annuler' : 'Modifier'}</button>
                          )}

                          {/* Certifier / Retirer */}
                          {p.role !== 'admin' && (
                            confirmCertifyId === p.id ? (
                              /* Confirmation inline */
                              <div style={{
                                display: 'flex', alignItems: 'center', gap: 6,
                                padding: '4px 10px', borderRadius: 6,
                                background: p.certified
                                  ? 'rgba(226,75,74,0.08)'
                                  : 'rgba(59,130,246,0.08)',
                                border: `1px solid ${p.certified ? 'rgba(226,75,74,0.3)' : 'rgba(59,130,246,0.3)'}`,
                              }}>
                                <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                                  {p.certified ? `Retirer à ${p.username} ?` : `Certifier ${p.username} ?`}
                                </span>
                                <button
                                  onClick={() => toggleCertify(p)}
                                  disabled={saving}
                                  style={{
                                    padding: '3px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                                    background: p.certified ? '#E24B4A' : '#3B82F6',
                                    border: 'none', color: 'white',
                                    cursor: saving ? 'not-allowed' : 'pointer',
                                    opacity: saving ? 0.7 : 1, fontFamily: 'inherit',
                                  }}
                                >{saving ? '…' : 'Confirmer'}</button>
                                <button
                                  onClick={() => setConfirmCertifyId(null)}
                                  style={{
                                    padding: '3px 6px', borderRadius: 4, fontSize: 11,
                                    background: 'transparent', border: `1px solid ${border}`,
                                    color: 'var(--text-dim)', cursor: 'pointer', fontFamily: 'inherit',
                                  }}
                                >✕</button>
                              </div>
                            ) : (
                              <button
                                onClick={() => { setConfirmCertifyId(p.id); setEditId(null) }}
                                style={{
                                  padding: '5px 10px', borderRadius: 6, fontSize: 12, fontWeight: 500,
                                  display: 'flex', alignItems: 'center', gap: 5,
                                  background: p.certified
                                    ? 'rgba(59,130,246,0.12)'
                                    : 'transparent',
                                  border: `1px solid ${p.certified ? 'rgba(59,130,246,0.4)' : border}`,
                                  color: p.certified ? '#3B82F6' : 'var(--text-dim)',
                                  cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
                                }}
                              >
                                {p.certified
                                  ? <><CertifiedBadge size={12} /> Certifié</>
                                  : '◦ Certifier'
                                }
                              </button>
                            )
                          )}
                        </div>
                      </td>
                    </tr>

                    {/* Inline edit row */}
                    {editId === p.id && (
                      <tr key={`edit-${p.id}`} style={{ borderTop: `1px solid ${border}` }}>
                        <td colSpan={5} style={{ padding: '16px 20px' }}>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-end' }}>
                            {/* Tier selector */}
                            <div>
                              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>Tier</div>
                              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                {TIERS.map(t => (
                                  <button key={t} onClick={() => setETier(t)} style={{
                                    padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 500,
                                    border: `1px solid ${eTier === t ? (TIER_COLORS[t] ?? border) : border}`,
                                    background: eTier === t ? `${TIER_COLORS[t]}18` : 'transparent',
                                    color: eTier === t ? (TIER_COLORS[t] ?? '#F5F2FA') : 'var(--text-muted)',
                                    cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
                                    textTransform: 'capitalize',
                                  }}>{t}</button>
                                ))}
                              </div>
                            </div>

                            {/* Expiration */}
                            <div>
                              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>Expiration</div>
                              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                                <button onClick={() => setELifetime(true)} style={{
                                  padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                                  border: `1px solid ${eLifetime ? '#5DCAA5' : border}`,
                                  background: eLifetime ? 'rgba(93,202,165,0.12)' : 'transparent',
                                  color: eLifetime ? '#5DCAA5' : 'var(--text-muted)',
                                  cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
                                }}>♾ À vie</button>

                                <button onClick={() => setELifetime(false)} style={{
                                  padding: '6px 14px', borderRadius: 6, fontSize: 12,
                                  border: `1px solid ${!eLifetime ? (c ? '#BA7517' : '#7F77DD') : border}`,
                                  background: !eLifetime ? (c ? 'rgba(186,117,23,0.12)' : 'rgba(127,119,221,0.12)') : 'transparent',
                                  color: !eLifetime ? (c ? '#FAC775' : '#FAFAFA') : 'var(--text-muted)',
                                  cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
                                }}>📅 Date</button>

                                {!eLifetime && (
                                  <>
                                    {QUICK_DATES.map(q => (
                                      <button key={q.label} onClick={() => setEDate(addDays(q.days))} style={{
                                        padding: '5px 10px', borderRadius: 6, fontSize: 11,
                                        border: `1px solid ${border}`,
                                        background: 'transparent', color: 'var(--text-muted)',
                                        cursor: 'pointer', fontFamily: 'inherit',
                                      }}>{q.label}</button>
                                    ))}
                                    <input
                                      type="date" value={eDate}
                                      onChange={e => setEDate(e.target.value)}
                                      style={{
                                        padding: '5px 10px', borderRadius: 6, fontSize: 12,
                                        background: c ? 'rgba(20,10,35,0.6)' : '#27272A',
                                        border: `1px solid ${border}`, color: '#F5F2FA',
                                        fontFamily: 'inherit', outline: 'none',
                                        colorScheme: 'dark',
                                      }}
                                    />
                                  </>
                                )}
                              </div>
                            </div>

                            {/* Save */}
                            <button
                              onClick={() => save(p.id)}
                              disabled={saving}
                              style={{
                                padding: '8px 20px', borderRadius: 6, fontSize: 13, fontWeight: 600,
                                background: 'linear-gradient(135deg, #7F77DD, #534AB7)',
                                border: 'none', color: 'white',
                                cursor: saving ? 'not-allowed' : 'pointer',
                                opacity: saving ? 0.7 : 1,
                                fontFamily: 'inherit', flexShrink: 0,
                              }}
                            >{saving ? '…' : 'Sauvegarder'}</button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
