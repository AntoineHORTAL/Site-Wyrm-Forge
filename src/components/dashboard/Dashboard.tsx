'use client'

import { useRouter } from 'next/navigation'
import { useTheme } from '@/components/providers/ThemeProvider'
import AccueilTab from './tabs/AccueilTab'
import OverlayTab from './tabs/OverlayTab'
import TodoTab from './tabs/TodoTab'
import JunglePathTab from './tabs/JunglePathTab'
import BuildsTab from './tabs/BuildsTab'
import StatsTab from './tabs/StatsTab'
import WorkshopBuildsTab from './tabs/WorkshopBuildsTab'
import WorkshopJungleTab from './tabs/WorkshopJungleTab'
import AdminTab from './tabs/AdminTab'
import type { DashTab, UserProfile } from '@/app/page'

/* ── Icons ── */
const IconHome     = () => <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
const IconTodo     = () => <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
const IconStats    = () => <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
const IconOverlay  = () => <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
const IconJungle   = () => <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>
const IconBuilds   = () => <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
const IconWBuild   = () => <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
const IconWJungle  = () => <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
const IconMatchUp  = () => <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
const IconPostGame = () => <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
const IconTournois = () => <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2z"/></svg>
const IconAdmin    = () => <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
const IconChamps   = () => <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="4"/><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><path d="M9 12h6"/></svg>

export type TabDef = {
  id: DashTab | string // tabs externes (href) ont un id libre
  label: string
  shortLabel: string
  icon: React.ReactNode
  locked?: boolean
  soon?: boolean
  // Si défini, le clic navigue vers cette URL au lieu de changer activeTab.
  // Utile pour intégrer des pages full-route dans le menu (ex: /champions).
  href?: string
}

type TabGroup = {
  label?: string
  tabs: TabDef[]
}

export const tabGroups: TabGroup[] = [
  {
    tabs: [
      { id: 'accueil', label: 'Accueil', shortLabel: 'Accueil', icon: <IconHome /> },
    ],
  },
  {
    label: 'Navigation',
    tabs: [
      { id: 'todo',      label: 'To-Do Lists',  shortLabel: 'To-Do',     icon: <IconTodo /> },
      { id: 'stats',     label: 'Stats',         shortLabel: 'Stats',     icon: <IconStats /> },
      { id: 'champions', label: 'Champions',     shortLabel: 'Champions', icon: <IconChamps />, href: '/champions' },
    ],
  },
  {
    label: 'Personnalisation',
    tabs: [
      { id: 'jungle',  label: 'Jungle Path',   shortLabel: 'Jungle',  icon: <IconJungle /> },
      { id: 'builds',  label: 'Builds Items',  shortLabel: 'Builds',  icon: <IconBuilds /> },
    ],
  },
  {
    label: 'Workshop',
    tabs: [
      { id: 'workshop-builds', label: 'Workshop Builds', shortLabel: 'W. Builds', icon: <IconWBuild /> },
      { id: 'workshop-jungle', label: 'Workshop Jungle', shortLabel: 'W. Jungle', icon: <IconWJungle /> },
    ],
  },
  {
    label: 'Analyse IA',
    tabs: [
      { id: 'matchup',  label: 'Match Up',   shortLabel: 'Match Up',  icon: <IconMatchUp />,  locked: true },
      { id: 'postgame', label: 'Post Game',  shortLabel: 'Post Game', icon: <IconPostGame />, locked: true },
    ],
  },
  {
    label: 'Bientôt',
    tabs: [
      { id: 'tournois', label: 'Tournois', shortLabel: 'Tournois', icon: <IconTournois />, soon: true },
    ],
  },
]

/* Flat list for drawer in Nav */
export const dashTabs: TabDef[] = tabGroups.flatMap(g => g.tabs)

const tabTitles: Record<DashTab, { title: string; subtitle: string }> = {
  admin:            { title: 'Administration',   subtitle: 'Gestion des utilisateurs et abonnements' },
  accueil:          { title: 'Accueil',          subtitle: 'Tes 5 dernières parties' },
  todo:             { title: 'To-Do Lists',       subtitle: 'Tes listes de progression' },
  stats:            { title: 'Stats',             subtitle: 'Analyse tes performances' },
  overlay:          { title: 'Overlay Workshop',  subtitle: 'Gère et importe tes overlays' },
  jungle:           { title: 'Jungle Path',       subtitle: 'Crée et partage tes jungle paths' },
  builds:           { title: 'Builds Items',      subtitle: 'Construis et gère tes builds' },
  'workshop-builds':{ title: 'Workshop Builds',   subtitle: 'Builds de la communauté' },
  'workshop-jungle':{ title: 'Workshop Jungle',   subtitle: 'Jungle paths de la communauté' },
  matchup:          { title: 'Match Up',          subtitle: 'Analyse tes matchups en temps réel' },
  postgame:         { title: 'Post Game',         subtitle: 'Analyse détaillée après la partie' },
  tournois:         { title: 'Tournois',          subtitle: 'Bientôt disponible' },
}

interface DashboardProps {
  activeTab: DashTab
  onTabChange: (tab: DashTab) => void
  isAdmin?: boolean
  profile?: UserProfile | null
}

const TIER_ORDER = ['apprenti', 'forgeron', 'maître', 'légion', 'architecte', 'architecte+']

export default function Dashboard({ activeTab, onTabChange, isAdmin = false, profile }: DashboardProps) {
  const { theme } = useTheme()
  const c = theme === 'mythic'
  const router = useRouter()

  // Clic sur un onglet : si href, navigation externe — sinon changement d'activeTab
  const handleTabClick = (tab: TabDef) => {
    if (tab.soon) return
    if (tab.href) { window.location.assign(tab.href); return }
    onTabChange(tab.id as DashTab)
  }
  void router // au cas où on souhaite remplacer par router.push plus tard

  // Tiers qui débloquent les fonctionnalités Pro (maître et au-dessus)
  const userTierIndex = TIER_ORDER.indexOf(profile?.tier ?? 'apprenti')
  const isProTier = userTierIndex >= TIER_ORDER.indexOf('maître')

  return (
    <div className="dash-layout">
      {/* ── SIDEBAR (desktop only) ── */}
      <aside className="dash-sidebar" style={{
        background: 'var(--sidebar-bg)',
        borderRight: `1px solid ${c ? 'rgba(186,117,23,0.2)' : '#1F1F23'}`,
        padding: '20px 0', overflowY: 'auto',
      }}>
        {/* Admin tab — top of sidebar, admins only */}
        {isAdmin && (
          <div style={{ marginBottom: 6 }}>
            <SidebarBtn
              tab={{ id: 'admin', label: 'Administration', shortLabel: 'Admin', icon: <IconAdmin /> }}
              active={activeTab === 'admin'} c={c}
              onClick={() => onTabChange('admin')}
              admin
            />
            <div style={{ height: 1, background: c ? 'rgba(186,117,23,0.15)' : '#27272A', margin: '6px 16px 8px' }} />
          </div>
        )}

        {tabGroups.map((group, gi) => (
          <div key={gi} style={{ marginBottom: 6 }}>
            {group.label && (
              <div style={{
                fontSize: 10, textTransform: 'uppercase', letterSpacing: 1.5,
                color: '#71717A', padding: '10px 16px 4px 28px', fontWeight: 600,
              }}>{group.label}</div>
            )}
            {group.tabs.map(tab => (
              <SidebarBtn
                key={tab.id} tab={tab}
                active={activeTab === tab.id} c={c}
                onClick={() => handleTabClick(tab)}
                unlocked={isAdmin || isProTier}
              />
            ))}
          </div>
        ))}
      </aside>

      {/* ── MAIN CONTENT ── */}
      <main className="dash-main">
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginBottom: 24, paddingBottom: 16,
          borderBottom: `1px solid ${c ? 'rgba(186,117,23,0.15)' : '#1F1F23'}`,
        }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 600, color: '#F5F2FA', margin: 0 }}>
              {tabTitles[activeTab].title}
            </h1>
            <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: '4px 0 0' }}>
              {tabTitles[activeTab].subtitle}
            </p>
          </div>
        </div>

        {activeTab === 'admin'            && <AdminTab />}
        {activeTab === 'accueil'          && <AccueilTab />}
        {activeTab === 'todo'             && <TodoTab />}
        {activeTab === 'stats'            && <StatsTab />}
        {activeTab === 'jungle'           && <JunglePathTab />}
        {activeTab === 'builds'           && <BuildsTab />}
        {activeTab === 'workshop-builds'  && <WorkshopBuildsTab />}
        {activeTab === 'workshop-jungle'  && <WorkshopJungleTab />}

        {/* Locked: Analyse IA — déverrouillé pour admin et tiers maître+ */}
        {(activeTab === 'matchup' || activeTab === 'postgame') && (
          (isAdmin || isProTier)
            ? <DevPreviewScreen title={tabTitles[activeTab].title} c={c} isAdmin={isAdmin} />
            : <LockedScreen title={tabTitles[activeTab].title} subtitle={tabTitles[activeTab].subtitle} c={c} badge="Analyse IA" />
        )}

        {/* Soon: Tournois */}
        {activeTab === 'tournois' && (
          <SoonScreen title="Tournois" c={c} />
        )}
      </main>
    </div>
  )
}

/* ── Sidebar button ── */
function SidebarBtn({ tab, active, c, onClick, unlocked, admin }: {
  tab: TabDef | { id: DashTab; label: string; shortLabel: string; icon: React.ReactNode }
  active: boolean; c: boolean; onClick: () => void
  unlocked?: boolean; admin?: boolean
}) {
  const t = tab as TabDef
  const isLocked = !unlocked && t.locked
  const isSoon   = t.soon

  return (
    <button onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 11,
      width: '100%', padding: '8px 16px 8px 20px',
      background: active
        ? admin
          ? (c ? 'rgba(186,117,23,0.15)' : 'rgba(226,75,74,0.1)')
          : (c ? 'linear-gradient(135deg, rgba(127,119,221,0.25), rgba(83,74,183,0.25))' : 'rgba(127,119,221,0.12)')
        : 'transparent',
      border: 'none',
      borderLeft: `3px solid ${active ? (admin ? (c ? '#EF9F27' : '#E24B4A') : (c ? '#BA7517' : '#7F77DD')) : 'transparent'}`,
      color: isSoon ? 'var(--text-dim)'
        : isLocked ? 'var(--text-dim)'
        : active ? (admin ? (c ? '#FAC775' : '#F5F2FA') : (c ? '#FAC775' : '#FAFAFA'))
        : 'var(--text-muted)',
      fontSize: 13, cursor: isSoon ? 'default' : 'pointer',
      textAlign: 'left', borderRadius: '0 8px 8px 0',
      transition: 'all 0.15s', fontFamily: 'inherit',
      opacity: isSoon ? 0.5 : 1,
    }}>
      <span style={{ width: 17, height: 17, flexShrink: 0 }}>{tab.icon}</span>
      <span style={{ flex: 1 }}>{tab.label}</span>
      {isLocked && (
        <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, color: c ? '#BA7517' : '#7F77DD', marginLeft: 4 }}>
          Pro
        </span>
      )}
      {isSoon && (
        <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-dim)', marginLeft: 4 }}>
          Bientôt
        </span>
      )}
    </button>
  )
}

/* ── Locked screen ── */
function LockedScreen({ title, subtitle, c, badge }: { title: string; subtitle: string; c: boolean; badge?: string }) {
  return (
    <div style={{
      textAlign: 'center', padding: '60px 32px', borderRadius: 12,
      border: `2px dashed ${c ? 'rgba(186,117,23,0.3)' : 'rgba(127,119,221,0.3)'}`,
    }}>
      {badge && (
        <div style={{
          display: 'inline-block', marginBottom: 16,
          padding: '4px 12px', borderRadius: 20, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1,
          background: c ? 'rgba(186,117,23,0.15)' : 'rgba(127,119,221,0.15)',
          border: `1px solid ${c ? 'rgba(186,117,23,0.4)' : 'rgba(127,119,221,0.4)'}`,
          color: c ? '#BA7517' : '#7F77DD',
        }}>{badge}</div>
      )}
      <div style={{ fontSize: 36, marginBottom: 16 }}>🔒</div>
      <h3 style={{ fontSize: 20, fontWeight: 600, color: '#F5F2FA', marginBottom: 8 }}>{title}</h3>
      <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: '0 auto 24px', maxWidth: 400 }}>
        {subtitle}. Passe à un plan supérieur pour débloquer cette fonctionnalité.
      </p>
      <button className="wf-btn-primary" style={{ margin: '0 auto' }}>Voir les plans</button>
    </div>
  )
}

/* ── Dev preview screen ── */
function DevPreviewScreen({ title, c, isAdmin }: { title: string; c: boolean; isAdmin: boolean }) {
  return (
    <div style={{
      textAlign: 'center', padding: '60px 32px', borderRadius: 12,
      border: `2px dashed ${c ? 'rgba(186,117,23,0.3)' : 'rgba(93,202,165,0.25)'}`,
    }}>
      <div style={{
        display: 'inline-block', marginBottom: 16, padding: '4px 12px', borderRadius: 20,
        fontSize: 11, textTransform: 'uppercase', letterSpacing: 1,
        background: c ? 'rgba(186,117,23,0.12)' : 'rgba(93,202,165,0.1)',
        border: `1px solid ${c ? 'rgba(186,117,23,0.4)' : 'rgba(93,202,165,0.35)'}`,
        color: c ? '#BA7517' : '#5DCAA5',
      }}>{isAdmin ? 'Accès Admin' : 'Analyse IA'}</div>
      <div style={{ fontSize: 32, marginBottom: 12 }}>🔬</div>
      <h3 style={{ fontSize: 20, fontWeight: 600, color: '#F5F2FA', marginBottom: 8 }}>{title} — En développement</h3>
      <p style={{ color: 'var(--text-muted)', fontSize: 14, maxWidth: 420, margin: '0 auto' }}>
        Cette fonctionnalité est en cours de développement et sera disponible prochainement.
      </p>
    </div>
  )
}

/* ── Soon screen ── */
function SoonScreen({ title, c }: { title: string; c: boolean }) {
  return (
    <div style={{
      textAlign: 'center', padding: '60px 32px', borderRadius: 12,
      border: `2px dashed ${c ? 'rgba(186,117,23,0.25)' : '#27272A'}`,
    }}>
      <div style={{ fontSize: 36, marginBottom: 16 }}>🏆</div>
      <h3 style={{ fontSize: 20, fontWeight: 600, color: '#F5F2FA', marginBottom: 8 }}>{title}</h3>
      <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: '0 auto 8px', maxWidth: 400 }}>
        Cette fonctionnalité est en cours de développement.
      </p>
      <p style={{ color: 'var(--text-dim)', fontSize: 13 }}>Reste à l'affût — ça arrive bientôt.</p>
    </div>
  )
}
