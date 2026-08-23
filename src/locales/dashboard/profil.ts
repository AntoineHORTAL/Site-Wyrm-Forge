/**
 * Pages connectées hors dashboard : `/profil`, `/consent`, et la modale
 * d'authentification (`components/auth/AuthModal.tsx`) — Lot 7.
 *
 * ⚠️ `AuthModal` ne contient pas que des libellés : il TRADUIT les erreurs Supabase
 * (ex. `'Invalid login credentials'` → « Email ou mot de passe incorrect. »). Côté EN,
 * il ne s'agit donc PAS de traduire le texte français mais de redonner le message
 * ANGLAIS D'ORIGINE de Supabase — deux textes différents, deux origines différentes.
 * D'où `supabaseErrors`, dont la clé EST le message brut renvoyé par Supabase et dont
 * la valeur EN est ce même message. Le test verrouille cette identité : côté EN,
 * `supabaseErrors[k] === k`. Un message non listé passe TEL QUEL dans les deux langues.
 *
 * ⚠️ Trois tables sont indexées par une VALEUR MÉTIER, jamais par un libellé :
 *  - `riotRanks`        ← `profiles.riot_rank` (CHECK à 8 clés, cf. migration
 *                         20260530000004 — « Matches exactly the LOL_RANKS array ») ;
 *  - `consent.pills`    ← `tracked_players.status` ;
 *  - `consent.rpcErrors`← codes levés par `RAISE EXCEPTION` dans `respond_consent`.
 * Chacune a son helper, qui renvoie la valeur brute si elle est inconnue.
 *
 * ⚠️ RÉSOLUTION À L'APPEL, et pourquoi ce n'est pas le patron du Lot 5 : sur ces trois
 * surfaces, les messages sont composés au moment de l'action et non au rendu. Le
 * défaut corrigé sur `StatsTab` (message figé dans la langue d'alors) ne s'y reproduit
 * pas — ni `/profil` ni `/consent` ne rendent la `Nav`, donc aucun sélecteur de langue
 * n'y est atteignable, et `AuthModal` masque celui de la `Nav` derrière son fond
 * cliquable qui la referme. Le jour où l'une de ces pages gagne un sélecteur, il
 * faudra y mémoriser un CODE comme dans `analyse.ts`.
 *
 * ⚠️ Ce qui reste NON traduit, et pourquoi :
 *  - les dates (`toLocaleDateString('fr-FR')`, `toLocaleString('fr-FR')`) — catégorie
 *    « locale de données », Lot 8 ;
 *  - `error.message` de Supabase hors table — texte serveur, interpolé tel quel ;
 *  - `queueLabel()` (`lib/prac.ts`) sur `/consent` — helper PARTAGÉ avec `/prac/*`,
 *    hors périmètre du chantier ; le traduire ici le traduirait aussi là-bas ;
 *  - les noms de champions, qui viennent de la base de suivi (`champion_name`).
 */

/**
 * Libellés d'affichage de `profiles.riot_rank`. La clé EST la valeur en base : elle est
 * écrite par le `<select>` et validée par `chk_profiles_riot_rank`. La couleur de chaque
 * rang reste dans `LOL_RANKS` (page profil) — c'est du style, pas du texte.
 *
 * ⚠️ NE PAS CONFONDRE avec `nav.tiers` (abonnements Wyrm Forge) ni avec `lib/lol-tiers.ts`
 * (rangs Riot en MAJUSCULES, avec Grand Maître et Challenger séparés). Trois tables,
 * trois espaces de clés — les fusionner casserait l'une des trois.
 */
const riotRanksFr = {
  iron:      'Fer',
  bronze:    'Bronze',
  silver:    'Argent',
  gold:      'Or',
  platinum:  'Platine',
  emerald:   'Émeraude',
  diamond:   'Diamant',
  'master+': 'Maître +',
}

export type RiotRankKey = keyof typeof riotRanksFr

const riotRanksEn: Record<RiotRankKey, string> = {
  iron:      'Iron',
  bronze:    'Bronze',
  silver:    'Silver',
  gold:      'Gold',
  platinum:  'Platinum',
  emerald:   'Emerald',
  diamond:   'Diamond',
  'master+': 'Master +',
}

/**
 * Erreurs Supabase remappées, indexées par le message BRUT renvoyé par l'API.
 *
 * Côté FR : le message français d'origine du produit. Côté EN : le message natif de
 * Supabase, c'est-à-dire la clé elle-même — surtout pas une traduction du français.
 * N'ajouter une entrée qu'après avoir VÉRIFIÉ la chaîne exacte renvoyée par Supabase :
 * une clé approximative ne matchera jamais et le remappage passera silencieusement.
 */
const supabaseErrorsFr = {
  'Invalid login credentials': 'Email ou mot de passe incorrect.',
}

export type SupabaseErrorKey = keyof typeof supabaseErrorsFr

const supabaseErrorsEn: Record<SupabaseErrorKey, string> = {
  'Invalid login credentials': 'Invalid login credentials',
}

/**
 * Pastille d'état du dossier de suivi, indexée par `tracked_players.status`.
 *
 * `pending` n'y figure pas VOLONTAIREMENT : cet état n'affiche pas de pastille mais les
 * deux boutons Accepter / Refuser. Une entrée `pending` serait du code mort.
 */
const consentPillsFr = {
  accepted: 'Suivi actif',
  declined: 'Demande refusée',
  revoked:  'Suivi révoqué',
}

export type ConsentPillKey = keyof typeof consentPillsFr

const consentPillsEn: Record<ConsentPillKey, string> = {
  accepted: 'Tracking active',
  declined: 'Request declined',
  revoked:  'Tracking revoked',
}

/**
 * Codes levés par `RAISE EXCEPTION` dans `respond_consent` (migration
 * 20260627000001) — les trois seuls possibles. Tous signifient la même chose côté
 * produit : l'état a changé entre le chargement de la page et le clic.
 */
const consentRpcErrorsFr = {
  no_consent_request: 'Aucune demande de suivi ne te concerne (elle a peut-être été retirée).',
  invalid_transition: "Action impossible : l'état de ta demande a changé. On a rafraîchi la page.",
  invalid_action:     'Action inconnue.',
}

export type ConsentRpcErrorKey = keyof typeof consentRpcErrorsFr

const consentRpcErrorsEn: Record<ConsentRpcErrorKey, string> = {
  no_consent_request: 'No tracking request concerns you (it may have been withdrawn).',
  invalid_transition: 'Action unavailable: your request changed state. The page has been refreshed.',
  invalid_action:     'Unknown action.',
}

export const profilFr = {
  /* Chaînes réellement partagées par /profil et /consent — deux pages, un seul mot. */
  shared: {
    back: '← Retour',
    topChampions: 'Champions les plus joués',
    winrate: 'Winrate',
    gamesOne: '{count} partie',
    gamesOther: '{count} parties',
  },

  /* ── /profil : en-tête et sections de lecture ── */
  page: {
    loading: 'Chargement du profil…',
    /* Écrans d'erreur pleine page. */
    errSignedOut: 'Tu dois être connecté pour voir ton profil.',
    errNotFound: 'Profil introuvable.',
    errLoad: 'Erreur lors du chargement du profil.',
    errUnavailable: 'Profil indisponible.',

    /* En-tête — `{date}` reste formatée en fr-FR (Lot 8). */
    until: "jusqu'au {date}",
    lifetime: 'À VIE',
    memberSince: 'Membre depuis {date}',
    pricing: 'Voir les tarifs →',

    /* Section compte Riot. */
    riotTitle: 'Compte League of Legends',
    riotNone: "Aucun compte Riot lié. Va sur l'onglet Accueil pour en ajouter un.",

    /* Statistiques des dernières parties. */
    statsTitle: 'Stats sur les {count} dernières parties',
    games: 'Parties',
    wins: 'Victoires',
    /* Bilan chiffré : W/L dans les deux langues — voir `consent.record`, aligné dessus. */
    winLoss: '{wins}W {losses}L',
    avgKda: 'KDA moyen',
    avgCs: 'CS moyen',

    /* Top champions — `{count}` via `gamesLabel`, `{rate}` = winrate du champion. */
    champFallback: 'Champ #{id}',
    champWinrate: '{rate}% WR',

    /* Activité Wyrm Forge. */
    activityTitle: 'Mon activité Wyrm Forge',
    builds: 'Builds créés',
    todoLists: 'To-do lists',
    todoItems: 'Tâches au total',
  },

  /* ── /profil : paramètres du compte (ProfileSettings + EditableField) ── */
  settings: {
    title: 'Paramètres du compte',

    /* Boutons et états du champ éditable. */
    edit: 'Modifier',
    cancel: 'Annuler',
    save: 'Enregistrer',
    saving: 'Enregistrement…',
    /* Repli quand `onSave` rejette avec autre chose qu'une Error. */
    errUnknown: 'Erreur',
    /* `{message}` = message Supabase, non traduisible. */
    failure: 'Échec : {message}',
    passwordNotice: 'Tu seras peut-être déconnecté après le changement de mot de passe.',

    /* Un bloc par champ. `editLabel` est l'intitulé du MODE ÉDITION : il est écrit en
       toutes lettres et non dérivé de `label`, car « Nouveau » + le libellé ne
       s'accorde ni en genre ni en nombre, et encore moins d'une langue à l'autre. */
    username: {
      label: 'Pseudo',
      editLabel: 'Nouveau pseudo',
      placeholder: 'Nouveau pseudo',
      done: 'Pseudo mis à jour.',
    },
    email: {
      label: 'Email',
      editLabel: 'Nouvel email',
      placeholder: 'Nouvel email',
      /* `{email}` = adresse saisie, jamais traduite. */
      done: 'Un email de confirmation a été envoyé à {email}.',
    },
    password: {
      label: 'Mot de passe',
      editLabel: 'Nouveau mot de passe',
      placeholder: 'Nouveau mot de passe (8 caractères minimum)',
      tooShort: 'Le mot de passe doit faire au moins 8 caractères.',
      done: 'Mot de passe mis à jour.',
    },
    rank: {
      label: 'Rang League (pour comparaisons)',
      editLabel: 'Nouveau rang League',
      empty: 'Non renseigné',
      placeholder: 'Sélectionne ton rang',
      required: 'Sélectionne un rang.',
      done: 'Rang mis à jour. Tu verras la comparaison sur la page des matchs.',
    },

    /* Bloc Riot en lecture seule — la liaison se fait depuis l'onglet Accueil. */
    riotTitle: 'Compte Riot',
    riotNone: "Aucun compte Riot lié — lier depuis l'onglet Accueil.",
  },

  /* Indexé par `profiles.riot_rank`. */
  riotRanks: riotRanksFr,

  /* ── /profil : suppression du compte (RGPD art. 17) ── */
  deletion: {
    /* Comptes équipe / admin : information seule, aucun formulaire. */
    protectedTitle: 'Compte Wyrm Forge protégé',
    protectedBefore: "Les comptes de l'équipe Wyrm Forge ne peuvent pas être supprimés depuis l'app. Pour toute demande administrative, contacte directement",
    protectedAfter: '.',

    title: 'Suppression du compte et des données (RGPD)',

    /* Demande déjà déposée. */
    pendingTitle: 'Demande en cours de traitement',
    pendingDate: 'Demande déposée le {date}.',
    pendingDelay: 'Elle sera traitée sous 30 jours (article 17 du RGPD).',
    cancelRequest: 'Annuler ma demande',

    /* Présentation avant ouverture du formulaire. `{strong}` porte « irréversible ». */
    introBefore: "Conformément à l'article 17 du RGPD (droit à l'effacement), tu peux demander la suppression définitive de ton compte et de toutes les données associées. Cette action est",
    introStrong: 'irréversible',
    introAfter: 'et entraînera :',
    bullet1: 'Suppression de ton profil et de tes identifiants',
    bullet2: "Suppression de tes builds d'items et to-do lists",
    bullet3: 'Suppression du lien vers ton compte Riot',
    bullet4: 'Suppression de toutes contributions publiques (workshop)',
    delay: 'Traitement effectué sous 30 jours maximum.',
    open: 'Demander la suppression de mon compte',

    /* Formulaire de confirmation — `{email}` est rendu en gras entre les deux fragments. */
    confirmBefore: 'Pour confirmer, saisis ton email',
    confirmAfter: 'ci-dessous :',
    reasonLabel: 'Raison du départ (optionnel) :',
    reasonPlaceholder: "Ce qui t'a déçu, manqué, ou ce qu'on pourrait améliorer…",
    submit: 'Confirmer la suppression',
    submitting: 'Envoi…',

    /* Retours d'action. */
    emailMismatch: "L'email saisi ne correspond pas à celui de ton compte.",
    done: 'Demande enregistrée. Elle sera traitée sous 30 jours.',
    errUnexpected: 'Erreur inattendue.',
    /* `{message}` = message Supabase, non traduisible. */
    cancelFailed: "Impossible d'annuler : {message}",
    cancelled: 'Demande annulée.',
  },

  /* ── /profil : zone sensible ── */
  danger: {
    title: 'Zone sensible',
    text: "Te déconnecter de l'application sur cet appareil.",
    logout: 'Se déconnecter',
    loggingOut: 'Déconnexion…',
  },

  /* ── AuthModal ── */
  auth: {
    /* Titres et sous-titres, indexés par le `mode` local (`login`/`signup`/`forgot`). */
    titleLogin: 'Connexion',
    titleSignup: 'Créer un compte',
    titleForgot: 'Mot de passe oublié',
    subtitleLogin: 'Content de te revoir, Invocateur.',
    subtitleSignup: 'Rejoins la forge.',
    subtitleForgot: "On t'envoie un lien de réinitialisation.",

    /* Onglets — le libellé de connexion diffère du titre : « Connexion » / « Log in ». */
    tabLogin: 'Connexion',
    tabSignup: 'Inscription',

    google: 'Continuer avec Google',
    or: 'ou',

    /* Champs. */
    pseudoLabel: 'Pseudo',
    pseudoPlaceholder: 'TonPseudo',
    emailLabel: 'Adresse email',
    emailPlaceholder: 'ton@email.com',
    passwordLabel: 'Mot de passe',
    passwordPlaceholderSignup: 'Min. 6 caractères',
    confirmLabel: 'Confirmer le mot de passe',

    forgotLink: 'Mot de passe oublié ?',
    backToLogin: '← Retour à la connexion',

    /* Bouton d'envoi, selon le mode. */
    submitLogin: 'Se connecter',
    submitSignup: 'Créer mon compte',
    submitForgot: 'Envoyer le lien',

    /* Écran de succès. */
    successForgotTitle: 'Email envoyé !',
    successSignupTitle: 'Compte créé avec succès !',
    successForgot: 'Un lien de réinitialisation a été envoyé à ton adresse email.',
    successSignup: 'Compte créé ! Vérifie ton email pour confirmer ton inscription.',
    close: 'Fermer',

    /* Erreurs LOCALES — validation côté client et échec de l'ouverture OAuth. */
    errGoogle: 'Erreur lors de la connexion Google.',
    errPasswordMismatch: 'Les mots de passe ne correspondent pas.',
    errPasswordShort: 'Le mot de passe doit contenir au moins 6 caractères.',
    errPseudoShort: 'Le pseudo doit contenir au moins 2 caractères.',

    /* Erreurs SERVEUR remappées — voir l'en-tête du fichier. */
    supabaseErrors: supabaseErrorsFr,
  },

  /* ── /consent ── */
  consent: {
    title: 'Suivi de performances',

    /* Visiteur déconnecté. */
    signedOut: 'Connecte-toi à ton compte Wyrm Forge pour consulter une éventuelle demande de suivi.',
    signIn: 'Aller à la connexion',

    /* Aucun dossier — page neutre, jamais une erreur. */
    none: 'Aucune demande de suivi en cours te concernant. Si un organisateur souhaite suivre tes performances, tu recevras une demande ici.',

    /* pending — `{strong}` porte « suivre tes performances League of Legends ». */
    pendingBefore: 'Un organisateur Wyrm Forge souhaite',
    pendingStrong: 'suivre tes performances League of Legends',
    pendingAfter: "dans le temps (historique de parties trackées). Aucune donnée n'est collectée tant que tu n'as pas accepté.",
    accept: 'Accepter le suivi',
    decline: 'Refuser',

    /* Indexé par `tracked_players.status` — pas d'entrée `pending` (voir la table). */
    pills: consentPillsFr,

    acceptedText: 'Tu as accepté le suivi de tes performances. Tu peux le révoquer à tout moment — tes données de suivi seront alors supprimées.',
    revoke: 'Révoquer le suivi',
    declinedText: "Tu as refusé cette demande de suivi. Aucune donnée n'est collectée. Si tu changes d'avis, un organisateur devra te renvoyer une nouvelle demande.",
    revokedText: 'Tu as révoqué le suivi de tes performances. Tu peux le réactiver quand tu veux — le suivi reprendra à partir de maintenant.',
    reactivate: 'Réactiver le suivi',

    /* Dates de la demande — `{date}` reste formatée en fr-FR (Lot 8). */
    metaRequested: 'Demande du {date}',
    metaResponded: '· réponse le {date}',

    /* Confirmations, indexées par le status RENVOYÉ par `respond_consent`. La fonction
       ne renvoie jamais `pending` : `okFallback` couvre le cas théorique. */
    okAccepted: 'Suivi accepté. Merci !',
    okDeclined: 'Demande refusée.',
    okRevoked: 'Suivi révoqué. Tes données de suivi seront supprimées.',
    okFallback: "C'est noté.",

    /* Indexé par le code levé par `respond_consent` ; `rpcFallback` couvre tout le reste
       (erreur réseau, permission, code futur non listé ici). */
    rpcErrors: consentRpcErrorsFr,
    rpcFallback: 'Une erreur est survenue. Réessaie dans un instant.',

    /* Bloc « Ton suivi » — vue self. */
    selfTitle: 'Ton suivi',
    selfEmpty: "Aucune partie suivie pour l'instant.",
    /* `{record}` reçoit `record` déjà composé, ou une chaîne vide si les agrégats
       manquent — d'où la parenthèse fermante portée par la phrase elle-même. */
    selfIntroOne: 'Voici les données enregistrées sur tes performances ({count} partie{record}).',
    selfIntroOther: 'Voici les données enregistrées sur tes performances ({count} parties{record}).',
    /* Bilan chiffré — W/L dans LES DEUX langues, comme `page.winLoss` de /profil.
       Décision produit : tout résultat de partie s'écrit W/L, y compris en français,
       du bilan chiffré aux pastilles d'une lettre (`common.winInitial`,
       `analyse.postgame.win`). Seuls les MOTS « Victoire » / « Défaite » se traduisent. */
    record: ' · {wins}W {losses}L',

    kda: 'KDA',
    csPerMin: 'CS/min',
    vision: 'Vision',
    damage: 'Dégâts (moy.)',
    gold: 'Or (moy.)',

    trackedTitle: 'Parties suivies ({count})',
    /* Replis quand la ligne de suivi n'a ni champion ni file renseignés. */
    championFallback: 'Champion',
    queueFallback: 'File ?',
  },
}

export type ProfilDict = typeof profilFr

export const profilEn: ProfilDict = {
  shared: {
    back: '← Back',
    topChampions: 'Most played champions',
    winrate: 'Winrate',
    gamesOne: '{count} game',
    gamesOther: '{count} games',
  },

  page: {
    loading: 'Loading profile…',
    errSignedOut: 'You must be signed in to view your profile.',
    errNotFound: 'Profile not found.',
    errLoad: 'Something went wrong while loading your profile.',
    errUnavailable: 'Profile unavailable.',

    until: 'until {date}',
    lifetime: 'LIFETIME',
    memberSince: 'Member since {date}',
    pricing: 'See pricing →',

    riotTitle: 'League of Legends account',
    riotNone: 'No Riot account linked. Head to the Home tab to add one.',

    statsTitle: 'Stats over the last {count} games',
    games: 'Games',
    wins: 'Wins',
    winLoss: '{wins}W {losses}L',
    avgKda: 'Average KDA',
    avgCs: 'Average CS',

    champFallback: 'Champ #{id}',
    champWinrate: '{rate}% WR',

    activityTitle: 'My Wyrm Forge activity',
    builds: 'Builds created',
    todoLists: 'To-do lists',
    todoItems: 'Tasks in total',
  },

  settings: {
    title: 'Account settings',

    edit: 'Edit',
    cancel: 'Cancel',
    save: 'Save',
    saving: 'Saving…',
    errUnknown: 'Error',
    failure: 'Failed: {message}',
    passwordNotice: 'You may be signed out after changing your password.',

    username: {
      label: 'Username',
      editLabel: 'New username',
      placeholder: 'New username',
      done: 'Username updated.',
    },
    email: {
      label: 'Email',
      editLabel: 'New email',
      placeholder: 'New email',
      done: 'A confirmation email has been sent to {email}.',
    },
    password: {
      label: 'Password',
      editLabel: 'New password',
      placeholder: 'New password (8 characters minimum)',
      tooShort: 'Your password must be at least 8 characters long.',
      done: 'Password updated.',
    },
    rank: {
      label: 'League rank (for comparisons)',
      editLabel: 'New League rank',
      empty: 'Not set',
      placeholder: 'Pick your rank',
      required: 'Pick a rank.',
      done: 'Rank updated. You will see the comparison on the matches page.',
    },

    riotTitle: 'Riot account',
    riotNone: 'No Riot account linked — link one from the Home tab.',
  },

  riotRanks: riotRanksEn,

  deletion: {
    protectedTitle: 'Protected Wyrm Forge account',
    protectedBefore: 'Wyrm Forge team accounts cannot be deleted from the app. For any administrative request, contact us directly at',
    protectedAfter: '.',

    title: 'Account and data deletion (GDPR)',

    pendingTitle: 'Request being processed',
    pendingDate: 'Request submitted on {date}.',
    pendingDelay: 'It will be processed within 30 days (GDPR article 17).',
    cancelRequest: 'Cancel my request',

    introBefore: 'Under article 17 of the GDPR (right to erasure), you can request the permanent deletion of your account and of all associated data. This action is',
    introStrong: 'irreversible',
    introAfter: 'and will result in:',
    bullet1: 'Deletion of your profile and credentials',
    bullet2: 'Deletion of your item builds and to-do lists',
    bullet3: 'Deletion of the link to your Riot account',
    bullet4: 'Deletion of every public contribution (workshop)',
    delay: 'Processed within 30 days at most.',
    open: 'Request the deletion of my account',

    confirmBefore: 'To confirm, type your email',
    confirmAfter: 'below:',
    reasonLabel: 'Reason for leaving (optional):',
    reasonPlaceholder: 'What disappointed you, what was missing, or what we could improve…',
    submit: 'Confirm deletion',
    submitting: 'Sending…',

    emailMismatch: 'The email you typed does not match the one on your account.',
    done: 'Request recorded. It will be processed within 30 days.',
    errUnexpected: 'Unexpected error.',
    cancelFailed: 'Could not cancel: {message}',
    cancelled: 'Request cancelled.',
  },

  danger: {
    title: 'Danger zone',
    text: 'Sign out of the app on this device.',
    logout: 'Sign out',
    loggingOut: 'Signing out…',
  },

  auth: {
    titleLogin: 'Log in',
    titleSignup: 'Create an account',
    titleForgot: 'Forgot password',
    subtitleLogin: 'Good to see you again, Summoner.',
    subtitleSignup: 'Join the forge.',
    subtitleForgot: 'We will send you a reset link.',

    tabLogin: 'Log in',
    tabSignup: 'Sign up',

    google: 'Continue with Google',
    or: 'or',

    pseudoLabel: 'Username',
    pseudoPlaceholder: 'YourUsername',
    emailLabel: 'Email address',
    emailPlaceholder: 'you@email.com',
    passwordLabel: 'Password',
    passwordPlaceholderSignup: 'Min. 6 characters',
    confirmLabel: 'Confirm password',

    forgotLink: 'Forgot your password?',
    backToLogin: '← Back to log in',

    submitLogin: 'Log in',
    submitSignup: 'Create my account',
    submitForgot: 'Send the link',

    successForgotTitle: 'Email sent!',
    successSignupTitle: 'Account created!',
    successForgot: 'A reset link has been sent to your email address.',
    successSignup: 'Account created! Check your email to confirm your registration.',
    close: 'Close',

    errGoogle: 'Google sign-in failed.',
    errPasswordMismatch: 'The passwords do not match.',
    errPasswordShort: 'Your password must be at least 6 characters long.',
    errPseudoShort: 'Your username must be at least 2 characters long.',

    supabaseErrors: supabaseErrorsEn,
  },

  consent: {
    title: 'Performance tracking',

    signedOut: 'Sign in to your Wyrm Forge account to view any pending tracking request.',
    signIn: 'Go to sign-in',

    none: 'No tracking request currently concerns you. If an organiser wants to track your performance, you will get a request here.',

    pendingBefore: 'A Wyrm Forge organiser would like to',
    pendingStrong: 'track your League of Legends performance',
    pendingAfter: 'over time (history of tracked games). No data is collected until you accept.',
    accept: 'Accept tracking',
    decline: 'Decline',

    pills: consentPillsEn,

    acceptedText: 'You accepted performance tracking. You can revoke it at any time — your tracking data will then be deleted.',
    revoke: 'Revoke tracking',
    declinedText: 'You declined this tracking request. No data is collected. If you change your mind, an organiser will have to send you a new request.',
    revokedText: 'You revoked performance tracking. You can reactivate it whenever you want — tracking will resume from now on.',
    reactivate: 'Reactivate tracking',

    metaRequested: 'Requested on {date}',
    metaResponded: '· answered on {date}',

    okAccepted: 'Tracking accepted. Thank you!',
    okDeclined: 'Request declined.',
    okRevoked: 'Tracking revoked. Your tracking data will be deleted.',
    okFallback: 'Noted.',

    rpcErrors: consentRpcErrorsEn,
    rpcFallback: 'Something went wrong. Try again in a moment.',

    selfTitle: 'Your tracking',
    selfEmpty: 'No tracked game yet.',
    selfIntroOne: 'Here is the data recorded about your performance ({count} game{record}).',
    selfIntroOther: 'Here is the data recorded about your performance ({count} games{record}).',
    record: ' · {wins}W {losses}L',

    kda: 'KDA',
    csPerMin: 'CS/min',
    vision: 'Vision',
    damage: 'Damage (avg.)',
    gold: 'Gold (avg.)',

    trackedTitle: 'Tracked games ({count})',
    championFallback: 'Champion',
    queueFallback: 'Queue ?',
  },
}

/**
 * Libellé d'affichage d'un `profiles.riot_rank`, tolérant à l'entrée.
 *
 * Même contrat que `subscriptionTierLabel` (nav.ts) : un rang ajouté au CHECK et pas
 * encore déclaré ici est renvoyé TEL QUEL. `null` (rang non renseigné) donne le
 * libellé « Non renseigné », qui est ce que la page affichait déjà.
 */
export function riotRankLabel(dict: ProfilDict, rank?: string | null): string {
  if (!rank) return dict.settings.rank.empty
  return dict.riotRanks[rank as RiotRankKey] ?? rank
}

/**
 * Message d'erreur d'authentification à partir du texte BRUT renvoyé par Supabase.
 *
 * Un message listé dans `supabaseErrors` est remplacé — par le texte français en FR,
 * par le message natif de Supabase en EN. Tout le reste passe TEL QUEL : on n'invente
 * pas une traduction pour un message serveur qu'on n'a pas vérifié.
 */
export function supabaseAuthError(dict: ProfilDict, raw: string): string {
  return dict.auth.supabaseErrors[raw as SupabaseErrorKey] ?? raw
}

/**
 * Message d'erreur de `respond_consent` à partir du texte brut de l'exception.
 *
 * La recherche se fait par `includes` et non par égalité : PostgREST enrobe le code
 * levé par `RAISE EXCEPTION` dans un message plus large. Un code inconnu (ou une
 * erreur réseau, qui n'en contient aucun) retombe sur `rpcFallback`.
 */
export function consentRpcError(dict: ProfilDict, raw: string): string {
  const code = (Object.keys(dict.consent.rpcErrors) as ConsentRpcErrorKey[])
    .find(k => raw.includes(k))
  return code ? dict.consent.rpcErrors[code] : dict.consent.rpcFallback
}

/**
 * Confirmation affichée après `respond_consent`, selon le status RENVOYÉ par la
 * fonction. Elle ne renvoie jamais `pending` (aucune transition n'y mène) : le repli
 * couvre le cas où la valeur n'est pas une chaîne connue.
 */
export function consentOkMessage(dict: ProfilDict, status?: string | null): string {
  switch (status) {
    case 'accepted': return dict.consent.okAccepted
    case 'declined': return dict.consent.okDeclined
    case 'revoked':  return dict.consent.okRevoked
    default:         return dict.consent.okFallback
  }
}

/** « 1 partie » / « 12 parties » — accord porté par le dico, pas par le composant. */
export function gamesLabel(dict: ProfilDict, count: number): string {
  const gabarit = count > 1 ? dict.shared.gamesOther : dict.shared.gamesOne
  return gabarit.replace('{count}', String(count))
}
