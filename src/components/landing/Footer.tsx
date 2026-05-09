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
        {['Mentions légales', 'Confidentialité', 'CGU', 'Contact', 'Discord'].map(link => (
          <a
            key={link}
            href="#"
            style={{
              color: theme === 'mythic' ? '#888780' : '#71717A',
              textDecoration: 'none', fontSize: 14,
            }}
          >
            {link}
          </a>
        ))}
      </div>
      <div style={{ color: theme === 'mythic' ? '#5F5E5A' : '#52525B', fontSize: 12 }}>
        © 2026 Wyrm Forge. Non affilié à Riot Games.
      </div>
    </footer>
  )
}
