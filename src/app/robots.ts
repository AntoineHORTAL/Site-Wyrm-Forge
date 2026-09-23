import type { MetadataRoute } from 'next'
import { canonical } from '@/lib/site-url'

// ════════════════════════════════════════════════════════════════════════════
//  /robots.txt — ce qu'on laisse explorer, et où trouver le sitemap
// ════════════════════════════════════════════════════════════════════════════
// Tout est ouvert sauf les zones privées. Le site vit de son référencement :
// la liste d'interdictions ci-dessous doit rester COURTE et n'écarter que ce
// qui n'a aucun sens à explorer.

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        // Routes d'API : jamais du contenu, et les explorer consomme du budget
        // de crawl pour des réponses JSON. Couvre aussi le webhook Stripe et le
        // dépôt de demande de suppression de compte.
        '/api/',
        // Retour OAuth : une URL à usage unique, porteuse d'un code.
        '/auth/',
        // Derrière authentification — un robot n'y verra jamais que la vitrine,
        // ce qui produirait un doublon de `/` dans l'index.
        '/profil',
        '/dashboard',
      ],
    },
    sitemap: canonical('/sitemap.xml'),
  }
}

// ⚠️ `/riot-games.html` N'EST PAS dans `disallow`, ET C'EST VOLONTAIRE.
//
// Le fichier est noindex — mais par sa propre balise, `<meta name="robots"
// content="noindex">` en ligne 8 de `public/riot-games.html`. Or une balise ne
// peut être lue que si la page est EXPLORÉE. L'interdire ici produirait
// exactement l'inverse du but recherché : Google ne chargerait plus le fichier,
// ne verrait donc jamais le noindex, et pourrait continuer d'afficher l'URL
// nue dans ses résultats (sans titre ni description) s'il la découvre par un
// lien entrant. « Disallow » veut dire « ne le lis pas », jamais « ne l'indexe
// pas » — les deux sont souvent confondus, et la confusion est ici coûteuse.
//
// Règle générale pour ce dépôt : pour DÉSINDEXER, on pose un noindex (balise
// meta, ou `robots: { index: false }` dans les `metadata` d'une route Next,
// comme `/matches`) et on LAISSE le crawl ouvert. `disallow` ne sert qu'à
// épargner du budget d'exploration sur ce qui n'est pas du contenu.
