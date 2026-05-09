'use client'

import { useTheme } from '@/components/providers/ThemeProvider'

const tiers = [
  {
    name: 'Apprenti',
    tagline: 'Pour découvrir',
    price: 'Gratuit',
    period: '',
    features: [
      'Overlay : 3 blocs actifs',
      '5 imports workshop / sem',
      '5 analyses IA / mois (Haiku)',
      '3 builds custom',
      '3 jungle paths',
    ],
    cta: 'Commencer',
    popular: false,
    popularLabel: '',
  },
  {
    name: 'Forgeron',
    tagline: 'Pour progresser',
    price: '2€',
    period: '/mois',
    features: [
      'Overlay : 6 blocs actifs',
      '20 imports workshop / sem',
      '20 analyses IA / mois (Sonnet)',
      '20 builds custom',
      '10 jungle paths',
      'Publication workshop',
    ],
    cta: 'Choisir',
    popular: false,
    popularLabel: '',
  },
  {
    name: 'Maître',
    tagline: 'Pour grimper',
    price: '5€',
    period: '/mois',
    features: [
      'Overlay illimité',
      'Workshop illimité',
      'Analyses IA illimitées (Opus)',
      'Builds & paths illimités',
      'Comparaison rangs supérieurs',
      'Analyse vidéo (à venir)',
    ],
    cta: 'Choisir',
    popular: true,
    popularLabel: 'Recommandé',
  },
  {
    name: 'Légion',
    tagline: 'Pour les équipes',
    price: '20€',
    period: '/mois',
    features: [
      'Maître pour 5 joueurs',
      'Dashboard équipe',
      'Builds privés équipe',
      'MMR collectif',
      'Stats croisées & synergies',
    ],
    cta: 'Choisir',
    popular: false,
    popularLabel: '',
  },
  {
    name: 'Architecte',
    tagline: 'Tournois jusqu\'à 100p',
    price: '30€',
    period: '/mois',
    features: [
      'Maître inclus',
      'Tournois privés illimités',
      'Brackets personnalisés',
      'Analyse post-tournoi',
      'Branding sur mesure',
      '5% commission',
    ],
    cta: 'Choisir',
    popular: false,
    popularLabel: '',
  },
  {
    name: 'Architecte+',
    tagline: 'Tournois jusqu\'à 300p',
    price: '50€',
    period: '/mois',
    features: [
      'Tout Architecte inclus',
      'Jusqu\'à 300 participants',
      'Outils analytics avancés',
      'Streaming intégré',
      'Support prioritaire',
      '10% commission',
    ],
    cta: 'Choisir',
    popular: false,
    popularLabel: '',
  },
]

export default function Pricing({ onLogin }: { onLogin: () => void }) {
  const { theme } = useTheme()
  const c = theme === 'mythic'

  return (
    <section id="pricing" style={{ padding: '80px 48px', background: 'var(--bg)' }}>
      <h2 className="font-mythic" style={{
        fontSize: c ? 40 : 36, fontWeight: 600,
        textAlign: 'center', margin: '0 0 16px', color: '#F5F2FA',
      }}>
        Choisis ta <span className="accent-text">forge</span>
      </h2>
      <p style={{
        textAlign: 'center', color: 'var(--text-muted)', fontSize: 16,
        maxWidth: 600, margin: '0 auto 56px',
      }}>
        Du gratuit aux organisateurs de tournois. Évolue quand tu en as besoin.
      </p>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
        gap: 16, maxWidth: 1400, margin: '0 auto',
      }}>
        {tiers.map((tier) => (
          <div
            key={tier.name}
            style={{
              borderRadius: 12,
              padding: '28px 22px',
              position: 'relative',
              display: 'flex',
              flexDirection: 'column',
              background: tier.popular
                ? c
                  ? 'linear-gradient(180deg, rgba(58,30,90,0.5) 0%, rgba(21,8,40,0.7) 100%)'
                  : '#1A1530'
                : 'var(--bg-card)',
              border: tier.popular
                ? c ? '2px solid #BA7517' : '1px solid #7F77DD'
                : `1px solid var(--border)`,
            }}
          >
            {tier.popular && (
              <div style={{
                position: 'absolute', top: -13, left: '50%', transform: 'translateX(-50%)',
                fontSize: 11, fontWeight: 700, padding: '4px 16px', borderRadius: 20,
                letterSpacing: 1, textTransform: 'uppercase',
                background: c
                  ? 'linear-gradient(135deg, #BA7517, #EF9F27)'
                  : '#7F77DD',
                color: c ? '#0A0612' : 'white',
                whiteSpace: 'nowrap',
              }}>
                {tier.popularLabel}
              </div>
            )}

            {/* Tier name */}
            <div style={{
              fontSize: 18, fontWeight: 700, marginBottom: 6,
              color: c ? '#BA7517' : '#A1A1AA',
              ...((!c) ? { textTransform: 'uppercase' as const, letterSpacing: 1, fontSize: 13 } : {}),
            }}>
              {tier.name}
            </div>

            {/* Tagline */}
            <div style={{
              fontSize: 13, color: 'var(--text-dim)', marginBottom: 20, minHeight: 20,
            }}>
              {tier.tagline}
            </div>

            {/* Price */}
            <div style={{
              fontSize: c ? 32 : 36,
              color: '#F5F2FA', marginBottom: 4, fontWeight: 700,
              letterSpacing: c ? undefined : '-1px',
            }}>
              {tier.price}
              {tier.period && (
                <small style={{ fontSize: 14, color: 'var(--text-dim)', fontWeight: 400 }}>
                  {' '}{tier.period}
                </small>
              )}
            </div>

            {/* Features */}
            <ul style={{ listStyle: 'none', padding: 0, margin: '20px 0', flex: 1 }}>
              {tier.features.map((f, i) => (
                <li key={i} style={{
                  fontSize: 13, color: 'var(--text-muted)',
                  padding: '5px 0', paddingLeft: 20, position: 'relative',
                  lineHeight: 1.4,
                }}>
                  <span style={{
                    position: 'absolute', left: 0,
                    top: c ? 8 : 6,
                    color: c ? '#BA7517' : '#7F77DD',
                    fontSize: c ? 9 : 11,
                    fontWeight: 700,
                  }}>
                    {c ? '◆' : '✓'}
                  </span>
                  {f}
                </li>
              ))}
            </ul>

            {/* CTA */}
            <button
              onClick={onLogin}
              style={{
                width: '100%',
                background: tier.popular
                  ? 'linear-gradient(135deg, #7F77DD 0%, #534AB7 100%)'
                  : c
                    ? 'transparent'
                    : '#27272A',
                color: tier.popular ? 'white' : 'var(--text)',
                padding: '12px 0', borderRadius: 8,
                border: tier.popular
                  ? 'none'
                  : `1px solid ${c ? 'rgba(186,117,23,0.35)' : 'transparent'}`,
                fontSize: 14, fontWeight: tier.popular ? 700 : 500,
                cursor: 'pointer', fontFamily: 'inherit',
                transition: 'opacity 0.15s, background 0.15s',
              }}
            >
              {tier.cta}
            </button>
          </div>
        ))}
      </div>
    </section>
  )
}
