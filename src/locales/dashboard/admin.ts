/**
 * Onglet Admin (`tabs/AdminTab.tsx`).
 *
 * ⚠️ Cet onglet affiche des VALEURS MÉTIER brutes (tier, rôle, statuts). Traduire
 * signifie ajouter une table d'affichage `valeur → libellé`, jamais toucher aux
 * valeurs elles-mêmes ni aux comparaisons qui les utilisent
 * (`p.tier === t` dans AdminTab, `TIER_ORDER`, `'apprenti'`, `'maître'`…).
 *
 * ⏳ Rempli au Lot 6.
 */
export const adminFr = {}

export type AdminDict = typeof adminFr

export const adminEn: AdminDict = {}
