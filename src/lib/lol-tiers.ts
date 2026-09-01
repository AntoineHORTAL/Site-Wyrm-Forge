// ════════════════════════════════════════════════════════════════════════════
//  lol-tiers — rangs classés LoL (Fer → Challenger) : libellés FR + couleurs
// ════════════════════════════════════════════════════════════════════════════
// Extraction (Lot D4) des copies strictement identiques de `TIER_FR` /
// `TIER_COLORS` qui vivaient dans `app/summoner/[region]/[riotId]/page.tsx` et
// `app/matches/[region]/[riotId]/page.tsx`. AGENTS.md §D interdit d'en écrire
// un nouvel exemplaire ; plutôt que d'importer depuis une page, on centralise.
//
// ⚠️ NE PAS CONFONDRE avec les couleurs des **tiers d'abonnement Wyrm Forge**
// (apprenti / forgeron / maître / légion), définies
// dans `components/dashboard/tabs/AdminTab.tsx` et `app/profil/page.tsx`. Deux
// concepts entièrement différents qui partagent seulement le mot « tier » —
// ne jamais fusionner les deux tables.
//
// Aucun import : module de données pur, testable sans alias.

/** Rangs classés, du plus bas au plus haut. */
export const TIER_ORDER = [
  'IRON', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM',
  'EMERALD', 'DIAMOND', 'MASTER', 'GRANDMASTER', 'CHALLENGER',
] as const

export const TIER_FR: Record<string, string> = {
  IRON: 'Fer', BRONZE: 'Bronze', SILVER: 'Argent', GOLD: 'Or',
  PLATINUM: 'Platine', EMERALD: 'Émeraude', DIAMOND: 'Diamant',
  MASTER: 'Maître', GRANDMASTER: 'Grand Maître', CHALLENGER: 'Challenger',
}

export const TIER_COLORS: Record<string, string> = {
  IRON: '#5A5A5A', BRONZE: '#B87333', SILVER: '#A8A8A8', GOLD: '#E4A800',
  PLATINUM: '#4FCEAC', EMERALD: '#00BA57', DIAMOND: '#4A90D9',
  MASTER: '#9B4DCA', GRANDMASTER: '#E84057', CHALLENGER: '#F4E342',
}

/** Couleur neutre pour un tier inconnu — jamais `undefined` dans un style. */
export const TIER_FALLBACK_COLOR = '#A1A1AA'

export const tierColor = (tier: string): string => TIER_COLORS[tier] ?? TIER_FALLBACK_COLOR

/** Tier inconnu → renvoyé tel quel plutôt qu'effacé (comportement historique). */
export const tierLabel = (tier: string): string => TIER_FR[tier] ?? tier

/**
 * Les paliers Maître / Grand Maître / Challenger n'ont PAS de division :
 * l'API renvoie bien `rank: 'I'` pour eux, mais l'afficher (« Maître I »)
 * est faux au regard du jeu.
 */
export const hasDivision = (tier: string): boolean =>
  !['MASTER', 'GRANDMASTER', 'CHALLENGER'].includes(tier)

/** `('GOLD', 'II')` → « Or II » ; `('MASTER', 'I')` → « Maître ». */
export function formatTier(tier: string, rank?: string | null): string {
  const label = tierLabel(tier)
  return rank && hasDivision(tier) ? `${label} ${rank}` : label
}
