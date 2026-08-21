'use client'

import { useTheme } from '@/components/providers/ThemeProvider'
import { useLanguage } from '@/components/providers/LanguageProvider'

/* Icônes seules : les titres, descriptions et tags vivent dans src/locales/landing.ts.
   L'ordre doit rester aligné sur celui de `features.items` du dictionnaire. */
const featureIcons: React.ReactNode[] = [
  <svg key="overlay" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
  </svg>,
  <svg key="paths" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
    <line x1="8" y1="2" x2="8" y2="18" /><line x1="16" y1="6" x2="16" y2="22" />
  </svg>,
  <svg key="ia" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="4" y="4" width="16" height="16" rx="2" /><rect x="9" y="9" width="6" height="6" />
    <line x1="9" y1="1" x2="9" y2="4" /><line x1="15" y1="1" x2="15" y2="4" />
    <line x1="9" y1="20" x2="9" y2="23" /><line x1="15" y1="20" x2="15" y2="23" />
    <line x1="20" y1="9" x2="23" y2="9" /><line x1="20" y1="14" x2="23" y2="14" />
    <line x1="1" y1="9" x2="4" y2="9" /><line x1="1" y1="14" x2="4" y2="14" />
  </svg>,
  <svg key="builds" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="12 2 2 7 12 12 22 7 12 2" /><polyline points="2 17 12 22 22 17" /><polyline points="2 12 12 17 22 12" />
  </svg>,
  <svg key="secure" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>,
]

export default function Features() {
  const { theme } = useTheme()
  const c = theme === 'mythic'
  const { t } = useLanguage()
  const f0 = t.features

  return (
    <section
      id="features"
      style={{
        padding: '88px 32px',
        background: c ? '#0A0612' : '#0F0F11',
        borderTop: c ? undefined : '1px solid #1F1F23',
        borderBottom: c ? undefined : '1px solid #1F1F23',
      }}
    >
      <div style={{ maxWidth: 1180, margin: '0 auto 48px' }}>
        <span className="land-eyebrow">{f0.eyebrow}</span>
        <h2
          className="font-mythic"
          style={{ fontSize: c ? 'clamp(30px, 5vw, 46px)' : 'clamp(26px, 4.5vw, 38px)', fontWeight: 600, margin: '0 0 14px', color: '#F5F2FA', maxWidth: 640, letterSpacing: c ? undefined : '-0.5px' }}
        >
          {f0.titleBefore}<span className="accent-text">{f0.titleAccent}</span>{f0.titleAfter}
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: 16, maxWidth: 540, margin: 0 }}>
          {f0.subtitle}
        </p>
      </div>

      <div className="land-features-grid">
        {f0.items.map((f, i) => (
          <div key={i} className="wf-card" style={{ padding: '26px 24px' }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 11,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 18,
                background: c ? 'rgba(186,117,23,0.12)' : '#18181B',
                border: c ? '1px solid rgba(186,117,23,0.3)' : '1px solid #27272A',
                color: c ? '#EF9F27' : '#7F77DD',
              }}
            >
              {featureIcons[i]}
            </div>
            <h3 style={{ fontSize: c ? 19 : 16, fontWeight: 600, margin: '0 0 10px', color: '#F5F2FA', fontFamily: c ? 'var(--font-serif)' : undefined, letterSpacing: c ? '0.3px' : undefined }}>
              {f.title}
            </h3>
            <p style={{ color: 'var(--text-muted)', fontSize: 14, lineHeight: 1.6, margin: f.tags.length ? '0 0 14px' : 0 }}>
              {f.desc}
            </p>
            {f.tags.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {f.tags.map((t) => (
                  <span
                    key={t}
                    style={{
                      fontSize: 11,
                      padding: '4px 10px',
                      borderRadius: 6,
                      color: 'var(--text-muted)',
                      background: c ? 'rgba(20,10,35,0.6)' : '#1B1B1F',
                      border: c ? '1px solid rgba(186,117,23,0.2)' : '1px solid #27272A',
                    }}
                  >
                    {t}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}
