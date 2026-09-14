import type { CSSProperties } from 'react'

/**
 * Remplaçant d'un CTA de souscription tant que `SUBSCRIPTIONS_ENABLED` est à
 * `false` (voir `src/lib/stripe/availability.ts`).
 *
 * Reprend les classes de bouton du site (`.wf-btn-gold` / `.wf-btn-primary`)
 * pour garder exactement leurs couleurs, et y ajoute `.wf-btn-soon`
 * (globals.css) : opacité réduite, curseur `not-allowed`, aucun effet de survol.
 *
 * Un `<button disabled>` sans `onClick` plutôt qu'un `<span>` : l'élément reste
 * annoncé comme une action INDISPONIBLE par les lecteurs d'écran, et
 * `.wf-btn-gold:not(:disabled):hover::before` coupe déjà le reflet au survol.
 *
 * Composant SANS HOOK — le libellé est passé par l'appelant, qui le lit dans
 * `t.pricing.soon` : c'est ce qui le rend testable par `renderToStaticMarkup`.
 */
export default function SubscriptionSoonBadge({ label, title, variant, style }: {
  /** `t.pricing.soon` — « Bientôt » / « Soon ». */
  label: string
  /** Infobulle, `t.pricing.ctaSoonTitle`. */
  title?: string
  /** `gold` en thème mythic, `primary` en classic — même règle que les CTA remplacés. */
  variant: 'gold' | 'primary'
  style?: CSSProperties
}) {
  return (
    <button
      type="button"
      disabled
      aria-disabled="true"
      title={title}
      className={`wf-btn-${variant} wf-btn-soon`}
      style={{ justifyContent: 'center', ...style }}
    >
      {label}
    </button>
  )
}
