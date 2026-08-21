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
    // L'ordre suit celui de `navLinks` dans Nav.tsx (accueil, features, communaute,
    // tarifs, telecharger, faq) : seuls les libellés changent, les id de section non.
    links: ['Accueil', 'Fonctionnalités', 'Communauté', 'Tarifs', 'Télécharger', 'FAQ'],
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
    ctaSearch: 'Rechercher un joueur',
    ctaFeatures: 'Fonctionnalités',
    badges: ['100% Gratuit', 'API officielle Riot', 'Sans ban'],
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
    // Même ordre que le tableau d'icônes dans Features.tsx
    items: [
      {
        title: 'Overlay personnalisable',
        desc: "Glisse-dépose tes modules : timers de jungle, CS tracker, vision score. Compose l'overlay parfait, pixel par pixel.",
        tags: ['Timer Dragon', 'CS/min', 'Vision', 'Cooldowns', 'Gold diff'] as string[],
      },
      {
        title: 'Jungle paths communautaires',
        desc: 'Des milliers de chemins de jungle et builds optimisés, partagés et notés par les meilleurs joueurs.',
        tags: [] as string[],
      },
      {
        title: 'Analyses IA',
        desc: 'Une IA décortique tes parties : erreurs de positionnement, timings manqués, conseils ciblés pour grimper plus vite.',
        tags: [] as string[],
      },
      {
        title: 'Builds en temps réel',
        desc: 'Les meilleurs items et runes affichés en jeu, adaptés à ton champion et à la composition ennemie.',
        tags: [] as string[],
      },
      {
        title: '100% sécurisé',
        desc: "Basé sur l'API officielle Riot. Aucune injection, aucun risque de ban. Joue l'esprit tranquille.",
        tags: [] as string[],
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
        title: '100% Gratuit',
        desc: 'Aucun abonnement, aucun paywall. Toutes les fonctionnalités, pour toujours.',
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
    popular: 'Populaire',
    free: 'Gratuit',
    perMonth: ' /mois',
    // {price} est remplacé par le montant déjà formaté par le composant
    billedAnnually: 'Facturé {price}€/an',
    noCommitment: 'Sans engagement',
    ctaDownload: 'Télécharger gratuitement',
    ctaSoon: 'Bientôt disponible',
    ctaSoonTitle: 'Le paiement sera disponible prochainement',
    moreTiers: "D'autres paliers (Architecte, Architecte+) arrivent prochainement.",
    // Les noms de paliers (Apprenti / Forgeron / Maître) ne sont volontairement pas
    // traduits : ce sont les valeurs de `profiles.tier` en base, partagées avec l'app
    // de bureau. Seuls la tagline et les features le sont.
    tiers: [
      {
        tagline: 'Pour découvrir',
        features: [
          'Overlay : 3 blocs actifs',
          '5 imports workshop / sem',
          '5 analyses IA / mois (Haiku)',
          '3 builds custom',
          '3 jungle paths',
        ],
      },
      {
        tagline: 'Pour progresser',
        features: [
          'Overlay : 6 blocs actifs',
          '20 imports workshop / sem',
          '20 analyses IA / mois (Sonnet)',
          '20 builds custom',
          '10 jungle paths',
          'Publication workshop',
        ],
      },
      {
        tagline: 'Pour grimper',
        features: [
          'Overlay illimité',
          'Workshop illimité',
          'Analyses IA illimitées (Opus)',
          'Builds & paths illimités',
          'Comparaison rangs supérieurs',
          'Analyse vidéo (à venir)',
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
    note: 'Windows 10 / 11 · 100% Gratuit',
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
        q: 'Est-ce vraiment 100% gratuit ?',
        a: "Oui. Wyrm Forge est entièrement gratuit pour la communauté. Le projet n'est pas commercial — il est développé par passion et toutes les fonctionnalités sont accessibles sans paiement.",
      },
      {
        q: 'Sur quelles plateformes ça marche ?',
        a: "Wyrm Forge est une application Windows (10 et 11). Une version macOS n'est pas prévue pour le moment. Le site web, lui, reste accessible depuis n'importe quel navigateur.",
      },
      {
        q: 'Comment fonctionnent les analyses IA ?',
        a: "Une IA analyse ton historique de parties récupéré via l'API officielle Riot pour repérer tes erreurs récurrentes — positionnement, timings, gestion de vague — et te proposer des conseils ciblés pour progresser. Aucune donnée autre que ton Riot ID n'est partagée.",
      },
    ],
  },

  /* ── Footer ── */
  footer: {
    tagline: "L'assistant ultime pour grimper sur League of Legends. Forge ton ascension.",
    // Même ordre que `columns` dans Footer.tsx (les href restent côté composant)
    columns: [
      { title: 'Produit', links: ['Fonctionnalités', 'Télécharger', 'Communauté', 'Changelog'] },
      { title: 'Ressources', links: ['Guides', 'Builds', 'Jungle paths', 'API Riot'] },
      { title: 'Communauté', links: ['Discord', 'Twitter / X', 'Reddit', 'YouTube'] },
    ],
    legalLinks: ['Conditions', 'Confidentialité', 'Mentions légales'],
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
    ctaSearch: 'Search for a player',
    ctaFeatures: 'Features',
    badges: ['100% Free', 'Official Riot API', 'Ban-safe'],
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
        title: 'Community jungle paths',
        desc: 'Thousands of optimised jungle paths and builds, shared and rated by the best players.',
        tags: [] as string[],
      },
      {
        title: 'AI analysis',
        desc: 'An AI breaks your games down: positioning mistakes, missed timings, targeted advice to climb faster.',
        tags: [] as string[],
      },
      {
        title: 'Real-time builds',
        desc: 'The best items and runes shown in game, tailored to your champion and to the enemy composition.',
        tags: [] as string[],
      },
      {
        title: '100% safe',
        desc: 'Built on the official Riot API. No injection, no ban risk. Play with peace of mind.',
        tags: [] as string[],
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
        title: '100% Free',
        desc: 'No subscription, no paywall. Every feature, forever.',
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
    popular: 'Popular',
    free: 'Free',
    perMonth: ' /month',
    billedAnnually: 'Billed {price}€/year',
    noCommitment: 'No commitment',
    ctaDownload: 'Download for free',
    ctaSoon: 'Coming soon',
    ctaSoonTitle: 'Payments will be available soon',
    moreTiers: 'More tiers (Architecte, Architecte+) are coming soon.',
    tiers: [
      {
        tagline: 'To get started',
        features: [
          'Overlay: 3 active blocks',
          '5 workshop imports / week',
          '5 AI analyses / month (Haiku)',
          '3 custom builds',
          '3 jungle paths',
        ],
      },
      {
        tagline: 'To improve',
        features: [
          'Overlay: 6 active blocks',
          '20 workshop imports / week',
          '20 AI analyses / month (Sonnet)',
          '20 custom builds',
          '10 jungle paths',
          'Workshop publishing',
        ],
      },
      {
        tagline: 'To climb',
        features: [
          'Unlimited overlay',
          'Unlimited workshop',
          'Unlimited AI analyses (Opus)',
          'Unlimited builds & paths',
          'Compare against higher ranks',
          'Video analysis (coming soon)',
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
    note: 'Windows 10 / 11 · 100% Free',
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
        q: 'Is it really 100% free?',
        a: 'Yes. Wyrm Forge is completely free for the community. The project is not commercial — it is built out of passion, and every feature is available without paying.',
      },
      {
        q: 'Which platforms are supported?',
        a: 'Wyrm Forge is a Windows application (10 and 11). A macOS version is not planned for now. The website itself works from any browser.',
      },
      {
        q: 'How does the AI analysis work?',
        a: 'An AI reviews the match history it retrieves through the official Riot API to spot your recurring mistakes — positioning, timings, wave management — and gives you targeted advice to improve. Nothing beyond your Riot ID is ever shared.',
      },
    ],
  },

  footer: {
    tagline: 'The ultimate assistant for climbing in League of Legends. Forge your ascent.',
    columns: [
      { title: 'Product', links: ['Features', 'Download', 'Community', 'Changelog'] },
      { title: 'Resources', links: ['Guides', 'Builds', 'Jungle paths', 'Riot API'] },
      { title: 'Community', links: ['Discord', 'Twitter / X', 'Reddit', 'YouTube'] },
    ],
    legalLinks: ['Terms', 'Privacy', 'Legal notice'],
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
