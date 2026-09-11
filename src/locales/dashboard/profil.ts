/**
 * Pages connectées hors dashboard : `/profil` et la modale d'authentification
 * (`components/auth/AuthModal.tsx`) — Lot 7.
 *
 * ⚠️ `/consent` et tout le bloc `consent` de ce dictionnaire ont été retirés le
 * 2026-09-11 avec le module PRAC (décision HORTAL). Ce fichier a perdu deux tables
 * indexées par une valeur métier (`tracked_players.status` et les codes de
 * `respond_consent`) ainsi que leurs deux helpers.
 *
 * ⚠️ `AuthModal` ne contient pas que des libellés : il TRADUIT les erreurs Supabase
 * (ex. `'Invalid login credentials'` → « Email ou mot de passe incorrect. »). Côté EN,
 * il ne s'agit donc PAS de traduire le texte français mais de redonner le message
 * ANGLAIS D'ORIGINE de Supabase — deux textes différents, deux origines différentes.
 * D'où `supabaseErrors`, dont la clé EST le message brut renvoyé par Supabase et dont
 * la valeur EN est ce même message. Le test verrouille cette identité : côté EN,
 * `supabaseErrors[k] === k`. Un message non listé passe TEL QUEL dans les deux langues.
 *
 * ⚠️ Une table reste indexée par une VALEUR MÉTIER, jamais par un libellé :
 *  - `riotRanks`        ← `profiles.riot_rank` (CHECK à 8 clés, cf. migration
 *                         20260530000004 — « Matches exactly the LOL_RANKS array »).
 * Elle a son helper, qui renvoie la valeur brute si elle est inconnue.
 *
 * ⚠️ RÉSOLUTION À L'APPEL, et pourquoi ce n'est pas le patron du Lot 5 : sur ces
 * surfaces, les messages sont composés au moment de l'action et non au rendu. Le
 * défaut corrigé sur `StatsTab` (message figé dans la langue d'alors) ne s'y reproduit
 * pas — `/profil` ne rend pas la `Nav`, donc aucun sélecteur de langue n'y est
 * atteignable, et `AuthModal` masque celui de la `Nav` derrière son fond cliquable qui
 * la referme. Le jour où l'une de ces pages gagne un sélecteur, il faudra y mémoriser
 * un CODE comme dans `analyse.ts`.
 *
 * ⚠️ Ce qui reste NON traduit, et pourquoi :
 *  - les dates (`toLocaleDateString('fr-FR')`, `toLocaleString('fr-FR')`) — catégorie
 *    « locale de données », Lot 8 ;
 *  - `error.message` de Supabase hors table — texte serveur, interpolé tel quel.
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

export const profilFr = {
  /* Chaînes partagées par plusieurs blocs de /profil — un seul mot pour tous. */
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
    /* Bilan chiffré : W/L dans LES DEUX langues. Décision produit du Lot 8 — tout
       résultat de partie s'écrit W/L, y compris en français. Seuls les MOTS
       « Victoire » / « Défaite » se traduisent. */
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

  /* ── /profil : section Abonnement (SubscriptionSection) ──
     ⚠️ `until` et `lifetime` ne sont PAS redéclarés ici : la section réutilise ceux
     de `page`, qui portent déjà le badge « À VIE » de l'en-tête. Deux libellés pour
     la même notion divergeraient à la première retouche. */
  subscription: {
    title: 'Abonnement',
    currentPlan: 'Palier actuel',
    /* Abonnement qui se reconduit — `{date}` = `profiles.tier_expires_at`. */
    renewsOn: 'Renouvellement le {date}',
    /* Résiliation déjà programmée : même date, sens opposé. Ne pas fusionner. */
    endsOn: "Accès jusqu'au {date}, sans reconduction",
    /* Palier payant sans date : attribué à la main, pas par Stripe. */
    lifetimeNote: "Ce palier ne dépend d'aucun abonnement.",
    freeTitle: 'Tu es sur le palier gratuit.',
    freeBody: "Passe à un palier supérieur pour débloquer l'overlay complet, le workshop et les analyses IA.",
    manage: 'Gérer mon abonnement',
    manageLoading: 'Ouverture du portail…',
    manageHint: 'Moyen de paiement, factures et résiliation, sur Stripe.',
    manageError: "Impossible d'ouvrir le portail de facturation. Réessaie dans un instant.",
    /* `past_due` / `unpaid` — l'accès n'est pas forcément perdu, le ton reste factuel. */
    paymentIssue: 'Ton dernier paiement a échoué. Mets ton moyen de paiement à jour pour ne pas perdre ton palier.',
    /* Un admin garde son palier quoi qu'il arrive à son abonnement Stripe. */
    adminNote: "Ton palier vient de ton rôle d'administrateur : il ne dépend pas de cet abonnement.",
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

  subscription: {
    title: 'Subscription',
    currentPlan: 'Current tier',
    renewsOn: 'Renews on {date}',
    endsOn: 'Access until {date}, no renewal',
    lifetimeNote: 'This tier does not depend on any subscription.',
    freeTitle: "You're on the free tier.",
    freeBody: 'Upgrade to unlock the full overlay, the workshop and AI analyses.',
    manage: 'Manage my subscription',
    manageLoading: 'Opening the portal…',
    manageHint: 'Payment method, invoices and cancellation, on Stripe.',
    manageError: 'Could not open the billing portal. Please try again in a moment.',
    paymentIssue: 'Your last payment failed. Update your payment method to keep your tier.',
    adminNote: 'Your tier comes from your administrator role: it does not depend on this subscription.',
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

/** « 1 partie » / « 12 parties » — accord porté par le dico, pas par le composant. */
export function gamesLabel(dict: ProfilDict, count: number): string {
  const gabarit = count > 1 ? dict.shared.gamesOther : dict.shared.gamesOne
  return gabarit.replace('{count}', String(count))
}
