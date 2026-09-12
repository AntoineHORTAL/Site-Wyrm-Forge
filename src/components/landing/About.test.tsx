import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { landingDicts, type Lang } from '@/locales/landing'

/**
 * La section éditoriale de la vitrine — le contenu que l'examen AdSense n'a pas
 * trouvé.
 *
 * Les autres blocs de `/` sont faits de titres courts, d'icônes et de cartes.
 * Celui-ci est du texte suivi, et c'est sa RAISON D'ÊTRE : s'il maigrit, la page
 * redevient ce qu'elle était sans que rien ne le signale. D'où un seuil chiffré
 * plutôt qu'un simple « contient du texte ».
 */

let lang: Lang = 'fr'

vi.mock('@/components/providers/LanguageProvider', () => ({
  useLanguage: () => ({ lang, setLang: () => {}, t: landingDicts[lang] }),
}))
vi.mock('@/components/providers/ThemeProvider', () => ({
  useTheme: () => ({ theme: 'mythic', setTheme: () => {} }),
}))

const { default: About } = await import('./About')

function render(l: Lang): string {
  lang = l
  return renderToStaticMarkup(<About />)
}

/** Texte visible, balises et entités retirées. */
function textOf(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/&#x27;|&apos;/g, "'")
    .replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()
}

beforeEach(() => { lang = 'fr' })

describe('section « Qu’est-ce que Wyrm Forge ? »', () => {
  it.each(['fr', 'en'] as const)('%s — rendue entièrement par le serveur, sans effet', (l) => {
    // `renderToStaticMarkup` n'exécute aucun `useEffect` : ce qui sort ici est
    // ce que contient la réponse HTTP.
    const html = render(l)
    expect(html).not.toMatch(/Chargement|Loading/i)
    expect(html).toContain('Wyrm Forge')
  })

  it.each(['fr', 'en'] as const)('%s — porte un volume de texte substantiel', (l) => {
    // ~1 500 caractères et 4 sous-sections : le seuil est bas par rapport au
    // contenu réel, il ne se déclenche que si quelqu'un vide la section.
    const text = textOf(render(l))
    expect(text.length).toBeGreaterThan(1500)
    expect(render(l).match(/<h3/g) ?? []).toHaveLength(4)
  })

  it('les deux langues disent des choses différentes', () => {
    expect(textOf(render('en'))).not.toBe(textOf(render('fr')))
  })

  it('décrit le produit, pas seulement la marque', () => {
    const fr = textOf(render('fr'))
    for (const mot of ['overlay', 'jungle', 'Riot Games', 'gratuit']) {
      expect(fr.toLowerCase(), mot).toContain(mot.toLowerCase())
    }
  })

  it('rappelle la non-affiliation à Riot Games, dans les deux langues', () => {
    // Même engagement que les CGU § 11 : une page qui vante un outil LoL sans
    // le dire prête à confusion — et c'est une exigence du Riot Games API
    // Developer Agreement, pas une précaution de style.
    expect(textOf(render('fr')).toLowerCase()).toContain('affilié')
    expect(textOf(render('en')).toLowerCase()).toContain('affiliated')
  })

  it('ne promet aucun résultat en jeu', () => {
    // Cohérent avec les CGU § 9 : les analyses sont indicatives. Une vitrine qui
    // promettrait de « faire monter » serait contredite par nos propres CGU.
    for (const l of ['fr', 'en'] as const) {
      const text = textOf(render(l)).toLowerCase()
      for (const promesse of ['garantit un résultat', 'guarantees a result']) {
        expect(text.includes(`nous ${promesse}`), promesse).toBe(false)
      }
    }
    expect(textOf(render('fr'))).toContain('ne garantit un résultat en jeu')
  })
})
