import type { MetadataRoute } from 'next'
import { fetchChampionCatalog } from '@/lib/champions-catalog'
import { canonical } from '@/lib/site-url'
import { guideLanguageAlternates } from '@/lib/guide-seo'

// ════════════════════════════════════════════════════════════════════════════
//  /sitemap.xml — les pages PUBLIQUES du site, et elles seules
// ════════════════════════════════════════════════════════════════════════════
// Suite du chantier AdSense du 2026-09-12, qui a rendu `/` et `/champions`
// réellement servies par le serveur : il y a désormais quelque chose à proposer
// à l'indexation, donc un sitemap a un sens.
//
// 🔴 LA RÈGLE D'ADMISSION : une URL n'entre ici que si elle est (1) publique,
// (2) stable, et (3) proposée à l'indexation. Les trois conditions, pas deux.
//
// Ce qui est EXCLU, et pourquoi — à relire avant d'ajouter quoi que ce soit :
//
//   • `/matches` — porte `robots: { index: false, follow: true }` depuis le
//     2026-09-12 (page-OUTIL, vide hors saisie d'un Riot ID). L'inscrire ici
//     demanderait à Google d'indexer une page qu'on lui demande par ailleurs de
//     ne pas indexer : le sitemap perdrait sa crédibilité, pas seulement cette
//     ligne. Les deux déclarations doivent rester cohérentes.
//   • `/matches/[region]/[riotId]`, `/summoner/…`, `/live/…`, `/match/…` —
//     espace d'URL INFINI, piloté par ce que tape un visiteur. Non énumérable
//     par construction ; ces pages se découvrent par les liens (d'où le
//     `follow: true` de `/matches`, qui est le seul chemin vers elles).
//   • `/profil`, `/dashboard` — derrière authentification.
//   • `/auth/callback`, `/api/*` — techniques, jamais du contenu.
//   • `/riot-games.html` — noindex VOLONTAIRE, porté par sa propre balise
//     `<meta name="robots" content="noindex">` (ligne 8 du fichier). Absent
//     d'ici, et — c'est le point subtil — délibérément PAS interdit dans
//     `robots.ts` : voir l'explication là-bas.
//   • `/tournois*`, `/prac*` — supprimés (404 net, 2026-09-03 et 2026-09-11).
//
// ⚠️ Les patch notes n'ont PAS d'URL individuelle : `src/app/patch-notes/` ne
// contient qu'un `page.tsx` qui rend les 20 derniers patchs publiés dans un
// seul document (chaque patch est un `<article>`, sans ancre ni route propre).
// Il n'y a donc RIEN à générer depuis Supabase ici, et ce fichier ne lit pas la
// base du tout. Le jour où `/patch-notes/[version]` existera, c'est ici que la
// lecture Supabase viendra — voir le chantier noté dans `AGENTS.md`.

/**
 * Régénération horaire, alignée sur `/champions`.
 *
 * `sitemap.ts` est un Route Handler caché par défaut ; sans `revalidate`, la
 * liste des champions serait figée au build et un champion sorti entre deux
 * déploiements n'entrerait jamais dans le sitemap. Une heure est la même
 * cadence que `fetchChampionCatalog` (`next: { revalidate: 3600 }`) : les deux
 * caches respirent ensemble plutôt que de se désynchroniser.
 */
export const revalidate = 3600

type ChangeFrequency = NonNullable<MetadataRoute.Sitemap[number]['changeFrequency']>

/**
 * Les 9 pages publiques stables.
 *
 * ⚠️ `lastModified` est volontairement ABSENT de tout ce fichier. On n'a aucune
 * date de modification honnête à donner : un `new Date()` changerait à chaque
 * régénération horaire et annoncerait une mise à jour qui n'a pas eu lieu —
 * Google traite un `lastmod` qui bouge sans raison comme un signal à ignorer,
 * pour le site entier. Pas de date vaut mieux qu'une fausse. (Les pages légales
 * portent bien une date, dans leur dictionnaire `updated` ; l'y brancher
 * tirerait les quatre documents dans cette route pour un gain nul, la date de
 * `/cgv` étant déjà affichée sur la page.)
 */
const STATIC_ROUTES: ReadonlyArray<{
  path: string
  changeFrequency: ChangeFrequency
  priority: number
  /** Versions par langue (`hreflang`), pour la seule page qui en a : `/guide`. */
  languages?: Record<string, string>
}> = [
  // La vitrine : ce qu'on veut voir remonter en premier.
  { path: '/',                 changeFrequency: 'weekly',  priority: 1.0 },
  // Contenu éditorial renouvelé à chaque patch — le meilleur du site côté SEO.
  { path: '/patch-notes',      changeFrequency: 'weekly',  priority: 0.9 },
  { path: '/champions',        changeFrequency: 'weekly',  priority: 0.8 },
  { path: '/about',            changeFrequency: 'monthly', priority: 0.5 },
  // Guide utilisateur, FR (`/guide`) et EN (`/guide?lang=en`, rendu serveur) :
  // l'anglais n'a pas d'entrée propre, il est déclaré en alternative de langue.
  { path: '/guide',            changeFrequency: 'monthly', priority: 0.7, languages: guideLanguageAlternates() },
  // Pages légales : rarement modifiées, mais elles doivent être trouvables.
  { path: '/cgu',              changeFrequency: 'yearly',  priority: 0.3 },
  { path: '/cgv',              changeFrequency: 'yearly',  priority: 0.3 },
  { path: '/confidentialite',  changeFrequency: 'yearly',  priority: 0.3 },
  { path: '/mentions-legales', changeFrequency: 'yearly',  priority: 0.3 },
]

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Même source que `/champions`, donc même liste, sans second appel réseau
  // réel : le cache `fetch` de Next est partagé entre les deux routes.
  //
  // ⚠️ `fetchChampionCatalog` ne lève jamais — DDragon injoignable rend un
  // catalogue VIDE. C'est la dégradation voulue : le sitemap perd ses fiches de
  // champions pour une heure et garde ses 9 pages, là où une exception ferait
  // répondre 500 à `/sitemap.xml` et retirerait le site entier de l'index.
  const { champions } = await fetchChampionCatalog()

  return [
    ...STATIC_ROUTES.map(({ path, changeFrequency, priority, languages }) => ({
      url: canonical(path),
      changeFrequency,
      priority,
      ...(languages ? { alternates: { languages } } : {}),
    })),

    // ── Les ~170 fiches de champions ─────────────────────────────────────────
    // Décision HORTAL du 2026-09-23 (option a) : on les inscrit MAINTENANT,
    // sans attendre leur passage en Server Component.
    //
    // ⚠️ À savoir avant d'interpréter les résultats : `/champion/[id]` est
    // encore `'use client'` + `useEffect`, donc son HTML servi est VIDE — le
    // contenu n'apparaît qu'après exécution du JavaScript. Google sait rendre le
    // JS, mais dans une seconde passe qui peut tarder ; les indexer vite est
    // justement ce qui met la file d'attente en route. Si ces pages remontent
    // mal, ce n'est PAS le sitemap qu'il faut corriger, c'est le rendu — le
    // chantier est noté dans `AGENTS.md`.
    ...champions.map(c => ({
      // Les `id` DDragon sont de l'ASCII (`Aatrox`, `KhaZix`, `MonkeyKing`),
      // l'encodage ne change rien aujourd'hui ; il est là pour que la ligne
      // reste juste si Riot publiait un jour un id moins sage.
      url: canonical(`/champion/${encodeURIComponent(c.id)}`),
      changeFrequency: 'monthly' as const,
      priority: 0.6,
    })),
  ]
}
