/**
 * Sous-onglets du panneau admin — module PUR (aucun import React, aucun DOM).
 *
 * Le panneau empilait verticalement trois blocs sans rapport : gestion des
 * comptes, CRUD des patch notes, et le catalogue de feature flags. Ils ne
 * partagent aucun état — `load()`, `loadPatches()` et `loadCatalogue()` sont
 * indépendants — d'où un découpage qui suit une couture déjà présente.
 * `loadKits()` (service « Kit sur mesure ») s'y ajoute sur la même couture.
 *
 * Tout ce qui décide QUOI afficher vit ici plutôt que dans `AdminTab` : c'est ce
 * qui rend l'invariant du bandeau (ci-dessous) testable sans monter le panneau,
 * qui tirerait Supabase et `createPortal` pour ne rien prouver de plus.
 */

/**
 * Ordre d'affichage des pastilles. `utilisateurs` en premier ET par défaut :
 * c'est ce que l'admin voyait en haut du panneau avant le découpage, la mémoire
 * musculaire est conservée.
 *
 * ⚠️ Ces `id` sont STRUCTURELS — état local et valeur acceptée dans `?subtab=`.
 * Ils ne sont jamais traduits ; les libellés vivent dans `locales/dashboard/admin`.
 *
 * `kits` est AJOUTÉ EN FIN de liste, et non inséré à côté d'`utilisateurs` par
 * affinité thématique : la position des trois pastilles existantes est déjà
 * apprise. Un nouvel onglet qui décale les autres fait rater le clic pendant
 * quelques jours — le même argument que celui qui garde `utilisateurs` en tête.
 */
export const ADMIN_SUBTAB_IDS = ['utilisateurs', 'patch-notes', 'flags', 'kits'] as const

export type AdminSubTab = typeof ADMIN_SUBTAB_IDS[number]

export const DEFAULT_ADMIN_SUBTAB: AdminSubTab = 'utilisateurs'

/**
 * Cible du bandeau de coupures quand on clique dessus. Constante partagée plutôt
 * que littéral recopié dans `AdminTab` : le test et le composant lisent la même
 * chose, renommer le sous-onglet ne peut pas casser le saut en silence.
 */
export const CUT_BANNER_TARGET: AdminSubTab = 'flags'

export function isAdminSubTab(value: unknown): value is AdminSubTab {
  return typeof value === 'string' && (ADMIN_SUBTAB_IDS as readonly string[]).includes(value)
}

/**
 * Garde du deep-link `?subtab=`. Même parti pris que `DEEP_LINKABLE_TABS` pour
 * `?tab=` (`app/page.tsx`) : une valeur inconnue est IGNORÉE — on retombe sur le
 * défaut plutôt que d'installer un sous-onglet que le panneau ne saurait pas rendre.
 */
export function parseAdminSubTab(raw: string | null | undefined): AdminSubTab {
  return isAdminSubTab(raw) ? raw : DEFAULT_ADMIN_SUBTAB
}

/** Lit `?subtab=` dans une query string. `search` accepte la forme `?a=b` ou `a=b`. */
export function subTabFromSearch(search: string): AdminSubTab {
  return parseAdminSubTab(new URLSearchParams(search).get('subtab'))
}

export interface AdminPanelLayout {
  /** Bandeau de coupures — voir l'invariant ci-dessous. */
  showBanner: boolean
  bannerCount: number
  showUsers: boolean
  showPatchNotes: boolean
  showFlags: boolean
  showKits: boolean
}

/**
 * Ce que le panneau montre, pour un sous-onglet actif et un nombre de kill
 * switches coupés.
 *
 * ⚠️ INVARIANT VERROUILLÉ PAR LES TESTS : `showBanner` ne dépend QUE de
 * `cutCount`, jamais de `subtab`. Un admin qui regarde les patch notes pendant
 * qu'une feature est coupée doit le voir — enfermer le bandeau dans le
 * sous-onglet « flags » supposerait qu'on pense à cliquer dessus en pleine
 * crise, ce qui est exactement l'hypothèse à ne pas faire. Le paramètre
 * `subtab` n'est volontairement PAS lu par ce calcul.
 */
export function adminPanelLayout(subtab: AdminSubTab, cutCount: number): AdminPanelLayout {
  return {
    showBanner:     cutCount > 0,
    bannerCount:    cutCount,
    showUsers:      subtab === 'utilisateurs',
    showPatchNotes: subtab === 'patch-notes',
    showFlags:      subtab === 'flags',
    showKits:       subtab === 'kits',
  }
}
