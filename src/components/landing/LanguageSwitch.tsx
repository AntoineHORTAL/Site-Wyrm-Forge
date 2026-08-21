'use client'

import { useTheme } from '@/components/providers/ThemeProvider'
import { useLanguage } from '@/components/providers/LanguageProvider'
import type { Lang } from '@/locales/landing'

const LANGS: Lang[] = ['fr', 'en']

/**
 * Bascule FR / EN de la vitrine.
 *
 * Repique le segmented control déjà utilisé pour Mensuel/Annuel dans Pricing.tsx
 * (pilule arrondie, segment actif en dégradé or sur texte sombre) pour rester dans
 * la charte, en version compacte puisqu'il vit dans le header.
 *
 * `full` étale le contrôle sur toute la largeur — utilisé dans le drawer mobile.
 */
export default function LanguageSwitch({ full = false }: { full?: boolean }) {
  const { theme } = useTheme()
  const c = theme === 'mythic'
  const { lang, setLang, t } = useLanguage()

  const segBtn = (active: boolean): React.CSSProperties => ({
    padding: full ? '8px 0' : '4px 10px',
    flex: full ? 1 : undefined,
    borderRadius: 100,
    border: 'none',
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: 0.5,
    lineHeight: 1.4,
    background: active
      ? c ? 'linear-gradient(135deg, var(--gold-light), var(--gold-pale))' : '#FAFAFA'
      : 'transparent',
    color: active ? (c ? '#1a0f02' : '#09090B') : 'var(--text-muted)',
    transition: 'background 0.15s, color 0.15s',
  })

  return (
    <div
      role="group"
      aria-label={t.nav.langLabel}
      style={{
        display: 'flex',
        width: full ? '100%' : undefined,
        padding: 3,
        gap: 3,
        borderRadius: 100,
        background: c ? 'rgba(20,10,35,0.6)' : '#18181B',
        border: c ? '1px solid rgba(186,117,23,0.25)' : '1px solid #27272A',
      }}
    >
      {LANGS.map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => setLang(l)}
          aria-pressed={lang === l}
          title={l === 'fr' ? t.nav.langFrTitle : t.nav.langEnTitle}
          style={segBtn(lang === l)}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  )
}
