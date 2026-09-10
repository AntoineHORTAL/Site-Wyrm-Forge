/**
 * Intention d'abonnement mise en attente — « je voulais souscrire, il me
 * manquait un compte ».
 *
 * ════════════════════════════════════════════════════════════════════════════
 *  LE PROBLÈME
 * ════════════════════════════════════════════════════════════════════════════
 * Sur la vitrine publique, le bouton d'un palier payant affiche « Se connecter
 * pour s'abonner » (`ctaSubscribeAnon`) et se contente d'ouvrir la modale. Une
 * fois connecté, RIEN ne reprend le geste : le visiteur revient sur un bouton
 * qui a changé de libellé sans qu'il l'ait forcément vu, et doit re-cliquer.
 * Pire, sur `/` la connexion FAIT DISPARAÎTRE la vitrine — `page.tsx` bascule
 * sur le dashboard — donc le bouton qu'il faudrait re-cliquer n'est même plus
 * à l'écran.
 *
 * ════════════════════════════════════════════════════════════════════════════
 *  POURQUOI `sessionStorage` ET PAS UN `useState`
 * ════════════════════════════════════════════════════════════════════════════
 * Un état React ne survivrait à aucun des deux chemins de connexion :
 *
 *  • connexion Google (`signInWithOAuth`) — le navigateur QUITTE le site pour
 *    accounts.google.com, revient sur `/auth/callback`, puis sur `/`. Tout
 *    l'arbre React a été détruit et reconstruit entre-temps ;
 *  • connexion e-mail — pas de rechargement, mais `Pricing` est démonté à
 *    l'instant où `user` devient non-null (branche visiteur de `page.tsx`
 *    remplacée par le dashboard). Un effet `[user]` posé dans `Pricing` ne
 *    s'exécuterait donc jamais avec la nouvelle valeur.
 *
 * `sessionStorage` traverse les deux : il est lié à l'ONGLET, pas au document.
 * Et il se ferme tout seul — refermer l'onglet efface l'intention, ce qu'un
 * `localStorage` ne ferait pas (une intention oubliée pendant trois jours qui
 * ouvre un paiement au prochain login serait une mauvaise surprise).
 *
 * ════════════════════════════════════════════════════════════════════════════
 *  MODULE PUR
 * ════════════════════════════════════════════════════════════════════════════
 * Comme `plans.ts` : aucun import React/Next, et surtout aucun accès DIRECT à
 * `window` depuis la logique. Le stockage est PASSÉ en paramètre
 * (`IntentStorage`), ce qui rend testable sans jsdom ce qui compte — validation,
 * péremption, consommation unique — avec un faux objet de trois méthodes.
 */

import { isPlanKey, isBillingPeriod, type PlanKey, type BillingPeriod } from './plans'

/**
 * Clé de stockage, préfixée `wf.` — `sessionStorage` est partagé par ORIGINE, et
 * un nom générique (`intent`, `checkout`) entrerait en collision avec n'importe
 * quoi d'autre écrit sur le même domaine.
 */
export const CHECKOUT_INTENT_KEY = 'wf.stripe.checkout-intent'

/**
 * Durée de validité d'une intention — 15 minutes.
 *
 * Assez long pour un aller-retour OAuth, la création d'un compte et une
 * hésitation ; assez court pour qu'une intention abandonnée (modale fermée sans
 * se connecter) ne rouvre pas un paiement quand la personne se connecte une
 * demi-heure plus tard pour tout autre chose.
 *
 * ⚠️ Cette péremption n'est PAS une sécurité : elle n'évite qu'une surprise.
 * L'intention ne porte qu'un palier et une périodicité, jamais un montant — le
 * prix est choisi côté serveur par `/api/stripe/checkout` à partir de ce couple
 * et de rien d'autre. Une intention falsifiée à la console ne peut donc pas
 * acheter Maître au prix de Forgeron.
 */
export const CHECKOUT_INTENT_TTL_MS = 15 * 60 * 1000

/** Ce qui a été cliqué, et quand. */
export interface CheckoutIntent {
  plan: PlanKey
  period: BillingPeriod
  /** `Date.now()` au moment du clic — sert uniquement au TTL. */
  at: number
}

/**
 * Vue minimale du stockage — exactement les trois méthodes utilisées.
 *
 * Le type `Storage` du DOM conviendrait, mais l'annoncer obligerait les tests à
 * en fabriquer un complet (`length`, `key`, `clear`) pour rien.
 */
export interface IntentStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

/**
 * Le `sessionStorage` du navigateur, ou `null`.
 *
 * `null` dans trois cas bien réels, tous à traiter comme « pas de reprise
 * automatique » et jamais comme une erreur : rendu serveur (`window` absent),
 * navigation privée de certains navigateurs (l'ACCÈS lui-même lève), stockage
 * désactivé. Le parcours manuel — cliquer le bouton une fois connecté — reste
 * entier dans tous les cas.
 */
export function sessionIntentStorage(): IntentStorage | null {
  try {
    if (typeof window === 'undefined') return null
    return window.sessionStorage
  } catch {
    return null
  }
}

/** Mémorise le palier cliqué. Écrase silencieusement une intention précédente. */
export function rememberCheckoutIntent(
  storage: IntentStorage | null,
  plan: PlanKey,
  period: BillingPeriod,
  now: number = Date.now(),
): void {
  if (!storage) return
  try {
    storage.setItem(CHECKOUT_INTENT_KEY, JSON.stringify({ plan, period, at: now }))
  } catch {
    // Quota dépassé, mode privé : on renonce à la reprise, pas au parcours.
  }
}

/**
 * Lit l'intention SANS la consommer — pour décider d'une navigation.
 *
 * `page.tsx` s'en sert pour ouvrir l'onglet `tarifs` après connexion : à ce
 * moment-là `Pricing` n'est pas encore monté, et consommer l'intention ici la
 * ferait disparaître avant que quiconque puisse la relancer.
 *
 * Une intention illisible ou périmée est EFFACÉE au passage : la laisser
 * traîner ferait relire un JSON invalide à chaque rendu.
 */
export function peekCheckoutIntent(
  storage: IntentStorage | null,
  now: number = Date.now(),
): CheckoutIntent | null {
  if (!storage) return null

  let raw: string | null
  try {
    raw = storage.getItem(CHECKOUT_INTENT_KEY)
  } catch {
    return null
  }
  if (!raw) return null

  const intent = parseIntent(raw)
  if (!intent || now - intent.at > CHECKOUT_INTENT_TTL_MS) {
    clearCheckoutIntent(storage)
    return null
  }
  return intent
}

/**
 * Lit l'intention ET l'efface — consommation UNIQUE.
 *
 * L'effacement a lieu AVANT que l'appelant n'ouvre le checkout, jamais après :
 * si l'ouverture échoue (réseau, 503 de configuration), on veut que la personne
 * réessaie en cliquant, pas qu'un paiement se relance tout seul au prochain
 * rendu. C'est ce que demande « nettoyer l'état mémorisé après usage », et c'est
 * le seul ordre qui tienne face au double montage du mode strict de React.
 */
export function takeCheckoutIntent(
  storage: IntentStorage | null,
  now: number = Date.now(),
): CheckoutIntent | null {
  const intent = peekCheckoutIntent(storage, now)
  clearCheckoutIntent(storage)
  return intent
}

export function clearCheckoutIntent(storage: IntentStorage | null): void {
  if (!storage) return
  try {
    storage.removeItem(CHECKOUT_INTENT_KEY)
  } catch {
    // Rien à faire : au pire l'intention périmera d'elle-même.
  }
}

/**
 * JSON → intention, ou `null`.
 *
 * `isPlanKey` / `isBillingPeriod` plutôt qu'un `as CheckoutIntent` : ce qui sort
 * du stockage est une chaîne écrite par un navigateur, éditable à la main. Un
 * `plan` inventé traverserait tout le composant pour finir en 400 côté route —
 * autant l'écarter ici, là où la question a un nom.
 */
function parseIntent(raw: string): CheckoutIntent | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object') return null

  const { plan, period, at } = parsed as Record<string, unknown>
  if (!isPlanKey(plan) || !isBillingPeriod(period)) return null
  if (typeof at !== 'number' || !Number.isFinite(at)) return null

  return { plan, period, at }
}
