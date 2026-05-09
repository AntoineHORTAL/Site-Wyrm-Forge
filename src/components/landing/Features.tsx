'use client'

import { useTheme } from '@/components/providers/ThemeProvider'

const features = [
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 21V9" />
      </svg>
    ),
    title: 'Overlay personnalisable',
    desc: 'Glisse, redimensionne et configure chaque bloc. Timer de jungle, cooldowns, CS/min — affiche ce qui compte pour toi.',
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
    title: 'Communauté & partage',
    desc: 'Importe les builds et jungle paths de la communauté. Partage tes créations, vote pour les meilleures.',
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
      </svg>
    ),
    title: 'Analyses IA',
    desc: 'Détecte tes patterns de jeu, identifie tes erreurs récurrentes et propose des axes d\'amélioration concrets.',
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
      </svg>
    ),
    title: 'Builder de builds',
    desc: 'Crée tes builds items champion par champion avec les vraies icônes LoL. Sauvegarde, duplique, partage.',
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polygon points="3 11 22 2 13 21 11 13 3 11" />
      </svg>
    ),
    title: 'Jungle paths',
    desc: 'Dessine tes jungle paths sur la vraie map. Définis l\'ordre des camps, les côtés, les invades et partage-les.',
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8M12 17v4" />
      </svg>
    ),
    title: 'To-do listes',
    desc: 'Crée tes listes de points à travailler. Checklists de warm-up, objectifs de ranked, habitudes à prendre.',
  },
]

export default function Features() {
  const { theme } = useTheme()

  return (
    <section
      id="features"
      style={{
        padding: '80px 48px',
        background: theme === 'mythic'
          ? 'linear-gradient(180deg, #0A0612 0%, #150828 50%, #0A0612 100%)'
          : '#0F0F11',
        borderTop: theme === 'classic' ? '1px solid #1F1F23' : undefined,
        borderBottom: theme === 'classic' ? '1px solid #1F1F23' : undefined,
      }}
    >
      <h2 className="font-mythic" style={{
        fontSize: theme === 'mythic' ? 40 : 36, fontWeight: 600,
        textAlign: 'center', margin: '0 0 16px', color: '#F5F2FA',
        letterSpacing: theme === 'classic' ? '-0.5px' : undefined,
      }}>
        Pensé pour les <span className="accent-text">vrais</span> joueurs
      </h2>
      <p style={{
        textAlign: 'center', color: 'var(--text-muted)', fontSize: 16,
        maxWidth: 600, margin: '0 auto 56px',
      }}>
        Tout ce dont tu as besoin pour comprendre, progresser et dominer.
      </p>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
        gap: 20, maxWidth: 1100, margin: '0 auto',
      }}>
        {features.map((f, i) => (
          <div key={i} className="wf-card" style={{ padding: '28px 24px' }}>
            <div style={{
              width: 48, height: 48, borderRadius: 12,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              marginBottom: 20,
              background: theme === 'mythic'
                ? 'linear-gradient(135deg, rgba(127,119,221,0.2), rgba(83,74,183,0.2))'
                : '#18181B',
              border: theme === 'mythic'
                ? '1px solid rgba(127,119,221,0.3)'
                : '1px solid #27272A',
              color: theme === 'mythic' ? '#BA7517' : '#7F77DD',
            }}>
              {f.icon}
            </div>
            <h3 style={{
              fontSize: theme === 'mythic' ? 20 : 17,
              fontWeight: 600, margin: '0 0 12px',
              color: theme === 'mythic' ? '#F5F2FA' : '#FAFAFA',
            }}>{f.title}</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: 14, lineHeight: 1.6 }}>
              {f.desc}
            </p>
          </div>
        ))}
      </div>

      {/* Overlay demo */}
      <div style={{
        maxWidth: 900, margin: '40px auto 0',
        border: theme === 'mythic' ? '1px solid rgba(186,117,23,0.3)' : '1px solid #27272A',
        borderRadius: 12, padding: 32,
        background: theme === 'mythic'
          ? 'linear-gradient(135deg, #1a0a30 0%, #0A0612 100%)'
          : '#09090B',
      }}>
        <p style={{ color: 'var(--text-dim)', fontSize: 12, textAlign: 'center', marginBottom: 16, textTransform: 'uppercase', letterSpacing: 1 }}>
          Aperçu overlay
        </p>
        <div style={{
          background: theme === 'mythic' ? 'rgba(20,10,35,0.6)' : 'transparent',
          borderRadius: 8, padding: theme === 'mythic' ? 20 : 0,
          display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12,
        }}>
          {[
            { label: 'CS/min', value: '8.4' },
            { label: 'Vision', value: '1.2' },
            { label: 'KDA', value: '6.2' },
            { label: 'Dragon', value: '02:14' },
            { label: 'Baron', value: '05:00' },
            { label: 'Rang', value: 'Or II' },
          ].map((b, i) => (
            <div key={i} style={{
              background: theme === 'mythic' ? 'rgba(42,21,71,0.4)' : '#18181B',
              border: theme === 'mythic' ? '1px solid rgba(186,117,23,0.2)' : '1px solid #27272A',
              borderRadius: 6, padding: theme === 'mythic' ? 12 : '14px 16px',
            }}>
              <div style={{
                color: theme === 'mythic' ? '#BA7517' : '#71717A',
                fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6,
              }}>{b.label}</div>
              <div style={{ color: '#F5F2FA', fontSize: theme === 'classic' ? 18 : 16, fontWeight: 600 }}>
                {b.value}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
