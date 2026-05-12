'use client'

/**
 * Onglet Stats : agrégations réelles sur les 20 dernières parties Riot du user.
 * Source : Edge Function /functions/v1/riot-matches (count=20).
 *
 * Sections :
 *  - Vue d'ensemble (KPI : winrate, KDA moyen, CS/min, vision, dégâts, total parties)
 *  - Tendance W/L par partie (timeline 20 cases)
 *  - Champions joués (table : pick rate, win rate, KDA, CS/min)
 *  - Distribution par rôle (TOP/JGL/MID/ADC/SUP) en barres horizontales
 *  - Distribution par queue (Classée, Normale, ARAM…)
 */
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTheme } from '@/components/providers/ThemeProvider'
import { createClient } from '@/lib/supabase/client'

const supabase = createClient()
const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPA_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const DDN      = 'https://ddragon.leagueoflegends.com'

interface ChampInfo { id: string; name: string; image: string; numericId: number }
interface MatchInfo {
  matchId: string; championId: number; championName: string
  queueId: number; queueName: string
  kills: number; deaths: number; assists: number
  cs: number; duration: number; win: boolean; gameCreation: number
  // Champs enrichis renvoyés par riot-matches
  position?: string; visionScore?: number; damageDealt?: number
  goldEarned?: number; teamKills?: number
}

const ROLES = [
  { riot: 'TOP',     label: 'TOP',    color: '#E24B4A' },
  { riot: 'JUNGLE',  label: 'JUNGLE', color: '#5DCAA5' },
  { riot: 'MIDDLE',  label: 'MID',    color: '#EF9F27' },
  { riot: 'BOTTOM',  label: 'ADC',    color: '#7F77DD' },
  { riot: 'UTILITY', label: 'SUPPORT',color: '#3A8AC9' },
]

export default function StatsTab() {
  const { theme } = useTheme()
  const router = useRouter()
  const c = theme === 'mythic'
  const border = c ? 'rgba(186,117,23,0.2)' : '#27272A'
  const bg = c ? 'rgba(42,21,71,0.4)' : '#18181B'

  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState('')
  const [noRiot,   setNoRiot]   = useState(false)
  const [matches,  setMatches]  = useState<MatchInfo[]>([])
  const [champMap, setChampMap] = useState<Record<number, ChampInfo>>({})
  const [version,  setVersion]  = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true); setError('')
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { setError('Tu dois être connecté.'); return }

        // Profil pour le Riot ID + DDragon en parallèle
        const [profRes, vRes] = await Promise.all([
          supabase.from('profiles').select('riot_gamename, riot_tagline, riot_platform').eq('id', user.id).maybeSingle(),
          fetch(`${DDN}/api/versions.json`),
        ])
        if (cancelled) return

        const prof = profRes.data
        if (!prof?.riot_gamename || !prof?.riot_tagline) {
          setNoRiot(true); return
        }

        const vList: string[] = await vRes.json()
        const v = vList[0]
        setVersion(v)

        // DDragon champion map
        const cRes  = await fetch(`${DDN}/cdn/${v}/data/fr_FR/champion.json`)
        const cData = await cRes.json()
        if (cancelled) return
        const map: Record<number, ChampInfo> = {}
        Object.values(cData.data).forEach((ch: unknown) => {
          const cc = ch as { key: string; id: string; name: string; image: { full: string } }
          map[Number(cc.key)] = { id: cc.id, name: cc.name, image: cc.image.full, numericId: Number(cc.key) }
        })
        setChampMap(map)

        // Matchs Riot (20 dernières parties via Edge Function)
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) { setError('Session expirée.'); return }
        const res = await fetch(
          `${SUPA_URL}/functions/v1/riot-matches?${new URLSearchParams({
            gameName: prof.riot_gamename,
            tagLine:  prof.riot_tagline,
            platform: prof.riot_platform ?? 'euw1',
            count:    '20',
          })}`,
          { headers: { apikey: SUPA_KEY, Authorization: `Bearer ${session.access_token}` } },
        )
        if (cancelled) return
        if (!res.ok) {
          const data = await res.json()
          setError(data.error ?? 'Erreur Riot API.')
          return
        }
        const data = await res.json()
        setMatches(data.matches ?? [])
      } catch {
        if (!cancelled) setError('Erreur lors du chargement des stats.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  if (loading) return <Loader text="Chargement des statistiques…" />
  if (noRiot)  return <NoRiotPrompt onSettings={() => router.push('/profil')} />
  if (error)   return <ErrorBox text={error} />
  if (matches.length === 0) {
    return <ErrorBox text="Aucune partie trouvée. Lance quelques games puis reviens !" />
  }

  // ── Agrégations ──
  const total       = matches.length
  const wins        = matches.filter(m => m.win).length
  const winrate     = (wins / total) * 100
  const totalK      = matches.reduce((s, m) => s + m.kills,   0)
  const totalD      = matches.reduce((s, m) => s + m.deaths,  0)
  const totalA      = matches.reduce((s, m) => s + m.assists, 0)
  const avgKda      = totalD === 0 ? totalK + totalA : (totalK + totalA) / totalD
  const totalCs     = matches.reduce((s, m) => s + m.cs, 0)
  const totalDur    = matches.reduce((s, m) => s + m.duration, 0)
  const csPerMin    = totalDur === 0 ? 0 : totalCs / (totalDur / 60)
  const avgVision   = matches.length === 0 ? 0
    : matches.reduce((s, m) => s + (m.visionScore ?? 0), 0) / matches.length
  const avgDmg      = matches.length === 0 ? 0
    : matches.reduce((s, m) => s + (m.damageDealt ?? 0), 0) / matches.length

  // Champions joués (avec stats)
  const champStats: Record<number, {
    id: number; played: number; wins: number;
    kills: number; deaths: number; assists: number; cs: number; durSec: number
  }> = {}
  matches.forEach(m => {
    const id = m.championId
    if (!champStats[id]) champStats[id] = {
      id, played: 0, wins: 0, kills: 0, deaths: 0, assists: 0, cs: 0, durSec: 0,
    }
    const s = champStats[id]
    s.played++; if (m.win) s.wins++
    s.kills += m.kills; s.deaths += m.deaths; s.assists += m.assists
    s.cs += m.cs; s.durSec += m.duration
  })
  const champsSorted = Object.values(champStats).sort((a, b) => b.played - a.played)

  // Distribution par rôle
  const roleDist: Record<string, { played: number; wins: number }> = {}
  ROLES.forEach(r => { roleDist[r.riot] = { played: 0, wins: 0 } })
  matches.forEach(m => {
    if (m.position && roleDist[m.position]) {
      roleDist[m.position].played++
      if (m.win) roleDist[m.position].wins++
    }
  })

  // Distribution par queue
  const queueDist: Record<string, { played: number; wins: number }> = {}
  matches.forEach(m => {
    const k = m.queueName || 'Inconnu'
    if (!queueDist[k]) queueDist[k] = { played: 0, wins: 0 }
    queueDist[k].played++; if (m.win) queueDist[k].wins++
  })
  const queueList = Object.entries(queueDist).sort((a, b) => b[1].played - a[1].played)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* ── KPI cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
        <KpiCard label="Parties analysées" value={String(total)} bg={bg} border={border} />
        <KpiCard label="Winrate"      value={`${winrate.toFixed(1)}%`}
          color={winrate >= 50 ? '#5DCAA5' : '#E24B4A'} bg={bg} border={border} />
        <KpiCard label="Victoires"    value={`${wins}W ${total - wins}L`} bg={bg} border={border} />
        <KpiCard label="KDA moyen"    value={avgKda.toFixed(2)} bg={bg} border={border} />
        <KpiCard label="CS / min"     value={csPerMin.toFixed(1)} bg={bg} border={border} />
        <KpiCard label="Score vision" value={Math.round(avgVision).toString()} bg={bg} border={border} />
        <KpiCard label="Dégâts/partie" value={`${(avgDmg / 1000).toFixed(1)}K`} bg={bg} border={border} />
      </div>

      {/* ── Tendance W/L par partie ── */}
      <div style={{ padding: 18, borderRadius: 10, background: bg, border: `1px solid ${border}` }}>
        <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
          Tendance — partie la + récente à gauche
        </div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {matches.map((m, i) => (
            <div key={m.matchId}
              title={`${m.win ? 'Victoire' : 'Défaite'} · ${m.championName} · ${m.kills}/${m.deaths}/${m.assists}`}
              style={{
                width: 28, height: 28, borderRadius: 4,
                background: m.win ? 'rgba(93,202,165,0.6)' : 'rgba(226,75,74,0.6)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 700, color: '#fff',
                border: i === 0 ? '2px solid #EF9F27' : 'none',
              }}>
              {m.win ? 'V' : 'D'}
            </div>
          ))}
        </div>
      </div>

      {/* ── Champions joués ── */}
      <div style={{ borderRadius: 10, background: bg, border: `1px solid ${border}`, overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: `1px solid ${border}` }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#F5F2FA' }}>
            Champions joués ({champsSorted.length} différents)
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: c ? 'rgba(20,10,35,0.4)' : '#0F0F11' }}>
                {['Champion', 'Parties', 'Winrate', 'KDA', 'CS/min'].map(h => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', color: 'var(--text-dim)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600 }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {champsSorted.map(cs => {
                const ch = champMap[cs.id]
                const wr = (cs.wins / cs.played) * 100
                const kda = cs.deaths === 0 ? cs.kills + cs.assists : (cs.kills + cs.assists) / cs.deaths
                const csPm = cs.durSec === 0 ? 0 : cs.cs / (cs.durSec / 60)
                return (
                  <tr key={cs.id}
                    onClick={() => ch && router.push(`/champion/${ch.id}`)}
                    style={{ borderTop: `1px solid ${border}`, cursor: ch ? 'pointer' : 'default', transition: 'background 100ms' }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.03)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = '' }}
                  >
                    <td style={{ padding: '10px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        {ch && version
                          ? <img src={`${DDN}/cdn/${version}/img/champion/${ch.image}`} alt=""
                              style={{ width: 32, height: 32, borderRadius: 5 }} />
                          : <div style={{ width: 32, height: 32, borderRadius: 5, background: '#222' }} />
                        }
                        <span style={{ color: '#F5F2FA', fontWeight: 500 }}>{ch?.name ?? `Champ #${cs.id}`}</span>
                      </div>
                    </td>
                    <td style={{ padding: '10px 16px', color: 'var(--text-muted)' }}>
                      {cs.played} <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>({Math.round((cs.played / total) * 100)}%)</span>
                    </td>
                    <td style={{ padding: '10px 16px' }}>
                      <span style={{
                        color: wr >= 55 ? '#5DCAA5' : wr < 45 ? '#E24B4A' : 'var(--text-muted)',
                        fontWeight: 600,
                      }}>
                        {wr.toFixed(0)}% <span style={{ fontSize: 11, color: 'var(--text-dim)', fontWeight: 400 }}>({cs.wins}W {cs.played - cs.wins}L)</span>
                      </span>
                    </td>
                    <td style={{ padding: '10px 16px', color: 'var(--text-muted)' }}>
                      {kda.toFixed(2)} <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{cs.kills}/{cs.deaths}/{cs.assists}</span>
                    </td>
                    <td style={{ padding: '10px 16px', color: 'var(--text-muted)' }}>{csPm.toFixed(1)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Distribution par rôle + queue côte à côte ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
        {/* Distribution par rôle */}
        <div style={{ padding: 18, borderRadius: 10, background: bg, border: `1px solid ${border}` }}>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
            Distribution par rôle
          </div>
          {ROLES.map(role => {
            const r = roleDist[role.riot]
            const pct = (r.played / total) * 100
            const wr = r.played === 0 ? null : (r.wins / r.played) * 100
            return (
              <div key={role.riot} style={{ marginBottom: 8 }}>
                <div style={{
                  display: 'flex', justifyContent: 'space-between', fontSize: 11,
                  color: 'var(--text-dim)', marginBottom: 3,
                }}>
                  <span style={{ color: role.color, fontWeight: 700 }}>{role.label}</span>
                  <span>
                    {r.played} {r.played > 1 ? 'parties' : 'partie'}
                    {wr !== null && <> · <span style={{ color: wr >= 50 ? '#5DCAA5' : '#E24B4A' }}>{wr.toFixed(0)}% WR</span></>}
                  </span>
                </div>
                <div style={{
                  height: 8, borderRadius: 4, overflow: 'hidden',
                  background: 'rgba(255,255,255,0.04)',
                }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: role.color, transition: 'width 300ms' }} />
                </div>
              </div>
            )
          })}
        </div>

        {/* Distribution par mode de jeu */}
        <div style={{ padding: 18, borderRadius: 10, background: bg, border: `1px solid ${border}` }}>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
            Modes de jeu
          </div>
          {queueList.map(([name, q]) => {
            const pct = (q.played / total) * 100
            const wr  = (q.wins / q.played) * 100
            return (
              <div key={name} style={{ marginBottom: 8 }}>
                <div style={{
                  display: 'flex', justifyContent: 'space-between', fontSize: 11,
                  color: 'var(--text-dim)', marginBottom: 3,
                }}>
                  <span style={{ color: '#F5F2FA', fontWeight: 600 }}>{name}</span>
                  <span>
                    {q.played} · <span style={{ color: wr >= 50 ? '#5DCAA5' : '#E24B4A' }}>{wr.toFixed(0)}%</span>
                  </span>
                </div>
                <div style={{
                  height: 8, borderRadius: 4, overflow: 'hidden',
                  background: 'rgba(255,255,255,0.04)',
                }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: '#7F77DD', transition: 'width 300ms' }} />
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── Sous-composants ──
function KpiCard({ label, value, color, bg, border }: {
  label: string; value: string; color?: string; bg: string; border: string
}) {
  return (
    <div style={{ padding: '14px 18px', borderRadius: 8, background: bg, border: `1px solid ${border}` }}>
      <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color: color ?? '#F5F2FA' }}>{value}</div>
    </div>
  )
}

function Loader({ text }: { text: string }) {
  return <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>{text}</div>
}

function ErrorBox({ text }: { text: string }) {
  return (
    <div style={{
      padding: 16, borderRadius: 8, fontSize: 14,
      background: 'rgba(226,75,74,0.08)', border: '1px solid rgba(226,75,74,0.3)',
      color: '#E24B4A',
    }}>{text}</div>
  )
}

function NoRiotPrompt({ onSettings }: { onSettings: () => void }) {
  return (
    <div style={{
      padding: 24, borderRadius: 10, textAlign: 'center',
      background: 'rgba(127,119,221,0.05)',
      border: '1px solid rgba(127,119,221,0.2)',
    }}>
      <div style={{ fontSize: 16, fontWeight: 600, color: '#F5F2FA', marginBottom: 8 }}>
        Aucun compte Riot lié
      </div>
      <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 14 }}>
        Lie ton Riot ID (GameName#TAG) depuis l&apos;onglet Accueil ou la page profil pour voir tes stats.
      </div>
      <button onClick={onSettings} style={{
        padding: '8px 16px', borderRadius: 6, fontSize: 13, fontWeight: 600,
        cursor: 'pointer', background: 'rgba(127,119,221,0.2)',
        border: '1px solid #7F77DD', color: '#F5F2FA',
      }}>Aller à mon profil</button>
    </div>
  )
}
