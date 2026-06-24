// Layout section Tournois — Server Component
// Fond XV2 global + breadcrumb minimal

import Link from 'next/link'
import type { Metadata } from 'next'
import { ecosystemsPath } from '@/lib/tournois'

export const metadata: Metadata = {
  title: 'Tournois — Wyrm Forge',
  description: 'Tournois communautaires organisés par Wyrm Forge. Inscris ton équipe, suis le bracket et consulte les classements.',
}

export default function TournoisLayout({ children }: { children: React.ReactNode }) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? ''

  return (
    <div
      style={{ minHeight: '100vh' }}
      className="xv2-bg"
    >
      {/* Breadcrumb minimal */}
      <header
        style={{
          borderBottom: '1px solid rgba(47,111,222,0.2)',
          padding: '14px 28px',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <a
          href={siteUrl || '/'}
          style={{
            color: 'rgba(143,198,245,0.7)',
            textDecoration: 'none',
            fontFamily: 'Rajdhani, sans-serif',
            fontWeight: 600,
            fontSize: 13,
            letterSpacing: '.08em',
            textTransform: 'uppercase',
          }}
        >
          Wyrm Forge
        </a>
        <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 12 }}>/</span>
        <Link
          href={ecosystemsPath()}
          style={{
            color: '#f06ad8',
            textDecoration: 'none',
            fontFamily: 'Rajdhani, sans-serif',
            fontWeight: 600,
            fontSize: 13,
            letterSpacing: '.08em',
            textTransform: 'uppercase',
          }}
        >
          Tournois
        </Link>
      </header>

      {/* Contenu de la page */}
      <main>{children}</main>
    </div>
  )
}
