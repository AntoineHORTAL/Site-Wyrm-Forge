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
 * Camps de jungle, indexés par une clé INTERNE et non par leur nom affiché.
 * `scuttler` apparaît dans les deux colonnes (bleue et rouge) : une seule entrée
 * pour les deux, la composition des colonnes vit dans `JunglePathTab`.
 */
const campsFr = {
  gromp:          'Gromp',
  wolves:         'Loups',
  blueSentinel:   'Gardien',
  scuttler:       'Rift Scuttler',
  dragon:         'Dragon',
  krug:           'Krug',
  raptors:        'Raptor',
  redBrambleback: 'Fantôme Rouge',
  baron:          'Baron',
}

export type JungleCampKey = keyof typeof campsFr

/* Marqueurs posables sur la map. Clé interne ; la couleur reste dans le composant,
   c'est du style, pas du texte. */
const placementsFr = {
  smite:  'Smite',
  ward:   'Ward',
  invade: 'Invade',
  gank:   'Gank',
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
  clear: 'Annuler',

  /* ── Colonnes latérales ── */
  myPaths: 'Mes paths',
  campsBlueTitle: 'Camps Bleu',
  campsRedTitle: 'Camps Rouge',
  placeTitle: 'Placer',
  placeHint: 'Clique sur la map pour placer un marqueur',
  save: 'Sauvegarder',

  /**
   * ⚠️ DONNÉES DE DÉMONSTRATION, pas des paths réels : `savedPaths` est un tableau
   * en dur dans `JunglePathTab`, sans persistance ni clic. Ces noms sont ici parce
   * qu'ils sont AFFICHÉS ; ils disparaîtront avec le branchement de la vraie liste.
   */
  demoPathNames: ['Full clear côté bleu', 'Invade côté rouge'],
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

  /* Écran « bientôt » du flag de lancement `scenarios_enabled` (off_behavior
     'hidden') : visible UNIQUEMENT sur accès direct, l'entrée de navigation
     étant absente tant que la feature n'est pas ouverte. Pendant exact de
     `ecailles.soonTitle` / `soonText`. */
  soonTitle: 'Les Scénarios arrivent bientôt',
  soonText:  'La planification de macro sur la carte — wards, rotations, zones d\'engagement — sera disponible prochainement.',

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
  gromp:          'Gromp',
  wolves:         'Wolves',
  blueSentinel:   'Blue Sentinel',
  scuttler:       'Rift Scuttler',
  dragon:         'Dragon',
  krug:           'Krug',
  raptors:        'Raptor',
  redBrambleback: 'Red Brambleback',
  baron:          'Baron',
}

const placementsEn: Record<JunglePlacementKey, string> = {
  smite:  'Smite',
  ward:   'Ward',
  invade: 'Invade',
  gank:   'Gank',
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
    clear: 'Clear',

    myPaths: 'My paths',
    campsBlueTitle: 'Blue camps',
    campsRedTitle: 'Red camps',
    placeTitle: 'Place',
    placeHint: 'Click on the map to drop a marker',
    save: 'Save',

    demoPathNames: ['Blue side full clear', 'Red side invade'],
  },

  scenarios: {
    phases: phasesEn,
    tools: scenarioToolsEn,
    wardTypes: wardTypesEn,
    pingTypes: pingTypesEn,

    defaults: {
      unnamedScenario: 'Untitled scenario',
    },

    soonTitle: 'Scenarios are coming soon',
    soonText:  'Macro planning on the map — wards, rotations, engage zones — will be available soon.',

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
