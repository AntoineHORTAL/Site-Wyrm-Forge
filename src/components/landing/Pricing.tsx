'use client'

import { useState } from 'react'
import { useTheme } from '@/components/providers/ThemeProvider'
import { useLanguage } from '@/components/providers/LanguageProvider'
import { formatPrice } from '@/locales/landing'
import { WINDOWS_DOWNLOAD_URL } from '@/lib/download'

const WindowsIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <rect x="3" y="3" width="8" height="8" rx="1" />
    <rect x="13" y="3" width="8" height="8" rx="1" />
    <rect x="3" y="13" width="8" height="8" rx="1" />
    <rect x="13" y="13" width="8" height="8" rx="1" />
  </svg>
)

// Réduction annuelle (-10%, validé). Apprenti reste à 0€ dans les deux modes.
const ANNUAL_FACTOR = 0.9

// Structure des paliers : prix et CTA seulement. Tagline et features sont traduites
// (src/locales/landing.ts, `pricing.tiers`, même ordre). `name` reste en français :
// c'est la valeur de `profiles.tier` en base, partagée avec l'app de bureau.
// ⚠️ Vitrine tarifaire — AUCUN paiement réel : Apprenti → téléchargement, payants désactivés.
interface Tier {
  name: string
  monthly: number // 0 = gratuit
  cta: 'download' | 'soon'
  popular?: boolean
}

const tiers: Tier[] = [
  { name: 'Apprenti', monthly: 0, cta: 'download' },
  { name: 'Forgeron', monthly: 2, cta: 'soon' },
  { name: 'Maître',   monthly: 5, cta: 'soon', popular: true },
]

// Le formatage des prix (séparateur décimal ET position du symbole €) vit dans
// `formatPrice` (src/locales/landing.ts) — seule source de vérité, partagée par
// tous les affichages de montant de la vitrine.

export default function Pricing() {
  const { theme } = useTheme()
  const c = theme === 'mythic'
  const { t, lang } = useLanguage()
  const p = t.pricing
  const [annual, setAnnual] = useState(false)

  const segBtn = (active: boolean): React.CSSProperties => ({
    padding: '7px 16px',
    borderRadius: 100,
    border: 'none',
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontSize: 13,
    fontWeight: 600,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    background: active
      ? c ? 'linear-gradient(135deg, var(--gold-light), var(--gold-pale))' : '#FAFAFA'
      : 'transparent',
    color: active ? (c ? '#1a0f02' : '#09090B') : 'var(--text-muted)',
    transition: 'background 0.15s, color 0.15s',
  })

  return (
    <section
      id="tarifs"
      style={{
        padding: '88px 32px',
        background: c ? '#0A0612' : '#0F0F11',
        borderTop: c ? undefined : '1px solid #1F1F23',
        borderBottom: c ? undefined : '1px solid #1F1F23',
      }}
    >
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <span className="land-eyebrow">{p.eyebrow}</span>
        <h2
          className="font-mythic"
          style={{ fontSize: c ? 'clamp(28px, 4.5vw, 42px)' : 'clamp(24px, 4vw, 36px)', fontWeight: 600, margin: '0 0 14px', color: '#F5F2FA', letterSpacing: c ? undefined : '-0.5px' }}
        >
          {p.titleBefore}<span className="accent-text">{p.titleAccent}</span>{p.titleAfter}
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: 16, maxWidth: 520, margin: '0 auto' }}>
          {p.subtitle}
        </p>
      </div>

      {/* Toggle Mensuel / Annuel */}
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 44 }}>
        <div
          style={{
            display: 'inline-flex',
            padding: 4,
            gap: 4,
            borderRadius: 100,
            background: c ? 'rgba(20,10,35,0.6)' : '#18181B',
            border: c ? '1px solid rgba(186,117,23,0.25)' : '1px solid #27272A',
          }}
        >
          <button onClick={() => setAnnual(false)} style={segBtn(!annual)}>{p.monthly}</button>
          <button onClick={() => setAnnual(true)} style={segBtn(annual)}>
            {p.annual}
            <span style={{ fontSize: 11, fontWeight: 700, color: annual ? 'inherit' : (c ? '#EF9F27' : '#7F77DD') }}>−10%</span>
          </button>
        </div>
      </div>

      <div className="land-pricing-grid">
        {tiers.map((tier, i) => {
          const copy = p.tiers[i]
          const isFree = tier.monthly === 0
          const perMonth = annual ? tier.monthly * ANNUAL_FACTOR : tier.monthly
          return (
            <div
              key={tier.name}
              className="wf-card land-reveal"
              style={{
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                padding: '28px 24px',
                animationDelay: `${i * 0.07}s`,
                ...(tier.popular
                  ? {
                      border: c ? '1.5px solid var(--gold)' : '1.5px solid #7F77DD',
                      background: c
                        ? 'linear-gradient(180deg, rgba(58,30,90,0.45) 0%, rgba(21,8,40,0.6) 100%)'
                        : '#1A1530',
                    }
                  : {}),
              }}
            >
              {tier.popular && (
                <div
                  style={{
                    position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)',
                    fontSize: 11, fontWeight: 700, padding: '4px 14px', borderRadius: 20,
                    letterSpacing: 1, textTransform: 'uppercase', whiteSpace: 'nowrap',
                    background: c ? 'linear-gradient(135deg, var(--gold), var(--gold-light))' : '#7F77DD',
                    color: c ? '#0A0612' : 'white',
                  }}
                >
                  {p.popular}
                </div>
              )}

              {/* Nom + tagline */}
              <div style={{ fontSize: c ? 20 : 16, fontWeight: 700, color: c ? '#EF9F27' : '#A1A1AA', fontFamily: c ? 'var(--font-serif)' : undefined, letterSpacing: c ? '0.3px' : 1, textTransform: c ? undefined : 'uppercase', marginBottom: 4 }}>
                {tier.name}
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 18 }}>{copy.tagline}</div>

              {/* Prix */}
              <div style={{ minHeight: 64, marginBottom: 18 }}>
                {isFree ? (
                  <div style={{ fontSize: 32, fontWeight: 700, color: '#F5F2FA', lineHeight: 1.1 }}>{p.free}</div>
                ) : (
                  <>
                    <div style={{ fontSize: 32, fontWeight: 700, color: '#F5F2FA', lineHeight: 1.1 }}>
                      {formatPrice(perMonth, lang)}
                      <small style={{ fontSize: 14, color: 'var(--text-dim)', fontWeight: 400 }}>{p.perMonth}</small>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 4, minHeight: 16 }}>
                      {annual
                        ? p.billedAnnually.replace('{price}', formatPrice(tier.monthly * 12 * ANNUAL_FACTOR, lang))
                        : p.noCommitment}
                    </div>
                  </>
                )}
              </div>

              {/* Features */}
              <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 22px', flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {copy.features.map((f) => (
                  <li key={f} style={{ fontSize: 13, color: 'var(--text-muted)', paddingLeft: 22, position: 'relative', lineHeight: 1.4 }}>
                    <span style={{ position: 'absolute', left: 0, top: 1, color: c ? '#BA7517' : '#7F77DD', fontSize: 12, fontWeight: 700 }}>
                      {c ? '◆' : '✓'}
                    </span>
                    {f}
                  </li>
                ))}
              </ul>

              {/* CTA — aucun paiement réel */}
              {tier.cta === 'download' ? (
                <a href={WINDOWS_DOWNLOAD_URL} download className="wf-btn-gold" style={{ justifyContent: 'center' }}>
                  <WindowsIcon />
                  {p.ctaDownload}
                </a>
              ) : (
                <button
                  type="button"
                  disabled
                  title={p.ctaSoonTitle}
                  style={{
                    width: '100%', padding: '12px 0', borderRadius: 8, cursor: 'not-allowed',
                    fontFamily: 'inherit', fontSize: 14, fontWeight: 600,
                    background: 'transparent',
                    color: 'var(--text-dim)',
                    border: `1px solid ${c ? 'rgba(186,117,23,0.25)' : '#3F3F46'}`,
                    opacity: 0.7,
                  }}
                >
                  {p.ctaSoon}
                </button>
              )}
            </div>
          )
        })}
      </div>

      {/* Paliers à venir — sobre, sans promesse de date */}
      <p style={{ textAlign: 'center', color: 'var(--text-dim)', fontSize: 13, marginTop: 36 }}>
        {p.moreTiers}
      </p>
    </section>
  )
}
