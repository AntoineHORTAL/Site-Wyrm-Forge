/**
 * Onglets d'analyse IA : Match Up (`tabs/MatchUpTab.tsx`, `dashboard/matchup/*`) et
 * Post Game (`tabs/PostGameTab.tsx`).
 *
 * ⚠️ Ces deux onglets affichaient des messages d'erreur DÉJÀ écrits en français dans
 * les couches réseau (`src/lib/matchup/api.ts`, `src/lib/postgame/api.ts`). Ils sont
 * dans le périmètre, mais ils ne se traduisent pas là où ils étaient : ces fonctions
 * mémorisent désormais un CODE, et le message est résolu AU RENDU depuis ce dico.
 * C'est le traitement acté au Lot 2 pour `StatsTab` — un message figé à l'appel
 * resterait dans la langue d'alors si l'utilisateur bascule FR/EN ensuite.
 *
 * ⚠️ CE QUI N'EST PAS ICI, et pourquoi :
 *  - `errors.server` n'existe pas : quand l'Edge Function renvoie son propre
 *    `error`, il est affiché TEL QUEL (variante `{ kind: 'server' }`). Un message
 *    écrit par le serveur n'est pas traduisible côté client ;
 *  - le JOUR de la date de réinitialisation est produit par `Intl` (`formatReset`,
 *    `matchup/payload.ts`) dans la langue affichée depuis le Lot 8 ; seuls la phrase
 *    qui l'entoure et le gabarit `resetFormat` vivent ici ;
 *  - le texte de l'analyse elle-même vient d'Anthropic, dans la langue du prompt
 *    serveur — il ne passe pas par ce dico ;
 *  - les noms de champions et d'items viennent de DDragon, chargé dans la locale de
 *    la langue affichée depuis le Lot 8 — ils ne passent donc pas par ce dico ;
 *  - `ROLE_SHORT` (TOP/JGL/MID/ADC/SUP) et `ROLE_LABEL` (TOP/JGL/MID/ADC/SUP côté
 *    Post Game) restent dans leurs composants : ce sont des abréviations identiques
 *    dans les deux langues, et les clés qu'elles indexent partent dans le payload.
 *
 * ⚠️ DÉCISION DE VOCABULAIRE : « Chaleur de la Forge » et « braises » sont le nom et
 * l'unité du pot de crédits IA. Ce n'est pas une marque (contrairement à « Wyrm
 * Forge ») mais du vocabulaire d'univers, donc ils SE TRADUISENT — « Forge Heat »,
 * « embers ». Décision produit ACTÉE avant le Lot 6 : le nom n'est pas figé, la
 * traduction reste. AdminTab (Lot 6) n'affiche pas ce vocabulaire — rien à répercuter.
 */

/**
 * Axes du radar de comparaison (`matchup/StatRadar.tsx`), indexés par la CLÉ DE STAT
 * DDRAGON — c'est le contrat de la donnée (`RADAR_AXES` dans `stats-compare.ts`),
 * jamais un libellé. Même principe que `builds.stats` au Lot 3.
 */
const radarAxesFr = {
  hp:           'PV',
  hpregen:      'Régén PV',
  mp:           'Mana',
  mpregen:      'Régén mana',
  armor:        'Armure',
  spellblock:   'Rés. mag.',
  attackdamage: 'AD',
  attackspeed:  'Vit. att.',
  attackrange:  'Portée',
  movespeed:    'Vit. dépl.',
  crit:         'Crit',
}

export type RadarAxisKey = keyof typeof radarAxesFr

/**
 * Profondeurs et sujets de Post Game, indexés par la valeur envoyée à l'Edge
 * Function (`depth`, `mode`). ⚠️ FRONTIÈRE MÉTIER : la clé EST la valeur du
 * contrat, elle compose aussi `comboKey` (`${depth}_${mode}`) qui indexe la grille
 * de coûts. Traduire le libellé ne doit jamais toucher à la clé.
 */
const depthsFr = {
  simple:   'Simple',
  medium:   'Médium',
  advanced: 'Avancée',
}

export type PostGameDepthKey = keyof typeof depthsFr

const modesFr = {
  perso:      'Moi',
  adversaire: 'Adversaire',
  les_deux:   'Les deux',
}

export type PostGameModeKey = keyof typeof modesFr

/**
 * Messages d'échec des deux couches réseau. Les clés sont les codes mémorisés par
 * `matchup/api.ts` et `postgame/api.ts` — ajouter un cas là-bas sans l'ajouter ici
 * ne compile pas (les deux unions de codes sont dérivées de cet objet).
 */
const errorsFr = {
  signedOut:   'Connecte-toi à ton compte Wyrm Forge pour utiliser l\'analyse IA.',
  network:     'Erreur réseau — vérifie ta connexion internet.',
  service:     'Le service d\'analyse est momentanément indisponible. Réessaie dans un instant.',
  riot:        'Les données de la partie sont momentanément indisponibles. Réessaie dans un instant.',
  unexpected:  'Erreur inattendue du service d\'analyse.',
  empty:       'Analyse vide renvoyée par le service.',
  badRequest:  'Requête invalide.',
  matchNotFound: 'Partie introuvable.',
  opponentUnavailable:
    'Cette partie ne permet pas d\'identifier ton adversaire de voie (ARAM, Arena, ou rôles non détectés). Les modes « Adversaire » et « Les deux » ne sont pas disponibles ici.',
}

export type AnalyseErrorKey = keyof typeof errorsFr

export const analyseFr = {
  radarAxes: radarAxesFr,
  errors: errorsFr,

  /**
   * Pot de crédits IA — PARTAGÉ par les deux onglets : le même solde finance un
   * match up et un bilan de partie. Ces libellés sont donc communs par nature,
   * pas par économie de clés.
   */
  quota: {
    potName: 'Chaleur de la Forge',
    balanceOne: '{count} braise sur {limit}',
    balanceOther: '{count} braises sur {limit}',
    /* `{date}` reçoit `formatReset`. */
    resetShort: 'réinit. {date}',
    resetSentence: 'Réinitialisation le {date}.',
    /* Gabarit de la date de réinitialisation elle-même : `{date}` est le jour formaté
       par `Intl` dans la langue affichée, `{hh}`/`{mm}` l'heure sur 24 h. La façon de
       joindre les deux est une CONVENTION DE LANGUE (« à 14h05 », « at 14:05 ») et
       n'a donc rien à faire en dur dans `formatReset`. */
    resetFormat: '{date} à {hh}h{mm}',
    exhausted: 'Chaleur de la Forge épuisée pour cette semaine.',
    exhaustedWithCount: 'Chaleur de la Forge épuisée pour cette semaine ({used}/{limit} braises).',
    /* `{action}` reçoit `matchup.actionQuick` / `actionDetailed`, ou la combinaison
       « profondeur · sujet » de Post Game. */
    needOne: 'Il te reste {remaining} braise, il en faut {need} pour {action}.',
    needOther: 'Il te reste {remaining} braises, il en faut {need} pour {action}.',
  },

  /* ── Match Up ── */
  matchup: {
    loading: 'Chargement des champions…',
    loadError: 'Impossible de charger les données des champions. Réessaie plus tard.',

    allies: 'Alliés',
    enemies: 'Ennemis',
    /* Séparateur entre les deux colonnes — sigle identique dans les deux langues. */
    versus: 'VS',
    addSlot: '+ Ajouter',

    level: 'Niveau',
    /* Infobulle du plafond 20 réservé au Top (Role Quest S16). */
    topLevelCap: 'Role Quest Top (Season 16) : plafond 20',
    /* `{name}` = nom de champion (DDragon). */
    removeSlot: 'Retirer',
    removeSlotLabel: 'Retirer {name}',
    roleGroupLabel: 'Rôle de {name}',
    /* `{role}` = clé de rôle (TOP/JUNGLE/…), identique dans les deux langues. */
    assignRole: 'Assigner le rôle {role}',
    unassignRole: 'Retirer le rôle {role}',

    addBuild: '+ Build d\'items',
    buildDeleted: 'Build supprimé',
    buildTemp: 'Build temporaire',
    /* Suffixe d'or — abréviation Riot, identique dans les deux langues. */
    goldSuffix: 'g',

    radarTitle: 'Comparaison des stats',
    radarEmpty: 'Ajoute au moins un champion dans chaque camp pour comparer les stats.',
    radarAlt: 'Radar de comparaison des stats alliés contre ennemis',

    analysisTitle: 'Analyse IA',
    quick: 'Analyse rapide',
    detailed: 'Analyse détaillée',
    running: 'Analyse…',
    /* Employés seuls dans `{action}` de `quota.needOne` / `needOther`. */
    actionQuick: 'une analyse rapide',
    actionDetailed: 'une analyse détaillée',
    needChampions: 'Ajoute un champion dans chaque camp pour lancer une analyse.',
    truncated: '⚠ Analyse tronquée (limite de longueur atteinte).',

    /* ── Sélecteur de build (`matchup/BuildPicker.tsx`) ── */
    picker: {
      tabSaved: 'Sauvegardés',
      tabTemp: 'Temporaire',
      none: 'Aucun build',
      emptySaved:
        'Aucun build sauvegardé. Crée-en un dans l\'onglet « Builds Items », ou compose un build temporaire.',
      freeChampion: 'Champion libre',
      searchItem: 'Rechercher un item…',
      /* `{name}` = nom d'item DDragon, `{gold}` = son coût. */
      itemTitle: '{name} — {gold} g',
      countOne: '{count} item',
      countOther: '{count} items',
      apply: 'Appliquer',
    },

    /* ── Sélecteur de champion (`matchup/ChampionPicker.tsx`) ── */
    searchChampion: 'Rechercher un champion…',
    noChampionFound: 'Aucun champion trouvé.',
  },

  /* ── Post Game ── */
  postgame: {
    depths: depthsFr,
    modes: modesFr,

    noRiotAccount: 'Lie ton compte Riot depuis ta page profil pour analyser tes parties.',
    title: 'Bilan de partie',
    /* `{cost}` = coût en braises de la combinaison sélectionnée. */
    costHint: 'ce bilan en coûte {cost}',

    historyLoading: 'Chargement de ton historique…',
    historyEmpty: 'Aucune partie récente trouvée.',
    historyUnavailable: 'Historique indisponible.',
    historyNetwork: 'Erreur réseau — historique indisponible.',
    /* Initiales de résultat de la ligne de match — pendant de `common.winInitial`,
       redéclarées ici parce que la ligne les rend dans une pastille de 20 px : elles
       doivent tenir sur UN caractère, contrainte que le libellé partagé n'a pas.
       W/L dans les deux langues, comme `common.winInitial` (Lot 8). */
    win: 'W',
    loss: 'L',
    /* Repli quand `championName` manque dans la réponse de `riot-matches`. */
    unknownChampion: '—',

    depthLabel: 'Profondeur',
    modeLabel: 'Sujet',
    noLaneOpponent:
      'Cette partie n\'a pas de duel de voie (ARAM, Arena…) : seule l\'analyse « Moi » est disponible.',

    run: 'Analyser cette partie',
    running: 'Analyse…',
    /* Suggestion de repli quand la combinaison choisie n'est pas finançable.
       `{cost}` = coût de « Simple · Moi ». */
    fallbackHint: 'Une analyse Simple · moi reste à ta portée ({cost}).',
    truncated: '⚠ Analyse tronquée (limite de longueur atteinte).',
    /* En-tête du résultat : `{champion}` et `{opponent}` sont des noms DDragon. */
    resultVs: '{champion} vs {opponent}',
  },
}

export type AnalyseDict = typeof analyseFr

/**
 * Solde affiché — « 20 braises sur 135 ».
 *
 * Vit ici et non dans un composant : les DEUX onglets l'affichent, et la couche
 * réseau compose la même phrase pour son message 429. Même patron que
 * `subscriptionTierLabel` dans `nav.ts` — le dico entre en paramètre, la fonction
 * reste pure et testable.
 *
 * Le pluriel passe par deux gabarits, jamais par un `s` conditionnel : toutes les
 * langues ne pluralisent pas par suffixe.
 */
export function balanceLabel(d: AnalyseDict, remaining: number, limit: number): string {
  const tpl = remaining === 1 ? d.quota.balanceOne : d.quota.balanceOther
  return tpl.replace('{count}', String(remaining)).replace('{limit}', String(limit))
}

/**
 * « Il te reste 20 braises, il en faut 33 pour une analyse détaillée. »
 *
 * `action` reçoit `matchup.actionQuick` / `actionDetailed`, ou la combinaison
 * « profondeur · sujet » de Post Game — c'est ce qui rend la phrase actionnable.
 */
export function needLabel(d: AnalyseDict, remaining: number, need: number, action: string): string {
  const tpl = remaining === 1 ? d.quota.needOne : d.quota.needOther
  return tpl
    .replace('{remaining}', String(remaining))
    .replace('{need}', String(need))
    .replace('{action}', action)
}

const radarAxesEn: Record<RadarAxisKey, string> = {
  hp:           'HP',
  hpregen:      'HP regen',
  mp:           'Mana',
  mpregen:      'Mana regen',
  armor:        'Armor',
  spellblock:   'Magic res.',
  attackdamage: 'AD',
  attackspeed:  'Atk. speed',
  attackrange:  'Range',
  movespeed:    'Move speed',
  crit:         'Crit',
}

const depthsEn: Record<PostGameDepthKey, string> = {
  simple:   'Simple',
  medium:   'Medium',
  advanced: 'Advanced',
}

const modesEn: Record<PostGameModeKey, string> = {
  perso:      'Me',
  adversaire: 'Opponent',
  les_deux:   'Both',
}

const errorsEn: Record<AnalyseErrorKey, string> = {
  signedOut:   'Sign in to your Wyrm Forge account to use the AI analysis.',
  network:     'Network error — check your internet connection.',
  service:     'The analysis service is momentarily unavailable. Try again in a moment.',
  riot:        'The game data is momentarily unavailable. Try again in a moment.',
  unexpected:  'Unexpected error from the analysis service.',
  empty:       'The service returned an empty analysis.',
  badRequest:  'Invalid request.',
  matchNotFound: 'Game not found.',
  opponentUnavailable:
    'This game does not allow your lane opponent to be identified (ARAM, Arena, or roles not detected). The “Opponent” and “Both” modes are unavailable here.',
}

export const analyseEn: AnalyseDict = {
  radarAxes: radarAxesEn,
  errors: errorsEn,

  quota: {
    potName: 'Forge Heat',
    balanceOne: '{count} ember out of {limit}',
    balanceOther: '{count} embers out of {limit}',
    resetShort: 'resets {date}',
    resetSentence: 'Resets on {date}.',
    resetFormat: '{date} at {hh}:{mm}',
    exhausted: 'Forge Heat used up for this week.',
    exhaustedWithCount: 'Forge Heat used up for this week ({used}/{limit} embers).',
    needOne: 'You have {remaining} ember left, {need} are needed for {action}.',
    needOther: 'You have {remaining} embers left, {need} are needed for {action}.',
  },

  matchup: {
    loading: 'Loading champions…',
    loadError: 'Could not load the champion data. Try again later.',

    allies: 'Allies',
    enemies: 'Enemies',
    versus: 'VS',
    addSlot: '+ Add',

    level: 'Level',
    topLevelCap: 'Top Role Quest (Season 16): cap 20',
    removeSlot: 'Remove',
    removeSlotLabel: 'Remove {name}',
    roleGroupLabel: 'Role of {name}',
    assignRole: 'Assign the {role} role',
    unassignRole: 'Remove the {role} role',

    addBuild: '+ Item build',
    buildDeleted: 'Deleted build',
    buildTemp: 'Temporary build',
    goldSuffix: 'g',

    radarTitle: 'Stat comparison',
    radarEmpty: 'Add at least one champion to each side to compare stats.',
    radarAlt: 'Radar comparing allied and enemy stats',

    analysisTitle: 'AI analysis',
    quick: 'Quick analysis',
    detailed: 'Detailed analysis',
    running: 'Analysing…',
    actionQuick: 'a quick analysis',
    actionDetailed: 'a detailed analysis',
    needChampions: 'Add a champion to each side to run an analysis.',
    truncated: '⚠ Analysis truncated (length limit reached).',

    picker: {
      tabSaved: 'Saved',
      tabTemp: 'Temporary',
      none: 'No build',
      emptySaved:
        'No saved build. Create one in the “Builds Items” tab, or put together a temporary build.',
      freeChampion: 'Any champion',
      searchItem: 'Search an item…',
      itemTitle: '{name} — {gold} g',
      countOne: '{count} item',
      countOther: '{count} items',
      apply: 'Apply',
    },

    searchChampion: 'Search a champion…',
    noChampionFound: 'No champion found.',
  },

  postgame: {
    depths: depthsEn,
    modes: modesEn,

    noRiotAccount: 'Link your Riot account from your profile page to analyse your games.',
    title: 'Game report',
    costHint: 'this report costs {cost}',

    historyLoading: 'Loading your history…',
    historyEmpty: 'No recent game found.',
    historyUnavailable: 'History unavailable.',
    historyNetwork: 'Network error — history unavailable.',
    win: 'W',
    loss: 'L',
    unknownChampion: '—',

    depthLabel: 'Depth',
    modeLabel: 'Subject',
    noLaneOpponent:
      'This game has no lane duel (ARAM, Arena…): only the “Me” analysis is available.',

    run: 'Analyse this game',
    running: 'Analysing…',
    fallbackHint: 'A Simple · me analysis is still within reach ({cost}).',
    truncated: '⚠ Analysis truncated (length limit reached).',
    resultVs: '{champion} vs {opponent}',
  },
}
