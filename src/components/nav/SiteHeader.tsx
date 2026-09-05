'use client'

import { usePathname } from 'next/navigation'
import Nav from '@/components/nav/Nav'
import { useSession } from '@/components/providers/SessionProvider'
import { useDashboardNav } from '@/components/providers/DashboardNavProvider'

/**
 * Point de montage UNIQUE du header, dans le layout racine.
 *
 * Avant, `Nav` n'était rendu que par `src/app/page.tsx` : /matches, /champions,
 * /patch-notes, /about, /summoner, /live et les pages légales
 * n'avaient donc aucun en-tête — ni logo cliquable, ni connexion, ni recherche.
 * Chaque page compensait à sa façon (un « ← Retour » maison sur /about) ou pas
 * du tout.
 *
 * Il ne fait que brancher les deux contextes sur les props de `Nav` : toute la
 * session vient de `SessionProvider` (un seul jeu d'appels Supabase pour tout le
 * site), l'onglet actif de `DashboardNavProvider`.
 */

/**
 * Routes sans header de site.
 *
 * `/prac` est un outil interne servi sur son propre sous-domaine
 * (prac.wyrm-forge.com, `robots: noindex`) : son layout porte déjà sa propre
 * navigation et sa garde d'accès. Lui superposer l'en-tête public afficherait
 * deux barres et des liens hors sujet.
 */
const HEADERLESS_PREFIXES = ['/prac']

export default function SiteHeader() {
  const pathname = usePathname()
  const {
    user, profile, isAdmin, effectiveTier,
    balance, balanceLoading,
    signOut, openAuth,
  } = useSession()
  const { activeTab, goToTab, requestForge } = useDashboardNav()

  if (HEADERLESS_PREFIXES.some(p => pathname === p || pathname.startsWith(`${p}/`))) return null

  return (
    <Nav
      mode={user ? 'user' : 'visitor'}
      username={profile?.username ?? user?.email?.split('@')[0] ?? 'Invocateur'}
      tier={effectiveTier}
      isAdmin={isAdmin}
      certified={profile?.certified}
      onLogin={openAuth}
      onLogout={signOut}
      activeTab={activeTab}
      // `goToTab` et non `setActiveTab` : hors de `/`, changer l'état ne rendrait
      // rien (page.tsx n'est pas monté). Il repasse alors par `/?tab=…`.
      onTabChange={goToTab}
      balance={balance}
      balanceLoading={balanceLoading}
      onNavigateToForge={requestForge}
    />
  )
}
