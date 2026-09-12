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

describe('🔴 emplacements publicitaires — où, et dans quel ordre', () => {
  const uses = (src: string) => src.includes('<PublicAdSlot')

  it('/patch-notes et /champions en portent', () => {
    expect(uses(PATCHES), '/patch-notes').toBe(true)
    expect(uses(CHAMPIONS), '/champions').toBe(true)
  })

  it('la vitrine n’en porte AUCUN', () => {
    // Décision inchangée : pas de publicité sur la page qui doit convaincre.
    expect(uses(HOME), '/').toBe(false)
  })

  it('/matches en porte UN, et SOUS le champ de recherche', () => {
    // Décision HORTAL révisée le 2026-09-12 : /matches reçoit de la publicité,
    // en état vide comme en état résultats. Ce qui reste interdit, c'est de la
    // placer AVANT le champ — la page n'a pas d'autre raison d'être que de
    // chercher un joueur, et on ne fait pas payer l'attention avant le service.
    const code = withoutComments(MATCHES)
    expect(code.match(/<PublicAdSlot/g) ?? []).toHaveLength(1)
    expect(code.indexOf('<PublicAdSlot'))
      .toBeGreaterThan(code.indexOf('<PlayerSearchBar'))
    expect(code.indexOf('<PublicAdSlot')).toBeGreaterThan(code.indexOf('Faker#KR1'))
  })

  it('/matches reste désindexée : la pub ne change rien à l’indexation', () => {
    // Les deux décisions sont indépendantes, et leur confusion serait facile.
    expect(MATCHES).toMatch(/robots:\s*\{[^}]*index:\s*false/)
  })

  it('les pages de RÉSULTATS en portent deux, jamais avant le premier match', () => {
    const code = withoutComments(RESULTS)
    expect(code.match(/<PublicAdSlot/g) ?? []).toHaveLength(2)

    // Le premier s'intercale après le 3ᵉ match ; « 0 » le mettrait après le
    // premier, une valeur négative avant toute ligne.
    const after = code.match(/const AD_AFTER_MATCH_INDEX = (\d+)/)
    expect(after, 'AD_AFTER_MATCH_INDEX introuvable').toBeTruthy()
    expect(Number(after![1])).toBeGreaterThanOrEqual(1)

    // Et le second vient bien APRÈS le premier dans le flux de la page.
    const [premier, second] = [...code.matchAll(/<PublicAdSlot[^>]*name="([^"]+)"/g)]
      .map(m => m[1])
    expect(premier).toBe('matches-inline')
    expect(second).toBe('matches-end')
  })

  it('chaque emplacement porte un nom distinct', () => {
    // `name` identifie l'emplacement pour la régie et au débogage : deux
    // emplacements homonymes seraient indiscernables dans les rapports.
    const noms = [MATCHES, RESULTS, PATCHES, CHAMPIONS]
      .flatMap(src => [...withoutComments(src).matchAll(/<PublicAdSlot[^>]*name=[{"]([^"}`]+)/g)]
        .map(m => m[1]))
      .filter(n => !n.includes('$'))   // `patch-notes-${…}` est construit, pas littéral
    expect(new Set(noms).size).toBe(noms.length)
  })

  it('/patch-notes en place deux au maximum, et jamais avant le premier patch', () => {
    const indexes = PATCHES.match(/const AD_AFTER_INDEX = \[([^\]]*)\]/)
    expect(indexes, 'AD_AFTER_INDEX introuvable').toBeTruthy()
    const values = indexes![1].split(',').map(v => Number(v.trim()))
    expect(values.length).toBeLessThanOrEqual(2)
    // Index 0 = après le premier patch seulement ; une valeur négative, ou un
    // emplacement rendu AVANT la boucle, ouvrirait la page sur une publicité.
    for (const v of values) expect(v).toBeGreaterThanOrEqual(1)
  })

  it('/champions n’en place qu’un, en fin de liste', () => {
    expect(CHAMPIONS.match(/<PublicAdSlot/g) ?? []).toHaveLength(1)
    expect(CHAMPIONS).toContain('footer={')
  })
})
