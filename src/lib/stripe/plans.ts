/**
 * Traduction Stripe ⇄ Wyrm Forge — quel palier vaut quel prix, et quel statut
 * d'abonnement donne droit à quel `profiles.tier`.
 *
 * Module PUR (aucun import React/Next, aucun SDK Stripe, aucun accès à
 * `process.env`) : il se teste sans alias `@/` et sans réseau, conformément à la
 * convention des modules de logique du repo (`environment.ts`, `pricing-tiers.ts`).
 * Les routes lui PASSENT l'environnement, elles ne le lui font pas lire.
 *
 * ⚠️ C'est ici, et nulle part ailleurs, que se décide le palier d'un abonné.
 * La fonction SQL `stripe_apply_subscription_event` (migration 20260909000001)
 * n'applique que ce que ce module a calculé — délibérément : deux tables de
 * décision, l'une en TypeScript testé et l'autre en PL/pgSQL non testé,
 * divergeraient un jour, et c'est la non testée qui écrirait.
 */

import { FREE_TIER } from '../subscription'

/**
 * Palier ACHETABLE, dans sa forme transportable.
 *
 * ⚠️ Ce n'est PAS la valeur de `profiles.tier` : `maitre` s'écrit ici sans
 * accent. La valeur en base est `maître`, partagée avec l'app de bureau WPF et
 * intouchable. La forme ASCII existe parce que cette clé voyage — corps de
 * requête JSON, `metadata` Stripe, nom de variable d'environnement — et qu'un
 * accent y survit mal (encodage d'URL, casse des clés Stripe, shells Windows).
 * `TIER_BY_PLAN` fait la conversion, une seule fois.
 *
 * Légion et Monarque n'y figurent pas : non priorisés, donc non achetables.
 * Les ajouter ici sans créer les prix Stripe correspondants produirait un bouton
 * qui échoue au clic — `resolvePriceId` renvoie `null` et la route refuse.
 */
export type PlanKey = 'forgeron' | 'maitre'

/** Périodicité de facturation. Vocabulaire métier FR, comme le reste du domaine. */
export type BillingPeriod = 'mensuel' | 'annuel'

export const PLAN_KEYS: readonly PlanKey[] = ['forgeron', 'maitre'] as const
export const BILLING_PERIODS: readonly BillingPeriod[] = ['mensuel', 'annuel'] as const

/**
 * Clé transportable → valeur RÉELLE de `profiles.tier`.
 *
 * Le seul endroit du code où l'accent de `maître` est réintroduit. Toute
 * comparaison de palier en aval (`isPaidTier`, `TIER_ORDER`, `TIER_COLORS`)
 * travaille sur cette valeur-là.
 */
export const TIER_BY_PLAN: Readonly<Record<PlanKey, string>> = {
  forgeron: 'forgeron',
  maitre:   'maître',
}

export function isPlanKey(value: unknown): value is PlanKey {
  return typeof value === 'string' && (PLAN_KEYS as readonly string[]).includes(value)
}

export function isBillingPeriod(value: unknown): value is BillingPeriod {
  return typeof value === 'string' && (BILLING_PERIODS as readonly string[]).includes(value)
}

/**
 * Nom de la variable d'environnement portant l'identifiant de prix Stripe.
 *
 * Les `price_id` ne sont PAS codés en dur : ils diffèrent entre le mode test et
 * le mode live d'un même compte Stripe, et changeraient à la moindre refonte
 * tarifaire. Les mettre dans le code ferait d'un changement de prix un déploiement.
 *
 * Forme : `STRIPE_PRICE_<PALIER>_<PÉRIODICITÉ>`, en majuscules ASCII.
 * → `STRIPE_PRICE_FORGERON_MENSUEL`, `STRIPE_PRICE_MAITRE_ANNUEL`, …
 */
export function priceEnvKey(plan: PlanKey, period: BillingPeriod): string {
  return `STRIPE_PRICE_${plan.toUpperCase()}_${period.toUpperCase()}`
}

/** Vue minimale de l'environnement — ce que ce module a le droit de lire. */
export type PriceEnv = Record<string, string | undefined>

/**
 * Identifiant de prix Stripe pour un couple (palier, périodicité), ou `null` si
 * la variable est absente ou vide.
 *
 * `null` plutôt qu'un throw : l'appelant (la route de checkout) sait, lui,
 * quoi répondre au navigateur — et une configuration incomplète ne doit pas
 * ressembler à un bug applicatif dans les logs.
 */
export function resolvePriceId(
  plan: PlanKey,
  period: BillingPeriod,
  env: PriceEnv,
): string | null {
  const value = env[priceEnvKey(plan, period)]
  return value && value.trim().length > 0 ? value.trim() : null
}

/**
 * Chemin INVERSE : à quel palier correspond ce `price_id` ?
 *
 * Indispensable au webhook. Les événements `customer.subscription.updated` /
 * `deleted` ne portent ni `client_reference_id` ni les métadonnées du checkout
 * quand l'abonnement a été modifié depuis le portail Stripe ou le Dashboard :
 * le prix est alors la SEULE information fiable sur ce qui a été souscrit.
 *
 * Renvoie `null` pour un prix inconnu — un prix créé au Dashboard sans variable
 * d'environnement correspondante, typiquement. L'appelant traite ce cas comme
 * « palier indéterminé » plutôt que d'attribuer un palier au hasard.
 */
export function planForPriceId(priceId: string | null | undefined, env: PriceEnv): PlanKey | null {
  if (!priceId) return null
  for (const plan of PLAN_KEYS) {
    for (const period of BILLING_PERIODS) {
      if (resolvePriceId(plan, period, env) === priceId) return plan
    }
  }
  return null
}

/** Périodicité d'un `price_id` connu — `null` si le prix n'est pas au catalogue. */
export function periodForPriceId(
  priceId: string | null | undefined,
  env: PriceEnv,
): BillingPeriod | null {
  if (!priceId) return null
  for (const plan of PLAN_KEYS) {
    for (const period of BILLING_PERIODS) {
      if (resolvePriceId(plan, period, env) === priceId) return period
    }
  }
  return null
}

/* ════════════════════════════════════════════════════════════════════════════
   POLITIQUE D'ACCÈS — un statut Stripe donne-t-il encore droit au palier ?
   ════════════════════════════════════════════════════════════════════════════ */

/**
 * Statuts qui VALENT l'accès payant.
 *
 * `trialing` en fait partie : une période d'essai est un accès accordé, même si
 * rien n'a encore été débité.
 */
const ACTIVE_STATUSES = new Set(['active', 'trialing'])

/**
 * Statuts qui font PERDRE l'accès, immédiatement.
 *
 *  • `unpaid`             — Stripe a épuisé ses relances (Smart Retries, ~1 semaine).
 *                           C'est l'état terminal d'un impayé, pas une alerte.
 *  • `canceled`           — résiliation effective (fin de période atteinte, ou
 *                           résiliation immédiate).
 *  • `incomplete_expired` — le premier paiement n'a jamais abouti : l'abonnement
 *                           n'a en réalité jamais commencé.
 *  • `incomplete`         — premier paiement en attente d'authentification (3DS).
 *                           Rien n'est encaissé → rien n'est dû. L'accès s'ouvrira
 *                           au passage en `active`, quelques secondes plus tard.
 *  • `paused`             — pause d'essai configurée côté Stripe. L'abonnement
 *                           existe mais ne facture pas ; l'accès suit.
 */
const REVOKED_STATUSES = new Set(['unpaid', 'canceled', 'incomplete_expired', 'incomplete', 'paused'])

/**
 * `past_due` — l'accès est CONSERVÉ. Décision explicite, pas un oubli.
 *
 * `past_due` signifie « une échéance a échoué, Stripe relance ». Les relances
 * s'étalent sur environ une semaine et aboutissent la plupart du temps (carte
 * réémise, plafond, 3DS raté au premier essai). Couper l'accès au premier échec
 * punirait un client qui va payer, pour une semaine d'accès en jeu ; l'erreur
 * inverse — une semaine d'accès offerte à quelqu'un qui ne paiera pas — se
 * referme toute seule au passage en `unpaid`, qui est dans `REVOKED_STATUSES`.
 *
 * Le statut brut est stocké en base (`stripe_subscriptions.status`), donc un
 * futur bandeau « ton paiement a échoué » a de quoi s'afficher sans changer
 * cette politique.
 */
const GRACE_STATUSES = new Set(['past_due'])

/** Ce que le webhook reçoit d'un abonnement, réduit à ce qui décide du palier. */
export interface SubscriptionSnapshot {
  /** Statut Stripe brut. */
  status: string
  /** Palier acheté, valeur `profiles.tier` (`forgeron` / `maître`), ou `null` si le prix est inconnu. */
  tier: string | null
  /** Fin de la période payée, en ISO 8601, ou `null`. */
  currentPeriodEnd: string | null
}

/** Ce qu'il faut écrire dans `profiles` pour cet abonnement. */
export interface TierOutcome {
  /** Valeur à écrire dans `profiles.tier`. */
  tier: string
  /**
   * Valeur à écrire dans `profiles.tier_expires_at`.
   *
   * ⚠️ `null` signifie « À VIE » dans ce schéma (cf. `SubscriptionReminder`, qui
   * exclut les comptes à `tier_expires_at` null, et le badge « à vie » de
   * `/profil`). Ce module ne renvoie donc `null` QUE sur un retour au palier
   * gratuit, où la question de l'expiration ne se pose pas : un `apprenti` n'a
   * rien qui expire. Un palier PAYANT sort toujours d'ici avec une date.
   */
  expiresAt: string | null
  /** Vrai quand le palier acheté est conservé — sert aux logs du webhook. */
  granted: boolean
}

/**
 * Le palier à appliquer, à partir d'un instantané d'abonnement.
 *
 * Trois issues seulement :
 *   1. accès accordé   → palier acheté + date de fin de période
 *   2. accès révoqué   → `apprenti`, sans date
 *   3. palier inconnu  → `apprenti` (voir plus bas)
 *
 * **Statut inconnu de Stripe** → l'accès est CONSERVÉ. Les huit statuts
 * documentés par Stripe sont tous traités explicitement ci-dessus ; une valeur
 * hors liste signifie que Stripe en a ajouté un depuis. Entre déclasser un
 * client qui paie et laisser un accès de trop jusqu'à ce qu'un humain regarde,
 * on choisit la seconde — et l'accès reste borné par `current_period_end`.
 * La route de webhook journalise ce cas en `console.error`.
 *
 * **Palier inconnu** (`tier: null`, prix absent du catalogue) → `apprenti`,
 * quel que soit le statut. Il n'y a rien à accorder : on ne sait pas quoi.
 * Attribuer « le palier le plus probable » ici serait offrir Maître à qui a
 * payé Forgeron, ou l'inverse.
 */
export function resolveTierOutcome(snapshot: SubscriptionSnapshot): TierOutcome {
  const revoked = { tier: FREE_TIER, expiresAt: null, granted: false }

  if (!snapshot.tier) return revoked

  const status = snapshot.status?.trim().toLowerCase() ?? ''
  if (REVOKED_STATUSES.has(status)) return revoked

  const keeps = ACTIVE_STATUSES.has(status) || GRACE_STATUSES.has(status) || !isKnownStatus(status)
  if (!keeps) return revoked

  return { tier: snapshot.tier, expiresAt: snapshot.currentPeriodEnd, granted: true }
}

/** Le statut fait-il partie des huit valeurs documentées par Stripe ? */
export function isKnownStatus(status: string): boolean {
  const s = status.trim().toLowerCase()
  return ACTIVE_STATUSES.has(s) || REVOKED_STATUSES.has(s) || GRACE_STATUSES.has(s)
}

/**
 * L'abonnement est-il en incident de paiement ?
 *
 * `past_due` conserve l'accès (voir `GRACE_STATUSES`) mais mérite d'être signalé ;
 * `unpaid` l'a déjà perdu. Les deux sont ce que le ticket appelle « échec de
 * paiement » et ce qu'un futur bandeau d'alerte lirait.
 */
export function isPaymentIssue(status: string | null | undefined): boolean {
  if (!status) return false
  const s = status.trim().toLowerCase()
  return s === 'past_due' || s === 'unpaid'
}

/* ════════════════════════════════════════════════════════════════════════════
   UTILITAIRES
   ════════════════════════════════════════════════════════════════════════════ */

/**
 * Horodatage Stripe (secondes UNIX) → ISO 8601, ou `null`.
 *
 * Stripe compte en SECONDES, `Date` en millisecondes : l'oubli du ×1000 place
 * la fin de période en 1970 et déclasse tout le monde. D'où cette conversion
 * unique et testée plutôt que des `new Date(x * 1000)` disséminés.
 */
export function unixToIso(seconds: number | null | undefined): string | null {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) return null
  return new Date(seconds * 1000).toISOString()
}

/**
 * Mode d'une clé secrète Stripe, déduit de la CLÉ elle-même.
 *
 * Même principe qu'`isTestDatabase` pour Supabase, et pour la même raison : un
 * drapeau séparé (`STRIPE_MODE=test`) peut diverger de la clé qu'il prétend
 * décrire, et affirmerait « mode test » à quelqu'un branché sur du live — soit
 * exactement le contresens qu'on cherche à éviter quand de l'argent circule.
 *
 * `unknown` pour tout ce qui n'est ni `sk_test_`/`rk_test_` ni `sk_live_`/`rk_live_` :
 * conservateur, comme `inspectSupabaseEnv`, jamais un verdict inventé.
 */
export function stripeMode(secretKey: string | null | undefined): 'test' | 'live' | 'unknown' {
  if (!secretKey) return 'unknown'
  const k = secretKey.trim()
  if (/^(sk|rk)_test_/.test(k)) return 'test'
  if (/^(sk|rk)_live_/.test(k)) return 'live'
  return 'unknown'
}
