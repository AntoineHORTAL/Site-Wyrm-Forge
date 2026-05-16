'use client'

import Image from 'next/image'
import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useTheme } from '@/components/providers/ThemeProvider'
import { tabGroups } from '@/components/dashboard/Dashboard'
import type { DashTab } from '@/app/page'

function DropdownItem({ label, icon, onClick, danger, hoverBg }: {
  label: string; icon: React.ReactNode; onClick: () => void
  danger?: boolean; hoverBg: string
}) {
  const [hovered, setHovered] = useState(false)
  return (
    <button onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        width: '100%', padding: '11px 16px',
        background: hovered ? hoverBg : 'transparent', border: 'none',
        color: danger ? '#E24B4A' : hovered ? '#F5F2FA' : 'var(--text-muted)',
        fontSize: 14, cursor: 'pointer', fontFamily: 'inherit',
        textAlign: 'left', transition: 'background 0.1s, color 0.1s',
      }}>
      {icon}{label}
    </button>
  )
}

const CertifiedBadge = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-label="Compte certifié" style={{ flexShrink: 0, display: 'block' }}>
    <circle cx="12" cy="12" r="10" fill="#3B82F6"/>
    <path d="M8 12.5l2.5 2.5 5.5-6" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
)

interface NavProps {
  mode: 'visitor' | 'user'
  username?: string
  tier?: string
  isAdmin?: boolean
  certified?: boolean
  onLogin?: () => void
  onLogout?: () => void
  activeTab?: DashTab
  onTabChange?: (tab: DashTab) => void
}

const TIER_ORDER = ['apprenti', 'forgeron', 'maître', 'légion', 'architecte', 'architecte+']

export default function Nav({ mode, username, tier, isAdmin, certified, onLogin, onLogout, activeTab, onTabChange }: NavProps) {
  const { theme, setTheme } = useTheme()
  const c = theme === 'mythic'
  const isProTier = TIER_ORDER.indexOf(tier ?? 'apprenti') >= TIER_ORDER.indexOf('maître')
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const router = useRouter()

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
    setDrawerOpen(false)
  }

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node))
        setDropdownOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  useEffect(() => {
    document.body.style.overflow = drawerOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [drawerOpen])

  const ThemeToggle = () => (
    <div style={{
      display: 'inline-flex', alignItems: 'center', width: 'fit-content',
      background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: 100, padding: 3, gap: 2,
    }}>
      {(['mythic', 'classic'] as const).map(t => (
        <button key={t} onClick={() => setTheme(t)} style={{
          padding: '5px 12px',
          background: theme === t ? (theme === 'classic' ? '#FAFAFA' : 'rgba(127,119,221,0.3)') : 'transparent',
          border: 'none',
          color: theme === t ? (theme === 'classic' ? '#09090B' : '#FAFAFA') : 'rgba(255,255,255,0.5)',
          fontSize: 12, fontWeight: 500, cursor: 'pointer',
          borderRadius: 100, transition: 'all 0.2s', fontFamily: 'inherit',
        }}>
          {t === 'mythic' ? 'Mythique' : 'Classique'}
        </button>
      ))}
    </div>
  )

  return (
    <>
      <nav style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '12px 32px', backdropFilter: 'blur(8px)',
        position: 'sticky', top: 0, zIndex: 50, background: 'var(--nav-bg)',
        borderBottom: c ? '1px solid rgba(186,117,23,0.2)' : '1px solid #1F1F23',
      }}>
        {/* Logo */}
        <div onClick={() => { window.scrollTo({ top: 0, behavior: 'smooth' }); setDrawerOpen(false) }}
          style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
          <Image src="/wyrm-logo.ico" alt="Wyrm Forge" width={38} height={38}
            style={{ borderRadius: 8, objectFit: 'cover' }} />
          <span className="font-mythic" style={{ fontSize: 18 }}>
            Wyrm <span className="accent-text">Forge</span>
          </span>
        </div>

        {/* ── DESKTOP right side ── */}
        <div className="nav-desktop" style={{ gap: 20, alignItems: 'center', fontSize: 14 }}>
          <ThemeToggle />
          {mode === 'visitor' ? (
            <>
              <a onClick={() => scrollTo('features')} style={{ color: 'var(--text-muted)', textDecoration: 'none', cursor: 'pointer' }}>Fonctionnalités</a>
              <a onClick={() => scrollTo('pricing')} style={{ color: 'var(--text-muted)', textDecoration: 'none', cursor: 'pointer' }}>Tarifs</a>
              <a onClick={onLogin} style={{ color: 'var(--text-muted)', textDecoration: 'none', cursor: 'pointer' }}>Connexion</a>
              <a
                href="https://github.com/AdminWyrmForge/wyrm-forge/releases/latest/download/WyrmForge.exe"
                download
                style={{
                  background: c ? 'linear-gradient(135deg, #7F77DD 0%, #534AB7 100%)' : '#FAFAFA',
                  color: c ? 'white' : '#09090B',
                  padding: c ? '8px 18px' : '7px 14px',
                  borderRadius: 8, border: 'none',
                  fontSize: c ? 14 : 13, fontWeight: 500, cursor: 'pointer',
                  textDecoration: 'none', display: 'inline-block',
                }}
              >Télécharger</a>
            </>
          ) : (
            <div ref={dropdownRef} style={{ position: 'relative' }}>
              <div onClick={() => setDropdownOpen(v => !v)} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                background: 'rgba(127,119,221,0.15)',
                border: `1px solid ${dropdownOpen ? 'rgba(127,119,221,0.6)' : 'rgba(127,119,221,0.3)'}`,
                padding: '6px 14px', borderRadius: 8, cursor: 'pointer',
                transition: 'border-color 0.15s', userSelect: 'none',
              }}>
                <div style={{
                  width: 24, height: 24, borderRadius: '50%',
                  background: 'linear-gradient(135deg, #7F77DD, #BA7517)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 600, color: 'white', flexShrink: 0,
                }}>{username?.slice(0, 2).toUpperCase() || 'SK'}</div>
                <div>
                  <div style={{ fontSize: 13, color: '#FAFAFA', display: 'flex', alignItems: 'center', gap: 5 }}>
                    {username || 'SkyKnight'}
                    {certified && <CertifiedBadge size={13} />}
                  </div>
                  <div style={{ fontSize: 10, color: c ? '#BA7517' : '#7F77DD', textTransform: 'uppercase', letterSpacing: 1 }}>
                    {tier || 'Apprenti'}
                  </div>
                </div>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                  style={{ color: 'var(--text-dim)', transform: dropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s', marginLeft: 4 }}>
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </div>
              {dropdownOpen && (
                <div style={{
                  position: 'absolute', top: 'calc(100% + 8px)', right: 0, minWidth: 160,
                  background: c ? '#150828' : '#18181B',
                  border: `1px solid ${c ? 'rgba(186,117,23,0.25)' : '#27272A'}`,
                  borderRadius: 10, boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                  overflow: 'hidden', zIndex: 60, animation: 'fadeIn 0.12s ease',
                }}>
                  <DropdownItem label="Profil"
                    icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>}
                    onClick={() => { setDropdownOpen(false); window.location.assign('/profil') }}
                    hoverBg={c ? 'rgba(255,255,255,0.05)' : '#27272A'} />
                  <DropdownItem label="Déconnexion"
                    icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>}
                    onClick={() => { setDropdownOpen(false); onLogout?.() }}
                    danger hoverBg={c ? 'rgba(255,255,255,0.05)' : '#27272A'} />
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── HAMBURGER (mobile only) ── */}
        <button className="nav-hamburger-btn" onClick={() => setDrawerOpen(v => !v)} aria-label="Menu"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text)', padding: 6, alignItems: 'center', justifyContent: 'center' }}>
          {drawerOpen ? (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          ) : (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
          )}
        </button>
      </nav>

      {/* ── MOBILE DRAWER ── */}
      {drawerOpen && (
        <>
          <div onClick={() => setDrawerOpen(false)} style={{
            position: 'fixed', inset: 0, zIndex: 80,
            background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
          }} />

          <div style={{
            position: 'fixed', top: 0, right: 0, bottom: 0,
            width: 'min(300px, 85vw)',
            background: c ? '#0D0620' : '#18181B',
            borderLeft: `1px solid ${c ? 'rgba(186,117,23,0.2)' : '#27272A'}`,
            zIndex: 90, display: 'flex', flexDirection: 'column',
            animation: 'drawerIn 0.22s cubic-bezier(0.4,0,0.2,1)',
            overflowY: 'auto',
          }}>
            {/* Drawer header */}
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '16px 20px',
              borderBottom: `1px solid ${c ? 'rgba(186,117,23,0.15)' : '#27272A'}`,
              flexShrink: 0,
            }}>
              <span className="font-mythic" style={{ fontSize: 16, color: '#F5F2FA' }}>
                Wyrm <span className="accent-text">Forge</span>
              </span>
              <button onClick={() => setDrawerOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', padding: 4 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>

            {/* ── USER INFO ── */}
            {mode === 'user' && (
              <div style={{
                margin: '16px 16px 0',
                padding: '12px 14px',
                background: 'rgba(127,119,221,0.1)',
                border: '1px solid rgba(127,119,221,0.25)',
                borderRadius: 10,
                display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0,
              }}>
                <div style={{
                  width: 36, height: 36, borderRadius: '50%',
                  background: 'linear-gradient(135deg, #7F77DD, #BA7517)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 13, fontWeight: 600, color: 'white', flexShrink: 0,
                }}>{username?.slice(0, 2).toUpperCase() || 'SK'}</div>
                <div>
                  <div style={{ fontSize: 14, color: '#FAFAFA', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
                    {username || 'SkyKnight'}
                    {certified && <CertifiedBadge size={14} />}
                  </div>
                  <div style={{ fontSize: 11, color: c ? '#BA7517' : '#7F77DD', textTransform: 'uppercase', letterSpacing: 1 }}>{tier || 'Apprenti'}</div>
                </div>
              </div>
            )}

            {/* ── DASHBOARD NAVIGATION (user) ── */}
            {mode === 'user' && onTabChange && (
              <div style={{ flex: 1, padding: '12px 0', overflowY: 'auto' }}>
                {/* Admin shortcut */}
                {isAdmin && (
                  <>
                    <DrawerTabBtn
                      tab={{ id: 'admin', label: 'Administration', shortLabel: 'Admin', icon: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg> }}
                      active={activeTab === 'admin'} c={c}
                      onClick={() => { onTabChange('admin'); setDrawerOpen(false) }}
                      admin
                    />
                    <div style={{ height: 1, background: c ? 'rgba(186,117,23,0.15)' : '#27272A', margin: '6px 16px 8px' }} />
                  </>
                )}

                {tabGroups.map((group, gi) => (
                  <div key={gi}>
                    {group.label && (
                      <div style={{ fontSize: 11, color: '#71717A', textTransform: 'uppercase', letterSpacing: 1.5, fontWeight: 600, padding: '8px 20px 6px' }}>
                        {group.label}
                      </div>
                    )}
                    {group.tabs.map(tab => (
                      <DrawerTabBtn
                        key={tab.id} tab={tab}
                        active={activeTab === tab.id} c={c}
                        onClick={() => {
                          if (tab.soon) return
                          setDrawerOpen(false)
                          if (tab.href) window.location.assign(tab.href)
                          else onTabChange(tab.id as DashTab)
                        }}
                        locked={!isAdmin && !isProTier && !!tab.locked}
                        soon={tab.soon}
                      />
                    ))}
                    {gi < tabGroups.length - 1 && (
                      <div style={{ height: 1, background: c ? 'rgba(186,117,23,0.15)' : '#27272A', margin: '8px 16px' }} />
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* ── VISITOR NAVIGATION ── */}
            {mode === 'visitor' && (
              <div style={{ flex: 1, padding: '12px 0' }}>
                <DrawerLink label="Fonctionnalités" onClick={() => scrollTo('features')} c={c} />
                <DrawerLink label="Tarifs" onClick={() => scrollTo('pricing')} c={c} />
                <div style={{ height: 1, background: c ? 'rgba(186,117,23,0.15)' : '#27272A', margin: '8px 16px' }} />
                <DrawerLink label="Connexion" onClick={() => { setDrawerOpen(false); onLogin?.() }} c={c} />
              </div>
            )}

            {/* ── BOTTOM SECTION ── */}
            <div style={{ flexShrink: 0, borderTop: `1px solid ${c ? 'rgba(186,117,23,0.15)' : '#27272A'}` }}>
              {/* Theme toggle */}
              <div style={{ padding: '14px 16px' }}>
                <p style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>Thème</p>
                <ThemeToggle />
              </div>

              {mode === 'visitor' && (
                <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <a
                    href="https://github.com/AdminWyrmForge/wyrm-forge/releases/latest/download/WyrmForge.exe"
                    download
                    onClick={() => setDrawerOpen(false)}
                    style={{
                      width: '100%', padding: '13px',
                      background: c ? 'linear-gradient(135deg, #7F77DD 0%, #534AB7 100%)' : '#FAFAFA',
                      color: c ? 'white' : '#09090B',
                      border: 'none', borderRadius: 8,
                      fontSize: 14, fontWeight: 600, cursor: 'pointer',
                      textDecoration: 'none', textAlign: 'center', display: 'block',
                    }}
                  >Télécharger</a>
                  <button onClick={() => { setDrawerOpen(false); onLogin?.() }} style={{
                    width: '100%', padding: '11px',
                    background: 'transparent',
                    color: 'var(--text-muted)',
                    border: `1px solid ${c ? 'rgba(186,117,23,0.3)' : '#3F3F46'}`, borderRadius: 8,
                    fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit',
                  }}>Connexion / Inscription</button>
                </div>
              )}

              {mode === 'user' && (
                <div style={{ padding: '0 16px 16px' }}>
                  <button onClick={() => { setDrawerOpen(false); onLogout?.() }} style={{
                    width: '100%', padding: '11px',
                    background: 'transparent',
                    border: '1px solid rgba(226,75,74,0.35)',
                    borderRadius: 8, color: '#E24B4A',
                    fontSize: 14, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                      <polyline points="16 17 21 12 16 7"/>
                      <line x1="21" y1="12" x2="9" y2="12"/>
                    </svg>
                    Déconnexion
                  </button>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </>
  )
}

/* ── Drawer tab button ── */
function DrawerTabBtn({ tab, active, c, onClick, locked, admin, soon }: {
  tab: { id: DashTab | string; label: string; shortLabel: string; icon: React.ReactNode }
  active: boolean; c: boolean; onClick: () => void; locked?: boolean; admin?: boolean; soon?: boolean
}) {
  const [hovered, setHovered] = useState(false)
  return (
    <button onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        width: '100%', padding: '11px 20px',
        background: active
          ? admin
            ? (c ? 'rgba(186,117,23,0.12)' : 'rgba(226,75,74,0.08)')
            : (c ? 'rgba(127,119,221,0.15)' : 'rgba(127,119,221,0.12)')
          : hovered && !soon ? 'rgba(255,255,255,0.04)' : 'transparent',
        border: 'none',
        borderLeft: `3px solid ${active
          ? (admin ? (c ? '#EF9F27' : '#E24B4A') : (c ? '#BA7517' : '#7F77DD'))
          : 'transparent'}`,
        color: soon || locked ? 'var(--text-dim)'
          : active ? (c ? '#FAC775' : '#FAFAFA')
          : 'var(--text-muted)',
        fontSize: 14, cursor: soon ? 'default' : 'pointer', fontFamily: 'inherit',
        textAlign: 'left', transition: 'background 0.1s, color 0.1s',
        opacity: soon ? 0.5 : 1,
      }}>
      <span style={{ width: 18, height: 18, flexShrink: 0 }}>{tab.icon}</span>
      {tab.label}
      {locked && !soon && (
        <span style={{ marginLeft: 'auto', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, color: c ? '#BA7517' : '#7F77DD' }}>
          Pro
        </span>
      )}
      {soon && (
        <span style={{ marginLeft: 'auto', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-dim)' }}>
          Bientôt
        </span>
      )}
    </button>
  )
}

/* ── Visitor drawer link ── */
function DrawerLink({ label, icon, onClick, c, danger }: {
  label: string; icon?: React.ReactNode; onClick: () => void; c: boolean; danger?: boolean
}) {
  const [hovered, setHovered] = useState(false)
  return (
    <button onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        width: '100%', padding: '13px 20px',
        background: hovered ? (c ? 'rgba(255,255,255,0.05)' : '#27272A') : 'transparent',
        border: 'none',
        color: danger ? '#E24B4A' : hovered ? '#F5F2FA' : 'var(--text-muted)',
        fontSize: 15, cursor: 'pointer', fontFamily: 'inherit',
        textAlign: 'left', transition: 'background 0.1s, color 0.1s',
      }}>
      {icon}{label}
    </button>
  )
}
