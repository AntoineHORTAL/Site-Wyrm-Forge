/**
 * Les deux outils de PLANIFICATION PERSONNELLE du groupe « Personnalisation » :
 * Jungle Path (`tabs/JunglePathTab.tsx`) et Scénarios (`tabs/ScenariosTab.tsx`).
 *
 * Pourquoi ici et pas dans `workshop.ts` : ces deux onglets sont des ateliers privés
 * — on y dessine sur la Faille de l'invocateur et on sauvegarde POUR SOI — alors que
 * `workshop.ts` couvre les deux onglets de CONSULTATION communautaire. Le découpage
 * suit exactement les groupes de `tabGroups` (Dashboard.tsx) : `perso` d'un côté
 * (avec `builds.ts` pour le Builder), `workshop` de l'autre.
 *
 * ⚠️ CE QUI N'EST PAS ICI, et pourquoi :
 *  - `alt="Summoner's Rift"` sur l'image de map reste en dur dans les deux
 *    composants : nom propre, identique dans les deux langues ;
 *  - les noms de champions du picker viennent de DDragon chargé en `fr_FR` — ils
 *    restent français en mode EN (catégorie « locale de données », traitée au Lot 8) ;
 *  - `ROLE_LABELS` (TOP/JUNGLE/MID/ADC/SUPPORT) reste dans `ScenariosTab` : la clé
 *    de rôle EST son propre libellé, identique dans les deux langues, et cette clé
 *    est écrite en base dans `scenarios.allies` — la sortir ici laisserait croire
 *    qu'elle se traduit.
 *
 * ⚠️ `scenarios.defaults.unnamedScenario` ATTERRIT EN BASE (`scenarios.name` quand
 * l'utilisateur sauvegarde sans nommer). Comme `builds.defaults`, c'est une amorce
 * éditable, comparée nulle part : un utilisateur anglophone crée donc un scénario
 * nommé en anglais, ce qui est le comportement voulu.
 */

/* ── Jungle Path ─────────────────────────────────────────────────────────────── */

/**
 * Camps de jungle, indexés par la BASE de leur clé dans le contrat partagé avec l'app
 * (`Gromp_Blue` → `Gromp`, cf. `CAMP_BASES` dans `src/lib/jungle-path.ts`). Les deux
 * équipes partagent un libellé : le suffixe désigne la jungle, pas un autre camp.
 * Mêmes noms que l'app (`I18n/Dict.cs`, `JungleCampsDict`). Dragon et Baron n'y sont
 * pas : l'app ne leur connaît aucune position, un path ne peut pas les porter.
 *
 * ⚠️ La CLÉ ne se traduit pas : `Gromp_Blue` est écrit tel quel dans
 * `jungle_paths.elements[].Label`. Seul le libellé affiché change de langue.
 */
const campsFr = {
  BlueBuff: 'Gardien bleu',
  Gromp:    'Gromp',
  Wolves:   'Loups',
  Raptors:  'Raptors',
  RedBuff:  'Fantôme rouge',
  Krugs:    'Krugs',
  Scuttler: 'Rift Scuttler',
}

export type JungleCampKey = keyof typeof campsFr

/* Marqueurs posables sur la map, indexés par le `Label` écrit en base (`PlacementType`).
   La couleur reste dans le composant, c'est du style, pas du texte. */
const placementsFr = {
  Smite:  'Smite',
  Ward:   'Ward',
  Invade: 'Invade',
  Gank:   'Gank',
}

export type JunglePlacementKey = keyof typeof placementsFr

const jungleFr = {
  camps: campsFr,
  placements: placementsFr,

  /* ── Barre d'outils ── */
  nameLabel: 'Nom :',
  namePlaceholder: 'Mon path...',
  championLabel: 'Champion :',
  championPlaceholder: 'Vi, Hecarim...',
  sideLabel: 'Côté :',
  sideBlue: 'Bleu',
  sideRed: 'Rouge',
  toolLabel: 'Outil :',
  toolSelect: 'Sélection',
  toolDraw: 'Tracé',
  toolErase: 'Gomme',
  colorLabel: 'Couleur :',
  thicknessLabel: 'Épais. :',
  clear: 'Tout effacer',
  /* Les sorts posés dans l'app ne sont pas effacés : le site ne sait pas les reposer. */
  clearConfirm: 'Effacer les camps, marqueurs et tracés de ce path ? Les sorts posés dans l’app sont conservés.',

  /* ── Colonnes latérales ── */
  myPaths: 'Mes paths',
  newPath: '+ Nouveau',
  loadingPaths: 'Chargement…',
  noPaths: 'Aucun path pour l’instant. Dessine, nomme, puis sauvegarde.',
  /* `{team}` reçoit `sideBlue` / `sideRed`. */
  campsTeamTitle: 'Camps {team}',
  campHint: 'Clic : ajouter au parcours · re-clic : à smiter',
  removeCamp: 'Retirer {camp} du parcours',
  placeTitle: 'Placer',
  placeHint: 'Choisis un marqueur, puis clique sur la map',
  placePending: 'Clique sur la map pour poser : {marker}',
  save: 'Sauvegarder',
  saving: 'Sauvegarde…',
  delete: 'Supprimer',
  deleteConfirm: 'Supprimer « {name} » ? Cette action est définitive.',
  unsaved: 'Modifications non sauvegardées',
  discardConfirm: 'Les modifications non sauvegardées de ce path seront perdues. Continuer ?',
  saved: 'Path sauvegardé.',
  deleted: 'Path supprimé.',
  /* Info-bulle d'un sort posé dans l'app — `{spell}` reçoit son nom. */
  spellMarker: 'Sort : {spell} (posé dans l’app)',

  /**
   * Erreurs de lecture et d'écriture, indexées par `JunglePathErrorKey`
   * (`src/lib/jungle-path.ts`). Aucune écriture n'échoue en silence : une écriture que
   * la RLS écarte renvoie 0 ligne SANS erreur, d'où `notSaved` / `notDeleted`.
   */
  errors: {
    needName: 'Donne un nom à ton path avant de le sauvegarder.',
    network: 'Connexion impossible. Vérifie ta connexion puis réessaie.',
    forbidden: 'Action refusée : ce path n’appartient pas à ton compte, ou ta session a expiré.',
    invalid: 'Ce path est trop volumineux ou mal formé pour être sauvegardé.',
    conflict: 'Un path porte déjà cet identifiant. Recharge la page puis réessaie.',
    notSaved: 'Rien n’a été sauvegardé : ce path n’existe plus ou n’appartient pas à ton compte.',
    notDeleted: 'Rien n’a été supprimé : ce path n’existe plus ou n’appartient pas à ton compte.',
    loadFailed: 'Impossible de charger tes paths.',
    generic: 'Erreur inattendue, rien n’a été enregistré.',
  },
}

/* ── Scénarios ───────────────────────────────────────────────────────────────── */

/* Phases de game. La clé est écrite en base (`scenarios.drawings[].phase`). */
const phasesFr = {
  all:   'Toute la game',
  early: 'Early',
  mid:   'Mid',
  late:  'Late',
}

export type ScenarioPhaseKey = keyof typeof phasesFr

/* Outils de dessin. La clé est l'état `activeTool`, jamais le libellé. */
const scenarioToolsFr = {
  select: 'Sélection',
  ward:   'Ward',
  arrow:  'Rotation',
  zone:   'Zone',
  ping:   'Ping',
  lane:   'Lane prio.',
  erase:  'Effacer tout',
}

export type ScenarioToolKey = keyof typeof scenarioToolsFr

/* Types de ward — la clé est écrite en base (`drawings[].wardType`). */
const wardTypesFr = {
  yellow:  'Jaune',
  control: 'Contrôle',
  blue:    'Bleue',
}

export type WardTypeKey = keyof typeof wardTypesFr

/**
 * Types de ping — la clé est écrite en base (`drawings[].pingType`).
 *
 * Les capitales font partie du libellé : la puce de la barre d'outils affichait
 * jusqu'ici `pingType.toUpperCase()`, ce qui montrait la CLÉ brute (« DANGER »,
 * « HELP », « FIGHT ») y compris en français.
 */
const pingTypesFr = {
  danger: 'DANGER',
  help:   'AIDE',
  fight:  'FIGHT',
}

export type PingTypeKey = keyof typeof pingTypesFr

const scenariosFr = {
  phases: phasesFr,
  tools: scenarioToolsFr,
  wardTypes: wardTypesFr,
  pingTypes: pingTypesFr,

  /* ⚠️ Valeur initiale écrite en base — voir l'avertissement en tête de fichier. */
  defaults: {
    unnamedScenario: 'Scénario sans nom',
  },

  /* ── Vue liste ── */
  list: {
    countOne: '{count} scénario sauvegardé',
    countOther: '{count} scénarios sauvegardés',
    create: '+ Nouveau scénario',
    empty: 'Aucun scénario sauvegardé. Crée ton premier pour planifier ta macro.',
    elementCountOne: '{count} élément sur la map',
    elementCountOther: '{count} éléments sur la map',
    edit: 'Modifier',
    deleteTitle: 'Supprimer ce scénario',
  },

  /* ── Éditeur : barre du haut ── */
  editor: {
    back: '← Mes scénarios',
    nameLabel: 'Nom :',
    namePlaceholder: 'Mon scénario...',
    save: 'Sauver',
    saving: 'Sauvegarde…',
  },

  /* ── Colonne de gauche : composition ── */
  allies: {
    title: 'Alliés',
    pickChampion: 'Choisir un champion',
    enemies: 'Ennemis (juste les rôles)',
  },

  /* ── Barre d'outils de la map ── */
  toolbar: {
    typeLabel: 'Type :',
    eraseConfirm: 'Effacer tous les dessins du scénario ?',
  },

  /* Ligne d'aide sous la barre d'outils, une par outil actif. */
  hints: {
    arrowStart: 'Clique pour placer le départ de la flèche',
    arrowEnd: "Clique pour placer le point d'arrivée",
    ward: 'Clique sur la map pour placer une ward',
    ping: 'Clique sur la map pour placer un ping',
    zone: "Clique sur la map pour placer une zone d'engagement",
    lane: 'Clique sur une lane (TOP/MID/BOT) pour la prioriser',
    select: "Clique sur un dessin dans le panneau de droite pour l'éditer",
  },

  /* ── Colonne de droite : dessins posés ── */
  elements: {
    title: 'Éléments ({count})',
    empty: 'Utilise les outils pour dessiner sur la map',
    /* `{type}` reçoit un libellé de `wardTypes` / `pingTypes` ; `{lane}` reçoit la
       clé de lane (TOP/MID/BOT), technique et identique dans les deux langues. */
    ward: 'Ward {type}',
    arrow: 'Rotation',
    zone: "Zone d'engagement",
    ping: 'Ping {type}',
    lane: 'Lane {lane}',
    remove: 'Retirer cet élément',
  },

  /* ── Modale de choix de champion ── */
  picker: {
    /* `{role}` reçoit la clé de rôle (TOP/JUNGLE/…), identique dans les deux langues. */
    title: 'Choisir un champion pour {role}',
    search: '🔍 Rechercher...',
    clear: 'Retirer le champion',
  },
}

export const strategieFr = {
  jungle: jungleFr,
  scenarios: scenariosFr,
}

export type StrategieDict = typeof strategieFr

const campsEn: Record<JungleCampKey, string> = {
  BlueBuff: 'Blue Sentinel',
  Gromp:    'Gromp',
  Wolves:   'Wolves',
  Raptors:  'Raptors',
  RedBuff:  'Red Brambleback',
  Krugs:    'Krugs',
  Scuttler: 'Rift Scuttler',
}

const placementsEn: Record<JunglePlacementKey, string> = {
  Smite:  'Smite',
  Ward:   'Ward',
  Invade: 'Invade',
  Gank:   'Gank',
}

const phasesEn: Record<ScenarioPhaseKey, string> = {
  all:   'Whole game',
  early: 'Early',
  mid:   'Mid',
  late:  'Late',
}

const scenarioToolsEn: Record<ScenarioToolKey, string> = {
  select: 'Select',
  ward:   'Ward',
  arrow:  'Rotation',
  zone:   'Zone',
  ping:   'Ping',
  lane:   'Lane prio.',
  erase:  'Clear all',
}

const wardTypesEn: Record<WardTypeKey, string> = {
  yellow:  'Yellow',
  control: 'Control',
  blue:    'Blue',
}

const pingTypesEn: Record<PingTypeKey, string> = {
  danger: 'DANGER',
  help:   'HELP',
  fight:  'FIGHT',
}

export const strategieEn: StrategieDict = {
  jungle: {
    camps: campsEn,
    placements: placementsEn,

    nameLabel: 'Name:',
    namePlaceholder: 'My path...',
    championLabel: 'Champion:',
    championPlaceholder: 'Vi, Hecarim...',
    sideLabel: 'Side:',
    sideBlue: 'Blue',
    sideRed: 'Red',
    toolLabel: 'Tool:',
    toolSelect: 'Select',
    toolDraw: 'Draw',
    toolErase: 'Eraser',
    colorLabel: 'Colour:',
    thicknessLabel: 'Width:',
    clear: 'Clear all',
    clearConfirm: 'Clear this path’s camps, markers and strokes? Spells placed in the app are kept.',

    myPaths: 'My paths',
    newPath: '+ New',
    loadingPaths: 'Loading…',
    noPaths: 'No paths yet. Draw, name it, then save.',
    campsTeamTitle: '{team} camps',
    campHint: 'Click: add to the route · click again: smite it',
    removeCamp: 'Remove {camp} from the route',
    placeTitle: 'Place',
    placeHint: 'Pick a marker, then click on the map',
    placePending: 'Click on the map to drop: {marker}',
    save: 'Save',
    saving: 'Saving…',
    delete: 'Delete',
    deleteConfirm: 'Delete “{name}”? This cannot be undone.',
    unsaved: 'Unsaved changes',
    discardConfirm: 'This path’s unsaved changes will be lost. Continue?',
    saved: 'Path saved.',
    deleted: 'Path deleted.',
    spellMarker: 'Spell: {spell} (placed in the app)',

    errors: {
      needName: 'Name your path before saving it.',
      network: 'Could not connect. Check your connection and try again.',
      forbidden: 'Action denied: this path does not belong to your account, or your session has expired.',
      invalid: 'This path is too large or malformed to be saved.',
      conflict: 'A path already uses this identifier. Reload the page and try again.',
      notSaved: 'Nothing was saved: this path no longer exists or does not belong to your account.',
      notDeleted: 'Nothing was deleted: this path no longer exists or does not belong to your account.',
      loadFailed: 'Could not load your paths.',
      generic: 'Unexpected error, nothing was saved.',
    },
  },

  scenarios: {
    phases: phasesEn,
    tools: scenarioToolsEn,
    wardTypes: wardTypesEn,
    pingTypes: pingTypesEn,

    defaults: {
      unnamedScenario: 'Untitled scenario',
    },

    list: {
      countOne: '{count} saved scenario',
      countOther: '{count} saved scenarios',
      create: '+ New scenario',
      empty: 'No scenario saved yet. Create your first one to plan your macro.',
      elementCountOne: '{count} element on the map',
      elementCountOther: '{count} elements on the map',
      edit: 'Edit',
      deleteTitle: 'Delete this scenario',
    },

    editor: {
      back: '← My scenarios',
      nameLabel: 'Name:',
      namePlaceholder: 'My scenario...',
      save: 'Save',
      saving: 'Saving…',
    },

    allies: {
      title: 'Allies',
      pickChampion: 'Pick a champion',
      enemies: 'Enemies (roles only)',
    },

    toolbar: {
      typeLabel: 'Type:',
      eraseConfirm: 'Clear every drawing of this scenario?',
    },

    hints: {
      arrowStart: 'Click to set the start of the arrow',
      arrowEnd: 'Click to set the end point',
      ward: 'Click on the map to place a ward',
      ping: 'Click on the map to place a ping',
      zone: 'Click on the map to place an engage zone',
      lane: 'Click a lane (TOP/MID/BOT) to prioritise it',
      select: 'Click a drawing in the right-hand panel to edit it',
    },

    elements: {
      title: 'Elements ({count})',
      empty: 'Use the tools to draw on the map',
      ward: 'Ward {type}',
      arrow: 'Rotation',
      zone: 'Engage zone',
      ping: 'Ping {type}',
      lane: 'Lane {lane}',
      remove: 'Remove this element',
    },

    picker: {
      title: 'Pick a champion for {role}',
      search: '🔍 Search...',
      clear: 'Remove champion',
    },
  },
}
