/**
 * Onglet Builder (`tabs/BuildsTab.tsx`) et ses éditeurs (`components/builder/` :
 * `RunesEditor`, `SkillOrderEditor`).
 *
 * Le plus gros porteur de texte de la zone connectée.
 *
 * ⚠️ CE QUI N'EST PAS ICI, et pourquoi :
 *  - les noms d'items, de champions et de runes viennent de DDragon, chargé en
 *    `fr_FR` par ces composants — ils restent français en mode EN (catégorie
 *    « locale de données », traitée au Lot 8 avec les `toLocaleString('fr-FR')`) ;
 *  - les descriptions d'items et de runes viennent de la même source ;
 *  - `filters` et `stats` sont indexés par une clé STABLE (jamais par le libellé) :
 *    la clé de filtre est interne, celle de stat est la clé DDragon (`FlatArmorMod`…).
 *    Le libellé, lui, ne sert qu'à l'affichage et à l'`alt` de l'icône.
 *
 * ⚠️ `defaults` est le seul endroit du dico dont la valeur ATTERRIT EN BASE : ce sont
 * les valeurs initiales des données créées par l'utilisateur (noms de blocs, nom de
 * build, pseudo de publication). Aucune n'est comparée nulle part dans le code —
 * ce sont des amorces éditables, pas des enums. Un utilisateur anglophone crée donc
 * des blocs nommés en anglais, ce qui est le comportement voulu.
 */

/* Clés de filtre — internes, jamais affichées, jamais stockées. Elles remplacent
   l'ancien usage du libellé français comme identifiant d'état. */
const filtersFr = {
  ad: 'AD',
  ap: 'AP',
  armor: 'Armure',
  magicResist: 'Rés. mag.',
  health: 'Vie',
  lethality: 'Létalité',
  magicPen: 'Pén. mag.',
  attackSpeed: 'Vit. attq.',
  crit: 'Crit',
  lifeSteal: 'Vol de vie',
  omnivamp: 'Omnivamp',
  moveSpeed: 'Vit. dép.',
  mana: 'Mana',
  healthRegen: 'Régén. PV',
  manaRegen: 'Régén. mana',
  heal: 'Soins',
  tenacity: 'Ténacité',
  adaptive: 'Adapt.',
}

export type BuildFilterKey = keyof typeof filtersFr

/* Indexé par la clé de stat DDragon — c'est le contrat de la donnée, pas un libellé. */
const statsFr = {
  FlatPhysicalDamageMod: 'Dégâts physiques',
  FlatMagicDamageMod: 'Puissance (AP)',
  FlatCritChanceMod: 'Coup critique',
  PercentAttackSpeedMod: "Vitesse d'attaque",
  PercentLifeStealMod: 'Vol de vie',
  FlatArmorPenetrationMod: 'Létalité',
  FlatMagicPenetrationMod: 'Pén. magique',
  FlatHPPoolMod: 'Points de vie',
  FlatArmorMod: 'Armure',
  FlatSpellBlockMod: 'Résistance mag.',
  FlatHPRegenMod: 'Régén. PV',
  FlatMPPoolMod: 'Mana',
  FlatMovementSpeedMod: 'Vitesse dép.',
  PercentMovementSpeedMod: 'Vitesse dép. %',
}

export type BuildStatKey = keyof typeof statsFr

/* Indexé par l'id de shard Riot. Un même shard apparaît sur plusieurs lignes
   (Force adaptative en Offense ET Flex) : une seule entrée pour les deux. */
const shardsFr = {
  5008: { name: 'Force adaptative', desc: '+9 Force adaptative' },
  5005: { name: "Vitesse d'attaque", desc: "+10 % vitesse d'attaque" },
  5007: { name: 'Hâte de comp.', desc: '+8 hâte de compétence' },
  5010: { name: 'Vit. de déplacement', desc: '+2 % vitesse de déplacement' },
  5001: { name: 'PV (selon niveau)', desc: '+10-180 PV (selon niveau)' },
  5011: { name: 'PV', desc: '+65 PV' },
  5013: { name: 'Tén. & Rés. ralent.', desc: '+10 % tén. et rés. aux ralent.' },
}

export type ShardId = keyof typeof shardsFr

export const buildsFr = {
  filters: filtersFr,
  stats: statsFr,
  shards: shardsFr,

  /* ⚠️ Valeurs initiales écrites en base — voir l'avertissement en tête de fichier. */
  defaults: {
    blockStart: 'Items de départ',
    blockCore: 'Items cœur',
    blockNumbered: 'Bloc {n}',
    blockFallback: 'Bloc',
    buildName: 'Build sans nom',
    anonymousCreator: 'Anonyme',
  },

  /* ── Vue liste ── */
  list: {
    title: 'Mes builds',
    countOne: '{count} build sauvegardé',
    countOther: '{count} builds sauvegardés',
    create: '+ Créer un build',
    loading: 'Chargement de tes builds…',
    emptyTitle: 'Aucun build sauvegardé',
    emptyText: 'Crée ton premier build en sélectionnant les items qui te correspondent.',
    emptyCta: 'Créer mon premier build',
    freeChampion: 'Champion libre',
    itemCount: '{count} items',
    edit: '✏️ Modifier',
    /* Badges de composition de la carte + cases à cocher de l'éditeur. */
    componentItems: 'Items',
    componentRunes: 'Runes',
    componentSkills: 'Skills',
    publish: '↑ Publier au Workshop',
    publishing: 'Publication…',
    publishTitle: 'Partager ce build dans le Workshop communauté',
    unpublish: '🗑 Dépublier',
    unpublishing: 'Retrait…',
    unpublishTitle: 'Retirer ce build du Workshop communauté',
    unpublishConfirm:
      'Retirer « {name} » du Workshop ?\n\nLe build ne sera plus visible par la communauté et ses ♥ et ↓ seront perdus. Ta copie personnelle n\'est pas affectée.',
    publishError: 'Publication impossible. Réessaie dans un instant.',
    unpublishError: 'Retrait impossible. Réessaie dans un instant.',
  },

  /* ── Éditeur : barre du haut et colonnes ── */
  editor: {
    back: '← Mes builds',
    nameLabel: 'Nom :',
    namePlaceholder: 'Mon build...',
    championPlaceholder: 'Champion ▾',
    championSearch: '🔍 Rechercher...',
    details: '📊 Détails',
    save: 'Sauver',
    saving: 'Sauvegarde…',

    componentsLabel: 'Composants :',
    componentSkills: 'Ordre de sorts',
    componentsHint: 'Coche les composants à inclure dans ton build',

    sortAsc: 'Moins cher en premier',
    sortDesc: 'Plus cher en premier',
    goldAlt: 'or',
    filtersTitle: 'Filtres',
    filtersReset: '✕ Reset',

    itemSearch: '🔍 Rechercher un item...',
    itemsLoading: 'Chargement des items Riot…',
    itemsError: 'Erreur lors du chargement des données Riot.',
    itemsEmpty: 'Aucun item trouvé',
    /* Deuxième ligne de l'infobulle d'un item de la grille (la première est son nom). */
    itemHint: 'Clic = détail · Glisse = ajouter au bloc',
    free: 'Gratuit',

    blockRemove: 'Supprimer ce bloc',
    blockDropHere: '⬇ Déposer ici',
    blockDropHint: 'Glisse des items ici',
    blockItemHint: 'Clic gauche = +1  •  Clic droit = -1',
    blockItemRemove: "Retirer l'item",
    blockAdd: '+ Ajouter un bloc',
    totalBuild: 'Total build',
  },

  /* ── Panneau « Statistiques du build » ── */
  detail: {
    title: '📊 Statistiques du build',
    totalCost: '💰 Coût total',
    offensive: '⚔️ Offensif',
    defensive: '🛡️ Défensif',
    utility: '🔧 Utilitaire',
    empty: 'Ajoute des items dans ton build pour voir les stats.',
    byBlock: '📦 Détail par bloc',
  },

  /* ── Panneau de détail d'un item ── */
  item: {
    close: 'Fermer',
    addToBlock: '+ Ajouter au bloc',
    components: '🔨 Composants requis',
    buildsInto: '⬆ Se transforme en',
  },

  /* ── SkillOrderEditor ── */
  skills: {
    title: 'Ordre des sorts',
    clearAll: 'Tout effacer',
    priorityLabel: "Priorité de max (max 3, clique dans l'ordre)",
    /* Infobulles des cases désactivées de la grille. */
    ultOnlyLevels: 'R disponible niveaux 6/11/16',
    levelReservedForUlt: 'Niveau réservé à R',
  },

  /* ── RunesEditor ── */
  runes: {
    loading: 'Chargement des runes…',
    title: 'Runes',
    clearAll: 'Tout effacer',
    primaryTree: 'Arbre primaire',
    secondaryTree: 'Arbre secondaire',
    keystone: 'Keystone',
    slot: 'Slot {n}',
    secondaryHint: 'Choisis 2 runes parmi les 3 slots (max 1 par slot). Actuellement : {count}/2.',
    shardsTitle: 'Stat shards',
    /* Noms de lignes de shards — vocabulaire Riot, identique dans les deux langues. */
    shardRowOffense: 'Offense',
    shardRowFlex: 'Flex',
    shardRowDefense: 'Defense',
    /* Repli d'infobulle quand DDragon ne renvoie ni `longDesc` ni `shortDesc`. */
    descUnavailable: 'Description indisponible',
  },
}

export type BuildsDict = typeof buildsFr

const filtersEn: Record<BuildFilterKey, string> = {
  ad: 'AD',
  ap: 'AP',
  armor: 'Armor',
  magicResist: 'Magic res.',
  health: 'Health',
  lethality: 'Lethality',
  magicPen: 'Magic pen.',
  attackSpeed: 'Atk. speed',
  crit: 'Crit',
  lifeSteal: 'Life steal',
  omnivamp: 'Omnivamp',
  moveSpeed: 'Move speed',
  mana: 'Mana',
  healthRegen: 'HP regen',
  manaRegen: 'Mana regen',
  heal: 'Healing',
  tenacity: 'Tenacity',
  adaptive: 'Adaptive',
}

const statsEn: Record<BuildStatKey, string> = {
  FlatPhysicalDamageMod: 'Attack damage',
  FlatMagicDamageMod: 'Ability power',
  FlatCritChanceMod: 'Critical strike',
  PercentAttackSpeedMod: 'Attack speed',
  PercentLifeStealMod: 'Life steal',
  FlatArmorPenetrationMod: 'Lethality',
  FlatMagicPenetrationMod: 'Magic pen.',
  FlatHPPoolMod: 'Health',
  FlatArmorMod: 'Armor',
  FlatSpellBlockMod: 'Magic resist',
  FlatHPRegenMod: 'HP regen',
  FlatMPPoolMod: 'Mana',
  FlatMovementSpeedMod: 'Move speed',
  PercentMovementSpeedMod: 'Move speed %',
}

const shardsEn: Record<ShardId, { name: string; desc: string }> = {
  5008: { name: 'Adaptive Force', desc: '+9 Adaptive Force' },
  5005: { name: 'Attack Speed', desc: '+10% attack speed' },
  5007: { name: 'Ability Haste', desc: '+8 ability haste' },
  5010: { name: 'Move Speed', desc: '+2% move speed' },
  5001: { name: 'Health (scaling)', desc: '+10-180 health (by level)' },
  5011: { name: 'Health', desc: '+65 health' },
  5013: { name: 'Tenacity & Slow Res.', desc: '+10% tenacity and slow resist' },
}

export const buildsEn: BuildsDict = {
  filters: filtersEn,
  stats: statsEn,
  shards: shardsEn,

  defaults: {
    blockStart: 'Starting items',
    blockCore: 'Core items',
    blockNumbered: 'Block {n}',
    blockFallback: 'Block',
    buildName: 'Untitled build',
    anonymousCreator: 'Anonymous',
  },

  list: {
    title: 'My builds',
    countOne: '{count} saved build',
    countOther: '{count} saved builds',
    create: '+ New build',
    loading: 'Loading your builds…',
    emptyTitle: 'No build saved yet',
    emptyText: 'Create your first build by picking the items that suit you.',
    emptyCta: 'Create my first build',
    freeChampion: 'Any champion',
    itemCount: '{count} items',
    edit: '✏️ Edit',
    componentItems: 'Items',
    componentRunes: 'Runes',
    componentSkills: 'Skills',
    publish: '↑ Publish to Workshop',
    publishing: 'Publishing…',
    publishTitle: 'Share this build in the community Workshop',
    unpublish: '🗑 Unpublish',
    unpublishing: 'Removing…',
    unpublishTitle: 'Remove this build from the community Workshop',
    unpublishConfirm:
      'Remove “{name}” from the Workshop?\n\nThe build will no longer be visible to the community and its ♥ and ↓ will be lost. Your personal copy is not affected.',
    publishError: 'Could not publish. Try again in a moment.',
    unpublishError: 'Could not remove. Try again in a moment.',
  },

  editor: {
    back: '← My builds',
    nameLabel: 'Name:',
    namePlaceholder: 'My build...',
    championPlaceholder: 'Champion ▾',
    championSearch: '🔍 Search...',
    details: '📊 Details',
    save: 'Save',
    saving: 'Saving…',

    componentsLabel: 'Components:',
    componentSkills: 'Skill order',
    componentsHint: 'Tick the components to include in your build',

    sortAsc: 'Cheapest first',
    sortDesc: 'Most expensive first',
    goldAlt: 'gold',
    filtersTitle: 'Filters',
    filtersReset: '✕ Reset',

    itemSearch: '🔍 Search an item...',
    itemsLoading: 'Loading Riot items…',
    itemsError: 'Could not load the Riot data.',
    itemsEmpty: 'No item found',
    itemHint: 'Click = details · Drag = add to a block',
    free: 'Free',

    blockRemove: 'Delete this block',
    blockDropHere: '⬇ Drop here',
    blockDropHint: 'Drag items here',
    blockItemHint: 'Left click = +1  •  Right click = -1',
    blockItemRemove: 'Remove item',
    blockAdd: '+ Add a block',
    totalBuild: 'Build total',
  },

  detail: {
    title: '📊 Build statistics',
    totalCost: '💰 Total cost',
    offensive: '⚔️ Offence',
    defensive: '🛡️ Defence',
    utility: '🔧 Utility',
    empty: 'Add items to your build to see its stats.',
    byBlock: '📦 Breakdown by block',
  },

  item: {
    close: 'Close',
    addToBlock: '+ Add to block',
    components: '🔨 Required components',
    buildsInto: '⬆ Builds into',
  },

  skills: {
    title: 'Skill order',
    clearAll: 'Clear all',
    priorityLabel: 'Max priority (up to 3, click in order)',
    ultOnlyLevels: 'R available at levels 6/11/16',
    levelReservedForUlt: 'Level reserved for R',
  },

  runes: {
    loading: 'Loading runes…',
    title: 'Runes',
    clearAll: 'Clear all',
    primaryTree: 'Primary tree',
    secondaryTree: 'Secondary tree',
    keystone: 'Keystone',
    slot: 'Slot {n}',
    secondaryHint: 'Pick 2 runes across the 3 slots (max 1 per slot). Currently: {count}/2.',
    shardsTitle: 'Stat shards',
    shardRowOffense: 'Offense',
    shardRowFlex: 'Flex',
    shardRowDefense: 'Defense',
    descUnavailable: 'Description unavailable',
  },
}
