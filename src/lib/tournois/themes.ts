// themes — presets de thème BORNÉS pour les séries de tournois.
//
// ┌─ POURQUOI PAS DE CSS LIBRE EN BASE ? ───────────────────────────────────────┐
// │ Une chaîne CSS/HTML stockée puis injectée = faille d'injection (style/script)│
// │ + dette ingérable. Ici un thème = un PRESET (clé d'une liste fermée définie  │
// │ dans CE fichier) + au plus 2 couleurs override validées par regex hex.       │
// │ Rien d'autre venant de la base n'est jamais interprété comme du CSS.         │
// └─────────────────────────────────────────────────────────────────────────────┘
//
// ┌─ COMMENT AJOUTER UN PRESET ? ───────────────────────────────────────────────┐
// │ 1. Ajouter la clé au type ThemePreset + au tableau THEME_PRESETS ci-dessous. │
// │ 2. Ajouter son jeu de tokens dans PRESETS (valeurs hex EN DUR).              │
// │ 3. Ajouter la clé au CHECK chk_series_theme_preset (migration SQL) ET à la   │
// │    liste de validation de l'Edge Function tournament-admin.                  │
// │ C'est une PR code, jamais une écriture en base.                              │
// └─────────────────────────────────────────────────────────────────────────────┘
//
// Chaque preset mappe vers les variables --xv2-* (mêmes noms que le design system),
// donc tous les composants XV2 existants se recolorent automatiquement.

import type { CSSProperties } from 'react'

export type ThemePreset = 'xv2' | 'neon' | 'forge' | 'ocean' | 'ember'

export const THEME_PRESETS: ThemePreset[] = ['xv2', 'neon', 'forge', 'ocean', 'ember']

export const HEX_RE = /^#[0-9a-fA-F]{6}$/

interface PresetTokens {
  pink:        string   // dominante (--xv2-pink) — override possible via theme_primary
  blue:        string   // accent (--xv2-blue) — override possible via theme_accent
  bgDark:      string
  swirlPlum:   string
  panelPurple: string
  blueNight:   string
  blueLight:   string
}

// xv2 = valeurs ACTUELLES du design system → zéro régression visuelle.
const PRESETS: Record<ThemePreset, PresetTokens> = {
  xv2: {
    pink: '#f06ad8', blue: '#2f6fde', bgDark: '#14091c', swirlPlum: '#2b1135',
    panelPurple: '#7b3f8f', blueNight: '#1c3a6e', blueLight: '#8fc6f5',
  },
  neon: {
    pink: '#ff2d95', blue: '#00e5ff', bgDark: '#0a0a16', swirlPlum: '#161645',
    panelPurple: '#2c2c78', blueNight: '#10103a', blueLight: '#7df9ff',
  },
  forge: {
    pink: '#ff7a18', blue: '#f0b429', bgDark: '#190f0a', swirlPlum: '#2b1505',
    panelPurple: '#7a3f1a', blueNight: '#3a1f0a', blueLight: '#f5c98f',
  },
  ocean: {
    pink: '#19c3a6', blue: '#2f8fde', bgDark: '#08141a', swirlPlum: '#0e2a35',
    panelPurple: '#1a5a6a', blueNight: '#0a2a3a', blueLight: '#8fd6f5',
  },
  ember: {
    pink: '#ff3b3b', blue: '#ff8c42', bgDark: '#160a0a', swirlPlum: '#350e0e',
    panelPurple: '#7a1a1a', blueNight: '#3a0a0a', blueLight: '#f5a08f',
  },
}

/** Normalise un preset venant de la base contre la liste fermée (fallback 'xv2'). */
export function safePreset(preset: string | null | undefined): ThemePreset {
  return preset && (THEME_PRESETS as string[]).includes(preset) ? (preset as ThemePreset) : 'xv2'
}

// Représente les variables CSS comme un objet de style (custom properties).
type CSSVarStyle = CSSProperties & Record<`--${string}`, string>

/**
 * Résout les variables CSS à appliquer sur un CONTENEUR racine (scoping local).
 * preset (liste fermée, fallback xv2) PUIS override des 2 couleurs clés si hex valide.
 * Aucune valeur non validée ne sort d'ici.
 */
export function resolveThemeVars(
  preset: string | null | undefined,
  primary: string | null | undefined,
  accent: string | null | undefined,
): CSSVarStyle {
  const t = PRESETS[safePreset(preset)]
  const pink = primary && HEX_RE.test(primary) ? primary : t.pink
  const blue = accent && HEX_RE.test(accent) ? accent : t.blue
  return {
    '--xv2-pink':         pink,
    '--xv2-blue':         blue,
    '--xv2-bg-dark':      t.bgDark,
    '--xv2-swirl-plum':   t.swirlPlum,
    '--xv2-panel-purple': t.panelPurple,
    '--xv2-blue-night':   t.blueNight,
    '--xv2-blue-light':   t.blueLight,
  }
}
