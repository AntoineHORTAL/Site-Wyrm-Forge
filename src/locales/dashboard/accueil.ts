/**
 * Onglets « légers » du dashboard : Accueil, To-Do Lists, Stats, Overlay,
 * Historique, Patch Notes.
 *
 * Regroupés parce qu'ils portent peu de texte chacun (4 à 21 chaînes) et qu'un
 * module par onglet donnerait une dizaine de fichiers de trois lignes. Un
 * sous-espace par onglet à l'intérieur : `d.accueil.todo.newList`.
 *
 * ⚠️ Restent VOLONTAIREMENT en dur dans les composants, parce qu'ils s'écrivent à
 * l'identique dans les deux langues : les unités et sigles d'esport (CS, KDA, KP,
 * Vision, `W`/`L`), les abréviations de rôle (TOP/JGL/MID/ADC/SUP), les codes de
 * région (EUW, NA…), les multikills (PENTAKILL/QUADRA/TRIPLE) et l'exemple de
 * format `GameName#EUW`. Les faire transiter par le dico n'ajouterait que des
 * exceptions dans la liste d'invariants du test.
 */
export const accueilFr = {
  /* ── AccueilTab ── */
  accueil: {
    rotationTitle: 'Rotation gratuite',
    rotationSubtitle: 'Champions disponibles cette semaine',
    rotationLoading: 'Chargement de la rotation…',
    rotationUnavailable: 'Rotation indisponible — clé API non configurée ou expirée.',

    matchesTitle: 'Mes dernières parties',
    change: 'Changer',
    riotPrompt: 'Saisis ton Riot ID pour voir ton historique de parties.',
    riotSubmit: 'Valider',
    riotNotLogged: 'Connecte-toi pour que ton Riot ID soit sauvegardé.',

    /* Messages d'erreur affichés à l'utilisateur (pas des codes techniques). */
    errorFormat: 'Format invalide — utilise GameName#TAG',
    errorAuth: "Connexion requise pour voir l'historique.",
    errorRiot: 'Erreur Riot API',
    errorUnreachable: "Impossible de joindre l'API Riot.",

    /* Cartes de synthèse au-dessus de la liste. */
    kpiGames: 'Parties',
    kpiWins: 'Victoires',
    kpiWinrate: 'Winrate',
    kpiKda: 'KDA moy.',
    kpiCs: 'CS moy.',

    listLoading: 'Chargement des parties…',
    listLoadingMore: 'Chargement des parties suivantes…',
    listLoadMore: 'Charger {count} parties de plus',
    listEnd: "Fin de l'historique — {count} parties affichées",
    listLimit: 'Limite atteinte ({count} parties affichées)',
    listEmpty: 'Aucune partie trouvée récemment.',

    /* Ancienneté d'une partie — `{n}` est déjà arrondi par le composant. */
    agoLessThanHour: "il y a moins d'1h",
    agoHours: 'il y a {n}h',
    agoDays: 'il y a {n}j',
  },

  /* ── TodoTab ── */
  todo: {
    myLists: 'Mes listes',
    empty: 'Aucune liste — crée-en une à droite.',
    active: 'Actif',
    /* Pluriel géré par deux clés : le français et l'anglais accordent au même seuil. */
    itemCountOne: '{count} élément',
    itemCountOther: '{count} éléments',
    deactivate: 'Désactiver',
    setActive: 'Définir active',
    realtime: 'Synchronisé en temps réel',

    newList: 'Nouvelle liste',
    fieldTitle: 'Titre',
    fieldDescription: 'Description',
    fieldItems: 'Éléments (max 5)',
    placeholderTitle: 'Nom de la liste...',
    placeholderDescription: 'Description optionnelle...',
    placeholderItem: 'Élément {n}...',
    creating: 'Création…',
    create: 'Créer la liste',
  },

  /* ── StatsTab ── */
  stats: {
    loading: 'Chargement des statistiques…',
    errorAuth: 'Tu dois être connecté.',
    errorSession: 'Session expirée.',
    errorRiot: 'Erreur Riot API.',
    errorLoad: 'Erreur lors du chargement des stats.',
    empty: 'Aucune partie trouvée. Lance quelques games puis reviens !',

    kpiAnalysed: 'Parties analysées',
    kpiWinrate: 'Winrate',
    kpiWins: 'Victoires',
    kpiKda: 'KDA moyen',
    kpiCsPerMin: 'CS / min',
    kpiVision: 'Score vision',
    kpiDamage: 'Dégâts/partie',

    trendTitle: 'Tendance — partie la + récente à gauche',
    champsTitle: 'Champions joués ({count} différents)',
    /* En-têtes de la table des champions — MÊME ORDRE que les colonnes rendues. */
    champsColumns: ['Champion', 'Parties', 'Winrate', 'KDA', 'CS/min'],

    roleTitle: 'Distribution par rôle',
    queueTitle: 'Modes de jeu',
    gameOne: 'partie',
    gameOther: 'parties',
    /* Repli quand `queueName` (résolu côté serveur) est absent. */
    queueUnknown: 'Inconnu',

    noRiotTitle: 'Aucun compte Riot lié',
    noRiotText: "Lie ton Riot ID (GameName#TAG) depuis l'onglet Accueil ou la page profil pour voir tes stats.",
    noRiotCta: 'Aller à mon profil',
  },

  /* ── OverlayTab ── ⚠️ écran actuellement INATTEIGNABLE (voir dashboard.test.ts). */
  overlay: {
    intro: 'Importe un overlay de la communauté ou crée le tien depuis zéro.',
    by: 'par {author}',
    uses: '{count} utilisations',
  },

  /* ── HistoriqueTab ── ⚠️ écran actuellement INATTEIGNABLE (voir dashboard.test.ts). */
  historique: {
    statGames: 'Parties jouées',
    statWinrate: 'Winrate',
    statKda: 'KDA moyen',
    statCsPerMin: 'CS/min',
  },

  /* ── PatchNotesTab ── */
  patchnotes: {
    loading: 'Chargement des patch notes…',
    emptyTitle: 'Aucun patch notes publié',
    emptyText: 'Les résumés des prochaines mises à jour apparaîtront ici.',
    publishedOn: 'Publié le {date}',
    fullscreen: 'Plein écran',
    export: 'Exporter',
    exportPng: 'Image (PNG)',
    exportPdf: 'PDF',
    close: 'Fermer',
  },
}

export type AccueilDict = typeof accueilFr

export const accueilEn: AccueilDict = {
  accueil: {
    rotationTitle: 'Free champion rotation',
    rotationSubtitle: 'Champions available this week',
    rotationLoading: 'Loading rotation…',
    rotationUnavailable: 'Rotation unavailable — API key missing or expired.',

    matchesTitle: 'My recent games',
    change: 'Change',
    riotPrompt: 'Enter your Riot ID to see your match history.',
    riotSubmit: 'Confirm',
    riotNotLogged: 'Log in to save your Riot ID.',

    errorFormat: 'Invalid format — use GameName#TAG',
    errorAuth: 'You must be logged in to see your history.',
    errorRiot: 'Riot API error',
    errorUnreachable: 'Could not reach the Riot API.',

    kpiGames: 'Games',
    kpiWins: 'Wins',
    kpiWinrate: 'Win rate',
    kpiKda: 'Avg. KDA',
    kpiCs: 'Avg. CS',

    listLoading: 'Loading games…',
    listLoadingMore: 'Loading more games…',
    listLoadMore: 'Load {count} more games',
    listEnd: 'End of history — {count} games shown',
    listLimit: 'Limit reached ({count} games shown)',
    listEmpty: 'No recent games found.',

    agoLessThanHour: 'less than 1h ago',
    agoHours: '{n}h ago',
    agoDays: '{n}d ago',
  },

  todo: {
    myLists: 'My lists',
    empty: 'No list yet — create one on the right.',
    active: 'Active',
    itemCountOne: '{count} item',
    itemCountOther: '{count} items',
    deactivate: 'Deactivate',
    setActive: 'Set as active',
    realtime: 'Synced in real time',

    newList: 'New list',
    fieldTitle: 'Title',
    fieldDescription: 'Description',
    fieldItems: 'Items (max 5)',
    placeholderTitle: 'List name...',
    placeholderDescription: 'Optional description...',
    placeholderItem: 'Item {n}...',
    creating: 'Creating…',
    create: 'Create list',
  },

  stats: {
    loading: 'Loading statistics…',
    errorAuth: 'You must be logged in.',
    errorSession: 'Session expired.',
    errorRiot: 'Riot API error.',
    errorLoad: 'Could not load your stats.',
    empty: 'No games found. Play a few and come back!',

    kpiAnalysed: 'Games analysed',
    kpiWinrate: 'Win rate',
    kpiWins: 'Wins',
    kpiKda: 'Average KDA',
    kpiCsPerMin: 'CS / min',
    kpiVision: 'Vision score',
    kpiDamage: 'Damage/game',

    trendTitle: 'Trend — most recent game on the left',
    champsTitle: 'Champions played ({count} different)',
    champsColumns: ['Champion', 'Games', 'Win rate', 'KDA', 'CS/min'],

    roleTitle: 'Role distribution',
    queueTitle: 'Game modes',
    gameOne: 'game',
    gameOther: 'games',
    queueUnknown: 'Unknown',

    noRiotTitle: 'No Riot account linked',
    noRiotText: 'Link your Riot ID (GameName#TAG) from the Home tab or your profile page to see your stats.',
    noRiotCta: 'Go to my profile',
  },

  overlay: {
    intro: 'Import a community overlay or build your own from scratch.',
    by: 'by {author}',
    uses: '{count} uses',
  },

  historique: {
    statGames: 'Games played',
    statWinrate: 'Win rate',
    statKda: 'Average KDA',
    statCsPerMin: 'CS/min',
  },

  patchnotes: {
    loading: 'Loading patch notes…',
    emptyTitle: 'No patch notes published',
    emptyText: 'Summaries of upcoming updates will appear here.',
    publishedOn: 'Published on {date}',
    fullscreen: 'Fullscreen',
    export: 'Export',
    exportPng: 'Image (PNG)',
    exportPdf: 'PDF',
    close: 'Close',
  },
}
