'use client'

import { useTheme } from '@/components/providers/ThemeProvider'
import { useLanguage } from '@/components/providers/LanguageProvider'

/* Icônes seules : les titres, descriptions et tags vivent dans src/locales/landing.ts.

   DEUX tableaux, appariés PAR POSITION à deux listes distinctes du dictionnaire :
     `featureIcons` ↔ `features.items` (6 cartes pleines)
     `moreIcons`    ↔ `features.more`  (6 entrées compactes)
   Une longueur qui diverge est attrapée par landing.test.ts, pas par le rendu. */
const featureIcons: React.ReactNode[] = [
  <svg key="overlay" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
  </svg>,
  <svg key="pathing" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 20 L9 12 L14 16 L20 5" />
    <circle cx="4" cy="20" r="1.6" /><circle cx="9" cy="12" r="1.6" />
    <circle cx="14" cy="16" r="1.6" /><circle cx="20" cy="5" r="1.6" />
  </svg>,
  <svg key="live" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M6.5 6.5a7.8 7.8 0 0 0 0 11M17.5 6.5a7.8 7.8 0 0 1 0 11" />
    <path d="M3.5 3.5a12 12 0 0 0 0 17M20.5 3.5a12 12 0 0 1 0 17" />
  </svg>,
  <svg key="ia" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="4" y="4" width="16" height="16" rx="2" /><rect x="9" y="9" width="6" height="6" />
    <line x1="9" y1="1" x2="9" y2="4" /><line x1="15" y1="1" x2="15" y2="4" />
    <line x1="9" y1="20" x2="9" y2="23" /><line x1="15" y1="20" x2="15" y2="23" />
    <line x1="20" y1="9" x2="23" y2="9" /><line x1="20" y1="14" x2="23" y2="14" />
    <line x1="1" y1="9" x2="4" y2="9" /><line x1="1" y1="14" x2="4" y2="14" />
  </svg>,
  <svg key="history" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="7" /><line x1="16.5" y1="16.5" x2="21" y2="21" />
    <path d="M11 8v3.2l2.2 1.3" />
  </svg>,
  <svg key="champselect" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="7" height="16" rx="1.5" /><rect x="14" y="4" width="7" height="16" rx="1.5" />
    <path d="M12 9v6" />
  </svg>,
]

/* Icônes de la liste compacte — 16px, même trait, appariées à `features.more`. */
const moreIcons: React.ReactNode[] = [
  <svg key="paths" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
    <line x1="8" y1="2" x2="8" y2="18" /><line x1="16" y1="6" x2="16" y2="22" />
  </svg>,
  <svg key="builds" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="12 2 2 7 12 12 22 7 12 2" /><polyline points="2 17 12 22 22 17" /><polyline points="2 12 12 17 22 12" />
  </svg>,
  <svg key="champions" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7.5" height="7.5" rx="1.5" /><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" />
    <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" /><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" />
  </svg>,
  <svg key="patchnotes" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 2h9l4 4v16H6z" /><polyline points="15 2 15 6 19 6" />
    <line x1="9.5" y1="12" x2="15.5" y2="12" /><line x1="9.5" y1="16" x2="15.5" y2="16" />
  </svg>,
  <svg key="routine" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 7.5l2 2 3.5-3.5" /><path d="M3 17.5l2 2 3.5-3.5" />
    <line x1="12" y1="8" x2="21" y2="8" /><line x1="12" y1="18" x2="21" y2="18" />
  </svg>,
  <svg key="secure" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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

      {/* ── Liste compacte ──
          Le reste des fonctionnalités livrées, en une ligne chacune. Douze cartes
          pleines écrasaient la section (quatre rangées) et mettaient sur le même
          plan visuel l'overlay et les patch notes. Ici rien n'est masqué derrière
          un clic : pas d'état React, tout est dans le HTML servi — un crawler, un
          lecteur d'écran et un relecteur Riot voient la liste entière. */}
      <div className="land-features-more">
        <div className="land-features-more-title">{f0.moreTitle}</div>
        <div className="land-features-more-grid">
          {f0.more.map((m, i) => (
            <div key={m.title} className="land-features-more-item">
              <span
                className="land-features-more-icon"
                style={{ color: c ? '#BA7517' : '#7F77DD' }}
                aria-hidden
              >
                {moreIcons[i]}
              </span>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#F5F2FA', marginBottom: 2 }}>
                  {m.title}
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  {m.desc}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
