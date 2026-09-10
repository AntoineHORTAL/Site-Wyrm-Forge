'use client'

import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import AuthModal from '@/components/auth/AuthModal'
import type { UserProfile } from '@/lib/session-types'
import type { User } from '@supabase/supabase-js'

/**
 * Session du site — utilisateur, profil, solde d'Écailles — pour TOUTES les routes.
 *
 * Cet état vivait dans `src/app/page.tsx`. Il en est sorti quand le header a été
 * monté dans le layout racine : `Nav` a besoin de `username`, `tier`, `isAdmin`,
 * et `balance` sur /matches, /champions, /patch-notes… autant
 * que sur `/`.
 *
 * ⚠️ Provider UNIQUE, monté une seule fois dans `src/app/layout.tsx`. C'est ce qui
 * garantit qu'il n'existe qu'un `getUser()` + un `fetchProfile()` + un
 * `get_balance()` par navigation, quelle que soit la page : une page qui aurait
 * besoin de la session la LIT (`useSession()`), elle ne la recharge jamais.
 *
 * La modale de connexion est rendue ici, et pas dans les pages : `openAuth()`
 * doit être appelable depuis le header, donc depuis n'importe quelle route.
 */
interface SessionCtx {
  user: User | null
  profile: UserProfile | null
  /** `true` tant que l'utilisateur (et son profil s'il existe) n'est pas résolu. */
  loading: boolean
  isAdmin: boolean
  /**
   * Palier à AFFICHER. Un admin s'affiche avec le marqueur de RÔLE `'admin'`, pas
   * avec un palier commercial emprunté (`'architecte+'` historiquement — palier
   * retiré de l'offre par la migration 20260901000004). `'admin'` est déclaré
   * dans `tiersFr`/`tiersEn` et dans les deux tables `TIER_COLORS`, mais reste
   * hors de `TIER_ORDER` : ni proposable, ni écrivable dans `profiles.tier`.
   */
  effectiveTier: string
  balance: number
  balanceLoading: boolean
  refreshBalance: () => void
  /**
   * Relit `profiles` pour l'utilisateur courant.
   *
   * Ajouté pour le retour de Stripe Checkout : le palier n'est PAS écrit quand
   * le navigateur revient du paiement — c'est le webhook `/api/stripe/webhook`
   * qui l'écrit, quelques centaines de millisecondes plus tard, hors du parcours
   * de l'utilisateur. Sans ce rappel, le dashboard afficherait l'ancien palier
   * jusqu'au prochain rechargement complet, alors même que le paiement a abouti.
   *
   * Renvoie le profil relu, pour que l'appelant puisse décider s'il doit encore
   * attendre (voir `CheckoutReturn`) — l'état React, lui, n'est pas encore à
   * jour à l'instant du `await`.
   */
  refreshProfile: () => Promise<UserProfile | null>
  signOut: () => void
  openAuth: () => void
}

const Ctx = createContext<SessionCtx>({
  user: null, profile: null, loading: true, isAdmin: false, effectiveTier: 'Apprenti',
  balance: 0, balanceLoading: false,
  refreshBalance: () => {}, refreshProfile: async () => null,
  signOut: () => {}, openAuth: () => {},
})

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser]       = useState<User | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [showAuth, setShowAuth] = useState(false)
  const [balance, setBalance]   = useState(0)
  const [balanceLoading, setBalanceLoading] = useState(false)
  const supabase = createClient()

  const refreshBalance = useCallback(async () => {
    setBalanceLoading(true)
    const { data } = await supabase.rpc('get_balance')
    setBalance(typeof data === 'number' ? data : 0)
    setBalanceLoading(false)
  }, [supabase])

  // riot_puuid / riot_platform sont lus ici parce que PostGameTab en dépend pour
  // savoir si un compte Riot est lié : sans eux, l'onglet renvoie tout le monde
  // vers « Lie ton compte Riot » même quand la liaison existe en base.
  // Lecture du propre profil — couverte par la policy self-read de `profiles`.
  async function fetchProfile(uid: string): Promise<UserProfile | null> {
    const { data } = await supabase
      .from('profiles')
      .select('id, username, tier, role, tier_expires_at, certified, riot_puuid, riot_platform')
      .eq('id', uid)
      .single()
    setProfile(data ?? null)
    return data ?? null
  }

  // Relecture à la demande. `user` est lu depuis l'état plutôt que passé en
  // paramètre : l'appelant (CheckoutReturn) n'a pas à connaître l'identifiant,
  // et ne peut donc pas demander le profil de quelqu'un d'autre.
  const refreshProfile = useCallback(async () => {
    if (!user) return null
    return fetchProfile(user.id)
  }, [user]) // eslint-disable-line react-hooks/exhaustive-deps

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
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Charge le solde quand l'utilisateur change.
  //
  // ⚠️ `ecailles_enabled` était lu ICI, en même temps que le solde. Il en est
  // sorti : c'est un feature flag, pas de l'état de session, et le lire depuis ce
  // provider avait deux défauts. D'abord une lecture ONE-SHOT au changement
  // d'utilisateur — un flag basculé depuis l'AdminTab n'atteignait un onglet
  // ouvert qu'au rechargement de la page. Ensuite, et surtout, la lecture était
  // conditionnée à `user` : un visiteur ANONYME n'avait jamais de flags du tout.
  // La source de vérité unique est désormais `FeatureFlagsProvider` (poll 60 s,
  // lecture anonyme), consommé par `useFlag('ecailles_enabled')` là où le besoin
  // est réel — Nav, Dashboard, EcaillesTab.
  useEffect(() => {
    if (!user) { setBalance(0); return }
    setBalanceLoading(true)
    supabase.rpc('get_balance').then(({ data }) => {
      setBalance(typeof data === 'number' ? data : 0)
      setBalanceLoading(false)
    })
  }, [user]) // eslint-disable-line react-hooks/exhaustive-deps

  // Fin du chargement dès que le profil (ou son absence) est confirmé
  useEffect(() => {
    if (!user || profile) setLoading(false)
  }, [user, profile])

  const isAdmin = profile?.role === 'admin'
  const effectiveTier = isAdmin ? 'admin' : (profile?.tier ?? 'Apprenti')

  const signOut  = useCallback(() => { supabase.auth.signOut() }, [supabase])
  const openAuth = useCallback(() => setShowAuth(true), [])

  return (
    <Ctx.Provider value={{
      user, profile, loading, isAdmin, effectiveTier,
      balance, balanceLoading,
      refreshBalance, refreshProfile, signOut, openAuth,
    }}>
      {children}
      {showAuth && (
        <AuthModal
          onClose={() => setShowAuth(false)}
          onSuccess={() => setShowAuth(false)}
        />
      )}
    </Ctx.Provider>
  )
}

export const useSession = () => useContext(Ctx)
