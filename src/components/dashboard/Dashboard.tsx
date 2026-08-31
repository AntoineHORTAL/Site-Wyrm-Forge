'use client'

import { useRouter } from 'next/navigation'
import { useTheme } from '@/components/providers/ThemeProvider'
import AccueilTab from './tabs/AccueilTab'
import TodoTab from './tabs/TodoTab'
import JunglePathTab from './tabs/JunglePathTab'
import BuildsTab from './tabs/BuildsTab'
import ScenariosTab from './tabs/ScenariosTab'
import StatsTab from './tabs/StatsTab'
import WorkshopBuildsTab from './tabs/WorkshopBuildsTab'
import WorkshopJungleTab from './tabs/WorkshopJungleTab'
import AdminTab from './tabs/AdminTab'
import PatchNotesTab from './tabs/PatchNotesTab'
import MatchUpTab from './tabs/MatchUpTab'
import PostGameTab from './tabs/PostGameTab'
import EcaillesTab from './tabs/EcaillesTab'
import ConsentBanner from './ConsentBanner'
import DashboardAdRail from '@/components/ads/DashboardAdRail'
import { shouldShowAds } from '@/lib/ads'
import Pricing from '@/components/landing/Pricing'
import { useDashboard } from '@/locales/dashboard'
import type { NavTabId, NavGroupId } from '@/locales/dashboard/nav'
import type { DashTab, UserProfile } from '@/app/page'

/* ── Icons ── */
const IconHome     = () => <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
const IconTodo     = () => <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
const IconStats    = () => <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
const IconJungle   = () => <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>
const IconBuilds   = () => <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
const IconWBuild   = () => <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
const IconWJungle  = () => <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
const IconMatchUp  = () => <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
const IconPostGame = () => <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
const IconTournois = () => <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2z"/></svg>
const IconAdmin    = () => <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
const IconChamps   = () => <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="4"/><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><path d="M9 12h6"/></svg>
const IconScenarios= () => <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6l9-3 9 3"/><path d="M3 6v12l9 3 9-3V6"/><path d="M12 3v18"/><path d="M3 12h18"/></svg>
// Parchemin avec marteau — évoque les notes de forge/patch
const IconPatchNotes = () => <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg>
const IconEcailles = () => <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2z"/><path d="M12 6c-2 3-3 5-1 8"/><path d="M12 6c2 3 3 5 1 8"/><circle cx="12" cy="17" r="1" fill="currentColor"/></svg>

export type TabDef = {
  /**
   * Identifiant TECHNIQUE de l'onglet — jamais traduit. Il pilote l'état
   * (`activeTab`), le deep-link `?tab=` et sert de clé de libellé dans le dico.
   * Typé `NavTabId` : ajouter un onglet ici sans son libellé ne compile pas.
   */
  id: NavTabId
  icon: React.ReactNode
  locked?: boolean
  soon?: boolean
  // Si défini, le clic navigue vers cette URL au lieu de changer activeTab.
  // Utile pour intégrer des pages full-route dans le menu (ex: /champions).
  href?: string
}

type TabGroup = {
  /** Clé du libellé de groupe dans le dico — absente = groupe sans intitulé. */
  id?: NavGroupId
  tabs: TabDef[]
}

/**
 * ⚠️ STRUCTURE SEULEMENT — les libellés vivent dans `src/locales/dashboard/nav.ts`.
 *
 * Ce tableau ne porte plus que du technique : `id`, `icon`, `locked`, `soon`, `href`.
 * C'est ce qui lui permet de rester un `const` de niveau module (donc figé au
 * chargement, donc partageable entre les DEUX barres qui le consomment : la sidebar
 * plus bas et le drawer mobile de `Nav.tsx`, via l'export `dashTabs`) tout en
 * affichant des libellés qui, eux, suivent la langue.
 *
 * Le libellé d'un onglet se lit `dico.nav.tabs[tab.id].label` — même `id` des deux
 * côtés, aucune duplication entre les deux barres. Un onglet ajouté ici sans entrée
 * de dico ne compile pas (`id: NavTabId`).
 */
export const tabGroups: TabGroup[] = [
  {
    tabs: [
      { id: 'accueil', icon: <IconHome /> },
    ],
  },
  {
    id: 'navigation',
    tabs: [
      { id: 'todo',       icon: <IconTodo /> },
      { id: 'stats',      icon: <IconStats /> },
      { id: 'patchnotes', icon: <IconPatchNotes /> },
      { id: 'ecailles',   icon: <IconEcailles /> },
      { id: 'champions',  icon: <IconChamps />, href: '/champions' },
    ],
  },
  {
    id: 'perso',
    tabs: [
      { id: 'jungle',    icon: <IconJungle /> },
      { id: 'builds',    icon: <IconBuilds /> },
      { id: 'scenarios', icon: <IconScenarios />, locked: true },
    ],
  },
  {
    id: 'workshop',
    tabs: [
      { id: 'workshop-builds', icon: <IconWBuild /> },
      { id: 'workshop-jungle', icon: <IconWJungle /> },
    ],
  },
  {
    id: 'ia',
    tabs: [
      // Aucun `locked` sur les deux onglets IA : leur accès est piloté par le
      // budget « Chaleur de la Forge », qui donne déjà un solde à chaque tier
      // (Apprenti 15 crédits ; analyse rapide 6, bilan 6, détaillée 11 sur
      // Haiku). Un badge « Pro » ici mentirait sur l'accès réel.
      // `locked` alimente le badge des DEUX barres de navigation (SidebarBtn
      // desktop + DrawerTabBtn mobile), le retirer ici suffit pour les deux.
      { id: 'matchup',  icon: <IconMatchUp /> },
      { id: 'postgame', icon: <IconPostGame /> },
    ],
  },
  {
    id: 'soon',
    tabs: [
      { id: 'tournois', icon: <IconTournois />, soon: true },
    ],
  },
]

/* Flat list for drawer in Nav */
export const dashTabs: TabDef[] = tabGroups.flatMap(g => g.tabs)

/**
 * En-têtes de la zone de contenu — le CONTENU vit dans le dico
 * (`nav.pageTitles`), cette annotation en prouve la couverture : un `DashTab`
 * ajouté sans son en-tête devient une erreur de compilation ICI, à l'endroit qui
 * connaît l'union, sans que le dico ait à importer `DashTab` (ce qui créerait un
 * cycle page → Dashboard → dico → page).
 *
 * L'onglet caché `tarifs` y figure sans être affiché : Pricing a son propre titre.
 */
type PageTitles = Record<DashTab, { title: string; subtitle: string }>

interface DashboardProps {
  activeTab: DashTab
  onTabChange: (tab: DashTab) => void
  isAdmin?: boolean
  profile?: UserProfile | null
  balance?: number
  balanceLoading?: boolean
  onRefreshBalance?: () => void
  ecaillesEnabled?: boolean
  forgeRequest?: number
}

const TIER_ORDER = ['apprenti', 'forgeron', 'maître', 'légion', 'architecte', 'architecte+']

export default function Dashboard({ activeTab, onTabChange, isAdmin = false, profile, balance = 0, balanceLoading = false, onRefreshBalance, ecaillesEnabled = false, forgeRequest = 0 }: DashboardProps) {
  const { theme } = useTheme()
  const c = theme === 'mythic'
  const router = useRouter()
  const d = useDashboard()
  const tabTitles: PageTitles = d.nav.pageTitles

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

  /**
   * POINT D'INTÉGRATION UNIQUE des emplacements publicitaires.
   *
   * Le dashboard est un routeur d'onglets rendu par un seul composant : brancher
   * la pub ici la met sur TOUT ce qui vit derrière le dashboard, sans qu'aucun
   * onglet ait à s'en occuper et sans risque d'en oublier un. La vitrine
   * publique n'est pas concernée — elle est rendue par la branche `else` de
   * `page.tsx`, qui n'instancie jamais ce composant.
   *
   * Décidé de façon SYNCHRONE au premier rendu, jamais après : `page.tsx`
   * n'affiche `<Dashboard>` qu'une fois `loading` retombé, ce qui garantit que
   * `profile` est déjà résolu ici. La colonne ne peut donc pas apparaître après
   * coup et pousser le contenu (CLS).
   */
  const showAds = shouldShowAds(profile?.tier, isAdmin)

  return (
    <div className={`dash-layout${showAds ? ' dash-layout--ads' : ''}`}>
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
              tab={{ id: 'admin', icon: <IconAdmin /> }}
              label={d.nav.tabs.admin.label}
              badges={d.nav.badges}
              active={activeTab === 'admin'} c={c}
              onClick={() => onTabChange('admin')}
              admin
            />
            <div style={{ height: 1, background: c ? 'rgba(186,117,23,0.15)' : '#27272A', margin: '6px 16px 8px' }} />
          </div>
        )}

        {tabGroups.map((group, gi) => (
          <div key={gi} style={{ marginBottom: 6 }}>
            {group.id && (
              <div style={{
                fontSize: 10, textTransform: 'uppercase', letterSpacing: 1.5,
                color: '#71717A', padding: '10px 16px 4px 28px', fontWeight: 600,
              }}>{d.nav.groups[group.id]}</div>
            )}
            {group.tabs
              .filter(tab => tab.id !== 'ecailles' || ecaillesEnabled || isAdmin)
              .map(tab => (
              <SidebarBtn
                key={tab.id} tab={tab}
                label={d.nav.tabs[tab.id].label}
                badges={d.nav.badges}
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
        {/* Bandeau demande de suivi prac en attente — auto-masqué si aucun dossier pending */}
        <ConsentBanner />

        {/* En-tête standard — masqué pour l'onglet tarifs (Pricing a son propre titre) */}
        {activeTab !== 'tarifs' && (
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
        )}

        {activeTab === 'admin'            && <AdminTab />}
        {activeTab === 'accueil'          && <AccueilTab />}
        {activeTab === 'todo'             && <TodoTab />}
        {activeTab === 'stats'            && <StatsTab />}
        {activeTab === 'jungle'           && <JunglePathTab />}
        {activeTab === 'builds'           && <BuildsTab />}
        {activeTab === 'scenarios'        && (
          (isAdmin || isProTier)
            ? <ScenariosTab />
            : <LockedScreen
                title={tabTitles.scenarios.title}
                subtitle={tabTitles.scenarios.subtitle}
                labels={d.nav.locked}
                c={c} badge={d.nav.badges.pro}
              />
        )}
        {activeTab === 'workshop-builds'  && <WorkshopBuildsTab />}
        {activeTab === 'workshop-jungle'  && <WorkshopJungleTab />}
        {activeTab === 'patchnotes'       && <PatchNotesTab />}
        {activeTab === 'ecailles'         && (
          <EcaillesTab
            isAdmin={isAdmin}
            balance={balance}
            balanceLoading={balanceLoading}
            onRefreshBalance={onRefreshBalance ?? (() => {})}
            ecaillesEnabled={ecaillesEnabled}
            forgeRequest={forgeRequest}
          />
        )}

        {/* Onglet tarifs (caché) — réutilise la section Pricing de la landing telle quelle */}
        {activeTab === 'tarifs' && <Pricing />}

        {/* Onglets IA — ouverts à TOUS les tiers, aucun gating d'affichage.
            Le tier est déjà pris en compte deux fois côté serveur par « Chaleur
            de la Forge » (budget hebdo ET modèle : Apprenti/Forgeron 15/65
            crédits sur Haiku, Maître+ 135 sur Sonnet). Doubler ça d'un verrou
            d'affichage rendait les features invisibles aux tiers qui ont
            pourtant les crédits pour s'en servir. Le vrai garde est
            `canAfford` / `canAffordPostGame`, qui compare le solde au coût de
            l'action demandée — un solde non nul ne finance pas tout. */}
        {activeTab === 'matchup'  && <MatchUpTab />}
        {/* Post Game : une seule des 9 combinaisons prévues (simple × perso). */}
        {activeTab === 'postgame' && <PostGameTab profile={profile} />}

        {/* Soon: Tournois */}
        {activeTab === 'tournois' && (
          <SoonScreen title="Tournois" c={c} />
        )}
      </main>

      {/* ── COLONNE PUBLICITAIRE (palier gratuit uniquement) ──
          Enfant DIRECT de `.dash-layout` : c'est ce qui en fait la troisième
          piste de la grille, et ce qui la fait disparaître à l'impression via
          la règle `.dash-layout > :not(.dash-main)` déjà en place. */}
      {showAds && <DashboardAdRail onSeePricing={() => onTabChange('tarifs')} />}
    </div>
  )
}

/* ── Sidebar button ── */
function SidebarBtn({ tab, label, badges, active, c, onClick, unlocked, admin }: {
  tab: TabDef
  /** Libellé déjà résolu par l'appelant (dico ↔ `tab.id`) — jamais lu depuis `tab`. */
  label: string
  badges: { pro: string; soon: string }
  active: boolean; c: boolean; onClick: () => void
  unlocked?: boolean; admin?: boolean
}) {
  const isLocked = !unlocked && tab.locked
  const isSoon   = tab.soon

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
      <span style={{ flex: 1 }}>{label}</span>
      {isLocked && (
        <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, color: c ? '#BA7517' : '#7F77DD', marginLeft: 4 }}>
          {badges.pro}
        </span>
      )}
      {isSoon && (
        <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-dim)', marginLeft: 4 }}>
          {badges.soon}
        </span>
      )}
    </button>
  )
}

/* ── Locked screen ── */
/* `title` / `subtitle` viennent de `nav.pageTitles` de l'onglet concerné : ils y
   disaient déjà exactement la même chose, les redéclarer ici les ferait diverger. */
function LockedScreen({ title, subtitle, labels, c, badge }: {
  title: string
  subtitle: string
  labels: { upgrade: string; cta: string }
  c: boolean
  badge?: string
}) {
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
        {subtitle}{labels.upgrade}
      </p>
      <button className="wf-btn-primary" style={{ margin: '0 auto' }}>{labels.cta}</button>
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
