// TournamentPoster — Server Component
// Reproduit l'affiche annonce (Image 1 de référence)

import { Xv2Logo, Xv2Shard, Xv2Cross } from './Xv2Deco'

interface PosterProps {
  name: string
  format: string
  map: string
  max_teams: number
  cashprize_label: string
  cashprize_bonus?: string
  starts_at: string
  caster_name?: string
  twitch_url?: string
  series?: string
  hero_image_url?: string
  year?: number
}

function formatDateLong(iso: string): string {
  try {
    const d = new Date(iso)
    const days = ['DIMANCHE', 'LUNDI', 'MARDI', 'MERCREDI', 'JEUDI', 'VENDREDI', 'SAMEDI']
    const months = ['JANVIER','FÉVRIER','MARS','AVRIL','MAI','JUIN','JUILLET','AOÛT','SEPTEMBRE','OCTOBRE','NOVEMBRE','DÉCEMBRE']
    const day = days[d.getDay()]
    const num = d.getDate()
    const month = months[d.getMonth()]
    const hh = String(d.getHours()).padStart(2, '0')
    const mm = String(d.getMinutes()).padStart(2, '0')
    return `${day} ${num} ${month} À ${hh}H${mm}`
  } catch { return iso }
}

export default function TournamentPoster({
  name, format, map, max_teams, cashprize_label, cashprize_bonus,
  starts_at, caster_name, twitch_url, series, hero_image_url, year,
}: PosterProps) {
  const dateStr  = formatDateLong(starts_at)
  const yearStr  = year ?? new Date(starts_at).getFullYear()
  const seriesLbl = series ?? name

  return (
    <section
      aria-label="Affiche du tournoi"
      style={{ position: 'relative', overflow: 'hidden', borderRadius: 8 }}
      className="xv2-bg"
    >
      {/* Grille poster : illustration | contenu | panneau rose */}
      <div className="xv2-poster-grid" style={{ position: 'relative' }}>

        {/* ── Colonne gauche : image d'affiche OU illustration placeholder ── */}
        <div
          style={{
            background: 'linear-gradient(160deg, rgba(28,58,110,0.8) 0%, rgba(20,9,28,0.95) 70%)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: hero_image_url ? 0 : 32,
            position: 'relative',
            minHeight: 480,
            overflow: 'hidden',
          }}
        >
          {hero_image_url ? (
            /* Image d'affiche fournie → couvre tout le cadre gauche */
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={hero_image_url}
              alt={`Affiche du tournoi ${name}`}
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
          <>
          {/* Dragon / forge placeholder */}
          <div
            aria-label="Illustration Wyrm Forge (placeholder)"
            style={{
              width: 200, height: 240,
              background: 'radial-gradient(ellipse at 50% 60%, rgba(47,111,222,0.35) 0%, transparent 70%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
            }}
          >
            {/* SVG dragon silhouette simplifié */}
            <svg
              aria-hidden="true"
              viewBox="0 0 160 200"
              width="160"
              height="200"
              fill="none"
              style={{ opacity: 0.7 }}
            >
              {/* Corps */}
              <ellipse cx="80" cy="130" rx="38" ry="55" fill="rgba(47,111,222,0.5)" />
              {/* Tête */}
              <ellipse cx="80" cy="68" rx="26" ry="22" fill="rgba(47,111,222,0.6)" />
              {/* Cornes */}
              <path d="M65 52 L58 32 L68 48Z" fill="rgba(240,106,216,0.7)" />
              <path d="M95 52 L102 32 L92 48Z" fill="rgba(240,106,216,0.7)" />
              {/* Ailes */}
              <path d="M42 100 L10 70 L40 110 Z" fill="rgba(28,58,110,0.8)" stroke="rgba(47,111,222,0.6)" strokeWidth="1" />
              <path d="M118 100 L150 70 L120 110 Z" fill="rgba(28,58,110,0.8)" stroke="rgba(47,111,222,0.6)" strokeWidth="1" />
              {/* Yeux */}
              <circle cx="72" cy="65" r="4" fill="#f06ad8" />
              <circle cx="88" cy="65" r="4" fill="#f06ad8" />
              {/* Queue */}
              <path d="M80 185 Q100 195 115 180 Q110 170 100 175 Q90 165 80 185Z" fill="rgba(47,111,222,0.5)" />
            </svg>
          </div>

          {/* Éclats décoratifs */}
          <div style={{ position: 'absolute', top: 24, left: 16 }}>
            <Xv2Cross size={18} color="rgba(240,106,216,0.5)" />
          </div>
          <div style={{ position: 'absolute', bottom: 40, left: 24 }}>
            <Xv2Shard size={14} color="#8fc6f5" />
          </div>
          <div style={{ position: 'absolute', top: 60, right: 20 }}>
            <Xv2Shard size={10} color="rgba(240,106,216,0.4)" />
          </div>
          </>
          )}
        </div>

        {/* ── Colonne droite : contenu principal ── */}
        <div
          style={{
            padding: '48px 36px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            position: 'relative',
          }}
        >
          {/* Logo XV2 + titre */}
          <div>
            <div style={{ marginBottom: 20 }}>
              <Xv2Logo size={52} />
            </div>

            {/* Titre ligne 1 */}
            <h1
              className="xv2-display"
              style={{
                fontSize: 'clamp(36px, 6vw, 64px)',
                color: '#fff',
                lineHeight: 0.95,
                margin: 0,
                textShadow: '0 2px 20px rgba(47,111,222,0.5)',
              }}
            >
              TOURNOI<br />
              <span
                style={{
                  background: 'linear-gradient(90deg, #8fc6f5 0%, #2f6fde 100%)',
                  WebkitBackgroundClip: 'text',
                  backgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}
              >
                {seriesLbl}
              </span>
            </h1>

            {/* Sous-titre format/map */}
            <p
              className="xv2-display"
              style={{
                fontSize: 'clamp(20px, 3vw, 30px)',
                color: '#8fc6f5',
                margin: '8px 0 0',
                letterSpacing: '.05em',
              }}
            >
              {format} {map}
            </p>
          </div>

          {/* Infos clés */}
          <div style={{ margin: '28px 0' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span
                  style={{
                    display: 'inline-block',
                    width: 3,
                    height: 22,
                    background: '#f06ad8',
                    borderRadius: 2,
                    flexShrink: 0,
                  }}
                />
                <span
                  className="xv2-display"
                  style={{ fontSize: 20, color: '#f06ad8' }}
                >
                  {max_teams} ÉQUIPES MAX
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span
                  style={{
                    display: 'inline-block',
                    width: 3,
                    height: 22,
                    background: '#f06ad8',
                    borderRadius: 2,
                    flexShrink: 0,
                  }}
                />
                <span
                  className="xv2-display"
                  style={{ fontSize: 20, color: '#f06ad8' }}
                >
                  CASHPRIZE {cashprize_label}
                </span>
              </div>
            </div>
          </div>

          {/* Date cartouche */}
          <div style={{ marginBottom: 8 }}>
            <div
              style={{
                display: 'inline-block',
                transform: 'skewX(-8deg)',
                background: 'linear-gradient(90deg, #1c3a6e 0%, #2f6fde 100%)',
                padding: '10px 24px',
                borderRadius: 3,
              }}
            >
              <span
                className="xv2-data"
                style={{
                  display: 'inline-block',
                  transform: 'skewX(8deg)',
                  color: '#fff',
                  fontSize: 14,
                  letterSpacing: '.06em',
                }}
              >
                {dateStr}
              </span>
            </div>
          </div>

          {/* Cast info si disponible */}
          {caster_name && (
            <div
              style={{
                marginTop: 16,
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                flexWrap: 'wrap',
              }}
            >
              <div
                style={{
                  background: '#fff',
                  borderRadius: 4,
                  padding: '4px 12px',
                  display: 'inline-flex',
                  gap: 6,
                  alignItems: 'center',
                }}
              >
                <span
                  className="xv2-data"
                  style={{ color: '#2f6fde', fontSize: 12, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase' }}
                >
                  CAST
                </span>
                <span className="xv2-data" style={{ color: '#e03131', fontSize: 12, fontWeight: 700 }}>
                  {caster_name}
                </span>
              </div>

              {twitch_url && (
                <a
                  href={twitch_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    background: '#2f6fde',
                    borderRadius: 4,
                    padding: '4px 12px',
                    textDecoration: 'none',
                    color: '#fff',
                  }}
                >
                  {/* Icône Twitch SVG */}
                  <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="#fff">
                    <path d="M2.1 0L.5 3.2v11.2h3.8V16l2.5-1.6h2l4.4-4.4V0H2.1zm9.7 9.6l-1.8 1.8H7.6L5.8 13V11.4H3.3V1.4h8.5v8.2zM9.8 4H8.4v4h1.4V4zm-3.2 0H5.2v4h1.4V4z" />
                  </svg>
                  <span className="xv2-data" style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase' }}>
                    EN LIVE
                  </span>
                </a>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Bandeau bas fantôme */}
      <div
        style={{
          borderTop: '1px solid rgba(255,255,255,0.05)',
          padding: '10px 20px',
          overflow: 'hidden',
        }}
      >
        <p
          className="xv2-ghost-text"
          style={{ fontSize: 'clamp(14px, 2.5vw, 20px)', margin: 0 }}
        >
          {yearStr}&nbsp;&nbsp;&nbsp;TOURNOI {format}&nbsp;&nbsp;&nbsp;{seriesLbl}&nbsp;&nbsp;&nbsp;MAP {map}
        </p>
      </div>
    </section>
  )
}
