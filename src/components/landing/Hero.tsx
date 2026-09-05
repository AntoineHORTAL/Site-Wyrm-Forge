'use client'

import { Fragment } from 'react'
import { useTheme } from '@/components/providers/ThemeProvider'
import { useLanguage } from '@/components/providers/LanguageProvider'
import { WINDOWS_DOWNLOAD_URL } from '@/lib/download'

/* Icône Windows stylisée (4 carreaux) — réutilisée sur les CTA de la home */
const WindowsIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <rect x="3" y="3" width="8" height="8" rx="1" />
    <rect x="13" y="3" width="8" height="8" rx="1" />
    <rect x="3" y="13" width="8" height="8" rx="1" />
    <rect x="13" y="13" width="8" height="8" rx="1" />
  </svg>
)

/* Carte « overlay live » — données illustratives (exemple visuel, pas de vraie partie) */
function OverlayMock({ c }: { c: boolean }) {
  const { t } = useLanguage()
  const o = t.hero.overlay
  const stats: { label: string; value: string; color?: string }[] = [
    { label: o.stats[0], value: '8.4' },
    { label: o.stats[1], value: '1.2' },
    { label: o.stats[2], value: '6.2' },
    { label: o.stats[3], value: '02:14', color: c ? '#EF9F27' : '#FAC775' },
    { label: o.stats[4], value: '05:00', color: '#7F77DD' },
    { label: o.stats[5], value: o.rankValue },
  ]
  // Hauteurs statiques du mini bar-chart (% de la zone) — purement décoratif
  const bars = [42, 55, 38, 62, 48, 70, 52, 64, 46, 74, 58, 50]

  return (
    <div
      style={{
        position: 'relative',
        borderRadius: 16,
        padding: 20,
        background: c
          ? 'linear-gradient(155deg, rgba(28,15,48,0.92) 0%, rgba(12,7,24,0.96) 100%)'
          : '#121214',
        border: c ? '1px solid rgba(186,117,23,0.28)' : '1px solid #27272A',
        boxShadow: '0 24px 60px rgba(0,0,0,0.5)',
      }}
    >
      {/* En-tête */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--text-dim)' }}>
          <span style={{ fontWeight: 700, color: c ? '#FAC775' : '#A1A1AA' }}>{o.title}</span>
          <span style={{ color: '#5DCAA5', fontWeight: 600 }}>{o.live}</span>
          <span>02:14</span>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#EF9F27' }} />
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#7F77DD' }} />
        </div>
      </div>

      {/* Grille de stats */}
      <div className="land-overlay-stats">
        {stats.map((s) => (
          <div
            key={s.label}
            style={{
              background: c ? 'rgba(42,21,71,0.45)' : '#1B1B1F',
              border: c ? '1px solid rgba(186,117,23,0.18)' : '1px solid #27272A',
              borderRadius: 9,
              padding: '10px 12px',
            }}
          >
            <div style={{ fontSize: 9, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: 5 }}>
              {s.label}
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: s.color ?? '#F5F2FA', lineHeight: 1 }}>
              {s.value}
            </div>
          </div>
        ))}
      </div>

      {/* Mini bar-chart décoratif */}
      <div
        style={{
          marginTop: 12,
          height: 64,
          display: 'flex',
          alignItems: 'flex-end',
          gap: 6,
          padding: '10px 12px',
          background: c ? 'rgba(20,10,35,0.5)' : '#1B1B1F',
          border: c ? '1px solid rgba(186,117,23,0.14)' : '1px solid #27272A',
          borderRadius: 9,
        }}
      >
        {bars.map((h, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              height: `${h}%`,
              borderRadius: 3,
              background: 'linear-gradient(180deg, #FAC775 0%, #BA7517 100%)',
              opacity: 0.85,
            }}
          />
        ))}
      </div>
    </div>
  )
}

// La connexion est portée par le header (monté dans le layout racine, qui rend
// lui-même la modale) : le Hero n'a plus de `onLogin` à recevoir.
export default function Hero() {
  const { theme } = useTheme()
  const c = theme === 'mythic'
  const { t } = useLanguage()
  const h = t.hero

  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })

  return (
    <section
      id="accueil"
      style={{
        position: 'relative',
        overflow: 'hidden',
        // Le fond (illustration + glow) remonte sous le header transparent : marge négative ≈
        // hauteur du header, compensée par un padding-top accru pour que le contenu reste
        // confortablement sous les liens. Les calques de fond (inset:0) couvrent donc jusqu'à y=0.
        marginTop: -64,
        padding: '136px 32px 104px',
        background: c
          ? 'radial-gradient(ellipse at 62% 0%, #1d0f33 0%, #120726 38%, #0A0612 78%)'
          : '#09090B',
      }}
    >
      {/* Fond dragon — retourné horizontalement (le dragon passe à gauche, derrière le titre) */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          backgroundImage: 'url(/cta-dragon.png)',
          backgroundSize: 'cover',
          backgroundPosition: 'center 80%',
          transform: 'scaleX(-1)',
          opacity: c ? 0.55 : 0.32,
        }}
      />
      {/* Calque de lisibilité — assombrit la gauche (texte) et le bas, laisse respirer la droite (carte overlay) */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          background: c
            ? 'linear-gradient(90deg, rgba(10,6,18,0.94) 0%, rgba(10,6,18,0.78) 34%, rgba(10,6,18,0.32) 64%, rgba(10,6,18,0.6) 100%)'
            : 'linear-gradient(90deg, rgba(9,9,11,0.95) 0%, rgba(9,9,11,0.82) 38%, rgba(9,9,11,0.5) 72%, rgba(9,9,11,0.7) 100%)',
        }}
      />

      {c && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            background: `
              radial-gradient(ellipse at 18% 55%, rgba(127,119,221,0.14) 0%, transparent 52%),
              radial-gradient(ellipse at 78% 30%, rgba(186,117,23,0.10) 0%, transparent 52%)
            `,
          }}
        />
      )}

      <div className="land-hero-grid" style={{ position: 'relative', zIndex: 2 }}>
        {/* ── Colonne contenu ── */}
        <div className="land-reveal">
          <span className="land-eyebrow">{h.eyebrow}</span>

          <h1
            className="font-mythic"
            style={{
              fontSize: c ? 'clamp(40px, 7vw, 68px)' : 'clamp(34px, 6.5vw, 56px)',
              fontWeight: 600,
              lineHeight: 1.05,
              margin: '0 0 22px',
              color: '#F5F2FA',
              letterSpacing: c ? '-1px' : '-1.5px',
            }}
          >
            {h.titleBefore}<br />
            <span className="accent-text">{h.titleAccent}</span>
          </h1>

          <p style={{ fontSize: 'clamp(15px, 2.2vw, 18px)', color: 'var(--text-muted)', maxWidth: 480, margin: '0 0 32px' }}>
            {h.subtitle}
          </p>

          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 26 }}>
            <a href={WINDOWS_DOWNLOAD_URL} download className="wf-btn-gold">
              <WindowsIcon />
              {h.ctaDownload}
            </a>
            {/* Le bouton « Rechercher un joueur » (3ᵉ position, style secondaire)
                a été retiré : il faisait doublon avec le lien « Joueurs » du
                header — présent sur toutes les pages depuis que Nav vit dans le
                layout racine — et sa place entre « Télécharger » et
                « Fonctionnalités » n'avait pas de logique de lecture. */}
            <button className="wf-btn-secondary" onClick={() => scrollTo('features')}>
              {h.ctaFeatures}
            </button>
          </div>

          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--text-dim)' }}>
            {h.badges.map((b, i) => (
              <Fragment key={b}>
                {i > 0 && <span style={{ opacity: 0.5 }}>·</span>}
                <span>{b}</span>
              </Fragment>
            ))}
          </div>
        </div>

        {/* ── Colonne overlay ── */}
        <div className="land-reveal" style={{ animationDelay: '.1s' }}>
          <OverlayMock c={c} />
        </div>
      </div>
    </section>
  )
}
