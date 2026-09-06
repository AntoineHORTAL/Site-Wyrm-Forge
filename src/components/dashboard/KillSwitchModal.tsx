'use client'

import { IconX } from '@tabler/icons-react'
import { canSubmitCut } from '@/lib/admin-flags'

/**
 * Confirmation d'une coupure de kill switch.
 *
 * ⚠️ La friction est le POINT du composant, pas un effet de bord. Couper une
 * feature livrée est une action d'incident : elle demande un motif, et ce motif
 * sera relu au retour à la normale. C'est ce qui rend une coupure de 2h du matin
 * explicable à 9h.
 *
 * Réutilise le patron de modale déjà en place dans le dépôt (`.pn-modal` /
 * `.pn-modal-inner` / `.pn-modal-close` de `globals.css`, portalisées sur
 * `document.body` par `PatchNotesTab` et par la prévisualisation d'AdminTab)
 * plutôt que d'en inventer un second. Seule la largeur est resserrée en inline :
 * `.pn-modal-inner` est calibrée pour une prévisualisation de patch note à 920 px,
 * beaucoup trop large pour une question fermée — et cette classe est partagée,
 * y compris par les règles d'impression, donc on ne la modifie pas.
 *
 * ⚠️ Ce composant est PRÉSENTATIONNEL : il ne connaît ni Supabase ni le catalogue.
 * C'est ce qui le rend testable via `renderToStaticMarkup`, sans jsdom — le patron
 * de `SettingToggle.test.tsx` et de `LiveComposition.test.tsx`.
 *
 * Le `createPortal` reste chez l'appelant, sous sa garde `mounted` : `document`
 * n'existe pas au rendu serveur.
 */
export interface KillSwitchModalLabels {
  /** Gabarit du titre, avec `{label}`. */
  cutTitle: string
  cutReasonLabel: string
  cutReasonHint: string
  cutReasonPlaceholder: string
  cutConfirm: string
  cutCancel: string
  impactLabel: string
  /** Phrase d'impact déjà résolue depuis `off_behavior` par l'appelant. */
  impactText: string
}

export default function KillSwitchModal({
  flagLabel, labels, reason, saving, onReasonChange, onConfirm, onCancel,
}: {
  flagLabel: string
  labels: KillSwitchModalLabels
  reason: string
  saving: boolean
  onReasonChange: (value: string) => void
  onConfirm: () => void
  onCancel: () => void
}) {
  // La même garde que celle appliquée avant l'envoi dans `AdminTab.confirmCut`.
  // Elle est ici pour l'ÉTAT du bouton ; là-bas pour l'écriture. Un bouton
  // réactivé par les outils de développement ne suffit donc pas à couper sans motif.
  const ready = canSubmitCut(reason)

  return (
    // Clic sur le fond = annulation, comme les autres modales du site.
    <div className="pn-modal" onClick={onCancel}>
      <div
        className="pn-modal-inner"
        onClick={e => e.stopPropagation()}
        style={{ maxWidth: 480 }}
        role="dialog"
        aria-modal="true"
        aria-label={flagLabel}
      >
        <button className="pn-modal-close" onClick={onCancel} aria-label={labels.cutCancel}>
          <IconX size={18} />
        </button>

        <h3 style={{
          fontSize: 17, fontWeight: 700, color: '#F5F2FA',
          margin: '0 40px 14px 0', lineHeight: 1.35,
        }}>
          {labels.cutTitle.replace('{label}', flagLabel)}
        </h3>

        {/* Ce que ça va casser — rappelé ICI et pas seulement sur la carte :
            c'est le dernier moment où l'admin peut encore reculer. */}
        {/* ⚠️ Couleurs en dur, et non `var(--text-muted)` / `opacity` : le fond de
            `.pn-modal-inner` est `#130f1a` FIXE (aucune surcharge par thème), donc
            un texte piloté par une variable de thème voyait son contraste changer
            sans que le fond bouge. En thème `classic`, le libellé tombait à
            4,42:1 — sous le seuil AA. Fixer les deux extrémités du couple le
            verrouille dans les deux thèmes.
            Libellé en teinte claire du rouge (7,39:1), valeur en quasi-blanc
            (15,93:1) : la valeur reste ce qu'on lit en premier dans l'encart. */}
        <div style={{
          fontSize: 12, color: '#F5F2FA', marginBottom: 18,
          padding: '10px 12px', borderRadius: 6,
          background: 'rgba(226,75,74,0.08)', border: '1px solid rgba(226,75,74,0.25)',
        }}>
          <span style={{ color: '#E8908D' }}>{labels.impactLabel}</span>{' '}
          <span style={{ color: '#F5F2FA' }}>{labels.impactText}</span>
        </div>

        <label
          htmlFor="kill-switch-reason"
          style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}
        >
          {labels.cutReasonLabel}
        </label>
        <input
          id="kill-switch-reason"
          value={reason}
          onChange={e => onReasonChange(e.target.value)}
          placeholder={labels.cutReasonPlaceholder}
          autoFocus
          required
          aria-required="true"
          style={{
            width: '100%', padding: '9px 12px', borderRadius: 6, fontSize: 13,
            background: 'rgba(0,0,0,0.3)', border: '1px solid #27272A',
            color: '#F5F2FA', fontFamily: 'inherit', marginBottom: 6,
          }}
        />
        {/* Note de bas de modale. `var(--text-dim)` tombait à 3,91:1 en thème
            `classic` — illisible sur ce fond. Gris neutre opaque à 7,61:1 : bien
            au-dessus d'AA, et volontairement en retrait du quasi-blanc de
            l'encart pour garder la hiérarchie titre > impact > note. */}
        <div style={{ fontSize: 11, color: '#A5A3AE', fontStyle: 'italic', marginBottom: 20 }}>
          {labels.cutReasonHint}
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            style={{
              padding: '8px 16px', borderRadius: 6, fontSize: 13,
              background: 'transparent', border: '1px solid #27272A',
              color: 'var(--text-muted)', cursor: 'pointer', fontFamily: 'inherit',
            }}
          >{labels.cutCancel}</button>
          <button
            onClick={onConfirm}
            disabled={!ready || saving}
            style={{
              padding: '8px 18px', borderRadius: 6, fontSize: 13, fontWeight: 600,
              background: ready ? '#E24B4A' : 'rgba(226,75,74,0.25)',
              border: 'none', color: 'white', fontFamily: 'inherit',
              cursor: ready && !saving ? 'pointer' : 'not-allowed',
              opacity: saving ? 0.6 : 1,
            }}
          >{saving ? '…' : labels.cutConfirm}</button>
        </div>
      </div>
    </div>
  )
}
