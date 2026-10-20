'use client'

import { useEffect, useId, useRef } from 'react'
import { IconChevronLeft, IconChevronRight, IconX } from '@tabler/icons-react'
import type { GuideShot } from '@/lib/guide-shots'
import { lightboxKeyAction, shotCounter, stepShot, trapFocusIndex } from '@/lib/guide-lightbox'
import type { Lang } from '@/locales/landing'

export interface GuideLightboxLabels {
  close: string
  prevShot: string
  nextShot: string
  openFullSize: string
}

/* Visionneuse des captures de /guide, ouverte par `GuideShots` au clic simple sur
   une vignette. Reprend le châssis `.pn-modal` / `.pn-modal-close` des autres
   modales du site ; le `createPortal` reste chez l'appelant, comme pour elles.

   - Fermeture : clic sur le fond (tout ce qui n'est pas marqué
     `data-lightbox-keep`), Échap, bouton ✕. Un clic SUR l'image ne ferme pas.
   - Plusieurs captures : ← → (boutons et clavier), en boucle dans la sous-section.
   - Focus placé sur ✕ à l'ouverture, piégé dans la modale, rendu à la vignette
     d'origine (`returnFocus`) à la fermeture ; défilement de la page bloqué.
   Les décisions (touches, boucle, piège) sont dans `lib/guide-lightbox.ts`. */

export default function GuideLightbox({ shots, alts, index, lang, labels, returnFocus, onIndex, onClose }: {
  shots: readonly GuideShot[]
  alts: readonly string[]
  index: number
  lang: Lang
  labels: GuideLightboxLabels
  /** Vignette d'origine, qui reprend le focus à la fermeture. */
  returnFocus: HTMLElement | null
  onIndex: (index: number) => void
  onClose: () => void
}) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const captionId = useId()
  const count = shots.length
  const shot = shots[index]

  // Montage : focus dans la modale, défilement bloqué. Démontage : l'inverse.
  useEffect(() => {
    const body = document.body
    const previousOverflow = body.style.overflow
    body.style.overflow = 'hidden'
    closeRef.current?.focus()
    return () => {
      body.style.overflow = previousOverflow
      returnFocus?.focus()
    }
  }, [returnFocus])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Tab') {
        const dialog = dialogRef.current
        if (!dialog) return
        const focusables = Array.from(
          dialog.querySelectorAll<HTMLElement>('a[href], button:not([disabled])'),
        )
        const next = trapFocusIndex(
          focusables.indexOf(document.activeElement as HTMLElement),
          focusables.length,
          e.shiftKey,
        )
        if (next !== null) {
          e.preventDefault()
          focusables[next].focus()
        }
        return
      }
      const action = lightboxKeyAction(e.key, count)
      if (!action) return
      e.preventDefault()
      if (action === 'close') onClose()
      else onIndex(stepShot(index, action, count))
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [count, index, onClose, onIndex])

  if (!shot) return null

  return (
    <div
      ref={dialogRef}
      className="pn-modal guide-lightbox"
      role="dialog"
      aria-modal="true"
      aria-labelledby={captionId}
      lang={lang}
      onClick={e => {
        // Le fond, c'est tout ce qui n'est pas explicitement gardé : image,
        // légende et commandes portent `data-lightbox-keep`.
        if (!(e.target as Element).closest('[data-lightbox-keep]')) onClose()
      }}
    >
      <button
        ref={closeRef}
        type="button"
        className="pn-modal-close guide-lightbox-close"
        aria-label={labels.close}
        title={labels.close}
        data-lightbox-keep
        onClick={onClose}
      >
        <IconX size={20} stroke={2} aria-hidden="true" />
      </button>

      <figure className="guide-lightbox-figure">
        {/* eslint-disable-next-line @next/next/no-img-element -- même raison que les vignettes (`GuideShots`) */}
        <img
          key={shot.src}
          src={shot.src}
          width={shot.width}
          height={shot.height}
          alt={alts[index] ?? ''}
          className="guide-lightbox-img"
          data-lightbox-keep
        />
        <figcaption className="guide-lightbox-caption" data-lightbox-keep>
          {count > 1 && (
            <div className="guide-lightbox-nav">
              <button
                type="button"
                className="guide-lightbox-btn"
                aria-label={labels.prevShot}
                title={labels.prevShot}
                onClick={() => onIndex(stepShot(index, 'prev', count))}
              >
                <IconChevronLeft size={20} stroke={2} aria-hidden="true" />
              </button>
              <span className="guide-lightbox-count" aria-live="polite">{shotCounter(index, count)}</span>
              <button
                type="button"
                className="guide-lightbox-btn"
                aria-label={labels.nextShot}
                title={labels.nextShot}
                onClick={() => onIndex(stepShot(index, 'next', count))}
              >
                <IconChevronRight size={20} stroke={2} aria-hidden="true" />
              </button>
            </div>
          )}
          <p id={captionId} className="guide-lightbox-alt">{alts[index]}</p>
          <a href={shot.src} target="_blank" rel="noopener" className="guide-lightbox-full">
            {labels.openFullSize}
          </a>
        </figcaption>
      </figure>
    </div>
  )
}
