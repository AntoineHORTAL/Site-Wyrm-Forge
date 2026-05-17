'use client'

/**
 * Scénarios — planification de macro stratégique.
 *
 * Permet de :
 *  - Choisir 5 champions alliés (un par rôle)
 *  - Dessiner sur la map Summoner's Rift :
 *      - Wards (positions clés)
 *      - Flèches (rotations attendues)
 *      - Zones d'engagement (cercles)
 *      - Pings (positions de fight)
 *      - Lane prioritaire (highlight)
 *
 * Persistance : table `scenarios` Supabase (jsonb pour allies et drawings).
 */
import { useState, useEffect, useRef } from 'react'
import { useTheme } from '@/components/providers/ThemeProvider'
import { createClient } from '@/lib/supabase/client'

const supabase = createClient()
const DDN = 'https://ddragon.leagueoflegends.com'

// ── Types ────────────────────────────────────────────────────────────────────
interface DDChamp { id: string; name: string; image: string }

type Role = 'TOP' | 'JUNGLE' | 'MID' | 'ADC' | 'SUPPORT'
const ROLES: Role[] = ['TOP', 'JUNGLE', 'MID', 'ADC', 'SUPPORT']

interface Ally {
  role: Role
  champ: DDChamp | null
}

// Outils de dessin
type Tool = 'select' | 'ward' | 'arrow' | 'zone' | 'ping' | 'lane' | 'erase'

interface Drawing {
  id: string
  type: 'ward' | 'arrow' | 'zone' | 'ping' | 'lane'
  // Position(s) en pourcentage du viewBox (0-100) pour rester responsive
  points: { x: number; y: number }[]
  // Métadonnées spécifiques
  wardType?: 'yellow' | 'control' | 'blue'
  pingType?: 'danger' | 'help' | 'fight'
  laneId?: 'TOP' | 'MID' | 'BOT'
  color?: string
  // Phase de la game pour laquelle ce dessin est pertinent
  phase?: 'early' | 'mid' | 'late' | 'all'
  // Optionnel : label utilisateur (note libre)
  label?: string
}

interface Scenario {
  id: string
  name: string
  allies: Ally[]
  drawings: Drawing[]
  createdAt: string
}

// ── Constantes UI ────────────────────────────────────────────────────────────
const ROLE_LABELS: Record<Role, string> = {
  TOP: 'TOP', JUNGLE: 'JUNGLE', MID: 'MID', ADC: 'ADC', SUPPORT: 'SUPPORT',
}
const ROLE_COLORS: Record<Role, string> = {
  TOP: '#E24B4A', JUNGLE: '#5DCAA5', MID: '#EF9F27', ADC: '#7F77DD', SUPPORT: '#3A8AC9',
}

const WARD_COLORS = {
  yellow: '#EAB308', control: '#A855F7', blue: '#3B82F6',
}
const PING_COLORS = {
  danger: '#E24B4A', help: '#5DCAA5', fight: '#EF9F27',
}
const PHASE_LABELS = {
  early: 'Early', mid: 'Mid', late: 'Late', all: 'Toute la game',
}

const SR_MAP = '/icons/maps/summoners_rift.png'

const uid = () => Math.random().toString(36).slice(2, 9)

// ── Composant ────────────────────────────────────────────────────────────────
export default function ScenariosTab() {
  const { theme } = useTheme()
  const c = theme === 'mythic'
  const bg = c ? 'rgba(42,21,71,0.4)' : '#18181B'
  const border = c ? 'rgba(186,117,23,0.2)' : '#27272A'
  const accent = c ? '#BA7517' : '#7F77DD'

  // Navigation
  const [view, setView] = useState<'list' | 'editor'>('list')
  const [savedScenarios, setSavedScenarios] = useState<Scenario[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)

  // DDragon
  const [version, setVersion] = useState('')
  const [allChamps, setAllChamps] = useState<DDChamp[]>([])

  // Editor state
  const [scenarioName, setScenarioName] = useState('')
  const [allies, setAllies] = useState<Ally[]>(ROLES.map(role => ({ role, champ: null })))
  const [drawings, setDrawings] = useState<Drawing[]>([])
  const [activeTool, setActiveTool] = useState<Tool>('select')
  const [activePhase, setActivePhase] = useState<Drawing['phase']>('all')
  const [activeWardType, setActiveWardType] = useState<'yellow' | 'control' | 'blue'>('yellow')
  const [activePingType, setActivePingType] = useState<'danger' | 'help' | 'fight'>('fight')

  // Arrow drawing state (2 clicks)
  const [arrowStart, setArrowStart] = useState<{ x: number; y: number } | null>(null)

  // Saving
  const [saving, setSaving] = useState(false)

  // Champion picker
  const [champPickerRole, setChampPickerRole] = useState<Role | null>(null)
  const [champSearch, setChampSearch] = useState('')

  const mapRef = useRef<HTMLDivElement>(null)

  // ── Load au montage : user, version, champions, scénarios ──
  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [{ data: { user } }, vRes] = await Promise.all([
          supabase.auth.getUser(),
          fetch(`${DDN}/api/versions.json`),
        ])
        if (cancelled) return
        setUserId(user?.id ?? null)
        const vList: string[] = await vRes.json()
        const v = vList[0]
        setVersion(v)

        // Champions
        const cRes = await fetch(`${DDN}/cdn/${v}/data/fr_FR/champion.json`)
        const cData = await cRes.json()
        if (cancelled) return
        const champs: DDChamp[] = Object.entries(cData.data)
          .map(([id, raw]: [string, unknown]) => {
            const r = raw as { name: string; image: { full: string } }
            return { id, name: r.name, image: r.image.full }
          })
          .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
        setAllChamps(champs)

        // Scénarios sauvegardés
        if (user) {
          const { data: rows } = await supabase
            .from('scenarios')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
          if (!cancelled && rows) {
            setSavedScenarios(rows.map((r): Scenario => ({
              id: r.id,
              name: r.name,
              allies: r.allies ?? ROLES.map(role => ({ role, champ: null })),
              drawings: r.drawings ?? [],
              createdAt: r.created_at,
            })))
          }
        }
      } catch (e) {
        console.error('[ScenariosTab] load error', e)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  // ── Actions liste ──
  function openNew() {
    setScenarioName('')
    setAllies(ROLES.map(role => ({ role, champ: null })))
    setDrawings([])
    setEditingId(null)
    setActiveTool('select')
    setArrowStart(null)
    setView('editor')
  }

  function openEdit(s: Scenario) {
    setScenarioName(s.name)
    setAllies(s.allies)
    setDrawings(s.drawings)
    setEditingId(s.id)
    setActiveTool('select')
    setArrowStart(null)
    setView('editor')
  }

  async function deleteScenario(id: string) {
    await supabase.from('scenarios').delete().eq('id', id)
    setSavedScenarios(prev => prev.filter(s => s.id !== id))
  }

  async function saveScenario() {
    if (!userId) return
    setSaving(true)
    const payload = {
      name: scenarioName.trim() || 'Scénario sans nom',
      allies,
      drawings,
    }
    try {
      if (editingId) {
        await supabase.from('scenarios').update(payload).eq('id', editingId)
        setSavedScenarios(prev => prev.map(s =>
          s.id === editingId ? { ...s, ...payload } : s,
        ))
      } else {
        const { data } = await supabase
          .from('scenarios')
          .insert({ ...payload, user_id: userId })
          .select()
          .single()
        if (data) {
          setSavedScenarios(prev => [{
            id: data.id,
            name: data.name,
            allies: data.allies,
            drawings: data.drawings,
            createdAt: data.created_at,
          }, ...prev])
        }
      }
      setView('list')
    } finally {
      setSaving(false)
    }
  }

  // ── Interactions map ──
  function getMapCoords(e: React.MouseEvent): { x: number; y: number } | null {
    if (!mapRef.current) return null
    const rect = mapRef.current.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 100
    const y = ((e.clientY - rect.top) / rect.height) * 100
    return { x: Math.max(0, Math.min(100, x)), y: Math.max(0, Math.min(100, y)) }
  }

  function handleMapClick(e: React.MouseEvent) {
    const pos = getMapCoords(e)
    if (!pos) return

    if (activeTool === 'ward') {
      setDrawings(prev => [...prev, {
        id: uid(), type: 'ward', points: [pos],
        wardType: activeWardType, phase: activePhase,
        color: WARD_COLORS[activeWardType],
      }])
    } else if (activeTool === 'ping') {
      setDrawings(prev => [...prev, {
        id: uid(), type: 'ping', points: [pos],
        pingType: activePingType, phase: activePhase,
        color: PING_COLORS[activePingType],
      }])
    } else if (activeTool === 'zone') {
      // Cercle : un clic = centre, le rayon est implicite (10% de la map par défaut, ajustable plus tard)
      setDrawings(prev => [...prev, {
        id: uid(), type: 'zone', points: [pos],
        phase: activePhase, color: '#EF9F27',
      }])
    } else if (activeTool === 'arrow') {
      if (!arrowStart) {
        setArrowStart(pos)
      } else {
        // 2e clic = fin de la flèche
        setDrawings(prev => [...prev, {
          id: uid(), type: 'arrow', points: [arrowStart, pos],
          phase: activePhase, color: '#5DCAA5',
        }])
        setArrowStart(null)
      }
    }
  }

  function handleLaneClick(laneId: 'TOP' | 'MID' | 'BOT') {
    if (activeTool !== 'lane') return
    // Toggle : si la lane est déjà highlightée, on l'enlève
    const existing = drawings.find(d => d.type === 'lane' && d.laneId === laneId)
    if (existing) {
      setDrawings(prev => prev.filter(d => d.id !== existing.id))
    } else {
      setDrawings(prev => [...prev, {
        id: uid(), type: 'lane', points: [],
        laneId, phase: activePhase, color: '#EF9F27',
      }])
    }
  }

  function deleteDrawing(id: string) {
    setDrawings(prev => prev.filter(d => d.id !== id))
  }

  // Filtrer les dessins par phase active
  const visibleDrawings = drawings.filter(d => d.phase === activePhase || d.phase === 'all' || activePhase === 'all')

  // ────────────────────────────────────────────────────────────────────────────
  // RENDER : VUE LISTE
  // ────────────────────────────────────────────────────────────────────────────
  if (view === 'list') {
    return (
      <div>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginBottom: 16,
        }}>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            {savedScenarios.length} scénario{savedScenarios.length !== 1 ? 's' : ''} sauvegardé{savedScenarios.length !== 1 ? 's' : ''}
          </div>
          <button onClick={openNew} style={{
            padding: '8px 16px', borderRadius: 6, fontSize: 13, fontWeight: 600,
            background: 'linear-gradient(135deg, #7F77DD, #534AB7)',
            color: 'white', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
          }}>
            + Nouveau scénario
          </button>
        </div>

        {savedScenarios.length === 0 ? (
          <div style={{
            padding: 40, textAlign: 'center', borderRadius: 10,
            background: bg, border: `1px solid ${border}`,
            color: 'var(--text-muted)', fontSize: 14,
          }}>
            Aucun scénario sauvegardé. Crée ton premier pour planifier ta macro.
          </div>
        ) : (
          <div style={{
            display: 'grid', gap: 12,
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          }}>
            {savedScenarios.map(s => (
              <div key={s.id} style={{
                padding: 14, borderRadius: 8,
                background: bg, border: `1px solid ${border}`,
              }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#F5F2FA', marginBottom: 8 }}>
                  {s.name}
                </div>
                <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
                  {s.allies.map(a => a.champ && version ? (
                    <img key={a.role} src={`${DDN}/cdn/${version}/img/champion/${a.champ.image}`}
                      alt={a.champ.name} title={`${a.role} — ${a.champ.name}`}
                      style={{
                        width: 32, height: 32, borderRadius: 4,
                        border: `2px solid ${ROLE_COLORS[a.role]}`,
                      }} />
                  ) : (
                    <div key={a.role} style={{
                      width: 32, height: 32, borderRadius: 4,
                      background: 'rgba(255,255,255,0.04)',
                      border: `2px dashed ${ROLE_COLORS[a.role]}55`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 9, color: 'var(--text-dim)',
                    }} title={a.role}>{a.role.slice(0, 3)}</div>
                  ))}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 8 }}>
                  {s.drawings.length} élément{s.drawings.length !== 1 ? 's' : ''} sur la map
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => openEdit(s)} style={{
                    flex: 1, padding: '6px 10px', fontSize: 12, cursor: 'pointer',
                    background: 'rgba(127,119,221,0.15)',
                    border: '1px solid rgba(127,119,221,0.4)',
                    color: '#F5F2FA', borderRadius: 5, fontFamily: 'inherit',
                  }}>Modifier</button>
                  <button onClick={() => deleteScenario(s.id)} style={{
                    padding: '6px 10px', fontSize: 12, cursor: 'pointer',
                    background: 'transparent', border: '1px solid #E24B4A',
                    color: '#E24B4A', borderRadius: 5, fontFamily: 'inherit',
                  }}>🗑</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  // ────────────────────────────────────────────────────────────────────────────
  // RENDER : VUE ÉDITEUR
  // ────────────────────────────────────────────────────────────────────────────
  const filteredChamps = allChamps.filter(ch =>
    ch.name.toLowerCase().includes(champSearch.toLowerCase()),
  )

  return (
    <div style={{ position: 'relative' }}>
      {/* ══ Topbar ══════════════════════════════════════════════════════════ */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10,
        padding: '10px 14px', marginBottom: 14, borderRadius: 6,
        background: bg, border: `1px solid ${border}`,
      }}>
        <button onClick={() => setView('list')} style={{
          height: 32, padding: '0 12px', boxSizing: 'border-box',
          background: 'transparent',
          border: `1px solid ${border}`, borderRadius: 4,
          color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
          display: 'inline-flex', alignItems: 'center',
        }}>← Mes scénarios</button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>Nom :</span>
          <input
            value={scenarioName}
            onChange={e => setScenarioName(e.target.value)}
            placeholder="Mon scénario..."
            style={{
              width: 200, height: 32, boxSizing: 'border-box', padding: '0 10px', fontSize: 12,
              background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(127,119,221,0.3)',
              color: '#F5F2FA', borderRadius: 4, outline: 'none', fontFamily: 'inherit',
            }}
          />
        </div>

        <div style={{ flex: 1 }} />

        {/* Sélecteur de phase */}
        <div style={{ display: 'flex', gap: 4 }}>
          {(['all', 'early', 'mid', 'late'] as const).map(p => (
            <button key={p} onClick={() => setActivePhase(p)} style={{
              height: 32, padding: '0 10px', boxSizing: 'border-box',
              fontSize: 11, cursor: 'pointer', borderRadius: 4, fontFamily: 'inherit',
              background: activePhase === p ? 'rgba(239,159,39,0.2)' : 'transparent',
              border: `1px solid ${activePhase === p ? '#EF9F27' : border}`,
              color: activePhase === p ? '#F5F2FA' : 'var(--text-muted)',
              display: 'inline-flex', alignItems: 'center',
            }}>{PHASE_LABELS[p]}</button>
          ))}
        </div>

        <button onClick={saveScenario} disabled={saving} style={{
          height: 32, padding: '0 14px', boxSizing: 'border-box',
          background: saving ? 'rgba(127,119,221,0.4)' : 'linear-gradient(135deg,#7F77DD,#534AB7)',
          border: 'none', borderRadius: 4, color: 'white', fontSize: 12,
          fontWeight: 600, cursor: saving ? 'default' : 'pointer', fontFamily: 'inherit',
          display: 'inline-flex', alignItems: 'center',
        }}>{saving ? 'Sauvegarde…' : 'Sauver'}</button>
      </div>

      {/* ══ Layout principal ════════════════════════════════════════════════ */}
      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr 280px', gap: 14 }}>

        {/* ── Sidebar gauche : 5 alliés ── */}
        <div style={{
          padding: 14, borderRadius: 8,
          background: bg, border: `1px solid ${border}`,
        }}>
          <div style={{
            fontSize: 11, color: 'var(--text-muted)', letterSpacing: 1, textTransform: 'uppercase',
            marginBottom: 12, fontWeight: 600,
          }}>
            Alliés
          </div>
          {allies.map(a => (
            <button key={a.role}
              onClick={() => { setChampPickerRole(a.role); setChampSearch('') }}
              style={{
                width: '100%', padding: '8px 10px', marginBottom: 6,
                display: 'flex', alignItems: 'center', gap: 8,
                background: 'rgba(255,255,255,0.02)',
                border: `1px solid ${ROLE_COLORS[a.role]}55`,
                borderLeft: `3px solid ${ROLE_COLORS[a.role]}`,
                borderRadius: 5, cursor: 'pointer', fontFamily: 'inherit',
              }}>
              {a.champ && version ? (
                <img src={`${DDN}/cdn/${version}/img/champion/${a.champ.image}`}
                  alt={a.champ.name} style={{ width: 32, height: 32, borderRadius: 4 }} />
              ) : (
                <div style={{
                  width: 32, height: 32, borderRadius: 4,
                  background: 'rgba(255,255,255,0.04)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, color: 'var(--text-dim)',
                }}>?</div>
              )}
              <div style={{ flex: 1, textAlign: 'left' }}>
                <div style={{ fontSize: 11, color: ROLE_COLORS[a.role], fontWeight: 700, letterSpacing: 1 }}>
                  {ROLE_LABELS[a.role]}
                </div>
                <div style={{ fontSize: 13, color: a.champ ? '#F5F2FA' : 'var(--text-dim)' }}>
                  {a.champ?.name ?? 'Choisir un champion'}
                </div>
              </div>
            </button>
          ))}

          <div style={{
            marginTop: 14, paddingTop: 12, borderTop: `1px solid ${border}`,
            fontSize: 11, color: 'var(--text-dim)', textAlign: 'center',
          }}>
            <span style={{ color: '#E24B4A', fontWeight: 700 }}>■</span> Ennemis (juste les rôles)
          </div>
          <div style={{ display: 'flex', gap: 4, marginTop: 6, justifyContent: 'center' }}>
            {ROLES.map(r => (
              <div key={r} style={{
                width: 28, height: 28, borderRadius: 4,
                background: '#E24B4A22', border: '1px solid #E24B4A55',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 9, color: '#E24B4A', fontWeight: 700,
              }}>{r.slice(0, 3)}</div>
            ))}
          </div>
        </div>

        {/* ── Map au centre ── */}
        <div>
          {/* Toolbar */}
          <div style={{
            display: 'flex', gap: 6, padding: '8px 10px', marginBottom: 10,
            background: bg, border: `1px solid ${border}`, borderRadius: 6, flexWrap: 'wrap',
          }}>
            {([
              { id: 'select', icon: '↖', label: 'Sélection' },
              { id: 'ward',   icon: '👁', label: 'Ward' },
              { id: 'arrow',  icon: '→',  label: 'Rotation' },
              { id: 'zone',   icon: '○',  label: 'Zone' },
              { id: 'ping',   icon: '⚔', label: 'Ping' },
              { id: 'lane',   icon: '═',  label: 'Lane prio.' },
              { id: 'erase',  icon: '🗑', label: 'Effacer tout' },
            ] as { id: Tool; icon: string; label: string }[]).map(t => (
              <button key={t.id}
                onClick={() => {
                  if (t.id === 'erase') {
                    if (confirm('Effacer tous les dessins du scénario ?')) setDrawings([])
                    return
                  }
                  setActiveTool(t.id)
                  setArrowStart(null)
                }}
                style={{
                  padding: '6px 12px', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
                  background: activeTool === t.id ? 'rgba(127,119,221,0.20)' : 'transparent',
                  border: `1px solid ${activeTool === t.id ? '#7F77DD' : border}`,
                  color: activeTool === t.id ? '#F5F2FA' : 'var(--text-muted)',
                  borderRadius: 4,
                }}>
                <span style={{ marginRight: 4 }}>{t.icon}</span>{t.label}
              </button>
            ))}

            {/* Sub-tool selectors */}
            {activeTool === 'ward' && (
              <div style={{ display: 'flex', gap: 4, marginLeft: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>Type :</span>
                {(['yellow', 'control', 'blue'] as const).map(w => (
                  <button key={w} onClick={() => setActiveWardType(w)} style={{
                    width: 24, height: 24, borderRadius: '50%', cursor: 'pointer',
                    background: WARD_COLORS[w],
                    border: `2px solid ${activeWardType === w ? '#fff' : 'transparent'}`,
                    opacity: activeWardType === w ? 1 : 0.5,
                  }} title={w} />
                ))}
              </div>
            )}
            {activeTool === 'ping' && (
              <div style={{ display: 'flex', gap: 4, marginLeft: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>Type :</span>
                {(['danger', 'help', 'fight'] as const).map(p => (
                  <button key={p} onClick={() => setActivePingType(p)} style={{
                    padding: '4px 8px', fontSize: 10, fontWeight: 700, cursor: 'pointer',
                    background: activePingType === p ? PING_COLORS[p] : 'transparent',
                    color: activePingType === p ? '#0a0612' : PING_COLORS[p],
                    border: `1px solid ${PING_COLORS[p]}`, borderRadius: 3, fontFamily: 'inherit',
                  }}>{p.toUpperCase()}</button>
                ))}
              </div>
            )}
          </div>

          {/* Indication tool */}
          <div style={{
            fontSize: 11, color: 'var(--text-dim)', marginBottom: 6, textAlign: 'center',
            minHeight: 16,
          }}>
            {activeTool === 'arrow' && (arrowStart
              ? 'Clique pour placer le point d\'arrivée'
              : 'Clique pour placer le départ de la flèche'
            )}
            {activeTool === 'ward' && 'Clique sur la map pour placer une ward'}
            {activeTool === 'ping' && 'Clique sur la map pour placer un ping'}
            {activeTool === 'zone' && 'Clique sur la map pour placer une zone d\'engagement'}
            {activeTool === 'lane' && 'Clique sur une lane (TOP/MID/BOT) pour la prioriser'}
            {activeTool === 'select' && 'Clique sur un dessin dans le panneau de droite pour l\'éditer'}
          </div>

          {/* Map */}
          <div ref={mapRef}
            onClick={handleMapClick}
            style={{
              position: 'relative', aspectRatio: '1 / 1', maxWidth: 600, margin: '0 auto',
              cursor: activeTool === 'select' ? 'default' : 'crosshair',
              userSelect: 'none',
            }}>
            <img src={SR_MAP} alt="Summoner's Rift"
              onError={e => {
                const img = e.currentTarget as HTMLImageElement
                if (img.src.endsWith('summoners_rift.png'))
                  img.src = 'https://ddragon.leagueoflegends.com/cdn/14.24.1/img/map/map11.png'
              }}
              style={{
                width: '100%', height: '100%', borderRadius: 6, display: 'block',
                background: '#0a0612', opacity: 0.85, pointerEvents: 'none',
              }} />

            {/* Lanes cliquables si tool=lane (zones invisibles) */}
            {activeTool === 'lane' && (
              <>
                {/* TOP : rectangle vertical gauche + horizontal haut */}
                <div onClick={e => { e.stopPropagation(); handleLaneClick('TOP') }}
                  style={{ position: 'absolute', left: 0, top: 0, width: '50%', height: '20%', cursor: 'pointer' }} />
                <div onClick={e => { e.stopPropagation(); handleLaneClick('MID') }}
                  style={{ position: 'absolute', left: '25%', top: '25%', width: '50%', height: '50%', cursor: 'pointer' }} />
                <div onClick={e => { e.stopPropagation(); handleLaneClick('BOT') }}
                  style={{ position: 'absolute', right: 0, bottom: 0, width: '50%', height: '20%', cursor: 'pointer' }} />
              </>
            )}

            {/* SVG overlay pour les dessins */}
            <svg viewBox="0 0 100 100" preserveAspectRatio="none"
              style={{
                position: 'absolute', inset: 0, width: '100%', height: '100%',
                pointerEvents: 'none',
              }}>
              {/* Marker arrowhead pour les flèches */}
              <defs>
                <marker id="arrowhead" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                  <path d="M0,0 L6,3 L0,6 z" fill="#5DCAA5" />
                </marker>
              </defs>

              {/* Lane highlights (en arrière-plan) */}
              {visibleDrawings.filter(d => d.type === 'lane').map(d => {
                const lanePath = d.laneId === 'TOP'
                  ? 'M3,12 L12,3 L40,3 L40,8 L8,40 L3,40 Z'
                  : d.laneId === 'MID'
                    ? 'M30,70 L70,30 L75,30 L75,35 L35,75 L30,75 Z'
                    : 'M60,92 L88,92 L92,88 L92,60 L88,60 L60,88 Z'
                return (
                  <path key={d.id} d={lanePath} fill="#EF9F2733" stroke="#EF9F27" strokeWidth="0.5" />
                )
              })}

              {/* Zones d'engagement (cercles) */}
              {visibleDrawings.filter(d => d.type === 'zone').map(d => (
                <g key={d.id}>
                  <circle cx={d.points[0].x} cy={d.points[0].y} r="6"
                    fill="rgba(239,159,39,0.15)" stroke="#EF9F27" strokeWidth="0.4" strokeDasharray="1,1" />
                </g>
              ))}

              {/* Flèches (rotations) */}
              {visibleDrawings.filter(d => d.type === 'arrow' && d.points.length === 2).map(d => (
                <line key={d.id}
                  x1={d.points[0].x} y1={d.points[0].y}
                  x2={d.points[1].x} y2={d.points[1].y}
                  stroke="#5DCAA5" strokeWidth="0.5"
                  markerEnd="url(#arrowhead)" />
              ))}

              {/* Arrow preview pendant la saisie */}
              {arrowStart && activeTool === 'arrow' && (
                <circle cx={arrowStart.x} cy={arrowStart.y} r="0.8" fill="#5DCAA5" opacity={0.6} />
              )}

              {/* Wards */}
              {visibleDrawings.filter(d => d.type === 'ward').map(d => {
                const col = d.wardType ? WARD_COLORS[d.wardType] : '#EAB308'
                return (
                  <g key={d.id}>
                    <circle cx={d.points[0].x} cy={d.points[0].y} r="2.2"
                      fill={col} fillOpacity={0.7} stroke="#fff" strokeWidth="0.3" />
                    <circle cx={d.points[0].x} cy={d.points[0].y} r="3.5"
                      fill="none" stroke={col} strokeWidth="0.3" strokeDasharray="0.5,0.5" opacity={0.5} />
                  </g>
                )
              })}

              {/* Pings */}
              {visibleDrawings.filter(d => d.type === 'ping').map(d => {
                const col = d.pingType ? PING_COLORS[d.pingType] : '#EF9F27'
                return (
                  <g key={d.id}>
                    <circle cx={d.points[0].x} cy={d.points[0].y} r="1.5"
                      fill={col} stroke="#0a0612" strokeWidth="0.3" />
                    <circle cx={d.points[0].x} cy={d.points[0].y} r="3"
                      fill="none" stroke={col} strokeWidth="0.4" />
                    <circle cx={d.points[0].x} cy={d.points[0].y} r="4.5"
                      fill="none" stroke={col} strokeWidth="0.2" opacity={0.5} />
                  </g>
                )
              })}
            </svg>
          </div>
        </div>

        {/* ── Sidebar droite : liste des dessins ── */}
        <div style={{
          padding: 14, borderRadius: 8,
          background: bg, border: `1px solid ${border}`,
          maxHeight: 600, overflowY: 'auto',
        }}>
          <div style={{
            fontSize: 11, color: 'var(--text-muted)', letterSpacing: 1, textTransform: 'uppercase',
            marginBottom: 12, fontWeight: 600,
          }}>
            Éléments ({visibleDrawings.length})
          </div>
          {visibleDrawings.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--text-dim)', textAlign: 'center', padding: 20 }}>
              Utilise les outils pour dessiner sur la map
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {visibleDrawings.map(d => {
                const meta: Record<string, { icon: string; label: string }> = {
                  ward:  { icon: '👁', label: `Ward ${d.wardType ?? ''}` },
                  arrow: { icon: '→',  label: 'Rotation' },
                  zone:  { icon: '○',  label: 'Zone d\'engagement' },
                  ping:  { icon: '⚔', label: `Ping ${d.pingType ?? ''}` },
                  lane:  { icon: '═',  label: `Lane ${d.laneId ?? ''}` },
                }
                const m = meta[d.type]
                if (!m) return null
                return (
                  <div key={d.id} style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '6px 10px', borderRadius: 4,
                    background: 'rgba(255,255,255,0.02)',
                    border: `1px solid ${border}`,
                    fontSize: 12,
                  }}>
                    <span style={{ fontSize: 14 }}>{m.icon}</span>
                    <span style={{ flex: 1, color: '#F5F2FA' }}>{m.label}</span>
                    {d.phase && d.phase !== 'all' && (
                      <span style={{
                        fontSize: 9, padding: '1px 5px', borderRadius: 3,
                        background: 'rgba(239,159,39,0.15)', color: '#EF9F27',
                      }}>{PHASE_LABELS[d.phase]}</span>
                    )}
                    <button onClick={() => deleteDrawing(d.id)} style={{
                      background: 'transparent', border: 'none',
                      color: '#E24B4A', cursor: 'pointer', fontSize: 14, padding: 0,
                    }}>×</button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* ══ Modale picker de champion ═══════════════════════════════════════ */}
      {champPickerRole && (
        <div onClick={() => setChampPickerRole(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000,
          }}>
          <div onClick={e => e.stopPropagation()}
            style={{
              width: 540, maxHeight: '80vh', display: 'flex', flexDirection: 'column',
              background: c ? '#150828' : '#18181B',
              border: `1px solid ${border}`, borderRadius: 10, padding: 16,
            }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10, color: ROLE_COLORS[champPickerRole] }}>
              Choisir un champion pour {champPickerRole}
            </div>
            <input
              value={champSearch} onChange={e => setChampSearch(e.target.value)}
              placeholder="🔍 Rechercher..." autoFocus
              style={{
                padding: '8px 10px', marginBottom: 10, fontSize: 13,
                background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(127,119,221,0.3)',
                color: '#F5F2FA', borderRadius: 4, outline: 'none', fontFamily: 'inherit',
              }}
            />
            <div style={{
              flex: 1, overflowY: 'auto',
              display: 'grid', gap: 4,
              gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
            }}>
              {filteredChamps.map(ch => (
                <button key={ch.id}
                  onClick={() => {
                    setAllies(prev => prev.map(a =>
                      a.role === champPickerRole ? { ...a, champ: ch } : a,
                    ))
                    setChampPickerRole(null)
                  }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6, padding: 6,
                    background: 'transparent', border: 'none', borderRadius: 4,
                    cursor: 'pointer', fontFamily: 'inherit', color: 'var(--text)',
                    textAlign: 'left',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                >
                  {version && <img src={`${DDN}/cdn/${version}/img/champion/${ch.image}`}
                    alt={ch.name} style={{ width: 28, height: 28, borderRadius: 3 }} />}
                  <span style={{ fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {ch.name}
                  </span>
                </button>
              ))}
            </div>
            <button onClick={() => {
              setAllies(prev => prev.map(a =>
                a.role === champPickerRole ? { ...a, champ: null } : a,
              ))
              setChampPickerRole(null)
            }} style={{
              marginTop: 10, padding: '8px 14px', fontSize: 12, cursor: 'pointer',
              background: 'transparent', border: '1px solid #E24B4A',
              color: '#E24B4A', borderRadius: 4, fontFamily: 'inherit',
              alignSelf: 'flex-start',
            }}>
              Retirer le champion
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

void ROLE_LABELS
