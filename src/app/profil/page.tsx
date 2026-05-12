'use client'

/**
 * Page de profil utilisateur : /profil
 *
 * Contenu :
 *   - Identité Wyrm Forge (pseudo, tier, certified, date d'inscription)
 *   - Identité Riot (gameName#tag, plateforme, lien vers stats)
 *   - Statistiques agrégées des dernières parties (winrate, kda moyen, etc.)
 *   - Champions les plus joués (top 3-5)
 *   - Mes builds (Item Builds Supabase)
 *   - Mes to-do lists (compteurs)
 */
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const supabase = createClient()
const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPA_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const DDN      = 'https://ddragon.leagueoflegends.com'

interface UserProfile {
  id: string; username: string; email: string
  tier: string; role: string; certified: boolean
  tier_expires_at: string | null; created_at: string
  riot_gamename?: string | null
  riot_tagline?:  string | null
  riot_platform?: string | null
}

interface ChampInfo { id: string; name: string; image: string; numericId: number }
interface MatchInfo {
  matchId: string; championId: number; championName: string
  queueId: number; queueName: string
  kills: number; deaths: number; assists: number
  cs: number; duration: number; win: boolean; gameCreation: number
}

const TIER_COLORS: Record<string, string> = {
  apprenti: '#A1A1AA', forgeron: '#5DCAA5', maître: '#7F77DD',
  légion: '#3A8AC9', architecte: '#BA7517', 'architecte+': '#EF9F27',
}

export default function ProfilePage() {
  const router = useRouter()
  const [profile, setProfile]   = useState<UserProfile | null>(null)
  const [matches, setMatches]   = useState<MatchInfo[]>([])
  const [champMap, setChampMap] = useState<Record<number, ChampInfo>>({})
  const [version, setVersion]   = useState('')
  const [buildCount,     setBuildCount]    = useState(0)
  const [todoListCount,  setTodoListCount] = useState(0)
  const [todoItemCount,  setTodoItemCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true); setError('')
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { setError('Tu dois être connecté pour voir ton profil.'); return }

        // Profil + compteurs Supabase en parallèle
        const [profRes, builds, todoLists, todoItems, vRes] = await Promise.all([
          supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
          supabase.from('item_builds').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
          supabase.from('todo_lists').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
          supabase.from('todo_items').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
          fetch(`${DDN}/api/versions.json`),
        ])
        if (cancelled) return

        const prof = profRes.data as UserProfile | null
        if (!prof) { setError('Profil introuvable.'); return }
        setProfile(prof)
        setBuildCount(builds.count ?? 0)
        setTodoListCount(todoLists.count ?? 0)
        setTodoItemCount(todoItems.count ?? 0)

        const vList: string[] = await vRes.json()
        const v = vList[0]
        setVersion(v)

        // Map champions DDragon
        const cRes = await fetch(`${DDN}/cdn/${v}/data/fr_FR/champion.json`)
        const cData = await cRes.json()
        if (cancelled) return
        const map: Record<number, ChampInfo> = {}
        Object.values(cData.data).forEach((ch: unknown) => {
          const c = ch as { key: string; id: string; name: string; image: { full: string } }
          map[Number(c.key)] = { id: c.id, name: c.name, image: c.image.full, numericId: Number(c.key) }
        })
        setChampMap(map)

        // Matchs Riot si user a un Riot ID
        if (prof.riot_gamename && prof.riot_tagline) {
          const { data: { session } } = await supabase.auth.getSession()
          if (!session) return
          const res = await fetch(
            `${SUPA_URL}/functions/v1/riot-matches?${new URLSearchParams({
              gameName: prof.riot_gamename,
              tagLine:  prof.riot_tagline,
              platform: prof.riot_platform ?? 'euw1',
              count:    '10',
            }).toString()}`,
            { headers: { apikey: SUPA_KEY, Authorization: `Bearer ${session.access_token}` } },
          )
          if (cancelled) return
          if (res.ok) {
            const data = await res.json()
            setMatches(data.matches ?? [])
          }
        }
      } catch {
        if (!cancelled) setError('Erreur lors du chargement du profil.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  if (loading) {
    return (
      <main style={{ minHeight: '100vh', padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
        Chargement du profil…
      </main>
    )
  }
  if (error || !profile) {
    return (
      <main style={{ minHeight: '100vh', padding: 40, color: '#E24B4A' }}>
        {error || 'Profil indisponible.'}
      </main>
    )
  }

  // Stats agrégées des matchs
  const wins    = matches.filter(m => m.win).length
  const losses  = matches.length - wins
  const winrate = matches.length > 0 ? Math.round((wins / matches.length) * 100) : null
  const totalK  = matches.reduce((s, m) => s + m.kills,   0)
  const totalD  = matches.reduce((s, m) => s + m.deaths,  0)
  const totalA  = matches.reduce((s, m) => s + m.assists, 0)
  const avgKda  = totalD === 0 ? totalK + totalA : ((totalK + totalA) / totalD).toFixed(2)
  const avgCs   = matches.length > 0
    ? Math.round(matches.reduce((s, m) => s + m.cs, 0) / matches.length)
    : null

  // Champion le plus joué (compteur des récurrences)
  const champCounts: Record<number, { count: number; w: number; champ?: ChampInfo }> = {}
  matches.forEach(m => {
    if (!champCounts[m.championId]) champCounts[m.championId] = { count: 0, w: 0, champ: champMap[m.championId] }
    champCounts[m.championId].count++
    if (m.win) champCounts[m.championId].w++
  })
  const topChamps = Object.entries(champCounts)
    .map(([id, v]) => ({ id: Number(id), ...v }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)

  const tierColor = TIER_COLORS[profile.tier] ?? '#A1A1AA'
  const memberSince = new Date(profile.created_at).toLocaleDateString('fr-FR', { year: 'numeric', month: 'long' })

  return (
    <main style={{
      minHeight: '100vh', padding: '24px clamp(12px, 4vw, 40px)',
      maxWidth: 1200, margin: '0 auto', color: '#F5F2FA',
    }}>
      <button onClick={() => router.back()} style={{
        background: 'transparent', border: 'none', cursor: 'pointer',
        color: 'var(--text-muted)', fontSize: 13, padding: '6px 0', marginBottom: 14,
      }}>← Retour</button>

      {/* En-tête profil */}
      <header style={{
        marginBottom: 18, padding: '20px 24px', borderRadius: 12,
        background: `linear-gradient(135deg, ${tierColor}22 0%, rgba(255,255,255,0.02) 100%)`,
        borderTop: `1px solid ${tierColor}55`, borderRight: `1px solid rgba(255,255,255,0.06)`,
        borderBottom: `1px solid rgba(255,255,255,0.06)`, borderLeft: `4px solid ${tierColor}`,
        display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap',
      }}>
        {/* Avatar : initiale du pseudo */}
        <div style={{
          width: 80, height: 80, borderRadius: '50%',
          background: `linear-gradient(135deg, ${tierColor} 0%, ${tierColor}88 100%)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 38, fontWeight: 800, color: '#0a0612',
          border: `3px solid ${tierColor}`,
        }}>
          {profile.username.charAt(0).toUpperCase()}
        </div>

        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <h1 style={{ fontSize: 28, fontWeight: 800, margin: 0 }}>{profile.username}</h1>
            {profile.certified && (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="11" fill="#3B82F6"/>
                <path d="M7 12L10.5 15.5L17 9" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 12, color: 'var(--text-muted)' }}>
            <span style={{
              padding: '3px 10px', borderRadius: 4,
              background: `${tierColor}22`, color: tierColor, fontWeight: 700, letterSpacing: 1,
            }}>{profile.tier.toUpperCase()}</span>
            {profile.tier_expires_at && (
              <span>jusqu'au {new Date(profile.tier_expires_at).toLocaleDateString('fr-FR')}</span>
            )}
            {!profile.tier_expires_at && profile.tier !== 'apprenti' && (
              <span style={{ color: '#EF9F27', fontWeight: 700 }}>À VIE</span>
            )}
            <span>·</span>
            <span>Membre depuis {memberSince}</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 4 }}>
            {profile.email}
          </div>
        </div>
      </header>

      {/* Section Riot */}
      <section style={{
        marginBottom: 18, padding: '14px 18px', borderRadius: 10,
        background: 'rgba(255,255,255,0.02)',
        borderTop: '1px solid rgba(255,255,255,0.06)', borderRight: '1px solid rgba(255,255,255,0.06)',
        borderBottom: '1px solid rgba(255,255,255,0.06)', borderLeft: '1px solid rgba(255,255,255,0.06)',
      }}>
        <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
          Compte League of Legends
        </div>
        {profile.riot_gamename ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 18, fontWeight: 700 }}>
              {profile.riot_gamename}<span style={{ color: 'var(--text-dim)', fontWeight: 400 }}>#{profile.riot_tagline}</span>
            </div>
            <span style={{
              padding: '2px 8px', borderRadius: 3,
              background: 'rgba(58,138,201,0.2)', color: '#3A8AC9',
              fontSize: 11, fontWeight: 700,
            }}>{(profile.riot_platform ?? 'euw1').toUpperCase()}</span>
          </div>
        ) : (
          <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>
            Aucun compte Riot lié. Va sur l'onglet Accueil pour en ajouter un.
          </div>
        )}
      </section>

      {/* Statistiques des dernières parties */}
      {profile.riot_gamename && matches.length > 0 && (
        <section style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
            Stats sur les {matches.length} dernières parties
          </div>
          <div style={{
            display: 'grid', gap: 8,
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          }}>
            <StatCard label="Parties" value={String(matches.length)} />
            <StatCard
              label="Victoires"
              value={`${wins}W ${losses}L`}
              color={wins > losses ? '#5DCAA5' : wins < losses ? '#E24B4A' : undefined}
            />
            <StatCard
              label="Winrate"
              value={winrate !== null ? `${winrate}%` : '-'}
              color={(winrate ?? 0) >= 50 ? '#5DCAA5' : '#E24B4A'}
            />
            <StatCard label="KDA moyen" value={String(avgKda)} />
            <StatCard label="CS moyen" value={avgCs ? String(avgCs) : '-'} />
          </div>
        </section>
      )}

      {/* Top champions joués */}
      {topChamps.length > 0 && (
        <section style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
            Champions les plus joués
          </div>
          <div style={{
            display: 'grid', gap: 8,
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          }}>
            {topChamps.map(({ id, count, w, champ }) => {
              const winrateChamp = Math.round((w / count) * 100)
              return (
                <div key={id}
                  onClick={() => champ && router.push(`/champion/${champ.id}`)}
                  style={{
                    cursor: champ ? 'pointer' : 'default',
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 12px', borderRadius: 6,
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid rgba(255,255,255,0.06)',
                    transition: 'background 120ms',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.02)' }}
                >
                  {champ && version
                    ? <img src={`${DDN}/cdn/${version}/img/champion/${champ.image}`}
                        alt="" style={{ width: 48, height: 48, borderRadius: 6 }} />
                    : <div style={{ width: 48, height: 48, borderRadius: 6, background: '#222' }} />
                  }
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{champ?.name ?? `Champ #${id}`}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                      {count} {count > 1 ? 'parties' : 'partie'} · <span style={{ color: winrateChamp >= 50 ? '#5DCAA5' : '#E24B4A', fontWeight: 600 }}>{winrateChamp}% WR</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Activité dans l'écosystème Wyrm Forge */}
      <section style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
          Mon activité Wyrm Forge
        </div>
        <div style={{
          display: 'grid', gap: 8,
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        }}>
          <StatCard label="Builds créés" value={String(buildCount)} />
          <StatCard label="To-do lists" value={String(todoListCount)} />
          <StatCard label="Tâches au total" value={String(todoItemCount)} />
        </div>
      </section>
    </main>
  )
}

function StatCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{
      padding: '12px 16px', borderRadius: 8,
      background: 'rgba(255,255,255,0.02)',
      border: '1px solid rgba(255,255,255,0.06)',
    }}>
      <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color: color ?? '#F5F2FA' }}>
        {value}
      </div>
    </div>
  )
}
