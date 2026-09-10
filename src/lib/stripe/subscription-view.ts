/**
 * Ce que la section « Abonnement » de `/profil` doit AFFICHER — et rien de plus.
 *
 * Module PUR, comme `plans.ts` (aucun React, aucun SDK, aucun `process.env`),
 * pour la raison qui a été retenue sur tout ce chantier : la décision se teste,
 * le JSX ne se teste pas. Ce qui se décide ici, ce n'est pas un palier — ça,
 * c'est le travail de `resolveTierOutcome`, côté webhook, et c'est déjà écrit en
 * base au moment où cette page s'ouvre. Ici on ne fait que RELIRE le résultat.
 *
 * ⚠️ Ne pas confondre les deux, et surtout ne pas rappeler `resolveTierOutcome`
 * depuis la page :
 *
 *   `resolveTierOutcome`  Stripe → « quel palier écrire ? »   (webhook, ÉCRIT)
 *   `resolveSubscriptionView`  base → « quoi montrer ? »      (profil, LIT)
 *
 * Le recalculer côté client à partir du statut Stripe ferait exister une SECONDE
 * table de décision — et le jour où les deux divergeraient, la page affirmerait
 * un palier que la base ne donne pas. `profiles.tier` est la source de vérité du
 * palier, pour le site comme pour l'app WPF ; cette fonction ne fait que la lire.
 */

import { isPaidTier } from '../subscription'
import { isPaymentIssue } from './plans'

/**
 * Les trois situations d'un compte, du point de vue de l'abonnement.
 *
 *  • `free`     — palier gratuit (`apprenti`). Rien à gérer, tout à souscrire.
 *  • `paid`     — palier payant AVEC une date de fin : un abonnement Stripe.
 *  • `lifetime` — palier payant SANS date de fin. `tier_expires_at` à `null`
 *                 signifie « à vie » dans ce schéma (cf. le badge existant de
 *                 `/profil` et l'exclusion de `SubscriptionReminder`). Ce cas ne
 *                 vient JAMAIS de Stripe — `resolveTierOutcome` ne renvoie
 *                 `null` que sur un retour au gratuit — mais d'une attribution
 *                 manuelle depuis le panneau admin. D'où un cas distinct : lui
 *                 afficher « renouvellement le … » serait faux.
 */
export type SubscriptionKind = 'free' | 'paid' | 'lifetime'

/** Ce que la page sait du compte — deux lignes de base, rien d'autre. */
export interface SubscriptionViewInput {
  /** `profiles.tier`, valeur brute. */
  tier: string | null | undefined
  /** `profiles.tier_expires_at`. `null` = à vie (voir `SubscriptionKind`). */
  tierExpiresAt: string | null | undefined
  /** `profiles.role` — `'admin'` change l'explication, jamais le bouton. */
  role?: string | null
  /** La ligne `stripe_subscriptions` de l'utilisateur, ou `null` s'il n'en a pas. */
  subscription?: SubscriptionRow | null
}

/** Colonnes lues de `stripe_subscriptions` — lecture propre, policy `ss_select_own`. */
export interface SubscriptionRow {
  stripe_customer_id: string | null
  status: string | null
  cancel_at_period_end: boolean | null
  current_period_end: string | null
}

export interface SubscriptionView {
  kind: SubscriptionKind
  /** Valeur brute de `profiles.tier`, à passer telle quelle à `subscriptionTierLabel`. */
  tier: string
  /** Date de fin d'accès à afficher, ou `null` (gratuit, ou à vie). */
  expiresAt: string | null
  /**
   * Le bouton « gérer mon abonnement » a-t-il un sens ?
   *
   * Adossé à l'EXISTENCE d'un client Stripe, et non au palier courant. Quelqu'un
   * dont l'abonnement a expiré est redescendu à `apprenti` mais garde un client
   * Stripe : ses factures, son moyen de paiement et sa réactivation sont dans le
   * portail, et le lui cacher l'obligerait à écrire un mail. C'est aussi
   * exactement la condition que `/api/stripe/portal` vérifie côté serveur —
   * afficher le bouton dans un autre cas produirait une erreur au clic.
   */
  canManageBilling: boolean
  /**
   * Résiliation programmée : l'accès court encore jusqu'à `expiresAt`, puis
   * s'arrête. Distinct d'un abonnement qui se renouvellera — et la nuance vaut
   * d'être dite, sinon la même date se lit « prochain prélèvement ».
   */
  cancelAtPeriodEnd: boolean
  /**
   * Incident de paiement (`past_due` / `unpaid`) — verdict de `plans.ts`, jamais
   * une comparaison de statut réécrite ici.
   */
  paymentIssue: boolean
  /**
   * Le palier vient du RÔLE admin, pas d'un paiement.
   *
   * L'abonnement Stripe reste orthogonal au rôle : la RPC
   * `stripe_apply_subscription_event` enregistre bien l'abonnement d'un admin
   * mais ne touche pas à son `profiles.tier` (`admin_untouched`). La section doit
   * donc pouvoir dire « ton palier ne dépend pas de cet abonnement » plutôt que
   * de laisser croire qu'une résiliation lui ferait perdre ses accès.
   */
  isAdmin: boolean
}

/**
 * Repli de palier — `page.tsx` utilise `'Apprenti'` capitalisé quand le profil
 * n'est pas chargé, et `profiles.tier` n'a aucune contrainte CHECK. On ne
 * normalise donc PAS la valeur renvoyée (les libellés et les couleurs sont
 * indexés par la valeur en base, minuscule), on se contente de ne jamais
 * renvoyer `null` là où un libellé est attendu.
 */
const UNKNOWN_TIER = 'apprenti'

export function resolveSubscriptionView(input: SubscriptionViewInput): SubscriptionView {
  const tier = input.tier?.trim() || UNKNOWN_TIER
  const expiresAt = input.tierExpiresAt ?? null
  const sub = input.subscription ?? null

  // `isPaidTier` et pas une liste blanche : même raisonnement que partout
  // ailleurs — un palier ajouté demain doit être payant par défaut, pas gratuit
  // en silence. La fonction normalise déjà la casse.
  const paid = isPaidTier(tier)

  const kind: SubscriptionKind = !paid ? 'free' : expiresAt === null ? 'lifetime' : 'paid'

  return {
    kind,
    tier,
    // Un palier gratuit n'a rien qui expire : même si une date traînait en base,
    // l'afficher n'aurait aucun sens.
    expiresAt: kind === 'paid' ? expiresAt : null,
    canManageBilling: Boolean(sub?.stripe_customer_id),
    cancelAtPeriodEnd: sub?.cancel_at_period_end === true,
    paymentIssue: isPaymentIssue(sub?.status),
    isAdmin: input.role === 'admin',
  }
}
