import 'server-only'
import Stripe from 'stripe'
import { priceEnvKey, type PriceEnv } from './plans'

/**
 * Accès au SDK Stripe et aux secrets qui vont avec — côté serveur uniquement.
 *
 * ⚠️ `import 'server-only'` en tête : ce module lit `STRIPE_SECRET_KEY`. Sans ce
 * garde, un `import` depuis un composant client compilerait sans broncher et
 * expédierait la clé secrète dans le bundle du navigateur. Le garde transforme
 * cette faute en **erreur de build**, ce qu'une convention de nommage ne fait pas.
 *
 * ⚠️ Ne PAS confondre avec `plans.ts`, module PUR importable partout : c'est là
 * que vit la logique (paliers, prix, politique de statut), et c'est là qu'elle
 * est testée. Ici, il n'y a que de la plomberie — rien qui décide.
 */

/**
 * Lit une variable d'environnement OBLIGATOIRE, ou échoue.
 *
 * Pendant Next.js de `requireSecret` (`supabase/functions/_shared/auth.ts`), et
 * même compromis : le nom manquant part dans les **logs serveur**, jamais dans
 * le message d'erreur — celui-ci peut finir dans une réponse HTTP, et l'énoncé
 * des variables attendues renseigne un attaquant sur ce qui existe.
 *
 * ⚠️ Aucun secret ne figure en dur dans ce dépôt : `.env*` est dans `.gitignore`
 * (ligne « env files »), les variables vivent dans Vercel côté déploiement et
 * dans `.env.local` en local. Même règle que la sortie du token `prac-notify`
 * du catalogue Postgres (`20260901000001`) : un secret ne se lit qu'au moment
 * où on s'en sert, jamais depuis un endroit qui se versionne ou se dumpe.
 */
export function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value || value.trim().length === 0) {
    console.error(`[stripe] variable d'environnement manquante : ${name}`)
    throw new Error('Configuration serveur incomplète.')
  }
  return value.trim()
}

/**
 * Instance Stripe partagée, construite À LA DEMANDE.
 *
 * Surtout pas un `new Stripe(process.env.STRIPE_SECRET_KEY!)` au niveau module :
 * Next évalue les modules de route au BUILD (collecte des routes), et un build
 * Vercel sans la variable — une preview, un premier déploiement — échouerait
 * alors sur une clé absente, pour une route qui n'est même pas appelée. Lazy,
 * l'absence ne se manifeste qu'à l'appel réel, là où elle a un sens.
 *
 * `apiVersion` volontairement NON précisée : le SDK envoie alors la version
 * qu'il embarque et pour laquelle ses types sont générés. La figer à une chaîne
 * écrite à la main, c'est prendre le risque qu'elle diverge des types du paquet
 * à la prochaine montée de version — et le TypeScript ne le dirait pas.
 */
let cached: Stripe | null = null

export function getStripe(): Stripe {
  if (!cached) {
    cached = new Stripe(requireEnv('STRIPE_SECRET_KEY'), {
      // Identifie nos appels dans le journal du Dashboard Stripe.
      appInfo: { name: 'Wyrm Forge', url: 'https://wyrm-forge.com' },
    })
  }
  return cached
}

/**
 * Le catalogue de prix, tel que `plans.ts` sait le lire.
 *
 * Les quatre variables sont écrites LITTÉRALEMENT plutôt que composées par
 * `priceEnvKey` dans une boucle. Pas par superstition — un accès dynamique
 * fonctionne bien côté serveur, contrairement au piège `NEXT_PUBLIC_*` documenté
 * dans `environment.ts` — mais parce qu'un `grep STRIPE_PRICE_` doit retrouver
 * l'inventaire exact de ce qu'il faut configurer sur Vercel. Une clé composée à
 * l'exécution n'apparaît nulle part.
 *
 * L'assertion en dessous relie quand même les deux formes : si un nom de
 * variable est renommé ici sans l'être dans `priceEnvKey`, le test le voit.
 */
export function priceEnv(): PriceEnv {
  return {
    STRIPE_PRICE_FORGERON_MENSUEL: process.env.STRIPE_PRICE_FORGERON_MENSUEL,
    STRIPE_PRICE_FORGERON_ANNUEL:  process.env.STRIPE_PRICE_FORGERON_ANNUEL,
    STRIPE_PRICE_MAITRE_MENSUEL:   process.env.STRIPE_PRICE_MAITRE_MENSUEL,
    STRIPE_PRICE_MAITRE_ANNUEL:    process.env.STRIPE_PRICE_MAITRE_ANNUEL,
  }
}

/** Les quatre noms attendus, dérivés de `priceEnvKey` — sert au diagnostic. */
export const REQUIRED_PRICE_ENV_KEYS = [
  priceEnvKey('forgeron', 'mensuel'),
  priceEnvKey('forgeron', 'annuel'),
  priceEnvKey('maitre',   'mensuel'),
  priceEnvKey('maitre',   'annuel'),
] as const

/**
 * Origine de confiance pour les URL de retour de Checkout.
 *
 * Repris tel quel de `src/app/auth/callback/route.ts` — et pour la même raison :
 * **jamais** l'origine tirée de `request.url`, qui suit un header `Host` que
 * l'appelant contrôle. Ici l'enjeu est plus direct encore : `success_url` est
 * l'adresse vers laquelle Stripe renvoie quelqu'un qui vient de payer.
 */
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
