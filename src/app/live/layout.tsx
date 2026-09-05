import type { ReactNode } from 'react'
import KillSwitchGate from '@/components/providers/KillSwitchGate'
import { isPublicFlagEnabled } from '@/lib/feature-flags-server'

/**
 * Garde `player_search_enabled` pour `/live/[region]/[riotId]`.
 *
 * Même forme que `app/matches/layout.tsx` — voir son en-tête.
 *
 * ⚠️ Ne pas confondre avec `live_game_enabled`, qui est un flag DISTINCT du
 * catalogue : celui-là garde l'Edge Function `riot-live-game` (spectator-v5) et
 * s'applique aussi à l'onglet « Partie en direct » de l'app WPF. Ici, on ne garde
 * que l'accès à la route publique. Couper `live_game_enabled` laisse la page
 * accessible mais sans données ; couper `player_search_enabled` ferme la porte
 * d'entrée. Les deux sont pilotables séparément depuis l'AdminTab, et c'est
 * voulu.
 */
export default async function LiveLayout({ children }: { children: ReactNode }) {
  const enabled = await isPublicFlagEnabled('player_search_enabled')

  return <KillSwitchGate enabled={enabled}>{children}</KillSwitchGate>
}
