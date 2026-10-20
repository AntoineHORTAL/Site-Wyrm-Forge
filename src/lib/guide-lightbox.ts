/**
 * Visionneuse des captures de `/guide` — décisions PURES, sans DOM.
 *
 * Le composant (`components/guide/GuideLightbox.tsx`) ne fait que brancher ces
 * règles sur les événements du navigateur : qui ouvre la modale, quelle touche
 * fait quoi, où va le focus quand on tabule en bout de liste.
 */

/** Ce qu'il faut d'un événement de clic pour décider. */
export interface ClickLike {
  button: number
  ctrlKey: boolean
  metaKey: boolean
  shiftKey: boolean
  altKey: boolean
  defaultPrevented?: boolean
}

/**
 * Seul un clic gauche SIMPLE ouvre la visionneuse. Ctrl/Cmd+clic, Maj+clic et
 * Alt+clic gardent leur sens habituel (nouvel onglet, nouvelle fenêtre,
 * téléchargement) : le lien `<a href>` de la vignette fait alors son travail,
 * comme sans JavaScript. Le clic molette ne déclenche pas `click` (c'est
 * `auxclick`) — `button !== 0` le couvre quand même, par prudence.
 */
export function opensLightbox(e: ClickLike): boolean {
  return !e.defaultPrevented
    && e.button === 0
    && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey
}

export type LightboxAction = 'close' | 'prev' | 'next'

/**
 * Touche → action. Les flèches ne font rien quand la sous-section n'a qu'une
 * capture : il n'y a pas d'autre image vers laquelle aller.
 */
export function lightboxKeyAction(key: string, count: number): LightboxAction | null {
  if (key === 'Escape' || key === 'Esc') return 'close'
  if (count < 2) return null
  if (key === 'ArrowLeft') return 'prev'
  if (key === 'ArrowRight') return 'next'
  return null
}

/**
 * Image suivante / précédente, en boucle À L'INTÉRIEUR de la sous-section :
 * après la dernière on revient à la première, jamais vers la sous-section
 * voisine.
 */
export function stepShot(index: number, dir: 'prev' | 'next', count: number): number {
  if (count < 1) return 0
  const delta = dir === 'next' ? 1 : -1
  return (index + delta + count) % count
}

/** Indication de position, « 1 / 2 ». */
export function shotCounter(index: number, count: number): string {
  return `${index + 1} / ${count}`
}

/**
 * Piège de focus : sur Tab en bout de liste (ou Maj+Tab en tête), l'index de
 * l'élément à focaliser pour boucler dans la modale. `null` = laisser le
 * navigateur faire, on n'est pas au bord. `current` à -1 = le focus est sorti
 * de la modale (ou n'y est pas encore) : on le ramène au bord concerné.
 */
export function trapFocusIndex(current: number, total: number, shift: boolean): number | null {
  if (total === 0) return null
  if (current < 0) return shift ? total - 1 : 0
  if (shift && current === 0) return total - 1
  if (!shift && current === total - 1) return 0
  return null
}
