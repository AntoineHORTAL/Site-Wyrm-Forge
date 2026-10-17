/**
 * Encart d'échec d'écriture du panneau admin (flags et réglages).
 *
 * Partagé par les deux modales et par le panneau lui-même, pour qu'un refus de
 * la base se lise partout de la même façon. `role="alert"` : l'échec est annoncé
 * aux lecteurs d'écran au moment où il arrive, pas seulement affiché.
 *
 * Couleurs en dur, comme le reste des modales : leur fond `.pn-modal-inner` est
 * fixe, une variable de thème y ferait varier le contraste sans raison.
 */
export default function WriteErrorNotice({
  message, onDismiss, dismissLabel,
}: {
  message: string
  /** Absent dans les modales : leurs boutons Annuler / Confirmer suffisent. */
  onDismiss?: () => void
  dismissLabel?: string
}) {
  return (
    <div
      role="alert"
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 12,
        fontSize: 12, color: '#F5F2FA', marginBottom: 14,
        padding: '10px 12px', borderRadius: 6,
        background: 'rgba(226,75,74,0.12)', border: '1px solid rgba(226,75,74,0.45)',
      }}
    >
      <span style={{ flex: 1 }}>{message}</span>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          style={{
            flexShrink: 0, padding: '2px 10px', borderRadius: 4, fontSize: 11,
            background: 'transparent', border: '1px solid rgba(226,75,74,0.45)',
            color: '#F5F2FA', cursor: 'pointer', fontFamily: 'inherit',
          }}
        >{dismissLabel}</button>
      )}
    </div>
  )
}
