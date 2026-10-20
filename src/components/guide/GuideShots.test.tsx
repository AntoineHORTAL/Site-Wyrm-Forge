// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import GuideShots from './GuideShots'
import { guideDicts } from '@/locales/guide'
import type { GuideShot } from '@/lib/guide-shots'

/**
 * Visionneuse des captures de /guide, dans un vrai DOM (jsdom) : clics, touches,
 * focus et défilement ne se vérifient pas en HTML statique. Les décisions pures
 * (touches, boucle, piège de focus) sont couvertes par `lib/guide-lightbox.test.ts` ;
 * ici on prouve que le composant les BRANCHE sur les bons événements.
 */

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const ONE: GuideShot[] = [{ src: '/guide/test-1.webp', width: 200, height: 100 }]
const TWO: GuideShot[] = [
  { src: '/guide/test-1.webp', width: 200, height: 100 },
  { src: '/guide/test-2.webp', width: 300, height: 150 },
]
const T = { screenshot: 'Description', shotAlts: ['Première capture', 'Seconde capture'] }

let themed: HTMLDivElement
let host: HTMLDivElement
let root: Root

function render(shots: GuideShot[], lang: 'fr' | 'en' = 'fr') {
  act(() => root.render(<GuideShots id="test" shots={shots} t={T} d={guideDicts[lang]} lang={lang} />))
}

const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]')
const thumbs = () => Array.from(host.querySelectorAll<HTMLAnchorElement>('a.guide-shot-link'))
const lightboxImg = () => dialog()?.querySelector<HTMLImageElement>('.guide-lightbox-img') ?? null

/** Clic dispatché comme un vrai clic (bulle + annulable) ; renvoie l'événement. */
function click(el: Element, init: MouseEventInit = {}) {
  const ev = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ...init })
  act(() => { el.dispatchEvent(ev) })
  return ev
}

function key(k: string, init: KeyboardEventInit = {}) {
  act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init })) })
}

beforeEach(() => {
  // Comme sur le site : le contenu vit sous le conteneur du ThemeProvider.
  themed = document.createElement('div')
  themed.setAttribute('data-theme', 'mythic')
  host = document.createElement('div')
  themed.appendChild(host)
  document.body.appendChild(themed)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  themed.remove()
  document.body.style.overflow = ''
})

describe('ouverture', () => {
  it('un clic simple ouvre la visionneuse au lieu de suivre le lien', () => {
    render(ONE)
    const ev = click(thumbs()[0])
    expect(ev.defaultPrevented).toBe(true)
    expect(dialog()).not.toBeNull()
    expect(dialog()!.getAttribute('aria-modal')).toBe('true')
    expect(lightboxImg()!.getAttribute('src')).toBe('/guide/test-1.webp')
  })

  it('chaque vignette garde son lien vers le fichier (sans JavaScript, nouvel onglet)', () => {
    render(TWO)
    expect(thumbs().map(a => [a.getAttribute('href'), a.getAttribute('target')])).toEqual([
      ['/guide/test-1.webp', '_blank'],
      ['/guide/test-2.webp', '_blank'],
    ])
  })

  it('Ctrl+clic, Cmd+clic et Maj+clic ne sont pas interceptés', () => {
    render(ONE)
    for (const mod of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }]) {
      const ev = click(thumbs()[0], mod)
      expect(ev.defaultPrevented).toBe(false)
      expect(dialog()).toBeNull()
    }
  })

  it('le clic molette n\'est pas intercepté', () => {
    render(ONE)
    const aux = new MouseEvent('auxclick', { bubbles: true, cancelable: true, button: 1 })
    act(() => { thumbs()[0].dispatchEvent(aux) })
    expect(aux.defaultPrevented).toBe(false)
    expect(click(thumbs()[0], { button: 1 }).defaultPrevented).toBe(false)
    expect(dialog()).toBeNull()
  })

  it('ouvre sur la capture cliquée', () => {
    render(TWO)
    click(thumbs()[1])
    expect(lightboxImg()!.getAttribute('src')).toBe('/guide/test-2.webp')
    expect(dialog()!.textContent).toContain('2 / 2')
  })
})

describe('fermeture', () => {
  it('par un clic sur le fond', () => {
    render(ONE)
    click(thumbs()[0])
    click(dialog()!)
    expect(dialog()).toBeNull()
  })

  it('pas par un clic sur l\'image ni sur la légende', () => {
    render(ONE)
    click(thumbs()[0])
    click(lightboxImg()!)
    expect(dialog()).not.toBeNull()
    click(dialog()!.querySelector('.guide-lightbox-alt')!)
    expect(dialog()).not.toBeNull()
  })

  it('par la touche Échap', () => {
    render(ONE)
    click(thumbs()[0])
    key('Escape')
    expect(dialog()).toBeNull()
  })

  it('par le bouton ✕', () => {
    render(ONE)
    click(thumbs()[0])
    click(dialog()!.querySelector('button[aria-label="Fermer"]')!)
    expect(dialog()).toBeNull()
  })
})

describe('navigation entre les captures', () => {
  it('flèches du clavier, en boucle dans la sous-section', () => {
    render(TWO)
    click(thumbs()[0])
    expect(dialog()!.textContent).toContain('1 / 2')
    key('ArrowRight')
    expect(lightboxImg()!.getAttribute('src')).toBe('/guide/test-2.webp')
    expect(dialog()!.textContent).toContain('2 / 2')
    key('ArrowRight')
    expect(lightboxImg()!.getAttribute('src')).toBe('/guide/test-1.webp')
    key('ArrowLeft')
    expect(lightboxImg()!.getAttribute('src')).toBe('/guide/test-2.webp')
  })

  it('boutons précédent / suivant, sans fermer la modale', () => {
    render(TWO)
    click(thumbs()[0])
    click(dialog()!.querySelector('button[aria-label="Image suivante"]')!)
    expect(dialog()).not.toBeNull()
    expect(lightboxImg()!.getAttribute('src')).toBe('/guide/test-2.webp')
    click(dialog()!.querySelector('button[aria-label="Image précédente"]')!)
    expect(lightboxImg()!.getAttribute('src')).toBe('/guide/test-1.webp')
  })

  it('aucune flèche ni compteur pour une capture seule', () => {
    render(ONE)
    click(thumbs()[0])
    expect(dialog()!.querySelector('.guide-lightbox-nav')).toBeNull()
    key('ArrowRight')
    expect(lightboxImg()!.getAttribute('src')).toBe('/guide/test-1.webp')
  })

  it('la légende est le texte alternatif de l\'image affichée', () => {
    render(TWO)
    click(thumbs()[0])
    expect(dialog()!.querySelector('.guide-lightbox-alt')!.textContent).toBe('Première capture')
    key('ArrowRight')
    expect(dialog()!.querySelector('.guide-lightbox-alt')!.textContent).toBe('Seconde capture')
    expect(lightboxImg()!.getAttribute('alt')).toBe('Seconde capture')
  })

  it('le lien « Ouvrir en taille réelle » vise le fichier affiché, dans un nouvel onglet', () => {
    render(TWO)
    click(thumbs()[0])
    key('ArrowRight')
    const full = dialog()!.querySelector<HTMLAnchorElement>('a.guide-lightbox-full')!
    expect(full.textContent).toBe('Ouvrir en taille réelle')
    expect(full.getAttribute('href')).toBe('/guide/test-2.webp')
    expect(full.getAttribute('target')).toBe('_blank')
  })
})

describe('accessibilité et confort', () => {
  it('focus sur ✕ à l\'ouverture, rendu à la vignette d\'origine à la fermeture', () => {
    render(TWO)
    click(thumbs()[1])
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Fermer')
    key('Escape')
    expect(document.activeElement).toBe(thumbs()[1])
  })

  it('Tab boucle dans la modale, dans les deux sens', () => {
    render(TWO)
    click(thumbs()[0])
    const focusables = Array.from(dialog()!.querySelectorAll<HTMLElement>('a[href], button'))
    focusables.at(-1)!.focus()
    key('Tab')
    expect(document.activeElement).toBe(focusables[0])
    key('Tab', { shiftKey: true })
    expect(document.activeElement).toBe(focusables.at(-1))
  })

  it('bloque le défilement de la page, puis le rend', () => {
    document.body.style.overflow = 'auto'
    render(ONE)
    click(thumbs()[0])
    expect(document.body.style.overflow).toBe('hidden')
    key('Escape')
    expect(document.body.style.overflow).toBe('auto')
  })

  it('libellés en anglais avec le dictionnaire EN, et `lang` posé sur la modale', () => {
    render(TWO, 'en')
    click(thumbs()[0])
    expect(dialog()!.getAttribute('lang')).toBe('en')
    for (const label of ['Close', 'Previous image', 'Next image']) {
      expect(dialog()!.querySelector(`button[aria-label="${label}"]`)).not.toBeNull()
    }
    expect(dialog()!.textContent).toContain('Open full size')
  })

  it('la modale est rendue sous le conteneur `[data-theme]`, qui porte les tokens de couleur', () => {
    // Rendue directement sous `body`, elle perdait `--text`, `--bg-alt`… : légende
    // et flèches sombres sur fond sombre (constaté au rendu réel, 1280 et 380 px).
    render(ONE)
    click(thumbs()[0])
    expect(dialog()!.closest('[data-theme]')).toBe(themed)
  })

  it('le bouton « retour au sommaire » reste sous la modale', () => {
    // La modale reprend `.pn-modal` : c'est son z-index qui doit dominer celui du bouton.
    const css = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8')
    const zIndex = (selector: string) => {
      const block = css.match(new RegExp(`\\n${selector.replace('.', '\\.')} \\{([^}]*)\\}`))?.[1] ?? ''
      return Number(block.match(/z-index:\s*(\d+)/)?.[1])
    }
    expect(zIndex('.pn-modal')).toBeGreaterThan(zIndex('.guide-back-to-toc'))
  })
})
