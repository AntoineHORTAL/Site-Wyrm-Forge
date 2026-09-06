import type { ReactNode } from 'react'

/**
 * Interrupteur de réglage ou de feature flag du panneau admin.
 *
 * Sorti d'AdminTab pour deux raisons. La première est qu'il est devenu un vrai
 * composant réutilisable, partagé par les trois usages du panneau. La seconde est
 * qu'il est ainsi TESTABLE en isolation : `SettingToggle.test.tsx` le rend via
 * `renderToStaticMarkup`, sans avoir à monter AdminTab (et donc sans Supabase, ni
 * portail, ni jsdom) — le patron déjà employé par `LiveComposition.test.tsx`.
 */
/**
 * Variante visuelle d'un interrupteur. UN seul composant pour les trois usages —
 * réglage, lancement, kill switch — parce qu'ils partagent exactement le même
 * rendu et le même comportement de bascule ; seules l'accentuation et la pastille
 * d'état changent. Dupliquer le composant aurait fait diverger le toggle lui-même
 * à la première retouche.
 */
export type ToggleVariant = 'setting' | 'launch' | 'kill'

/** Accent de la variante — l'or des lancements, le rouge des coupures. */
const VARIANT_ACCENT: Record<ToggleVariant, string> = {
  setting: '#5DCAA5',
  launch:  '#EF9F27',
  kill:    '#E24B4A',
}

interface SettingToggleProps {
  label:       string
  description: string
  settingKey:  string
  value:       boolean
  saving:      boolean
  loading:     boolean
  onToggle:    (key: string) => void
  border:      string
  bg:          string
  /** Défaut `'setting'` : l'appel historique de `patch_auto_publish` est inchangé. */
  variant?:    ToggleVariant
  /** Pastille d'état à droite du libellé (« en ligne », « ⚠ COUPÉ »…). */
  stateLabel?: string
  /** Verrouillé par un parent coupé : grisé, non cliquable, avec sa raison. */
  locked?:     boolean
  lockedHint?: string
  /** Indentation d'un enfant sous son maître. */
  indented?:   boolean
  /**
   * Remplace l'interrupteur par un BOUTON D'ACTION portant ce libellé.
   *
   * Utilisé par les flags de lancement, qui ne sont pas réversibles : lancer une
   * feature la fait passer en kill switch, il n'existe pas de geste inverse. Un
   * interrupteur promettrait le contraire — on peut le rebasculer, donc on croit
   * pouvoir « délancer ». Le reste de la carte (chrome, pastille d'état,
   * `children`) est strictement identique : c'est la même liste, seul le
   * contrôle change.
   */
  actionLabel?: string
  /** Contenu additionnel sous la description (impact, auteur de la coupure, motif). */
  children?:   ReactNode
}

export default function SettingToggle({
  label, description, settingKey, value, saving, loading, onToggle, border, bg,
  variant = 'setting', stateLabel, locked = false, lockedHint, indented = false,
  actionLabel, children,
}: SettingToggleProps) {
  const accent = VARIANT_ACCENT[variant]
  const disabled = saving || loading || locked

  // Un kill switch COUPÉ est le seul état qui doit sauter aux yeux : c'est une
  // anomalie en cours, pas un réglage. Les autres restent discrets.
  const alarmed = variant === 'kill' && !value

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
      padding: '12px 16px', borderRadius: 8,
      marginLeft: indented ? 24 : 0,
      background: alarmed ? 'rgba(226,75,74,0.06)' : bg,
      border: `1px solid ${alarmed ? 'rgba(226,75,74,0.45)' : border}`,
      gap: 16, flexWrap: 'wrap',
      opacity: locked ? 0.45 : 1,
      transition: 'opacity 0.15s, border-color 0.15s',
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 2 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#F5F2FA' }}>{label}</span>
          {stateLabel && (
            <span style={{
              fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.8,
              padding: '2px 7px', borderRadius: 20, whiteSpace: 'nowrap',
              background: alarmed ? '#E24B4A' : 'rgba(255,255,255,0.06)',
              color: alarmed ? 'white' : (value ? accent : 'var(--text-dim)'),
              fontWeight: alarmed ? 700 : 500,
            }}>{stateLabel}</span>
          )}
        </div>
        {/* ⚠️ `#A5A3AE` en dur, et non `var(--text-dim)` : cette variable
            descendait à 3,67:1 en thème `classic` (5,21:1 en `mythic`), donc
            sous le seuil AA de 4,5:1 pour du texte de 10-11 px. Le gris neutre
            opaque tient 7,13:1 dans les DEUX thèmes.
            Neutre et non teinté par variante : cette description est partagée
            par les trois usages (réglage, lancement, kill switch) — la colorer
            introduirait une distinction qui n'existe pas aujourd'hui. C'est le
            même gris que les notes de bas des deux modales. */}
        <div style={{ fontSize: 11, color: '#A5A3AE' }}>{description}</div>
        {locked && lockedHint && (
          <div style={{ fontSize: 10, color: '#A5A3AE', fontStyle: 'italic', marginTop: 4 }}>
            {lockedHint}
          </div>
        )}
        {children}
      </div>
      {actionLabel ? (
        // Bouton d'action : pas d'`aria-pressed`, qui décrirait un état
        // basculable. Ce bouton DÉCLENCHE quelque chose, il ne reflète rien.
        <button
          type="button"
          onClick={() => onToggle(settingKey)}
          disabled={disabled}
          aria-label={`${actionLabel} — ${label}`}
          style={{
            flexShrink: 0,
            padding: '8px 18px', borderRadius: 6,
            fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
            background: accent, border: 'none', color: '#1A1A1A',
            cursor: disabled ? 'not-allowed' : 'pointer',
            opacity: saving || loading ? 0.6 : 1,
            transition: 'opacity 0.15s',
          }}
        >
          {saving ? '…' : actionLabel}
        </button>
      ) : (
      <button
        onClick={() => onToggle(settingKey)}
        disabled={disabled}
        aria-pressed={value}
        aria-label={label}
        style={{
          flexShrink: 0,
          width: 52, height: 28, borderRadius: 14,
          background: value ? accent : '#3F3F46',
          border: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
          position: 'relative', transition: 'background 0.2s',
          opacity: saving || loading ? 0.6 : 1,
        }}
      >
        <span style={{
          position: 'absolute',
          top: 3, left: value ? 27 : 3,
          width: 22, height: 22, borderRadius: '50%',
          background: 'white', transition: 'left 0.2s',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 9, color: value ? accent : '#71717A',
        }}>
          {saving ? '…' : (value ? '✓' : '')}
        </span>
      </button>
      )}
    </div>
  )
}
