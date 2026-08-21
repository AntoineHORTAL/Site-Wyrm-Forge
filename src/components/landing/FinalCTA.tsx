'use client'

import { useTheme } from '@/components/providers/ThemeProvider'
import { useLanguage } from '@/components/providers/LanguageProvider'
import { WINDOWS_DOWNLOAD_URL } from '@/lib/download'

const WindowsIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <rect x="3" y="3" width="8" height="8" rx="1" />
    <rect x="13" y="3" width="8" height="8" rx="1" />
    <rect x="3" y="13" width="8" height="8" rx="1" />
    <rect x="13" y="13" width="8" height="8" rx="1" />
  </svg>
)

export default function FinalCTA() {
  const { theme } = useTheme()
  const c = theme === 'mythic'
  const { t } = useLanguage()
  const f = t.finalCta

  return (
    <section id="telecharger" style={{ padding: '64px 32px', background: c ? '#0A0612' : '#0F0F11' }}>
      <div
        style={{
          position: 'relative',
          overflow: 'hidden',
          maxWidth: 880,
          margin: '0 auto',
          borderRadius: 20,
          background: c ? '#0A0612' : '#121214',
          border: c ? '1px solid rgba(186,117,23,0.3)' : '1px solid #27272A',
        }}
      >
        {/* Fond dragon */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            backgroundImage: 'url(/hero-dragon.jpg)',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            opacity: c ? 0.6 : 0.35,
          }}
        />
        {/* Calque de lisibilité — assombrit pour le texte centré, garde une lueur or en bas */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            background: c
              ? 'radial-gradient(ellipse at 50% 118%, rgba(186,117,23,0.28) 0%, rgba(18,7,38,0.72) 48%, rgba(10,6,18,0.9) 100%)'
              : 'radial-gradient(ellipse at 50% 50%, rgba(18,18,20,0.72) 0%, rgba(18,18,20,0.9) 100%)',
          }}
        />

        <div style={{ position: 'relative', zIndex: 1, padding: 'clamp(40px, 6vw, 64px) 32px', textAlign: 'center' }}>
          <span className="land-eyebrow">{f.eyebrow}</span>

          <h2
            className="font-mythic"
            style={{ fontSize: c ? 'clamp(30px, 5vw, 48px)' : 'clamp(26px, 4.5vw, 38px)', fontWeight: 600, margin: '0 0 16px', color: '#F5F2FA', letterSpacing: c ? undefined : '-0.5px' }}
          >
            {f.titleBefore}<span className="accent-text">{f.titleAccent}</span>{f.titleAfter}
          </h2>

          <p style={{ color: 'var(--text-muted)', fontSize: 16, maxWidth: 520, margin: '0 auto 32px', lineHeight: 1.6 }}>
            {f.subtitle}
          </p>

          <div style={{ display: 'flex', gap: 16, justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap' }}>
            <a href={WINDOWS_DOWNLOAD_URL} download className="wf-btn-gold">
              <WindowsIcon />
              {f.ctaDownload}
            </a>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-dim)' }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <rect x="2" y="3" width="20" height="14" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" />
              </svg>
              {f.note}
            </span>
          </div>
        </div>
      </div>
    </section>
  )
}
