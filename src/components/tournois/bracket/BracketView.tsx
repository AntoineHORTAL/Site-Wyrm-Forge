'use client'

// BracketView v2 — bracket double élimination généré depuis les données matches.
// Layout type Liquipedia (colonnes par round, bande WB en haut, LB en bas,
// Grande Finale à cheval), skin XV2. Géométrie calculée par bracket-layout.ts.

import { useMemo, useRef, useEffect } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Xv2Cross } from '../Xv2Deco'
import { tournamentPath, type TournamentMatch } from '@/lib/tournois'
import {
  computeBracketLayout,
  CARD_W,
  CARD_H,
  type PlacedMatch,
} from './bracket-layout'

// Infos d'équipe nécessaires à l'affichage (nom + seed)
export interface BracketTeamInfo {
  name: string
  seed: number | null
}

interface BracketViewProps {
  serie:   string
  slug:    string
  matches: TournamentMatch[]
  teams:   Record<string, BracketTeamInfo>   // clé = team_id
}

// ── Ligne d'équipe dans une carte de match ───────────────────────────────────

function TeamLine({
  teamId, teams, isWinner, finished,
}: {
  teamId:   string | null
  teams:    Record<string, BracketTeamInfo>
  isWinner: boolean
  finished: boolean
}) {
  const team = teamId ? teams[teamId] : undefined

  // Score : pas de score détaillé en DB (Bo1) — 1/0 une fois le match terminé
  const score = finished ? (isWinner ? '1' : '0') : '–'

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '0 10px',
        height: '50%',
        minWidth: 0,
      }}
    >
      <span
        className="xv2-data"
        style={{ color: '#6e85a0', fontSize: 10, width: 14, flexShrink: 0 }}
      >
        {team?.seed != null ? `.${team.seed}` : ''}
      </span>
      <span
        className="xv2-display"
        style={{
          flex: 1,
          minWidth: 0,
          fontSize: 13,
          color: team ? (isWinner ? 'var(--xv2-pink)' : '#fff') : 'rgba(255,255,255,0.25)',
          fontWeight: isWinner ? 800 : undefined,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {team ? team.name : '—'}
      </span>
      <span
        className="xv2-display"
        style={{
          fontSize: 13,
          color: isWinner ? 'var(--xv2-pink)' : '#8fa0bb',
          flexShrink: 0,
        }}
      >
        {team ? score : ''}
      </span>
    </div>
  )
}

// ── Carte de match ───────────────────────────────────────────────────────────

function MatchCard({
  placed, serie, slug, teams,
}: {
  placed: PlacedMatch
  serie:  string
  slug:   string
  teams:  Record<string, BracketTeamInfo>
}) {
  const m = placed.match as TournamentMatch
  const finished   = m.status === 'finished'
  const inProgress = m.status === 'in_progress'

  return (
    <Link
      href={tournamentPath(serie, slug, `/match/${m.code}`)}
      className="xv2-match-card"
      data-match-code={m.code}
      aria-label={`Match ${m.code}${inProgress ? ' — en cours' : finished ? ' — terminé' : ''}`}
      style={{
        position: 'absolute',
        left: placed.x,
        top: placed.y,
        width: CARD_W,
        height: CARD_H,
        display: 'flex',
        flexDirection: 'column',
        textDecoration: 'none',
        borderRadius: 4,
        overflow: 'hidden',
        background: placed.band === 'lb'
          ? 'linear-gradient(160deg, #2b1135 0%, #14091c 80%)'
          : 'linear-gradient(160deg, #1c3a6e 0%, #14091c 80%)',
        border: placed.band === 'final'
          ? '1.5px solid var(--xv2-pink)'
          : placed.band === 'lb'
          ? '1.5px solid rgba(123,63,143,0.7)'
          : '1.5px solid rgba(47,111,222,0.6)',
      }}
    >
      {/* Triangles signature coin supérieur */}
      <svg
        aria-hidden="true"
        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: 14, pointerEvents: 'none' }}
        viewBox={`0 0 ${CARD_W} 14`}
        preserveAspectRatio="none"
      >
        <path d="M0 0 L14 0 L0 14 Z" fill="#e03131" />
        <path d={`M${CARD_W} 0 L${CARD_W - 14} 0 L${CARD_W} 14 Z`} fill="#2f6fde" />
      </svg>

      {/* Label M{n} coin supérieur gauche */}
      <span
        className="xv2-data"
        style={{
          position: 'absolute',
          top: 1,
          left: 18,
          fontSize: 9,
          color: '#6e85a0',
          letterSpacing: '.08em',
        }}
      >
        {m.code}
      </span>

      {/* Badge de statut */}
      {inProgress && (
        <span className="xv2-badge-live" style={{ position: 'absolute', top: 0, right: 18 }}>
          EN COURS
        </span>
      )}
      {finished && (
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: 4,
            right: 20,
            width: 7,
            height: 7,
            background: 'var(--xv2-pink)',
            transform: 'rotate(45deg)',
          }}
        />
      )}

      {/* Deux lignes d'équipe */}
      <div style={{ marginTop: 13, flex: 1, display: 'flex', flexDirection: 'column' }}>
        <TeamLine
          teamId={m.team_a}
          teams={teams}
          isWinner={finished && m.winner_id !== null && m.winner_id === m.team_a}
          finished={finished}
        />
        <div style={{ height: 1, background: 'rgba(255,255,255,0.12)', margin: '0 8px' }} />
        <TeamLine
          teamId={m.team_b}
          teams={teams}
          isWinner={finished && m.winner_id !== null && m.winner_id === m.team_b}
          finished={finished}
        />
      </div>
    </Link>
  )
}

// ── Vue principale ───────────────────────────────────────────────────────────

export default function BracketView({ serie, slug, matches, teams }: BracketViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const wbRef     = useRef<HTMLDivElement>(null)
  const lbRef     = useRef<HTMLDivElement>(null)

  const layout = useMemo(() => {
    if (matches.length === 0) return null
    try {
      return computeBracketLayout(matches)
    } catch {
      return null
    }
  }, [matches])

  // ── Scroll focus (?focus=M{n}) au retour depuis une page match ──────────────
  // Centre la carte ciblée dans le conteneur scrollable (desktop + mobile).
  // Sans focus : recentre horizontalement (vue d'ensemble). Respecte reduced-motion.
  const searchParams = useSearchParams()
  const focus = searchParams.get('focus')
  useEffect(() => {
    const container = scrollRef.current
    if (!container || !layout) return

    const reduced = typeof window !== 'undefined'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const behavior: ScrollBehavior = reduced ? 'auto' : 'smooth'

    if (focus) {
      const card = container.querySelector<HTMLElement>(`[data-match-code="${focus}"]`)
      if (card) {
        card.scrollIntoView({ behavior, block: 'center', inline: 'center' })
        return
      }
    }
    // Fallback : recentrer le scroll horizontal (vue d'ensemble)
    const mid = (container.scrollWidth - container.clientWidth) / 2
    if (mid > 0) container.scrollTo({ left: mid, behavior })
  }, [focus, layout])

  if (!layout) {
    return (
      <section
        aria-label="Bracket du tournoi"
        className="xv2-bg"
        style={{ borderRadius: 8, padding: '40px 28px', textAlign: 'center' }}
      >
        <p className="xv2-data" style={{ color: '#8fa0bb', fontSize: 15, margin: 0 }}>
          Le bracket n&apos;a pas encore été généré — il apparaîtra ici dès que
          l&apos;organisateur aura lancé le tournoi.
        </p>
      </section>
    )
  }

  // Ancres mobile : WB / LB / Finale
  function goTo(anchor: 'wb' | 'lb' | 'final') {
    const container = scrollRef.current
    if (!container) return
    if (anchor === 'final') {
      container.scrollTo({ left: container.scrollWidth, behavior: 'smooth' })
      wbRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    } else {
      container.scrollTo({ left: 0, behavior: 'smooth' })
      const target = anchor === 'wb' ? wbRef.current : lbRef.current
      target?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  return (
    <section
      aria-label="Bracket du tournoi"
      className="xv2-bg"
      style={{ position: 'relative', borderRadius: 8, overflow: 'hidden' }}
    >
      {/* Barre d'ancres — mobile uniquement (CSS) */}
      <div className="xv2-bracket-anchors" role="group" aria-label="Navigation dans le bracket">
        {([['wb', 'WB'], ['lb', 'LB'], ['final', 'Finale']] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => goTo(key)}
            className="xv2-data"
            style={{
              background: 'rgba(28,58,110,0.6)',
              border: '1px solid rgba(47,111,222,0.4)',
              borderRadius: 3,
              color: '#8fc6f5',
              fontSize: 12,
              textTransform: 'uppercase',
              letterSpacing: '.08em',
              padding: '6px 14px',
              cursor: 'pointer',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Zone scrollable horizontalement */}
      <div ref={scrollRef} className="xv2-bracket-scroll thin-scroll" style={{ padding: '20px 28px 28px' }}>
        <div style={{ position: 'relative', width: layout.width, height: layout.height + 40 }}>

          {/* Titre WINNER'S BRACKET */}
          <div
            ref={wbRef}
            style={{ position: 'absolute', left: 0, top: -2, display: 'flex', alignItems: 'center', gap: 8 }}
          >
            <Xv2Cross size={13} color="var(--xv2-pink)" />
            <h2
              className="xv2-display"
              style={{ fontSize: 17, color: 'var(--xv2-pink)', margin: 0, letterSpacing: '.04em' }}
            >
              WINNER&apos;S BRACKET
            </h2>
          </div>

          {/* Titre LOSER'S BRACKET */}
          <div
            ref={lbRef}
            style={{
              position: 'absolute',
              left: 0,
              top: layout.lbTop - 100,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <Xv2Cross size={13} color="var(--xv2-pink)" />
            <h2
              className="xv2-display"
              style={{ fontSize: 17, color: 'var(--xv2-pink)', margin: 0, letterSpacing: '.04em' }}
            >
              LOSER&apos;S BRACKET
            </h2>
          </div>

          {/* Cartouches d'en-tête de colonne (snap targets mobile) */}
          {layout.headers.map((h) => (
            <div
              key={`${h.band}-${h.col}`}
              className="xv2-bracket-col-header"
              style={{ position: 'absolute', left: h.x, top: h.y + 24, width: CARD_W }}
            >
              <span
                style={{
                  display: 'inline-block',
                  transform: 'skewX(-10deg)',
                  background: h.label === 'GRANDE FINALE'
                    ? 'linear-gradient(135deg, #c04ab0 0%, var(--xv2-pink) 100%)'
                    : h.band === 'lb'
                    ? 'linear-gradient(135deg, #2b1135 0%, #7b3f8f 100%)'
                    : 'linear-gradient(135deg, #1c3a6e 0%, #2f6fde 100%)',
                  borderRadius: 3,
                  padding: '5px 16px',
                }}
              >
                <span
                  className="xv2-data"
                  style={{
                    display: 'inline-block',
                    transform: 'skewX(10deg)',
                    color: '#fff',
                    fontSize: 12,
                    textTransform: 'uppercase',
                    letterSpacing: '.08em',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {h.label}
                </span>
              </span>
            </div>
          ))}

          {/* Connecteurs SVG — sous les cartes */}
          <svg
            aria-hidden="true"
            width={layout.width}
            height={layout.height + 40}
            style={{ position: 'absolute', left: 0, top: 24, pointerEvents: 'none' }}
          >
            {layout.connectors.map((conn) => (
              <polyline
                key={`${conn.fromId}-${conn.toId}`}
                points={conn.points.map((p) => `${p.x},${p.y}`).join(' ')}
                fill="none"
                stroke="var(--xv2-blue)"
                strokeWidth="2"
                strokeOpacity={conn.isWinnerPath ? 1 : 0.4}
              />
            ))}
          </svg>

          {/* Cartes de match — décalées de 24px comme le SVG (espace des titres) */}
          <div style={{ position: 'absolute', left: 0, top: 24, width: layout.width, height: layout.height }}>
            {layout.cards.map((placed) => (
              <MatchCard key={placed.match.id} placed={placed} serie={serie} slug={slug} teams={teams} />
            ))}
          </div>
        </div>
      </div>

      {/* Bandeau bas fantôme */}
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', padding: '10px 20px' }}>
        <p className="xv2-ghost-text" style={{ fontSize: 16, margin: 0 }}>
          DOUBLE ÉLIMINATION&nbsp;&nbsp;&nbsp;8 ÉQUIPES&nbsp;&nbsp;&nbsp;WINNER&apos;S &amp; LOSER&apos;S BRACKET
        </p>
      </div>
    </section>
  )
}
