/**
 * Kit sur mesure — contrat du `player_snapshot` et validation du formulaire.
 *
 * Module PUR (aucun import React, aucun DOM), comme `lib/kit-orders.ts` dont il
 * est le pendant : celui-là porte la machine d'états, celui-ci le GEL de l'état
 * du joueur au moment de la prise du pack.
 *
 * ⚠️ CE QUI EST ÉCRIT ICI EST FIGÉ POUR TOUJOURS.
 * `player_snapshot` est écrit UNE FOIS par `kit_request_order`, et il n'existe
 * aucun chemin par lequel le client puisse le réécrire (pas de policy UPDATE,
 * et un second dépôt est refusé par `uq_kit_orders_active`). Ce n'est donc pas
 * une convention que ce module doit respecter — c'est l'absence de porte.
 *
 * ⚠️ NE JAMAIS relire ces valeurs depuis `profiles` après coup.
 * `profiles.riot_rank` est choisi par l'utilisateur et change quand il veut :
 * une jointure renverrait le rang d'AUJOURD'HUI, ce qui vide de son sens la
 * mesure de progression que ce service vend. Le snapshot est une COPIE, prise à
 * l'instant du dépôt, et c'est tout son intérêt.
 */

/* ════════════════════════════════════════════════════════════════════════════
 *  FORMULES
 * ════════════════════════════════════════════════════════════════════════════ */

/**
 * Les deux formules vendues. Les montants sont en CENTIMES — même unité que
 * `kit_orders.price_total_cents`, jamais de flottant sur de l'argent.
 *
 * ⚠️ Ces prix sont AFFICHÉS, pas facturés : aucun paiement n'est branché avant
 * le lot 4, et c'est l'admin qui pose le montant réellement encaissé via
 * `kit_set_details`. Les deux peuvent donc diverger légitimement (remise,
 * arrangement) — ne pas « aligner » l'un sur l'autre par réflexe.
 *
 * `duo` n'a PAS de modèle en base : `kit_orders` porte un seul `user_id` et
 * `uq_kit_orders_active` est par utilisateur. Le binôme vit dans le snapshot
 * (voir `KitPartner`), il n'a ni dossier ni visibilité, et rien ne l'empêche
 * d'en ouvrir un de son côté. Choix assumé du lot 2 — le modéliser demanderait
 * une colonne `partner_user_id` et une révision de l'index d'unicité.
 */
export const KIT_FORMULAS = ['solo', 'duo'] as const
export type KitFormula = typeof KIT_FORMULAS[number]

export const KIT_PRICE_CENTS: Record<KitFormula, number> = {
  solo: 6000,
  duo:  11000,
}

export function isKitFormula(value: unknown): value is KitFormula {
  return typeof value === 'string' && (KIT_FORMULAS as readonly string[]).includes(value)
}

/* ════════════════════════════════════════════════════════════════════════════
 *  CONTRAT DU SNAPSHOT
 * ════════════════════════════════════════════════════════════════════════════ */

/**
 * Le binôme d'une formule duo — DÉCLARATIF, jamais un compte.
 *
 * Volontairement sans `user_id` : exiger que le binôme ait un compte Wyrm Forge
 * ferait échouer la moitié des ventes duo au moment précis où le client est prêt
 * à payer. On prend son Riot ID tel qu'il le donne ; l'admin le résoudra au call
 * de découverte.
 */
export interface KitPartner {
  riot_gamename: string
  riot_tagline: string
  role: string
}

/**
 * Ce qui part réellement en base, sérialisé dans `kit_orders.player_snapshot`.
 *
 * ⚠️ NOMS DE CHAMPS FIGÉS. Même règle que le contrat JSONB de `scenarios`
 * (AGENTS.md) : une clé renommée rend illisibles tous les snapshots déjà pris,
 * et ils ne sont pas re-générables — le joueur a changé de rang depuis. Ajouter
 * une clé est sûr ; en renommer ou en supprimer une ne l'est pas.
 *
 * Les champs `riot_*` sont recopiés de `profiles` À L'INSTANT DU DÉPÔT. Ils
 * peuvent être `null` : un compte sans Riot ID lié reste un client valide, et
 * refuser sa commande pour ça serait absurde.
 */
export interface KitPlayerSnapshot {
  /** Version du contrat. Permet de lire un vieux snapshot sans deviner sa forme. */
  v: 1
  formula: KitFormula
  /** ISO 8601. L'instant du GEL — pas la date d'ouverture du dossier en base. */
  captured_at: string

  riot_rank: string | null
  riot_puuid: string | null
  riot_gamename: string | null
  riot_tagline: string | null
  riot_platform: string | null

  role: string
  goals: string
  availability: string
  champions_liked: string
  champions_disliked: string
  playstyle: string

  /** Présent uniquement en formule `duo`. */
  partner?: KitPartner
}

/* ════════════════════════════════════════════════════════════════════════════
 *  SAISIE ET VALIDATION
 * ════════════════════════════════════════════════════════════════════════════ */

/** L'état du formulaire, tel que le composant le tient. */
export interface KitFormInput {
  formula: KitFormula
  riot_rank: string
  role: string
  goals: string
  availability: string
  champions_liked: string
  champions_disliked: string
  playstyle: string
  partner_gamename: string
  partner_tagline: string
  partner_role: string
}

export const EMPTY_KIT_FORM: KitFormInput = {
  formula: 'solo',
  riot_rank: '',
  role: '',
  goals: '',
  availability: '',
  champions_liked: '',
  champions_disliked: '',
  playstyle: '',
  partner_gamename: '',
  partner_tagline: '',
  partner_role: '',
}

/**
 * Longueur maximale d'un champ de texte libre, en CARACTÈRES.
 *
 * Ce n'est pas la vraie contrainte — la base borne le snapshot ENTIER à 4096
 * OCTETS (`kit_assert_snapshot`). Cette limite-ci est là pour que l'utilisateur
 * soit arrêté sur LE champ qu'il est en train de remplir, plutôt que par un
 * `snapshot_too_large` à la soumission qui ne lui dirait pas lequel raccourcir.
 * 500 × 5 champs laisse de la marge sous les 4 Ko, accents compris.
 */
export const KIT_FIELD_MAX = 500

/**
 * Borne d'octets appliquée par la base — RECOPIÉE ici, volontairement.
 *
 * Le front la vérifie AUSSI pour rendre un message clair au lieu de laisser
 * remonter une exception plpgsql. La base reste la seule autorité : un client
 * qui appelle PostgREST directement se fait arrêter par elle, pas par ceci.
 * Les deux valeurs doivent rester égales — c'est ce que verrouille le test.
 */
export const SNAPSHOT_MAX_BYTES = 4096

/** Taille réelle du snapshot sérialisé, en octets UTF-8 (comme `octet_length` en SQL). */
export function snapshotByteSize(snapshot: unknown): number {
  return new TextEncoder().encode(JSON.stringify(snapshot)).length
}

/**
 * Les champs en faute, par nom. Objet vide = formulaire soumettable.
 *
 * Renvoie une CLÉ de dico par champ (`'required'`, `'tooLong'`), jamais un
 * message : la traduction vit dans `locales/dashboard/kit.ts`, comme partout
 * ailleurs dans ce dépôt.
 *
 * Validation volontairement minimale — le brief le dit, et c'est juste : ce
 * formulaire prépare une CONVERSATION, il ne conclut pas une vente. Exiger un
 * format sur « tes objectifs » ferait perdre des clients pour rien.
 */
export type KitFieldError = 'required' | 'tooLong'
export type KitFormErrors = Partial<Record<keyof KitFormInput | 'size', KitFieldError>>

/** Les seuls champs réellement obligatoires. */
const REQUIRED: (keyof KitFormInput)[] = ['riot_rank', 'goals']

/** Les champs de texte libre soumis à `KIT_FIELD_MAX`. */
const FREE_TEXT: (keyof KitFormInput)[] = [
  'goals', 'availability', 'champions_liked', 'champions_disliked', 'playstyle',
]

export function validateKitForm(input: KitFormInput): KitFormErrors {
  const errors: KitFormErrors = {}

  for (const field of REQUIRED) {
    if (!input[field].trim()) errors[field] = 'required'
  }

  for (const field of FREE_TEXT) {
    if (input[field].length > KIT_FIELD_MAX) errors[field] = 'tooLong'
  }

  // En duo, le Riot ID du binôme est la seule information sans laquelle l'appel
  // de découverte ne peut pas se préparer. Son tag et son rôle restent
  // facultatifs : on les demandera de vive voix.
  if (input.formula === 'duo' && !input.partner_gamename.trim()) {
    errors.partner_gamename = 'required'
  }

  // Filet de dernier recours, aligné sur `kit_assert_snapshot`. Il ne devrait
  // jamais se déclencher si `KIT_FIELD_MAX` tient — mais il tient la promesse
  // que le front ne laisse pas partir ce que la base refusera.
  if (snapshotByteSize(buildKitSnapshot(input, {}, '1970-01-01T00:00:00.000Z')) > SNAPSHOT_MAX_BYTES) {
    errors.size = 'tooLong'
  }

  return errors
}

export function canSubmitKitForm(input: KitFormInput): boolean {
  return Object.keys(validateKitForm(input)).length === 0
}

/* ════════════════════════════════════════════════════════════════════════════
 *  CONSTRUCTION DU SNAPSHOT
 * ════════════════════════════════════════════════════════════════════════════ */

/** Ce qu'on recopie de `profiles` au moment du gel. */
export interface KitProfileFacts {
  riot_rank?: string | null
  riot_puuid?: string | null
  riot_gamename?: string | null
  riot_tagline?: string | null
  riot_platform?: string | null
}

/** `''` → `null` : une chaîne vide en base ne veut rien dire de plus qu'absent. */
const orNull = (v: string | null | undefined): string | null => {
  const t = (v ?? '').trim()
  return t === '' ? null : t
}

/**
 * Fabrique le snapshot à figer.
 *
 * `capturedAt` est INJECTÉ plutôt que lu de `new Date()` ici : c'est ce qui rend
 * la fonction pure, donc testable sans geler l'horloge. L'appelant passe
 * `new Date().toISOString()`.
 *
 * ⚠️ `riot_rank` vient du FORMULAIRE, pas de `profiles` — l'utilisateur peut
 * corriger son rang au moment du dépôt (il a pu grimper depuis qu'il l'a
 * renseigné sur son profil, ou ne l'avoir jamais renseigné). Le profil ne sert
 * de valeur INITIALE au champ, rien de plus. Les autres `riot_*` viennent du
 * profil : ce sont des faits vérifiés par la liaison de compte, que
 * l'utilisateur ne peut pas saisir à la main (trigger `trg_protect_riot_columns`).
 */
export function buildKitSnapshot(
  input: KitFormInput,
  profile: KitProfileFacts,
  capturedAt: string,
): KitPlayerSnapshot {
  const snapshot: KitPlayerSnapshot = {
    v: 1,
    formula: input.formula,
    captured_at: capturedAt,

    riot_rank:     orNull(input.riot_rank),
    riot_puuid:    orNull(profile.riot_puuid),
    riot_gamename: orNull(profile.riot_gamename),
    riot_tagline:  orNull(profile.riot_tagline),
    riot_platform: orNull(profile.riot_platform),

    role:                input.role.trim(),
    goals:               input.goals.trim(),
    availability:        input.availability.trim(),
    champions_liked:     input.champions_liked.trim(),
    champions_disliked:  input.champions_disliked.trim(),
    playstyle:           input.playstyle.trim(),
  }

  // Clé ABSENTE en solo, et non présente-mais-vide : un `partner: {}` dans un
  // snapshot solo se lirait comme un binôme dont on aurait perdu les infos.
  if (input.formula === 'duo') {
    snapshot.partner = {
      riot_gamename: input.partner_gamename.trim(),
      riot_tagline:  input.partner_tagline.trim(),
      role:          input.partner_role.trim(),
    }
  }

  return snapshot
}

/* ════════════════════════════════════════════════════════════════════════════
 *  PRISE DE RENDEZ-VOUS — lien externe préremplí
 * ════════════════════════════════════════════════════════════════════════════ */

/**
 * Ajoute le préremplissage Cal.com à l'URL de réservation.
 *
 * Lien EXTERNE, pas d'intégration API : décision du scan de cadrage. Le volume
 * est de quelques kits, l'appel se tient de toute façon sur Discord/Zoom/Teams,
 * et un booking maison impliquerait règles de disponibilité, fuseaux,
 * replanification, rappels et ICS — un projet à part entière.
 *
 * `name` et `email` sont les paramètres de préremplissage reconnus par Cal.com.
 * On ne pose QUE ceux dont on dispose : un `?email=` vide afficherait un champ
 * pré-rempli avec du vide, ce qui est pire que de le laisser au visiteur.
 *
 * Renvoie `null` si aucune URL de base n'est configurée — l'écran bascule alors
 * sur le contact manuel. Un bouton « Prendre rendez-vous » qui pointe vers nulle
 * part coûte plus cher que pas de bouton du tout.
 *
 * ⚠️ Sur une URL de base invalide, on renvoie `null` plutôt que de laisser
 * `new URL()` jeter : une variable d'environnement mal saisie ne doit pas
 * casser le rendu de toute la page.
 */
export function buildBookingUrl(
  baseUrl: string | undefined | null,
  who: { name?: string | null; email?: string | null },
): string | null {
  if (!baseUrl || !baseUrl.trim()) return null

  let url: URL
  try {
    url = new URL(baseUrl.trim())
  } catch {
    return null
  }

  const name = orNull(who.name)
  const email = orNull(who.email)
  if (name)  url.searchParams.set('name', name)
  if (email) url.searchParams.set('email', email)

  return url.toString()
}
