'use client'

import { useEffect, useState } from 'react'
import { IconArrowUp } from '@tabler/icons-react'
import { GUIDE_TOC_ID, shouldShowBackToToc } from '@/lib/guide'

/* Bouton flottant « retour au sommaire » de /guide.

   Visibilité pilotée par deux IntersectionObserver — jamais par un seuil de
   défilement arbitraire, qui ne dit rien de ce que le lecteur voit vraiment :
   - le SOMMAIRE : hors écran ⇒ bouton ; revenu à l'écran ⇒ plus de bouton ;
   - le FOOTER global : visible ⇒ bouton caché, pour ne jamais recouvrir les
     liens légaux du pied de page.
   La décision elle-même est dans `shouldShowBackToToc` (module pur, testé). */

export default function BackToToc({ label }: { label: string }) {
  // `null` = pas encore observé : rendu serveur et premier rendu client
  // identiques (bouton absent), donc aucun écart d'hydratation.
  const [tocVisible, setTocVisible] = useState<boolean | null>(null)
  const [footerVisible, setFooterVisible] = useState(false)

  useEffect(() => {
    const toc = document.getElementById(GUIDE_TOC_ID)
    if (!toc || typeof IntersectionObserver === 'undefined') return

    const tocObs = new IntersectionObserver(([e]) => setTocVisible(e.isIntersecting))
    tocObs.observe(toc)

    // Le footer est monté par le layout racine, hors de ce composant.
    const footer = document.querySelector('footer')
    const footerObs = footer
      ? new IntersectionObserver(([e]) => setFooterVisible(e.isIntersecting))
      : null
    if (footer && footerObs) footerObs.observe(footer)

    return () => { tocObs.disconnect(); footerObs?.disconnect() }
  }, [])

  if (!shouldShowBackToToc(tocVisible, footerVisible)) return null
  return <BackToTocButton label={label} onClick={goToToc} />
}

/** Rendu seul, sans état — testable par `renderToStaticMarkup`. */
export function BackToTocButton({ label, onClick }: { label: string; onClick?: () => void }) {
  return (
    <button type="button" className="guide-back-to-toc" aria-label={label} title={label} onClick={onClick}>
      <IconArrowUp size={22} stroke={2} aria-hidden="true" />
    </button>
  )
}

/**
 * Défile jusqu'au sommaire (son ancre, pas le haut de page), en douceur sauf si
 * l'utilisateur demande moins d'animations, puis y place le focus.
 */
function goToToc() {
  const toc = document.getElementById(GUIDE_TOC_ID)
  if (!toc) return

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  // `preventScroll` : le focus ne doit pas relancer un second défilement, brusque,
  // par-dessus celui qu'on vient de demander.
  const focus = () => toc.focus({ preventScroll: true })

  if (reduced) {
    toc.scrollIntoView({ behavior: 'auto', block: 'start' })
    focus()
    return
  }

  toc.scrollIntoView({ behavior: 'smooth', block: 'start' })
  // Focus APRÈS le défilement. `scrollend` n'existe pas partout (Safari) : un
  // délai de repli garantit que le focus arrive quand même, une seule fois.
  let done = false
  const finish = () => {
    if (done) return
    done = true
    window.removeEventListener('scrollend', finish)
    focus()
  }
  window.addEventListener('scrollend', finish, { once: true })
  window.setTimeout(finish, 1000)
}
