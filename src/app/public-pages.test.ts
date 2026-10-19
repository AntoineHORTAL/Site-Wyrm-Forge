import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * Les quatre pages publiques, vues du chantier AdSense du 2026-09-12.
 *
 * Motif de refus : « contenu à faible valeur informative ». Le diagnostic,
 * fait en récupérant le HTML sans exécuter de JavaScript, tenait en trois
 * points — `/` et `/champions` ne servaient qu'une coquille, `/matches` est un
 * outil sans contenu, `/patch-notes` était déjà bon.
 *
 * Ces vérifications sont volontairement faites sur la SOURCE, pas sur un rendu :
 * ce qu'elles protègent n'est pas un affichage mais une décision d'architecture
 * (« cette page est rendue par le serveur », « celle-ci n'est pas indexée »),
 * qu'un rendu de composant ne peut pas observer. Le rendu, lui, est vérifié
 * ailleurs — `ChampionsExplorer.test.tsx` et `About.test.tsx`.
 *
 * Même approche que `legal.test.ts`, qui relit `SiteHeader.tsx` pour vérifier
 * qu'aucune route légale n'y est masquée.
 */

const read = (p: string) => readFileSync(path.resolve(__dirname, p), 'utf8')

/**
 * Source débarrassée de ses commentaires.
 *
 * Indispensable ici : les commentaires de ces pages CITENT ce qu'on leur
 * interdit (« la page rendait "Chargement..." »). Chercher la chaîne dans la
 * source brute ferait échouer le test sur sa propre documentation.
 */
const withoutComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ')

const CHAMPIONS = read('champions/page.tsx')
const MATCHES   = read('matches/page.tsx')
const HOME      = read('page.tsx')
const PATCHES   = read('patch-notes/page.tsx')
const RESULTS   = read('matches/[region]/[riotId]/page.tsx')
const GUIDE     = read('guide/page.tsx')

describe('🔴 /champions est rendue par le SERVEUR', () => {
  it('la page n’est plus un composant client', () => {
    // Elle l'était, et chargeait `champion.json` dans un `useEffect` : le HTML
    // servi ne contenait qu'une barre de filtres et « Chargement… ».
    expect(CHAMPIONS.trimStart().startsWith("'use client'")).toBe(false)
  })

  it('elle lit le catalogue avant de rendre', () => {
    expect(CHAMPIONS).toContain('await fetchChampionCatalog()')
  })

  it('elle déclare une régénération, donc reste prérendue', () => {
    // Sans `revalidate`, un `fetch` non caché ferait basculer la route en rendu
    // dynamique (`ƒ`) : la page repartirait chercher DDragon à chaque visite.
    expect(CHAMPIONS).toMatch(/export const revalidate = \d+/)
  })

  it('l’interactivité est un îlot client PAR-DESSUS la liste', () => {
    expect(CHAMPIONS).toContain('<ChampionsExplorer')
    expect(CHAMPIONS).toContain('champions={champions}')
  })
})

describe('🔴 / sert la vitrine sans attendre la session', () => {
  it('ne court-circuite plus sur `loading`', () => {
    // `loading` vaut `true` au rendu serveur : un `if (loading) return <spinner>`
    // faisait que le HTML de la page d'accueil ne contenait QUE « Chargement... ».
    const code = withoutComments(HOME)
    expect(code).not.toMatch(/if\s*\(\s*loading\s*\)/)
    expect(code).not.toContain('Chargement...')
  })

  it('rend la vitrine dès qu’aucun utilisateur n’est résolu', () => {
    expect(HOME).toMatch(/return user \? \(/)
  })

  it('monte la section éditoriale', () => {
    expect(HOME).toContain('<About />')
  })
})

describe('🔴 /matches n’est plus proposée à l’indexation', () => {
  it('déclare noindex', () => {
    expect(MATCHES).toMatch(/robots:\s*\{[^}]*index:\s*false/)
  })

  it('laisse suivre les liens vers les résultats', () => {
    // `nofollow` couperait le seul chemin vers `/matches/[region]/[riotId]`,
    // qui portent, eux, de vraies données de parties.
    expect(MATCHES).toMatch(/robots:\s*\{[^}]*follow:\s*true/)
  })

  it('reste une page normale par ailleurs', () => {
    expect(MATCHES).toContain('<PlayerSearchBar')
  })
})

describe('🔴 aucune publicité sur les pages publiques', () => {
  // Décision HORTAL du 2026-10-19 : la publicité ne vit que dans le dashboard,
  // pour le palier Apprenti (colonne `DashboardAdRail`). Les emplacements de
  // /patch-notes, /champions, /matches et des pages de résultats ont été
  // retirés avec `PublicAdSlot` et `shouldShowPublicAds`.
  it.each([
    ['/', () => HOME],
    ['/patch-notes', () => PATCHES],
    ['/champions', () => CHAMPIONS],
    ['/matches', () => MATCHES],
    ['/matches/[region]/[riotId]', () => RESULTS],
    ['/guide', () => GUIDE],
  ])('%s ne porte aucun emplacement', (_, src) => {
    expect(withoutComments(src())).not.toMatch(/AdSlot|AdRail|adsbygoogle/)
  })
})

describe('🔴 /guide est rendue par le SERVEUR et indexable', () => {
  it('la page n’est pas un composant client', () => {
    expect(GUIDE.trimStart().startsWith("'use client'")).toBe(false)
  })

  it('aucune directive noindex — contrairement à /riot-games.html', () => {
    expect(withoutComments(GUIDE)).not.toMatch(/noindex|index:\s*false/)
  })

  it('metadata produites par la langue lue côté serveur', () => {
    expect(GUIDE).toContain('export async function generateMetadata')
    expect(GUIDE).toContain('guideMetadata(')
    expect(GUIDE).toContain('langFromParam(')
  })

  it('flags lus par le fetch public, jamais par cookies()', () => {
    // Même correctif SEO que les gardes de /matches et /live : la lecture serveur
    // des flags passe par `readPublicFlags` (fetch + revalidate), pas par le
    // client Supabase serveur qui appelle `cookies()`.
    const code = withoutComments(GUIDE)
    expect(code).toContain('readPublicFlags(')
    expect(code).not.toMatch(/cookies\(|isFlagEnabledServer|supabase\/server/)
  })
})

describe('/guide — zone sûre des écrans à encoche (viewport-fit=cover)', () => {
  const css = read('globals.css')
  const footer = read('../components/landing/Footer.tsx')

  it('la page active viewport-fit=cover', () => {
    expect(GUIDE).toMatch(/viewportFit:\s*'cover'/)
  })

  it('le conteneur garde sa marge et s’élargit à la zone sûre (max, gauche et droite)', () => {
    expect(css).toContain('padding-left: max(clamp(16px, 5vw, 64px), env(safe-area-inset-left, 0px));')
    expect(css).toContain('padding-right: max(clamp(16px, 5vw, 64px), env(safe-area-inset-right, 0px));')
  })

  it('header et footer élargis sur /guide SEULEMENT', () => {
    expect(css).toMatch(
      /body:has\(\.guide-main\) \.wf-nav,\s*body:has\(\.guide-main\) \.land-footer \{\s*padding-left: max\(32px, env\(safe-area-inset-left, 0px\)\);\s*padding-right: max\(32px, env\(safe-area-inset-right, 0px\)\);/,
    )
  })

  it('le footer n’a plus de marge latérale inline, sinon le CSS ne pourrait pas l’élargir', () => {
    expect(footer).toContain('className="land-footer"')
    expect(footer).not.toMatch(/padding:\s*'56px 32px 32px'/)
  })
})
