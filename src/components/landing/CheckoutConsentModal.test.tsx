import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { isValidElement, type ReactElement, type ReactNode } from 'react'
import CheckoutConsentModal, { type CheckoutConsentLabels } from './CheckoutConsentModal'
import { CONSENT_TEXTS, CURRENT_CONSENT_VERSION } from '@/lib/stripe/checkout-consent'
import { landingFr, landingEn } from '@/locales/landing'

/**
 * Étape de consentement avant Stripe — rendu statique + exécution directe du
 * composant (sans hook) pour atteindre les gestionnaires, même approche que
 * `LaunchModal.test.tsx`, sans jsdom.
 */

function render(el: ReactElement): ReactNode {
  const run = el.type as (props: unknown) => ReactNode
  return run(el.props)
}

/** Tous les éléments d'un arbre, à plat. */
function walk(node: ReactNode, out: ReactElement[] = []): ReactElement[] {
  if (Array.isArray(node)) { node.forEach(n => walk(n, out)); return out }
  if (!isValidElement(node)) return out
  out.push(node)
  walk((node.props as { children?: ReactNode }).children, out)
  return out
}

const LABELS: CheckoutConsentLabels = {
  title: 'Abonnement {tier}',
  priceLabel: 'Prix :',
  renewal: 'Renouvelé automatiquement chaque mois.',
  termsBefore: 'Avant de payer, prends connaissance de nos',
  termsLink: 'conditions générales de vente',
  confirm: 'Continuer vers le paiement',
  confirmLoading: 'Redirection…',
  cancel: 'Annuler',
}

const TEXT_FR = CONSENT_TEXTS[CURRENT_CONSENT_VERSION].fr

function modal(over: Partial<Parameters<typeof CheckoutConsentModal>[0]> = {}) {
  return (
    <CheckoutConsentModal
      tierLabel="Forgeron"
      periodLabel="Mensuel"
      priceText="3€ /mois"
      consentText={TEXT_FR}
      checked={false}
      pending={false}
      error={null}
      termsHref="/cgv"
      labels={LABELS}
      onToggle={() => {}}
      onConfirm={() => {}}
      onCancel={() => {}}
      {...over}
    />
  )
}

function confirmButton(el: ReactElement): ReactElement {
  const buttons = walk(render(el)).filter(n => n.type === 'button')
  // Ordre : croix, annuler, confirmer.
  return buttons[buttons.length - 1]
}

describe('case de demande expresse', () => {
  it('n’est PAS pré-cochée à l’ouverture', () => {
    const html = renderToStaticMarkup(modal())
    expect(html).toContain('type="checkbox"')
    expect(html).not.toMatch(/type="checkbox"[^>]*checked/)
  })

  it('affiche le texte versionné À L’IDENTIQUE — celui que le serveur enregistre', () => {
    const html = renderToStaticMarkup(modal())
    // renderToStaticMarkup échappe l'apostrophe : on compare au texte échappé.
    expect(html).toContain(TEXT_FR.replace(/'/g, '&#x27;'))
  })

  it('bascule la case via onToggle', () => {
    const onToggle = vi.fn()
    const input = walk(render(modal({ onToggle }))).find(n => n.type === 'input')!
    ;(input.props as { onChange: () => void }).onChange()
    expect(onToggle).toHaveBeenCalledOnce()
  })
})

describe('bouton de paiement', () => {
  it('🔴 est désactivé tant que la case n’est pas cochée', () => {
    const btn = confirmButton(modal({ checked: false }))
    expect((btn.props as { disabled: boolean }).disabled).toBe(true)
  })

  it('🔴 n’a AUCUN gestionnaire de clic tant que la case n’est pas cochée', () => {
    // Double verrou : même un clic forcé (attribut `disabled` retiré à la main
    // dans l'inspecteur) ne déclenche rien.
    const onConfirm = vi.fn()
    const btn = confirmButton(modal({ checked: false, onConfirm }))
    expect((btn.props as { onClick?: unknown }).onClick).toBeUndefined()
  })

  it('devient actif case cochée, et confirme une seule fois', () => {
    const onConfirm = vi.fn()
    const btn = confirmButton(modal({ checked: true, onConfirm }))
    expect((btn.props as { disabled: boolean }).disabled).toBe(false)
    ;(btn.props as { onClick: () => void }).onClick()
    expect(onConfirm).toHaveBeenCalledOnce()
  })

  it('se verrouille pendant la redirection, même case cochée', () => {
    const btn = confirmButton(modal({ checked: true, pending: true }))
    expect((btn.props as { disabled: boolean }).disabled).toBe(true)
    expect(renderToStaticMarkup(modal({ checked: true, pending: true }))).toContain('Redirection…')
  })
})

describe('information précontractuelle', () => {
  it('récapitule palier, prix, périodicité et reconduction', () => {
    const html = renderToStaticMarkup(modal())
    expect(html).toContain('Abonnement Forgeron')
    expect(html).toContain('3€ /mois')
    expect(html).toContain('Mensuel')
    expect(html).toContain('Renouvelé automatiquement chaque mois.')
  })

  it('pointe vers les CGV, dans un nouvel onglet (la modale reste ouverte)', () => {
    const html = renderToStaticMarkup(modal())
    expect(html).toContain('href="/cgv"')
    expect(html).toContain('target="_blank"')
  })

  it('affiche l’erreur de la route dans la modale', () => {
    const html = renderToStaticMarkup(modal({ error: 'Impossible d’ouvrir le paiement.' }))
    expect(html).toContain('role="alert"')
    expect(html).toContain('Impossible d’ouvrir le paiement.')
  })
})

describe('dictionnaires de la modale', () => {
  it('portent tous les libellés, dans les deux langues, et le marqueur {tier}', () => {
    for (const d of [landingFr, landingEn]) {
      expect(d.pricing.consentTitle).toContain('{tier}')
      expect(d.pricing.consentRenewalMonthly.trim()).not.toBe('')
      expect(d.pricing.consentRenewalAnnual.trim()).not.toBe('')
      expect(d.pricing.consentOutdated.trim()).not.toBe('')
    }
  })

  it('annoncent le rappel avant reconduction pour l’annuel seulement (L215-1)', () => {
    // Le rappel est envoyé par l'EF `subscription-emails` depuis le 2026-09-11.
    // Le mensuel, contrat sans durée déterminée, n'en a pas : il ne doit pas le promettre.
    for (const d of [landingFr, landingEn]) {
      expect(d.pricing.consentRenewalAnnual).toMatch(/prévenu|notified/i)
      expect(d.pricing.consentRenewalMonthly).not.toMatch(/prévenu|rappel|remind|notif/i)
    }
  })
})
