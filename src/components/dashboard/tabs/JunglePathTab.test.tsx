import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

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
