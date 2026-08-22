/**
 * Barre de navigation en mode connecté (`Nav.tsx`, branches `mode === 'user'`) et
 * LIBELLÉS DES ONGLETS du dashboard.
 *
 * ⚠️ Les libellés d'onglets vivent ici et pas dans `Dashboard.tsx` parce que
 * `tabGroups` / `dashTabs` sont consommés par DEUX barres (sidebar desktop dans
 * `Dashboard.tsx`, drawer mobile dans `Nav.tsx`) : un seul jeu de libellés pour les
 * deux. Ils sont retrouvés par `id` d'onglet — l'`id` reste une valeur technique
 * (union `DashTab`, état + deep-link `?tab=`) et n'est JAMAIS traduit.
 */

/**
 * Les onglets qui apparaissent dans une barre de navigation.
 *
 * Ce n'est PAS `DashTab` : `overlay` et `tarifs` sont des valeurs de `DashTab` sans
 * entrée de navigation (`tarifs` est un onglet caché atteint par `?tab=tarifs`), et
 * `champions` est à l'inverse une entrée de navigation qui n'est pas un `DashTab`
 * (elle navigue vers `/champions` via `href`). Les deux listes se recouvrent donc
 * largement sans être identiques — c'est celle-ci qui décide des libellés à fournir.
 *
 * Typer `tabs` en `Record<NavTabId, …>` fait de l'oubli d'un libellé une ERREUR DE
 * COMPILATION, des deux côtés : ajouter un onglet à la structure sans l'ajouter ici
 * ne compile pas, et un libellé manquant en EN non plus.
 */
export const NAV_TAB_IDS = [
  'admin',
  'accueil', 'todo', 'stats', 'patchnotes', 'ecailles', 'champions',
  'jungle', 'builds', 'scenarios',
  'workshop-builds', 'workshop-jungle',
  'matchup', 'postgame',
  'tournois',
] as const

export type NavTabId = (typeof NAV_TAB_IDS)[number]

interface TabLabel {
  label: string
  /**
   * Libellé court. ⚠️ AUCUN composant ne le rend aujourd'hui — il était déjà porté
   * (inutilisé) par `TabDef` avant ce chantier et il est conservé tel quel, sans
   * élargir ni réduire l'existant. À supprimer des deux dicos le jour où il est
   * acté qu'aucune barre compacte n'en aura besoin.
   */
  short: string
}

const tabsFr: Record<NavTabId, TabLabel> = {
  admin:              { label: 'Administration',   short: 'Admin' },
  accueil:            { label: 'Accueil',          short: 'Accueil' },
  todo:               { label: 'To-Do Lists',      short: 'To-Do' },
  stats:              { label: 'Stats',            short: 'Stats' },
  patchnotes:         { label: 'Patch Notes',      short: 'Patchs' },
  ecailles:           { label: 'La Forge',         short: 'La Forge' },
  champions:          { label: 'Champions',        short: 'Champions' },
  jungle:             { label: 'Jungle Path',      short: 'Jungle' },
  builds:             { label: 'Builder',          short: 'Builder' },
  scenarios:          { label: 'Scénarios',        short: 'Scénarios' },
  'workshop-builds':  { label: 'Workshop Builds',  short: 'W. Builds' },
  'workshop-jungle':  { label: 'Workshop Jungle',  short: 'W. Jungle' },
  matchup:            { label: 'Match Up',         short: 'Match Up' },
  postgame:           { label: 'Post Game',        short: 'Post Game' },
  tournois:           { label: 'Tournois',         short: 'Tournois' },
}

const tabsEn: Record<NavTabId, TabLabel> = {
  admin:              { label: 'Administration',   short: 'Admin' },
  accueil:            { label: 'Home',             short: 'Home' },
  todo:               { label: 'To-Do Lists',      short: 'To-Do' },
  stats:              { label: 'Stats',            short: 'Stats' },
  patchnotes:         { label: 'Patch Notes',      short: 'Patches' },
  ecailles:           { label: 'The Forge',        short: 'The Forge' },
  champions:          { label: 'Champions',        short: 'Champions' },
  jungle:             { label: 'Jungle Path',      short: 'Jungle' },
  builds:             { label: 'Builder',          short: 'Builder' },
  scenarios:          { label: 'Scenarios',        short: 'Scenarios' },
  'workshop-builds':  { label: 'Workshop Builds',  short: 'W. Builds' },
  'workshop-jungle':  { label: 'Workshop Jungle',  short: 'W. Jungle' },
  matchup:            { label: 'Match Up',         short: 'Match Up' },
  postgame:           { label: 'Post Game',        short: 'Post Game' },
  tournois:           { label: 'Tournaments',      short: 'Tournaments' },
}

/* Intitulés des groupes de la sidebar / du drawer. Les `id` sont structurels. */
const groupsFr = {
  navigation: 'Navigation',
  perso:      'Personnalisation',
  workshop:   'Workshop',
  ia:         'Analyse IA',
  soon:       'Bientôt',
}

export type NavGroupId = keyof typeof groupsFr

const groupsEn: Record<NavGroupId, string> = {
  navigation: 'Navigation',
  perso:      'Customisation',
  workshop:   'Workshop',
  ia:         'AI Analysis',
  soon:       'Coming soon',
}

/**
 * Libellés d'AFFICHAGE des tiers d'abonnement, indexés par la valeur de
 * `profiles.tier` en base (minuscules, partagées avec l'app WPF).
 *
 * ⚠️ Deux pièges à ne pas confondre :
 *  - ce sont les tiers WYRM FORGE, pas les rangs LoL (Fer → Challenger), dont les
 *    libellés vivent dans `src/lib/lol-tiers.ts` ;
 *  - la clé EST la valeur métier. Traduire la valeur affichée ne doit JAMAIS toucher
 *    aux comparaisons qui s'appuient dessus (`TIER_ORDER`, `'apprenti'`, `'maître'`).
 */
const tiersFr = {
  apprenti:     'Apprenti',
  forgeron:     'Forgeron',
  'maître':     'Maître',
  'légion':     'Légion',
  architecte:   'Architecte',
  'architecte+':'Architecte+',
}

export type TierKey = keyof typeof tiersFr

const tiersEn: Record<TierKey, string> = {
  apprenti:     'Apprentice',
  forgeron:     'Blacksmith',
  'maître':     'Master',
  'légion':     'Legion',
  architecte:   'Architect',
  'architecte+':'Architect+',
}

export const navFr = {
  tabs:   tabsFr,
  groups: groupsFr,
  /* Badges de fin de ligne, alimentés par les drapeaux `locked` / `soon` de la structure. */
  badges: {
    pro:  'Pro',
    soon: 'Bientôt',
  },
  /* Chrome du mode connecté : dropdown profil (desktop) et encart du drawer (mobile). */
  user: {
    profile:     'Profil',
    logout:      'Déconnexion',
    certified:   'Compte certifié',
    scalesAlt:   'Écailles',
    scalesTitle: 'Gagner des Écailles — La Forge',
  },
  tiers: tiersFr,
}

export type NavDict = typeof navFr

export const navEn: NavDict = {
  tabs:   tabsEn,
  groups: groupsEn,
  badges: {
    pro:  'Pro',
    soon: 'Soon',
  },
  user: {
    profile:     'Profile',
    logout:      'Log out',
    certified:   'Certified account',
    scalesAlt:   'Scales',
    scalesTitle: 'Earn Scales — The Forge',
  },
  tiers: tiersEn,
}

/**
 * Libellé d'affichage d'un tier d'abonnement, tolérant à l'entrée.
 *
 * `tier` arrive de `profiles.tier` (minuscules) mais peut aussi valoir la valeur de
 * repli `'Apprenti'` posée par `page.tsx`, d'où la normalisation. Une valeur inconnue
 * (nouveau tier en base pas encore déclaré ici) est renvoyée TELLE QUELLE plutôt que
 * remplacée par un vide : mieux vaut un libellé non traduit qu'une ligne vide.
 */
export function subscriptionTierLabel(dict: NavDict, tier?: string | null): string {
  const key = (tier ?? '').toLowerCase()
  return dict.tiers[key as TierKey] ?? tier ?? dict.tiers.apprenti
}
