'use client'

import { useTheme } from '@/components/providers/ThemeProvider'

export default function Hero({ onLogin }: { onLogin: () => void }) {
  const { theme } = useTheme()

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <section
      style={{
        padding: '80px 48px 100px',
        textAlign: 'center',
        overflow: 'hidden',
        position: 'relative',
        background: theme === 'mythic'
          ? 'radial-gradient(ellipse at top, #2A1547 0%, #150828 40%, #0A0612 80%)'
          : '#09090B',
      }}
    >
      {theme === 'mythic' && (
        <div style={{
          position: 'absolute', inset: 0,
          background: `
            radial-gradient(ellipse at 30% 60%, rgba(127,119,221,0.15) 0%, transparent 50%),
            radial-gradient(ellipse at 70% 40%, rgba(186,117,23,0.08) 0%, transparent 50%)
          `,
          pointerEvents: 'none',
        }} />
      )}

      <div style={{ position: 'relative', zIndex: 2, maxWidth: 900, margin: '0 auto' }}>
        <span style={{
          display: 'inline-block',
          fontSize: 12, letterSpacing: 2, textTransform: 'uppercase',
          marginBottom: 24, padding: '6px 16px', borderRadius: 20,
          color: theme === 'mythic' ? '#BA7517' : '#A1A1AA',
          border: theme === 'mythic' ? '1px solid rgba(186,117,23,0.3)' : '1px solid #27272A',
          background: theme === 'mythic' ? 'rgba(186,117,23,0.05)' : '#18181B',
        }}>
          Assistant LoL · Windows
        </span>

        <h1
          className="font-mythic"
          style={{
            fontSize: theme === 'mythic' ? 'clamp(36px, 8vw, 64px)' : 'clamp(32px, 7.5vw, 56px)',
            fontWeight: 600,
            lineHeight: 1.1,
            margin: '0 0 24px',
            color: '#F5F2FA',
            letterSpacing: theme === 'mythic' ? '-1px' : '-1.5px',
          }}
        >
          Forge ton<br />
          <span className="accent-text">ascension.</span>
        </h1>

        <p style={{
          fontSize: 'clamp(15px, 2.5vw, 18px)',
          color: theme === 'mythic' ? '#B4B2A9' : '#A1A1AA',
          maxWidth: 620, margin: '0 auto 40px',
        }}>
          L'assistant LoL qui s'adapte à toi. Overlay 100% personnalisable, builds et jungle paths partagés par la communauté, analyses IA. Tout ce qu'il faut pour grimper.
        </p>

        <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button className="wf-btn-primary" onClick={onLogin}>
            Télécharger pour Windows
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 5v14m0 0l-6-6m6 6l6-6" />
            </svg>
          </button>
          <button className="wf-btn-secondary" onClick={() => scrollTo('features')}>
            Voir les fonctionnalités
          </button>
        </div>
      </div>
    </section>
  )
}
