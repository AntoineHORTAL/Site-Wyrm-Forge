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
import Link from 'next/link'
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
  riot_rank?:     string | null
}

// Rangs LoL utilisés pour la comparaison de stats moyennes.
// Valeurs approximatives basées sur les stats publiques de la communauté
// (sources : op.gg statistics, lolalytics, données aggregées).
const LOL_RANKS: { key: string; label: string; color: string }[] = [
  { key: 'iron',     label: 'Fer',       color: '#7C5D44' },
  { key: 'bronze',   label: 'Bronze',    color: '#9E6C3F' },
  { key: 'silver',   label: 'Argent',    color: '#9CA3AF' },
  { key: 'gold',     label: 'Or',        color: '#EF9F27' },
  { key: 'platinum', label: 'Platine',   color: '#5DCAA5' },
  { key: 'emerald',  label: 'Émeraude',  color: '#10B981' },
  { key: 'diamond',  label: 'Diamant',   color: '#3A8AC9' },
  { key: 'master+',  label: 'Maître +',  color: '#A855F7' },
]

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
          supabase.from('profiles')
            .select('id, username, tier, role, certified, tier_expires_at, created_at, riot_gamename, riot_tagline, riot_platform, riot_rank')
            .eq('id', user.id).maybeSingle(),
          supabase.from('item_builds').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
          supabase.from('todo_lists').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
          supabase.from('todo_items').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
          fetch(`${DDN}/api/versions.json`),
        ])
        if (cancelled) return

        const profData = profRes.data as Omit<UserProfile, 'email'> | null
        if (!profData) { setError('Profil introuvable.'); return }
        const prof: UserProfile = { ...profData, email: user.email ?? '' }
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
            <span>·</span>
            <Link href="/?tab=tarifs" style={{ color: '#EF9F27', fontWeight: 600, textDecoration: 'none' }}>
              Voir les tarifs →
            </Link>
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

      {/* Paramètres du compte */}
      <ProfileSettings profile={profile} onProfileUpdate={p => setProfile(p)} />

      {/* Zone danger : déconnexion */}
      <DangerZone />

      {/* Suppression du compte (RGPD article 17) */}
      <DeletionRequest profile={profile} />
    </main>
  )
}

// ────────────────────────────────────────────────────────────────────────────────
// Paramètres : pseudo / email / mot de passe / compte Riot — édition inline
// ────────────────────────────────────────────────────────────────────────────────
function ProfileSettings({ profile, onProfileUpdate }: {
  profile: UserProfile; onProfileUpdate: (p: UserProfile) => void
}) {
  return (
    <section style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
        Paramètres du compte
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <EditableField
          label="Pseudo"
          currentValue={profile.username}
          placeholder="Nouveau pseudo"
          onSave={async (newValue) => {
            const { error } = await supabase.from('profiles')
              .update({ username: newValue }).eq('id', profile.id)
            if (error) throw new Error('Échec : ' + error.message)
            onProfileUpdate({ ...profile, username: newValue })
            return 'Pseudo mis à jour.'
          }}
        />
        <EditableField
          label="Email"
          currentValue={profile.email}
          placeholder="Nouvel email"
          inputType="email"
          onSave={async (newValue) => {
            const { error } = await supabase.auth.updateUser({ email: newValue })
            if (error) throw new Error('Échec : ' + error.message)
            return 'Un email de confirmation a été envoyé à ' + newValue + '.'
          }}
        />
        <EditableField
          label="Mot de passe"
          currentValue="••••••••"
          placeholder="Nouveau mot de passe (8 caractères minimum)"
          inputType="password"
          maskValue
          onSave={async (newValue) => {
            if (newValue.length < 8) throw new Error('Le mot de passe doit faire au moins 8 caractères.')
            const { error } = await supabase.auth.updateUser({ password: newValue })
            if (error) throw new Error('Échec : ' + error.message)
            return 'Mot de passe mis à jour.'
          }}
        />
        <div style={{
          padding: '10px 14px', borderRadius: 6,
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid rgba(255,255,255,0.06)',
        }}>
          <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2 }}>
            Compte Riot
          </div>
          {profile.riot_gamename ? (
            <div style={{ fontSize: 14, color: '#F5F2FA' }}>
              {profile.riot_gamename}<span style={{ color: 'var(--text-dim)', fontWeight: 400 }}>#{profile.riot_tagline}</span>
              {' '}<span style={{ color: 'var(--text-dim)', fontSize: 12 }}>· {(profile.riot_platform ?? 'euw1').toUpperCase()}</span>
            </div>
          ) : (
            <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>
              Aucun compte Riot lié — lier depuis l&apos;onglet Accueil.
            </div>
          )}
        </div>
        <EditableField
          label="Rang League (pour comparaisons)"
          currentValue={
            profile.riot_rank
              ? LOL_RANKS.find(r => r.key === profile.riot_rank)?.label ?? profile.riot_rank
              : 'Non renseigné'
          }
          customForm={(value, setValue) => (
            <select
              value={value || profile.riot_rank || ''}
              onChange={e => setValue(e.target.value)}
              style={inputStyle}
            >
              <option value="">Sélectionne ton rang</option>
              {LOL_RANKS.map(r => (
                <option key={r.key} value={r.key}>{r.label}</option>
              ))}
            </select>
          )}
          onSave={async (newValue) => {
            if (!newValue) throw new Error('Sélectionne un rang.')
            const { error } = await supabase.from('profiles')
              .update({ riot_rank: newValue }).eq('id', profile.id)
            if (error) throw new Error('Échec : ' + error.message)
            onProfileUpdate({ ...profile, riot_rank: newValue })
            return 'Rang mis à jour. Tu verras la comparaison sur la page des matchs.'
          }}
        />
      </div>
    </section>
  )
}

const inputStyle: React.CSSProperties = {
  flex: 1, minWidth: 180, padding: '8px 10px',
  background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(127,119,221,0.3)',
  borderRadius: 5, color: '#F5F2FA', fontSize: 13,
  fontFamily: 'inherit', outline: 'none',
}

function EditableField({ label, currentValue, placeholder, inputType, maskValue, customForm, onSave }: {
  label: string
  currentValue: string
  placeholder?: string
  inputType?: 'text' | 'email' | 'password'
  maskValue?: boolean
  customForm?: (value: string, setValue: (v: string) => void) => React.ReactNode
  onSave: (newValue: string) => Promise<string>
}) {
  const [editing, setEditing] = useState(false)
  const [value,   setValue]   = useState('')
  const [busy,    setBusy]    = useState(false)
  const [msg,     setMsg]     = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  async function save() {
    if (busy) return
    setBusy(true); setMsg(null)
    try {
      const okMsg = await onSave(value)
      setMsg({ kind: 'ok', text: okMsg })
      setEditing(false)
      setValue('')
    } catch (e: unknown) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'Erreur' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{
      padding: '10px 14px', borderRadius: 6,
      background: 'rgba(255,255,255,0.02)',
      border: '1px solid rgba(255,255,255,0.06)',
    }}>
      {!editing ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2 }}>
              {label}
            </div>
            <div style={{ fontSize: 14, color: '#F5F2FA', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {currentValue}
            </div>
          </div>
          <button onClick={() => { setEditing(true); setMsg(null) }} style={{
            padding: '6px 12px', borderRadius: 5, fontSize: 12, fontWeight: 600,
            cursor: 'pointer', background: 'rgba(127,119,221,0.15)',
            border: '1px solid rgba(127,119,221,0.4)', color: '#F5F2FA',
          }}>Modifier</button>
        </div>
      ) : (
        <div>
          <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
            Nouveau {label.toLowerCase()}
          </div>
          {customForm
            ? customForm(value, setValue)
            : (
              <input
                type={inputType ?? 'text'}
                value={value}
                onChange={e => setValue(e.target.value)}
                placeholder={placeholder}
                disabled={busy}
                style={inputStyle}
                onKeyDown={e => { if (e.key === 'Enter') save() }}
              />
            )
          }
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <button onClick={() => { setEditing(false); setValue(''); setMsg(null) }} disabled={busy}
              style={{
                padding: '6px 12px', borderRadius: 5, fontSize: 12, fontWeight: 600,
                cursor: 'pointer', background: 'transparent',
                border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-muted)',
              }}>Annuler</button>
            <button onClick={save} disabled={busy || !value.trim()} style={{
              padding: '6px 12px', borderRadius: 5, fontSize: 12, fontWeight: 600,
              cursor: busy ? 'wait' : 'pointer',
              background: 'rgba(239,159,39,0.18)',
              border: '1px solid #EF9F27', color: '#F5F2FA',
              opacity: !value.trim() ? 0.5 : 1,
            }}>{busy ? 'Enregistrement…' : 'Enregistrer'}</button>
          </div>
          {!busy && maskValue && (
            <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 4 }}>
              Tu seras peut-être déconnecté après le changement de mot de passe.
            </div>
          )}
        </div>
      )}
      {msg && (
        <div style={{
          marginTop: 8, padding: '6px 10px', borderRadius: 4, fontSize: 12,
          background: msg.kind === 'ok' ? 'rgba(93,202,165,0.10)' : 'rgba(226,75,74,0.10)',
          borderLeft: `3px solid ${msg.kind === 'ok' ? '#5DCAA5' : '#E24B4A'}`,
          color: msg.kind === 'ok' ? '#5DCAA5' : '#E24B4A',
        }}>{msg.text}</div>
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────────
// DeletionRequest : demande de suppression du compte (RGPD article 17 — droit à
// l'effacement). On enregistre une demande dans la table deletion_requests qui
// sera traitée par un admin / une Edge Function dans les 30 jours max.
// ────────────────────────────────────────────────────────────────────────────────
interface DeletionRequestRow {
  id: string; user_id: string; email: string; username: string | null
  reason: string | null
  requested_at: string; processed_at: string | null
  status: 'pending' | 'processed' | 'cancelled'
}

// Les comptes Wyrm Forge (équipe / admin) ne peuvent pas être supprimés depuis l'app.
// Vérification UI + RLS côté DB pour double protection.
const WYRM_DOMAIN = '@wyrm-forge.com'
function isProtectedAccount(profile: UserProfile): boolean {
  return profile.email?.toLowerCase().endsWith(WYRM_DOMAIN) || profile.role === 'admin'
}

function DeletionRequest({ profile }: { profile: UserProfile }) {
  const protectedAcc = isProtectedAccount(profile)

  const [pending,  setPending]  = useState<DeletionRequestRow | null>(null)
  const [loading,  setLoading]  = useState(true)
  const [opening,  setOpening]  = useState(false)
  const [emailIn,  setEmailIn]  = useState('')
  const [reason,   setReason]   = useState('')
  const [busy,     setBusy]     = useState(false)
  const [msg,      setMsg]      = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  // Charger une éventuelle demande déjà en cours pour l'afficher
  useEffect(() => {
    if (protectedAcc) { setLoading(false); return }
    let cancelled = false
    async function load() {
      const { data } = await supabase
        .from('deletion_requests')
        .select('*')
        .eq('user_id', profile.id)
        .eq('status', 'pending')
        .order('requested_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (!cancelled) {
        setPending(data as DeletionRequestRow | null)
        setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [profile.id, protectedAcc])

  async function submit() {
    if (busy) return
    if (emailIn.trim().toLowerCase() !== profile.email.toLowerCase()) {
      setMsg({ kind: 'err', text: 'L\'email saisi ne correspond pas à celui de ton compte.' })
      return
    }
    setBusy(true); setMsg(null)
    try {
      const { data, error } = await supabase.from('deletion_requests').insert({
        user_id:  profile.id,
        email:    profile.email,
        username: profile.username,
        reason:   reason.trim() || null,
        status:   'pending',
      }).select().single()
      if (error) { setMsg({ kind: 'err', text: 'Échec : ' + error.message }); return }
      setPending(data as DeletionRequestRow)
      setOpening(false)
      setEmailIn(''); setReason('')
      setMsg({ kind: 'ok', text: 'Demande enregistrée. Elle sera traitée sous 30 jours.' })
    } catch {
      setMsg({ kind: 'err', text: 'Erreur inattendue.' })
    } finally {
      setBusy(false)
    }
  }

  async function cancelPending() {
    if (!pending || busy) return
    setBusy(true); setMsg(null)
    const { error } = await supabase
      .from('deletion_requests')
      .update({ status: 'cancelled' })
      .eq('id', pending.id)
    setBusy(false)
    if (error) { setMsg({ kind: 'err', text: 'Impossible d\'annuler : ' + error.message }); return }
    setPending(null)
    setMsg({ kind: 'ok', text: 'Demande annulée.' })
  }

  if (loading) return null

  // Compte protégé (équipe Wyrm Forge / admin) : on affiche uniquement
  // un message d'info, sans formulaire de suppression.
  if (protectedAcc) {
    return (
      <section style={{
        marginTop: 18, padding: '14px 18px', borderRadius: 10,
        background: 'rgba(127,119,221,0.04)',
        border: '1px solid rgba(127,119,221,0.2)',
        borderLeft: '3px solid #7F77DD',
      }}>
        <div style={{ fontSize: 11, color: '#7F77DD', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, fontWeight: 700 }}>
          Compte Wyrm Forge protégé
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
          Les comptes de l&apos;équipe Wyrm Forge ne peuvent pas être supprimés depuis l&apos;app.
          Pour toute demande administrative, contacte directement{' '}
          <a href="mailto:admin@wyrm-forge.com" style={{ color: '#EF9F27' }}>admin@wyrm-forge.com</a>.
        </div>
      </section>
    )
  }

  return (
    <section style={{
      marginTop: 18, padding: '14px 18px', borderRadius: 10,
      background: 'rgba(226,75,74,0.04)',
      border: '1px solid rgba(226,75,74,0.2)',
      borderLeft: '3px solid #E24B4A',
    }}>
      <div style={{ fontSize: 11, color: '#E24B4A', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, fontWeight: 700 }}>
        Suppression du compte et des données (RGPD)
      </div>

      {pending ? (
        <div>
          <div style={{ padding: '10px 14px', borderRadius: 6,
            background: 'rgba(239,159,39,0.08)',
            border: '1px solid rgba(239,159,39,0.3)',
            color: '#EF9F27', fontSize: 13, marginBottom: 10,
          }}>
            <strong>Demande en cours de traitement</strong>
            <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 4 }}>
              Demande déposée le {new Date(pending.requested_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}.
              <br />Elle sera traitée sous 30 jours (article 17 du RGPD).
            </div>
          </div>
          <button onClick={cancelPending} disabled={busy} style={{
            padding: '8px 14px', borderRadius: 6, fontSize: 13, fontWeight: 600,
            cursor: busy ? 'wait' : 'pointer',
            background: 'rgba(127,119,221,0.15)',
            border: '1px solid rgba(127,119,221,0.4)', color: '#F5F2FA',
          }}>{busy ? '…' : 'Annuler ma demande'}</button>
        </div>
      ) : !opening ? (
        <div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: 12 }}>
            Conformément à l&apos;article 17 du RGPD (droit à l&apos;effacement), tu peux demander
            la suppression définitive de ton compte et de toutes les données associées.
            Cette action est <strong style={{ color: '#E24B4A' }}>irréversible</strong> et entraînera :
            <ul style={{ margin: '6px 0 0 18px', padding: 0, color: 'var(--text-dim)' }}>
              <li>Suppression de ton profil et de tes identifiants</li>
              <li>Suppression de tes builds d&apos;items et to-do lists</li>
              <li>Suppression du lien vers ton compte Riot</li>
              <li>Suppression de toutes contributions publiques (workshop)</li>
            </ul>
            <div style={{ marginTop: 8, color: 'var(--text-dim)', fontStyle: 'italic' }}>
              Traitement effectué sous 30 jours maximum.
            </div>
          </div>
          <button onClick={() => { setOpening(true); setMsg(null) }} style={{
            padding: '8px 14px', borderRadius: 6, fontSize: 13, fontWeight: 600,
            cursor: 'pointer',
            background: 'rgba(226,75,74,0.15)',
            border: '1px solid #E24B4A', color: '#E24B4A',
          }}>Demander la suppression de mon compte</button>
        </div>
      ) : (
        <div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
            Pour confirmer, saisis ton email <strong style={{ color: '#F5F2FA' }}>{profile.email}</strong> ci-dessous :
          </div>
          <input
            type="email"
            value={emailIn}
            onChange={e => setEmailIn(e.target.value)}
            placeholder={profile.email}
            style={inputStyle}
            disabled={busy}
          />
          <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 10, marginBottom: 4 }}>
            Raison du départ (optionnel) :
          </div>
          <textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="Ce qui t'a déçu, manqué, ou ce qu'on pourrait améliorer…"
            disabled={busy}
            rows={3}
            style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
          />
          <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
            <button onClick={() => { setOpening(false); setEmailIn(''); setReason(''); setMsg(null) }} disabled={busy} style={{
              padding: '8px 14px', borderRadius: 6, fontSize: 13, fontWeight: 600,
              cursor: 'pointer', background: 'transparent',
              border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-muted)',
            }}>Annuler</button>
            <button onClick={submit} disabled={busy || !emailIn} style={{
              padding: '8px 14px', borderRadius: 6, fontSize: 13, fontWeight: 600,
              cursor: busy ? 'wait' : 'pointer',
              background: 'rgba(226,75,74,0.20)',
              border: '1px solid #E24B4A', color: '#fff',
              opacity: !emailIn ? 0.5 : 1,
            }}>{busy ? 'Envoi…' : 'Confirmer la suppression'}</button>
          </div>
        </div>
      )}

      {msg && (
        <div style={{
          marginTop: 10, padding: '6px 10px', borderRadius: 4, fontSize: 12,
          background: msg.kind === 'ok' ? 'rgba(93,202,165,0.10)' : 'rgba(226,75,74,0.10)',
          borderLeft: `3px solid ${msg.kind === 'ok' ? '#5DCAA5' : '#E24B4A'}`,
          color: msg.kind === 'ok' ? '#5DCAA5' : '#E24B4A',
        }}>{msg.text}</div>
      )}
    </section>
  )
}

// ── Zone danger : déconnexion (suppression de compte = action plus risquée à venir) ──
function DangerZone() {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function logout() {
    if (busy) return
    setBusy(true)
    await supabase.auth.signOut()
    router.push('/')
  }

  return (
    <section style={{
      padding: '14px 18px', borderRadius: 10,
      background: 'rgba(226,75,74,0.04)',
      border: '1px solid rgba(226,75,74,0.2)',
      borderLeft: '3px solid #E24B4A',
    }}>
      <div style={{ fontSize: 11, color: '#E24B4A', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, fontWeight: 700 }}>
        Zone sensible
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', flex: 1, minWidth: 200 }}>
          Te déconnecter de l'application sur cet appareil.
        </div>
        <button onClick={logout} disabled={busy} style={{
          padding: '8px 14px', borderRadius: 6, fontSize: 13, fontWeight: 600,
          cursor: busy ? 'wait' : 'pointer',
          background: 'rgba(226,75,74,0.15)', border: '1px solid #E24B4A', color: '#E24B4A',
        }}>{busy ? 'Déconnexion…' : 'Se déconnecter'}</button>
      </div>
    </section>
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
