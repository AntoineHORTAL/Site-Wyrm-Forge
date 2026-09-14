import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import SubscriptionSoonBadge from './SubscriptionSoonBadge'
import { landingFr, landingEn } from '@/locales/landing'

/**
 * Badge « Bientôt » qui remplace les CTA de souscription tant que
 * `SUBSCRIPTIONS_ENABLED` est à `false`. Rendu statique, sans jsdom — même
 * approche que `CheckoutConsentModal.test.tsx`.
 */
describe('SubscriptionSoonBadge', () => {
  it('rend un bouton désactivé, sans aucun gestionnaire de clic', () => {
    const el = SubscriptionSoonBadge({ label: 'Bientôt', variant: 'gold' })
    const props = el.props as Record<string, unknown>
    expect(el.type).toBe('button')
    expect(props.disabled).toBe(true)
    expect(props.onClick).toBeUndefined()
    // `type="button"` : jamais un submit accidentel s'il est un jour posé dans un <form>.
    expect(props.type).toBe('button')
  })

  it('reprend les couleurs des boutons du site, en version désactivée', () => {
    const gold = renderToStaticMarkup(<SubscriptionSoonBadge label="Bientôt" variant="gold" />)
    const primary = renderToStaticMarkup(<SubscriptionSoonBadge label="Bientôt" variant="primary" />)
    expect(gold).toContain('class="wf-btn-gold wf-btn-soon"')
    expect(primary).toContain('class="wf-btn-primary wf-btn-soon"')
    expect(gold).toContain('disabled=""')
    expect(gold).toContain('aria-disabled="true"')
  })

  it("affiche le libellé et l'infobulle reçus", () => {
    const html = renderToStaticMarkup(
      <SubscriptionSoonBadge
        label={landingEn.pricing.soon}
        title={landingEn.pricing.ctaSoonTitle}
        variant="primary"
      />,
    )
    expect(html).toContain('>Soon</button>')
    expect(html).toContain(`title="${landingEn.pricing.ctaSoonTitle}"`)
  })

  it('lit « Bientôt » / « Soon » dans le dictionnaire, jamais en dur', () => {
    expect(landingFr.pricing.soon).toBe('Bientôt')
    expect(landingEn.pricing.soon).toBe('Soon')
  })
})
