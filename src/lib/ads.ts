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
 *                           consentement explicite. Alimenté par la Google CMP
 *                           depuis le 2026-09-12 — voir la section dédiée.
 *
 * Volontairement agnostique de la régie (AdSense / The Moneytizer / autre) :
 * aucun identifiant, aucune URL de script, aucun nom de fournisseur ici.
 */

// Palier gratuit — le SEUL qui voit des publicités.
//
// ⚠️ On teste l'appartenance au palier GRATUIT, jamais l'absence des paliers
// payants. La différence est structurelle, pas cosmétique : la liste des
// paliers payants a déjà bougé DANS LES DEUX SENS (`architecte`/`architecte+`
// ajoutés puis retirés de l'offre, migration 20260901000004) et bougera encore.
// Avec une liste noire, tout
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
 * Le palier doit-il voir des emplacements sur une page PUBLIQUE ?
 *
 * `shouldShowAds` répond « non » à un palier inconnu, et c'est le bon défaut
 * DANS LE DASHBOARD : un profil non encore chargé y appartient forcément à
 * quelqu'un, et lui réserver une colonne pour la retirer ensuite dégraderait un
 * abonné. Sur une page publique (/champions, /patch-notes), l'hypothèse tombe :
 * la majorité des visiteurs n'ont PAS de compte, leur `tier` est absent non
 * parce qu'il n'est pas chargé mais parce qu'il n'existe pas. Les traiter comme
 * « palier inconnu » reviendrait à ne jamais afficher le moindre emplacement là
 * où le site en a précisément besoin.
 *
 * D'où la règle, en trois temps :
 *   1. session non résolue  → RIEN. On ne sait pas encore, et réserver 250 px
 *      pour les retirer une seconde plus tard est le pire des deux mondes ;
 *   2. visiteur anonyme     → OUI. Il est, par définition, sur l'offre gratuite ;
 *   3. visiteur connecté    → on retombe sur le verrou commercial habituel.
 *
 * ⚠️ Le verrou LÉGAL n'est pas ici : `AdSlot` garde `hasAdConsent()` en interne.
 * Cette fonction ne décide que du DROIT COMMERCIAL à un emplacement — un
 * emplacement autorisé ici reste vide tant que le consentement n'est pas acquis.
 */
export function shouldShowPublicAds(viewer: {
  /** `true` tant que `SessionProvider` n'a pas résolu l'utilisateur. */
  loading: boolean
  /** Un compte est-il connecté sur cette page ? */
  signedIn: boolean
  tier: string | null | undefined
  isAdmin?: boolean
}): boolean {
  if (viewer.loading) return false
  if (!viewer.signedIn) return true
  return shouldShowAds(viewer.tier, viewer.isAdmin ?? false)
}

/* ════════════════════════════════════════════════════════════════════════════
   VERROU LÉGAL — le consentement publicitaire (RGPD / art. 82 LIL)
   ════════════════════════════════════════════════════════════════════════════
   Jusqu'au 2026-09-12, `hasAdConsent()` renvoyait `false` EN DUR faute de CMP.
   Elle lit désormais un état alimenté par la **Google CMP** (TCF v2.2), branchée
   par `components/ads/ConsentManager.tsx`. Le contrat n'a pas changé : c'est
   toujours le SEUL point d'entrée du consentement, et tout ce qui charge un
   script tiers passe par lui.

   ⚠️ Trois états, pas deux. `unknown` n'est pas `denied` :
     • `unknown` — le visiteur n'a pas encore répondu (ou la CMP n'a pas fini de
       se charger). On ne charge rien, et on ne conclut rien non plus : c'est
       l'état de DÉPART, y compris au rendu serveur ;
     • `granted` — choix explicite en faveur du dépôt ;
     • `denied`  — refus explicite, ou consentement insuffisant.
   Distinguer les deux permet à l'interface de ne pas traiter « pas encore
   répondu » comme « a refusé » — et aux tests de vérifier que le défaut est bien
   fermé sans être un refus enregistré.

   ⚠️ Cet état N'EST PAS persisté ici. La persistance appartient à la CMP, qui
   stocke la chaîne TCF et la ressert au chargement suivant. Écrire notre propre
   copie créerait deux sources de vérité qui divergeraient au premier changement
   d'avis. */

export type AdConsentState = 'unknown' | 'granted' | 'denied'

let consentState: AdConsentState = 'unknown'
const consentListeners = new Set<() => void>()

/** État courant du consentement publicitaire. */
export function adConsentState(): AdConsentState {
  return consentState
}

/**
 * Le consentement publicitaire est-il acquis pour ce visiteur ?
 *
 * Point d'entrée HISTORIQUE et unique : `AdSlot` (emplacements) et
 * `AdSenseScript` (script de régie) ne consultent que lui. Tant qu'il renvoie
 * `false`, il ne part STRICTEMENT AUCUNE requête vers une régie — donc aucun
 * cookie publicitaire, aucun traceur.
 *
 * ⚠️ Fonction SYNCHRONE volontairement : appelée pendant un rendu React, elle
 * doit renvoyer l'état connu à l'instant T. Pour RÉAGIR à un changement (le
 * visiteur accepte, sans recharger la page), il faut s'abonner —
 * `onAdConsentChange`, ou le hook `useAdConsent()` qui l'enveloppe.
 */
export function hasAdConsent(): boolean {
  return consentState === 'granted'
}

/**
 * Pose l'état du consentement et prévient les abonnés.
 *
 * ⚠️ Appelée UNIQUEMENT par `ConsentManager`, à partir de ce que dit la CMP.
 * Aucun composant d'interface ne doit l'appeler pour « forcer » un état : ce
 * serait accorder un consentement que personne n'a donné.
 */
export function setAdConsent(next: AdConsentState): void {
  if (next === consentState) return
  consentState = next
  for (const listener of consentListeners) listener()
}

/**
 * S'abonne aux changements de consentement. Renvoie la fonction de
 * désabonnement — signature attendue par `useSyncExternalStore`.
 */
export function onAdConsentChange(listener: () => void): () => void {
  consentListeners.add(listener)
  return () => { consentListeners.delete(listener) }
}

/* ── Lecture du signal TCF v2.2 ────────────────────────────────────────────
   La CMP expose `window.__tcfapi`. On n'en garde ici que la DÉCISION, sous
   forme de fonction pure : c'est la seule partie qui mérite d'être testée, et
   c'est aussi celle qui se trompe en silence. */

/** Sous-ensemble de `TCData` (TCF v2.2) dont dépend la décision. */
export interface TcfSignal {
  /** Le RGPD s'applique-t-il à ce visiteur, d'après la CMP ? */
  gdprApplies?: boolean
  /** `useractioncomplete`, `tcloaded`, `cmpuishown`… */
  eventStatus?: string
  purpose?: { consents?: Record<string | number, boolean | undefined> }
  vendor?: { consents?: Record<string | number, boolean | undefined> }
}

/**
 * Finalité TCF n° 1 — « stocker et/ou accéder à des informations sur un
 * terminal ». C'est ELLE qui autorise le dépôt d'un cookie publicitaire, et
 * donc la seule qui conditionne le chargement du script de régie. Les finalités
 * de PERSONNALISATION (3, 4) ne sont pas exigées ici : sans elles Google sert
 * des publicités non personnalisées, ce qui reste un affichage valable.
 */
export const TCF_PURPOSE_STORAGE = 1

/** Identifiant TCF de Google Advertising Products dans la GVL. */
export const TCF_VENDOR_GOOGLE = 755

/**
 * Décision de consentement à partir du signal de la CMP.
 *
 * ⚠️ `gdprApplies === false` vaut `granted`, et ce n'est pas un raccourci : hors
 * du champ du RGPD, la CMP n'affiche AUCUNE bannière — il n'y a donc jamais de
 * réponse à attendre. Sans cette règle, ces visiteurs resteraient bloqués en
 * `unknown` et ne verraient jamais de publicité, sans que rien ne le signale.
 *
 * ⚠️ Tant que la personne n'a pas répondu (`cmpuishown`, aucune finalité
 * remontée), on renvoie `unknown` et NON `denied` : la bannière est à l'écran,
 * l'état n'est pas encore un refus. Rien n'est chargé dans les deux cas.
 */
export function consentFromTcf(signal: TcfSignal | null | undefined): AdConsentState {
  if (!signal) return 'unknown'
  if (signal.gdprApplies === false) return 'granted'

  const storage = signal.purpose?.consents?.[TCF_PURPOSE_STORAGE] === true
  const google = signal.vendor?.consents?.[TCF_VENDOR_GOOGLE] === true
  if (storage && google) return 'granted'

  // Un choix a été fait (ou la chaîne existante a été relue) sans accorder le
  // nécessaire : c'est un refus, pas une attente.
  const answered = signal.eventStatus === 'useractioncomplete' || signal.eventStatus === 'tcloaded'
  return answered ? 'denied' : 'unknown'
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
