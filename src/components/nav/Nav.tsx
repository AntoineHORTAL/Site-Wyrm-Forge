'use client'

import Image from 'next/image'
import { useState, useRef, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useTheme } from '@/components/providers/ThemeProvider'
import { useLanguage } from '@/components/providers/LanguageProvider'
import LanguageSwitch from '@/components/landing/LanguageSwitch'
import { tabGroups } from '@/components/dashboard/Dashboard'
import type { DashTab } from '@/app/page'
import { WINDOWS_DOWNLOAD_URL } from '@/lib/download'

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
  balance?: number
  balanceLoading?: boolean
  ecaillesEnabled?: boolean
  onNavigateToForge?: () => void
}

const TIER_ORDER = ['apprenti', 'forgeron', 'maître', 'légion', 'architecte', 'architecte+']

/* Sections de la vitrine visées par les liens centrés + le scroll-spy. Les id sont
   structurels (ils doivent matcher les `id` des <section>) — seuls les libellés sont
   traduits, via `nav.links` dans src/locales/landing.ts, dans CE MÊME ORDRE. */
const NAV_SECTION_IDS = ['accueil', 'features', 'communaute', 'tarifs', 'telecharger', 'faq'] as const

export default function Nav({ mode, username, tier, isAdmin, certified, onLogin, onLogout, activeTab, onTabChange, balance, balanceLoading, ecaillesEnabled, onNavigateToForge }: NavProps) {
  const { theme } = useTheme()
  const c = theme === 'mythic'
  // Vitrine uniquement : seuls les libellés du mode visiteur sont traduits, le
  // dashboard connecté reste en français.
  const { t } = useLanguage()
  const isProTier = TIER_ORDER.indexOf(tier ?? 'apprenti') >= TIER_ORDER.indexOf('maître')
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [activeSection, setActiveSection] = useState<string | null>(null)
  const [dot, setDot] = useState<{ x: number; visible: boolean }>({ x: 0, visible: false })
  const dropdownRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const linkEls = useRef<Record<string, HTMLButtonElement | null>>({})
  const router = useRouter()
  const pathname = usePathname()

  // Liens centrés de la vitrine. Scroll-spy actif uniquement là où les sections existent.
  const navLinks = NAV_SECTION_IDS.map((id, i) => ({ id, label: t.nav.links[i] }))
  const spyEnabled = mode === 'visitor' && pathname === '/'

  // Scroll doux sur la home, ancre cross-page (/#features) ailleurs
  const goToSection = (id: string) => {
    setDrawerOpen(false)
    if (pathname === '/') document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
    else router.push(`/#${id}`)
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

  // Effets de scroll regroupés en UN seul listener (throttle RAF) :
  //  - fond du header : transparent en haut, --nav-bg + blur au-delà de 64px
  //  - scroll-spy : section active = celle qui contient la ligne-sonde (40% du viewport).
  //    Méthode déterministe par rects → fiable quelles que soient les hauteurs de section
  //    (Hero plein écran, FinalCTA court), et garantit l'ordre accueil→…→faq sans zone morte.
  useEffect(() => {
    let ticking = false
    const update = () => {
      setScrolled(window.scrollY > 64)
      if (!spyEnabled) { setActiveSection(null); return }
      const probe = window.innerHeight * 0.4
      let current: string | null = null
      for (const l of navLinks) {
        const el = document.getElementById(l.id)
        if (!el) continue
        const r = el.getBoundingClientRect()
        if (r.top <= probe && r.bottom > probe) { current = l.id; break }
      }
      setActiveSection(current)
    }
    const onScroll = () => {
      if (ticking) return
      ticking = true
      requestAnimationFrame(() => { update(); ticking = false })
    }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [spyEnabled]) // eslint-disable-line react-hooks/exhaustive-deps

  // Position du point indicateur sous le lien actif (recalcul au changement d'état + au resize)
  useEffect(() => {
    function place() {
      const track = trackRef.current
      const link = activeSection ? linkEls.current[activeSection] : null
      if (!track || !link) { setDot(d => ({ ...d, visible: false })); return }
      const lr = link.getBoundingClientRect()
      const tr = track.getBoundingClientRect()
      setDot({ x: lr.left - tr.left + lr.width / 2 - 3, visible: true })
    }
    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [activeSection])

  return (
    <>
      <nav className={`wf-nav${scrolled ? ' wf-nav--scrolled' : ''}`}>
        {/* Logo : clic → page principale.
            - Hors de '/' (champion, profil, match, etc.) : navigation vers /
            - Sur '/' connecté : switch sur l'onglet Accueil
            - Sur '/' visiteur : scroll en haut de la vitrine */}
        <div
          onClick={() => {
            setDrawerOpen(false)
            if (pathname !== '/') { window.location.assign('/'); return }
            if (mode === 'user' && onTabChange) onTabChange('accueil' as DashTab)
            window.scrollTo({ top: 0, behavior: 'smooth' })
          }}
          style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
          <Image src="/wyrm-logo.ico" alt="Wyrm Forge" width={38} height={38}
            style={{ borderRadius: 8, objectFit: 'cover' }} />
          <span className="font-mythic" style={{ fontSize: 18 }}>
            Wyrm <span className="accent-text">Forge</span>
          </span>
        </div>

        {/* ── Liens centrés + scroll-spy (vitrine) ── */}
        {mode === 'visitor' && (
          <div className="nav-center">
            <div className="nav-center-links">
              {navLinks.map(l => (
                <button
                  key={l.id}
                  ref={el => { linkEls.current[l.id] = el }}
                  className="nav-center-link"
                  data-active={activeSection === l.id}
                  onClick={() => goToSection(l.id)}
                >
                  {l.label}
                </button>
              ))}
            </div>
            {/* Barre + point : le point glisse sous la section visible (translateX animé) */}
            <div className="nav-spy-track" ref={trackRef}>
              <div
                className="nav-spy-dot"
                style={{ transform: `translateX(${dot.x}px)`, opacity: dot.visible ? 1 : 0 }}
              />
            </div>
          </div>
        )}

        {/* ── DESKTOP right side ── */}
        <div className="nav-desktop" style={{ gap: 20, alignItems: 'center', fontSize: 14 }}>
          {mode === 'visitor' ? (
            <>
              {/* Bascule FR / EN — vitrine uniquement (le dashboard reste en français) */}
              <LanguageSwitch />
              <a onClick={onLogin} className="nav-login-link" style={{ color: '#fff', textDecoration: 'none', cursor: 'pointer' }}>{t.nav.login}</a>
              <a
                href={WINDOWS_DOWNLOAD_URL}
                download
                className="wf-btn-gold"
                style={{ padding: '8px 18px', fontSize: 14, fontWeight: 500 }}
              >{t.nav.download}</a>
            </>
          ) : (
            <>
              {/* ── Chip Écailles ── visible si feature on (ou admin) */}
              {(ecaillesEnabled || isAdmin) && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '5px 10px 5px 8px', borderRadius: 7,
                    background: c ? 'rgba(186,117,23,0.1)' : 'rgba(127,119,221,0.08)',
                    border: `1px solid ${c ? 'rgba(186,117,23,0.25)' : 'rgba(127,119,221,0.2)'}`,
                    fontSize: 13, fontWeight: 600, color: c ? '#EF9F27' : '#7F77DD',
                    whiteSpace: 'nowrap',
                  }}>
                    {balanceLoading ? '…' : (balance ?? 0).toLocaleString('fr-FR')}<img src="/icons/ecaille.png" alt="Écailles" width={16} height={16} />
                  </div>
                  <button
                    onClick={onNavigateToForge}
                    title="Gagner des Écailles — La Forge"
                    style={{
                      width: 28, height: 28, borderRadius: 7, border: 'none',
                      background: c ? 'rgba(186,117,23,0.15)' : 'rgba(127,119,221,0.12)',
                      color: c ? '#EF9F27' : '#7F77DD',
                      cursor: 'pointer', fontSize: 18, fontWeight: 600, lineHeight: 1,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontFamily: 'inherit',
                    }}
                  >+</button>
                </div>
              )}
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
            </>
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
                {(ecaillesEnabled || isAdmin) && (
                  <button
                    onClick={() => { setDrawerOpen(false); onNavigateToForge?.() }}
                    style={{
                      marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5,
                      background: 'transparent', border: 'none', padding: '2px 4px',
                      color: c ? '#EF9F27' : '#7F77DD',
                      fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                    }}
                  >
                    {balanceLoading ? '…' : (balance ?? 0).toLocaleString('fr-FR')}<img src="/icons/ecaille.png" alt="Écailles" width={15} height={15} />
                    <span style={{ fontSize: 14, lineHeight: 1 }}>+</span>
                  </button>
                )}
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
                    {group.tabs
                      .filter(tab => tab.id !== 'ecailles' || (ecaillesEnabled ?? false) || !!isAdmin)
                      .map(tab => (
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
                {/* « Télécharger » (index 4) est déjà servi par le bouton du bas du drawer */}
                {navLinks
                  .filter(l => l.id !== 'telecharger')
                  .map(l => (
                    <DrawerLink key={l.id} label={l.label} onClick={() => goToSection(l.id)} c={c} />
                  ))}
                <div style={{ height: 1, background: c ? 'rgba(186,117,23,0.15)' : '#27272A', margin: '8px 16px' }} />
                <DrawerLink label={t.nav.login} onClick={() => { setDrawerOpen(false); onLogin?.() }} c={c} />
              </div>
            )}

            {/* ── BOTTOM SECTION ── */}
            <div style={{ flexShrink: 0, borderTop: `1px solid ${c ? 'rgba(186,117,23,0.15)' : '#27272A'}` }}>
              {mode === 'visitor' && (
                <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {/* Bascule FR / EN — pleine largeur, le drawer n'a pas de barre latérale */}
                  <LanguageSwitch full />
                  <a
                    href={WINDOWS_DOWNLOAD_URL}
                    download
                    onClick={() => setDrawerOpen(false)}
                    className="wf-btn-gold"
                    style={{ width: '100%', padding: '13px', fontSize: 14, fontWeight: 600, justifyContent: 'center' }}
                  >{t.nav.download}</a>
                  <button onClick={() => { setDrawerOpen(false); onLogin?.() }} style={{
                    width: '100%', padding: '11px',
                    background: 'transparent',
                    color: 'var(--text-muted)',
                    border: `1px solid ${c ? 'rgba(186,117,23,0.3)' : '#3F3F46'}`, borderRadius: 8,
                    fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit',
                  }}>{t.nav.loginSignup}</button>
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
