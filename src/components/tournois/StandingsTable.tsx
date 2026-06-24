'use client'

// StandingsTable — Client Component
// Classement du tournoi — lignes issues de la vue tournament_standings
// (mappées par TournamentLive : rank dérivé de l'ordre points DESC).

export interface StandingRow {
  rank:      number
  team_name: string
  players:   string[]
  wins:      number
  losses:    number
  points:    number
}

interface StandingsTableProps {
  rows: StandingRow[]
}

export default function StandingsTable({ rows }: StandingsTableProps) {
  if (rows.length === 0) {
    return (
      <section
        aria-label="Classement du tournoi"
        className="xv2-bg"
        style={{ borderRadius: 8, padding: '40px 28px', textAlign: 'center' }}
      >
        <p className="xv2-data" style={{ color: '#8fa0bb', fontSize: 15, margin: 0 }}>
          Le classement apparaîtra ici dès que les équipes seront validées.
        </p>
      </section>
    )
  }

  return (
    <section
      aria-label="Classement du tournoi"
      style={{ position: 'relative', overflow: 'hidden', borderRadius: 8 }}
      className="xv2-bg"
    >
      <div style={{ padding: '32px 28px' }}>

        {/* Titre */}
        <h2
          className="xv2-display"
          style={{
            fontSize: 'clamp(22px, 4vw, 32px)',
            color: '#fff',
            margin: '0 0 24px',
          }}
        >
          CLASSEMENT
        </h2>

        {/* En-têtes */}
        <div
          className="xv2-standings-cols"
          style={{
            marginBottom: 10,
            padding: '0 4px',
          }}
          role="rowgroup"
          aria-label="En-têtes du classement"
        >
          <div />
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span
              style={{
                display: 'inline-block',
                width: 8, height: 8,
                background: '#e03131',
                transform: 'rotate(45deg)',
                flexShrink: 0,
              }}
            />
            <span
              className="xv2-data"
              style={{ color: '#fff', fontSize: 12, letterSpacing: '.12em', textTransform: 'uppercase' }}
            >
              TEAM
            </span>
          </div>
          <span
            className="xv2-data"
            style={{ color: '#fff', fontSize: 12, letterSpacing: '.12em', textTransform: 'uppercase' }}
          >
            JOUEURS
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span
              style={{
                display: 'inline-block',
                width: 6, height: 6,
                background: '#e03131',
                transform: 'rotate(45deg)',
                flexShrink: 0,
              }}
            />
            <span
              className="xv2-data"
              style={{ color: '#fff', fontSize: 12, letterSpacing: '.12em', textTransform: 'uppercase' }}
            >
              WIN
            </span>
          </div>
          <span
            className="xv2-data"
            style={{ color: '#fff', fontSize: 12, letterSpacing: '.12em', textTransform: 'uppercase' }}
          >
            LOSE
          </span>
          <span
            className="xv2-data"
            style={{ color: '#8fc6f5', fontSize: 12, letterSpacing: '.12em', textTransform: 'uppercase' }}
          >
            POINTS
          </span>
        </div>

        {/* Séparateur */}
        <div style={{ height: 1, background: 'rgba(47,111,222,0.3)', marginBottom: 10 }} />

        {/* Lignes */}
        <div role="table" aria-label="Lignes du classement">
          {rows.map((row) => (
            <div
              key={row.rank}
              role="row"
              style={{
                marginBottom: 8,
              }}
            >
              <div
                className="xv2-standings-cols"
                style={{ alignItems: 'stretch', minHeight: 64 }}
              >

                {/* Rang — languette rose skewée */}
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <div
                    style={{
                      transform: 'skewX(-10deg)',
                      background: row.rank === 1
                        ? 'linear-gradient(135deg, #f06ad8 0%, #c04ab0 100%)'
                        : row.rank === 2
                        ? 'linear-gradient(135deg, #8fc6f5 0%, #2f6fde 100%)'
                        : row.rank === 3
                        ? 'linear-gradient(135deg, #e87fd4 0%, #9b3f8a 100%)'
                        : 'rgba(47,111,222,0.25)',
                      width: 40,
                      height: 56,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: 3,
                    }}
                  >
                    <span
                      className="xv2-display"
                      style={{
                        display: 'inline-block',
                        transform: 'skewX(10deg)',
                        fontSize: 20,
                        color: '#fff',
                        lineHeight: 1,
                      }}
                    >
                      {row.rank}
                    </span>
                  </div>
                </div>

                {/* Nom d'équipe — cartouche bleu skewé */}
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <div
                    style={{
                      transform: 'skewX(-10deg)',
                      background: 'linear-gradient(135deg, #1c3a6e 0%, #2f6fde44 100%)',
                      border: '1px solid rgba(47,111,222,0.4)',
                      borderRadius: 3,
                      padding: '0 18px',
                      height: 56,
                      display: 'flex',
                      alignItems: 'center',
                      width: '100%',
                    }}
                  >
                    <span
                      className="xv2-display"
                      style={{
                        display: 'inline-block',
                        transform: 'skewX(10deg)',
                        fontSize: 14,
                        color: '#fff',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {row.team_name}
                    </span>
                  </div>
                </div>

                {/* Joueurs — cartouche avec bandeau rose */}
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <div
                    style={{
                      border: '1px solid rgba(47,111,222,0.3)',
                      borderRadius: 3,
                      overflow: 'hidden',
                      height: 56,
                      width: '100%',
                      display: 'flex',
                      flexDirection: 'column',
                    }}
                  >
                    {/* Bandeau rose fin en haut */}
                    <div
                      style={{
                        background: 'rgba(240,106,216,0.25)',
                        height: 4,
                        flexShrink: 0,
                      }}
                    />
                    <div
                      style={{
                        background: 'rgba(20,9,28,0.7)',
                        flex: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'center',
                        padding: '0 10px',
                        gap: 2,
                      }}
                    >
                      {row.players.map((p, i) => (
                        <span
                          key={i}
                          className="xv2-data"
                          style={{
                            fontSize: 11,
                            color: '#d0c8e8',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {p}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Wins */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div
                    style={{
                      transform: 'skewX(-10deg)',
                      background: 'rgba(93,202,165,0.15)',
                      border: '1px solid rgba(93,202,165,0.35)',
                      borderRadius: 3,
                      width: 52,
                      height: 48,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <span
                      className="xv2-display"
                      style={{
                        display: 'inline-block',
                        transform: 'skewX(10deg)',
                        fontSize: 18,
                        color: '#5DCAA5',
                      }}
                    >
                      {row.wins}
                    </span>
                  </div>
                </div>

                {/* Losses */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div
                    style={{
                      transform: 'skewX(-10deg)',
                      background: 'rgba(224,49,49,0.12)',
                      border: '1px solid rgba(224,49,49,0.3)',
                      borderRadius: 3,
                      width: 52,
                      height: 48,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <span
                      className="xv2-display"
                      style={{
                        display: 'inline-block',
                        transform: 'skewX(10deg)',
                        fontSize: 18,
                        color: '#e03131',
                      }}
                    >
                      {row.losses}
                    </span>
                  </div>
                </div>

                {/* Points */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div
                    style={{
                      transform: 'skewX(-10deg)',
                      background: 'linear-gradient(135deg, rgba(28,58,110,0.9) 0%, rgba(47,111,222,0.4) 100%)',
                      border: '1px solid rgba(47,111,222,0.5)',
                      borderRadius: 3,
                      padding: '0 14px',
                      height: 48,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      minWidth: 70,
                    }}
                  >
                    <span
                      className="xv2-display"
                      style={{
                        display: 'inline-block',
                        transform: 'skewX(10deg)',
                        fontSize: 15,
                        color: '#8fc6f5',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {row.points}PTS
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Panneau violet halftone droite */}
      <div
        style={{
          position: 'absolute',
          top: 0, right: 0, bottom: 0,
          width: 80,
          background: 'rgba(123,63,143,0.55)',
          pointerEvents: 'none',
        }}
        className="xv2-halftone-purple xv2-torn-left"
        aria-hidden="true"
      />

      {/* Bandeau bas */}
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', padding: '10px 20px' }}>
        <p className="xv2-ghost-text" style={{ fontSize: 16, margin: 0 }}>
          CLASSEMENT&nbsp;&nbsp;&nbsp;DOUBLE ÉLIMINATION&nbsp;&nbsp;&nbsp;XV2&nbsp;&nbsp;&nbsp;MAP ARAM
        </p>
      </div>
    </section>
  )
}
