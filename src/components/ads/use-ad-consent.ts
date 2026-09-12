'use client'

import { useSyncExternalStore } from 'react'
import { hasAdConsent, onAdConsentChange } from '@/lib/ads'

/**
 * Le consentement publicitaire, en tant qu'état RÉACTIF.
 *
 * `hasAdConsent()` est synchrone : elle dit ce qu'on sait à l'instant T. Or le
 * consentement arrive TARD et de façon asynchrone — la personne lit la
 * bannière, puis clique. Un composant qui se contenterait de lire la fonction
 * au montage resterait bloqué sur « non » pour toute la durée de la page, et
 * l'exigence « les pubs s'affichent sans recharger » tomberait.
 *
 * `useSyncExternalStore` répond aux deux problèmes d'un coup :
 *   • il ABONNE le composant (`onAdConsentChange`), donc un changement d'avis
 *     re-rend tout ce qui en dépend, sans rechargement ;
 *   • son troisième argument est le snapshot SERVEUR, ici `false` en dur. Le
 *     consentement est une notion purement client : rendre `true` côté serveur
 *     produirait une erreur d'hydratation, et surtout un HTML qui annonce une
 *     publicité à quelqu'un qui n'a peut-être rien accepté.
 *
 * ⚠️ Ne PAS remplacer par un `useState` + `useEffect` : c'est le patron qu'on
 * remplace justement ici, et il rate le cas où le consentement change APRÈS le
 * montage.
 */
export function useAdConsent(): boolean {
  return useSyncExternalStore(onAdConsentChange, hasAdConsent, () => false)
}
