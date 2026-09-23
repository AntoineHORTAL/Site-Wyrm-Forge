import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

/**
 * Le verrou qui manquait au sitemap : `src/app/` et `STATIC_ROUTES` ne peuvent
 * plus diverger en silence.
 *
 * Le sitemap est une liste écrite à la main. Rien, dans Next, ne signale qu'une
 * page publique vient d'être créée sans y être inscrite — le build passe, la
 * page se sert normalement, et elle reste simplement invisible à l'indexation.
 * C'est une panne sans symptôme, exactement la classe de bug que ce dépôt
 * documente ailleurs (le `duration` / `gameDuration` de PostGame, la clé de
 * cache de `harvestRankStats`).
 *
 * Même méthode que `public-pages.test.ts`, et pour la même raison : on lit la
 * SOURCE, pas un rendu. Ce qui est protégé ici n'est pas un affichage, c'est une
 * décision d'architecture (« cette page est proposée à l'indexation », « celle-là
 * est volontairement exclue »), qu'aucun rendu de composant ne peut observer.
 *
 * ⚠️ Le test ne juge JAMAIS si une exclusion est justifiée — il exige seulement
 * qu'elle soit DÉCLARÉE. Ajouter une route publique laisse donc deux issues, et
 * aucune n'est le silence : l'inscrire au sitemap, ou l'inscrire ci-dessous.
 */

const APP_DIR = __dirname

/**
 * Routes publiques volontairement absentes du sitemap, parce qu'elles portent un
 * `noindex`. Une entrée ici doit AUSSI déclarer `index: false` dans ses
 * `metadata` — le test le vérifie plus bas : « hors du sitemap » et
 * « désindexée » sont deux gestes distincts, et n'en faire qu'un laisserait la
 * page indexable tout en la cachant du plan du site.
 */
const EXCLUDED_NOINDEX = [
  '/matches', // page-OUTIL, vide hors saisie d'un Riot ID (chantier AdSense, 2026-09-12)
]

/** Routes publiques exclues parce qu'elles sont derrière authentification. */
const EXCLUDED_PRIVATE = [
  '/profil',
]

const EXCLUDED = [...EXCLUDED_NOINDEX, ...EXCLUDED_PRIVATE]

/**
 * Les routes STATIQUES qui ont un `page.tsx`, telles que Next les sert.
 *
 * Écartés du parcours, et chacun pour un motif différent :
 *   • `[...]` — segment dynamique : l'URL dépend de la saisie, elle n'a pas sa
 *     place dans une liste statique (les fiches de champions entrent au sitemap
 *     par l'autre chemin, `fetchChampionCatalog`) ;
 *   • `api/` — des `route.ts`, jamais du contenu ;
 *   • `_*` et `(…)` — conventions Next : dossier privé, et groupe de routes qui
 *     n'ajoute AUCUN segment à l'URL (d'où le segment vide, et non son nom).
 */
function staticPageRoutes(dir: string = APP_DIR, prefix = ''): string[] {
  const out: string[] = []

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (entry.name.startsWith('[')) continue
      if (entry.name.startsWith('_')) continue
      if (entry.name === 'api') continue
      const segment = entry.name.startsWith('(') ? '' : `/${entry.name}`
      out.push(...staticPageRoutes(path.join(dir, entry.name), prefix + segment))
    } else if (entry.name === 'page.tsx') {
      out.push(prefix === '' ? '/' : prefix)
    }
  }

  return out.sort()
}

const SITEMAP_SRC = readFileSync(path.join(APP_DIR, 'sitemap.ts'), 'utf8')

/** Les chemins déclarés dans `STATIC_ROUTES`, lus dans la source du sitemap. */
const sitemapPaths = [...SITEMAP_SRC.matchAll(/\{\s*path:\s*'([^']+)'/g)].map(m => m[1])

const routes = staticPageRoutes()

describe('🔴 sitemap ↔ src/app : aucune page publique oubliée', () => {
  it('le parcours de `src/app/` trouve bien des routes', () => {
    // Garde-fou de l'instrument : si le walker cassait (renommage de `page.tsx`,
    // déplacement du test), tous les autres cas passeraient pour de mauvaises
    // raisons — une liste vide satisfait « toutes les routes sont couvertes ».
    expect(routes.length).toBeGreaterThanOrEqual(8)
    expect(routes).toContain('/')
  })

  it('chaque route statique est soit au sitemap, soit exclue explicitement', () => {
    const missing = routes.filter(r => !sitemapPaths.includes(r) && !EXCLUDED.includes(r))
    expect(
      missing,
      `Route(s) publique(s) ni inscrite(s) au sitemap ni déclarée(s) comme exclue(s) : `
      + `${missing.join(', ')}. Ajoute-la à STATIC_ROUTES (src/app/sitemap.ts) ou, si elle `
      + `ne doit pas être indexée, à EXCLUDED_NOINDEX / EXCLUDED_PRIVATE dans ce test.`,
    ).toEqual([])
  })

  it('aucune entrée du sitemap ne pointe une page qui n’existe pas', () => {
    // Le sens inverse : une route supprimée (tournois, prac) laisserait une URL
    // morte dans le sitemap, ce qui dégrade la confiance accordée au fichier
    // entier — Google sanctionne les sitemaps qui renvoient des 404.
    const orphans = sitemapPaths.filter(p => !routes.includes(p))
    expect(orphans, `Chemin(s) au sitemap sans page.tsx : ${orphans.join(', ')}`).toEqual([])
  })

  it('aucun doublon dans le sitemap', () => {
    expect(new Set(sitemapPaths).size).toBe(sitemapPaths.length)
  })
})

describe('🔴 les exclusions restent vraies', () => {
  it('chaque route exclue existe encore', () => {
    // Sans ça, la liste d'exclusions pourrit : une route renommée y resterait et
    // masquerait plus tard un vrai oubli portant le même nom.
    const stale = EXCLUDED.filter(p => !routes.includes(p))
    expect(stale, `Exclusion(s) qui ne correspondent à aucune route : ${stale.join(', ')}`)
      .toEqual([])
  })

  it('une route exclue pour noindex déclare bien `index: false`', () => {
    for (const route of EXCLUDED_NOINDEX) {
      const src = readFileSync(path.join(APP_DIR, route.slice(1), 'page.tsx'), 'utf8')
      expect(src, `${route} est hors sitemap au titre du noindex, mais ne le déclare pas`)
        .toMatch(/robots:\s*\{[^}]*index:\s*false/)
    }
  })
})

describe('🔴 le sitemap parle de la bonne origine', () => {
  it('il passe par `canonical`, jamais par une URL en dur ni par l’environnement', () => {
    expect(SITEMAP_SRC).toContain("from '@/lib/site-url'")
    // Une origine recopiée en dur ici divergerait de robots.ts et de
    // metadataBase au premier changement de domaine ; et `NEXT_PUBLIC_SITE_URL`
    // ferait publier des URL de preview Vercel (cf. l'en-tête de site-url.ts).
    expect(SITEMAP_SRC).not.toMatch(/'https:\/\/wyrm-forge\.com/)
    expect(SITEMAP_SRC).not.toContain('NEXT_PUBLIC_SITE_URL')
  })
})
