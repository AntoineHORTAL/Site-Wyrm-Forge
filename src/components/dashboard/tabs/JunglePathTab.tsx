'use client'

import { useState, useRef } from 'react'
import { useTheme } from '@/components/providers/ThemeProvider'

interface Point { x: number; y: number }
interface PathData { id: number; name: string; champion: string; points: Point[] }

const savedPaths: PathData[] = [
  { id: 1, name: 'Full Clear Blue Side', champion: 'Hecarim', points: [] },
  { id: 2, name: 'Invade Red Côté Rouge', champion: 'Vi', points: [] },
]

const campsBlu = ['Gromp', 'Loups', 'Gardien', 'Rift Scuttler', 'Dragon']
const campsRed = ['Krug', 'Raptor', 'Fantôme Rouge', 'Rift Scuttler', 'Baron']
const placements = [
  { label: 'Smite', c: 'orange' },
  { label: 'Ward', c: 'green' },
  { label: 'Invade', c: 'red' },
  { label: 'Gank', c: 'purple' },
]

const campColors: Record<string, string> = {
  orange: '#BA7517', green: '#5DCAA5', red: '#E24B4A', purple: '#BC6FE2',
}

export default function JunglePathTab() {
  const { theme } = useTheme()
  const c = theme === 'mythic'
  const svgRef = useRef<SVGSVGElement>(null)
  const [tool, setTool] = useState<'select' | 'draw' | 'erase'>('draw')
  const [color, setColor] = useState('#E24B4A')
  const [thickness, setThickness] = useState(3)
  const [name, setName] = useState('')
  const [champion, setChampion] = useState('')
  const [side, setSide] = useState<'blue' | 'red'>('blue')
  const [drawing, setDrawing] = useState(false)
  const [paths, setPaths] = useState<{ points: Point[]; color: string; thickness: number }[]>([])
  const [currentPath, setCurrentPath] = useState<Point[]>([])

  const inputStyle: React.CSSProperties = {
    background: c ? 'rgba(20,10,35,0.6)' : '#18181B',
    border: `1px solid ${c ? 'rgba(186,117,23,0.3)' : '#27272A'}`,
    borderRadius: 4, padding: '5px 10px', color: '#F5F2FA',
    fontFamily: 'inherit', fontSize: 12, outline: 'none',
  }

  function getSvgPoint(e: React.MouseEvent<SVGSVGElement>) {
    const svg = svgRef.current!
    const rect = svg.getBoundingClientRect()
    return {
      x: ((e.clientX - rect.left) / rect.width) * 100,
      y: ((e.clientY - rect.top) / rect.height) * 100,
    }
  }

  function onMouseDown(e: React.MouseEvent<SVGSVGElement>) {
    if (tool !== 'draw') return
    setDrawing(true)
    setCurrentPath([getSvgPoint(e)])
  }

  function onMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    if (!drawing || tool !== 'draw') return
    setCurrentPath(prev => [...prev, getSvgPoint(e)])
  }

  function onMouseUp() {
    if (!drawing) return
    setDrawing(false)
    if (currentPath.length > 1) {
      setPaths(prev => [...prev, { points: currentPath, color, thickness }])
    }
    setCurrentPath([])
  }

  function pointsToD(pts: Point[]) {
    if (pts.length < 2) return ''
    return pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ')
  }

  return (
    <div>
      {/* Toolbar */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 14,
        padding: '10px 14px', marginBottom: 14, borderRadius: 6,
        background: c ? 'rgba(42,21,71,0.3)' : '#18181B',
        border: `1px solid ${c ? 'rgba(186,117,23,0.2)' : '#27272A'}`,
        fontSize: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ color: 'var(--text-muted)' }}>Nom :</span>
          <input style={{ ...inputStyle, width: 130 }} value={name} onChange={e => setName(e.target.value)} placeholder="Mon path..." />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ color: 'var(--text-muted)' }}>Champion :</span>
          <input style={{ ...inputStyle, width: 110 }} value={champion} onChange={e => setChampion(e.target.value)} placeholder="Vi, Hecarim..." />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ color: 'var(--text-muted)' }}>Côté :</span>
          {(['blue', 'red'] as const).map(s => (
            <label key={s} style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--text)', cursor: 'pointer', fontSize: 12 }}>
              <input type="radio" checked={side === s} onChange={() => setSide(s)} style={{ accentColor: '#BA7517' }} />
              {s === 'blue' ? 'Bleu' : 'Rouge'}
            </label>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ color: 'var(--text-muted)' }}>Outil :</span>
          {(['select', 'draw', 'erase'] as const).map(t => (
            <button key={t} onClick={() => setTool(t)} style={{
              ...inputStyle, cursor: 'pointer', padding: '4px 10px',
              background: tool === t ? (c ? 'rgba(186,117,23,0.2)' : '#27272A') : 'transparent',
              borderColor: tool === t ? (c ? 'rgba(186,117,23,0.6)' : '#7F77DD') : undefined,
            }}>
              {t === 'select' ? 'Sélection' : t === 'draw' ? 'Tracé' : 'Gomme'}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ color: 'var(--text-muted)' }}>Couleur :</span>
          <input type="color" value={color} onChange={e => setColor(e.target.value)}
            style={{ width: 28, height: 22, border: '1px solid rgba(186,117,23,0.4)', borderRadius: 3, cursor: 'pointer', background: 'none' }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ color: 'var(--text-muted)' }}>Épais. :</span>
          <input type="range" min={1} max={8} value={thickness} onChange={e => setThickness(+e.target.value)}
            style={{ width: 80, accentColor: '#BA7517' }} />
        </div>
        <button onClick={() => setPaths([])} style={{
          ...inputStyle, marginLeft: 'auto', cursor: 'pointer', color: '#E24B4A',
          borderColor: 'rgba(226,75,74,0.4)',
        }}>Annuler</button>
      </div>

      {/* Main layout */}
      <div className="dash-grid-jungle">
        {/* Sidebar paths */}
        <div>
          <div style={{ fontSize: 12, color: c ? '#BA7517' : '#7F77DD', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
            Mes paths
          </div>
          {savedPaths.map(p => (
            <div key={p.id} style={{
              background: c ? 'rgba(42,21,71,0.4)' : '#18181B',
              border: `1px solid ${c ? 'rgba(186,117,23,0.25)' : '#27272A'}`,
              borderRadius: 5, padding: '8px 12px', marginBottom: 6,
              fontSize: 11, color: c ? '#FAC775' : '#A1A1AA', cursor: 'pointer',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {p.name}
              <div style={{ color: 'var(--text-dim)', marginTop: 2 }}>{p.champion}</div>
            </div>
          ))}
        </div>

        {/* Canvas */}
        <div style={{
          position: 'relative',
          background: '#0d1015',
          border: `1px solid ${c ? 'rgba(186,117,23,0.25)' : '#27272A'}`,
          borderRadius: 6, overflow: 'hidden', cursor: tool === 'draw' ? 'crosshair' : 'default',
        }}>
          {/* Vraie carte SR en arrière-plan (image locale + fallbacks DDragon) */}
          <img
            src="/icons/maps/summoners_rift.png"
            alt="Summoner's Rift"
            onError={e => {
              const img = e.currentTarget as HTMLImageElement
              if (img.src.endsWith('summoners_rift.png')) {
                img.src = 'https://ddragon.leagueoflegends.com/cdn/14.24.1/img/map/map11.png'
              } else if (img.src.includes('14.24.1')) {
                img.src = 'https://ddragon.leagueoflegends.com/cdn/img/map/map11.png'
              }
            }}
            style={{
              position: 'absolute', inset: 0, width: '100%', height: '100%',
              objectFit: 'cover', opacity: 0.85, pointerEvents: 'none',
            }}
          />
          <svg
            ref={svgRef}
            viewBox="0 0 100 100"
            preserveAspectRatio="xMidYMid meet"
            style={{ position: 'relative', width: '100%', display: 'block', minHeight: 480 }}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
          >
            {/* Léger voile pour mieux voir les tracés au-dessus */}
            <rect width="100" height="100" fill="rgba(0,0,0,0.15)" />
            {/* Saved paths */}
            {paths.map((path, i) => (
              <path key={i} d={pointsToD(path.points)} stroke={path.color} strokeWidth={path.thickness * 0.3} fill="none" strokeLinecap="round" strokeLinejoin="round" />
            ))}
            {/* Current drawing path */}
            {currentPath.length > 1 && (
              <path d={pointsToD(currentPath)} stroke={color} strokeWidth={thickness * 0.3} fill="none" strokeLinecap="round" strokeLinejoin="round" opacity="0.8" />
            )}
          </svg>
        </div>

        {/* Elements panel */}
        <div>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 12, color: c ? '#BA7517' : '#7F77DD', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
              Camps Bleu
            </div>
            {campsBlu.map(camp => (
              <button key={camp} style={{
                display: 'block', width: '100%', padding: '6px 10px', marginBottom: 4,
                background: 'rgba(20,10,35,0.4)',
                border: '1px solid rgba(58,138,201,0.4)',
                borderRadius: 4, color: '#3A8AC9', fontSize: 11,
                cursor: 'pointer', fontFamily: 'inherit', textAlign: 'center',
              }}>{camp}</button>
            ))}
          </div>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 12, color: c ? '#BA7517' : '#7F77DD', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
              Camps Rouge
            </div>
            {campsRed.map(camp => (
              <button key={camp} style={{
                display: 'block', width: '100%', padding: '6px 10px', marginBottom: 4,
                background: 'rgba(20,10,35,0.4)',
                border: '1px solid rgba(226,75,74,0.4)',
                borderRadius: 4, color: '#E24B4A', fontSize: 11,
                cursor: 'pointer', fontFamily: 'inherit', textAlign: 'center',
              }}>{camp}</button>
            ))}
          </div>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 12, color: c ? '#BA7517' : '#7F77DD', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
              Placer
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 8, lineHeight: 1.4 }}>
              Clique sur la map pour placer un marqueur
            </div>
            {placements.map(p => (
              <button key={p.label} style={{
                display: 'block', width: '100%', padding: '6px 10px', marginBottom: 4,
                background: 'rgba(20,10,35,0.4)',
                border: `1px solid ${campColors[p.c]}40`,
                borderRadius: 4, color: campColors[p.c], fontSize: 11,
                cursor: 'pointer', fontFamily: 'inherit', textAlign: 'center',
              }}>{p.label}</button>
            ))}
          </div>
          <button style={{
            width: '100%', padding: 10,
            background: 'linear-gradient(135deg, #7F77DD, #534AB7)',
            border: 'none', borderRadius: 5, color: 'white',
            fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
            marginTop: 'auto',
          }}>
            Sauvegarder
          </button>
        </div>
      </div>
    </div>
  )
}
