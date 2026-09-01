/**
 * Règles des emplacements publicitaires — module PUR, sans dépendance React.
 *
 * Tout ce qui décide « est-ce qu'une pub a le droit d'exister ici ? » vit dans
 * ce fichier et nulle part ailleurs. Deux verrous indépendants, qui doivent
 * TOUS LES DEUX être ouverts pour qu'un script de régie soit chargé :
 *
 *   1. `shouldShowAds()`  — verrou COMMERCIAL : seul le palier gratuit voit des
 *                           pubs. L'absence de publicité fait partie de la
 *                           valeur de l'abonnement.
 *   2. `hasAdConsent()`   — verrou LÉGAL (RGPD) : rien ne se charge sans
 *                           consentement explicite. Aujourd'hui câblé sur
 *                           `false` — voir le commentaire de la fonction.
 *
 * Volontairement agnostique de la régie (AdSense / The Moneytizer / autre) :
 * aucun identifiant, aucune URL de script, aucun nom de fournisseur ici.
 */

// Palier gratuit — le SEUL qui voit des publicités.
//
// ⚠️ On teste l'appartenance au palier GRATUIT, jamais l'absence des paliers
// payants. La différence est structurelle, pas cosmétique : la liste des
// paliers payants a déjà bougé (`architecte` / `architecte+` en base, parfois
// appelés « Monarque » à l'oral) et bougera encore. Avec une liste noire, tout
// palier ajouté demain afficherait des pubs à des abonnés par défaut, en
// silence. Avec cette liste blanche d'un seul élément, un palier inconnu ne
// voit RIEN — le défaut penche du côté qui ne dégrade pas un client payant.
//
// La constante elle-même vit dans `lib/subscription.ts` : le palier qui voit
// des pubs et le palier privé des fonctionnalités payantes sont le même, et
// doivent le rester. Valeur alignée sur `profiles.tier` (base partagée WPF).
import { FREE_TIER } from './subscription'

/**
 * Le palier `tier` doit-il voir des emplacements publicitaires ?
 *
 * @param tier    valeur brute de `profiles.tier` (peut être `null` si le profil
 *                n'a pas encore été chargé, ou capitalisée : `page.tsx` utilise
 *                un repli `'Apprenti'` avec une majuscule pour l'affichage).
 * @param isAdmin les admins sont traités comme le palier le plus haut partout
 *                ailleurs dans l'app (`effectiveTier` dans `page.tsx`) — ils ne
 *                voient donc jamais de pub non plus.
 */
export function shouldShowAds(tier: string | null | undefined, isAdmin = false): boolean {
  if (isAdmin) return false
  // Palier inconnu (profil non chargé, valeur vide) => pas de pub. On préfère
  // rater une impression que d'en afficher une à quelqu'un qui paie pour ne
  // pas en avoir.
  if (!tier) return false
  return tier.trim().toLowerCase() === FREE_TIER
}

/**
 * Le consentement publicitaire est-il acquis pour ce visiteur ?
 *
 * ⛔️ RENVOIE `false` EN DUR — c'est délibéré, pas un oubli.
 *
 * Aucune CMP (bandeau de consentement RGPD) n'existe encore sur le site : la
 * mettre en place est un chantier séparé, préalable à toute activation réelle.
 * Tant que cette fonction renvoie `false`, `AdSlot` réserve son espace dans la
 * mise en page mais ne charge STRICTEMENT AUCUN script tiers — donc aucun
 * cookie publicitaire, aucun traceur, aucune requête vers une régie.
 *
 * ⚠️ Ne pas confondre avec `components/dashboard/ConsentBanner.tsx`, qui n'a
 * rien à voir avec le RGPD : il annonce une demande de suivi « prac ».
 *
 * Le jour où la CMP arrive, c'est le SEUL endroit à modifier — brancher ici la
 * lecture de l'état de consentement, et tous les emplacements suivent.
 */
export function hasAdConsent(): boolean {
  return false
}

/**
 * Formats d'emplacement, en pixels. Ce sont des formats IAB standards : toutes
 * les régies savent les servir, ce qui garde le choix du fournisseur ouvert.
 *
 * Les largeurs sont DUPLIQUÉES dans `globals.css` (`--ad-slot-w`) parce que la
 * réservation d'espace doit être faite par le CSS, avant tout rendu React —
 * c'est ce qui évite le décalage de contenu (CLS). Les deux valeurs doivent
 * rester alignées ; `ads.test.ts` échoue si ce n'est plus le cas.
 *
 * ⚠️ Les DEUX formats du rail collant (160 et 300) font 600 px de haut, et
 * doivent continuer à le faire : c'est ce qui garantit que la bascule à 1440 px
 * ne change jamais la hauteur réservée. `rectangle-300` est en dehors de cet
 * invariant — il vit sous le collant, dans le flux normal.
 */
export const AD_FORMATS = {
  /** Wide skyscraper — colonne étroite, entre 1280 px et 1439 px de viewport. */
  'skyscraper-160': { width: 160, height: 600 },
  /** Half page — colonne confortable, à partir de 1440 px de viewport. */
  'halfpage-300':   { width: 300, height: 600 },
  /**
   * Medium rectangle — SECOND emplacement du rail, sous le half page. Il
   * n'existe qu'à partir de 1440 px de viewport : en dessous, la piste ne fait
   * que 160 px de large (cf. `--ad-slot-w`) et ne peut pas accueillir une créa
   * de 300. La bascule est faite en CSS (`.dash-adrail-tail`), pas en JS.
   *
   * ⚠️ Ce format N'EST PAS collant, contrairement au half page. Le calcul qui
   * mène à cette décision est en tête de `DashboardAdRail.tsx` : la pile
   * complète (97 + 600 + 24 + 250 = 971 px) dépasse le viewport de toutes les
   * résolutions courantes sauf le 1440p.
   */
  'rectangle-300':  { width: 300, height: 250 },
} as const

export type AdFormat = keyof typeof AD_FORMATS

/**
 * Seuils de la colonne publicitaire, en pixels de viewport.
 *
 * Ils ne sont pas choisis à l'esthétique : ils viennent des largeurs réelles du
 * dashboard. Le calcul complet est en commentaire au-dessus de `.dash-adrail`
 * dans `globals.css`, qui est la source qui fait foi (le CSS est ce qui
 * s'applique réellement). Repris ici pour que le code TS puisse s'y référer et
 * pour que le test vérifie que les deux ne divergent pas.
 */
export const AD_BREAKPOINTS = {
  /** En dessous : aucune colonne publicitaire, le dashboard reprend sa largeur. */
  hideBelow: 1280,
  /** À partir de cette largeur, l'emplacement passe de 160 px à 300 px. */
  widenAt: 1440,
} as const
