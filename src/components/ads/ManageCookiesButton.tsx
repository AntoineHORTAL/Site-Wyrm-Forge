'use client'

import { useState } from 'react'
import { reopenConsentBanner } from './ConsentManager'

/**
 * « Gérer les cookies » — rouvre la bannière de consentement.
 *
 * Exigence RGPD : un consentement doit pouvoir être RETIRÉ aussi facilement
 * qu'il a été donné. Sans ce point d'entrée, accepter serait définitif — la
 * bannière ne se représente pas d'elle-même une fois un choix enregistré.
 *
 * Placé dans le FOOTER, donc sur toutes les routes : le layout racine le monte
 * partout, vitrine, dashboard, pages légales et pages publiques comprises. Un
 * lien qui ne vivrait que sur la politique de confidentialité obligerait à
 * chercher, ce qui n'est pas « aussi facilement ».
 *
 * ⚠️ Rendu comme un `<button>` et non comme un `<a href="#">` : il n'y a pas de
 * page à atteindre, et un lien mort au clavier serait pire qu'un bouton.
 *
 * ⚠️ Si la CMP n'est pas chargée (script bloqué par une extension, réseau), on
 * le DIT au lieu de ne rien faire. Un bouton qui reste muet passe pour cassé, et
 * sur un sujet de consentement c'est exactement l'impression à éviter.
 */
export default function ManageCookiesButton({
  label, unavailableLabel, color,
}: {
  label: string
  /** Message affiché quand la bannière ne peut pas être rouverte. */
  unavailableLabel: string
  color: string
}) {
  const [unavailable, setUnavailable] = useState(false)

  if (unavailable) {
    return (
      <span role="status" style={{ color, fontSize: 12 }}>
        {unavailableLabel}
      </span>
    )
  }

  return (
    <button
      type="button"
      onClick={() => { if (!reopenConsentBanner()) setUnavailable(true) }}
      style={{
        background: 'none', border: 'none', padding: 0, cursor: 'pointer',
        fontFamily: 'inherit', fontSize: 12, color, textDecoration: 'none',
      }}
    >
      {label}
    </button>
  )
}
