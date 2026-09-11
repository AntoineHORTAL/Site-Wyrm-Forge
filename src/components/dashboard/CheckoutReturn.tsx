'use client'

/**
 * Retour de Stripe Checkout — bandeau d'attente puis de confirmation.
 *
 * ════════════════════════════════════════════════════════════════════════════
 *  LE PROBLÈME QUE CE COMPOSANT RÉSOUT
 * ════════════════════════════════════════════════════════════════════════════
 * Quand Stripe renvoie l'utilisateur sur `success_url`, **le palier n'est pas
 * encore écrit**. Le paiement a bien abouti, mais `profiles.tier` est mis à jour
 * par `/api/stripe/webhook`, appelé par Stripe en parallèle — un chemin qui ne
 * passe pas par le navigateur et n'a aucun rendez-vous avec lui. Le décalage est
 * court (quelques centaines de ms d'ordinaire), mais il est réel et il n'est
 * borné par rien.
 *
 * Sans ce composant, quelqu'un qui vient de payer atterrit sur un dashboard qui
 * affiche encore « Apprenti », sans rien lui dire. Le réflexe est alors de
 * repayer.
 *
 * ════════════════════════════════════════════════════════════════════════════
 *  POURQUOI DU POLLING, ET PAS REALTIME
 * ════════════════════════════════════════════════════════════════════════════
 * Supabase Realtime est déjà utilisé ailleurs (To-Do), mais il
 * suppose que la table soit dans la publication `supabase_realtime` — ce n'est
 * pas le cas de `profiles`, et l'y ajouter diffuserait les changements de
 * TOUTES ses colonnes pour une attente de quelques secondes, une fois par
 * abonnement. Quelques relectures espacées coûtent moins cher, à tout point de
 * vue, et ne dépendent d'aucune configuration hors du code.
 *
 * ⚠️ Le polling s'arrête au premier palier vu, et de toute façon au bout de
 * `MAX_ATTEMPTS`. Ce n'est PAS une boucle de synchronisation d'arrière-plan :
 * elle ne démarre que sur `?checkout=success`, et jamais deux fois (le
 * paramètre est retiré de l'URL dès le montage).
 */

import { useEffect, useRef, useState } from 'react'
import { useSession } from '@/components/providers/SessionProvider'
import { useLanguage } from '@/components/providers/LanguageProvider'
import { useDashboard } from '@/locales/dashboard'
import { subscriptionTierLabel } from '@/locales/dashboard/nav'
import { useTheme } from '@/components/providers/ThemeProvider'
import { isPaidTier } from '@/lib/subscription'

/** Intervalle entre deux relectures de `profiles`. */
const POLL_MS = 2000

/**
 * Nombre de relectures avant d'abandonner l'attente — 15 × 2 s = 30 s.
 *
 * Au-delà, on n'annonce PAS un échec : le paiement est passé, c'est seulement
 * l'écriture qui tarde (retry Stripe après un 500, panne DB passagère). Le
 * message bascule sur « recharge dans une minute », jamais sur une erreur.
 */
const MAX_ATTEMPTS = 15

type Phase = 'pending' | 'done' | 'slow' | 'canceled'

export default function CheckoutReturn() {
  const { theme } = useTheme()
  const c = theme === 'mythic'
  const { t } = useLanguage()
  const dico = useDashboard()
  const p = t.pricing

  const { profile, refreshProfile } = useSession()

  const [phase, setPhase]     = useState<Phase | null>(null)
  const [newTier, setNewTier] = useState<string | null>(null)

  // Palier au moment du retour — la référence contre laquelle on détecte le
  // changement. Dans une ref et pas dans un state : le relire ne doit pas
  // relancer l'effet, et sa valeur doit être celle du montage, pas la dernière.
  const tierAtReturn = useRef<string | null>(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const status = params.get('checkout')
    if (status !== 'success' && status !== 'cancel') return

    // Nettoyage de l'URL AVANT toute attente : un rechargement, un partage de
    // lien ou un retour arrière ne doit pas rejouer l'annonce. `replaceState`
    // plutôt que le routeur — on ne veut ni navigation ni re-render.
    params.delete('checkout')
    const qs = params.toString()
    window.history.replaceState(
      null, '',
      `${window.location.pathname}${qs ? `?${qs}` : ''}`,
    )

    if (status === 'cancel') { setPhase('canceled'); return }

    tierAtReturn.current = profile?.tier ?? null
    setPhase('pending')

    let attempts = 0
    let stopped  = false

    const tick = async () => {
      if (stopped) return
      attempts += 1

      // On lit la valeur RENVOYÉE plutôt que l'état React : à cet instant, le
      // `setProfile` du provider n'a pas encore été appliqué au rendu courant.
      const fresh = await refreshProfile()
      if (stopped) return

      const tier = fresh?.tier ?? null
      const changed = tier !== null && tier !== tierAtReturn.current

      // Deux conditions, pas une : `changed` couvre le cas nominal (Apprenti →
      // Forgeron) ET la montée de palier (Forgeron → Maître), que la seule
      // vérification « est-ce payant ? » manquerait. `isPaidTier` couvre le cas
      // inverse — un profil non chargé au moment du retour, dont `tierAtReturn`
      // vaudrait `null` et qui n'aurait donc « pas changé ».
      if (changed || (isPaidTier(tier) && tierAtReturn.current === null)) {
        setNewTier(tier)
        setPhase('done')
        return
      }

      if (attempts >= MAX_ATTEMPTS) { setPhase('slow'); return }
      timer = window.setTimeout(tick, POLL_MS)
    }

    // Premier essai immédiat : le webhook a souvent déjà écrit le temps du
    // retour de redirection, auquel cas rien ne s'affiche que la confirmation.
    let timer = window.setTimeout(tick, 0)

    return () => { stopped = true; window.clearTimeout(timer) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (!phase) return null

  const message =
    phase === 'pending'  ? p.checkoutPending
    : phase === 'slow'   ? p.checkoutSlow
    : phase === 'canceled' ? p.checkoutCanceled
    : p.checkoutDone.replace('{tier}', subscriptionTierLabel(dico.nav, newTier))

  // Vert sur succès, neutre sinon. Une annulation n'est pas une erreur : rien
  // n'a été débité, et l'afficher en rouge inquiéterait sans raison.
  const accent = phase === 'done' ? '#5DCAA5' : c ? '#BA7517' : '#7F77DD'

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '12px 16px', marginBottom: 16, borderRadius: 10,
        background: c ? 'rgba(20,10,35,0.6)' : '#18181B',
        border: `1px solid ${accent}55`,
        color: '#F5F2FA', fontSize: 14, lineHeight: 1.4,
      }}
    >
      <span aria-hidden style={{ fontSize: 18 }}>
        {phase === 'done' ? '✓' : phase === 'canceled' ? '×' : '⏳'}
      </span>
      <span style={{ flex: 1 }}>{message}</span>
      <button
        onClick={() => setPhase(null)}
        aria-label="Fermer"
        style={{
          background: 'none', border: 'none', color: 'var(--text-muted)',
          fontSize: 20, lineHeight: 1, cursor: 'pointer', padding: 0,
        }}
      >×</button>
    </div>
  )
}
