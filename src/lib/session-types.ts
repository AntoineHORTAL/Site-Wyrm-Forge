/**
 * Types partagés entre la page d'accueil, le header global et le dashboard.
 *
 * Ils vivaient dans `src/app/page.tsx`, qui était le seul point de montage de
 * `Nav`. Depuis que le header est monté dans le layout racine
 * (`src/components/nav/SiteHeader.tsx`), `Nav` et les providers ne peuvent plus
 * les y lire : `page.tsx` importe le provider, qui importerait la page — un
 * cycle. D'où ce module neutre, qui n'importe rien.
 */

/**
 * Onglet du dashboard.
 *
 * `tarifs` est un onglet CACHÉ (absent de la navigation) : on y accède par la
 * popup de renouvellement, par le lien « Voir les tarifs » de /profil, ou par
 * le deep-link `/?tab=tarifs`.
 */
export type DashTab =
  | 'accueil'
  | 'todo' | 'stats'
  | 'jungle' | 'builds' | 'scenarios'
  | 'workshop-builds' | 'workshop-jungle'
  | 'matchup' | 'postgame'
  | 'tournois'
  | 'patchnotes'
  | 'ecailles'
  | 'kit'
  | 'admin'
  | 'tarifs'

/** Projection de `profiles` telle que la lit le site (pas toutes les colonnes). */
export interface UserProfile {
  id: string
  username: string
  tier: string
  role: 'user' | 'admin'
  tier_expires_at: string | null
  certified?: boolean
  riot_puuid?:    string
  riot_gamename?: string
  riot_tagline?:  string
  riot_platform?: string
  riot_rank?:     string
}
