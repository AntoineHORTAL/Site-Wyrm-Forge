/**
 * Les deux onglets de CONSULTATION communautaire, groupe « Workshop » de
 * `tabGroups` : Workshop Builds (`tabs/WorkshopBuildsTab.tsx`) et Workshop Jungle
 * (`tabs/WorkshopJungleTab.tsx`).
 *
 * Jungle Path et Scénarios, initialement annoncés ici, vivent dans `strategie.ts` :
 * ce sont des ateliers privés, pas des vitrines communautaires (voir l'en-tête de
 * ce module).
 *
 * ⚠️ CE QUI N'EST PAS ICI, et pourquoi :
 *  - `creator_name`, `titre` et `description` sont saisis par les utilisateurs :
 *    ils s'affichent tels quels, ils ne passent pas par ce dico ;
 *  - `el.Label` (nom de camp d'un path publié) est écrit par l'application de
 *    bureau et stocké tel quel dans `workshop_junglepaths.elements` — c'est de la
 *    donnée, pas un libellé d'interface ;
 *  - les noms de champions viennent de DDragon (`champion` est un id Riot).
 *
 * ⚠️ FRONTIÈRE MÉTIER : les filtres sont indexés par une clé INTERNE, et la valeur
 * comparée à la base (`workshop_builds.role`, `workshop_junglepaths.side`) reste
 * en dur dans le composant. Traduire « Tous » ou « Bleu » ne doit jamais toucher au
 * `'Blue'` / `'Red'` écrit par l'app de bureau.
 */

/* Filtres de rôle de Workshop Builds. `all` n'a pas de valeur en base : c'est
   l'absence de filtre. */
const buildRolesFr = {
  all:     'Tous',
  top:     'Top',
  jungle:  'Jungle',
  mid:     'Mid',
  adc:     'ADC',
  support: 'Support',
}

export type WorkshopRoleKey = keyof typeof buildRolesFr

/* Filtres de côté de Workshop Jungle. Même principe : `all` = pas de filtre. */
const jungleSidesFr = {
  all:  'Tous',
  blue: 'Bleu',
  red:  'Rouge',
}

export type WorkshopSideKey = keyof typeof jungleSidesFr

export const workshopFr = {
  /* Libellés communs aux deux vitrines — ils décrivent la même chose (l'auteur
     d'une publication, le patch sur lequel elle a été faite) et divergeraient pour
     rien s'ils étaient dupliqués par onglet. */
  shared: {
    by: 'par',
    patchBadge: 'patch {patch}',
  },

  builds: {
    roles: buildRolesFr,
    intro: 'Parcours, vote et importe les builds créés par la communauté.',
    search: '🔍 Rechercher un build ou un champion...',
    loading: 'Chargement des builds…',
    emptyAll: "Aucun build publié pour l'instant.",
    emptySearch: 'Aucun build ne correspond à ta recherche.',
    /* `{count}` = exemplaires de l'item dans le bloc, affiché en infobulle. */
    itemTitle: '{name} (×{count})',
    import: 'Importer le build',
    importing: 'Import…',
    imported: '✓ Importé',
    importSignedOut: 'Connecte-toi pour importer',
    remove: '🗑 Retirer du Workshop',
    removing: 'Retrait…',
    removeConfirm:
      'Retirer « {name} » du Workshop ?\n\nCette action est irréversible : le build ne sera plus visible par la communauté et ses ♥ et ↓ seront perdus. Ta copie personnelle dans « Builds Items » n\'est pas affectée.',
  },

  jungle: {
    sides: jungleSidesFr,
    intro: 'Découvre et importe les jungle paths créés par la communauté.',
    search: '🔍 Rechercher un path ou un champion...',
    loading: 'Chargement des jungle paths…',
    emptyAll: "Aucun jungle path publié pour l'instant.",
    emptySearch: 'Aucun path ne correspond à ta recherche.',
    /* Badge de la carte — dérivé de `side` en base, pas du filtre actif. */
    sideBlueBadge: 'Côté Bleu',
    sideRedBadge: 'Côté Rouge',
    /* Import réservé à l'app de bureau : bouton désactivé + infobulle explicative. */
    importApp: "Importer dans l'app",
    importAppTitle: "L'import de jungle paths est disponible dans l'application desktop",
  },
}

export type WorkshopDict = typeof workshopFr

const buildRolesEn: Record<WorkshopRoleKey, string> = {
  all:     'All',
  top:     'Top',
  jungle:  'Jungle',
  mid:     'Mid',
  adc:     'ADC',
  support: 'Support',
}

const jungleSidesEn: Record<WorkshopSideKey, string> = {
  all:  'All',
  blue: 'Blue',
  red:  'Red',
}

export const workshopEn: WorkshopDict = {
  shared: {
    by: 'by',
    patchBadge: 'patch {patch}',
  },

  builds: {
    roles: buildRolesEn,
    intro: 'Browse, upvote and import builds created by the community.',
    search: '🔍 Search a build or a champion...',
    loading: 'Loading builds…',
    emptyAll: 'No build published yet.',
    emptySearch: 'No build matches your search.',
    itemTitle: '{name} (×{count})',
    import: 'Import the build',
    importing: 'Importing…',
    imported: '✓ Imported',
    importSignedOut: 'Sign in to import',
    remove: '🗑 Remove from the Workshop',
    removing: 'Removing…',
    removeConfirm:
      'Remove “{name}” from the Workshop?\n\nThis cannot be undone: the build will no longer be visible to the community and its ♥ and ↓ will be lost. Your personal copy in “Builds Items” is not affected.',
  },

  jungle: {
    sides: jungleSidesEn,
    intro: 'Discover and import jungle paths created by the community.',
    search: '🔍 Search a path or a champion...',
    loading: 'Loading jungle paths…',
    emptyAll: 'No jungle path published yet.',
    emptySearch: 'No path matches your search.',
    sideBlueBadge: 'Blue side',
    sideRedBadge: 'Red side',
    importApp: 'Import into the app',
    importAppTitle: 'Importing jungle paths is available in the desktop app',
  },
}
