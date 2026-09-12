'use client'

/**
 * Chargement du script de régie AdSense — DERRIÈRE le consentement.
 *
 * Ce composant remplace le `<Script strategy="beforeInteractive">` qui vivait
 * dans le layout racine et qui chargeait `adsbygoogle.js` sur TOUTES les pages,
 * pour TOUS les visiteurs, avant toute interaction et sans consentement. Ce
 * script lit et dépose des identifiants sur l'appareil : son dépôt n'est pas
 * « strictement nécessaire » au service, il relève donc de l'article 82 de la
 * loi Informatique et Libertés, qui exige un consentement PRÉALABLE.
 *
 * Le verrou existait déjà pour les emplacements (`hasAdConsent()` dans
 * `lib/ads.ts`, appliqué par `AdSlot`) — mais le script global le contournait
 * en amont : aucune publicité n'était servie, et pourtant Google était appelé
 * dès le premier octet. C'est ce contournement que ce composant ferme.
 *
 * ⚠️ La vérification du compte AdSense NE dépend PAS de ce script : elle passe
 * par la balise `<meta name="google-adsense-account">` du layout racine, rendue
 * dans le `<head>` au build/SSR. C'est explicitement ce que dit le commentaire
 * d'origine de `layout.tsx` — le crawler trouve la balise sans exécuter le
 * moindre JS. Retirer le script global ne casse donc pas la vérification.
 *
 * ⚠️ `beforeInteractive` n'est volontairement PAS repris : cette stratégie
 * injecte le script dans le HTML initial, donc AVANT que le consentement puisse
 * être lu (il vit côté navigateur). Un script conditionné à un consentement ne
 * peut pas, par construction, être chargé avant l'hydratation.
 */

import Script from 'next/script'
import { useAdConsent } from './use-ad-consent'
import { ADSENSE_SCRIPT_SRC } from '@/lib/adsense'

export default function AdSenseScript() {
  // 🔴 `useAdConsent()` et non un `useState` posé au montage : le consentement
  // arrive APRÈS, quand la personne a répondu à la bannière. Le couple
  // useState/useEffect qui vivait ici lisait l'état UNE fois et n'en sortait
  // plus — la régie n'aurait démarré qu'au rechargement suivant. Le hook
  // s'abonne, donc accepter fait apparaître les publicités immédiatement.
  //
  // Son snapshot serveur vaut `false` en dur : le consentement est une notion
  // purement client, et rendre le script côté serveur produirait à la fois une
  // erreur d'hydratation et un appel à Google pour quelqu'un qui n'a rien accepté.
  const granted = useAdConsent()

  if (!granted) return null

  return (
    <Script
      id="google-adsense"
      strategy="afterInteractive"
      src={ADSENSE_SCRIPT_SRC}
      crossOrigin="anonymous"
    />
  )
}
