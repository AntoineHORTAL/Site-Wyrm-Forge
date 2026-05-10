'use client'

/**
 * Page de détail complet d'un match : URL partageable du style
 *   /match/euw1/EUW1_7384239821
 *
 * Charge en parallèle la fiche détaillée (Edge Function riot-match-detail)
 * et les ressources DDragon (champions, items, summs, runes), puis affiche
 * les 2 équipes avec tous les joueurs et leurs stats complètes.
 */
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const supabase = createClient()
const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPA_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const FN_URL   = (name: string, params: Record<string, string>) =>
  `${SUPA_URL}/functions/v1/${name}?${new URLSearchParams(params).toString()}`
const DDN      = 'https://ddragon.leagueoflegends.com'
const champImg = (v: string, img: string) => `${DDN}/cdn/${v}/img/champion/${img}`
const itemImg  = (v: string, id: number)  => `${DDN}/cdn/${v}/img/item/${id}.png`
const spellImg = (v: string, img: string) => `${DDN}/cdn/${v}/img/spell/${img}`
const runeImg  = (path: string)            => `${DDN}/cdn/img/${path}`

// Mapping queueId → label
const QUEUES: Record<number, string> = {
  420: 'Classée Solo/Duo', 440: 'Classée Flex',
  400: 'Normale Draft', 430: 'Normale Aveugle',
  450: 'ARAM', 900: 'URF', 1020: 'Légendes Uniques',
  1400: 'Ultime Spellbook', 1900: 'URF (pick)', 0: 'Personnalisée', 1700: 'Arena',
}
const POS: Record<string, string> = {
  TOP: 'TOP', JUNGLE: 'JGL', MIDDLE: 'MID', BOTTOM: 'ADC', UTILITY: 'SUP',
}

interface ChampInfo { id: string; name: string; image: string }
interface SpellInfo { id: string; name: string; image: string }
interface RuneInfo  { id: number; name: string; icon: string }

interface Participant {
  puuid: string; riotIdGameName: string; riotIdTagline: string
  championId: number; championName: string; teamId: number; teamPosition: string
  kills: number; deaths: number; assists: number
  cs: number; visionScore: number; level: number
  damageDealt: number; damageTaken: number; damageMitigated: number; goldEarned: number
  summoner1Id: number; summoner2Id: number
  keystoneId: number; secondaryStyleId: number
  items: number[]; trinket: number
  pentaKills: number; quadraKills: number; tripleKills: number; doubleKills: number
  wardsPlaced: number; wardsKilled: number; controlWards: number
  win: boolean
}
interface Team {
  teamId: number; win: boolean; bans: number[]
  objectives: { baron: number; dragon: number; herald: number; tower: number; inhibitor: number; champion: number }
}
interface MatchDetail {
  matchId: string; gameCreation: number; gameDuration: number; queueId: number; gameVersion: string
  participants: Participant[]
  teams: Team[]
}

function fmt(secs: number) {
  const m = Math.floor(secs / 60), s = secs % 60
  return `${m}m${s.toString().padStart(2, '0')}`
}

function timeAgo(ts: number) {
  const diff = (Date.now() - ts) / 1000
  if (diff < 60)        return 'à l\'instant'
  if (diff < 3600)      return `il y a ${Math.floor(diff / 60)}m`
  if (diff < 86400)     return `il y a ${Math.floor(diff / 3600)}h`
  return `il y a ${Math.floor(diff / 86400)}j`
}

export default function MatchPage() {
  const { platform, matchId } = useParams<{ platform: string; matchId: string }>()
  const router = useRouter()

  const [detail,  setDetail]  = useState<MatchDetail | null>(null)
  const [version, setVersion] = useState('')
  const [champMap, setChampMap] = useState<Record<number, ChampInfo>>({})
  const [spellMap, setSpellMap] = useState<Record<number, SpellInfo>>({})
  const [runeMap,  setRuneMap]  = useState<Record<number, RuneInfo>>({})
  const [myPuuid,  setMyPuuid]  = useState('')
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(true)

  useEffect(() => {
    if (!platform || !matchId) return
    let cancelled = false

    async function load() {
      setLoading(true)
      setError('')
      try {
        // 1. Session
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) {
          setError('Connexion requise pour voir le détail d\'un match.')
          setLoading(false)
          return
        }

        // 2. Riot ID du joueur (pour highlight) — depuis profiles
        const { data: profile } = await supabase
          .from('profiles')
          .select('riot_gamename, riot_tagline')
          .eq('id', session.user.id)
          .maybeSingle()

        // 3. Versions DDragon
        const vRes = await fetch(`${DDN}/api/versions.json`)
        const vList: string[] = await vRes.json()
        const v = vList[0]
        if (cancelled) return
        setVersion(v)

        // 4. Resources DDragon en parallèle
        const [cRes, sRes, rRes, dRes] = await Promise.all([
          fetch(`${DDN}/cdn/${v}/data/fr_FR/champion.json`),
          fetch(`${DDN}/cdn/${v}/data/fr_FR/summoner.json`),
          fetch(`${DDN}/cdn/${v}/data/fr_FR/runesReforged.json`),
          fetch(FN_URL('riot-match-detail', { matchId, platform }), {
            headers: { apikey: SUPA_KEY, Authorization: `Bearer ${session.access_token}` },
          }),
        ])
        if (cancelled) return

        // Champions
        const cData = await cRes.json()
        const cm: Record<number, ChampInfo> = {}
        Object.values(cData.data).forEach((ch: unknown) => {
          const c = ch as { key: string; id: string; name: string; image: { full: string } }
          cm[Number(c.key)] = { id: c.id, name: c.name, image: c.image.full }
        })
        setChampMap(cm)

        // Summs
        const sData = await sRes.json()
        const sm: Record<number, SpellInfo> = {}
        Object.values(sData.data).forEach((sp: unknown) => {
          const s = sp as { key: string; id: string; name: string; image: { full: string } }
          sm[Number(s.key)] = { id: s.id, name: s.name, image: s.image.full }
        })
        setSpellMap(sm)

        // Runes
        type RawRune = { id: number; name: string; icon: string }
        type RawTree = { id: number; name: string; icon: string; slots: { runes: RawRune[] }[] }
        const rData: RawTree[] = await rRes.json()
        const rm: Record<number, RuneInfo> = {}
        rData.forEach(tree => {
          rm[tree.id] = { id: tree.id, name: tree.name, icon: tree.icon }
          tree.slots.forEach(slot => slot.runes.forEach(r => {
            rm[r.id] = { id: r.id, name: r.name, icon: r.icon }
          }))
        })
        setRuneMap(rm)

        // Détail match
        const dData = await dRes.json()
        if (!dRes.ok) {
          setError(dData.error ?? 'Erreur lors du chargement du match.')
          setLoading(false)
          return
        }
        setDetail(dData)

        // Highlight : retrouver le puuid de l'utilisateur dans la partie
        if (profile?.riot_gamename) {
          const me = (dData as MatchDetail).participants.find(
            p => p.riotIdGameName?.toLowerCase() === profile.riot_gamename?.toLowerCase()
              && (!profile.riot_tagline || p.riotIdTagline?.toLowerCase() === profile.riot_tagline.toLowerCase()),
          )
          if (me) setMyPuuid(me.puuid)
        }
      } catch {
        if (!cancelled) setError('Impossible de charger le détail du match.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [platform, matchId])

  return (
    <main style={{
      minHeight: '100vh', padding: '24px clamp(12px, 4vw, 40px)',
      maxWidth: 1400, margin: '0 auto',
      color: '#F5F2FA',
    }}>
      {/* Header */}
      <button
        onClick={() => router.back()}
        style={{
          background: 'transparent', border: 'none', cursor: 'pointer',
          color: 'var(--text-muted)', fontSize: 13, padding: '6px 0',
          marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6,
        }}>
        ← Retour
      </button>

      {loading && (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
          Chargement du match…
        </div>
      )}
      {error && !loading && (
        <div style={{
          padding: 16, borderRadius: 8, fontSize: 14,
          background: 'rgba(226,75,74,0.08)', border: '1px solid rgba(226,75,74,0.3)',
          color: '#E24B4A',
        }}>{error}</div>
      )}

      {detail && version && !loading && !error && (
        <MatchDetailView
          detail={detail} version={version}
          champMap={champMap} spellMap={spellMap} runeMap={runeMap}
          myPuuid={myPuuid}
        />
      )}
    </main>
  )
}

// ────────────────────────────────────────────────────────────────────────────────
function MatchDetailView({
  detail, version, champMap, spellMap, runeMap, myPuuid,
}: {
  detail: MatchDetail; version: string
  champMap: Record<number, ChampInfo>
  spellMap: Record<number, SpellInfo>
  runeMap:  Record<number, RuneInfo>
  myPuuid:  string
}) {
  const accent = '#7F77DD'
  const gold   = '#EF9F27'
  const border = 'rgba(255,255,255,0.06)'
  const bg     = 'rgba(255,255,255,0.02)'
  const queue  = QUEUES[detail.queueId] ?? 'Partie'

  // Damage max pour la barre
  const maxDmg = Math.max(...detail.participants.map(p => p.damageDealt), 1)

  const renderTeam = (teamId: 100 | 200, label: string) => {
    const team    = detail.teams.find(t => t.teamId === teamId)
    const players = detail.participants.filter(p => p.teamId === teamId)
    if (!team) return null

    const totalKills = players.reduce((s, p) => s + p.kills, 0)
    const totalGold  = players.reduce((s, p) => s + p.goldEarned, 0)
    const teamColor  = team.win ? '#5DCAA5' : '#E24B4A'

    return (
      <section style={{
        marginBottom: 18, borderRadius: 10, overflow: 'hidden',
        border: `1px solid ${border}`, borderLeft: `4px solid ${teamColor}`,
        background: bg,
      }}>
        {/* Header équipe */}
        <header style={{
          display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
          padding: '10px 14px', borderBottom: `1px solid ${border}`,
          background: 'rgba(0,0,0,0.15)',
        }}>
          <span style={{ fontWeight: 700, color: teamColor, fontSize: 13, letterSpacing: 1 }}>
            {label} · {team.win ? 'VICTOIRE' : 'DÉFAITE'}
          </span>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {totalKills} kills · {Math.round(totalGold / 1000)}K or
          </span>
          <ObjStat src="/icons/objectives/_tower.png"      fallback="🏯" count={team.objectives.tower}     label="Tours" />
          <ObjStat src="/icons/objectives/_dragon.png"     fallback="🐉" count={team.objectives.dragon}    label="Dragons" />
          <ObjStat src="/icons/objectives/_baronnashor.png" fallback="🦇" count={team.objectives.baron}     label="Barons" />
          <ObjStat src="/icons/objectives/_riftherald.png" fallback="🦅" count={team.objectives.herald}    label="Hérauts" />
          <ObjStat src="/icons/objectives/_inhibitor.png"  fallback="🟣" count={team.objectives.inhibitor} label="Inhibs" />
          {team.bans.length > 0 && (
            <div style={{ display: 'flex', gap: 4, marginLeft: 'auto', alignItems: 'center' }}>
              <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>BANS</span>
              {team.bans.map((banId, i) => {
                const c = champMap[banId]
                return c
                  ? <img key={i} src={champImg(version, c.image)} title={c.name} alt=""
                      style={{ width: 26, height: 26, borderRadius: 4, opacity: 0.55, filter: 'grayscale(0.7)' }} />
                  : <div key={i} style={{ width: 26, height: 26, borderRadius: 4, background: 'rgba(255,255,255,0.05)' }} />
              })}
            </div>
          )}
        </header>

        {/* Joueurs */}
        <div>
          {players.map(p => {
            const champ      = champMap[p.championId]
            const summ1      = p.summoner1Id ? spellMap[p.summoner1Id] : undefined
            const summ2      = p.summoner2Id ? spellMap[p.summoner2Id] : undefined
            const keystone   = p.keystoneId ? runeMap[p.keystoneId] : undefined
            const isMe       = p.puuid === myPuuid
            const dmgPct     = (p.damageDealt / maxDmg) * 100
            const items      = [...p.items, p.trinket]
            const kdaRatio   = p.deaths === 0 ? p.kills + p.assists : (p.kills + p.assists) / p.deaths

            return (
              <div key={p.puuid} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 14px', borderTop: `1px solid ${border}`,
                background: isMe ? 'rgba(127,119,221,0.10)' : 'transparent',
                fontSize: 12,
              }}>
                {/* Champion + level */}
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  {champ
                    ? <img src={champImg(version, champ.image)} alt="" style={{ width: 40, height: 40, borderRadius: 5 }} />
                    : <div style={{ width: 40, height: 40, borderRadius: 5, background: '#222' }} />
                  }
                  <div style={{
                    position: 'absolute', bottom: -3, right: -3, fontSize: 10, fontWeight: 700,
                    background: 'rgba(0,0,0,0.85)', padding: '0 4px', borderRadius: 3,
                    color: '#F5F2FA', border: `1px solid ${border}`, lineHeight: '13px',
                  }}>{p.level}</div>
                </div>

                {/* Summs */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flexShrink: 0 }}>
                  {summ1 && <img src={spellImg(version, summ1.image)} alt="" title={summ1.name}
                    style={{ width: 18, height: 18, borderRadius: 3 }} />}
                  {summ2 && <img src={spellImg(version, summ2.image)} alt="" title={summ2.name}
                    style={{ width: 18, height: 18, borderRadius: 3 }} />}
                </div>

                {/* Keystone */}
                {keystone && (
                  <img src={runeImg(keystone.icon)} alt="" title={keystone.name}
                    style={{ width: 28, height: 28, flexShrink: 0 }} />
                )}

                {/* Pseudo + champion */}
                <div style={{ flex: '1 1 160px', minWidth: 0 }}>
                  <div style={{
                    color: isMe ? gold : '#F5F2FA', fontWeight: isMe ? 700 : 500,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: 13,
                  }}>
                    {p.riotIdGameName || champ?.name || p.championName}
                    {p.riotIdTagline && (
                      <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}>#{p.riotIdTagline}</span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)', display: 'flex', gap: 6 }}>
                    <span>{champ?.name ?? p.championName}</span>
                    {POS[p.teamPosition] && (
                      <>
                        <span>·</span>
                        <span style={{ color: accent, fontWeight: 600 }}>{POS[p.teamPosition]}</span>
                      </>
                    )}
                  </div>
                </div>

                {/* KDA */}
                <div style={{ minWidth: 90, textAlign: 'center' }}>
                  <div style={{ fontWeight: 600 }}>
                    {p.kills}/<span style={{ color: '#E24B4A' }}>{p.deaths}</span>/{p.assists}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>{kdaRatio.toFixed(2)} KDA</div>
                </div>

                {/* CS */}
                <div style={{ minWidth: 70, textAlign: 'right', color: 'var(--text-muted)' }}>
                  <div>{p.cs} CS</div>
                  <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>
                    {(p.cs / (detail.gameDuration / 60)).toFixed(1)}/min
                  </div>
                </div>

                {/* Or */}
                <div style={{ minWidth: 60, textAlign: 'right', color: gold }}>
                  {(p.goldEarned / 1000).toFixed(1)}K
                </div>

                {/* Damage */}
                <div style={{ flex: '0 0 130px', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ flex: 1, height: 8, background: 'rgba(255,255,255,0.05)', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ width: `${dmgPct}%`, height: '100%', background: '#E24B4A' }} />
                  </div>
                  <span style={{ fontSize: 10, color: 'var(--text-dim)', minWidth: 40, textAlign: 'right' }}>
                    {(p.damageDealt / 1000).toFixed(1)}K
                  </span>
                </div>

                {/* Vision + wards */}
                <div style={{ minWidth: 68, textAlign: 'right', color: 'var(--text-dim)', fontSize: 11 }}>
                  <div>Vis {p.visionScore}</div>
                  <div style={{ fontSize: 10 }}>{p.wardsPlaced}p / {p.wardsKilled}k</div>
                </div>

                {/* Items */}
                <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                  {items.map((id, i) => (
                    <div key={i} style={{
                      width: 22, height: 22, borderRadius: 3,
                      background: id ? 'transparent' : 'rgba(255,255,255,0.04)',
                    }}>
                      {id > 0 && (
                        <img src={itemImg(version, id)} alt=""
                          style={{ width: 22, height: 22, borderRadius: 3, display: 'block' }}
                          onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </section>
    )
  }

  return (
    <div>
      {/* En-tête match */}
      <header style={{
        marginBottom: 18, padding: '14px 18px', borderRadius: 10,
        background: bg, border: `1px solid ${border}`,
      }}>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>{queue}</div>
        <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
          {fmt(detail.gameDuration)} · {timeAgo(detail.gameCreation)} · Patch {detail.gameVersion?.split('.').slice(0, 2).join('.')}
        </div>
      </header>

      {renderTeam(100, 'ÉQUIPE BLEUE')}
      {renderTeam(200, 'ÉQUIPE ROUGE')}
    </div>
  )
}

// Petit composant pour un objectif (icône + chiffre).
// Affiche l'image au chemin `src` ; si l'image ne charge pas (404, fichier absent),
// fallback automatique sur l'emoji `fallback`.
function ObjStat({ src, fallback, count, label }: {
  src: string; fallback: string; count: number; label: string
}) {
  const [imgFailed, setImgFailed] = useState(false)
  return (
    <span title={label} style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      fontSize: 12, color: 'var(--text-muted)',
    }}>
      {imgFailed
        ? <span style={{ fontSize: 14 }}>{fallback}</span>
        : <img src={src} alt="" width={18} height={18}
            onError={() => setImgFailed(true)}
            style={{ display: 'block', objectFit: 'contain' }} />
      }
      {count}
    </span>
  )
}
