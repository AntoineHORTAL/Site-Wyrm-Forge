/**
 * Dictionnaire de la page `/guide` — FR (fait foi) et EN.
 *
 * La STRUCTURE (ordre, ancres, flags) vit dans `src/lib/guide.ts` ; ce fichier ne
 * porte que le texte, apparié par `id`. Typer `entries` en
 * `Record<GuideEntryId, …>` fait d'une sous-section sans texte — dans l'une ou
 * l'autre langue — une ERREUR DE COMPILATION ; `guide.test.ts` le revérifie à
 * l'exécution (champs vides compris).
 *
 * 🔴 RÈGLES DE CONTENU (chantier guide, 2026-10-02) :
 *  - point de vue JOUEUR : aucun terme technique (API, base, services, fichiers) ;
 *  - uniquement ce qui est LIVE en prod ; aucune promesse, aucun « bientôt » ;
 *  - tutoiement ;
 *  - les libellés cités entre « » sont ceux de l'interface À LA VERSION de l'app
 *    indiquée dans `src/lib/guide-release.ts` — les relire à chaque mise à jour.
 */

import type { GuideEntryId, GuideGroupId, GuideSectionId } from '../lib/guide'
import type { Lang } from './landing'

export interface GuideEntryText {
  /** Nom joueur de la fonctionnalité — titre de la sous-section et entrée de sommaire. */
  name: string
  /** À quoi ça sert — 1 à 2 phrases. */
  purpose: string
  /** Où le trouver. */
  where: string
  /** Palier, quand il diffère du palier par défaut (`defaultTier`). */
  tier?: string
  /** Comment l'utiliser — étapes concrètes. */
  steps: string[]
  /**
   * Étapes affichées seulement si le flag IA de l'entrée (`aiFlag` dans
   * `lib/guide.ts`) est actif. Coupé, elles disparaissent avec `aiTier`.
   */
  aiSteps?: string[]
  /** Palier affiché à la place de `tier` / `defaultTier` quand la partie IA est active. */
  aiTier?: string
  /** Ce que tu vois en jeu — absent quand ça ne s'applique pas. */
  inGame?: string
  /** Mise en garde explicite (non-synchronisation, langue…). */
  note?: string
  /** Description de la capture d'écran attendue (placeholder visible). */
  screenshot: string
}

export interface GuideDict {
  meta: { title: string; description: string }
  eyebrow: string
  title: string
  titleAccent: string
  intro: string
  /** `{date}` = date formatée dans la langue affichée. */
  updated: string
  /** `{version}` = `GUIDE_APP_VERSION`. */
  version: string
  tocTitle: string
  /** Libellé accessible (aria-label) du bouton flottant « retour au sommaire ». */
  backToToc: string
  sections: Record<GuideSectionId, { title: string; blurb: string }>
  groups: Record<GuideGroupId, string>
  /** Lien de téléchargement affiché en tête de la section app. */
  downloadCta: string
  labels: {
    purpose: string
    where: string
    tier: string
    steps: string
    inGame: string
    note: string
    screenshot: string
  }
  defaultTier: string
  entries: Record<GuideEntryId, GuideEntryText>
}

/* Palier des fonctionnalités IA — la SEULE différence réelle entre paliers
   (décision du 2026-10-02). Chiffres = `TIER_CONFIG` des Edge Functions
   matchup-analyze / postgame-analyze, déjà verrouillés contre la grille
   tarifaire par `landing.test.ts`. */
const AI_TIER_FR =
  "Gratuit (Apprenti). L'analyse IA consomme des braises de « Chaleur de la Forge » : 15 par semaine en Apprenti, 65 en Forgeron, 135 en Maître. Les braises sont communes au Match Up et au Bilan IA."
const AI_TIER_EN =
  'Free (Apprentice). AI analysis uses embers of “Forge Heat”: 15 per week on Apprentice, 65 on Blacksmith, 135 on Master. Embers are shared between Match Up and AI review.'

const fr: GuideDict = {
  meta: {
    title: "Guide d'utilisation — Wyrm Forge",
    description:
      "Comment utiliser Wyrm Forge, fonctionnalité par fonctionnalité : builds, Match Up, Workshop, partie en direct, et l'overlay en jeu de l'app Windows (timers d'objectifs, gold diff, parcours jungle, sorts ennemis…).",
  },
  eyebrow: 'Guide',
  title: 'Guide',
  titleAccent: "d'utilisation",
  intro:
    "Tout ce que Wyrm Forge sait faire aujourd'hui, fonctionnalité par fonctionnalité : à quoi ça sert, où le trouver, comment t'en servir et ce que tu verras en partie. Le site s'utilise dans ton navigateur ; l'app Windows ajoute l'overlay en jeu.",
  updated: 'Dernière mise à jour : {date}',
  version: "Correspond à l'app v{version}",
  tocTitle: 'Sommaire',
  backToToc: 'Retour au sommaire',
  sections: {
    commun: {
      title: 'Sur le site et dans l’app',
      blurb:
        "Ces fonctionnalités existent des deux côtés. Connecte-toi avec le même compte Wyrm Forge sur le site et dans l'app pour retrouver tes builds partout.",
    },
    site: {
      title: 'Uniquement sur le site',
      blurb: 'Ces fonctionnalités se trouvent uniquement sur wyrm-forge.com, dans ton navigateur.',
    },
    app: {
      title: "Uniquement dans l'app",
      blurb:
        "Ces fonctionnalités se trouvent uniquement dans l'app Windows, qui tourne à côté de League of Legends.",
    },
  },
  groups: {
    objectifs: 'Objectifs',
    combat: 'Combat',
    jungle: 'Jungle',
    suivi: 'Ton build et ton suivi',
    'avant-partie': 'Avant la partie',
  },
  downloadCta: "Télécharger l'app pour Windows",
  labels: {
    purpose: 'À quoi ça sert',
    where: 'Où le trouver',
    tier: 'Palier',
    steps: "Comment l'utiliser",
    inGame: 'Ce que tu vois en jeu',
    note: 'À savoir :',
    screenshot: "Capture d'écran à venir",
  },
  defaultTier: 'Gratuit (Apprenti)',
  entries: {
    // ── Commun ────────────────────────────────────────────────────────────
    builds: {
      name: "Builds d'objets",
      purpose:
        "Prépare tes builds pour chaque champion — objets, et si tu veux runes et ordre des sorts — et retrouve-les en partie.",
      where: "Site : tableau de bord → Builder. App : onglet « Builds Items ».",
      steps: [
        'Crée un build : donne-lui un nom, choisis un champion, puis range tes objets par blocs (objets de départ, objets cœur…).',
        'Ajoute si tu veux des runes : sur le site, coche les composants à inclure (objets, runes, ordre des sorts) ; dans l’app, utilise le bouton « 🔮 Runes ».',
        "Les builds sont enregistrés sur ton compte : ceux créés sur le site apparaissent dans l'app, et inversement, dès que tu es connecté.",
        "Dans l'app, clique sur « Activer » pour qu'un build serve en partie. Si plusieurs builds sont actifs pour un même champion, l'ordre (flèches ↑ ↓) décide lequel passe en premier.",
        "Un build sans champion ne s'affiche jamais en jeu : pense à en choisir un.",
      ],
      inGame:
        "Le build actif n°1 du champion que tu joues s'affiche dans l'overlay (voir « Ton build en jeu »). Il sert aussi à remplir tes runes et tes sets d'objets au moment du pick.",
      screenshot:
        "L'onglet « Builds Items » de l'app avec un build marqué « ✓ Actif » et les flèches d'ordre, à côté de l'éditeur de build du site.",
    },
    champions: {
      name: 'Champions',
      purpose: 'Parcours tous les champions de League of Legends : statistiques, sorts, histoire et conseils.',
      where: "Site : page Champions (accessible sans compte). App : onglet « Champions ».",
      steps: [
        'Cherche un champion par son nom, ou trie et filtre la liste.',
        'Ouvre sa fiche pour voir ses statistiques, ses sorts, son histoire et des conseils pour le jouer ou jouer contre lui.',
      ],
      screenshot: 'La page Champions du site avec la recherche, et la fiche d’un champion ouverte.',
    },
    'patch-notes': {
      name: 'Patch notes',
      purpose:
        'Lis un résumé clair de chaque patch de League of Legends : champions, objets, runes et changements système.',
      where:
        "Site : page Patch notes et onglet « Patch Notes » du tableau de bord. App : onglet « Patch Notes ».",
      steps: [
        'Ouvre la page ou l’onglet : les patchs les plus récents sont en haut.',
        "Dans le tableau de bord du site, tu peux afficher un patch en plein écran ou l'exporter en image (PNG) ou en PDF.",
      ],
      screenshot: 'Un patch ouvert, avec ses faits marquants et ses sections Champions / Items / Runes.',
    },
    'partie-en-direct': {
      name: 'Partie en direct',
      purpose:
        'Vois qui joue dans une partie en cours : les deux équipes, les dix champions et le rang de chaque joueur.',
      where:
        "App : onglet « Partie en direct ». Site : page d'un joueur → lien « Partie en direct ».",
      steps: [
        "Dans l'app, lance une partie : l'onglet « Partie en direct » affiche automatiquement la composition des deux équipes, puis les rangs.",
        "Sur le site, cherche un joueur, ouvre sa page, puis clique sur « Partie en direct » : s'il est en partie, la composition s'affiche.",
        "En partie personnalisée ou dans l'outil d'entraînement, les rangs ne sont pas disponibles.",
      ],
      inGame:
        "Rien ne s'ajoute à l'overlay : la composition reste dans la fenêtre de l'app, que tu peux consulter pendant l'écran de chargement.",
      screenshot: "L'onglet « Partie en direct » de l'app avec l'équipe bleue, l'équipe rouge et les rangs.",
    },
    'match-up': {
      name: 'Match Up',
      purpose:
        'Compare ton équipe et l’équipe adverse champion par champion pour préparer ta façon de jouer la partie.',
      where: "Site : tableau de bord → Match Up. App : onglet « Match Up ».",
      aiTier: AI_TIER_FR,
      steps: [
        'Ajoute des champions dans le camp des alliés et dans celui des ennemis, avec leur niveau et, si tu veux, un build.',
        'Le radar et le tableau comparent les statistiques des deux camps.',
        "Dans l'app, « 🔍 Détecter » remplit les deux camps depuis ta partie en cours, et « 💾 Sauver » garde le match up dans ta liste, sur ton PC.",
      ],
      aiSteps: [
        'Lance une « Analyse rapide » ou une « Analyse détaillée » : si ton solde de braises ne suffit pas, le nombre nécessaire s’affiche. Ton solde se recharge chaque semaine.',
      ],
      screenshot: 'Le Match Up du site avec deux alliés, deux ennemis et le radar de comparaison des stats.',
    },
    'workshop-builds': {
      name: 'Workshop Builds',
      purpose: 'Trouve des builds partagés par d’autres joueurs, importe-les, et partage les tiens.',
      where: "Site : tableau de bord → Workshop Builds. App : onglet « Workshop Builds ».",
      steps: [
        'Cherche un build par son nom ou par champion.',
        'Clique sur « Importer le build » (connexion requise) : il rejoint tes propres builds.',
        "Pour partager un de tes builds, clique sur « Publier » depuis ta liste de builds, sur le site ou dans l'app. « Dépublier » le retire du Workshop sans toucher à ta copie.",
      ],
      inGame:
        "Un build importé fonctionne comme les tiens : active-le dans l'app pour le voir en partie.",
      screenshot: 'La liste Workshop Builds avec la recherche et le bouton « Importer le build ».',
    },
    'workshop-jungle': {
      name: 'Workshop Jungle',
      purpose: 'Découvre des parcours jungle partagés par la communauté et utilise-les dans l’app.',
      where:
        "Site : tableau de bord → Workshop Jungle (consultation). App : onglet « Workshop Jungle » (consultation et import).",
      steps: [
        'Parcours les parcours publiés ou cherche par nom ou par champion ; chacun indique son côté (bleu ou rouge).',
        "L'import se fait uniquement dans l'app : ouvre l'onglet « Workshop Jungle » de l'app pour ajouter un parcours aux tiens.",
        "Pour partager un de tes parcours, clique sur « ↑ Partager » dans l'onglet « Jungle Path » de l'app.",
      ],
      inGame:
        'Une fois importé et activé pour ton champion, le parcours s’affiche dans l’overlay (voir « Parcours jungle »).',
      screenshot: 'La liste Workshop Jungle avec les badges « Côté Bleu » / « Côté Rouge ».',
    },
    'historique-parties': {
      name: 'Historique de parties',
      purpose: 'Retrouve tes dernières parties et le détail de chacune.',
      where:
        "App : onglet « Accueil ». Site : tableau de bord → Accueil (« Mes dernières parties ») et page de chaque joueur.",
      steps: [
        "Dans l'app, l'onglet « Accueil » reconnaît le compte connecté au client League et affiche son historique ; ouvre une partie pour voir son détail.",
        'Sur le site, ton historique s’affiche une fois ton compte Riot lié (voir « Lier ton compte Riot »).',
      ],
      screenshot: "L'historique de l'onglet « Accueil » de l'app, avec une partie dépliée.",
    },

    // ── Site ──────────────────────────────────────────────────────────────
    'recherche-joueur': {
      name: 'Recherche de joueur',
      purpose: 'Consulte le profil et les parties de n’importe quel joueur, sans compte et sans l’app.',
      where: '« Joueurs » dans l’en-tête du site, ou « Rechercher un joueur » dans le pied de page.',
      tier: 'Aucun compte nécessaire.',
      steps: [
        'Saisis le Riot ID du joueur (NomJoueur#TAG) et choisis sa région.',
        'Clique sur une partie pour ouvrir son détail.',
        'Depuis la page du joueur, « Partie en direct → » montre sa partie en cours s’il est en jeu.',
      ],
      screenshot: 'La page de résultats d’un joueur avec son rang et sa liste de parties.',
    },
    'liaison-riot': {
      name: 'Lier ton compte Riot',
      purpose:
        'Relie ton compte Riot à ton compte Wyrm Forge pour que le site affiche tes parties, tes stats et tes bilans.',
      where: 'Tableau de bord → Accueil, bloc « Mon compte Riot ».',
      steps: [
        'Saisis ton Riot ID (NomJoueur#TAG).',
        "Le site te demande d'équiper une icône d'invocateur précise : équipe-la dans le client League, puis clique sur « Vérifier » avant la fin du délai affiché.",
        'Une fois la liaison validée, tu peux remettre ton icône habituelle. « Délier » retire la liaison.',
      ],
      note:
        "La liaison faite sur le site n'est pas utilisée par l'app : l'app reconnaît ton compte directement dans le client League.",
      screenshot: "Le bloc « Mon compte Riot » pendant la vérification, avec l'icône à équiper et le délai restant.",
    },
    'historique-stats': {
      name: 'Historique et stats',
      purpose: 'Fais le bilan de tes 20 dernières parties en un coup d’œil.',
      where: 'Tableau de bord → Stats.',
      steps: [
        'Lie d’abord ton compte Riot (voir « Lier ton compte Riot »).',
        "Ouvre l'onglet Stats : winrate, KDA moyen, CS par minute, score de vision et dégâts par partie.",
        'Plus bas : la tendance victoires / défaites, les champions joués, la répartition par rôle et par mode de jeu.',
      ],
      screenshot: "L'onglet Stats du site avec les indicateurs du haut et la tendance des 20 parties.",
    },
    'bilan-ia': {
      name: 'Bilan IA',
      purpose: 'Fais analyser une de tes parties récentes par l’IA, sur toi, ton adversaire de lane ou les deux.',
      where: 'Tableau de bord → Post Game.',
      tier: AI_TIER_FR,
      steps: [
        'Lie d’abord ton compte Riot (voir « Lier ton compte Riot »).',
        'Choisis une partie dans ton historique récent.',
        'Choisis la profondeur (Simple, Médium, Avancée) et le sujet (Moi, Adversaire, Les deux) : le coût en braises s’affiche.',
        'Clique sur « Analyser cette partie ».',
        'Sans duel de lane (ARAM, Arena…), seul le sujet « Moi » est disponible.',
      ],
      screenshot: 'Le Post Game du site avec une partie sélectionnée, les options de profondeur et de sujet, et un bilan affiché.',
    },
    'todo-site': {
      name: 'To-do lists du site',
      purpose: 'Garde sur le site des listes de points à travailler pour progresser.',
      where: 'Tableau de bord → To-Do Lists.',
      steps: [
        'Crée une liste : un titre, une description et jusqu’à 5 éléments.',
        '« Définir active » marque la liste sur laquelle tu travailles en ce moment.',
        'Tes listes se mettent à jour en temps réel si le site est ouvert sur plusieurs appareils.',
      ],
      note:
        "Non synchronisées entre le site et l'app : les listes du site n'apparaissent pas en jeu. Pour une liste dans l'overlay, crée-la dans l'app (voir « To-do en jeu »).",
      screenshot: "L'onglet To-Do Lists du site avec une liste active.",
    },
    'accueil-dashboard': {
      name: 'Accueil du tableau de bord',
      purpose: 'Ta page d’arrivée une fois connecté : la rotation gratuite de la semaine et tes dernières parties.',
      where: 'Tableau de bord → Accueil.',
      steps: [
        '« Rotation gratuite » : les champions jouables gratuitement cette semaine ; change de serveur avec le sélecteur.',
        '« Mes dernières parties » : tes parties récentes avec victoires, winrate, KDA et CS moyens ; charge-en plus pour remonter ton historique.',
        '« Changer » te permet de consulter l’historique d’un autre Riot ID le temps de ta visite.',
      ],
      screenshot: "L'Accueil du tableau de bord avec la rotation gratuite et « Mes dernières parties ».",
    },

    // ── App ───────────────────────────────────────────────────────────────
    overlay: {
      name: "L'overlay en jeu",
      purpose:
        "L'overlay affiche des informations par-dessus ta partie de League of Legends, sans que tu quittes le jeu.",
      where: "App : onglet « Overlay » pour les réglages. L'overlay s'ouvre tout seul en partie.",
      steps: [
        "Lance l'app et laisse-la ouverte : dès qu'une partie démarre, l'overlay s'affiche ; il se ferme à la fin de la partie.",
        "Dans l'onglet « Overlay », coche les blocs que tu veux voir. Chaque bloc est détaillé ci-dessous.",
        "L'overlay laisse passer tes clics vers le jeu : seuls ses boutons et les zones qui servent à déplacer un bloc réagissent à la souris.",
        "Section « Scoreboard & boutique » : coche « Masquer l'overlay pendant le scoreboard / la boutique » pour qu'il s'efface quand tu maintiens la touche du détail d'or (Tab par défaut) et quand tu appuies sur ta touche de boutique (à régler au même endroit). La gold diff reste visible.",
        "Une option grisée avec la mention « Temporairement indisponible » est désactivée de notre côté pour le moment.",
      ],
      inGame: 'Une couche transparente posée sur ton écran de jeu, avec les blocs que tu as cochés.',
      screenshot: "L'onglet « Overlay » de l'app avec la liste des blocs à cocher.",
    },
    'timers-objectifs': {
      name: "Timers d'objectifs",
      purpose: 'Sache quand Baron, Herald, Voidgrubs et Drake réapparaissent sans compter de tête.',
      where: "Onglet « Overlay » → « Timers objectifs ».",
      steps: [
        'Coche « Afficher le timer des objectifs », puis les timers voulus : Baron, Herald, Voidgrubs, Drake.',
        "Choisis l'affichage : « Timers classiques » (badges en haut de l'écran) ou « Frise chronologique des objectifs » (tous les objectifs sur un axe qui défile).",
        'En option : le score des drakes (icônes), et les buffs Baron et Elder.',
      ],
      inGame:
        "Dès qu'un objectif est tué, un compte à rebours indique quand il réapparaît. Le score des drakes montre les dragons pris par chaque équipe ; les buffs Baron et Elder montrent quels champions les portent et le temps restant.",
      screenshot: 'Les badges de timers en haut de l’écran pendant une partie, puis la même partie en mode frise.',
    },
    'timers-inhibiteurs': {
      name: "Timers d'inhibiteurs",
      purpose: 'Sache quand un inhibiteur détruit réapparaît.',
      where: "Onglet « Overlay » → « Timers minimap ».",
      steps: ['Coche « Afficher les timers d’inhibiteurs ».'],
      inGame: "Un compte à rebours s'affiche sur la minimap, à l'emplacement de l'inhibiteur détruit.",
      screenshot: 'La minimap en jeu avec un timer sur un inhibiteur détruit.',
    },
    'sorts-ennemis': {
      name: 'Suivi des sorts ennemis',
      purpose: 'Suis les temps de recharge des sorts d’invocateur adverses (Flash, Ignite…).',
      where: "Onglet « Overlay » → « Tracker sorts ennemis ».",
      steps: [
        'Coche « Afficher le tracker sorts ennemis ».',
        "En partie, clique sur l'icône d'un sort ennemi au moment où il l'utilise : le compte à rebours démarre.",
        'Le bloc peut s’afficher à l’horizontale ou à la verticale.',
      ],
      inGame:
        "Les champions adverses avec leurs sorts d'invocateur ; un sort marqué affiche le temps restant avant qu'il soit de nouveau disponible.",
      screenshot: 'Le tracker en jeu avec un Flash ennemi en recharge.',
    },
    'gold-diff': {
      name: "Différence d'or",
      purpose: 'Vois qui mène à l’or, en équipe et sur ta lane.',
      where: "Onglet « Overlay » → « Gold diff ». Touche : « Touche détail gold » (Tab par défaut).",
      steps: [
        'Coche « Afficher la gold diff (équipe + lane) ».',
        "En partie, maintiens la touche du détail d'or (Tab par défaut, la même que le tableau des scores) pour voir l'écart rôle par rôle.",
      ],
      inGame:
        "L'écart d'or entre les deux équipes et face à ton adversaire de lane, mis à jour pendant la partie ; touche maintenue, le détail par rôle (TOP, JGL, MID, BOT, SUP).",
      screenshot: 'La gold diff en jeu, puis le détail par rôle affiché avec Tab maintenu.',
    },
    'degats-sorts': {
      name: 'Dégâts des sorts',
      purpose: 'Estime ce que tes sorts infligent aux champions ennemis.',
      where: "Onglet « Overlay » → « Dégâts des sorts ».",
      steps: [
        'Coche « Afficher les dégâts des sorts ».',
        'Le bloc se place tout seul près de ta barre de vie.',
      ],
      inGame: 'Une estimation des dégâts de tes sorts sur les champions ennemis, qui suit la progression de ta partie.',
      screenshot: 'Le bloc Dégâts des sorts en jeu, près de la barre de vie du joueur.',
    },
    comeback: {
      name: 'Indicateur de comeback',
      purpose: 'Sache si ton équipe peut encore revenir, et sur qui concentrer tes efforts.',
      where: "Onglet « Overlay » → « Indicateur de comeback ».",
      steps: [
        'Coche « Afficher l’indicateur de comeback ».',
        'Il n’apparaît qu’à partir de 20 minutes de jeu.',
        'Tu peux déplacer le bloc en le faisant glisser.',
      ],
      inGame:
        "Le bloc COMEBACK indique la difficulté du retour (FACILE, MOYEN, DIFFICILE) d'après les écarts d'or, de niveaux et d'objectifs, et une liste de CIBLES prioritaires avec la raison : « Carry nourri », « Cible fragile » ou « Éviter — frontline ».",
      screenshot: 'Le bloc COMEBACK après 20 minutes, avec la difficulté et la liste des cibles.',
    },
    'conseils-objets': {
      name: "Conseils d'objets",
      purpose: 'Trouve les objets utiles contre la composition adverse.',
      where: "Bouton 💡 « Conseils items » de l'overlay.",
      steps: [
        "En partie, clique sur le bouton 💡 de l'overlay.",
        'Une fenêtre liste, pour chaque ennemi, les objets conseillés et pourquoi (anti-heal, résistance magique, ténacité…).',
        'Elle se met à jour toute seule toutes les 30 secondes ; « Actualiser » force la mise à jour.',
      ],
      inGame: 'La fenêtre « Conseils items », ennemi par ennemi.',
      screenshot: 'La fenêtre « Conseils items » ouverte en jeu.',
    },
    'parcours-jungle': {
      name: 'Parcours jungle',
      purpose: 'Dessine ton parcours de début de partie et suis-le directement sur ta minimap.',
      where:
        "Onglet « Jungle Path » (éditeur) ; affichage réglé dans l'onglet « Overlay » → « Jungle Path actif ».",
      steps: [
        'Crée un parcours : un nom, un champion et un côté (bleu ou rouge).',
        'Trace ton chemin sur la carte, clique les camps dans l’ordre voulu et place des éléments (Smite, Ward, Invade, Gank).',
        'Sauvegarde, puis clique sur « ⭐ Activer pour ce champion » (un seul parcours actif par champion).',
        "Dans l'onglet « Overlay », choisis l'affichage : sur la minimap, en liste texte, ou les deux.",
      ],
      inGame:
        'Pendant les 4 premières minutes des parties où tu joues ce champion, le tracé apparaît sur ta minimap et les étapes dans une liste que tu peux déplacer.',
      screenshot: "L'éditeur « Jungle Path » avec un tracé, puis le même parcours sur la minimap en début de partie.",
    },
    'calibrage-minimap': {
      name: 'Calage de la minimap',
      purpose: 'Aligne les tracés et les timers sur ta minimap, quelle que soit ta résolution.',
      where: 'Automatique, en partie.',
      steps: [
        "La plupart du temps, il n'y a rien à faire : l'app repère ta minimap toute seule.",
        "Si la fenêtre « Calibrage de la minimap » s'ouvre, vérifie que le contour en pointillés épouse le cadre de ta minimap, ajuste avec − et +, puis clique sur « C'est correct » (ou « Ignorer »).",
        "Cette question n'est posée qu'une fois par configuration.",
      ],
      inGame: 'Un contour en pointillés autour de ta minimap, seulement quand l’app a besoin de ta confirmation.',
      screenshot: 'La fenêtre « Calibrage de la minimap » avec le contour en pointillés.',
    },
    'build-en-jeu': {
      name: 'Ton build en jeu',
      purpose: 'Garde ton build sous les yeux pendant la partie.',
      where:
        "Onglet « Overlay » → « Build item en jeu ». Tes builds se règlent dans l'onglet « Builds Items ».",
      steps: [
        'Coche « Afficher le build actif du champion joué ».',
        "Le build actif n°1 du champion que tu joues s'affiche tout seul ; l'ordre se règle dans « Builds Items » avec les flèches ↑ ↓.",
        "En partie, le menu de l'en-tête du panneau passe à un autre de tes builds actifs. L'en-tête sert aussi à déplacer le panneau ; le reste laisse passer tes clics vers le jeu.",
      ],
      inGame: 'Le panneau 🛡 avec les objets de ton build, bloc par bloc.',
      screenshot: 'Le panneau de build en jeu avec le menu de l’en-tête ouvert.',
    },
    'panneau-stats': {
      name: 'Panneau de stats',
      purpose: 'Suis tes stats clés en direct et compare-les à une référence.',
      where:
        "Onglet « Stats » de l'app pour le contenu ; onglet « Overlay » → « Bloc de stats » pour l'afficher.",
      steps: [
        "Dans l'onglet « Stats », coche les stats à afficher : CS, CS/min, Gold/min, KDA, Niveau, Score de vision.",
        "Choisis les comparaisons : avec ton adversaire de lane, et/ou avec la moyenne de ton rang en Solo/Duo (CS/min, Gold/min, score de vision, KDA).",
        "Dans l'onglet « Overlay », coche « Afficher le bloc de stats ».",
      ],
      inGame:
        'Le bloc STATS affiche tes valeurs en direct, en couleur selon que tu es au-dessus ou en dessous de la référence choisie. Tu peux le déplacer.',
      screenshot: "L'onglet « Stats » de l'app avec ses cases cochées, et le bloc STATS en jeu.",
    },
    'todo-en-jeu': {
      name: 'To-do en jeu',
      purpose: 'Garde sous les yeux, pendant la partie, les quelques points sur lesquels tu veux progresser.',
      where:
        "Onglet « To-Do Lists » de l'app ; onglet « Overlay » → « To-do list » pour l'afficher.",
      steps: [
        'Crée une liste : un titre, une description et jusqu’à 5 éléments.',
        'Clique sur « ★ Définir comme active ».',
        "Dans l'onglet « Overlay », coche « Afficher la to-do list active ».",
      ],
      note:
        "Non synchronisées entre le site et l'app : seules les listes créées dans l'app apparaissent en jeu.",
      inGame: 'La liste active dans un bloc que tu peux déplacer ; tu peux cocher les éléments au fil de la partie.',
      screenshot: 'Le bloc to-do en jeu avec un élément coché.',
    },
    'conseiller-champ-select': {
      name: 'Conseiller de champion select',
      purpose: 'Aide-toi à compléter ton équipe pendant la sélection des champions.',
      where: 'Fenêtre « Conseils champion select », ouverte automatiquement pendant la sélection.',
      steps: [
        "Garde l'app ouverte quand tu lances une partie : la fenêtre s'ouvre pendant la sélection et se met à jour à chaque changement dans ton équipe.",
        'Elle affiche les champions alliés, les « Rôles à pourvoir » avec des suggestions, et le « Profil d’équipe » de ta composition.',
      ],
      screenshot: 'La fenêtre « Conseils champion select » pendant une sélection, avec les rôles à pourvoir.',
    },
    'runes-auto': {
      name: 'Runes automatiques',
      purpose: 'Ta page de runes se remplit toute seule au moment du pick.',
      where: "Les runes se définissent dans un build (bouton « 🔮 Runes »). L'application est automatique.",
      steps: [
        'Ajoute des runes à un build, puis active ce build pour ton champion.',
        "Pendant la sélection, dès que ton champion est choisi, l'app applique les runes du build dans le client League.",
      ],
      screenshot: 'La page de runes du client League remplie automatiquement après le pick.',
    },
    'sets-objets': {
      name: "Sets d'objets dans la boutique",
      purpose: 'Retrouve tes builds directement dans la boutique du jeu.',
      where: "Automatique, à partir de tes builds actifs (onglet « Builds Items »).",
      steps: [
        'Active un ou plusieurs builds pour ton champion.',
        "Au moment de ton pick, l'app les ajoute aux sets d'objets de League.",
      ],
      inGame: "Dans la boutique, tes builds apparaissent parmi les sets d'objets, prêts à l'achat.",
      screenshot: "La boutique en jeu, onglet des sets d'objets, avec un build Wyrm Forge.",
    },
    'comparaison-rang': {
      name: 'Comparaison à ton rang',
      purpose:
        'Après une partie, vois ce que tu as bien fait et ce qui est à travailler, par rapport aux joueurs de ton rang.',
      where: "App : onglet « Post Game ».",
      steps: [
        'Saisis ton Riot ID (NomJoueur#TAG) et clique sur « 🔄 Analyser dernière partie ».',
        "Laisse l'onglet ouvert : une nouvelle partie est détectée automatiquement.",
        'Lis les « 💡 Points clés » : chaque constat compare tes stats à la moyenne de ton rang. Tu trouves aussi tes stats, celles de tous les joueurs et les objectifs clés de la partie.',
      ],
      note: "Cette analyse n'utilise pas l'IA et ne consomme pas de braises.",
      screenshot: "L'onglet « Post Game » de l'app avec les « Points clés » d'une partie.",
    },
    'mises-a-jour': {
      name: 'Mises à jour automatiques',
      purpose: "Garde l'app à jour sans rien faire.",
      where: "Au lancement de l'app.",
      steps: [
        "À chaque lancement, l'app vérifie s'il existe une nouvelle version et l'installe avant de s'ouvrir.",
      ],
      screenshot: "L'écran de démarrage de l'app pendant la vérification de mise à jour.",
    },
  },
}

const en: GuideDict = {
  meta: {
    title: 'User guide — Wyrm Forge',
    description:
      'How to use Wyrm Forge, feature by feature: builds, Match Up, Workshop, live game, and the in-game overlay of the Windows app (objective timers, gold diff, jungle paths, enemy spells…).',
  },
  eyebrow: 'Guide',
  title: 'User',
  titleAccent: 'guide',
  intro:
    'Everything Wyrm Forge can do today, feature by feature: what it is for, where to find it, how to use it and what you will see in game. The site runs in your browser; the Windows app adds the in-game overlay.',
  updated: 'Last updated: {date}',
  version: 'Matches app v{version}',
  tocTitle: 'Contents',
  backToToc: 'Back to contents',
  sections: {
    commun: {
      title: 'On the site and in the app',
      blurb:
        'These features exist on both sides. Sign in with the same Wyrm Forge account on the site and in the app to find your builds everywhere.',
    },
    site: {
      title: 'Site only',
      blurb: 'These features are only on wyrm-forge.com, in your browser.',
    },
    app: {
      title: 'App only',
      blurb: 'These features are only in the Windows app, which runs alongside League of Legends.',
    },
  },
  groups: {
    objectifs: 'Objectives',
    combat: 'Fighting',
    jungle: 'Jungle',
    suivi: 'Your build and tracking',
    'avant-partie': 'Before the game',
  },
  downloadCta: 'Download the app for Windows',
  labels: {
    purpose: 'What it is for',
    where: 'Where to find it',
    tier: 'Plan',
    steps: 'How to use it',
    inGame: 'What you see in game',
    note: 'Good to know:',
    screenshot: 'Screenshot coming',
  },
  defaultTier: 'Free (Apprentice)',
  entries: {
    // ── Shared ────────────────────────────────────────────────────────────
    builds: {
      name: 'Item builds',
      purpose:
        'Prepare your builds for each champion — items, plus runes and skill order if you like — and find them in game.',
      where: 'Site: dashboard → Builder. App: “Item Builds” tab.',
      steps: [
        'Create a build: give it a name, pick a champion, then sort your items into blocks (starting items, core items…).',
        'Optionally add runes: on the site, tick the components to include (items, runes, skill order); in the app, use the “🔮 Runes” button.',
        'Builds are saved to your account: the ones made on the site show up in the app, and the other way round, as soon as you are signed in.',
        'In the app, click “Activate” so a build is used in game. If several builds are active for the same champion, their order (↑ ↓ arrows) decides which one comes first.',
        'A build with no champion never shows in game: remember to pick one.',
      ],
      inGame:
        'Active build no. 1 for the champion you play shows in the overlay (see “Your build in game”). It is also used to fill in your runes and item sets when you pick.',
      screenshot:
        'The app’s “Item Builds” tab with a build marked “✓ Active” and the order arrows, next to the site’s build editor.',
    },
    champions: {
      name: 'Champions',
      purpose: 'Browse every League of Legends champion: stats, spells, lore and tips.',
      where: 'Site: Champions page (no account needed). App: “Champions” tab.',
      steps: [
        'Search for a champion by name, or sort and filter the list.',
        'Open its page to see its stats, spells, lore and tips for playing it or playing against it.',
      ],
      screenshot: 'The site’s Champions page with the search, and one champion page open.',
    },
    'patch-notes': {
      name: 'Patch notes',
      purpose:
        'Read a clear summary of each League of Legends patch: champions, items, runes and system changes.',
      where: 'Site: Patch notes page and the dashboard’s “Patch Notes” tab. App: “Patch Notes” tab.',
      steps: [
        'Open the page or the tab: the latest patches are at the top.',
        'In the site dashboard, you can show a patch full screen or export it as an image (PNG) or a PDF.',
      ],
      note: 'Patch notes are written in French only.',
      screenshot: 'An open patch, with its highlights and its Champions / Items / Runes sections.',
    },
    'partie-en-direct': {
      name: 'Live game',
      purpose: 'See who is playing in a game in progress: both teams, all ten champions and each player’s rank.',
      where: 'App: “Live Game” tab. Site: a player’s page → “Partie en direct” link.',
      steps: [
        'In the app, start a game: the “Live Game” tab automatically shows both team compositions, then the ranks.',
        'On the site, search for a player, open their page, then click “Partie en direct” (live game): if they are in a game, the composition shows up.',
        'In custom games or the practice tool, ranks are not available.',
      ],
      inGame:
        'Nothing is added to the overlay: the composition stays in the app window, which you can check during the loading screen.',
      screenshot: 'The app’s “Live Game” tab with the blue team, the red team and the ranks.',
    },
    'match-up': {
      name: 'Match Up',
      purpose: 'Compare your team and the enemy team champion by champion to plan how to play the game.',
      where: 'Site: dashboard → Match Up. App: “Match Up” tab.',
      aiTier: AI_TIER_EN,
      steps: [
        'Add champions to the allies side and to the enemies side, with their level and, if you like, a build.',
        'The radar and the table compare the stats of both sides.',
        'In the app, “🔍 Detect” fills both sides from your current game, and “💾 Save” keeps the match up in your list, on your PC.',
      ],
      aiSteps: [
        'Run a “Quick analysis” or a “Detailed analysis”: if your ember balance is too low, the number needed is shown. Your balance refills every week.',
      ],
      screenshot: 'The site’s Match Up with two allies, two enemies and the stat comparison radar.',
    },
    'workshop-builds': {
      name: 'Workshop Builds',
      purpose: 'Find builds shared by other players, import them, and share your own.',
      where: 'Site: dashboard → Workshop Builds. App: “Workshop Builds” tab.',
      steps: [
        'Search for a build by name or by champion.',
        'Click “Import the build” (sign-in required): it joins your own builds.',
        'To share one of your builds, click “Publish” from your build list, on the site or in the app. “Unpublish” removes it from the Workshop without touching your copy.',
      ],
      inGame: 'An imported build works like your own: activate it in the app to see it in game.',
      screenshot: 'The Workshop Builds list with the search and the “Import the build” button.',
    },
    'workshop-jungle': {
      name: 'Workshop Jungle',
      purpose: 'Discover jungle paths shared by the community and use them in the app.',
      where:
        'Site: dashboard → Workshop Jungle (browsing). App: “Workshop Jungle” tab (browsing and importing).',
      steps: [
        'Browse the published paths or search by name or champion; each one shows its side (blue or red).',
        'Importing only happens in the app: open the app’s “Workshop Jungle” tab to add a path to yours.',
        'To share one of your paths, click “↑ Share” in the app’s “Jungle Path” tab.',
      ],
      inGame: 'Once imported and set active for your champion, the path shows in the overlay (see “Jungle path”).',
      screenshot: 'The Workshop Jungle list with the “Blue side” / “Red side” badges.',
    },
    'historique-parties': {
      name: 'Match history',
      purpose: 'Find your recent games and the details of each one.',
      where: 'App: “Home” tab. Site: dashboard → Home (“My recent games”) and each player’s page.',
      steps: [
        'In the app, the “Home” tab recognises the account signed in to the League client and shows its history; open a game to see its details.',
        'On the site, your history shows once your Riot account is linked (see “Link your Riot account”).',
      ],
      screenshot: 'The history in the app’s “Home” tab, with one game expanded.',
    },

    // ── Site ──────────────────────────────────────────────────────────────
    'recherche-joueur': {
      name: 'Player search',
      purpose: 'Look up any player’s profile and games, with no account and no app.',
      where: '“Players” in the site’s header, or “Player search” in the footer.',
      tier: 'No account needed.',
      steps: [
        'Enter the player’s Riot ID (GameName#TAG) and pick their region.',
        'Click a game to open its details.',
        'From the player’s page, “Partie en direct →” (live game) shows their current game if they are playing.',
      ],
      screenshot: 'A player’s results page with their rank and game list.',
    },
    'liaison-riot': {
      name: 'Link your Riot account',
      purpose:
        'Connect your Riot account to your Wyrm Forge account so the site can show your games, stats and reviews.',
      where: 'Dashboard → Home, “Mon compte Riot” (my Riot account) block.',
      steps: [
        'Enter your Riot ID (GameName#TAG).',
        'The site asks you to equip a specific summoner icon: equip it in the League client, then click “Vérifier” (verify) before the time shown runs out.',
        'Once the link is confirmed, you can put your usual icon back. “Délier” (unlink) removes the link.',
      ],
      note:
        'The link made on the site is not used by the app: the app recognises your account directly in the League client. This block is currently shown in French only.',
      screenshot: 'The “Mon compte Riot” block during verification, with the icon to equip and the time left.',
    },
    'historique-stats': {
      name: 'History and stats',
      purpose: 'Review your last 20 games at a glance.',
      where: 'Dashboard → Stats.',
      steps: [
        'Link your Riot account first (see “Link your Riot account”).',
        'Open the Stats tab: winrate, average KDA, CS per minute, vision score and damage per game.',
        'Further down: your win / loss trend, the champions you played, and your split by role and by game mode.',
      ],
      screenshot: 'The site’s Stats tab with the headline figures and the 20-game trend.',
    },
    'bilan-ia': {
      name: 'AI review',
      purpose: 'Have the AI analyse one of your recent games, about you, your lane opponent or both.',
      where: 'Dashboard → Post Game.',
      tier: AI_TIER_EN,
      steps: [
        'Link your Riot account first (see “Link your Riot account”).',
        'Pick a game from your recent history.',
        'Pick the depth (Simple, Medium, Advanced) and the subject (Me, Opponent, Both): the cost in embers is shown.',
        'Click “Analyse this game”.',
        'With no lane duel (ARAM, Arena…), only the “Me” subject is available.',
      ],
      screenshot: 'The site’s Post Game with a game selected, the depth and subject options, and a review shown.',
    },
    'todo-site': {
      name: 'Site to-do lists',
      purpose: 'Keep lists of things to work on to improve, on the site.',
      where: 'Dashboard → To-Do Lists.',
      steps: [
        'Create a list: a title, a description and up to 5 items.',
        '“Set as active” marks the list you are working on right now.',
        'Your lists update in real time if the site is open on several devices.',
      ],
      note:
        'Not synced between the site and the app: lists made on the site do not show in game. For a list in the overlay, create it in the app (see “In-game to-do”).',
      screenshot: 'The site’s To-Do Lists tab with an active list.',
    },
    'accueil-dashboard': {
      name: 'Dashboard home',
      purpose: 'Your landing page once signed in: this week’s free rotation and your recent games.',
      where: 'Dashboard → Home.',
      steps: [
        '“Free champion rotation”: the champions free to play this week; switch server with the selector.',
        '“My recent games”: your recent games with wins, winrate, average KDA and CS; load more to go further back.',
        '“Change” lets you look at another Riot ID’s history for the rest of your visit.',
      ],
      screenshot: 'The dashboard Home with the free rotation and “My recent games”.',
    },

    // ── App ───────────────────────────────────────────────────────────────
    overlay: {
      name: 'The in-game overlay',
      purpose: 'The overlay shows information on top of your League of Legends game, without leaving the game.',
      where: 'App: “Overlay” tab for the settings. The overlay opens by itself in game.',
      steps: [
        'Start the app and leave it open: as soon as a game starts, the overlay shows up; it closes when the game ends.',
        'In the “Overlay” tab, tick the blocks you want to see. Each block is described below.',
        'The overlay lets your clicks through to the game: only its buttons and the areas used to move a block react to the mouse.',
        '“Scoreboard & shop” section: tick “Hide the overlay during the scoreboard / the shop” so it fades away while you hold the gold detail key (Tab by default) and when you press your shop key (set in the same place). The gold diff stays visible.',
        'An option greyed out with “Temporarily unavailable” has been switched off on our side for now.',
      ],
      inGame: 'A transparent layer on top of your game screen, with the blocks you ticked.',
      screenshot: 'The app’s “Overlay” tab with the list of blocks to tick.',
    },
    'timers-objectifs': {
      name: 'Objective timers',
      purpose: 'Know when Baron, Herald, Voidgrubs and Drake respawn without counting in your head.',
      where: '“Overlay” tab → “Objective timers”.',
      steps: [
        'Tick “Show objective timers”, then the timers you want: Baron, Herald, Voidgrubs, Drake.',
        'Pick the display: “Classic timers” (badges at the top of the screen) or “Objective timeline” (every objective on a scrolling time axis).',
        'Optional: the drake score (icons), and the Baron and Elder buffs.',
      ],
      inGame:
        'As soon as an objective is taken, a countdown shows when it respawns. The drake score shows the dragons each team has taken; the Baron and Elder buffs show which champions have them and how long is left.',
      screenshot: 'The timer badges at the top of the screen during a game, then the same game in timeline mode.',
    },
    'timers-inhibiteurs': {
      name: 'Inhibitor timers',
      purpose: 'Know when a destroyed inhibitor comes back.',
      where: '“Overlay” tab → “Minimap timers”.',
      steps: ['Tick “Show inhibitor timers”.'],
      inGame: 'A countdown shows on the minimap, where the destroyed inhibitor stands.',
      screenshot: 'The in-game minimap with a timer on a destroyed inhibitor.',
    },
    'sorts-ennemis': {
      name: 'Enemy spell tracker',
      purpose: 'Track the cooldowns of enemy summoner spells (Flash, Ignite…).',
      where: '“Overlay” tab → “Enemy summoner tracker”.',
      steps: [
        'Tick “Show the enemy summoner tracker”.',
        'In game, click an enemy spell’s icon when they use it: the countdown starts.',
        'The block can be laid out horizontally or vertically.',
      ],
      inGame:
        'The enemy champions with their summoner spells; a marked spell shows the time left before it is available again.',
      screenshot: 'The tracker in game with an enemy Flash on cooldown.',
    },
    'gold-diff': {
      name: 'Gold difference',
      purpose: 'See who is ahead in gold, as a team and in your lane.',
      where: '“Overlay” tab → “Gold diff”. Key: “Gold detail key” (Tab by default).',
      steps: [
        'Tick “Show the gold diff (team + lane)”.',
        'In game, hold the gold detail key (Tab by default, the same as the scoreboard) to see the gap role by role.',
      ],
      inGame:
        'The gold gap between both teams and against your lane opponent, updated during the game; with the key held, the breakdown by role (TOP, JGL, MID, BOT, SUP).',
      screenshot: 'The gold diff in game, then the role breakdown shown while Tab is held.',
    },
    'degats-sorts': {
      name: 'Spell damage',
      purpose: 'Estimate what your spells deal to enemy champions.',
      where: '“Overlay” tab → “Spell damage”.',
      steps: ['Tick “Show spell damage”.', 'The block places itself next to your health bar.'],
      inGame: 'An estimate of your spells’ damage on enemy champions, which follows how your game goes.',
      screenshot: 'The Spell damage block in game, next to the player’s health bar.',
    },
    comeback: {
      name: 'Comeback indicator',
      purpose: 'Know whether your team can still come back, and who to focus on.',
      where: '“Overlay” tab → “Comeback indicator”.',
      steps: [
        'Tick “Show the comeback indicator”.',
        'It only shows from 20 minutes of game time.',
        'You can move the block by dragging it.',
      ],
      inGame:
        'The COMEBACK block shows how hard a comeback is (EASY, MEDIUM, HARD) from the gold, level and objective gaps, plus a list of priority TARGETS with the reason: “Fed carry”, “Squishy target” or “Avoid — frontline”.',
      screenshot: 'The COMEBACK block after 20 minutes, with the difficulty and the target list.',
    },
    'conseils-objets': {
      name: 'Item advice',
      purpose: 'Find the items that work against the enemy team.',
      where: 'The overlay’s 💡 “Item advice” button.',
      steps: [
        'In game, click the overlay’s 💡 button.',
        'A window lists, for each enemy, the suggested items and why (anti-heal, magic resist, tenacity…).',
        'It updates by itself every 30 seconds; “Refresh” forces an update.',
      ],
      inGame: 'The “Item advice” window, enemy by enemy.',
      screenshot: 'The “Item advice” window open in game.',
    },
    'parcours-jungle': {
      name: 'Jungle path',
      purpose: 'Draw your early-game path and follow it right on your minimap.',
      where: '“Jungle Path” tab (editor); display set in the “Overlay” tab → “Active jungle path”.',
      steps: [
        'Create a path: a name, a champion and a side (blue or red).',
        'Draw your route on the map, click the camps in the order you want and place elements (Smite, Ward, Invade, Gank).',
        'Save, then click “⭐ Set active for this champion” (one active path per champion).',
        'In the “Overlay” tab, pick the display: on the minimap, as a text list, or both.',
      ],
      inGame:
        'During the first 4 minutes of games where you play that champion, the route shows on your minimap and the steps in a list you can move.',
      screenshot: 'The “Jungle Path” editor with a route, then the same path on the minimap early in a game.',
    },
    'calibrage-minimap': {
      name: 'Minimap alignment',
      purpose: 'Line up paths and timers with your minimap, whatever your resolution.',
      where: 'Automatic, in game.',
      steps: [
        'Most of the time there is nothing to do: the app finds your minimap by itself.',
        'If the “Minimap calibration” window opens, check that the dashed outline hugs the frame of your minimap, adjust with − and +, then click “That’s correct” (or “Dismiss”).',
        'This is asked only once per configuration.',
      ],
      inGame: 'A dashed outline around your minimap, only when the app needs you to confirm.',
      screenshot: 'The “Minimap calibration” window with the dashed outline.',
    },
    'build-en-jeu': {
      name: 'Your build in game',
      purpose: 'Keep your build in sight during the game.',
      where: '“Overlay” tab → “In-game item build”. Your builds are set in the “Item Builds” tab.',
      steps: [
        'Tick “Show the active build of the champion played”.',
        'Active build no. 1 for the champion you play shows by itself; set the order in “Item Builds” with the ↑ ↓ arrows.',
        'In game, the menu in the panel’s header switches to another of your active builds. The header is also used to move the panel; the rest lets your clicks through to the game.',
      ],
      inGame: 'The 🛡 panel with your build’s items, block by block.',
      screenshot: 'The build panel in game with the header menu open.',
    },
    'panneau-stats': {
      name: 'Stats panel',
      purpose: 'Follow your key stats live and compare them with a reference.',
      where: 'The app’s “Stats” tab for the content; “Overlay” tab → “Stats block” to show it.',
      steps: [
        'In the “Stats” tab, tick the stats to show: CS, CS/min, Gold/min, KDA, Level, Vision score.',
        'Pick the comparisons: with your lane opponent, and/or with your rank’s Solo/Duo average (CS/min, Gold/min, vision score, KDA).',
        'In the “Overlay” tab, tick “Show the stats block”.',
      ],
      inGame:
        'The STATS block shows your figures live, coloured depending on whether you are above or below the chosen reference. You can move it.',
      screenshot: 'The app’s “Stats” tab with its ticked boxes, and the STATS block in game.',
    },
    'todo-en-jeu': {
      name: 'In-game to-do',
      purpose: 'Keep the few things you want to improve in sight during the game.',
      where: 'The app’s “To-Do Lists” tab; “Overlay” tab → “To-do list” to show it.',
      steps: [
        'Create a list: a title, a description and up to 5 items.',
        'Click “★ Set as active”.',
        'In the “Overlay” tab, tick “Show the active to-do list”.',
      ],
      note: 'Not synced between the site and the app: only lists created in the app show in game.',
      inGame: 'The active list in a block you can move; you can tick items off as the game goes.',
      screenshot: 'The to-do block in game with one item ticked.',
    },
    'conseiller-champ-select': {
      name: 'Champion select advisor',
      purpose: 'Get help completing your team during champion select.',
      where: '“Champion select advice” window, opened automatically during champion select.',
      steps: [
        'Keep the app open when you queue up: the window opens during champion select and updates whenever your team changes.',
        'It shows the allied champions, the “Roles to fill” with suggestions, and the “Team profile” of your composition.',
      ],
      screenshot: 'The “Champion select advice” window during a champion select, with the roles to fill.',
    },
    'runes-auto': {
      name: 'Automatic runes',
      purpose: 'Your rune page fills itself in when you pick.',
      where: 'Runes are set in a build (“🔮 Runes” button). Applying them is automatic.',
      steps: [
        'Add runes to a build, then activate that build for your champion.',
        'During champion select, as soon as your champion is locked in, the app applies the build’s runes in the League client.',
      ],
      screenshot: 'The League client rune page filled in automatically after the pick.',
    },
    'sets-objets': {
      name: 'Item sets in the shop',
      purpose: 'Find your builds right in the in-game shop.',
      where: 'Automatic, from your active builds (“Item Builds” tab).',
      steps: [
        'Activate one or more builds for your champion.',
        'When you pick, the app adds them to League’s item sets.',
      ],
      inGame: 'In the shop, your builds show up among the item sets, ready to buy.',
      screenshot: 'The in-game shop, item sets tab, with a Wyrm Forge build.',
    },
    'comparaison-rang': {
      name: 'Comparison with your rank',
      purpose: 'After a game, see what you did well and what to work on, compared with players of your rank.',
      where: 'App: “Post Game” tab.',
      steps: [
        'Enter your Riot ID (GameName#TAG) and click “🔄 Analyse the last game”.',
        'Leave the tab open: a new game is detected automatically.',
        'Read the “💡 Key points”: each one compares your stats with your rank’s average. You also get your stats, every player’s stats and the game’s key objectives.',
      ],
      note: 'This analysis does not use AI and does not use any embers.',
      screenshot: 'The app’s “Post Game” tab with a game’s “Key points”.',
    },
    'mises-a-jour': {
      name: 'Automatic updates',
      purpose: 'Keep the app up to date without doing anything.',
      where: 'When the app starts.',
      steps: ['Each time it starts, the app checks for a new version and installs it before opening.'],
      screenshot: 'The app’s start-up screen while it checks for updates.',
    },
  },
}

export const guideDicts: Record<Lang, GuideDict> = { fr, en }
