'use client'

import { useEffect } from 'react'
import Hero from '@/components/landing/Hero'
import Features from '@/components/landing/Features'
import Community from '@/components/landing/Community'
import Pricing from '@/components/landing/Pricing'
import FinalCTA from '@/components/landing/FinalCTA'
import FAQ from '@/components/landing/FAQ'
import Footer from '@/components/landing/Footer'
import Dashboard, { dashTabs } from '@/components/dashboard/Dashboard'
import SubscriptionReminder from '@/components/dashboard/SubscriptionReminder'
import { useSession } from '@/components/providers/SessionProvider'
import { useDashboardNav } from '@/components/providers/DashboardNavProvider'
import type { DashTab } from '@/lib/session-types'

// `DashTab` et `UserProfile` ont déménagé dans `src/lib/session-types.ts` : le
// header vit désormais dans le layout racine, et les providers qui le nourrissent
// ne peuvent pas importer cette page (elle les importe déjà). Ré-exportés ici
// pour ne pas casser les imports existants.
export type { DashTab, UserProfile } from '@/lib/session-types'

/**
 * Onglets atteignables par le deep-link `/?tab=…`.
 *
 * `dashTabs` ne contient que les onglets NAVIGABLES : on y ajoute les deux
 * onglets hors navigation — `tarifs` (caché : popup de renouvellement et lien
 * « Voir les tarifs » de /profil) et `admin` (rendu conditionnellement).
 * La liste sert de garde : un `?tab=` inconnu est ignoré plutôt que d'installer
 * un onglet que le Dashboard ne saurait pas rendre.
 */
const DEEP_LINKABLE_TABS = new Set<string>([...dashTabs.map(t => t.id), 'tarifs', 'admin'])

export default function Home() {
  const { user, profile, loading, isAdmin, balance, balanceLoading, refreshBalance } = useSession()
  const { activeTab, setActiveTab, forgeRequest } = useDashboardNav()

  // Deep-link vers un onglet : `/?tab=…`. Utilisé par le lien « Voir les tarifs »
  // de la page profil, et par toute navigation d'onglet lancée depuis une AUTRE
  // route (le header vit dans le layout, ses onglets sont donc cliquables depuis
  // /champions ou /matches — voir `goToTab` dans DashboardNavProvider).
  useEffect(() => {
    const tab = new URLSearchParams(window.location.search).get('tab')
    if (tab && DEEP_LINKABLE_TABS.has(tab)) setActiveTab(tab as DashTab)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>Chargement...</div>
      </div>
    )
  }

  // `Nav`, la modale de connexion et le LanguageProvider vivent tous dans le layout
  // racine : cette page ne rend plus que son propre contenu.
  return user ? (
    <>
      <Dashboard
        activeTab={activeTab}
        onTabChange={setActiveTab}
        isAdmin={isAdmin}
        profile={profile}
        balance={balance}
        balanceLoading={balanceLoading}
        onRefreshBalance={refreshBalance}
        forgeRequest={forgeRequest}
      />
      <SubscriptionReminder
        tier={profile?.tier ?? 'apprenti'}
        tierExpiresAt={profile?.tier_expires_at ?? null}
        isAdmin={isAdmin}
        onRenew={() => setActiveTab('tarifs')}
      />
    </>
  ) : (
    <>
      <Hero />
      <Features />
      <Community />
      <Pricing />
      <FinalCTA />
      <FAQ />
      <Footer />
    </>
  )
}
