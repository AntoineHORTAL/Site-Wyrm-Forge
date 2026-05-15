'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import Nav from '@/components/nav/Nav'
import Hero from '@/components/landing/Hero'
import Features from '@/components/landing/Features'
// import Pricing from '@/components/landing/Pricing' // masqué pendant examen Riot
import FAQ from '@/components/landing/FAQ'
import Footer from '@/components/landing/Footer'
import AuthModal from '@/components/auth/AuthModal'
import Dashboard from '@/components/dashboard/Dashboard'
import type { User } from '@supabase/supabase-js'

export type DashTab =
  | 'accueil'
  | 'todo' | 'stats'
  | 'overlay' | 'jungle' | 'builds'
  | 'workshop-builds' | 'workshop-jungle'
  | 'matchup' | 'postgame'
  | 'tournois'
  | 'admin'

export interface UserProfile {
  id: string
  username: string
  tier: string
  role: 'user' | 'admin'
  tier_expires_at: string | null
  certified?: boolean
}

export default function Home() {
  const [user, setUser]       = useState<User | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [showAuth, setShowAuth] = useState(false)
  const [loading, setLoading]   = useState(true)
  const [activeTab, setActiveTab] = useState<DashTab>('accueil')
  const supabase = createClient()

  async function fetchProfile(uid: string) {
    const { data } = await supabase
      .from('profiles')
      .select('id, username, tier, role, tier_expires_at, certified')
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
      />

      {user ? (
        <Dashboard
          activeTab={activeTab}
          onTabChange={setActiveTab}
          isAdmin={isAdmin}
          profile={profile}
        />
      ) : (
        <>
          <Hero onLogin={() => setShowAuth(true)} />
          <Features />
          {/* Section Pricing temporairement masquée pendant l'examen de la
              demande Personal API Key Riot Games. Wyrm Forge se présente
              comme un projet 100% gratuit et non-commercial pendant cette
              période. À réactiver une fois la clé validée. */}
          {/* <Pricing onLogin={() => setShowAuth(true)} /> */}
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
