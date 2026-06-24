// TournamentRules — Server Component
// Reproduit l'affiche des règles (Image 2 de référence)

import { Xv2Shard, Xv2Cross } from './Xv2Deco'

interface RulesProps {
  rules: string[]
  cashprize_label: string
  cashprize_bonus?: string
  format: string
  map: string
  caster_name?: string
  twitch_url?: string
  series?: string
  hero_image_url?: string
  year?: number
  starts_at: string
}

export default function TournamentRules({
  rules, cashprize_label, cashprize_bonus, format, map,
  caster_name, twitch_url, series, hero_image_url, year, starts_at,
}: RulesProps) {
  const yearStr   = year ?? new Date(starts_at).getFullYear()
  const seriesLbl = series ?? 'TOURNOI'

  return (
    <section
      aria-label="Règles du tournoi"
      style={{ position: 'relative', overflow: 'hidden', borderRadius: 8 }}
      className="xv2-bg"
    >
      <div className="xv2-rules-grid">

        {/* ── Panneau rose halftone gauche ── */}
        <div
          style={{
            background: 'linear-gradient(160deg, #e87fd4 0%, #c05aaa 100%)',
            position: 'relative',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-end',
            padding: '32px 28px',
            minHeight: 400,
          }}
          className="xv2-halftone-pink xv2-torn-right"
        >
          {hero_image_url ? (
            /* Image d'affiche du tournoi à l'emplacement du placeholder */
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={hero_image_url}
              alt="Affiche du tournoi"
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
          /* Personnage placeholder (si pas d'image) */
          <div
            aria-label="Illustration (placeholder)"
            style={{
              position: 'absolute',
              top: 0, left: 0, right: 0, bottom: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: 0.15,
            }}
          >
            <svg aria-hidden="true" viewBox="0 0 120 200" width="120" height="200" fill="none">
              <ellipse cx="60" cy="70" rx="28" ry="32" fill="#fff" />
              <ellipse cx="60" cy="150" rx="36" ry="55" fill="#fff" />
              <line x1="24" y1="100" x2="0" y2="140" stroke="#fff" strokeWidth="8" strokeLinecap="round" />
              <line x1="96" y1="100" x2="120" y2="140" stroke="#fff" strokeWidth="8" strokeLinecap="round" />
            </svg>
          </div>
          )}

          {/* Éclats déco */}
          <div style={{ position: 'absolute', top: 20, right: 20, opacity: 0.5 }}>
            <Xv2Cross size={20} color="#fff" />
          </div>
          <div style={{ position: 'absolute', top: 60, left: 16, opacity: 0.4 }}>
            <Xv2Shard size={12} color="#fff" />
          </div>

          {/* Cast + Twitch */}
          <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {caster_name && (
              <div
                style={{
                  background: '#fff',
                  borderRadius: 4,
                  padding: '5px 12px',
                  display: 'inline-flex',
                  gap: 8,
                  alignItems: 'center',
                  alignSelf: 'flex-start',
                }}
              >
                <span className="xv2-data" style={{ color: '#2f6fde', fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>
                  CAST PAR
                </span>
                <span className="xv2-data" style={{ color: '#e03131', fontSize: 13, fontWeight: 700, textTransform: 'uppercase' }}>
                  {caster_name}
                </span>
              </div>
            )}
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
                  padding: '5px 12px',
                  textDecoration: 'none',
                  alignSelf: 'flex-start',
                }}
              >
                <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="#fff">
                  <path d="M2.1 0L.5 3.2v11.2h3.8V16l2.5-1.6h2l4.4-4.4V0H2.1zm9.7 9.6l-1.8 1.8H7.6L5.8 13V11.4H3.3V1.4h8.5v8.2zM9.8 4H8.4v4h1.4V4zm-3.2 0H5.2v4h1.4V4z" />
                </svg>
                <span className="xv2-data" style={{ color: '#fff', fontSize: 12, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase' }}>
                  EN LIVE SUR TWITCH
                </span>
              </a>
            )}
          </div>
        </div>

        {/* ── Contenu règles droite ── */}
        <div style={{ padding: '40px 36px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 16 }}>

          {/* Titre section */}
          <h2
            className="xv2-display"
            style={{
              fontSize: 'clamp(22px, 4vw, 36px)',
              color: '#fff',
              margin: '0 0 8px',
            }}
          >
            RÈGLES DU TOURNOI
          </h2>

          {/* Liste des règles */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {rules.map((rule, i) => (
              <div
                key={i}
                style={{
                  background: 'rgba(20,9,28,0.7)',
                  border: '1px solid rgba(47,111,222,0.25)',
                  borderRadius: 4,
                  padding: '12px 18px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                }}
              >
                <span
                  style={{
                    display: 'inline-block',
                    width: 6,
                    height: 6,
                    background: '#f06ad8',
                    borderRadius: '50%',
                    flexShrink: 0,
                  }}
                />
                <span
                  className="xv2-display"
                  style={{ fontSize: 'clamp(13px, 2vw, 16px)', color: '#fff', letterSpacing: '.04em' }}
                >
                  {rule}
                </span>
              </div>
            ))}
          </div>

          {/* Bloc cashprize */}
          <div
            style={{
              background: 'linear-gradient(135deg, rgba(28,58,110,0.8) 0%, rgba(47,111,222,0.3) 100%)',
              border: '1px solid rgba(47,111,222,0.5)',
              borderRadius: 6,
              padding: '16px 20px',
              marginTop: 8,
            }}
          >
            <p
              className="xv2-display"
              style={{ margin: 0, fontSize: 18, color: '#f06ad8' }}
            >
              CASHPRIZE {cashprize_label}
            </p>
            {cashprize_bonus && (
              <p
                className="xv2-data"
                style={{ margin: '4px 0 0', color: '#8fc6f5', fontSize: 13 }}
              >
                {cashprize_bonus}
              </p>
            )}
          </div>

          {/* Bloc inscriptions */}
          <div
            style={{
              background: 'rgba(240,106,216,0.07)',
              border: '1px solid rgba(240,106,216,0.3)',
              borderRadius: 6,
              padding: '16px 20px',
            }}
          >
            <p
              className="xv2-display"
              style={{ margin: '0 0 8px', fontSize: 16, color: '#f06ad8' }}
            >
              INSCRIPTIONS GRATUITES
            </p>
            <p
              className="xv2-data"
              style={{ margin: 0, color: '#aaa', fontSize: 13, lineHeight: 1.6 }}
            >
              Informations demandées : nom d&apos;équipe, pseudo Discord et Riot ID de chaque joueur.
            </p>
            {/* Formulaire placeholder — sera branché à l'étape dev */}
            <div
              style={{
                marginTop: 14,
                padding: '10px 14px',
                background: 'rgba(0,0,0,0.3)',
                borderRadius: 4,
                border: '1px dashed rgba(240,106,216,0.3)',
              }}
            >
              <span
                className="xv2-data"
                style={{ color: 'rgba(240,106,216,0.6)', fontSize: 13, fontStyle: 'italic' }}
              >
                [Formulaire d&apos;inscription — disponible bientôt]
              </span>
            </div>
          </div>
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
