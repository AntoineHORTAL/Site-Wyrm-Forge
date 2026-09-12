'use client'

import { useEffect } from 'react'
import Script from 'next/script'
import { CMP_SCRIPT_SRC } from '@/lib/adsense'
import { consentFromTcf, setAdConsent, type TcfSignal } from '@/lib/ads'

/**
 * Branchement de la **Google CMP** (Privacy & messaging, TCF v2.2) sur le verrou
 * `hasAdConsent()`.
 *
 * ════════════════════════════════════════════════════════════════════════════
 *  🔴 L'ŒUF ET LA POULE — pourquoi CE script-ci se charge sans consentement
 * ════════════════════════════════════════════════════════════════════════════
 * La bannière de consentement de Google EST un script Google. Le garder derrière
 * `hasAdConsent()` produirait un blocage parfait : pas de script ⇒ pas de
 * bannière ⇒ pas de choix possible ⇒ `hasAdConsent()` reste `false` pour
 * toujours. Le chargeur est donc chargé pour tout le monde, et c'est la SEULE
 * exception au verrou.
 *
 * Elle est admise : le mécanisme qui recueille le consentement est
 * « strictement nécessaire » à ce recueil, et la CNIL l'exempte à ce titre — au
 * même titre que le cookie de session. Ce qui reste bloqué avant le choix, et
 * l'est effectivement, c'est la RÉGIE : `AdSenseScript` ne monte
 * `adsbygoogle.js` qu'une fois `hasAdConsent()` passé à `true`.
 *
 * ⚠️ C'est plus strict que ce que recommande Google, qui charge `adsbygoogle.js`
 * d'emblée et s'en remet au Consent Mode pour brider son comportement. Nous
 * faisons les deux : Consent Mode en défense de fond (voir `layout.tsx`), ET le
 * script pas chargé du tout tant que personne n'a dit oui.
 *
 * ════════════════════════════════════════════════════════════════════════════
 *  CE QUE CE COMPOSANT NE FAIT PAS
 * ════════════════════════════════════════════════════════════════════════════
 * Il ne DESSINE pas la bannière, ne choisit pas ses textes, et ne décide pas de
 * la place du bouton « Refuser ». Tout cela est configuré dans le compte AdSense
 * (Confidentialité et messages), pas dans ce dépôt. Conséquence à ne pas perdre
 * de vue : **l'exigence RGPD « refuser aussi simple qu'accepter » se tient dans
 * la console Google, et aucun test de ce dépôt ne peut la vérifier.** Voir
 * AGENTS.md § CMP pour la configuration exacte à retenir.
 *
 * Il ne persiste rien non plus : la chaîne TCF est stockée et resservie par la
 * CMP elle-même. Doubler ce stockage créerait deux vérités divergentes au
 * premier changement d'avis.
 */

/** Signature minimale de l'API TCF v2.2 exposée par la CMP. */
type TcfApi = (
  command: string,
  version: number,
  callback: (data: unknown, success: boolean) => void,
  parameter?: unknown,
) => void

declare global {
  interface Window {
    __tcfapi?: TcfApi
    googlefc?: { showRevocationMessage?: () => void }
  }
}

/**
 * Attente de `window.__tcfapi`.
 *
 * La CMP installe un stub dès son chargement, mais on ne contrôle NI le moment
 * NI l'ordre (bloqueur de publicité, réseau lent, script servi depuis un cache).
 * D'où une attente bornée plutôt qu'un `onLoad` : si la CMP n'arrive jamais,
 * l'état reste `unknown`, donc fermé — l'échec est silencieux pour le visiteur
 * et sans conséquence, puisque rien ne se charge.
 */
const POLL_MS = 150
const POLL_TIMEOUT_MS = 15_000

export default function ConsentManager() {
  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setInterval> | undefined
    const startedAt = Date.now()

    /** Traduit ce que dit la CMP en état de consentement. */
    const apply = (data: unknown, success: boolean) => {
      if (cancelled) return
      // `success === false` = la CMP n'a pas pu répondre. On ne conclut RIEN :
      // surtout pas un `granted` par défaut.
      if (!success) return
      setAdConsent(consentFromTcf(data as TcfSignal))
    }

    const attach = () => {
      const tcf = window.__tcfapi
      if (!tcf) return false
      // `addEventListener` et non `getTCData` : il rappelle à CHAQUE changement,
      // ce qui couvre le premier choix ET les suivants (« Gérer les cookies »),
      // sans rechargement de page.
      try {
        tcf('addEventListener', 2, apply)
      } catch {
        /* CMP présente mais pas encore prête : la prochaine passe réessaiera. */
        return false
      }
      return true
    }

    if (!attach()) {
      timer = setInterval(() => {
        if (cancelled || attach() || Date.now() - startedAt > POLL_TIMEOUT_MS) {
          if (timer) clearInterval(timer)
        }
      }, POLL_MS)
    }

    return () => {
      cancelled = true
      if (timer) clearInterval(timer)
      try {
        window.__tcfapi?.('removeEventListener', 2, () => {}, apply)
      } catch {
        /* rien à retirer */
      }
    }
  }, [])

  return (
    <Script
      id="google-cmp"
      // `afterInteractive` : la bannière n'a pas à retarder le premier rendu, et
      // `beforeInteractive` est réservé au layout racine côté serveur.
      strategy="afterInteractive"
      src={CMP_SCRIPT_SRC}
    />
  )
}

/**
 * Rouvre la bannière pour permettre de CHANGER d'avis.
 *
 * Exigence RGPD : un consentement doit être retirable aussi facilement qu'il a
 * été donné. Deux chemins, dans cet ordre :
 *   1. `googlefc.showRevocationMessage()` — l'API de Privacy & messaging ;
 *   2. `__tcfapi('displayConsentUi', …)` — le repli standard TCF.
 *
 * Renvoie `false` si aucune des deux n'est disponible (CMP non chargée, script
 * bloqué) : l'appelant peut alors dire pourquoi il ne se passe rien, plutôt que
 * d'offrir un bouton mort.
 */
export function reopenConsentBanner(): boolean {
  if (typeof window === 'undefined') return false
  try {
    if (typeof window.googlefc?.showRevocationMessage === 'function') {
      window.googlefc.showRevocationMessage()
      return true
    }
    if (typeof window.__tcfapi === 'function') {
      window.__tcfapi('displayConsentUi', 2, () => {})
      return true
    }
  } catch {
    /* la CMP a répondu par une erreur : on le signale comme une indisponibilité */
  }
  return false
}
