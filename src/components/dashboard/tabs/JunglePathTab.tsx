'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useTheme } from '@/components/providers/ThemeProvider'
import { useSession } from '@/components/providers/SessionProvider'
import { useDashboard } from '@/locales/dashboard'
import { createClient } from '@/lib/supabase/client'
import { RIFT_MAP_LOCAL, applyRiftMapFallback } from '@/lib/rift-map'
import {
  CAMP_BASES, CAMP_POSITIONS, ELEMENT_TYPE, PLACEMENT_TYPES,
  addPlacement, addStroke, campBaseOf, campKey, clearEditable, draftFingerprint, draftToWrite,
  emptyDraft, eraseAt, isBlankDraft, isDisplayable, orderOf, removeCamp, rowToDraft, spellName,
  toPercent, toggleCamp, writeErrorKey,
  type CampTeam, type JunglePathDraft, type JunglePathErrorKey, type JunglePathRow,
  type PathElement, type PlacementType,
} from '@/lib/jungle-path'

/*
 * Éditeur Jungle Path du site — paths PERSONNELS, partagés avec l'app WPF par la table
 * `jungle_paths` (migration 20261018000001). Le format, la conversion 0–100 % ↔ 0–1, les
 * positions des camps et les règles d'édition vivent dans `src/lib/jungle-path.ts`
 * (module pur, testé) : ce composant ne fait que l'interface et les appels Supabase.
 *
 * L'onglet reste derrière le flag de lancement `jungle_path_web_enabled`
 * (`src/lib/launch-tabs.ts`) — le flag ne cache que l'onglet, pas la table.
 */

interface Point { x: number; y: number }

/* Couleurs et pictogrammes des marqueurs : ceux de l'éditeur de l'app
   (`JunglePathTab.RedrawAll`), pour qu'un path se reconnaisse d'un client à l'autre. */
const PLACEMENT_STYLE: Record<PlacementType, { color: string; icon: string }> = {
  Smite:  { color: '#FF6B35', icon: '🗡' },
  Ward:   { color: '#4CAF50', icon: '👁' },
  Invade: { color: '#E53935', icon: '⚔' },
  Gank:   { color: '#9C27B0', icon: '🏃' },
}
const TEAM_COLOR: Record<CampTeam, string> = { Blue: '#3A8AC9', Red: '#E24B4A' }

/* Le Guid de l'app : l'identifiant est généré ICI, pour que le path garde le même id
   des deux côtés (la base n'en invente un qu'en filet). */
const newId = () => crypto.randomUUID()

function placementOf(el: PathElement): PlacementType | null {
  return PLACEMENT_TYPES.find(t => ELEMENT_TYPE[t] === el.Type) ?? null
}

export default function JunglePathTab() {
  const { theme } = useTheme()
  const { user } = useSession()
  const J = useDashboard().strategie.jungle
  const c = theme === 'mythic'
  const supabase = useMemo(() => createClient(), [])
  const svgRef = useRef<SVGSVGElement>(null)

  /* ── Outils ── */
  const [tool, setTool] = useState<'select' | 'draw' | 'erase'>('draw')
  const [color, setColor] = useState('#E24B4A')
  const [thickness, setThickness] = useState(3)
  const [pending, setPending] = useState<PlacementType | null>(null)
  const [stroke, setStroke] = useState<Point[] | null>(null)

  /* ── Données ── */
  const [paths, setPaths] = useState<JunglePathDraft[]>([])
  const [listState, setListState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [draft, setDraft] = useState<JunglePathDraft>(() => emptyDraft(newId()))
  /* Empreinte de la dernière version écrite en base ; `null` = jamais sauvegardé. */
  const [savedPrint, setSavedPrint] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  const isNew = savedPrint === null
  const dirty = isNew ? !isBlankDraft(draft) : draftFingerprint(draft) !== savedPrint

  /* Liste « Mes paths ». Le filtre `user_id` double la RLS (lisible et sans surprise). */
  const userId = user?.id
  useEffect(() => {
    if (!userId) return
    let cancelled = false
    supabase
      .from('jungle_paths')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) { setListState('error'); return }
        setPaths((data ?? []).map(r => rowToDraft(r as JunglePathRow)))
        setListState('ready')
      })
    return () => { cancelled = true }
  }, [supabase, userId])

  /* Fermer l'onglet du navigateur avec des modifications en cours : le navigateur demande. */
  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  function fail(key: JunglePathErrorKey) {
    setNotice({ kind: 'error', text: J.errors[key] })
  }

  function edit(change: (d: JunglePathDraft) => Partial<JunglePathDraft>) {
    setDraft(d => ({ ...d, ...change(d) }))
    setNotice(null)
  }

  /** Quitter le path courant : confirmation s'il porte des modifications. */
  function canLeave(): boolean {
    return !dirty || confirm(J.discardConfirm)
  }

  function openPath(p: JunglePathDraft) {
    if (p.id === draft.id || !canLeave()) return
    setDraft(p)
    setSavedPrint(draftFingerprint(p))
    setPending(null)
    setNotice(null)
  }

  function newPath() {
    if (!canLeave()) return
    setDraft(emptyDraft(newId()))
    setSavedPrint(null)
    setPending(null)
    setNotice(null)
  }

  /* INSERT si le path n'a jamais été écrit, UPDATE sinon — toujours suivi de `.select()` :
     une écriture que la RLS écarte ne lève aucune erreur, elle renvoie 0 ligne. */
  async function save() {
    if (!userId || busy) return
    if (!draft.name.trim()) { fail('needName'); return }
    setBusy(true)
    const sent = draft
    const row = draftToWrite(sent)
    const { id, ...content } = row
    try {
      const { data, error } = isNew
        ? await supabase.from('jungle_paths').insert(row).select()
        : await supabase.from('jungle_paths').update(content).eq('id', id).select()
      const key = writeErrorKey(error, data?.length ?? 0, 'save')
      if (key) { fail(key); return }
      const saved = rowToDraft((data as JunglePathRow[])[0])
      // Une saisie faite pendant l'aller-retour reste dans l'éditeur, et donc « non sauvegardée ».
      setDraft(d => (d === sent ? saved : d))
      setSavedPrint(draftFingerprint(saved))
      setPaths(prev => (prev.some(p => p.id === saved.id)
        ? prev.map(p => (p.id === saved.id ? saved : p))
        : [saved, ...prev]))
      setNotice({ kind: 'ok', text: J.saved })
    } catch {
      fail('network')
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (isNew || busy) return
    if (!confirm(J.deleteConfirm.replace('{name}', draft.name.trim() || '…'))) return
    setBusy(true)
    try {
      const { data, error } = await supabase.from('jungle_paths').delete().eq('id', draft.id).select()
      const key = writeErrorKey(error, data?.length ?? 0, 'delete')
      if (key) { fail(key); return }
      setPaths(prev => prev.filter(p => p.id !== draft.id))
      setDraft(emptyDraft(newId()))
      setSavedPrint(null)
      setNotice({ kind: 'ok', text: J.deleted })
    } catch {
      fail('network')
    } finally {
      setBusy(false)
    }
  }

  function clearAll() {
    if (!confirm(J.clearConfirm)) return
    edit(d => ({ elements: clearEditable(d.elements), strokes: [] }))
  }

  /* ── Carte ── */

  function svgPoint(e: React.PointerEvent<SVGSVGElement>): Point {
    const rect = svgRef.current!.getBoundingClientRect()
    return {
      x: ((e.clientX - rect.left) / rect.width) * 100,
      y: ((e.clientY - rect.top) / rect.height) * 100,
    }
  }

  function onPointerDown(e: React.PointerEvent<SVGSVGElement>) {
    const p = svgPoint(e)
    if (pending) {
      const type = pending
      edit(d => ({ elements: addPlacement(d.elements, type, p.x, p.y) }))
      setPending(null)
      return
    }
    if (tool === 'erase') {
      edit(d => eraseAt(d.elements, d.strokes, p.x, p.y))
      return
    }
    if (tool === 'draw') {
      e.currentTarget.setPointerCapture(e.pointerId)
      setStroke([p])
    }
  }

  function onPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    if (!stroke) return
    const p = svgPoint(e)
    setStroke(prev => (prev ? [...prev, p] : prev))
  }

  function onPointerUp() {
    if (!stroke) return
    const points = stroke
    setStroke(null)
    if (points.length > 1) edit(d => ({ strokes: addStroke(d.strokes, points, color, thickness) }))
  }

  const pointsToD = (pts: Point[]) => pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ')

  /* Camps du path, par clé — pour l'état des boutons. */
  const campsInPath = new Map(
    draft.elements.filter(el => el.Type === ELEMENT_TYPE.Camp && el.Label).map(el => [el.Label!, el]),
  )
  /* Jungle de l'équipe jouée d'abord, comme dans l'app. */
  const teams: CampTeam[] = draft.side === 'Red' ? ['Red', 'Blue'] : ['Blue', 'Red']

  const inputStyle: React.CSSProperties = {
    background: c ? 'rgba(20,10,35,0.6)' : '#18181B',
    border: `1px solid ${c ? 'rgba(186,117,23,0.3)' : '#27272A'}`,
    borderRadius: 4, padding: '5px 10px', color: '#F5F2FA',
    fontFamily: 'inherit', fontSize: 12, outline: 'none',
  }
  const titleStyle: React.CSSProperties = {
    fontSize: 12, color: c ? '#BA7517' : '#7F77DD', fontWeight: 600,
    textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8,
  }
  const sideButton = (borderColor: string, textColor: string, active = false): React.CSSProperties => ({
    display: 'block', width: '100%', padding: '6px 10px', marginBottom: 4,
    background: active ? `${borderColor}33` : 'rgba(20,10,35,0.4)',
    border: `1px solid ${borderColor}${active ? '' : '66'}`,
    borderRadius: 4, color: textColor, fontSize: 11,
    cursor: 'pointer', fontFamily: 'inherit', textAlign: 'center',
  })

  return (
    <div>
      {/* Barre d'outils */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 14,
        padding: '10px 14px', marginBottom: 14, borderRadius: 6,
        background: c ? 'rgba(42,21,71,0.3)' : '#18181B',
        border: `1px solid ${c ? 'rgba(186,117,23,0.2)' : '#27272A'}`,
        fontSize: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ color: 'var(--text-muted)' }}>{J.nameLabel}</span>
          <input style={{ ...inputStyle, width: 130 }} value={draft.name} maxLength={100}
            onChange={e => { const name = e.target.value; edit(() => ({ name })) }}
            placeholder={J.namePlaceholder} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ color: 'var(--text-muted)' }}>{J.championLabel}</span>
          <input style={{ ...inputStyle, width: 110 }} value={draft.champion} maxLength={50}
            onChange={e => { const champion = e.target.value; edit(() => ({ champion })) }}
            placeholder={J.championPlaceholder} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ color: 'var(--text-muted)' }}>{J.sideLabel}</span>
          {(['Blue', 'Red'] as const).map(s => (
            <label key={s} style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--text)', cursor: 'pointer', fontSize: 12 }}>
              <input type="radio" checked={draft.side === s} onChange={() => edit(() => ({ side: s }))}
                style={{ accentColor: '#BA7517' }} />
              {s === 'Blue' ? J.sideBlue : J.sideRed}
            </label>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ color: 'var(--text-muted)' }}>{J.toolLabel}</span>
          {(['select', 'draw', 'erase'] as const).map(t => (
            <button key={t} onClick={() => { setTool(t); setPending(null) }} style={{
              ...inputStyle, cursor: 'pointer', padding: '4px 10px',
              background: tool === t && !pending ? (c ? 'rgba(186,117,23,0.2)' : '#27272A') : 'transparent',
              borderColor: tool === t && !pending ? (c ? 'rgba(186,117,23,0.6)' : '#7F77DD') : undefined,
            }}>
              {t === 'select' ? J.toolSelect : t === 'draw' ? J.toolDraw : J.toolErase}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ color: 'var(--text-muted)' }}>{J.colorLabel}</span>
          <input type="color" value={color} onChange={e => setColor(e.target.value)}
            style={{ width: 28, height: 22, border: '1px solid rgba(186,117,23,0.4)', borderRadius: 3, cursor: 'pointer', background: 'none' }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ color: 'var(--text-muted)' }}>{J.thicknessLabel}</span>
          <input type="range" min={1} max={8} value={thickness} onChange={e => setThickness(+e.target.value)}
            style={{ width: 80, accentColor: '#BA7517' }} />
        </div>
        <button onClick={clearAll} style={{
          ...inputStyle, marginLeft: 'auto', cursor: 'pointer', color: '#E24B4A',
          borderColor: 'rgba(226,75,74,0.4)',
        }}>{J.clear}</button>
      </div>

      <div className="dash-grid-jungle">
        {/* Mes paths */}
        <div>
          <div style={titleStyle}>{J.myPaths}</div>
          <button onClick={newPath} style={{ ...sideButton(c ? '#BA7517' : '#7F77DD', c ? '#FAC775' : '#A1A1AA'), marginBottom: 8 }}>
            {J.newPath}
          </button>
          {listState === 'loading' && (
            <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{J.loadingPaths}</div>
          )}
          {listState === 'error' && (
            <div style={{ fontSize: 11, color: '#E24B4A' }}>{J.errors.loadFailed}</div>
          )}
          {listState === 'ready' && paths.length === 0 && (
            <div style={{ fontSize: 11, color: 'var(--text-dim)', lineHeight: 1.4 }}>{J.noPaths}</div>
          )}
          {paths.map(p => {
            const active = p.id === draft.id
            return (
              <button key={p.id} onClick={() => openPath(p)} aria-current={active ? 'true' : undefined} style={{
                display: 'block', width: '100%', textAlign: 'left', fontFamily: 'inherit',
                background: active ? (c ? 'rgba(186,117,23,0.18)' : '#27272A') : (c ? 'rgba(42,21,71,0.4)' : '#18181B'),
                border: `1px solid ${active ? (c ? 'rgba(186,117,23,0.7)' : '#7F77DD') : (c ? 'rgba(186,117,23,0.25)' : '#27272A')}`,
                borderRadius: 5, padding: '8px 12px', marginBottom: 6,
                fontSize: 11, color: c ? '#FAC775' : '#A1A1AA', cursor: 'pointer',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {active && dirty ? '● ' : ''}{p.name}
                <div style={{ color: 'var(--text-dim)', marginTop: 2 }}>
                  {p.champion || '—'} · {p.side === 'Red' ? J.sideRed : J.sideBlue}
                </div>
              </button>
            )
          })}
        </div>

        {/* Carte — conteneur CARRÉ (`.jungle-map`) : même repère 0–1 que l'app */}
        <div style={{
          background: '#0d1015',
          border: `1px solid ${c ? 'rgba(186,117,23,0.25)' : '#27272A'}`,
          borderRadius: 6, overflow: 'hidden', alignSelf: 'start',
        }}>
          <div className="jungle-map" style={{ cursor: pending || tool !== 'select' ? 'crosshair' : 'default' }}>
            <img
              src={RIFT_MAP_LOCAL}
              alt="Summoner's Rift"
              onError={e => applyRiftMapFallback(e.currentTarget)}
              style={{ objectFit: 'fill', opacity: 0.85, pointerEvents: 'none' }}
            />
            <svg
              ref={svgRef}
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              style={{ touchAction: pending || tool !== 'select' ? 'none' : 'auto' }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            >
              <rect width="100" height="100" fill="rgba(0,0,0,0.15)" />
              {draft.strokes.map((s, i) => (
                <path key={i}
                  d={pointsToD(s.Points.map(pt => ({ x: toPercent(pt.X), y: toPercent(pt.Y) })))}
                  stroke={s.Color ?? '#FF0000'} strokeWidth={(s.Thickness ?? 3) * 0.3}
                  fill="none" strokeLinecap="round" strokeLinejoin="round" />
              ))}
              {stroke && stroke.length > 1 && (
                <path d={pointsToD(stroke)} stroke={color} strokeWidth={thickness * 0.3}
                  fill="none" strokeLinecap="round" strokeLinejoin="round" opacity="0.8" />
              )}
              {draft.elements.filter(isDisplayable).map((el, i) => {
                const x = toPercent(el.X)
                const y = toPercent(el.Y)
                if (el.Type === ELEMENT_TYPE.Camp) {
                  const base = campBaseOf(el.Label)
                  const order = orderOf(el)
                  return (
                    <g key={i} pointerEvents="none">
                      <title>{base ? J.camps[base] : el.Label}</title>
                      <circle cx={x} cy={y} r={2.4} fill={CAMP_POSITIONS[el.Label ?? '']?.color ?? '#FFFFFF'}
                        opacity={0.9} stroke={el.HasSmite ? '#FFFFFF' : 'none'} strokeWidth={0.5} />
                      {order >= 0 && (
                        <text x={x} y={y} textAnchor="middle" dominantBaseline="central"
                          fontSize={2.4} fontWeight={700} fill="#FFFFFF">{order}</text>
                      )}
                      {el.HasSmite && <text x={x + 2.4} y={y - 2.2} fontSize={2.2}>🗡</text>}
                    </g>
                  )
                }
                if (el.Type === ELEMENT_TYPE.Spell) {
                  return (
                    <g key={i} pointerEvents="none">
                      <title>{J.spellMarker.replace('{spell}', spellName(el.Label))}</title>
                      <rect x={x - 1.4} y={y - 1.4} width={2.8} height={2.8} fill="#7F77DD"
                        transform={`rotate(45 ${x} ${y})`} opacity={0.9} />
                    </g>
                  )
                }
                const type = placementOf(el)
                if (!type) return null
                return (
                  <g key={i} pointerEvents="none">
                    <title>{J.placements[type]}</title>
                    <circle cx={x} cy={y} r={2} fill={PLACEMENT_STYLE[type].color} opacity={0.9} />
                    <text x={x} y={y} textAnchor="middle" dominantBaseline="central" fontSize={2.2}>
                      {PLACEMENT_STYLE[type].icon}
                    </text>
                  </g>
                )
              })}
            </svg>
          </div>
        </div>

        {/* Camps, marqueurs, actions */}
        <div>
          {teams.map(team => (
            <div key={team} style={{ marginBottom: 14 }}>
              <div style={titleStyle}>
                {J.campsTeamTitle.replace('{team}', team === 'Blue' ? J.sideBlue : J.sideRed)}
              </div>
              {CAMP_BASES.map(base => {
                const key = campKey(base, team)
                const inPath = campsInPath.get(key)
                const order = inPath ? orderOf(inPath) : -1
                return (
                  <div key={key} style={{ display: 'flex', gap: 4 }}>
                    <button onClick={() => edit(d => ({ elements: toggleCamp(d.elements, key) }))}
                      title={J.campHint}
                      style={sideButton(TEAM_COLOR[team], TEAM_COLOR[team], !!inPath)}>
                      {order >= 0 ? `${order}. ` : ''}{J.camps[base]}{inPath?.HasSmite ? ' 🗡' : ''}
                    </button>
                    {inPath && (
                      <button onClick={() => edit(d => ({ elements: removeCamp(d.elements, key) }))}
                        aria-label={J.removeCamp.replace('{camp}', J.camps[base])}
                        title={J.removeCamp.replace('{camp}', J.camps[base])}
                        style={{ ...sideButton(TEAM_COLOR[team], TEAM_COLOR[team]), width: 28, padding: '6px 0' }}>
                        ✕
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          ))}

          <div style={{ marginBottom: 14 }}>
            <div style={{ ...titleStyle, marginBottom: 6 }}>{J.placeTitle}</div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 8, lineHeight: 1.4 }}>
              {pending ? J.placePending.replace('{marker}', J.placements[pending]) : J.placeHint}
            </div>
            {PLACEMENT_TYPES.map(type => (
              <button key={type} onClick={() => setPending(p => (p === type ? null : type))}
                aria-pressed={pending === type}
                style={sideButton(PLACEMENT_STYLE[type].color, PLACEMENT_STYLE[type].color, pending === type)}>
                {PLACEMENT_STYLE[type].icon} {J.placements[type]}
              </button>
            ))}
          </div>

          <button onClick={save} disabled={busy || !userId} style={{
            width: '100%', padding: 10,
            background: 'linear-gradient(135deg, #7F77DD, #534AB7)',
            border: 'none', borderRadius: 5, color: 'white',
            fontSize: 12, fontWeight: 600, cursor: busy ? 'wait' : 'pointer', fontFamily: 'inherit',
            opacity: busy || !userId ? 0.6 : 1,
          }}>
            {busy ? J.saving : J.save}
          </button>
          {dirty && (
            <div style={{ fontSize: 11, color: '#EF9F27', marginTop: 6 }}>● {J.unsaved}</div>
          )}
          {!isNew && (
            <button onClick={remove} disabled={busy} style={{
              ...sideButton('#E24B4A', '#E24B4A'), marginTop: 8, marginBottom: 0,
              opacity: busy ? 0.6 : 1,
            }}>{J.delete}</button>
          )}
          {notice && (
            <div role={notice.kind === 'error' ? 'alert' : 'status'} style={{
              fontSize: 11, marginTop: 8, lineHeight: 1.4,
              color: notice.kind === 'error' ? '#E24B4A' : '#5DCAA5',
            }}>{notice.text}</div>
          )}
        </div>
      </div>
    </div>
  )
}
