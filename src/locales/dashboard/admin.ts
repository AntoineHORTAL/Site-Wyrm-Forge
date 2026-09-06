/**
 * Onglet Admin (`tabs/AdminTab.tsx`) — Lot 6.
 *
 * ⚠️ Cet onglet affiche des VALEURS MÉTIER brutes venues de la base. Traduire signifie
 * ajouter une table d'affichage `valeur → libellé`, jamais toucher aux valeurs
 * elles-mêmes ni aux comparaisons qui les utilisent (`p.tier === t`, `p.role === 'admin'`,
 * `p.status === 'draft'`, la clé écrite dans `app_settings`…). Quatre tables ici :
 *  - `roles`            ← `profiles.role`      (`'user' | 'admin'`) ;
 *  - `patches.statuses` ← `patch_notes.status` (`'draft' | 'published'`, CHECK en base) ;
 *  - `patches.reasons`  ← `reason` renvoyé par l'Edge Function `patch-notes-generator` ;
 *  - `settings`         ← `app_settings.key`   (les 4 flags gérés par ce panneau).
 * Chacune est lue via son helper, qui renvoie la VALEUR BRUTE si elle est inconnue
 * (même repli que `subscriptionTierLabel`) : mieux vaut un libellé non traduit qu'un vide.
 *
 * ⚠️ Les libellés de TIER ne sont PAS ici : ce sont les mêmes valeurs `profiles.tier`
 * que la carte d'abonnement, déjà traduites par `nav.tiers` / `subscriptionTierLabel`.
 * Les dupliquer ferait diverger le « Maître » du menu et celui du tableau admin.
 *
 * ⚠️ Ce qui reste NON traduit, et pourquoi :
 *  - les dates (`toLocaleDateString('fr-FR')`) — catégorie « locale de données », Lot 8 ;
 *  - `error.message` de Supabase et un `reason` inconnu — texte écrit par le serveur ;
 *  - le message de `JSON.parse` — écrit par le moteur JS, dans la langue du navigateur.
 */

/**
 * Libellés d'affichage de `profiles.role`. La clé EST la valeur en base : la garde
 * `p.role === 'admin'` (qui masque « Modifier » et « Certifier » sur les comptes admin)
 * compare la valeur, jamais ce libellé.
 */
const rolesFr = {
  user:  'Utilisateur',
  admin: 'Admin',
}

export type ProfileRoleKey = keyof typeof rolesFr

const rolesEn: Record<ProfileRoleKey, string> = {
  user:  'User',
  admin: 'Admin',
}

/**
 * Libellés d'affichage de `patch_notes.status` — les deux seules valeurs acceptées par
 * la contrainte `CHECK (status IN ('draft', 'published'))`. Un statut ajouté en base
 * sans entrée ici s'afficherait tel quel plutôt que vide.
 */
const patchStatusesFr = {
  draft:     'Brouillon',
  published: 'Publié',
}

export type PatchStatusKey = keyof typeof patchStatusesFr

const patchStatusesEn: Record<PatchStatusKey, string> = {
  draft:     'Draft',
  published: 'Published',
}

/**
 * Motifs de non-génération renvoyés par l'Edge Function `patch-notes-generator`
 * (`{ skipped: true, reason }`). Ce sont des CODES machine : avant ce lot ils
 * s'affichaient bruts — « Aucun nouveau patch (already_generated) ».
 */
const genReasonsFr = {
  already_generated: 'déjà généré',
  race_condition:    'génération concurrente',
}

export type PatchGenReasonKey = keyof typeof genReasonsFr

const genReasonsEn: Record<PatchGenReasonKey, string> = {
  already_generated: 'already generated',
  race_condition:    'concurrent generation',
}

/**
 * Libellé + description des RÉGLAGES (`kind='setting'`) rendus par un interrupteur
 * dédié, indexés par `app_settings.key`.
 *
 * ⚠️ N'y remettez PAS les feature flags. Les trois clés Écailles vivaient ici ;
 * elles ont déménagé en base (`label_fr`/`label_en`, `desc_fr`/`desc_en`, migration
 * 20260905000001) avec les 36 autres flags du catalogue, pour qu'ajouter un flag
 * soit un INSERT sans déploiement. Les garder ici en double aurait produit
 * exactement la divergence silencieuse que ce déménagement supprime : deux sources
 * de libellé pour la même clé, dont une seule visible.
 *
 * Il ne reste donc que `patch_auto_publish`, qui n'est pas un flag mais un réglage
 * de comportement de la génération de patch notes, et garde son interrupteur dans
 * la carte Patch notes — hors des deux sections du catalogue.
 */
const settingsFr = {
  patch_auto_publish: {
    label:       'Publication automatique',
    description: 'Publie directement le patch généré sans passer par le statut brouillon.',
  },
}

export type AdminSettingKey = keyof typeof settingsFr

const settingsEn: Record<AdminSettingKey, { label: string; description: string }> = {
  patch_auto_publish: {
    label:       'Auto-publish',
    description: 'Publishes the generated patch straight away, skipping the draft status.',
  },
}

export const adminFr = {
  /* Bandeau d'en-tête du panneau. */
  banner: {
    title:    "Panneau d'administration",
    subtitle: 'Accès réservé aux comptes admin — gestion des utilisateurs et abonnements.',
  },

  /* Libellés des sous-onglets du panneau. Les CLÉS sont les `id` structurels de
     `lib/admin-subtabs.ts` (`utilisateurs` | `patch-notes` | `flags`), également
     acceptés dans `?subtab=` — elles ne se traduisent pas, seule la valeur le fait. */
  subtabs: {
    'utilisateurs': 'Utilisateurs',
    'patch-notes':  'Patch notes',
    'flags':        'Feature flags',
    /* Nommage du groupe de pastilles pour les lecteurs d'écran. */
    ariaLabel:      'Sections du panneau admin',
  },

  /* Ligne de KPI — les clés suivent l'objet `stats` d'AdminTab. */
  kpis: {
    total:             'Comptes total',
    certified:         'Certifiés',
    activeSubscribers: 'Abonnés actifs',
    expiring:          'Expire < 14j',
  },

  /* Répartition par tier. `hint` est rendu dans le même titre, en graisse normale. */
  breakdown: {
    title: 'Abonnés actifs par tier',
    hint:  '(hors comptes à vie)',
  },

  searchPlaceholder: '🔍 Rechercher par pseudo ou email...',

  /* En-têtes du tableau — les largeurs de colonnes sont fixées par le `colgroup`. */
  columns: {
    user:    'Utilisateur',
    tier:    'Tier',
    expiry:  'Expiration',
    role:    'Rôle',
    actions: 'Actions',
  },

  /* Indexé par `profiles.role`. */
  roles: rolesFr,

  /* Colonne Expiration — la DATE elle-même reste formatée en `fr-FR` (Lot 8). */
  expiry: {
    lifetime: 'À vie',
    expired:  '⚠ Expiré',
  },

  /* Colonne Actions. */
  actions: {
    saved:     '✓ Sauvegardé',
    edit:      'Modifier',
    certify:   '◦ Certifier',
    certified: 'Certifié',
    /* Texte alternatif du badge bleu, rendu partout où l'icône apparaît seule. */
    certifiedAlt: 'Certifié',
    /* `{name}` = pseudo du compte visé par la confirmation inline. */
    confirmCertify:   'Certifier {name} ?',
    confirmUncertify: 'Retirer à {name} ?',
    confirm:          'Confirmer',
    dismiss:          '✕',
  },

  /* Ligne d'édition dépliée sous un compte. */
  edit: {
    tierLabel:   'Tier',
    expiryLabel: 'Expiration',
    lifetime:    '♾ À vie',
    date:        '📅 Date',
    save:        'Sauvegarder',
    /* Affiché tant que l'admin n'a pas tranché — le bouton reste désactivé. */
    chooseExpiry: 'Choisis « À vie » ou « Date »',
    /* Repli quand l'UPDATE ne renvoie aucune ligne sans lever d'erreur (RLS). */
    noRows: 'Aucune ligne modifiée — droits insuffisants ?',
  },

  /* Raccourcis de date — la clé est interne, la durée en jours vit dans AdminTab. */
  quickDates: {
    m1: '1 mois',
    m3: '3 mois',
    m6: '6 mois',
    y1: '1 an',
  },

  /* ── Section Patch Notes ── */
  patches: {
    title:      'Patch Notes',
    generate:   '⚡ Générer le dernier patch',
    generating: '⏳ Génération en cours…',
    /* `{version}` = numéro du patch créé, renvoyé par l'Edge Function. */
    genCreated: '✓ Draft créé — Patch {version}',
    /* `{reason}` = libellé résolu depuis `reasons`, ou le code brut s'il est inconnu. */
    genSkipped: 'Aucun nouveau patch ({reason})',
    reasons:    genReasonsFr,
    /* `{message}` = message Supabase, non traduisible (publier / dépublier / sauver). */
    errorPrefix: 'Erreur : {message}',
    empty:       'Aucun patch note — clique sur « Générer » pour créer le premier.',
    /* Indexé par `patch_notes.status`. */
    statuses:  patchStatusesFr,
    edit:      '✏ Éditer',
    close:     'Fermer',
    publish:   '✓ Publier',
    unpublish: '↩ Dépublier',
    delete:    '🗑 Supprimer',
    confirm:   'Confirmer',
    /* Champs de l'éditeur. */
    fieldTitle:       'Titre',
    fieldImage:       'URL Bannière (optionnelle)',
    imagePlaceholder: 'https://...',
    fieldJson:        'Contenu JSON',
    saving:           'Sauvegarde…',
    save:             'Sauvegarder',
    saveAndPublish:   'Sauvegarder & Publier',
    preview:          'Prévisualiser en plein écran',
    closePreview:     'Fermer',
    /* Refus de sauvegarde — le détail du parse vient du moteur JS, non traduisible. */
    invalidJsonFix: 'JSON invalide — corrige les erreurs avant de sauvegarder.',
    invalidJson:    'JSON invalide.',
  },

  /* ── Section Économie Écailles ── */
  /* ⚠️ Il y avait ici `economy.title` (« Économie Écailles »), le titre de la
     section des trois interrupteurs Écailles écrits en dur. La section a été
     remplacée par les deux sections du catalogue, dont les titres sont dans
     `flags` — la clé n'avait plus de consommateur. */

  /* ── Panneau de feature flags (catalogue `app_settings`) ──
     ⚠️ Les LIBELLÉS des flags eux-mêmes ne sont PAS ici : ils vivent en base
     (`label_fr`/`label_en`, `desc_fr`/`desc_en`), pour qu'ajouter un flag soit un
     INSERT sans déploiement. Ce bloc ne porte que le CHÂSSIS du panneau, qui lui
     est bien du code. */
  flags: {
    launchTitle: '🚀 Lancements',
    launchHint:  'Features codées et déployées, pas encore ouvertes au public.',
    killTitle:   '🛑 Kill switches',
    killHint:    'Features livrées. Couper est une action d\'incident.',
    overlayTitle: 'Overlay in-game',
    overlayHint:  'Le maître coupe tout. Les blocs ci-dessous se pilotent un par un.',

    /* Sous-onglets de la section Kill switches. Les CLÉS sont les valeurs de
       `app_settings.surface` — elles ne se traduisent pas, seul le libellé. */
    surface: {
      web:    'Site',
      app:    'App',
      shared: 'Site + App',
    },
    surfaceAriaLabel: 'Surfaces des kill switches',
    surfaceEmpty:     'Aucun kill switch sur cette surface.',

    /* Lancement d'une feature — bouton de la carte, puis modale de confirmation.
       Pas de champ de motif ici : `reason` est le motif de COUPURE. */
    launchAction:       'Lancer',
    launchModalTitle:   'Lancer « {label} » ?',
    launchImpactLabel:  'Après lancement :',
    launchImpactText:   'la fonctionnalité devient visible pour tous les utilisateurs.',
    launchIrreversible: 'Ce flag deviendra un kill switch. Le couper ensuite demandera un motif, et il ne redeviendra jamais un lancement.',
    launchConfirm:      'Lancer',
    launchCancel:       'Annuler',

    /* États affichés en pastille sur chaque carte. */
    stateNotLaunched: 'pas encore lancé',
    stateLive:        'en ligne',
    stateActive:      'actif',
    stateCut:         '⚠ COUPÉ',

    /* Bandeau permanent. `{count}` = nombre de kill switches coupés. */
    bannerOne:   '⚠ 1 fonctionnalité actuellement coupée',
    bannerOther: '⚠ {count} fonctionnalités actuellement coupées',
    /* Invite du bandeau, qui est cliquable et saute sur le sous-onglet des flags. */
    bannerJump:  'Voir les kill switches →',

    /* Confirmation inline d'une coupure — même grammaire que `actions.confirmCertify`. */
    cutTitle:           'Couper « {label} » ?',
    cutReasonLabel:     'Motif (obligatoire)',
    cutReasonHint:      'Sera relu lors du retour à la normale — dis ce qui se passe, pas ce que tu fais.',
    cutReasonPlaceholder: 'ex. : 502 en boucle sur l\'Edge Function',
    cutConfirm:         'Couper',
    cutCancel:          'Annuler',

    /* Ligne d'état sur un flag coupé. `{who}` = pseudo, `{when}` = durée relative. */
    cutBy:        'coupé par {who} {when}',
    cutByUnknown: 'coupé {when}',
    cutReason:    'Motif : {reason}',

    /* Verrouillage d'un enfant d'overlay quand le maître est coupé. */
    lockedByMaster: 'Indisponible — l\'overlay est coupé',

    /* Ce que verra l'utilisateur, dérivé d'`off_behavior`. Affiché AVANT la bascule. */
    impactLabel: 'Ce que voit l\'utilisateur :',
    impact: {
      hidden:   'rien — la fonctionnalité disparaît de la navigation',
      notice:   'un encart « Temporairement indisponible »',
      degraded: 'un repli partiel — la fonctionnalité de base est conservée',
    },

    empty: 'Aucun flag dans le catalogue. La migration a-t-elle été appliquée ?',
  },

  /* Indexé par `app_settings.key`. */
  settings: settingsFr,
}

export type AdminDict = typeof adminFr

export const adminEn: AdminDict = {
  banner: {
    title:    'Admin panel',
    subtitle: 'Admin accounts only — user and subscription management.',
  },

  subtabs: {
    'utilisateurs': 'Users',
    'patch-notes':  'Patch notes',
    'flags':        'Feature flags',
    ariaLabel:      'Admin panel sections',
  },

  kpis: {
    total:             'Total accounts',
    certified:         'Certified',
    activeSubscribers: 'Active subscribers',
    expiring:          'Expires < 14d',
  },

  breakdown: {
    title: 'Active subscribers per tier',
    hint:  '(lifetime accounts excluded)',
  },

  searchPlaceholder: '🔍 Search by username or email...',

  columns: {
    user:    'User',
    tier:    'Tier',
    expiry:  'Expiration',
    role:    'Role',
    actions: 'Actions',
  },

  roles: rolesEn,

  expiry: {
    lifetime: 'Lifetime',
    expired:  '⚠ Expired',
  },

  actions: {
    saved:     '✓ Saved',
    edit:      'Edit',
    certify:   '◦ Certify',
    certified: 'Certified',
    certifiedAlt: 'Certified',
    confirmCertify:   'Certify {name}?',
    confirmUncertify: 'Revoke {name}?',
    confirm:          'Confirm',
    dismiss:          '✕',
  },

  edit: {
    tierLabel:   'Tier',
    expiryLabel: 'Expiration',
    lifetime:    '♾ Lifetime',
    date:        '📅 Date',
    save:        'Save',
    chooseExpiry: 'Pick “Lifetime” or “Date”',
    noRows: 'No row updated — insufficient rights?',
  },

  quickDates: {
    m1: '1 month',
    m3: '3 months',
    m6: '6 months',
    y1: '1 year',
  },

  patches: {
    title:      'Patch Notes',
    generate:   '⚡ Generate the latest patch',
    generating: '⏳ Generating…',
    genCreated: '✓ Draft created — Patch {version}',
    genSkipped: 'No new patch ({reason})',
    reasons:    genReasonsEn,
    errorPrefix: 'Error: {message}',
    empty:       'No patch note yet — click “Generate” to create the first one.',
    statuses:  patchStatusesEn,
    edit:      '✏ Edit',
    close:     'Close',
    publish:   '✓ Publish',
    unpublish: '↩ Unpublish',
    delete:    '🗑 Delete',
    confirm:   'Confirm',
    fieldTitle:       'Title',
    fieldImage:       'Banner URL (optional)',
    imagePlaceholder: 'https://...',
    fieldJson:        'JSON content',
    saving:           'Saving…',
    save:             'Save',
    saveAndPublish:   'Save & Publish',
    preview:          'Preview fullscreen',
    closePreview:     'Close',
    invalidJsonFix: 'Invalid JSON — fix the errors before saving.',
    invalidJson:    'Invalid JSON.',
  },

  flags: {
    launchTitle: '🚀 Launches',
    launchHint:  'Features coded and deployed, not opened to the public yet.',
    killTitle:   '🛑 Kill switches',
    killHint:    'Shipped features. Turning one off is an incident action.',
    overlayTitle: 'In-game overlay',
    overlayHint:  'The master kills everything. The blocks below are controlled one by one.',

    surface: {
      web:    'Website',
      app:    'Desktop app',
      shared: 'Both',
    },
    surfaceAriaLabel: 'Kill switch surfaces',
    surfaceEmpty:     'No kill switch on this surface.',

    launchAction:       'Launch',
    launchModalTitle:   'Launch "{label}"?',
    launchImpactLabel:  'After launch:',
    launchImpactText:   'the feature becomes visible to every user.',
    launchIrreversible: 'This flag will become a kill switch. Turning it off later will require a reason, and it will never go back to being a launch.',
    launchConfirm:      'Launch',
    launchCancel:       'Cancel',

    stateNotLaunched: 'not launched yet',
    stateLive:        'live',
    stateActive:      'active',
    stateCut:         '⚠ OFF',

    bannerOne:   '⚠ 1 feature currently turned off',
    bannerOther: '⚠ {count} features currently turned off',
    bannerJump:  'View kill switches →',

    cutTitle:           'Turn off "{label}"?',
    cutReasonLabel:     'Reason (required)',
    cutReasonHint:      'Will be read again when service is restored — say what is happening, not what you are doing.',
    cutReasonPlaceholder: 'e.g. repeated 502s on the Edge Function',
    cutConfirm:         'Turn off',
    cutCancel:          'Cancel',

    cutBy:        'turned off by {who} {when}',
    cutByUnknown: 'turned off {when}',
    cutReason:    'Reason: {reason}',

    lockedByMaster: 'Unavailable — the overlay is off',

    impactLabel: 'What users see:',
    impact: {
      hidden:   'nothing — the feature disappears from navigation',
      notice:   'a "Temporarily unavailable" panel',
      degraded: 'a partial fallback — core functionality is kept',
    },

    empty: 'No flags in the catalogue. Has the migration been applied?',
  },

  settings: settingsEn,
}

/**
 * Libellé d'affichage d'un `profiles.role`, tolérant à l'entrée.
 *
 * Même contrat que `subscriptionTierLabel` (nav.ts) : un rôle ajouté en base et pas
 * encore déclaré ici est renvoyé TEL QUEL plutôt que remplacé par un vide. L'absence
 * de valeur retombe sur `user`, qui est le DEFAULT de la colonne.
 */
export function profileRoleLabel(dict: AdminDict, role?: string | null): string {
  return dict.roles[(role ?? '') as ProfileRoleKey] ?? role ?? dict.roles.user
}

/**
 * Libellé d'affichage d'un `patch_notes.status`. Repli sur `draft`, qui est le DEFAULT
 * de la colonne, et sur la valeur brute si le statut est inconnu.
 */
export function patchStatusLabel(dict: AdminDict, status?: string | null): string {
  return dict.patches.statuses[(status ?? '') as PatchStatusKey]
    ?? status
    ?? dict.patches.statuses.draft
}

/**
 * Libellé d'affichage du `reason` renvoyé par `patch-notes-generator`.
 *
 * Un motif ABSENT retombe sur `already_generated` — c'est le comportement d'avant ce
 * lot, où le repli en dur était « déjà généré ». Un motif INCONNU (nouveau code côté
 * Edge Function) reste affiché brut : mieux vaut montrer `foo_bar` que rien.
 */
export function patchGenReasonLabel(dict: AdminDict, reason?: string | null): string {
  return dict.patches.reasons[(reason ?? '') as PatchGenReasonKey]
    ?? reason
    ?? dict.patches.reasons.already_generated
}
