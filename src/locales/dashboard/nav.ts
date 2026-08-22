/**
 * Barre de navigation en mode connecté (`Nav.tsx`, branches `mode === 'user'`) et
 * LIBELLÉS DES ONGLETS du dashboard.
 *
 * ⚠️ Les libellés d'onglets vivent ici et pas dans `Dashboard.tsx` parce que
 * `tabGroups` / `dashTabs` sont consommés par DEUX barres (sidebar desktop dans
 * `Dashboard.tsx`, drawer mobile dans `Nav.tsx`) : un seul jeu de libellés pour les
 * deux. Ils seront retrouvés par `id` d'onglet — l'`id` reste une valeur technique
 * (union `DashTab`, état + deep-link `?tab=`) et n'est JAMAIS traduit.
 *
 * ⏳ Rempli au Lot 1.
 */
export const navFr = {}

export type NavDict = typeof navFr

export const navEn: NavDict = {}
