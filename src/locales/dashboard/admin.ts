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
 * Libellé + description de chaque feature flag, indexés par `app_settings.key`.
 * La clé est écrite en base par `toggleSetting` : elle ne se traduit pas. Le jeu de
 * clés est celui de `ADMIN_SETTING_KEYS` (AdminTab), qui pilote aussi le `.in()` de
 * chargement — une clé gérée sans entrée ici afficherait une ligne sans libellé.
 */
const settingsFr = {
  patch_auto_publish: {
    label:       'Publication automatique',
    description: 'Publie directement le patch généré sans passer par le statut brouillon.',
  },
  ecailles_enabled: {
    label:       'Activer les Écailles',
    description: 'Active la monnaie virtuelle — gain, affichage du solde et transactions.',
  },
  shop_enabled: {
    label:       'Boutique',
    description: 'Rend la boutique accessible aux utilisateurs pour dépenser leurs Écailles.',
  },
  quests_enabled: {
    label:       'Quêtes journalières',
    description: 'Active les quêtes quotidiennes qui récompensent des Écailles.',
  },
}

export type AdminSettingKey = keyof typeof settingsFr

const settingsEn: Record<AdminSettingKey, { label: string; description: string }> = {
  patch_auto_publish: {
    label:       'Auto-publish',
    description: 'Publishes the generated patch straight away, skipping the draft status.',
  },
  ecailles_enabled: {
    label:       'Enable Scales',
    description: 'Turns on the virtual currency — earning, balance display and transactions.',
  },
  shop_enabled: {
    label:       'Shop',
    description: 'Opens the shop so users can spend their Scales.',
  },
  quests_enabled: {
    label:       'Daily quests',
    description: 'Turns on the daily quests that reward Scales.',
  },
}

export const adminFr = {
  /* Bandeau d'en-tête du panneau. */
  banner: {
    title:    "Panneau d'administration",
    subtitle: 'Accès réservé aux comptes admin — gestion des utilisateurs et abonnements.',
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
  economy: {
    title: 'Économie Écailles',
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

  economy: {
    title: 'Scales economy',
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
