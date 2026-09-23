// ════════════════════════════════════════════════════════════════════════════
//  site-url — l'origine CANONIQUE du site
// ════════════════════════════════════════════════════════════════════════════
// Une seule source pour les trois surfaces qui annoncent au monde extérieur où
// vit le site : `app/sitemap.ts`, `app/robots.ts` et le `metadataBase` du layout
// racine. Les trois doivent dire exactement la même chose — un sitemap servi sur
// un domaine et listant des URL d'un autre est ignoré par Google.
//
// 🔴 CE N'EST PAS `SITE_URL` (`src/lib/stripe/server.ts`), ET IL NE FAUT PAS LES
// CONFONDRE. Celui-là vaut `process.env.NEXT_PUBLIC_SITE_URL ?? localhost:3000`
// et répond à « vers où renvoyer CET utilisateur-ci après un paiement » — donc
// l'origine du déploiement courant, preview comprise, ce qui est exactement ce
// qu'on veut pour un retour de Checkout.
//
// Ici la question est l'inverse : « quelle adresse le site déclare-t-il aux
// moteurs de recherche ? ». La réponse ne dépend d'aucun déploiement. Prise dans
// l'environnement, elle produirait, depuis une preview Vercel, un sitemap et un
// robots.txt pleins d'URL `*.vercel.app` — des adresses publiées à
// l'indexation, concurrentes de la production sur son propre contenu. Et sur un
// `next build` local sans la variable, un sitemap pointant `localhost:3000`.
//
// D'où une CONSTANTE, écrite en clair et volontairement non configurable.

/** Origine de production, sans slash final. */
export const CANONICAL_ORIGIN = 'https://wyrm-forge.com'

/**
 * URL absolue d'un chemin du site.
 *
 * `path` commence par `/` ; `'/'` rend l'origine nue (`https://wyrm-forge.com`)
 * et non `https://wyrm-forge.com/`, pour que la page d'accueil ne figure pas
 * sous deux adresses dans le sitemap.
 */
export function canonical(path: string): string {
  return path === '/' ? CANONICAL_ORIGIN : `${CANONICAL_ORIGIN}${path}`
}
