/**
 * La Forge — onglet Écailles (`tabs/EcaillesTab.tsx`) ET ses quatre panneaux
 * (`components/ecailles/` : BalanceHistory, QuestsPanel, ShopPanel, EquipmentPanel).
 *
 * ⚠️ Les noms de quêtes et de cosmétiques viennent de la BASE
 * (`quest_definitions.name`, `cosmetics.name`, `cosmetics.description`) et ne
 * passeront JAMAIS par ce dico : les traduire supposerait une colonne de traduction
 * côté Supabase, donc un changement de schéma partagé avec l'app WPF.
 *
 * ⚠️ Les tables `sources`, `rarities`, `types` et `typesPlural` sont indexées par une
 * VALEUR MÉTIER (`scales_ledger.source`, `cosmetics.rarity`, `cosmetics.type`). Ces
 * clés sont le contrat de la base : on traduit ce qui s'affiche, jamais la clé. Une
 * valeur absente de la table s'affiche telle quelle plutôt que vide.
 *
 * Décision produit actée : « Écailles » → « Scales », « La Forge » → « The Forge ».
 */
export const ecaillesFr = {
  /* Sous-vues — les `id` (`balance`/`quetes`/`boutique`/`equipement`) sont
     structurels et pilotent l'état local : seuls ces libellés changent. */
  viewBalance: 'Solde & Historique',
  viewQuests: 'Quêtes',
  viewShop: 'Boutique',
  viewEquipment: 'Mon Équipement',

  /* Écran affiché aux non-admins quand le flag `ecailles_enabled` est à false. */
  soonTitle: 'La Forge arrive bientôt',
  soonText: "Le système d'Écailles, les quêtes journalières et la boutique de cosmétiques seront disponibles prochainement.",

  /* Texte alternatif de l'icône de monnaie, réutilisé par les panneaux. */
  scalesAlt: 'Écailles',

  /* ── BalanceHistory ── */
  balance: {
    yourBalance: 'Ton solde',
    historyTitle: 'Historique',
    empty: 'Aucune transaction — complète tes premières quêtes !',
    loadMore: 'Charger plus',
    /* Indexé par `scales_ledger.source`. */
    sources: {
      quest: 'Quête',
      shop: 'Boutique',
      tournament: 'Tournoi',
      admin: 'Administrateur',
      purchase: 'Achat',
    },
  },

  /* ── QuestsPanel ── */
  quests: {
    disabled: 'Les quêtes sont temporairement désactivées.',
    /* Encadre le nom de l'onglet Accueil, rendu en gras entre les deux fragments. */
    riotLinkBefore: "Lie ton compte Riot dans l'onglet",
    riotLinkAfter: 'pour débloquer les quêtes LoL.',
    streakZero: '0 jour de streak',
    streakOne: '{count} jour de streak',
    streakOther: '{count} jours de streak',
    streakHint: 'Complète une quête chaque jour pour maintenir ton streak',
    capProgress: '{earned} / {cap} Écailles',
    rewardLabel: 'Récompense :',
    rewardValue: '+{count} Écailles',
    claimed: '✓ Réclamée',
    claiming: 'En cours…',
    claim: 'Réclamer',
    empty: 'Aucune quête disponible.',
    /* Messages d'échec du claim — voir le mapping dans QuestsPanel. */
    errUnexpected: 'Erreur inattendue',
    errAlreadyClaimed: "Déjà réclamée aujourd'hui",
    errCap: 'Plafond journalier atteint',
    errDisabled: 'Quêtes temporairement désactivées',
    errNotToday: "Quête non disponible aujourd'hui",
    errCondition: 'Condition non remplie',
  },

  /* ── ShopPanel ── */
  shop: {
    closed: 'La boutique est temporairement fermée.',
    emptyTitle: 'La boutique se prépare',
    emptyText: 'Les cosmétiques arrivent bientôt. Accumule tes Écailles en attendant !',
    owned: '✓ Possédé',
    buying: 'Achat…',
    buy: 'Acheter',
    errUnexpected: 'Erreur inattendue',
    errBalance: 'Solde insuffisant',
    errOwned: 'Déjà possédé',
    errUnavailable: 'Cosmétique indisponible',
    /* Indexé par `cosmetics.rarity`. */
    rarities: {
      common: 'Commun',
      rare: 'Rare',
      legendary: 'Légendaire',
    },
    /* Indexé par `cosmetics.type` — au singulier (une carte = un cosmétique). */
    types: {
      badge: 'Badge',
      avatar: 'Avatar',
      avatar_frame: "Cadre d'avatar",
      avatar_anim: 'Avatar animé',
    },
  },

  /* ── EquipmentPanel ── */
  equipment: {
    emptyTitle: 'Inventaire vide',
    emptyText: 'Achète des cosmétiques dans la boutique pour les équiper ici.',
    badgeLimit: "5 badges max — retire un badge avant d'en équiper un autre.",
    equipped: 'Équipé',
    equip: 'Équiper',
    unequip: 'Retirer',
    /* Même indexation que `shop.types`, mais au PLURIEL : ce sont des en-têtes de
       section qui regroupent plusieurs objets. */
    typesPlural: {
      badge: 'Badges',
      avatar: 'Avatars',
      avatar_frame: "Cadres d'avatar",
      avatar_anim: 'Avatars animés',
    },
  },
}

export type EcaillesDict = typeof ecaillesFr

export const ecaillesEn: EcaillesDict = {
  viewBalance: 'Balance & History',
  viewQuests: 'Quests',
  viewShop: 'Shop',
  viewEquipment: 'My Equipment',

  soonTitle: 'The Forge is coming soon',
  soonText: 'Scales, daily quests and the cosmetics shop will be available soon.',

  scalesAlt: 'Scales',

  balance: {
    yourBalance: 'Your balance',
    historyTitle: 'History',
    empty: 'No transaction yet — complete your first quests!',
    loadMore: 'Load more',
    sources: {
      quest: 'Quest',
      shop: 'Shop',
      tournament: 'Tournament',
      admin: 'Administrator',
      purchase: 'Purchase',
    },
  },

  quests: {
    disabled: 'Quests are temporarily disabled.',
    riotLinkBefore: 'Link your Riot account from the',
    riotLinkAfter: 'tab to unlock LoL quests.',
    streakZero: 'No streak yet',
    streakOne: '{count}-day streak',
    streakOther: '{count}-day streak',
    streakHint: 'Complete a quest every day to keep your streak going',
    capProgress: '{earned} / {cap} Scales',
    rewardLabel: 'Reward:',
    rewardValue: '+{count} Scales',
    claimed: '✓ Claimed',
    claiming: 'Claiming…',
    claim: 'Claim',
    empty: 'No quest available.',
    errUnexpected: 'Unexpected error',
    errAlreadyClaimed: 'Already claimed today',
    errCap: 'Daily cap reached',
    errDisabled: 'Quests temporarily disabled',
    errNotToday: 'Quest not available today',
    errCondition: 'Requirement not met',
  },

  shop: {
    closed: 'The shop is temporarily closed.',
    emptyTitle: 'The shop is getting ready',
    emptyText: 'Cosmetics are coming soon. Stack up your Scales in the meantime!',
    owned: '✓ Owned',
    buying: 'Buying…',
    buy: 'Buy',
    errUnexpected: 'Unexpected error',
    errBalance: 'Not enough Scales',
    errOwned: 'Already owned',
    errUnavailable: 'Cosmetic unavailable',
    rarities: {
      common: 'Common',
      rare: 'Rare',
      legendary: 'Legendary',
    },
    types: {
      badge: 'Badge',
      avatar: 'Avatar',
      avatar_frame: 'Avatar frame',
      avatar_anim: 'Animated avatar',
    },
  },

  equipment: {
    emptyTitle: 'Empty inventory',
    emptyText: 'Buy cosmetics in the shop to equip them here.',
    badgeLimit: '5 badges max — remove one before equipping another.',
    equipped: 'Equipped',
    equip: 'Equip',
    unequip: 'Remove',
    typesPlural: {
      badge: 'Badges',
      avatar: 'Avatars',
      avatar_frame: 'Avatar frames',
      avatar_anim: 'Animated avatars',
    },
  },
}
