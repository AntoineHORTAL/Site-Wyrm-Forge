// 404 stylée XV2 — /tournois/[slug] introuvable

import Link from 'next/link'
import { Xv2Shard, Xv2Cross, Xv2Logo } from '@/components/tournois/Xv2Deco'
import { ecosystemsPath } from '@/lib/tournois'

export default function TournamentNotFound() {
  return (
    <div
      style={{
        minHeight: 'calc(100vh - 60px)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'clamp(40px, 8vw, 80px) 24px',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Éclats décoratifs */}
      <div style={{ position: 'absolute', top: 60, left: 40, opacity: 0.3 }}>
        <Xv2Shard size={20} color="#8fc6f5" />
      </div>
      <div style={{ position: 'absolute', top: 100, right: 60, opacity: 0.2 }}>
        <Xv2Shard size={14} color="#f06ad8" />
      </div>
      <div style={{ position: 'absolute', bottom: 80, left: 80, opacity: 0.2 }}>
        <Xv2Cross size={22} color="#2f6fde" />
      </div>
      <div style={{ position: 'absolute', bottom: 60, right: 100, opacity: 0.15 }}>
        <Xv2Shard size={18} color="#e87fd4" />
      </div>

      {/* Logo */}
      <Xv2Logo size={64} />

      {/* 404 */}
      <h1
        className="xv2-display"
        style={{
          fontSize: 'clamp(80px, 18vw, 160px)',
          lineHeight: 0.9,
          margin: '24px 0 0',
          background: 'linear-gradient(90deg, #8fc6f5 0%, #2f6fde 100%)',
          WebkitBackgroundClip: 'text',
          backgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          textAlign: 'center',
        }}
      >
        404
      </h1>

      {/* Titre */}
      <h2
        className="xv2-display"
        style={{
          fontSize: 'clamp(18px, 4vw, 32px)',
          color: '#f06ad8',
          margin: '12px 0 0',
          textAlign: 'center',
          letterSpacing: '.08em',
        }}
      >
        TOURNOI INTROUVABLE
      </h2>

      {/* Séparateur */}
      <div
        style={{
          width: 80,
          height: 2,
          background: 'linear-gradient(90deg, transparent, #f06ad8, transparent)',
          margin: '20px auto',
        }}
      />

      {/* Message */}
      <p
        className="xv2-data"
        style={{
          color: '#6e85a0',
          fontSize: 15,
          textAlign: 'center',
          maxWidth: 400,
          lineHeight: 1.6,
          margin: '0 0 32px',
        }}
      >
        Ce tournoi n&apos;existe pas ou n&apos;est plus disponible.
        <br />
        Consulte la liste des tournois actifs.
      </p>

      {/* Bouton retour */}
      <Link href={ecosystemsPath()} className="xv2-btn-outline">
        ← Retour aux tournois
      </Link>

      {/* Bandeau bas fantôme */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          borderTop: '1px solid rgba(255,255,255,0.05)',
          padding: '10px 20px',
          overflow: 'hidden',
        }}
      >
        <p
          className="xv2-ghost-text"
          style={{ fontSize: 'clamp(12px, 2vw, 18px)', margin: 0, textAlign: 'center' }}
        >
          WYRM FORGE&nbsp;&nbsp;&nbsp;TOURNOIS XV2&nbsp;&nbsp;&nbsp;404&nbsp;&nbsp;&nbsp;PAGE NON TROUVÉE
        </p>
      </div>
    </div>
  )
}
