'use client'

import { IconX } from '@tabler/icons-react'

/**
 * Confirmation du LANCEMENT d'une feature.
 *
 * Sœur de `KillSwitchModal`, dont elle reprend la structure et surtout le
 * châssis partagé (`.pn-modal` / `.pn-modal-inner` / `.pn-modal-close` de
 * `globals.css`) — c'est là qu'est la vraie réutilisation. Un composant distinct
 * plutôt qu'un mode de plus dans `KillSwitchModal` : les deux gestes n'ont ni la
 * même couleur, ni le même contenu, ni la même condition de validation, et
 * fusionner produirait un composant à branches là où chacun est ici linéaire.
 *
 * ⚠️ AUCUN champ de motif, contrairement à une coupure. Deux raisons :
 *  1. un lancement est une annonce, pas un incident — il n'y a rien à expliquer
 *     à 9h du matin ;
 *  2. la colonne `reason` est le MOTIF DE COUPURE, relu tel quel par la carte
 *     d'un flag coupé. Y écrire une note de lancement afficherait « Motif : … »
 *     avec le texte d'une mise en ligne, le jour d'un vrai incident.
 *
 * La friction se limite donc à cette confirmation — elle existe parce que le
 * geste est IRRÉVERSIBLE : après lancement, le flag devient un kill switch et ne
 * redevient jamais un lancement.
 *
 * Présentationnel : ni Supabase ni catalogue, donc testable par
 * `renderToStaticMarkup` sans jsdom. Le `createPortal` reste chez l'appelant.
 */
export interface LaunchModalLabels {
  /** Gabarit du titre, avec `{label}`. */
  launchTitle: string
  /** Ce que le lancement rend visible. */
  launchImpactLabel: string
  launchImpactText: string
  /** Rappel que la transition ne se rejoue pas dans l'autre sens. */
  launchIrreversible: string
  launchConfirm: string
  launchCancel: string
}

export default function LaunchModal({
  flagLabel, labels, saving, onConfirm, onCancel,
}: {
  flagLabel: string
  labels: LaunchModalLabels
  saving: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
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
        <button className="pn-modal-close" onClick={onCancel} aria-label={labels.launchCancel}>
          <IconX size={18} />
        </button>

        <h3 style={{
          fontSize: 17, fontWeight: 700, color: '#F5F2FA',
          margin: '0 40px 14px 0', lineHeight: 1.35,
        }}>
          {labels.launchTitle.replace('{label}', flagLabel)}
        </h3>

        {/* Ce que ça va rendre visible — pendant exact du bloc d'impact de la
            modale de coupure, en or : c'est une ouverture, pas une alarme. */}
        {/* Mêmes valeurs de contraste que `KillSwitchModal`, transposées à l'or :
            couleurs en dur (le fond `.pn-modal-inner` est fixe, une variable de
            thème y faisait varier le contraste sans raison), libellé en teinte
            claire de l'or (8,34:1) et valeur en quasi-blanc (15,93:1). */}
        <div style={{
          fontSize: 12, color: '#F5F2FA', marginBottom: 14,
          padding: '10px 12px', borderRadius: 6,
          background: 'rgba(239,159,39,0.08)', border: '1px solid rgba(239,159,39,0.25)',
        }}>
          <span style={{ color: '#E0AE5F' }}>{labels.launchImpactLabel}</span>{' '}
          <span style={{ color: '#F5F2FA' }}>{labels.launchImpactText}</span>
        </div>

        {/* Le sens unique, dit AVANT le clic et pas après. Même gris neutre que
            la note de `KillSwitchModal` (7,61:1) : c'est le même niveau de
            hiérarchie, il ne doit pas se lire différemment d'une modale à
            l'autre — et c'est la note qu'il faut le MOINS rater des deux, le
            geste étant irréversible. */}
        <div style={{
          fontSize: 11, color: '#A5A3AE', fontStyle: 'italic', marginBottom: 20,
        }}>
          {labels.launchIrreversible}
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              padding: '8px 16px', borderRadius: 6, fontSize: 13,
              background: 'transparent', border: '1px solid #27272A',
              color: 'var(--text-muted)', cursor: 'pointer', fontFamily: 'inherit',
            }}
          >{labels.launchCancel}</button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={saving}
            style={{
              padding: '8px 18px', borderRadius: 6, fontSize: 13, fontWeight: 600,
              background: '#EF9F27', border: 'none', color: '#1A1A1A',
              fontFamily: 'inherit',
              cursor: saving ? 'not-allowed' : 'pointer',
              opacity: saving ? 0.6 : 1,
            }}
          >{saving ? '…' : labels.launchConfirm}</button>
        </div>
      </div>
    </div>
  )
}
