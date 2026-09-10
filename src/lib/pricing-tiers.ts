/**
 * Paliers de la grille tarifaire de la vitrine — MONTANTS seulement.
 *
 * Module PUR (aucun import React/Next), comme `src/lib/nav-links.ts` et pour la
 * même raison : `landing.test.ts` tourne sans jsdom et doit pouvoir vérifier que
 * la promesse commerciale affichée correspond aux chiffres réellement facturés.
 * Importer `Pricing.tsx` dans un test y tirerait tout l'arbre React.
 *
 * ⚠️ Nom affiché, tagline et liste de features sont TRADUITS et vivent dans
 * `src/locales/landing.ts` (`pricing.tiers`, MÊME ORDRE — appariement par index).
 *
 * ⚠️ Le paiement est BRANCHÉ depuis le chantier Stripe Billing (2026-09-09) :
 * Apprenti mène toujours au téléchargement, les deux paliers payants ouvrent une
 * session Stripe Checkout (`cta: 'subscribe'`). Le CTA `'soon'` reste déclaré —
 * c'est ce que porteront Légion et Monarque tant qu'ils n'ont pas de prix Stripe.
 */

export interface PricingTier {
  /**
   * Valeur de `profiles.tier` en base, PARTAGÉE avec l'app de bureau WPF.
   * Reste en français et n'est JAMAIS affichée telle quelle : le libellé à
   * l'écran vient de `pricing.tiers[i].name` du dictionnaire. C'est une clé.
   */
  name: string
  /** Prix mensuel en euros. 0 = gratuit. */
  monthly: number
  /**
   * Prix ANNUEL en euros — valeur FIXE et arrondie, jamais un calcul.
   *
   * Il y avait ici un `ANNUAL_FACTOR = 0.9` appliqué à `monthly × 12`, qui
   * produisait des montants à deux décimales peu lisibles (32,40 € / 64,80 €).
   * Les prix annuels sont désormais posés à la main : c'est une décision
   * commerciale, pas le résultat d'une formule.
   */
  annual: number
  /**
   * `'download'` — le gratuit, vers l'installeur Windows.
   * `'subscribe'` — ouvre `/api/stripe/checkout` avec `plan` (voir ci-dessous).
   * `'soon'`      — palier annoncé sans prix Stripe (Légion, Monarque).
   */
  cta: 'download' | 'subscribe' | 'soon'
  /**
   * Clé de palier ASCII envoyée à `/api/stripe/checkout` — `PlanKey` de
   * `src/lib/stripe/plans.ts`.
   *
   * ⚠️ Distincte de `name` À DESSEIN. `name` est la valeur de `profiles.tier`
   * (`Maître`, avec accent et capitale) ; `plan` est ce qui voyage dans un corps
   * JSON et dans un nom de variable d'environnement, où un accent survit mal.
   * La conversion vit dans `TIER_BY_PLAN`, une seule fois.
   *
   * Obligatoire quand `cta === 'subscribe'`, absent sinon — vérifié par
   * `landing.test.ts` : un palier « à vendre » sans clé produirait un bouton
   * qui échoue au clic.
   */
  plan?: 'forgeron' | 'maitre'
  popular?: boolean
}

export const PRICING_TIERS: readonly PricingTier[] = [
  { name: 'Apprenti', monthly: 0, annual: 0,  cta: 'download' },
  { name: 'Forgeron', monthly: 3, annual: 30, cta: 'subscribe', plan: 'forgeron' },
  { name: 'Maître',   monthly: 6, annual: 60, cta: 'subscribe', plan: 'maitre', popular: true },
] as const

/**
 * Avantage de l'engagement annuel, exprimé en mois offerts.
 *
 * Ce n'est PAS un chiffre décoratif : 3 €×12 = 36 € contre 30 € annuels (6 € =
 * 2 mois), 6 €×12 = 72 € contre 60 € (12 € = 2 mois). La promesse « 2 mois
 * offerts » est donc exacte au centime pour LES DEUX paliers payants — c'est
 * `landing.test.ts` qui le vérifie contre les montants ci-dessus, et non ce
 * commentaire.
 *
 * Formulé en mois plutôt qu'en pourcentage à dessein : la remise réelle vaut
 * 16,67 %, qu'aucun arrondi n'exprime honnêtement (« −17 % » la surestime,
 * « −16 % » la sous-estime). Le nombre de mois, lui, tombe juste.
 */
export const FREE_MONTHS_ON_ANNUAL = 2

/**
 * Mois offerts pour un palier donné — `null` si le palier est gratuit (aucune
 * remise possible) ou si l'écart ne tombe pas sur un nombre entier de mois.
 *
 * Sert au test de cohérence : si un prix annuel change sans que la promesse
 * affichée suive, la suite échoue au lieu de laisser passer une remise fausse.
 */
export function freeMonthsOnAnnual(tier: PricingTier): number | null {
  if (tier.monthly <= 0) return null
  const saved = tier.monthly * 12 - tier.annual
  const months = saved / tier.monthly
  return Number.isInteger(months) ? months : null
}
