'use client'

import { normalizeAxis, type RadarAxisValue } from '@/lib/matchup/stats-compare'

// ════════════════════════════════════════════════════════════════════════════
//  StatRadar — radar de comparaison Alliés vs Ennemis (Lot 2.4)
// ════════════════════════════════════════════════════════════════════════════
// SVG autonome (aucune lib de charts). Chaque axe est normalisé indépendamment
// (normalizeAxis) : unités hétérogènes → le camp le plus élevé touche le bord.
// Deux polygones superposés : alliés (vert), ennemis (rouge).

const ALLY = '#5DCAA5'
const ENEMY = '#E5484D'

// Géométrie : viewBox carré, radar centré, marge pour les libellés.
const SIZE = 360
const CX = SIZE / 2
const CY = SIZE / 2
const R = 116
const RINGS = [0.25, 0.5, 0.75, 1]

// Coordonnées d'un point polaire (angle en degrés, 0 = droite ; -90 = haut).
function polar(angleDeg: number, v: number): [number, number] {
  const a = (angleDeg * Math.PI) / 180
  return [CX + R * v * Math.cos(a), CY + R * v * Math.sin(a)]
}

export default function StatRadar({ axes, c }: { axes: RadarAxisValue[]; c: boolean }) {
  const n = axes.length
  const step = 360 / n
  const angleOf = (i: number) => -90 + i * step

  const grid = c ? 'rgba(186,117,23,0.18)' : 'rgba(255,255,255,0.10)'
  const gridStrong = c ? 'rgba(186,117,23,0.3)' : 'rgba(255,255,255,0.18)'
  const labelColor = 'var(--text-muted)'

  const norm = axes.map(ax => normalizeAxis(ax.ally, ax.enemy))
  const allyPts  = norm.map((v, i) => polar(angleOf(i), v.ally)).map(p => p.join(',')).join(' ')
  const enemyPts = norm.map((v, i) => polar(angleOf(i), v.enemy)).map(p => p.join(',')).join(' ')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} style={{ width: '100%', maxWidth: 420, height: 'auto' }} role="img" aria-label="Radar de comparaison des stats alliés contre ennemis">
        {/* Anneaux de grille */}
        {RINGS.map((ring, ri) => (
          <polygon
            key={ri}
            points={axes.map((_, i) => polar(angleOf(i), ring).join(',')).join(' ')}
            fill="none"
            stroke={ring === 1 ? gridStrong : grid}
            strokeWidth={1}
          />
        ))}

        {/* Rayons + libellés */}
        {axes.map((ax, i) => {
          const [ex, ey] = polar(angleOf(i), 1)
          const [lx, ly] = polar(angleOf(i), 1.16)
          const anchor = Math.abs(lx - CX) < 8 ? 'middle' : lx > CX ? 'start' : 'end'
          return (
            <g key={ax.key}>
              <line x1={CX} y1={CY} x2={ex} y2={ey} stroke={grid} strokeWidth={1} />
              <text
                x={lx} y={ly}
                fill={labelColor} fontSize={11} textAnchor={anchor} dominantBaseline="middle"
              >
                {ax.label}
              </text>
            </g>
          )
        })}

        {/* Polygone ennemis (dessous) */}
        <polygon points={enemyPts} fill={`${ENEMY}33`} stroke={ENEMY} strokeWidth={2} />
        {/* Polygone alliés (dessus) */}
        <polygon points={allyPts} fill={`${ALLY}33`} stroke={ALLY} strokeWidth={2} />

        {/* Sommets */}
        {norm.map((v, i) => {
          const [ax2, ay2] = polar(angleOf(i), v.ally)
          const [ex2, ey2] = polar(angleOf(i), v.enemy)
          return (
            <g key={i}>
              <circle cx={ex2} cy={ey2} r={2.5} fill={ENEMY} />
              <circle cx={ax2} cy={ay2} r={2.5} fill={ALLY} />
            </g>
          )
        })}
      </svg>

      {/* Légende */}
      <div style={{ display: 'flex', gap: 18, fontSize: 12, color: 'var(--text-muted)' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 12, height: 12, borderRadius: 3, background: ALLY, display: 'inline-block' }} /> Alliés
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 12, height: 12, borderRadius: 3, background: ENEMY, display: 'inline-block' }} /> Ennemis
        </span>
      </div>
    </div>
  )
}
