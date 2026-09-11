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

import { useEffect, useState } from 'react'
import Script from 'next/script'
import { hasAdConsent } from '@/lib/ads'
import { ADSENSE_SCRIPT_SRC } from '@/lib/adsense'

export default function AdSenseScript() {
  // Même patron que `AdSlot` : le consentement est une notion purement CLIENT,
  // l'évaluer pendant le rendu ferait diverger le HTML du serveur (« pas de
  // script ») de celui du client (« script »), donc une erreur d'hydratation.
  // On part toujours de l'état fermé, et c'est cet effet qui ouvre.
  const [granted, setGranted] = useState(false)

  useEffect(() => {
    // Le setState en effet est ICI la solution, pas le problème — même
    // justification que `LanguageProvider` : c'est ce qui garantit que le
    // premier rendu client est identique au rendu serveur. Lire le
    // consentement pendant le rendu (ce que suggère la règle) provoquerait
    // exactement le mismatch d'hydratation qu'on cherche à éviter.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- voir ci-dessus
    if (hasAdConsent()) setGranted(true)
  }, [])


  // `hasAdConsent()` renvoie `false` en dur tant qu'aucune CMP n'existe : rien
  // n'est donc chargé aujourd'hui, et c'est le comportement attendu. Le jour où
  // la CMP arrive, elle branche `hasAdConsent()` et ce composant suit — aucun
  // changement ici. Voir le commentaire de `hasAdConsent` dans `lib/ads.ts`.
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
