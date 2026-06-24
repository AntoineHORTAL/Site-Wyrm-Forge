'use client'

import { useTheme } from '@/components/providers/ThemeProvider'

const trust = [
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 12 20 22 4 22 4 12" /><rect x="2" y="7" width="20" height="5" />
        <line x1="12" y1="22" x2="12" y2="7" /><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" /><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" />
      </svg>
    ),
    title: '100% Gratuit',
    desc: 'Aucun abonnement, aucun paywall. Toutes les fonctionnalités, pour toujours.',
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 12l2 2 4-4" /><path d="M12 2l2.4 1.8 3 .2.2 3L19.4 9.6 21 12l-1.4 2.4-.8 3-3 .2L12 19.4 9.6 21l-2.4-1.6-3-.2-.8-3L1 12l1.4-2.4.2-3 3-.2L9 2.6 12 2" />
      </svg>
    ),
    title: 'API Officielle Riot',
    desc: 'Connecté à l\'API officielle de Riot Games. Données légitimes et conformes.',
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    ),
    title: 'Sans Ban',
    desc: 'Pas d\'injection mémoire ni de triche. Ton compte ne risque rien.',
  },
]

export default function Community() {
  const { theme } = useTheme()
  const c = theme === 'mythic'

  return (
    <section
      id="communaute"
      style={{
        padding: '88px 32px',
        background: c
          ? 'linear-gradient(180deg, #0A0612 0%, #120726 50%, #0A0612 100%)'
          : '#0F0F11',
        borderTop: c ? undefined : '1px solid #1F1F23',
        borderBottom: c ? undefined : '1px solid #1F1F23',
      }}
    >
      <div style={{ textAlign: 'center', marginBottom: 48 }}>
        <span className="land-eyebrow">Confiance &amp; légitimité</span>
        <h2
          className="font-mythic"
          style={{ fontSize: c ? 'clamp(28px, 4.5vw, 42px)' : 'clamp(24px, 4vw, 36px)', fontWeight: 600, margin: 0, color: '#F5F2FA', maxWidth: 680, marginLeft: 'auto', marginRight: 'auto', letterSpacing: c ? undefined : '-0.5px' }}
        >
          Rejoins une <span className="accent-text">communauté</span> qui grimpe.
        </h2>
      </div>

      <div className="land-trust-grid">
        {trust.map((t) => (
          <div key={t.title} className="wf-card" style={{ padding: '24px 22px' }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 16,
                background: c ? 'rgba(186,117,23,0.12)' : '#18181B',
                border: c ? '1px solid rgba(186,117,23,0.3)' : '1px solid #27272A',
                color: c ? '#EF9F27' : '#7F77DD',
              }}
            >
              {t.icon}
            </div>
            <h3 style={{ fontSize: c ? 18 : 15, fontWeight: 600, margin: '0 0 8px', color: '#F5F2FA', fontFamily: c ? 'var(--font-serif)' : undefined, letterSpacing: c ? '0.3px' : undefined }}>
              {t.title}
            </h3>
            <p style={{ color: 'var(--text-muted)', fontSize: 14, lineHeight: 1.6, margin: 0 }}>
              {t.desc}
            </p>
          </div>
        ))}
      </div>
    </section>
  )
}
