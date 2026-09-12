import { describe, it, expect } from 'vitest'
import {
  DIFFICULTY_BOUNDS, NO_FILTERS, filterChampions, normalizeName, parseChampionCatalog,
  type ChampionSummary,
} from './champions-catalog'

/**
 * Le catalogue de /champions.
 *
 * Ce module est né du passage de la page en rendu SERVEUR : la liste et les
 * filtres vivaient dans le composant, où rien n'était testable. Deux familles
 * de propriétés méritent d'être verrouillées :
 *
 *   • le PARSING de `champion.json` doit être tolérant — DDragon est une
 *     dépendance externe, et une entrée inattendue ne doit pas faire tomber une
 *     page publique entière ;
 *   • `NO_FILTERS` doit rendre la liste COMPLÈTE. C'est l'état du premier rendu,
 *     donc ce que contient le HTML servi : si un filtre par défaut s'y glissait,
 *     la page redeviendrait la coquille à demi vide que l'examen AdSense a
 *     refusée, sans que rien ne le signale.
 */

function champ(over: Partial<ChampionSummary> & { name: string }): ChampionSummary {
  return {
    id: over.name, title: '', image: `${over.name}.png`, tags: [], difficulty: 5, ...over,
  }
}

const SAMPLE: ChampionSummary[] = [
  champ({ name: 'Aatrox', tags: ['Fighter'], difficulty: 4 }),
  champ({ name: 'Braum', tags: ['Support', 'Tank'], difficulty: 3 }),
  champ({ name: 'Séraphine', tags: ['Mage', 'Support'], difficulty: 2 }),
  champ({ name: 'Zed', tags: ['Assassin'], difficulty: 9 }),
]

describe('parsing du catalogue DDragon', () => {
  it('lit les champs utiles et trie par nom', () => {
    const out = parseChampionCatalog({
      data: {
        Zed:    { id: 'Zed', name: 'Zed', title: 'le maître des ombres', image: { full: 'Zed.png' }, tags: ['Assassin'], info: { difficulty: 9 } },
        Aatrox: { id: 'Aatrox', name: 'Aatrox', title: "l'épée des Darkin", image: { full: 'Aatrox.png' }, tags: ['Fighter'], info: { difficulty: 4 } },
      },
    })
    expect(out.map(c => c.name)).toEqual(['Aatrox', 'Zed'])
    expect(out[0]).toMatchObject({ id: 'Aatrox', image: 'Aatrox.png', difficulty: 4, tags: ['Fighter'] })
  })

  it('ignore une entrée mal formée plutôt que de tout faire échouer', () => {
    // Une page publique doit rester lisible même si Riot publie un champion au
    // format inattendu : on perd UNE vignette, pas la page.
    const out = parseChampionCatalog({
      data: {
        ok:      { id: 'Ahri', name: 'Ahri', image: { full: 'Ahri.png' }, tags: ['Mage'], info: { difficulty: 5 } },
        sansNom: { id: 'Mystere' },
        nul:     null,
        chaine:  'pas un objet',
      },
    })
    expect(out.map(c => c.name)).toEqual(['Ahri'])
  })

  it('comble les champs absents par des valeurs sûres', () => {
    const [c] = parseChampionCatalog({ data: { x: { id: 'Sett', name: 'Sett' } } })
    expect(c).toMatchObject({ image: 'Sett.png', tags: [], difficulty: 0, title: '' })
  })

  it('rend une liste vide sur une réponse inexploitable', () => {
    for (const raw of [null, undefined, {}, { data: null }, { data: 'x' }, 42]) {
      expect(parseChampionCatalog(raw), JSON.stringify(raw)).toEqual([])
    }
  })
})

describe('recherche insensible aux accents', () => {
  it('trouve « Séraphine » en tapant « sera »', () => {
    expect(normalizeName('Séraphine')).toBe('seraphine')
    const out = filterChampions(SAMPLE, { ...NO_FILTERS, query: 'sera' })
    expect(out.map(c => c.name)).toEqual(['Séraphine'])
  })

  it('ignore la casse et les espaces autour', () => {
    expect(filterChampions(SAMPLE, { ...NO_FILTERS, query: '  BRAUM ' }).map(c => c.name))
      .toEqual(['Braum'])
  })
})

describe('🔴 l’état initial rend la liste COMPLÈTE', () => {
  it('sans filtre, aucun champion n’est masqué', () => {
    // C'est l'état du rendu SERVEUR — donc le HTML que voient un visiteur sans
    // JavaScript et le robot d'examen AdSense. Un filtre par défaut, une
    // pagination « 24 premiers », et la page redevient une coquille.
    const out = filterChampions(SAMPLE, NO_FILTERS)
    expect(out).toHaveLength(SAMPLE.length)
  })

  it('sans filtre, l’ordre est alphabétique français', () => {
    expect(filterChampions(SAMPLE, NO_FILTERS).map(c => c.name))
      .toEqual(['Aatrox', 'Braum', 'Séraphine', 'Zed'])
  })

  it('ne mute jamais la liste reçue', () => {
    // Le tableau vient du serveur et sert à TOUS les filtrages suivants : le
    // trier en place ferait dépendre chaque résultat du précédent.
    const source = [...SAMPLE]
    filterChampions(source, { ...NO_FILTERS, sortBy: 'diff-desc' })
    filterChampions(source, { ...NO_FILTERS, query: 'zed' })
    expect(source).toEqual(SAMPLE)
  })
})

describe('filtres', () => {
  it('les classes se cumulent en OU, pas en ET', () => {
    // Cocher « Tank » et « Assassin » montre les deux familles. Une
    // intersection serait presque toujours vide — et donnerait une page blanche.
    const out = filterChampions(SAMPLE, { ...NO_FILTERS, tags: new Set(['Tank', 'Assassin']) })
    expect(out.map(c => c.name).sort()).toEqual(['Braum', 'Zed'])
  })

  it('la difficulté suit les bornes affichées dans l’interface', () => {
    // Les libellés des boutons sont construits à partir de `DIFFICULTY_BOUNDS` :
    // le filtre et son étiquette ne peuvent pas dire deux choses différentes.
    expect(DIFFICULTY_BOUNDS).toEqual({ easy: [1, 3], medium: [4, 7], hard: [8, 10] })
    expect(filterChampions(SAMPLE, { ...NO_FILTERS, difficulty: 'easy' }).map(c => c.name))
      .toEqual(['Braum', 'Séraphine'])
    expect(filterChampions(SAMPLE, { ...NO_FILTERS, difficulty: 'medium' }).map(c => c.name))
      .toEqual(['Aatrox'])
    expect(filterChampions(SAMPLE, { ...NO_FILTERS, difficulty: 'hard' }).map(c => c.name))
      .toEqual(['Zed'])
  })

  it('les filtres se combinent', () => {
    const out = filterChampions(SAMPLE, {
      ...NO_FILTERS, tags: new Set(['Support']), difficulty: 'easy',
    })
    expect(out.map(c => c.name)).toEqual(['Braum', 'Séraphine'])
  })

  it('trie par difficulté, en départageant par le nom', () => {
    expect(filterChampions(SAMPLE, { ...NO_FILTERS, sortBy: 'diff-asc' }).map(c => c.difficulty))
      .toEqual([2, 3, 4, 9])
    expect(filterChampions(SAMPLE, { ...NO_FILTERS, sortBy: 'diff-desc' }).map(c => c.difficulty))
      .toEqual([9, 4, 3, 2])

    const exAequo = [champ({ name: 'Zoe', difficulty: 5 }), champ({ name: 'Ashe', difficulty: 5 })]
    expect(filterChampions(exAequo, { ...NO_FILTERS, sortBy: 'diff-asc' }).map(c => c.name))
      .toEqual(['Ashe', 'Zoe'])
  })

  it('rend une liste vide quand rien ne correspond, sans lever', () => {
    expect(filterChampions(SAMPLE, { ...NO_FILTERS, query: 'zzzz' })).toEqual([])
  })
})
