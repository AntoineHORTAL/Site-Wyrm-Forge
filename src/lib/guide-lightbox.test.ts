import { describe, it, expect } from 'vitest'
import { lightboxKeyAction, opensLightbox, shotCounter, stepShot, trapFocusIndex } from './guide-lightbox'

const click = (over: Partial<Parameters<typeof opensLightbox>[0]> = {}) => ({
  button: 0, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...over,
})

describe('opensLightbox', () => {
  it('ouvre sur un clic gauche simple', () => {
    expect(opensLightbox(click())).toBe(true)
  })

  it('laisse au lien les clics à modificateur et les autres boutons', () => {
    // Ctrl/Cmd+clic = nouvel onglet, Maj+clic = nouvelle fenêtre, Alt+clic =
    // téléchargement : l'utilisateur a demandé autre chose qu'une modale.
    expect(opensLightbox(click({ ctrlKey: true }))).toBe(false)
    expect(opensLightbox(click({ metaKey: true }))).toBe(false)
    expect(opensLightbox(click({ shiftKey: true }))).toBe(false)
    expect(opensLightbox(click({ altKey: true }))).toBe(false)
    expect(opensLightbox(click({ button: 1 }))).toBe(false)
  })

  it('n\'intervient pas sur un clic déjà traité', () => {
    expect(opensLightbox(click({ defaultPrevented: true }))).toBe(false)
  })
})

describe('lightboxKeyAction', () => {
  it('Échap ferme, même avec une seule capture', () => {
    expect(lightboxKeyAction('Escape', 1)).toBe('close')
  })

  it('les flèches naviguent seulement s\'il y a plusieurs captures', () => {
    expect(lightboxKeyAction('ArrowLeft', 2)).toBe('prev')
    expect(lightboxKeyAction('ArrowRight', 2)).toBe('next')
    expect(lightboxKeyAction('ArrowRight', 1)).toBeNull()
    expect(lightboxKeyAction('Enter', 3)).toBeNull()
  })
})

describe('stepShot', () => {
  it('boucle dans la sous-section, dans les deux sens', () => {
    expect(stepShot(0, 'next', 3)).toBe(1)
    expect(stepShot(2, 'next', 3)).toBe(0)
    expect(stepShot(0, 'prev', 3)).toBe(2)
  })

  it('reste sur place avec une seule capture', () => {
    expect(stepShot(0, 'next', 1)).toBe(0)
    expect(stepShot(0, 'prev', 1)).toBe(0)
  })
})

describe('shotCounter', () => {
  it('compte à partir de 1', () => {
    expect(shotCounter(0, 2)).toBe('1 / 2')
    expect(shotCounter(1, 2)).toBe('2 / 2')
  })
})

describe('trapFocusIndex', () => {
  it('boucle aux deux bords, et seulement là', () => {
    expect(trapFocusIndex(3, 4, false)).toBe(0)
    expect(trapFocusIndex(0, 4, true)).toBe(3)
    expect(trapFocusIndex(1, 4, false)).toBeNull()
    expect(trapFocusIndex(1, 4, true)).toBeNull()
  })

  it('ramène dans la modale un focus qui en est sorti', () => {
    expect(trapFocusIndex(-1, 4, false)).toBe(0)
    expect(trapFocusIndex(-1, 4, true)).toBe(3)
  })

  it('ne fait rien sans élément focalisable', () => {
    expect(trapFocusIndex(0, 0, false)).toBeNull()
  })
})
