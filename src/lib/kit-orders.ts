/**
 * Kit sur mesure — machine d'états, module PUR (aucun import React, aucun DOM).
 *
 * Même partage des rôles que `lib/admin-flags.ts` / `lib/admin-subtabs.ts` : tout
 * ce qui DÉCIDE vit ici et se teste sans jsdom, `AdminTab` ne porte que le rendu.
 *
 * ⚠️ CE MODULE EST UN MIROIR D'AFFICHAGE, PAS UNE BARRIÈRE.
 * L'autorité sur les transitions est la fonction `kit_set_status`
 * (migration 20260908000001), qui re-vérifie `is_admin()` et la validité du
 * passage à chaque appel. Ce qui vit ici sert uniquement à savoir QUELS BOUTONS
 * proposer — un bouton absent n'a jamais empêché personne d'appeler PostgREST.
 *
 * C'est la leçon explicite de la dette des Scénarios (AGENTS.md § scenarios) :
 * `isPro` y était calculé dans le navigateur et les policies ne testaient que la
 * propriété de la ligne. Ici, le calcul client existe AUSSI, mais il est doublé
 * en base — et c'est la base qui refuse.
 */

/**
 * La chaîne LINÉAIRE du parcours, dans l'ordre.
 *
 * ⚠️ L'ORDRE EST LA SPÉCIFICATION : l'index dans ce tableau est la position dans
 * le parcours, et « une transition valide déplace d'exactement un cran » se lit
 * directement dessus. Copie fidèle du tableau `c_chain` de `kit_set_status` —
 * réordonner ici sans réordonner là-bas ferait proposer des boutons que la base
 * refuserait.
 *
 * `annule` n'y figure pas : il n'a pas de position dans le parcours, il se
 * rejoint depuis n'importe quel état non terminal.
 */
export const KIT_STATUS_CHAIN = [
  'demande',
  'acompte_paye',
  'decouverte_faite',
  'kit_trouve',
  'solde_paye',
  'session_faite',
  'termine',
] as const

export type KitChainStatus = typeof KIT_STATUS_CHAIN[number]
export type KitStatus = KitChainStatus | 'annule'

/**
 * Une ligne de `kit_orders` telle que la lisent le panneau admin et la carte.
 *
 * Vit ici plutôt que dans `AdminTab` pour la même raison que `FlagCatalogueRow`
 * vit dans `lib/admin-flags.ts` : deux consommateurs (l'onglet qui charge,
 * `KitOrderCard` qui rend) et un test qui en fabrique sans monter ni l'un ni
 * l'autre.
 *
 * `player_snapshot` en est ABSENT volontairement : la carte ne l'affiche pas au
 * lot 1 et le `select` ne le tire pas. L'ajouter ici avant d'en avoir besoin
 * ferait croire qu'il est chargé.
 */
export interface KitOrderRow {
  id: string
  user_id: string
  status: KitStatus
  price_total_cents: number | null
  admin_note: string | null
  created_at: string
  updated_at: string
}

/** Une ligne de `kit_order_events` — la timeline d'un dossier, admin seulement. */
export interface KitOrderEvent {
  id: number
  from_status: string | null
  to_status: string
  actor: string | null
  note: string | null
  created_at: string
}

/**
 * Les deux gestes qui demandent confirmation avant d'écrire.
 *
 * ⚠️ Un seul à la fois, par construction : ils sont portés par UNE valeur
 * (`{ id, kind } | null` côté AdminTab) et non par deux états indépendants.
 * Deux booléens laissaient ouvrir les deux confirmations sur la même carte, ce
 * qui affichait deux questions concurrentes pour un seul dossier.
 *
 * L'avancée n'y figure pas : elle suit le cours normal du dossier et ne
 * s'annonce pas. Reculer avoue une erreur, annuler ferme définitivement — les
 * deux laissent une trace d'audit qu'on ne pose pas par mégarde.
 */
export type KitConfirmKind = 'rollback' | 'cancel'

/** Les 8 valeurs acceptées par la contrainte CHECK de `kit_orders.status`. */
export const KIT_STATUSES: readonly KitStatus[] = [...KIT_STATUS_CHAIN, 'annule']

/**
 * Les deux points d'entrée possibles d'un dossier — jamais le milieu de chaîne.
 *
 * `acompte_paye` est le chemin du LOT 1 (l'admin encaisse à la main puis ouvre) ;
 * `demande` celui du LOT 2 (le client remplit le formulaire avant de payer).
 * Aligné sur la garde de `kit_open_order`.
 */
export const KIT_OPEN_STATUSES: readonly KitStatus[] = ['acompte_paye', 'demande']

/**
 * États TERMINAUX — plus aucune transition n'en sort.
 *
 * `termine` l'est dans les deux sens : un kit livré ne se dé-livre pas, et c'est
 * ce qui rend stable la liste des preneurs du pack. `annule` aussi : un client
 * qui revient ouvre un NOUVEAU dossier, l'historique du premier reste intact.
 */
export const KIT_TERMINAL_STATUSES: readonly KitStatus[] = ['termine', 'annule']

export function isKitStatus(value: unknown): value is KitStatus {
  return typeof value === 'string' && (KIT_STATUSES as readonly string[]).includes(value)
}

/** Un dossier est-il clos ? Complément d'`isActiveKit`, jamais sa négation implicite. */
export function isTerminalKitStatus(status: KitStatus): boolean {
  return (KIT_TERMINAL_STATUSES as readonly string[]).includes(status)
}

/**
 * Le dossier occupe-t-il le « slot actif » du client ?
 *
 * Exactement le prédicat de l'index partiel `uq_kit_orders_active`
 * (`status NOT IN ('termine','annule')`). Un client ne peut avoir qu'UN dossier
 * dans cet état à la fois — c'est ce qui interdit deux acomptes encaissés pour
 * un seul accompagnement.
 */
export function isActiveKit(status: KitStatus): boolean {
  return !isTerminalKitStatus(status)
}

/** Position dans le parcours, ou `null` pour `annule` (hors chaîne). */
export function kitStatusIndex(status: KitStatus): number | null {
  const i = (KIT_STATUS_CHAIN as readonly string[]).indexOf(status)
  return i === -1 ? null : i
}

/**
 * Progression 0→1 du dossier, pour une barre ou un libellé « étape 3 / 7 ».
 *
 * `annule` renvoie `null` plutôt que `0` : un dossier annulé n'est pas « au
 * début », il est sorti du parcours. Un `0` afficherait une barre vide qui se
 * lirait comme « rien n'a été fait », ce qui est faux d'un dossier abandonné en
 * cours de route.
 */
export function kitProgress(status: KitStatus): number | null {
  const i = kitStatusIndex(status)
  return i === null ? null : i / (KIT_STATUS_CHAIN.length - 1)
}

/** L'état suivant dans la chaîne, ou `null` si le dossier ne peut plus avancer. */
export function nextKitStatus(status: KitStatus): KitStatus | null {
  const i = kitStatusIndex(status)
  if (i === null || i >= KIT_STATUS_CHAIN.length - 1) return null
  return KIT_STATUS_CHAIN[i + 1]
}

/**
 * L'état précédent, ou `null` si le retour est interdit.
 *
 * Deux `null` distincts, tous deux voulus : depuis `demande` (rien avant) et
 * depuis `termine` (terminal — la dé-clôture est refusée par la base). Le second
 * est la seule asymétrie de cette machine, et elle est délibérée.
 */
export function prevKitStatus(status: KitStatus): KitStatus | null {
  if (status === 'termine') return null
  const i = kitStatusIndex(status)
  if (i === null || i === 0) return null
  return KIT_STATUS_CHAIN[i - 1]
}

/** Le dossier peut-il être annulé ? Tout état non terminal, et eux seuls. */
export function canCancelKit(status: KitStatus): boolean {
  return !isTerminalKitStatus(status)
}

/**
 * Les trois actions proposables sur un dossier, telles que le panneau admin les
 * rend. `null` = pas de bouton.
 *
 * Fonction unique plutôt que trois appels dans le JSX : c'est elle que le test
 * parcourt pour vérifier, état par état, que le nombre d'actions offertes
 * correspond à la table de transitions de la migration.
 */
export interface KitActions {
  advance: KitStatus | null
  rollback: KitStatus | null
  cancel: boolean
}

export function kitActions(status: KitStatus): KitActions {
  return {
    advance:  nextKitStatus(status),
    rollback: prevKitStatus(status),
    cancel:   canCancelKit(status),
  }
}

/**
 * Une transition est-elle valide ? Réplique exacte de la garde 4 de
 * `kit_set_status`.
 *
 * Sert au test d'équivalence : les 17 transitions valides et elles seules.
 */
export function isValidKitTransition(from: KitStatus, to: KitStatus): boolean {
  if (to === 'annule') return canCancelKit(from)
  const a = kitStatusIndex(from)
  const b = kitStatusIndex(to)
  if (a === null || b === null) return false
  if (b - a === 1) return true
  return b - a === -1 && from !== 'termine'
}

/* ════════════════════════════════════════════════════════════════════════════
 *  FORMATAGE
 * ════════════════════════════════════════════════════════════════════════════ */

/**
 * Prix en centimes → chaîne affichable, ou `null` si le prix n'est pas renseigné.
 *
 * Les centimes sont la seule unité stockée (`price_total_cents`) : jamais de
 * flottant sur de l'argent. La conversion se fait donc UNIQUEMENT ici, au moment
 * d'afficher. `Intl.NumberFormat` plutôt qu'un gabarit maison, comme
 * `lib/intl.ts` et `relativeTime` de `lib/admin-flags.ts`.
 */
export function formatKitPrice(cents: number | null | undefined, lang: 'fr' | 'en'): string | null {
  if (cents === null || cents === undefined || !Number.isFinite(cents)) return null
  return new Intl.NumberFormat(lang === 'en' ? 'en-GB' : 'fr-FR', {
    style: 'currency', currency: 'EUR',
  }).format(cents / 100)
}

/**
 * Centimes attendus pour l'acompte (40 %) et le solde (60 %).
 *
 * ⚠️ Purement INDICATIF, et rendu tel quel dans le panneau : la base ne stocke
 * que le total, et ce qui a réellement été encaissé se lit dans le journal
 * `kit_order_events`. Le lot 4 (Stripe) fera foi sur les montants réels — cette
 * fonction ne sert qu'à épargner un calcul mental à l'admin qui encaisse à la main.
 *
 * `Math.round` sur l'acompte puis SOUSTRACTION pour le solde : c'est ce qui
 * garantit que les deux parts retombent exactement sur le total, quel qu'il soit.
 * Deux arrondis indépendants peuvent perdre ou inventer un centime.
 */
export const KIT_DEPOSIT_RATIO = 0.4

export function kitInstalments(totalCents: number): { deposit: number; balance: number } {
  const deposit = Math.round(totalCents * KIT_DEPOSIT_RATIO)
  return { deposit, balance: totalCents - deposit }
}
