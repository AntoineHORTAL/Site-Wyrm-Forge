import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ChampionSummary } from '@/lib/champions-catalog'

/**
 * 🔴 Ce que /champions met dans le HTML SERVI.
 *
 * `champions-catalog.test.ts` vérifie que `NO_FILTERS` ne masque rien ; ici on
 * vérifie que le composant en TIRE réellement du HTML — c'est-à-dire qu'aucun
 * `useEffect`, aucun garde de chargement, aucune pagination ne s'interpose entre
 * la liste reçue en props et le markup.
 *
 * C'est la régression que ce chantier corrige : la page chargeait sa liste dans
 * un `useEffect`, donc le HTML ne contenait qu'une barre de filtres et le mot
 * « Chargement… ». Le robot d'examen AdSense, qui juge sur le HTML brut, l'a
 * classée « contenu à faible valeur informative ».
 *
 * `renderToStaticMarkup` rend le composant avec son état INITIAL, sans exécuter
 * d'effet — exactement ce que fait le serveur.
 */

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) =>
    <a href={href} {...rest}>{children}</a>,
}))

const { default: ChampionsExplorer } = await import('./ChampionsExplorer')

const CHAMPIONS: ChampionSummary[] = [
  { id: 'Aatrox', name: 'Aatrox', title: "l'épée des Darkin", image: 'Aatrox.png', tags: ['Fighter'], difficulty: 4 },
  { id: 'Braum', name: 'Braum', title: 'le cœur du Freljord', image: 'Braum.png', tags: ['Support', 'Tank'], difficulty: 3 },
  { id: 'Zed', name: 'Zed', title: 'le maître des ombres', image: 'Zed.png', tags: ['Assassin'], difficulty: 9 },
]

const render = (extra?: Partial<{ footer: React.ReactNode }>) => renderToStaticMarkup(
  <ChampionsExplorer champions={CHAMPIONS} version="15.10.1" {...extra} />,
)

describe('/champions — la liste est dans le HTML servi', () => {
  it('rend TOUS les champions au premier rendu, sans effet', () => {
    const html = render()
    for (const c of CHAMPIONS) expect(html, c.name).toContain(c.name)
  })

  it('ne rend AUCUN état de chargement', () => {
    // Le symptôme exact du refus AdSense.
    expect(render()).not.toMatch(/Chargement/i)
  })

  it('donne un LIEN suivable par champion, pas un div cliquable', () => {
    // Un `div onClick` + `router.push` n'est pas suivable sans JavaScript : les
    // 170 fiches de champions étaient invisibles pour un robot. Ce sont
    // désormais les seuls chemins vers `/champion/[id]`.
    const html = render()
    for (const c of CHAMPIONS) expect(html, c.id).toContain(`href="/champion/${c.id}"`)
    expect(html.match(/href="\/champion\//g) ?? []).toHaveLength(CHAMPIONS.length)
  })

  it('décrit chaque vignette pour les lecteurs d’écran et les robots', () => {
    // `alt` = nom + titre du champion : du TEXTE, là où il n'y avait qu'une image.
    expect(render()).toContain('alt="Braum, le cœur du Freljord"')
  })

  it('annonce le nombre de champions, sans mention « sur N » quand rien n’est filtré', () => {
    const html = render()
    expect(html).toContain('3 champions')
    expect(html).not.toContain('sur 3')
  })

  it('rend l’emplacement passé par le serveur APRÈS la grille', () => {
    const html = render({ footer: <div id="pub-fin" /> })
    expect(html.indexOf('pub-fin')).toBeGreaterThan(html.lastIndexOf('href="/champion/'))
  })

  it('reste utilisable sans JavaScript : les filtres n’effacent pas la liste', () => {
    // Les contrôles sont rendus, mais l'état initial n'en applique aucun — un
    // navigateur sans JS montre la liste entière ET la barre de filtres inerte,
    // jamais une page vide.
    const html = render()
    expect(html).toContain('Rechercher un champion')
    expect(html).toContain('Combattant')
    expect(html).toContain('Aatrox')
  })
})
