// TournamentCard — Server Component
// Carte mini-affiche pour la liste des tournois

import Link from 'next/link'
import { Xv2Cross } from './Xv2Deco'
import {
  TOURNAMENT_STATUS_LABELS,
  TOURNAMENT_STATUS_COLORS,
  tournamentPath,
  type TournamentStatus,
} from '@/lib/tournois'

// Aligné sur le schéma DB (table tournaments) — pas de statut 'cancelled' en base
export interface TournamentCardData {
  slug: string
  name: string
  format: string
  map: string
  status: TournamentStatus
  starts_at: string | null
  cashprize_label?: string | null
  max_teams?: number
  series?: string | null
}

interface TournamentCardProps {
  tournament:  TournamentCardData
  serie:       string   // slug de la série (segment d'URL)
}

function formatDate(iso: string | null): string {
  if (!iso) return 'Date à annoncer'
  try {
    return new Date(iso).toLocaleDateString('fr-FR', {
      day:     'numeric',
      month:   'long',
      year:    'numeric',
      hour:    '2-digit',
      minute:  '2-digit',
    })
  } catch {
    return iso
  }
}

export default function TournamentCard({ tournament: t, serie }: TournamentCardProps) {
  const statusColor = TOURNAMENT_STATUS_COLORS[t.status]
  const statusLabel = TOURNAMENT_STATUS_LABELS[t.status]

  return (
    <Link
      href={tournamentPath(serie, t.slug)}
      style={{
        display: 'block',
        textDecoration: 'none',
        position: 'relative',
        borderRadius: 6,
        overflow: 'hidden',
        background: 'linear-gradient(160deg, #1c3a6e 0%, #14091c 60%)',
        border: '1px solid rgba(47,111,222,0.35)',
        transition: 'transform 0.18s, box-shadow 0.18s',
      }}
      className="xv2-card-item"
    >
      {/* Coins décoratifs — triangles SVG */}
      <svg
        aria-hidden="true"
        style={{ position: 'absolute', top: 0, left: 0, width: 24, height: 24 }}
        viewBox="0 0 24 24"
      >
        <path d="M0 0 L24 0 L0 24 Z" fill="rgba(240,106,216,0.4)" />
      </svg>
      <svg
        aria-hidden="true"
        style={{ position: 'absolute', top: 0, right: 0, width: 24, height: 24 }}
        viewBox="0 0 24 24"
      >
        <path d="M24 0 L24 24 L0 0 Z" fill="rgba(47,111,222,0.5)" />
      </svg>

      {/* Badge statut */}
      <div style={{ padding: '20px 20px 0' }}>
        <span
          style={{
            display: 'inline-block',
            background: `${statusColor}22`,
            color: statusColor,
            border: `1px solid ${statusColor}88`,
            borderRadius: 3,
            padding: '2px 10px',
            fontSize: 11,
            fontFamily: 'Rajdhani, sans-serif',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '.08em',
          }}
        >
          {t.status === 'live' && (
            <span
              style={{
                display: 'inline-block',
                width: 6, height: 6,
                background: '#5DCAA5',
                borderRadius: '50%',
                marginRight: 6,
                verticalAlign: 'middle',
                animation: 'xv2-pulse 1.4s ease-in-out infinite',
              }}
            />
          )}
          {statusLabel}
        </span>
      </div>

      {/* Titre */}
      <div style={{ padding: '12px 20px 0' }}>
        <h3
          className="xv2-display"
          style={{
            fontSize: 'clamp(18px, 3vw, 22px)',
            color: '#fff',
            margin: 0,
            lineHeight: 1.1,
          }}
        >
          {t.name}
        </h3>
        <p
          className="xv2-data"
          style={{
            margin: '4px 0 0',
            color: '#8fc6f5',
            fontSize: 14,
          }}
        >
          {t.format} · {t.map}
        </p>
      </div>

      {/* Séparateur XV2 */}
      <div style={{ margin: '14px 20px', height: 1, background: 'rgba(47,111,222,0.3)' }} />

      {/* Infos */}
      <div style={{ padding: '0 20px', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        {t.max_teams && (
          <span className="xv2-data" style={{ color: '#aaa', fontSize: 13 }}>
            <span style={{ color: '#f06ad8' }}>●</span>{' '}
            {t.max_teams} équipes max
          </span>
        )}
        {t.cashprize_label && (
          <span className="xv2-data" style={{ color: '#aaa', fontSize: 13 }}>
            <span style={{ color: '#f06ad8' }}>●</span>{' '}
            {t.cashprize_label}
          </span>
        )}
      </div>

      {/* Date */}
      <div
        style={{
          margin: '12px 20px 0',
          padding: '8px 14px',
          background: 'rgba(28,58,110,0.6)',
          borderRadius: 4,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="none">
          <rect x="1" y="3" width="14" height="12" rx="2" stroke="#8fc6f5" strokeWidth="1.5" />
          <line x1="5" y1="1" x2="5" y2="5" stroke="#8fc6f5" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="11" y1="1" x2="11" y2="5" stroke="#8fc6f5" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="1" y1="7" x2="15" y2="7" stroke="#8fc6f5" strokeWidth="1.5" />
        </svg>
        <span className="xv2-data" style={{ color: '#8fc6f5', fontSize: 13 }}>
          {formatDate(t.starts_at)}
        </span>
      </div>

      {/* CTA */}
      <div style={{ padding: '14px 20px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span
          className="xv2-data"
          style={{
            color: '#f06ad8',
            fontSize: 13,
            textTransform: 'uppercase',
            letterSpacing: '.06em',
          }}
        >
          Voir le tournoi →
        </span>
        <Xv2Cross size={14} color="rgba(240,106,216,0.4)" />
      </div>

      {/* Overlay hover (simulé via CSS dans globals) */}
      <style>{`
        .xv2-card-item:hover {
          transform: translateY(-4px);
          box-shadow: 0 12px 40px rgba(240,106,216,0.2), 0 4px 16px rgba(47,111,222,0.25);
          border-color: rgba(240,106,216,0.5);
        }
        @keyframes xv2-pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.3; }
        }
      `}</style>
    </Link>
  )
}
