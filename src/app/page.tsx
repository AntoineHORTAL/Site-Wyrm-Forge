'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import Nav from '@/components/nav/Nav'
import Hero from '@/components/landing/Hero'
import Features from '@/components/landing/Features'
import Community from '@/components/landing/Community'
import Pricing from '@/components/landing/Pricing'
import FinalCTA from '@/components/landing/FinalCTA'
import FAQ from '@/components/landing/FAQ'
import Footer from '@/components/landing/Footer'
import AuthModal from '@/components/auth/AuthModal'
import Dashboard from '@/components/dashboard/Dashboard'
import SubscriptionReminder from '@/components/dashboard/SubscriptionReminder'
import type { User } from '@supabase/supabase-js'

export type DashTab =
  | 'accueil'
  | 'todo' | 'stats'
  | 'jungle' | 'builds' | 'scenarios'
  | 'workshop-builds' | 'workshop-jungle'
  | 'matchup' | 'postgame'
  | 'tournois'
  | 'patchnotes'
  | 'ecailles'
  | 'admin'
  | 'tarifs'   // onglet caché (absent de la navigation) — accès direct : popup renouvellement + page profil

export interface UserProfile {
  id: string
  username: string
  tier: string
  role: 'user' | 'admin'
  tier_expires_at: string | null
  certified?: boolean
  riot_puuid?:    string
  riot_gamename?: string
  riot_tagline?:  string
  riot_platform?: string
  riot_rank?:     string
}

export default function Home() {
  const [user, setUser]       = useState<User | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [showAuth, setShowAuth] = useState(false)
  const [loading, setLoading]   = useState(true)
  const [activeTab, setActiveTab] = useState<DashTab>('accueil')
  const [balance, setBalance]             = useState(0)
  const [balanceLoading, setBalanceLoading] = useState(false)
  const [ecaillesEnabled, setEcaillesEnabled] = useState(false)
  const [forgeRequest, setForgeRequest]   = useState(0)
  const supabase = createClient()

  const loadBalance = useCallback(async () => {
    setBalanceLoading(true)
    const { data } = await supabase.rpc('get_balance')
    setBalance(typeof data === 'number' ? data : 0)
    setBalanceLoading(false)
  }, [supabase])

  // riot_puuid / riot_platform sont lus ici parce que PostGameTab en dépend pour
  // savoir si un compte Riot est lié : sans eux, l'onglet renvoie tout le monde
  // vers « Lie ton compte Riot » même quand la liaison existe en base.
  // Lecture du propre profil — couverte par la policy self-read de `profiles`.
  async function fetchProfile(uid: string) {
    const { data } = await supabase
      .from('profiles')
      .select('id, username, tier, role, tier_expires_at, certified, riot_puuid, riot_platform')
      .eq('id', uid)
      .single()
    setProfile(data ?? null)
  }

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user)
      if (data.user) fetchProfile(data.user.id)
      else setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      const u = session?.user ?? null
      setUser(u)
      if (u) fetchProfile(u.id)
      else { setProfile(null); setLoading(false) }
    })

    return () => subscription.unsubscribe()
  }, [])

  // Deep-link vers l'onglet tarifs (caché) : /?tab=tarifs — utilisé par le lien
  // « Voir les tarifs » de la page profil (navigation inter-route). La popup de
  // renouvellement, elle, appelle directement setActiveTab via onRenew.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('tab') === 'tarifs') {
      setActiveTab('tarifs')
    }
  }, [])

  // Charge solde + flag écailles quand l'utilisateur change
  useEffect(() => {
    if (!user) { setBalance(0); setEcaillesEnabled(false); return }
    setBalanceLoading(true)
    Promise.all([
      supabase.from('app_settings').select('value').eq('key', 'ecailles_enabled').maybeSingle(),
      supabase.rpc('get_balance'),
    ]).then(([{ data: flagData }, { data: balData }]) => {
      setEcaillesEnabled(flagData?.value === 'true')
      setBalance(typeof balData === 'number' ? balData : 0)
      setBalanceLoading(false)
    })
  }, [user]) // eslint-disable-line react-hooks/exhaustive-deps

  // Stop loading once profile (or absence) is confirmed
  useEffect(() => {
    if (!user || profile) setLoading(false)
  }, [user, profile])

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>Chargement...</div>
      </div>
    )
  }

  const isAdmin = profile?.role === 'admin'

  // Admin always gets architecte+ display regardless of DB tier value
  const effectiveTier = isAdmin ? 'architecte+' : (profile?.tier ?? 'Apprenti')

  // Le LanguageProvider vit désormais dans le layout racine (src/app/layout.tsx) :
  // il coiffe TOUTES les routes, pas seulement celle-ci. En remettre un ici créerait
  // un provider imbriqué — le plus proche gagne, et `/` redeviendrait indépendant de
  // la langue choisie sur /profil ou /consent.
  return (
    <>
      <Nav
        mode={user ? 'user' : 'visitor'}
        username={profile?.username ?? user?.email?.split('@')[0] ?? 'Invocateur'}
        tier={effectiveTier}
        isAdmin={isAdmin}
        certified={profile?.certified}
        onLogin={() => setShowAuth(true)}
        onLogout={() => supabase.auth.signOut()}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        balance={balance}
        balanceLoading={balanceLoading}
        ecaillesEnabled={ecaillesEnabled}
        onNavigateToForge={() => {
          setForgeRequest(r => r + 1)
          setActiveTab('ecailles')
        }}
      />

      {user ? (
        <>
          <Dashboard
            activeTab={activeTab}
            onTabChange={setActiveTab}
            isAdmin={isAdmin}
            profile={profile}
            balance={balance}
            balanceLoading={balanceLoading}
            onRefreshBalance={loadBalance}
            ecaillesEnabled={ecaillesEnabled}
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
          <Hero onLogin={() => setShowAuth(true)} />
          <Features />
          <Community />
          <Pricing />
          <FinalCTA />
          <FAQ />
          <Footer />
        </>
      )}

      {showAuth && (
        <AuthModal
          onClose={() => setShowAuth(false)}
          onSuccess={() => setShowAuth(false)}
        />
      )}
    </>
  )
}
