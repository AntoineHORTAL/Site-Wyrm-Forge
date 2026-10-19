import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Aucun appel réseau au rendu serveur : la liste se charge dans un effet, et sans
// session (contexte par défaut) l'effet ne fait rien. Le client n'est jamais appelé.
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }))

import JunglePathTab from './JunglePathTab'
import { CAMP_POSITIONS } from '@/lib/jungle-path'

const html = renderToStaticMarkup(<JunglePathTab />)

describe('JunglePathTab — rendu', () => {
  it('cale image et SVG dans le conteneur carré `.jungle-map`', () => {
    expect(html).toContain('class="jungle-map"')
    expect(html).toContain('viewBox="0 0 100 100"')
    // L'ancien cadrage (cover + hauteur minimale) décalait les tracés sous 480 px.
    expect(html).not.toContain('object-fit:cover')
    expect(html).not.toContain('min-height:480')
  })

  it('pose l\'image et le SVG, et eux seuls, comme enfants directs du même `.jungle-map`', () => {
    // Le markup du conteneur tient en un seul bloc : <div jungle-map><img/><svg>…</svg></div>
    const open = html.indexOf('class="jungle-map"')
    expect(open).toBeGreaterThanOrEqual(0)
    const inner = html.slice(html.indexOf('>', open) + 1)
    expect(inner).toMatch(/^<img [^>]*\/?><svg /)
    const img = inner.match(/^<img [^>]*>/)![0]
    // Aucune taille propre à l'image : elle ne prend que celle du carré (globals.css).
    expect(img).not.toMatch(/\s(width|height)="/)
    expect(img).not.toMatch(/(width|height|position|inset)\s*:/)
    const svgEnd = inner.indexOf('</svg>') + '</svg>'.length
    expect(inner.slice(svgEnd, svgEnd + '</div>'.length)).toBe('</div>')
    const svg = inner.match(/^<img [^>]*>(<svg [^>]*>)/)![1]
    expect(svg).toContain('viewBox="0 0 100 100"')
    expect(svg).toContain('preserveAspectRatio="none"')
    expect(svg).not.toMatch(/\s(width|height)="/)
  })

  it('cale image et SVG sur le même carré, plafonné et centré (globals.css)', () => {
    const css = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8')
    const rule = (selector: string) => {
      const at = css.indexOf(`${selector} `)
      expect(at, `règle ${selector} absente de globals.css`).toBeGreaterThanOrEqual(0)
      return css.slice(css.indexOf('{', at) + 1, css.indexOf('}', at)).replace(/\s+/g, ' ')
    }
    // Une seule règle pour les deux enfants : impossible de dimensionner l'un sans l'autre.
    expect(css).toMatch(/\.jungle-map > img,\s*\.jungle-map > svg\s*\{/)
    const children = rule('.jungle-map > svg')
    for (const decl of ['position: absolute', 'inset: 0', 'width: 100%', 'height: 100%']) {
      expect(children).toContain(decl)
    }
    expect(rule('.jungle-map')).toContain('aspect-ratio: 1')
    const frame = rule('.jungle-map-frame')
    expect(frame).toContain('width: min(100%, 640px)')
    expect(frame).toContain('justify-self: center')
    expect(html).toMatch(/<div class="jungle-map-frame"[^>]*><div class="jungle-map"/)
  })

  it('propose les 14 camps de l\'app, et ni Dragon ni Baron', () => {
    const campButtons = html.match(/title="Clic : ajouter au parcours/g) ?? []
    expect(campButtons).toHaveLength(Object.keys(CAMP_POSITIONS).length)
    expect(html).not.toMatch(/Dragon|Baron/)
  })

  it('ne rend plus les paths de démonstration', () => {
    expect(html).not.toMatch(/Hecarim<|Full clear côté bleu|Invade côté rouge/)
  })

  it('n\'affiche ni « Supprimer » ni « non sauvegardé » pour un path neuf et vierge', () => {
    expect(html).not.toContain('>Supprimer<')
    expect(html).not.toContain('Modifications non sauvegardées')
  })
})
