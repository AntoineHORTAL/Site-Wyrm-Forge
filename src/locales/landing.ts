/**
 * Traductions de la vitrine publique (page d'accueil vue par un visiteur non connecté).
 *
 * Périmètre volontairement restreint : seuls Nav (mode visiteur), Hero, Features,
 * Community, Pricing, FinalCTA, FAQ et Footer sont traduits. Le reste du site
 * (dashboard, /matches, pages légales…) reste en français pour l'instant.
 *
 * Convention : `landingFr` fait foi. `LandingDict` en dérive, ce qui force
 * `landingEn` à exposer exactement les mêmes clés — une clé oubliée ou renommée
 * casse la compilation au lieu d'afficher un texte manquant en prod.
 *
 * Les titres accentués sont découpés en `titleBefore` / `titleAccent` / `titleAfter` :
 * `titleAccent` est rendu dans un <span className="accent-text">, et le découpage
 * permet de placer le mot mis en avant à un endroit différent selon la langue.
 */

export type Lang = 'fr' | 'en'

export const landingFr = {
  /* ── Barre de navigation (mode visiteur uniquement) ── */
  nav: {
    // L'ordre suit celui de `NAV_SECTION_IDS` (src/lib/nav-links.ts) : accueil,
    // features, communaute, tarifs, telecharger, faq. Seuls les libellés changent,
    // les id sont structurels. Ce sont TOUTES des ancres de la home — la recherche
    // de joueur a son propre libellé (`players`) parce qu'elle vit ailleurs.
    links: ['Accueil', 'Fonctionnalités', 'Communauté', 'Tarifs', 'Télécharger', 'FAQ'],
    // Recherche de joueur → PLAYER_SEARCH_HREF. Rendu dans le bloc de droite du
    // header (à côté de la bascule de langue) ET dans le drawer mobile : un seul
    // libellé pour les deux, sinon ils divergent au premier changement de copy.
    players: 'Joueurs',
    login: 'Connexion',
    download: 'Télécharger',
    loginSignup: 'Connexion / Inscription',
    langLabel: 'Langue',
    langFrTitle: 'Afficher la page en français',
    langEnTitle: 'Afficher la page en anglais',
  },

  /* ── Hero ── */
  hero: {
    eyebrow: 'Wyrm Forge · Windows',
    titleBefore: 'Forge ton',
    titleAccent: 'ascension.',
    subtitle:
      "Overlay 100% personnalisable, builds et jungle paths partagés par la communauté, analyses IA. Tout ce qu'il faut pour grimper.",
    ctaDownload: 'Télécharger pour Windows',
    ctaFeatures: 'Fonctionnalités',
    badges: ['Téléchargement gratuit', 'API officielle Riot', 'Sans ban'],
    overlay: {
      title: 'Overlay',
      live: '● Live',
      // Libellés de la carte d'illustration (les valeurs chiffrées ne changent pas)
      stats: ['CS/min', 'Vision', 'KDA', 'Dragon', 'Baron', 'Rang'],
      rankValue: 'Or II',
    },
  },

  /* ── Section Fonctionnalités ── */
  features: {
    eyebrow: "L'arsenal du grimpeur",
    titleBefore: 'Tout pour ',
    titleAccent: 'dominer',
    titleAfter: ' la faille.',
    subtitle:
      "Un overlay forgé pour les invocateurs ambitieux. Modulaire, nourri par la communauté et augmenté par l'IA.",
    // ⚠️ DEUX listes, deux rendus (voir Features.tsx) :
    //   `items` → 6 cartes pleines, avec icône encadrée et tags éventuels ;
    //   `more`  → 6 entrées en liste compacte, sous le titre `moreTitle`.
    // Rien n'est masqué derrière un clic : tout reste lisible d'un seul coup d'œil
    // et reste dans le HTML servi (crawler, lecteur d'écran, dossier Riot).
    // Chaque liste est appariée PAR POSITION à son tableau d'icônes dans Features.tsx.
    items: [
      {
        title: 'Overlay personnalisable',
        desc: "Glisse-dépose tes modules : timers de jungle, CS tracker, vision score. Compose l'overlay parfait, pixel par pixel.",
        tags: ['Timer Dragon', 'CS/min', 'Vision', 'Cooldowns', 'Gold diff'] as string[],
      },
      {
        title: 'Pathing jungle par champion',
        desc: "Le chemin est calculé pour le champion que tu joues, puis projeté sur la minimap : ordre des camps, timings, position à l'écran.",
        tags: [] as string[],
      },
      {
        title: 'Partie en direct',
        desc: "Suis n'importe quelle partie en cours : les deux compositions, le rang des dix joueurs, les bans et le chrono.",
        tags: [] as string[],
      },
      {
        title: 'Analyses IA',
        desc: 'Une IA décortique tes parties : erreurs de positionnement, timings manqués, conseils ciblés pour grimper plus vite.',
        tags: [] as string[],
      },
      {
        title: 'Historique sans compte',
        desc: "Entre un Riot ID et consulte tout l'historique d'un joueur — résultat, champion, KDA, items. Aucune inscription demandée.",
        tags: [] as string[],
      },
      {
        title: 'Conseils en champion select',
        desc: "Pendant la sélection, l'assistant lit la composition qui se dessine et te suggère quoi prendre et quoi éviter.",
        tags: [] as string[],
      },
    ],
    moreTitle: 'Et aussi, inclus',
    more: [
      {
        title: 'Jungle paths communautaires',
        desc: 'Des milliers de chemins et builds optimisés, partagés et notés par les meilleurs joueurs.',
      },
      {
        title: 'Builds en temps réel',
        desc: 'Items et runes affichés en jeu, adaptés à ton champion et à la composition ennemie.',
      },
      {
        title: 'Explorateur de champions',
        desc: 'Tous les champions de League, filtrables par rôle, classe et difficulté.',
      },
      {
        title: 'Patch notes résumés par IA',
        desc: 'Chaque mise à jour de League résumée en français, patch après patch.',
      },
      {
        title: 'Routine et progression',
        desc: 'To-do lists, scénarios de macro, statistiques et quêtes quotidiennes.',
      },
      {
        title: '100% sécurisé',
        desc: "API officielle Riot. Aucune injection, aucun risque de ban.",
      },
    ],
  },

  /* ── Section Communauté / confiance ── */
  community: {
    eyebrow: 'Confiance & légitimité',
    titleBefore: 'Rejoins une ',
    titleAccent: 'communauté',
    titleAfter: ' qui grimpe.',
    // Même ordre que le tableau d'icônes dans Community.tsx
    items: [
      {
        title: 'Gratuit pour commencer',
        desc: "Télécharge et joue sans payer. Une offre gratuite fonctionnelle restera disponible en permanence, même quand les formules payantes arriveront.",
      },
      {
        title: 'API Officielle Riot',
        desc: "Connecté à l'API officielle de Riot Games. Données légitimes et conformes.",
      },
      {
        title: 'Sans Ban',
        desc: "Pas d'injection mémoire ni de triche. Ton compte ne risque rien.",
      },
    ],
  },

  /* ── Section Tarifs ── */
  pricing: {
    eyebrow: 'Tarifs',
    titleBefore: 'Choisis ta ',
    titleAccent: 'forge',
    titleAfter: '.',
    subtitle: 'Commence gratuitement, passe à la vitesse supérieure quand tu en as besoin.',
    monthly: 'Mensuel',
    annual: 'Annuel',
    // Badge du segment « Annuel ». Exact au centime pour les DEUX paliers payants
    // (36 € → 30 € et 72 € → 60 €), et vérifié par landing.test.ts contre
    // `PRICING_TIERS`. Voir `FREE_MONTHS_ON_ANNUAL` pour le choix « mois offerts »
    // plutôt qu'un pourcentage.
    annualPerk: '2 mois offerts',
    popular: 'Populaire',
    free: 'Gratuit',
    perMonth: ' /mois',
    // Gabarit de prix : {amount} est le montant formaté (séparateur décimal de la
    // langue). En français le symbole se place APRÈS le montant, en anglais avant.
    // Ne jamais écrire « € » ailleurs que dans ce gabarit — voir `formatPrice`.
    priceFormat: '{amount}€',
    // {price} est remplacé par le prix complet (symbole inclus) via `formatPrice`
    billedAnnually: 'Facturé {price}/an',
    noCommitment: 'Sans engagement',
    ctaDownload: 'Télécharger gratuitement',
    // Paliers branchés sur Stripe Checkout. `ctaSoon` reste utilisé par les
    // paliers annoncés sans prix Stripe (Légion, Monarque) — ne pas le retirer.
    ctaSubscribe: "S'abonner",
    ctaSubscribeLoading: 'Redirection…',
    // Visiteur non connecté : le clic ouvre la modale de connexion. Le libellé
    // le dit AVANT le clic plutôt que de faire découvrir une modale surprise.
    ctaSubscribeAnon: "Se connecter pour s'abonner",
    // Palier déjà actif — bouton inerte, jamais un second paiement proposé.
    ctaCurrent: 'Ton palier actuel',
    ctaSoon: 'Bientôt disponible',
    ctaSoonTitle: 'Le paiement sera disponible prochainement',
    checkoutError: "Impossible d'ouvrir le paiement. Réessaie dans un instant.",
    // Retour de Stripe — le palier n'est pas encore écrit à cet instant, c'est
    // le webhook qui l'écrira. D'où une attente explicite plutôt qu'un silence.
    checkoutPending: 'Paiement confirmé — activation de ton palier en cours…',
    checkoutDone: 'Ton palier {tier} est actif. Bienvenue à la forge !',
    // L'activation a pris plus longtemps que la fenêtre d'attente : le paiement
    // est bien passé, on ne laisse jamais croire l'inverse.
    checkoutSlow: "Paiement confirmé. L'activation prend un peu plus longtemps que prévu — recharge la page dans une minute.",
    checkoutCanceled: "Paiement annulé. Rien ne t'a été débité.",
    // Étape intermédiaire avant Stripe (`CheckoutConsentModal`). ⚠️ Le texte de
    // la CASE n'est PAS ici : il est versionné dans `src/lib/stripe/checkout-
    // consent.ts`, parce que le serveur enregistre ce texte exact comme preuve.
    // Ces libellés-ci n'ont aucune valeur probante, ils peuvent évoluer librement.
    consentTitle: 'Abonnement {tier}',
    consentPriceLabel: 'Prix :',
    perYear: ' /an',
    // Ni promesse de rappel avant renouvellement ici : aucun envoi n'existe
    // encore (voir AGENTS.md § CGV, obligation L215-1). Ne pas l'annoncer tant
    // qu'il n'est pas branché.
    consentRenewalMonthly: "Renouvelé automatiquement chaque mois, à la date anniversaire de ta souscription. Sans engagement : résiliable à tout moment depuis ton profil, avec effet à la fin du mois payé.",
    consentRenewalAnnual: "Renouvelé automatiquement chaque année, à la date anniversaire de ta souscription. Résiliable à tout moment depuis ton profil, avec effet à la fin de l'année payée.",
    consentTermsBefore: 'Avant de payer, prends connaissance de nos',
    consentTermsLink: 'conditions générales de vente',
    consentConfirm: 'Continuer vers le paiement',
    consentConfirmLoading: 'Redirection…',
    consentCancel: 'Annuler',
    // Le texte de la case a changé depuis l'ouverture de la page : le serveur
    // refuse l'ancienne version (`consent_outdated`), la personne doit relire.
    consentOutdated: 'Nos conditions viennent d’être mises à jour. Recharge la page pour lire la nouvelle version avant de payer.',
    moreTiers: "D'autres paliers arrivent prochainement.",
    // ⚠️ `name` est un LIBELLÉ D'AFFICHAGE, pas la valeur de `profiles.tier`.
    // Les valeurs en base (apprenti / forgeron / maître) sont partagées avec l'app
    // de bureau et ne changent JAMAIS : elles restent portées par le tableau `tiers`
    // de Pricing.tsx, qui sert de clé. Traduire ici n'affecte que la vitrine — aucune
    // comparaison de tier côté code ne doit lire ces chaînes.
    tiers: [
      {
        name: 'Apprenti',
        tagline: 'Pour découvrir',
        features: [
          'Overlay : 3 blocs actifs',
          '5 imports workshop / sem',
          // ⚠️ Lignes IA = RÉALITÉ SERVEUR (`TIER_CONFIG` de matchup-analyze et
          // postgame-analyze), décision HORTAL du 2026-09-11. La grille promettait
          // « 5 analyses / mois », « 20 analyses / mois (Sonnet) » et « illimitées
          // (Opus) » : faux, et c'est une pratique commerciale trompeuse.
          // `landing.test.ts` relit l'EF et échoue si les deux divergent de nouveau.
          '15 crédits IA / semaine (Haiku)',
          '3 builds custom',
          '3 jungle paths',
        ],
      },
      {
        name: 'Forgeron',
        tagline: 'Pour progresser',
        features: [
          'Overlay : 6 blocs actifs',
          '20 imports workshop / sem',
          '65 crédits IA / semaine (Haiku)',
          '20 builds custom',
          '10 jungle paths',
          'Publication workshop',
        ],
      },
      {
        name: 'Maître',
        tagline: 'Pour grimper',
        features: [
          'Overlay illimité',
          'Workshop illimité',
          '135 crédits IA / semaine (Sonnet)',
          'Builds & paths illimités',
          // « Comparaison rangs supérieurs » RETIRÉ le 2026-09-11 (décision HORTAL) :
          // promis sur la grille, jamais implémenté. Backlog : AGENTS.md § À faire plus tard.
        ],
      },
    ],
  },

  /* ── Bandeau de conversion final ── */
  finalCta: {
    eyebrow: "La forge t'attend",
    titleBefore: 'Prêt à ',
    titleAccent: 'grimper',
    titleAfter: ' ?',
    subtitle:
      "Télécharge l'assistant, configure ton overlay en deux minutes, et forge ton ascension dès ta prochaine partie.",
    ctaDownload: 'Télécharger pour Windows',
    note: 'Windows 10 / 11 · Téléchargement gratuit',
  },

  /* ── FAQ ── */
  faq: {
    eyebrow: 'Questions fréquentes',
    titleBefore: 'On répond à ',
    titleAccent: 'tout',
    titleAfter: '.',
    items: [
      {
        q: 'Est-ce légal et sans risque de ban ?',
        a: "Wyrm Forge utilise uniquement l'API officielle Riot Games et ne modifie pas les fichiers du jeu. Il est conforme aux règles d'utilisation des APIs Riot et ne risque pas de ban. Wyrm Forge n'est pas affilié à Riot Games.",
      },
      {
        q: "Comment fonctionne l'overlay ?",
        a: "L'overlay se superpose à League of Legends en mode fenêtré ou fenêtré sans bordures. Tu peux le configurer pour qu'il se masque automatiquement en jeu ou reste toujours visible selon tes préférences.",
      },
      {
        q: 'Faut-il payer pour utiliser Wyrm Forge ?',
        a: "Non. Une offre gratuite complète restera disponible en permanence, même quand des formules payantes seront proposées. Tu peux télécharger l'application et l'utiliser sans jamais rien payer.",
      },
      {
        q: 'Sur quelles plateformes ça marche ?',
        a: "Wyrm Forge est une application Windows (10 et 11). Une version macOS n'est pas prévue pour le moment. Le site web, lui, reste accessible depuis n'importe quel navigateur.",
      },
      {
        q: 'Comment fonctionnent les analyses IA ?',
        a: "Une IA analyse ton historique de parties récupéré via l'API officielle Riot pour repérer tes erreurs récurrentes — positionnement, timings, gestion de vague — et te proposer des conseils ciblés pour progresser. Aucune donnée autre que ton Riot ID n'est partagée. Chaque palier dispose d'une réserve de crédits IA renouvelée chaque lundi : une analyse en consomme plus ou moins selon son type (rapide ou détaillée) et le modèle de ton palier, et son coût est affiché avant de la lancer.",
      },
    ],
  },

  /* ── Footer ── */
  footer: {
    tagline: "L'assistant ultime pour grimper sur League of Legends. Forge ton ascension.",
    // Même ordre que `columnHrefs` dans Footer.tsx (les href restent côté composant).
    // Chaque libellé pointe désormais vers une destination RÉELLE : la colonne
    // « Communauté » (Discord / X / Reddit / YouTube) et les entrées « Guides » et
    // « API Riot » ont été retirées faute d'URL existante — un lien mort dans un
    // dossier envoyé à Riot Games est pire que pas de lien du tout.
    columns: [
      { title: 'Produit', links: ['Fonctionnalités', 'Télécharger', 'Tarifs', 'FAQ'] },
      { title: 'Ressources', links: ['Rechercher un joueur', 'Champions', 'Patch notes', 'Communauté'] },
    ],
    legalLinks: ['Conditions', 'Conditions de vente', 'Confidentialité', 'Mentions légales'],
    copyright: '© 2026 Wyrm Forge. Non affilié à Riot Games.',
    riotDisclaimer:
      "Wyrm Forge n'est pas affilié, sponsorisé ni endossé par Riot Games, Inc. ou l'une de ses filiales. League of Legends et Riot Games sont des marques ou marques déposées de Riot Games, Inc. League of Legends © Riot Games, Inc.",
    poweredBy: 'Powered by the Riot Games API.',
  },
}

export type LandingDict = typeof landingFr

export const landingEn: LandingDict = {
  nav: {
    links: ['Home', 'Features', 'Community', 'Pricing', 'Download', 'FAQ'],
    players: 'Players',
    login: 'Log in',
    download: 'Download',
    loginSignup: 'Log in / Sign up',
    langLabel: 'Language',
    langFrTitle: 'View this page in French',
    langEnTitle: 'View this page in English',
  },

  hero: {
    eyebrow: 'Wyrm Forge · Windows',
    titleBefore: 'Forge your',
    titleAccent: 'ascent.',
    subtitle:
      'A fully customisable overlay, community-shared builds and jungle paths, AI-powered game analysis. Everything you need to climb.',
    ctaDownload: 'Download for Windows',
    ctaFeatures: 'Features',
    badges: ['Free download', 'Official Riot API', 'Ban-safe'],
    overlay: {
      title: 'Overlay',
      live: '● Live',
      stats: ['CS/min', 'Vision', 'KDA', 'Dragon', 'Baron', 'Rank'],
      rankValue: 'Gold II',
    },
  },

  features: {
    eyebrow: "The climber's arsenal",
    titleBefore: 'Everything you need to ',
    titleAccent: 'dominate',
    titleAfter: ' the Rift.',
    subtitle:
      'An overlay forged for ambitious summoners. Modular, fuelled by the community and augmented by AI.',
    items: [
      {
        title: 'Customisable overlay',
        desc: 'Drag and drop your modules: jungle timers, CS tracker, vision score. Build the perfect overlay, pixel by pixel.',
        tags: ['Dragon timer', 'CS/min', 'Vision', 'Cooldowns', 'Gold diff'] as string[],
      },
      {
        title: 'Per-champion jungle pathing',
        desc: 'The path is computed for the champion you actually play, then drawn onto the minimap: camp order, timings, on-screen position.',
        tags: [] as string[],
      },
      {
        title: 'Live game tracking',
        desc: 'Follow any game in progress: both compositions, the rank of all ten players, the bans and the clock.',
        tags: [] as string[],
      },
      {
        title: 'AI analysis',
        desc: 'An AI breaks your games down: positioning mistakes, missed timings, targeted advice to climb faster.',
        tags: [] as string[],
      },
      {
        title: 'Match history, no account',
        desc: "Enter a Riot ID and browse a player's full history - result, champion, KDA, items. No sign-up required.",
        tags: [] as string[],
      },
      {
        title: 'Champion select advice',
        desc: 'As the draft unfolds, the assistant reads the composition taking shape and tells you what to pick and what to avoid.',
        tags: [] as string[],
      },
    ],
    moreTitle: 'Also included',
    more: [
      {
        title: 'Community jungle paths',
        desc: 'Thousands of optimised paths and builds, shared and rated by the best players.',
      },
      {
        title: 'Real-time builds',
        desc: 'Items and runes shown in game, tailored to your champion and the enemy composition.',
      },
      {
        title: 'Champion explorer',
        desc: 'Every League champion, filterable by role, class and difficulty.',
      },
      {
        title: 'AI patch note summaries',
        desc: 'Every League update summarised for you, patch after patch.',
      },
      {
        title: 'Routine and progress',
        desc: 'To-do lists, macro scenarios, statistics and daily quests.',
      },
      {
        title: '100% safe',
        desc: 'Official Riot API. No injection, no ban risk.',
      },
    ],
  },

  community: {
    eyebrow: 'Trust & legitimacy',
    titleBefore: 'Join a ',
    titleAccent: 'community',
    titleAfter: ' on the climb.',
    items: [
      {
        title: 'Free to get started',
        desc: 'Download and play without paying. A working free plan will always stay available, even once the paid plans go live.',
      },
      {
        title: 'Official Riot API',
        desc: 'Connected to the official Riot Games API. Legitimate, compliant data.',
      },
      {
        title: 'Ban-safe',
        desc: 'No memory injection, no cheating. Your account is never at risk.',
      },
    ],
  },

  pricing: {
    eyebrow: 'Pricing',
    titleBefore: 'Choose your ',
    titleAccent: 'forge',
    titleAfter: '.',
    subtitle: 'Start for free, step things up whenever you need to.',
    monthly: 'Monthly',
    annual: 'Yearly',
    annualPerk: '2 months free',
    popular: 'Popular',
    free: 'Free',
    perMonth: ' /month',
    priceFormat: '€{amount}',
    billedAnnually: 'Billed {price}/year',
    noCommitment: 'No commitment',
    ctaDownload: 'Download for free',
    ctaSubscribe: 'Subscribe',
    ctaSubscribeLoading: 'Redirecting…',
    ctaSubscribeAnon: 'Sign in to subscribe',
    ctaCurrent: 'Your current tier',
    ctaSoon: 'Coming soon',
    ctaSoonTitle: 'Payments will be available soon',
    checkoutError: 'Could not open checkout. Please try again in a moment.',
    checkoutPending: 'Payment confirmed — activating your tier…',
    checkoutDone: 'Your {tier} tier is active. Welcome to the forge!',
    checkoutSlow: 'Payment confirmed. Activation is taking a little longer than usual — reload the page in a minute.',
    checkoutCanceled: 'Payment canceled. You have not been charged.',
    consentTitle: '{tier} subscription',
    consentPriceLabel: 'Price:',
    perYear: ' /year',
    consentRenewalMonthly: 'Renews automatically every month, on the anniversary date of your subscription. No commitment: cancel anytime from your profile, effective at the end of the paid month.',
    consentRenewalAnnual: 'Renews automatically every year, on the anniversary date of your subscription. Cancel anytime from your profile, effective at the end of the paid year.',
    // Les CGV n'existent qu'en français (traduction = chantier séparé) : le
    // lien le dit, plutôt que d'ouvrir une page dans une langue inattendue.
    consentTermsBefore: 'Before paying, please read our',
    consentTermsLink: 'terms of sale (in French)',
    consentConfirm: 'Continue to payment',
    consentConfirmLoading: 'Redirecting…',
    consentCancel: 'Cancel',
    consentOutdated: 'Our terms have just been updated. Please reload the page to read the new version before paying.',
    moreTiers: 'More tiers are coming soon.',
    tiers: [
      {
        name: 'Apprentice',
        tagline: 'To get started',
        features: [
          'Overlay: 3 active blocks',
          '5 workshop imports / week',
          '15 AI credits / week (Haiku)',
          '3 custom builds',
          '3 jungle paths',
        ],
      },
      {
        name: 'Blacksmith',
        tagline: 'To improve',
        features: [
          'Overlay: 6 active blocks',
          '20 workshop imports / week',
          '65 AI credits / week (Haiku)',
          '20 custom builds',
          '10 jungle paths',
          'Workshop publishing',
        ],
      },
      {
        name: 'Master',
        tagline: 'To climb',
        features: [
          'Unlimited overlay',
          'Unlimited workshop',
          '135 AI credits / week (Sonnet)',
          'Unlimited builds & paths',
        ],
      },
    ],
  },

  finalCta: {
    eyebrow: 'The forge awaits',
    titleBefore: 'Ready to ',
    titleAccent: 'climb',
    titleAfter: '?',
    subtitle:
      'Download the assistant, set your overlay up in two minutes, and forge your ascent from your very next game.',
    ctaDownload: 'Download for Windows',
    note: 'Windows 10 / 11 · Free download',
  },

  faq: {
    eyebrow: 'Frequently asked questions',
    titleBefore: 'We answer ',
    titleAccent: 'everything',
    titleAfter: '.',
    items: [
      {
        q: 'Is it legal, and is there any ban risk?',
        a: 'Wyrm Forge only uses the official Riot Games API and never modifies game files. It complies with the Riot API terms of use and carries no ban risk. Wyrm Forge is not affiliated with Riot Games.',
      },
      {
        q: 'How does the overlay work?',
        a: 'The overlay sits on top of League of Legends in windowed or borderless windowed mode. You can set it to hide automatically in game or stay visible at all times, whichever you prefer.',
      },
      {
        q: 'Do I have to pay to use Wyrm Forge?',
        a: 'No. A complete free plan will remain available at all times, even once paid plans are offered. You can download the app and use it without ever paying anything.',
      },
      {
        q: 'Which platforms are supported?',
        a: 'Wyrm Forge is a Windows application (10 and 11). A macOS version is not planned for now. The website itself works from any browser.',
      },
      {
        q: 'How does the AI analysis work?',
        a: 'An AI reviews the match history it retrieves through the official Riot API to spot your recurring mistakes — positioning, timings, wave management — and gives you targeted advice to improve. Nothing beyond your Riot ID is ever shared. Each tier comes with a pool of AI credits refilled every Monday: an analysis uses more or fewer credits depending on its type (quick or detailed) and your tier\'s model, and its cost is shown before you run it.',
      },
    ],
  },

  footer: {
    tagline: 'The ultimate assistant for climbing in League of Legends. Forge your ascent.',
    columns: [
      { title: 'Product', links: ['Features', 'Download', 'Pricing', 'FAQ'] },
      { title: 'Resources', links: ['Player search', 'Champions', 'Patch notes', 'Community'] },
    ],
    legalLinks: ['Terms', 'Terms of sale', 'Privacy', 'Legal notice'],
    copyright: '© 2026 Wyrm Forge. Not affiliated with Riot Games.',
    riotDisclaimer:
      'Wyrm Forge is not affiliated with, sponsored or endorsed by Riot Games, Inc. or any of its affiliates. League of Legends and Riot Games are trademarks or registered trademarks of Riot Games, Inc. League of Legends © Riot Games, Inc.',
    poweredBy: 'Powered by the Riot Games API.',
  },
}

export const landingDicts: Record<Lang, LandingDict> = {
  fr: landingFr,
  en: landingEn,
}

/**
 * Formate un montant en euros pour la vitrine, dans la langue affichée.
 *
 * Deux choses varient selon la langue et doivent rester groupées ici — c'est la
 * SEULE fonction qui produit un prix affiché :
 *  - le séparateur décimal (`1,80` en FR, `1.80` en EN) ;
 *  - la POSITION du symbole, portée par `pricing.priceFormat` du dictionnaire
 *    (`2€` en FR, `€2` en EN).
 *
 * Entier → aucune décimale (`2` → « 2€ » / « €2 »), sinon deux décimales
 * (`1.8` → « 1,80€ » / « €1.80 »).
 */
export const formatPrice = (amount: number, lang: Lang): string => {
  const value = amount.toLocaleString(lang === 'en' ? 'en-GB' : 'fr-FR', {
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })
  return landingDicts[lang].pricing.priceFormat.replace('{amount}', value)
}
