'use client'

import { useRouter } from 'next/navigation'
import { useTheme } from '@/components/providers/ThemeProvider'
import { WINDOWS_DOWNLOAD_URL } from '@/lib/download'

export default function AboutPage() {
  const router = useRouter()
  const { theme } = useTheme()
  const c = theme === 'mythic'

  return (
    <main style={{
      minHeight: '100vh',
      padding: `clamp(24px, 5vw, 64px) clamp(24px, 5vw, 64px)`,
      maxWidth: 800,
      margin: '0 auto',
      color: 'var(--text)',
    }}>
      <button
        onClick={() => router.back()}
        style={{
          background: 'transparent', border: 'none', cursor: 'pointer',
          color: 'var(--text-muted)', fontSize: 13, padding: '6px 0', marginBottom: 24,
        }}
      >← Retour</button>

      <h1
        className="font-mythic"
        style={{ fontSize: 'clamp(32px, 6vw, 56px)', fontWeight: 700, marginBottom: 24 }}
      >
        Wyrm <span className="accent-text">Forge</span>
      </h1>

      <p style={{ fontSize: 16, color: 'var(--text-muted)', lineHeight: 1.7, marginBottom: 48 }}>
        Wyrm Forge est un assistant League of Legends au thème nordique — la forge du dragon.
        Il regroupe les outils dont tu as besoin pour progresser : gestion de builds, jungle paths,
        suivi de matchs et bien plus encore.
      </p>

      {/* Carte application desktop */}
      <div
        className="wf-card"
        style={{ padding: '28px 32px', marginBottom: 20 }}
      >
        <h2 style={{
          fontSize: 20, fontWeight: 700, marginBottom: 10,
          color: c ? 'var(--gold-pale)' : 'var(--text)',
        }}>
          L&apos;application Windows
        </h2>
        <p style={{ fontSize: 15, color: 'var(--text-muted)', lineHeight: 1.7, marginBottom: 20 }}>
          Une application de bureau WPF pour Windows, connectée en temps réel à Wyrm Forge.
          Accède à tes outils depuis ton bureau sans ouvrir un navigateur.
        </p>
        <a
          className="wf-btn-primary"
          href={WINDOWS_DOWNLOAD_URL}
          download
        >
          Télécharger l&apos;application
        </a>
      </div>

      {/* Carte site web */}
      <div
        className="wf-card"
        style={{ padding: '28px 32px', marginBottom: 48 }}
      >
        <h2 style={{
          fontSize: 20, fontWeight: 700, marginBottom: 10,
          color: c ? 'var(--gold-pale)' : 'var(--text)',
        }}>
          Le site web
        </h2>
        <p style={{ fontSize: 15, color: 'var(--text-muted)', lineHeight: 1.7 }}>
          L&apos;interface web de Wyrm Forge — construis tes builds, explore les jungle paths,
          consulte tes statistiques et prépare tes parties depuis n&apos;importe quel appareil.
        </p>
      </div>

      {/* Contact */}
      <div style={{ marginBottom: 64, textAlign: 'center' }}>
        <p style={{ fontSize: 15, color: 'var(--text-muted)', marginBottom: 16 }}>
          Une question ? Un problème ?
        </p>
        <a
          className="wf-btn-secondary"
          href="mailto:contact@wyrm-forge.com"
        >
          Nous contacter
        </a>
      </div>

      {/* Pied de page de la page — distinct du Footer global du site */}
      <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-dim)' }}>
        © 2026 Wyrm Forge. Tous droits réservés.
      </p>
    </main>
  )
}
