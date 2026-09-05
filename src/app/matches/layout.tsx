import type { ReactNode } from 'react'
import KillSwitchGate from '@/components/providers/KillSwitchGate'
import { isPublicFlagEnabled } from '@/lib/feature-flags-server'

/**
 * Garde `player_search_enabled` pour TOUT `/matches` — la page de recherche
 * (`/matches`) comme les historiques (`/matches/[region]/[riotId]`).
 *
 * ── Pourquoi un layout, et pas une garde dans chaque page ────────────────────
 * Les pages d'historique portent `'use client'` en première ligne : le module
 * entier est client, elles ne peuvent donc pas lire le flag côté serveur
 * elles-mêmes. Un layout, lui, est un Server Component par défaut — il lit le
 * flag AVANT que le HTML ne soit généré et n'a même pas besoin de rendre
 * `children` quand la feature est coupée.
 *
 * Cette forme a aussi l'avantage de laisser les pages STRICTEMENT INTACTES : le
 * câblage se retire en supprimant ce fichier, sans rien à défaire ailleurs.
 *
 * ⚠️ Le flag est lu par `isPublicFlagEnabled`, qui passe par un `fetch` nu (clé
 * anon, pas de cookie) précisément pour que `/matches` GARDE sa génération
 * statique — voir le commentaire de cette fonction. Utiliser le client Supabase
 * serveur ici basculerait la route en dynamique et coûterait une requête par
 * visiteur.
 */
export default async function MatchesLayout({ children }: { children: ReactNode }) {
  const enabled = await isPublicFlagEnabled('player_search_enabled')

  return <KillSwitchGate enabled={enabled}>{children}</KillSwitchGate>
}
