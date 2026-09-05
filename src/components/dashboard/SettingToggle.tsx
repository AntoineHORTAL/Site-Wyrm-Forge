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
  /** Contenu additionnel sous la description (impact, auteur de la coupure, motif). */
  children?:   ReactNode
}

export default function SettingToggle({
  label, description, settingKey, value, saving, loading, onToggle, border, bg,
  variant = 'setting', stateLabel, locked = false, lockedHint, indented = false, children,
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
        <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{description}</div>
        {locked && lockedHint && (
          <div style={{ fontSize: 10, color: 'var(--text-dim)', fontStyle: 'italic', marginTop: 4 }}>
            {lockedHint}
          </div>
        )}
        {children}
      </div>
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
    </div>
  )
}
