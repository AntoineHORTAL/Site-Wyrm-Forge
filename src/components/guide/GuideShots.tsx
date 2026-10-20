'use client'

import { useCallback, useState } from 'react'
import { createPortal } from 'react-dom'
import { guideShotAlt, type GuideShot } from '@/lib/guide-shots'
import { opensLightbox } from '@/lib/guide-lightbox'
import type { GuideDict, GuideEntryText } from '@/locales/guide'
import type { Lang } from '@/locales/landing'
import GuideLightbox from './GuideLightbox'

/* Captures d'une sous-section (`public/guide/`, via `lib/guide-shots.ts`).
   Au moins une image ⇒ les images seules, jamais d'encadré vide à côté — même si
   d'autres captures sont prévues. Aucune ⇒ encadré VISIBLE à dessein : une
   capture manquante doit se voir sur la page, pas se perdre dans un commentaire.

   Chaque vignette reste un vrai lien vers le fichier : sans JavaScript, ou en
   Ctrl/Cmd+clic, Maj+clic ou clic molette, l'image s'ouvre comme avant. Seul le
   clic simple est intercepté pour ouvrir la visionneuse (`GuideLightbox`). */

export default function GuideShots({ id, shots, t, d, lang }: {
  id: string
  shots: readonly GuideShot[]
  t: Pick<GuideEntryText, 'screenshot' | 'shotAlts'>
  d: GuideDict
  lang: Lang
}) {
  const [open, setOpen] = useState<number | null>(null)
  // Vignette qui a ouvert la visionneuse : elle reprend le focus à la fermeture.
  const [opener, setOpener] = useState<HTMLElement | null>(null)
  const close = useCallback(() => setOpen(null), [])

  if (shots.length === 0) {
    return (
      <figure className="guide-shot" data-guide-screenshot={id}>
        <figcaption>
          <span className="guide-shot-label">{d.labels.screenshot}</span>
          <span>{t.screenshot}</span>
        </figcaption>
      </figure>
    )
  }

  const alts = shots.map((_, i) => guideShotAlt(t, i, shots.length))

  // `<img>` et non `next/image` : les fichiers sont déjà en WebP à la bonne
  // taille, et l'optimiseur Vercel compterait chaque variante sur le quota Hobby.
  // `width`/`height` réservent la place avant chargement (pas de décalage).
  return (
    <div className="guide-shots" data-guide-screenshot={id}>
      {shots.map((s, i) => (
        <figure key={s.src} className="guide-shot-figure">
          <a
            href={s.src}
            target="_blank"
            rel="noopener"
            className="guide-shot-link"
            onClick={e => {
              if (!opensLightbox(e)) return
              e.preventDefault()
              setOpener(e.currentTarget)
              setOpen(i)
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- voir ci-dessus */}
            <img
              src={s.src}
              width={s.width}
              height={s.height}
              alt={alts[i]}
              loading="lazy"
              decoding="async"
              className="guide-shot-img"
            />
            <span className="sr-only">{d.labels.openFull}</span>
          </a>
        </figure>
      ))}

      {/* `open` n'est posé que par un clic : on est forcément dans le navigateur.
          Le portail vise le conteneur `[data-theme]` (ThemeProvider), pas `body` :
          c'est lui qui porte les tokens (`--text`, `--bg-alt`…). Rendue sous
          `body`, la modale les perdait et sa légende devenait illisible. */}
      {open !== null && createPortal(
        <GuideLightbox
          shots={shots}
          alts={alts}
          index={open}
          lang={lang}
          labels={d.labels.lightbox}
          returnFocus={opener}
          onIndex={setOpen}
          onClose={close}
        />,
        opener?.closest('[data-theme]') ?? document.body,
      )}
    </div>
  )
}
