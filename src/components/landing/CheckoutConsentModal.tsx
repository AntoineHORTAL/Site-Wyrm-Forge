'use client'

import { IconX } from '@tabler/icons-react'

/**
 * Étape intermédiaire entre « S'abonner » et Stripe Checkout : récapitulatif de
 * l'offre + DEMANDE EXPRESSE d'exécution immédiate (art. L221-25 C. conso).
 *
 * Présentationnel, sans hook ni appel réseau — testable par
 * `renderToStaticMarkup`, comme `LaunchModal` dont il reprend le châssis
 * (`.pn-modal` / `.pn-modal-inner` / `.pn-modal-close`). L'état de la case, le
 * `createPortal` et l'appel à `/api/stripe/checkout` restent chez l'appelant
 * (`Pricing.tsx`).
 *
 * ⚠️ Trois règles, et elles tiennent ENSEMBLE :
 *   • la case n'est JAMAIS pré-cochée — l'appelant ouvre toujours la modale
 *     avec `checked = false` ; une case pré-cochée ne vaut pas demande expresse ;
 *   • le bouton de paiement est `disabled` tant qu'elle n'est pas cochée — et
 *     l'appelant re-vérifie dans son gestionnaire, et la route re-vérifie côté
 *     serveur (`checkConsent`) : trois barrières, dont une seule compte
 *     vraiment (la dernière) ;
 *   • `consentText` est affiché TEL QUEL depuis `checkout-consent.ts` — c'est
 *     exactement la chaîne que le serveur enregistrera. Ne jamais la
 *     reformuler ici, ni la faire passer par le dictionnaire.
 */
export interface CheckoutConsentLabels {
  /** Titre, avec `{tier}`. */
  title: string
  /** Libellé de la ligne de prix (« Prix »). */
  priceLabel: string
  /** Ligne sous le prix : reconduction et résiliation. */
  renewal: string
  /** Phrase d'accès aux CGV : texte avant le lien, texte du lien. */
  termsBefore: string
  termsLink: string
  confirm: string
  confirmLoading: string
  cancel: string
}

export default function CheckoutConsentModal({
  tierLabel, periodLabel, priceText, consentText, checked, pending, error,
  termsHref, labels, onToggle, onConfirm, onCancel,
}: {
  tierLabel: string
  periodLabel: string
  /** Prix déjà formaté, périodicité comprise (« 3€ /mois », « €30 /year »). */
  priceText: string
  consentText: string
  checked: boolean
  pending: boolean
  error: string | null
  termsHref: string
  labels: CheckoutConsentLabels
  onToggle: () => void
  onConfirm: () => void
  onCancel: () => void
}) {
  const canConfirm = checked && !pending

  return (
    // Clic sur le fond = annulation, comme les autres modales du site — sauf
    // pendant la redirection, où la page part déjà vers Stripe.
    <div className="pn-modal" onClick={pending ? undefined : onCancel}>
      <div
        className="pn-modal-inner"
        onClick={e => e.stopPropagation()}
        style={{ maxWidth: 520 }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="checkout-consent-title"
      >
        <button className="pn-modal-close" onClick={onCancel} disabled={pending} aria-label={labels.cancel}>
          <IconX size={18} />
        </button>

        <h3 id="checkout-consent-title" style={{
          fontSize: 17, fontWeight: 700, color: '#F5F2FA',
          margin: '0 40px 14px 0', lineHeight: 1.35,
        }}>
          {labels.title.replace('{tier}', tierLabel)}
        </h3>

        {/* Récapitulatif — l'information précontractuelle essentielle, sous les
            yeux au moment de décider : palier, périodicité, prix, reconduction. */}
        <div style={{
          fontSize: 13, color: '#F5F2FA', marginBottom: 16,
          padding: '10px 12px', borderRadius: 6,
          background: 'rgba(239,159,39,0.08)', border: '1px solid rgba(239,159,39,0.25)',
        }}>
          <div>
            <span style={{ color: '#E0AE5F' }}>{labels.priceLabel}</span>{' '}
            <strong>{priceText}</strong> · {periodLabel}
          </div>
          <div style={{ marginTop: 6, color: '#C9C6D2', fontSize: 12, lineHeight: 1.5 }}>
            {labels.renewal}
          </div>
        </div>

        {/* La case. `<label>` englobant : toute la phrase est cliquable, ce qui
            évite la case minuscule qu'on coche « pour passer ». */}
        <label style={{
          display: 'flex', gap: 10, alignItems: 'flex-start', cursor: pending ? 'default' : 'pointer',
          fontSize: 13, color: '#E4E2EA', lineHeight: 1.55, marginBottom: 12,
        }}>
          <input
            type="checkbox"
            checked={checked}
            onChange={onToggle}
            disabled={pending}
            style={{ marginTop: 3, width: 16, height: 16, flexShrink: 0, accentColor: '#EF9F27' }}
          />
          <span>{consentText}</span>
        </label>

        <p style={{ fontSize: 12, color: '#A5A3AE', margin: '0 0 18px' }}>
          {labels.termsBefore}{' '}
          <a href={termsHref} target="_blank" rel="noopener noreferrer"
            style={{ color: '#E0AE5F' }}>{labels.termsLink}</a>
        </p>

        {error && (
          <p role="alert" style={{ color: '#E24B4A', fontSize: 13, margin: '0 0 14px' }}>{error}</p>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            style={{
              padding: '8px 16px', borderRadius: 6, fontSize: 13,
              background: 'transparent', border: '1px solid #27272A',
              color: 'var(--text-muted)', cursor: pending ? 'default' : 'pointer', fontFamily: 'inherit',
            }}
          >{labels.cancel}</button>
          <button
            type="button"
            onClick={canConfirm ? onConfirm : undefined}
            disabled={!canConfirm}
            style={{
              padding: '8px 18px', borderRadius: 6, fontSize: 13, fontWeight: 600,
              background: '#EF9F27', border: 'none', color: '#1A1A1A',
              fontFamily: 'inherit',
              cursor: canConfirm ? 'pointer' : 'not-allowed',
              opacity: canConfirm ? 1 : 0.5,
            }}
          >{pending ? labels.confirmLoading : labels.confirm}</button>
        </div>
      </div>
    </div>
  )
}
