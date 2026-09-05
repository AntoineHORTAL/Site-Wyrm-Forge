import type { ReactNode } from 'react'
import KillSwitchGate from '@/components/providers/KillSwitchGate'
import { isPublicFlagEnabled } from '@/lib/feature-flags-server'

/**
 * Garde `player_search_enabled` pour `/summoner/[region]/[riotId]`.
 *
 * Même forme que `app/matches/layout.tsx` — voir son en-tête pour le pourquoi du
 * layout plutôt que d'une garde dans la page (`page.tsx` est `'use client'`) et
 * pour le choix du `fetch` anon sans cookie.
 *
 * Les trois routes publiques partagent le MÊME flag : la recherche de joueur, son
 * historique et sa partie en direct sont une seule feature du point de vue du
 * catalogue — elles s'appuient sur le même proxy Riot et se coupent ensemble.
 */
export default async function SummonerLayout({ children }: { children: ReactNode }) {
  const enabled = await isPublicFlagEnabled('player_search_enabled')

  return <KillSwitchGate enabled={enabled}>{children}</KillSwitchGate>
}
