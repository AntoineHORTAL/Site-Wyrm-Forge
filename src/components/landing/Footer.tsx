'use client'

import { useTheme } from '@/components/providers/ThemeProvider'

export default function Footer() {
  const { theme } = useTheme()

  return (
    <footer style={{
      background: theme === 'mythic' ? '#050309' : '#09090B',
      padding: '48px',
      borderTop: theme === 'mythic' ? '1px solid rgba(186,117,23,0.2)' : '1px solid #1F1F23',
      textAlign: 'center',
    }}>
      <div style={{
        display: 'flex', gap: 32, justifyContent: 'center',
        marginBottom: 24, flexWrap: 'wrap',
      }}>
        {[
          { label: 'À propos',        href: '/about' },
          { label: 'Mentions légales', href: '#' },
          { label: 'Confidentialité', href: '#' },
          { label: 'CGU',             href: '#' },
          { label: 'Contact',         href: 'mailto:contact@wyrm-forge.com' },
          { label: 'Discord',         href: '#' },
        ].map(({ label, href }) => (
          <a
            key={label}
            href={href}
            style={{
              color: theme === 'mythic' ? '#888780' : '#71717A',
              textDecoration: 'none', fontSize: 14,
            }}
          >
            {label}
          </a>
        ))}
      </div>
      <div style={{ color: theme === 'mythic' ? '#5F5E5A' : '#52525B', fontSize: 12, marginBottom: 10 }}>
        © 2026 Wyrm Forge. Tous droits réservés.
      </div>
      {/* Mention obligatoire Riot Games (cf. Developer Agreement) */}
      <div style={{
        color: theme === 'mythic' ? '#5F5E5A' : '#52525B',
        fontSize: 11, lineHeight: 1.6,
        maxWidth: 720, margin: '0 auto',
      }}>
        Wyrm Forge n&apos;est pas affilié, sponsorisé ni endossé par Riot Games, Inc. ou
        l&apos;une de ses filiales. League of Legends et Riot Games sont des marques ou
        marques déposées de Riot Games, Inc. League of Legends © Riot Games, Inc.
        <br />
        <span style={{ color: theme === 'mythic' ? '#888780' : '#71717A' }}>
          Powered by the Riot Games API.
        </span>
      </div>
    </footer>
  )
}
