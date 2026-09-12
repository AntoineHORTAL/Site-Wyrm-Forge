'use client'

import { useEffect } from 'react'
import Hero from '@/components/landing/Hero'
import Features from '@/components/landing/Features'
import About from '@/components/landing/About'
import Community from '@/components/landing/Community'
import Pricing from '@/components/landing/Pricing'
import FinalCTA from '@/components/landing/FinalCTA'
import FAQ from '@/components/landing/FAQ'
import Dashboard, { dashTabs } from '@/components/dashboard/Dashboard'
import SubscriptionReminder from '@/components/dashboard/SubscriptionReminder'
import { useSession } from '@/components/providers/SessionProvider'
import { useDashboardNav } from '@/components/providers/DashboardNavProvider'
import type { DashTab } from '@/lib/session-types'
import { peekCheckoutIntent, sessionIntentStorage } from '@/lib/stripe/checkout-intent'

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
  // `loading` n'est plus lu : la vitrine est rendue tant qu'aucun utilisateur
  // n'est résolu, ce qui EST l'état du rendu serveur. Voir le bloc ci-dessous.
  const { user, profile, isAdmin, balance, balanceLoading, refreshBalance } = useSession()
  const { activeTab, setActiveTab, forgeRequest } = useDashboardNav()

  // Deep-link vers un onglet : `/?tab=…`. Utilisé par le lien « Voir les tarifs »
  // de la page profil, et par toute navigation d'onglet lancée depuis une AUTRE
  // route (le header vit dans le layout, ses onglets sont donc cliquables depuis
  // /champions ou /matches — voir `goToTab` dans DashboardNavProvider).
  useEffect(() => {
    const tab = new URLSearchParams(window.location.search).get('tab')
    if (tab && DEEP_LINKABLE_TABS.has(tab)) setActiveTab(tab as DashTab)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Reprise d'abonnement : ouvrir l'onglet `tarifs` quand une intention attend.
   *
   * Un visiteur qui a cliqué « Se connecter pour s'abonner » sur la vitrine a vu
   * cette même page BASCULER de la vitrine au dashboard au moment où `user` est
   * devenu non-null : `Pricing` a été démonté, et l'onglet ouvert par défaut
   * n'est pas `tarifs`. Sans cet effet, l'intention mémorisée resterait dans
   * `sessionStorage` sans que personne ne la relise, et la personne se
   * retrouverait sur l'accueil du dashboard sans explication.
   *
   * `peek` et non `take` : c'est `Pricing` qui CONSOMME l'intention, une fois
   * monté dans l'onglet — la consommer ici la ferait disparaître avant qu'un
   * checkout puisse être relancé.
   *
   * Dépendance sur `user` : couvre les deux chemins de connexion. Après un
   * retour OAuth la page est remontée et `user` passe de `null` à l'utilisateur
   * une fois la session résolue ; après une connexion e-mail, `page.tsx` reste
   * monté et seul `user` change.
   */
  useEffect(() => {
    if (!user) return
    if (peekCheckoutIntent(sessionIntentStorage())) setActiveTab('tarifs')
  }, [user]) // eslint-disable-line react-hooks/exhaustive-deps

  /* 🔴 PAS de court-circuit sur `loading` — chantier AdSense du 2026-09-12.
   *
   * Cette page rendait « Chargement... » tant que la session n'était pas
   * résolue. Comme `loading` vaut `true` au rendu SERVEUR (la session est une
   * notion purement client), le HTML servi pour `/` ne contenait QUE ce mot :
   * un visiteur sans JavaScript, et le robot d'examen AdSense qui juge sur le
   * HTML brut, ne voyaient pas une ligne du produit. D'où le motif de refus
   * « contenu à faible valeur informative » sur la page la plus importante.
   *
   * En rendant directement `user ? dashboard : vitrine`, l'état serveur
   * (`user === null`) produit la vitrine COMPLÈTE — Hero, Fonctionnalités, la
   * section éditoriale, les tarifs et la FAQ sont tous des composants clients,
   * mais un composant client rend quand même son HTML au SSR dès lors que son
   * parent le rend.
   *
   * ⚠️ CONTREPARTIE ASSUMÉE : un utilisateur CONNECTÉ voit brièvement la
   * vitrine avant que sa session ne soit résolue, là où il voyait auparavant un
   * « Chargement... ». C'est le même transitoire, avec un contenu différent —
   * et c'est déjà exactement ce que fait le header du layout racine, qui passe
   * de `mode="visitor"` à `mode="user"` sur TOUTES les routes. Le supprimer
   * demanderait de lire la session côté serveur (cookie Supabase), ce qui
   * rendrait dynamique l'intégralité du site, vitrine comprise.
   *
   * ⚠️ Ne pas réintroduire d'écran d'attente ici sans mesurer le HTML servi
   * (`curl https://wyrm-forge.com | grep -c Wyrm`) : ce serait rouvrir le
   * défaut que ce chantier corrige.
   *
   * `Nav`, la modale de connexion et le LanguageProvider vivent tous dans le
   * layout racine : cette page ne rend plus que son propre contenu. */
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
      <About />
      <Community />
      <Pricing />
      <FinalCTA />
      <FAQ />
      {/* Le <Footer /> a déménagé dans le layout racine : il est désormais rendu
          sur TOUTES les routes, connectées comprises, pour que les liens légaux
          soient atteignables partout. Le remettre ici le rendrait deux fois. */}
    </>
  )
}
