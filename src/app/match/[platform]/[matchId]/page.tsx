'use client'

/**
 * Page de détail complet d'un match : URL partageable du style
 *   /match/euw1/EUW1_7384239821
 *
 * Charge en parallèle la fiche détaillée (Edge Function riot-match-detail)
 * et les ressources DDragon (champions, items, summs, runes), puis affiche
 * les 2 équipes avec tous les joueurs et leurs stats complètes.
 */
import { Fragment, useEffect, useMemo, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { computeItemImpact, type ItemCatalog, type WindowStats } from '@/lib/item-impact'

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

interface ItemEvent  { ts: number; itemId: number; type: 'PURCHASED' | 'SOLD' | 'UNDONE' }
interface SkillEvent { ts: number; slot: number /* 1=Q 2=W 3=E 4=R */ }

interface Participant {
  puuid: string; riotIdGameName: string; riotIdTagline: string
  championId: number; championName: string; teamId: number; teamPosition: string
  kills: number; deaths: number; assists: number
  cs: number; visionScore: number; level: number
  damageDealt: number; damageTaken: number; damageMitigated: number; goldEarned: number
  // Stats supplémentaires
  damageObjectives?: number; damageTurrets?: number; damageBuildings?: number
  physicalDamageDealt?: number; magicDamageDealt?: number; trueDamageDealt?: number
  totalHeal?: number; healOnTeammates?: number
  timeCcOthers?: number; longestLife?: number
  summoner1Id: number; summoner2Id: number
  keystoneId: number; secondaryStyleId: number
  items: number[]; trinket: number
  pentaKills: number; quadraKills: number; tripleKills: number; doubleKills: number
  wardsPlaced: number; wardsKilled: number; controlWards: number
  win: boolean
  // Timeline events
  itemEvents?: ItemEvent[]
  skillEvents?: SkillEvent[]
}
interface PlayerFrameStats {
  ap: number; ad: number; armor: number; mr: number
  hp: number; hpMax: number; attackSpeed: number; moveSpeed: number
  haste: number; omnivamp: number
  dmgChampions: number; physToChampions: number
  magicToChampions: number; trueToChampions: number
  currentGold: number
}
interface TimelineFrame {
  ts: number
  teamGold:    [number, number]
  teamXp:      [number, number]
  teamCs:      [number, number]
  playerGold:  number[]
  playerLevel: number[]
  playerXp?:   number[]
  playerCs?:   number[]
  playerStats?: PlayerFrameStats[]
}
interface Team {
  teamId: number; win: boolean; bans: number[]
  objectives: { baron: number; dragon: number; herald: number; tower: number; inhibitor: number; voidgrub: number; champion: number }
  drakes?: string[] // ex: ['infernaldrake', 'oceandrake', 'elderdrake']
}
interface Pos { x: number; y: number }
interface KillEvent {
  ts: number; killerId: number; victimId: number
  assistingIds: number[]; position: Pos; teamId: number
}
interface WardEvent {
  ts: number; creatorId: number; teamId: number
  wardType: string; action: 'PLACED' | 'KILLED'; position?: Pos
}

interface MatchDetail {
  matchId: string; gameCreation: number; gameDuration: number; queueId: number; gameVersion: string
  mapId?: number
  participants: Participant[]
  teams: Team[]
  timeline?: TimelineFrame[]
  kills?: KillEvent[]
  wards?: WardEvent[]
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
  // Query param ?puuid=... → priorité pour identifier le joueur à mettre en avant
  // (utile quand on regarde le match d'un autre invocateur via la recherche).
  const searchParams = useSearchParams()
  const queryPuuid   = searchParams.get('puuid') ?? ''

  const [detail,  setDetail]  = useState<MatchDetail | null>(null)
  const [version, setVersion] = useState('')
  const [champMap, setChampMap] = useState<Record<number, ChampInfo>>({})
  const [spellMap, setSpellMap] = useState<Record<number, SpellInfo>>({})
  const [runeMap,  setRuneMap]  = useState<Record<number, RuneInfo>>({})
  const [myPuuid,  setMyPuuid]  = useState('')
  const [myRank,   setMyRank]   = useState<string | null>(null)
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(true)

  useEffect(() => {
    if (!platform || !matchId) return
    let cancelled = false

    async function load() {
      setLoading(true)
      setError('')
      try {
        // 1. Session — un connecté a un accès illimité ; un anonyme passe par le
        //    quota détail (F3 Lot 2). Le COMMIT est idempotent par match : si le
        //    bouton de /matches a déjà réservé ce match, c'est gratuit. Refus (429)
        //    → message clair AVANT tout fetch Riot (pas de 429 surprise).
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) {
          try {
            const qRes = await fetch(FN_URL('detail-quota', {}), {
              method: 'POST',
              headers: { apikey: SUPA_KEY, 'Content-Type': 'application/json' },
              body: JSON.stringify({ matchId }),
            })
            if (cancelled) return
            if (qRes.status === 429) {
              setError('Quota de consultations détaillées atteint (10/heure). Connecte-toi pour un accès illimité.')
              setLoading(false)
              return
            }
            if (!qRes.ok) {
              setError('Impossible de vérifier ton quota de consultation. Réessaie.')
              setLoading(false)
              return
            }
          } catch {
            if (!cancelled) { setError('Erreur réseau. Réessaie.'); setLoading(false) }
            return
          }
        }

        // 2. Riot ID + puuid + rang du joueur (pour highlight et comparaison) —
        //    connecté uniquement (un anonyme n'a pas de profil Wyrm Forge).
        let profile:
          | { riot_gamename: string | null; riot_tagline: string | null; riot_rank: string | null; riot_puuid: string | null }
          | null = null
        if (session) {
          const { data } = await supabase
            .from('profiles')
            .select('riot_gamename, riot_tagline, riot_rank, riot_puuid')
            .eq('id', session.user.id)
            .maybeSingle()
          if (cancelled) return
          profile = data
          if (profile?.riot_rank) setMyRank(profile.riot_rank)
        }

        // 3. Versions DDragon
        const vRes = await fetch(`${DDN}/api/versions.json`)
        const vList: string[] = await vRes.json()
        const v = vList[0]
        if (cancelled) return
        setVersion(v)

        // 4. Resources DDragon en parallèle. Authorization seulement si connecté :
        //    il alimente le log match_viewed (quêtes app) côté Edge Function. Un
        //    anonyme appelle avec la clé anon seule (riot-match-detail est public).
        const detailHeaders: Record<string, string> = { apikey: SUPA_KEY }
        if (session) detailHeaders.Authorization = `Bearer ${session.access_token}`
        const [cRes, sRes, rRes, dRes] = await Promise.all([
          fetch(`${DDN}/cdn/${v}/data/fr_FR/champion.json`),
          fetch(`${DDN}/cdn/${v}/data/fr_FR/summoner.json`),
          fetch(`${DDN}/cdn/${v}/data/fr_FR/runesReforged.json`),
          fetch(FN_URL('riot-match-detail', { matchId, platform }), { headers: detailHeaders }),
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

        // Highlight : retrouver le joueur à mettre en avant.
        //  PRIO 1 : query param ?puuid (recherche d'un autre invocateur depuis Accueil)
        //  PRIO 2 : riot_puuid stocké dans le profil (l'utilisateur connecté)
        //  PRIO 3 : fallback gamename + tagline (anciens profils sans puuid)
        const participants = (dData as MatchDetail).participants
        let me: Participant | undefined
        if (queryPuuid) {
          me = participants.find(p => p.puuid === queryPuuid)
        }
        if (!me && profile?.riot_puuid) {
          me = participants.find(p => p.puuid === profile.riot_puuid)
        }
        if (!me && profile?.riot_gamename) {
          me = participants.find(
            p => p.riotIdGameName?.toLowerCase() === profile.riot_gamename?.toLowerCase()
              && (!profile.riot_tagline || p.riotIdTagline?.toLowerCase() === profile.riot_tagline.toLowerCase()),
          )
        }
        // Dernier filet : gamename seul (sans tagline) si rien trouvé
        if (!me && profile?.riot_gamename) {
          me = participants.find(
            p => p.riotIdGameName?.toLowerCase() === profile.riot_gamename?.toLowerCase(),
          )
        }
        if (me) {
          setMyPuuid(me.puuid)
          // Si on regarde notre propre profil et que le puuid n'est pas encore en DB → on le sauvegarde
          // (connecté uniquement — un anonyme n'a pas de profil à mettre à jour).
          const looksLikeMe = !queryPuuid || (profile?.riot_puuid && queryPuuid === profile.riot_puuid)
          if (session && looksLikeMe && !profile?.riot_puuid) {
            await supabase.from('profiles').update({ riot_puuid: me.puuid }).eq('id', session.user.id)
          }
        }
      } catch {
        if (!cancelled) setError('Impossible de charger le détail du match.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [platform, matchId, queryPuuid])

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
          myPuuid={myPuuid} myRank={myRank}
        />
      )}
    </main>
  )
}

// ────────────────────────────────────────────────────────────────────────────────
// Compute des badges par joueur (façon Blitz mais en plus complet).
// Retourne un dict puuid → liste de badges. Un même joueur peut en cumuler plusieurs.
// ────────────────────────────────────────────────────────────────────────────────
interface BadgeInfo { label: string; color: string; bg?: string; desc: string }
function computeBadges(detail: MatchDetail): Record<string, BadgeInfo[]> {
  const out: Record<string, BadgeInfo[]> = {}
  const add = (puuid: string, b: BadgeInfo) => {
    if (!out[puuid]) out[puuid] = []
    out[puuid].push(b)
  }
  const ps = detail.participants

  // Multikills (priorité au plus haut)
  ps.forEach(p => {
    if      (p.pentaKills  > 0) add(p.puuid, { label: 'PENTAKILL', color: '#1a0d2e', bg: '#EF9F27', desc: 'A réalisé un pentakill (5 kills d\'affilée).' })
    else if (p.quadraKills > 0) add(p.puuid, { label: 'QUADRA',    color: '#1a0d2e', bg: '#EF9F27', desc: 'A réalisé un quadrakill (4 kills d\'affilée).' })
    else if (p.tripleKills > 0) add(p.puuid, { label: 'TRIPLE',    color: '#fff',    bg: '#A855F7', desc: 'A réalisé un triplekill (3 kills d\'affilée).' })
  })

  // MVP / ACE (meilleur KDA dans chaque équipe gagnante/perdante)
  const kdaScore = (p: Participant) =>
    p.deaths === 0 ? p.kills + p.assists + 5 : (p.kills + p.assists) / p.deaths
  const winners = ps.filter(p => p.win)
  const losers  = ps.filter(p => !p.win)
  if (winners.length > 0) {
    const mvp = winners.reduce((b, p) => kdaScore(p) > kdaScore(b) ? p : b)
    add(mvp.puuid, { label: 'MVP', color: '#1a0d2e', bg: '#EF9F27', desc: 'Meilleur KDA de l\'équipe victorieuse.' })
  }
  if (losers.length > 0) {
    const ace = losers.reduce((b, p) => kdaScore(p) > kdaScore(b) ? p : b)
    add(ace.puuid, { label: 'ACE', color: '#fff', bg: '#7F77DD', desc: 'Meilleur KDA de l\'équipe perdante.' })
  }

  // Stat leaders globaux (parmi les 10)
  const topBy = (key: keyof Participant, label: string, color: string, bg: string, desc: string) => {
    const winner = ps.reduce((b, p) => (p[key] as number) > (b[key] as number) ? p : b)
    if ((winner[key] as number) > 0) add(winner.puuid, { label, color, bg, desc })
  }
  topBy('kills',        'TOP KILLS', '#fff',     '#E24B4A', 'Plus de kills de la partie.')
  topBy('damageDealt',  'TOP DMG',   '#fff',     '#C02E2D', 'Plus de dégâts infligés aux champions.')
  topBy('damageTaken',  'TANK',      '#fff',     '#7F77DD', 'Plus de dégâts encaissés (tank).')
  topBy('visionScore',  'VISION',    '#fff',     '#3A8AC9', 'Meilleur score de vision de la partie.')
  topBy('goldEarned',   'OR',        '#1a0d2e',  '#EF9F27', 'Plus d\'or gagné de la partie.')
  topBy('cs',           'FARM',      '#1a0d2e',  '#5DCAA5', 'Plus de creep score (CS).')
  topBy('wardsKilled',  'NETTOYEUR', '#fff',     '#475569', 'Plus de wards adverses détruites.')

  // Spéciaux
  ps.forEach(p => {
    if (p.deaths === 0 && (p.kills + p.assists) >= 5) {
      add(p.puuid, { label: 'INTOUCHABLE', color: '#1a0d2e', bg: '#5DCAA5', desc: 'Aucune mort + au moins 5 kills/assists.' })
    }
    if (p.kills >= 15) {
      add(p.puuid, { label: '15+ KILLS', color: '#fff', bg: '#E24B4A', desc: 'A fait 15 kills ou plus.' })
    }
  })

  return out
}

// ────────────────────────────────────────────────────────────────────────────────
function MatchDetailView({
  detail, version, champMap, spellMap, runeMap, myPuuid, myRank,
}: {
  detail: MatchDetail; version: string
  champMap: Record<number, ChampInfo>
  spellMap: Record<number, SpellInfo>
  runeMap:  Record<number, RuneInfo>
  myPuuid:  string
  myRank:   string | null
}) {
  const accent = '#7F77DD'
  const gold   = '#EF9F27'
  const border = 'rgba(255,255,255,0.06)'
  const bg     = 'rgba(255,255,255,0.02)'
  const queue  = QUEUES[detail.queueId] ?? 'Partie'

  // Toggle pour révéler les détails approfondis (sous le scoreboard)
  const [detailsOpen, setDetailsOpen] = useState(false)

  // Badges par joueur (recalcul mémoïsé)
  const badges = useMemo(() => computeBadges(detail), [detail])

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
        borderTop:    `1px solid ${border}`,
        borderRight:  `1px solid ${border}`,
        borderBottom: `1px solid ${border}`,
        borderLeft:   `4px solid ${teamColor}`,
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
          <ObjStat src="/icons/objectives/_tower.svg"       fallback="🏯" count={team.objectives.tower}     label="Tours" />
          <ObjStat src="/icons/objectives/_inhibitor.svg"   fallback="◆"  count={team.objectives.inhibitor} label="Inhibs" />
          <ObjStat src="/icons/objectives/_baronnashor.png" fallback="🦇" count={team.objectives.baron}     label="Barons" />
          <ObjStat src="/icons/objectives/_riftherald.png"  fallback="🦅" count={team.objectives.herald}    label="Hérauts" />
          <ObjStat src="/icons/objectives/_voidgrub.png"    fallback="🟣" count={team.objectives.voidgrub}  label="Larves du Néant" />

          {/* Drakes typés (avec gros gap pour les détacher) */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 4,
            marginLeft: 18, paddingLeft: 18,
            borderLeft: `1px solid ${border}`,
          }}>
            {(team.drakes && team.drakes.length > 0)
              ? team.drakes.map((kind, i) => (
                  <DrakeIcon key={i} kind={kind} fallbackCount={0} />
                ))
              : Array.from({ length: team.objectives.dragon }).map((_, i) => (
                  <DrakeIcon key={i} kind="dragon" fallbackCount={0} />
                ))
            }
          </div>

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

                {/* Pseudo + champion + badges */}
                <div style={{ flex: '1 1 160px', minWidth: 0 }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
                    color: isMe ? gold : '#F5F2FA', fontWeight: isMe ? 700 : 500, fontSize: 13,
                  }}>
                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>
                      {p.riotIdGameName || champ?.name || p.championName}
                      {p.riotIdTagline && (
                        <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}>#{p.riotIdTagline}</span>
                      )}
                    </span>
                    {/* Badges (tooltip au survol) */}
                    {(badges[p.puuid] ?? []).map((b, i) => (
                      <Badge key={i} info={b} />
                    ))}
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

  // ── Stats agrégées par équipe (pour les graphiques de comparaison) ─────
  const me        = myPuuid ? detail.participants.find(p => p.puuid === myPuuid) : undefined
  const myTeamId  = me?.teamId
  const myWin     = me?.win

  const teamStats = (id: 100 | 200) => {
    const players = detail.participants.filter(p => p.teamId === id)
    return {
      kills:  players.reduce((s, p) => s + p.kills, 0),
      deaths: players.reduce((s, p) => s + p.deaths, 0),
      assists: players.reduce((s, p) => s + p.assists, 0),
      gold:   players.reduce((s, p) => s + p.goldEarned, 0),
      damage: players.reduce((s, p) => s + p.damageDealt, 0),
      taken:  players.reduce((s, p) => s + p.damageTaken, 0),
      vision: players.reduce((s, p) => s + p.visionScore, 0),
    }
  }
  const blue = teamStats(100)
  const red  = teamStats(200)

  return (
    <div>
      {/* ── Bannière résultat (basée sur le user) ── */}
      {me && (
        <div style={{
          marginBottom: 14, padding: '12px 18px', borderRadius: 10,
          background: myWin ? 'rgba(93,202,165,0.10)' : 'rgba(226,75,74,0.10)',
          borderTop:    `1px solid ${myWin ? 'rgba(93,202,165,0.25)' : 'rgba(226,75,74,0.25)'}`,
          borderRight:  `1px solid ${myWin ? 'rgba(93,202,165,0.25)' : 'rgba(226,75,74,0.25)'}`,
          borderBottom: `1px solid ${myWin ? 'rgba(93,202,165,0.25)' : 'rgba(226,75,74,0.25)'}`,
          borderLeft:   `4px solid ${myWin ? '#5DCAA5' : '#E24B4A'}`,
          display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
        }}>
          <span style={{
            fontSize: 22, fontWeight: 800, letterSpacing: 2,
            color: myWin ? '#5DCAA5' : '#E24B4A',
          }}>
            {myWin ? 'VICTOIRE' : 'DÉFAITE'}
          </span>
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            {queue} · {fmt(detail.gameDuration)} · {timeAgo(detail.gameCreation)} ·
            Patch {detail.gameVersion?.split('.').slice(0, 2).join('.')}
          </span>
        </div>
      )}

      {/* En-tête générique si pas de user reconnu */}
      {!me && (
        <header style={{
          marginBottom: 14, padding: '14px 18px', borderRadius: 10,
          background: bg,
          borderTop: `1px solid ${border}`, borderRight: `1px solid ${border}`,
          borderBottom: `1px solid ${border}`, borderLeft: `1px solid ${border}`,
        }}>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>{queue}</div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
            {fmt(detail.gameDuration)} · {timeAgo(detail.gameCreation)} · Patch {detail.gameVersion?.split('.').slice(0, 2).join('.')}
          </div>
        </header>
      )}

      {/* ── Cartes par rôle (matchups) AU-DESSUS du scoreboard ── */}
      <RoleCards detail={detail} champMap={champMap} version={version} myTeamId={myTeamId} />

      {/* ── Section perso (visible uniquement si on a identifié le user) ── */}
      {me && (
        <PersonalSection
          me={me} detail={detail}
          champMap={champMap} spellMap={spellMap} version={version}
          myRank={myRank}
        />
      )}

      {/* ── Scoreboard des équipes ── */}
      {renderTeam(100, 'ÉQUIPE BLEUE')}
      {renderTeam(200, 'ÉQUIPE ROUGE')}

      {/* ── Toggle "dérouler les détails approfondis" ── */}
      <button
        onClick={() => setDetailsOpen(v => !v)}
        style={{
          marginBottom: 12, width: '100%', padding: '12px 18px',
          borderRadius: 8, fontSize: 12, fontWeight: 700, letterSpacing: 1.5,
          cursor: 'pointer', transition: 'all 120ms',
          background: detailsOpen ? 'rgba(127,119,221,0.15)' : 'rgba(255,255,255,0.03)',
          borderTop:    `1px solid ${border}`,
          borderRight:  `1px solid ${border}`,
          borderBottom: `1px solid ${border}`,
          borderLeft:   `4px solid ${detailsOpen ? '#EF9F27' : '#7F77DD'}`,
          color: detailsOpen ? '#F5F2FA' : 'var(--text-muted)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            transform: detailsOpen ? 'rotate(90deg)' : 'rotate(0deg)',
            transition: 'transform 150ms', fontSize: 10,
          }}>▶</span>
          {detailsOpen ? 'REPLIER LES DÉTAILS APPROFONDIS' : 'DÉROULER LES DÉTAILS APPROFONDIS'}
        </span>
        <span style={{ fontSize: 10, color: 'var(--text-dim)', letterSpacing: 1 }}>
          comparaison · graphiques · heatmap · ward map · diff timestamps
        </span>
      </button>

      {/* ── Tout le reste : visible uniquement si déroulé ── */}
      {detailsOpen && (
        <>
          {/* Comparaison équipes */}
          <div style={{
            marginBottom: 18, padding: '14px 18px', borderRadius: 10, background: bg,
            borderTop: `1px solid ${border}`, borderRight: `1px solid ${border}`,
            borderBottom: `1px solid ${border}`, borderLeft: `1px solid ${border}`,
          }}>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
              Comparaison équipes
            </div>
            <VsBar label="Kills"           blue={blue.kills}  red={red.kills}  highlight={myTeamId} />
            <VsBar label="Or total"        blue={blue.gold}   red={red.gold}   highlight={myTeamId} format={v => `${(v/1000).toFixed(1)}K`} />
            <VsBar label="Dégâts infligés" blue={blue.damage} red={red.damage} highlight={myTeamId} format={v => `${(v/1000).toFixed(1)}K`} />
            <VsBar label="Dégâts subis"    blue={blue.taken}  red={red.taken}  highlight={myTeamId} format={v => `${(v/1000).toFixed(1)}K`} />
            <VsBar label="Vision"          blue={blue.vision} red={red.vision} highlight={myTeamId} />
          </div>

          {/* Diff stats à timestamps clés */}
          {detail.timeline && detail.timeline.length > 1 && (
            <TimestampDiffs detail={detail} />
          )}

          {/* Kill heatmap */}
          {detail.kills && detail.kills.length > 0 && (
            <MapHeatmap detail={detail} mode="kills" champMap={champMap} version={version} />
          )}

          {/* Ward map */}
          {detail.wards && detail.wards.length > 0 && (
            <MapHeatmap detail={detail} mode="wards" champMap={champMap} version={version} />
          )}

          {/* Graphique global multi-métriques (classement) */}
          <MetricChart detail={detail} champMap={champMap} version={version} />

          {/* Graphique sur la durée de la partie */}
          {detail.timeline && detail.timeline.length > 1 && (
            <TimelineChart detail={detail} champMap={champMap} version={version} />
          )}
        </>
      )}
    </div>
  )
}

// ── Barre de comparaison entre les 2 équipes (style horizontal back-to-back) ──
function VsBar({ label, blue, red, highlight, format }: {
  label: string; blue: number; red: number; highlight?: number
  format?: (v: number) => string
}) {
  const total   = blue + red
  const bluePct = total > 0 ? (blue / total) * 100 : 50
  const redPct  = 100 - bluePct
  const fmt     = format ?? ((v: number) => v.toLocaleString('fr-FR'))
  const blueWin = blue >= red

  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', fontSize: 11,
        color: 'var(--text-dim)', marginBottom: 3,
      }}>
        <span style={{ color: blueWin ? '#3A8AC9' : 'var(--text-dim)', fontWeight: highlight === 100 ? 700 : 500 }}>
          {fmt(blue)}
        </span>
        <span style={{ color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1 }}>
          {label}
        </span>
        <span style={{ color: !blueWin ? '#E24B4A' : 'var(--text-dim)', fontWeight: highlight === 200 ? 700 : 500 }}>
          {fmt(red)}
        </span>
      </div>
      <div style={{
        display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden',
        background: 'rgba(255,255,255,0.04)',
      }}>
        <div style={{ width: `${bluePct}%`, background: '#3A8AC9', transition: 'width 300ms' }} />
        <div style={{ width: `${redPct}%`,  background: '#E24B4A', transition: 'width 300ms' }} />
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────────
// Graphique global : barres horizontales pour les 10 joueurs, métrique sélectionnable
// (boutons en haut). Les couleurs reflètent l'équipe (bleu/rouge).
// ────────────────────────────────────────────────────────────────────────────────
// Métriques disponibles dans le graphique de classement.
// Une métrique peut être un champ direct du Participant OU dérivée
// (calcul à la volée — ex: "Dégâts/min" = damageDealt / duration)
type MetricCategory = 'Combat' | 'Économie' | 'Vision' | 'Spécial'
interface Metric {
  key: string
  label: string
  category: MetricCategory
  // Soit `field` direct sur Participant, soit `compute` calculé.
  field?: keyof Participant
  compute?: (p: Participant, durationSec: number, teamKills: number) => number
  format: (v: number) => string
}
const METRICS: Metric[] = [
  // — Combat —
  { key: 'kills',          label: 'Kills',           category: 'Combat',   field: 'kills',          format: v => v.toString() },
  { key: 'deaths',         label: 'Morts',           category: 'Combat',   field: 'deaths',         format: v => v.toString() },
  { key: 'assists',        label: 'Assistances',     category: 'Combat',   field: 'assists',        format: v => v.toString() },
  { key: 'kda',            label: 'Ratio KDA',       category: 'Combat',   compute: (p) => p.deaths === 0 ? p.kills + p.assists : (p.kills + p.assists) / p.deaths, format: v => v.toFixed(2) },
  { key: 'kp',             label: 'KP %',            category: 'Combat',   compute: (p, _, tk) => tk === 0 ? 0 : ((p.kills + p.assists) / tk) * 100, format: v => `${Math.round(v)}%` },
  { key: 'damageDealt',    label: 'Dégâts infligés', category: 'Combat',   field: 'damageDealt',    format: v => `${(v / 1000).toFixed(1)}K` },
  { key: 'damageTaken',    label: 'Dégâts subis',    category: 'Combat',   field: 'damageTaken',    format: v => `${(v / 1000).toFixed(1)}K` },
  { key: 'damageMitigated',label: 'Dégâts esquivés', category: 'Combat',   field: 'damageMitigated',format: v => `${(v / 1000).toFixed(1)}K` },
  { key: 'damageTurrets',  label: 'Dégâts tours',    category: 'Combat',   field: 'damageTurrets',  format: v => `${(v / 1000).toFixed(1)}K` },
  { key: 'damageObjectives',label:'Dégâts objectifs',category: 'Combat',   field: 'damageObjectives',format: v => `${(v / 1000).toFixed(1)}K` },
  { key: 'totalHeal',      label: 'Soins',           category: 'Combat',   field: 'totalHeal',      format: v => `${(v / 1000).toFixed(1)}K` },
  { key: 'healOnTeammates',label: 'Soins alliés',    category: 'Combat',   field: 'healOnTeammates',format: v => `${(v / 1000).toFixed(1)}K` },
  { key: 'timeCcOthers',   label: 'Temps CC',        category: 'Combat',   field: 'timeCcOthers',   format: v => `${v}s` },
  { key: 'dpm',            label: 'Dégâts/min',      category: 'Combat',   compute: (p, d) => d === 0 ? 0 : p.damageDealt / (d / 60), format: v => Math.round(v).toString() },

  // — Économie —
  { key: 'goldEarned',     label: 'Or total',        category: 'Économie', field: 'goldEarned',     format: v => `${(v / 1000).toFixed(1)}K` },
  { key: 'gpm',            label: 'Or/min',          category: 'Économie', compute: (p, d) => d === 0 ? 0 : p.goldEarned / (d / 60), format: v => Math.round(v).toString() },
  { key: 'cs',             label: 'CS',              category: 'Économie', field: 'cs',             format: v => v.toString() },
  { key: 'cspm',           label: 'CS/min',          category: 'Économie', compute: (p, d) => d === 0 ? 0 : p.cs / (d / 60), format: v => v.toFixed(1) },
  { key: 'level',          label: 'Niveau final',    category: 'Économie', field: 'level',          format: v => v.toString() },

  // — Vision —
  { key: 'visionScore',    label: 'Score vision',    category: 'Vision',   field: 'visionScore',    format: v => v.toString() },
  { key: 'wardsPlaced',    label: 'Wards posées',    category: 'Vision',   field: 'wardsPlaced',    format: v => v.toString() },
  { key: 'wardsKilled',    label: 'Wards détruites', category: 'Vision',   field: 'wardsKilled',    format: v => v.toString() },
  { key: 'controlWards',   label: 'Wards contrôle',  category: 'Vision',   field: 'controlWards',   format: v => v.toString() },

  // — Spécial —
  { key: 'longestLife',    label: 'Plus longue vie', category: 'Spécial',  field: 'longestLife',    format: v => `${Math.round(v)}s` },
  { key: 'doubleKills',    label: 'Doublekills',     category: 'Spécial',  field: 'doubleKills',    format: v => v.toString() },
  { key: 'tripleKills',    label: 'Triplekills',     category: 'Spécial',  field: 'tripleKills',    format: v => v.toString() },
]

function MetricChart({ detail, champMap, version }: {
  detail: MatchDetail; champMap: Record<number, ChampInfo>; version: string
}) {
  const [active, setActive] = useState<string>('damageDealt')
  const metric = METRICS.find(m => m.key === active) ?? METRICS[0]

  // Total kills par équipe (pour calcul KP%)
  const teamKills = (id: 100 | 200) =>
    detail.participants.filter(p => p.teamId === id).reduce((s, p) => s + p.kills, 0)
  const blueK = teamKills(100), redK = teamKills(200)
  const totalForKp = (p: Participant) => p.teamId === 100 ? blueK : redK

  // Helper d'extraction de valeur (champ direct ou compute)
  const valueOf = (p: Participant, m: Metric) =>
    m.compute
      ? m.compute(p, detail.gameDuration, totalForKp(p))
      : ((p[m.field as keyof Participant] as number) ?? 0)

  const sorted = [...detail.participants].sort((a, b) => valueOf(b, metric) - valueOf(a, metric))
  const max    = valueOf(sorted[0], metric) || 1

  // Groupes de catégories pour les boutons
  const categories: MetricCategory[] = ['Combat', 'Économie', 'Vision', 'Spécial']

  return (
    <section style={{
      marginTop: 18, padding: '14px 18px', borderRadius: 10,
      background: 'rgba(255,255,255,0.02)',
      borderTop: '1px solid rgba(255,255,255,0.06)', borderRight: '1px solid rgba(255,255,255,0.06)',
      borderBottom: '1px solid rgba(255,255,255,0.06)', borderLeft: '1px solid rgba(255,255,255,0.06)',
    }}>
      <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
        Classement — {metric.label}
      </div>

      {/* Boutons groupés par catégorie */}
      {categories.map(cat => (
        <div key={cat} style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 9, color: 'var(--text-dim)', letterSpacing: 1, marginBottom: 4, textTransform: 'uppercase' }}>
            {cat}
          </div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {METRICS.filter(m => m.category === cat).map(m => {
              const isActive = m.key === active
              return (
                <button key={m.key} onClick={() => setActive(m.key)} style={{
                  padding: '3px 9px', borderRadius: 5, fontSize: 11,
                  cursor: 'pointer', transition: 'all 120ms',
                  background: isActive ? 'rgba(127,119,221,0.22)' : 'rgba(255,255,255,0.03)',
                  border: isActive ? '1px solid #7F77DD' : '1px solid rgba(255,255,255,0.08)',
                  color: isActive ? '#F5F2FA' : 'var(--text-muted)',
                  fontWeight: isActive ? 600 : 400,
                }}>{m.label}</button>
              )
            })}
          </div>
        </div>
      ))}

      {/* Classement des 10 joueurs */}
      <div style={{ marginTop: 12 }}>
        {sorted.map((p, i) => {
          const champ = champMap[p.championId]
          const v     = valueOf(p, metric)
          const pct   = max > 0 ? (v / max) * 100 : 0
          const color = p.teamId === 100 ? '#3A8AC9' : '#E24B4A'
          return (
            <div key={p.puuid} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 12,
            }}>
              <span style={{ width: 22, color: 'var(--text-dim)', fontSize: 11 }}>#{i + 1}</span>
              {champ
                ? <img src={champImg(version, champ.image)} alt="" style={{ width: 22, height: 22, borderRadius: 3 }} />
                : <div style={{ width: 22, height: 22, borderRadius: 3, background: '#222' }} />}
              <span style={{ flex: '0 0 140px', color: '#F5F2FA', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {p.riotIdGameName || p.championName}
              </span>
              <div style={{ flex: 1, height: 8, background: 'rgba(255,255,255,0.04)', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ width: `${pct}%`, height: '100%', background: color, transition: 'width 300ms' }} />
              </div>
              <span style={{ minWidth: 60, textAlign: 'right', color: 'var(--text-muted)', fontSize: 11 }}>
                {metric.format(v)}
              </span>
            </div>
          )
        })}
      </div>
    </section>
  )
}

// ════════════════════════════════════════════════════════════════════════════════
// SECTION PERSO : tout ce qui concerne le joueur connecté
//   - Cartes de stats comparées à la moyenne du match
//   - Graphique de progression personnelle
//   - Build pendant la game (items achetés en timeline)
//   - Ordre de sorts (Q/W/E/R)
//   - Stats des sorts du champion (DDragon)
// ════════════════════════════════════════════════════════════════════════════════

interface ChampionAbility { id: string; name: string; description: string; image: string; cooldown: string; cost: string; range: string }
interface ChampionFull    { passive: { name: string; description: string; image: string }; abilities: ChampionAbility[] }

// Valeurs moyennes par rang LoL — approximations basées sur stats publiques.
// Utilisées pour la comparaison perso vs rang dans la section ci-dessous.
interface RankStats { kda: number; csPerMin: number; gpm: number; visionScore: number; dpm: number; kp: number }
const RANK_AVG: Record<string, RankStats & { label: string; color: string }> = {
  iron:     { label: 'Fer',      color: '#7C5D44', kda: 1.2, csPerMin: 4.0, gpm: 280, visionScore: 18, dpm: 200, kp: 45 },
  bronze:   { label: 'Bronze',   color: '#9E6C3F', kda: 1.5, csPerMin: 4.5, gpm: 310, visionScore: 22, dpm: 240, kp: 48 },
  silver:   { label: 'Argent',   color: '#9CA3AF', kda: 1.8, csPerMin: 5.0, gpm: 340, visionScore: 26, dpm: 280, kp: 50 },
  gold:     { label: 'Or',       color: '#EF9F27', kda: 2.0, csPerMin: 5.8, gpm: 365, visionScore: 28, dpm: 310, kp: 52 },
  platinum: { label: 'Platine',  color: '#5DCAA5', kda: 2.2, csPerMin: 6.5, gpm: 385, visionScore: 32, dpm: 340, kp: 54 },
  emerald:  { label: 'Émeraude', color: '#10B981', kda: 2.3, csPerMin: 7.0, gpm: 395, visionScore: 33, dpm: 360, kp: 55 },
  diamond:  { label: 'Diamant',  color: '#3A8AC9', kda: 2.5, csPerMin: 7.5, gpm: 410, visionScore: 35, dpm: 380, kp: 57 },
  'master+':{ label: 'Maître +', color: '#A855F7', kda: 2.8, csPerMin: 8.0, gpm: 430, visionScore: 38, dpm: 410, kp: 60 },
}

function PersonalSection({ me, detail, champMap, spellMap, version, myRank }: {
  me: Participant; detail: MatchDetail
  champMap: Record<number, ChampInfo>; spellMap: Record<number, SpellInfo>
  version: string
  myRank: string | null
}) {
  const accent = '#7F77DD'
  const gold   = '#EF9F27'
  const border = 'rgba(255,255,255,0.06)'
  const myChamp = champMap[me.championId]

  // Replié par défaut — n'affiche que les cartes de stats. Clic pour révéler progression/build/skills/sorts.
  const [expanded, setExpanded] = useState(false)

  return (
    <div style={{
      marginBottom: 18, padding: '14px 18px', borderRadius: 10,
      background: 'linear-gradient(180deg, rgba(127,119,221,0.06) 0%, rgba(255,255,255,0.02) 100%)',
      borderTop: `1px solid ${accent}55`, borderRight: `1px solid ${border}`,
      borderBottom: `1px solid ${border}`, borderLeft: `4px solid ${accent}`,
    }}>
      <div style={{
        fontSize: 14, fontWeight: 700, letterSpacing: 1.5,
        color: gold, marginBottom: 12,
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        {myChamp && <img src={champImg(version, myChamp.image)} alt=""
          style={{ width: 26, height: 26, borderRadius: 4 }} />}
        <span style={{ flex: 1 }}>
          TES STATS · {me.riotIdGameName}{me.riotIdTagline ? `#${me.riotIdTagline}` : ''}
        </span>
      </div>

      {/* Score perf + Radar GPI + What to improve (en haut, toujours visibles) */}
      <PerformanceOverview me={me} detail={detail} />

      {/* Cartes de stats détaillées */}
      <div style={{ marginTop: 14 }}>
        <PersonalStatsCards me={me} detail={detail} />
      </div>

      {/* Comparaison vs ton rang (si rang renseigné dans le profil) */}
      {myRank && RANK_AVG[myRank] && (
        <div style={{ marginTop: 14 }}>
          <RankComparison me={me} detail={detail} rankKey={myRank} />
        </div>
      )}

      {/* Bouton dérouler / replier */}
      <button
        onClick={() => setExpanded(v => !v)}
        style={{
          marginTop: 12, width: '100%', padding: '8px 12px',
          borderRadius: 6, fontSize: 11, fontWeight: 600, letterSpacing: 1,
          cursor: 'pointer', transition: 'all 120ms',
          background: expanded ? 'rgba(127,119,221,0.15)' : 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(127,119,221,0.3)',
          color: expanded ? '#F5F2FA' : 'var(--text-muted)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        }}
      >
        <span style={{
          display: 'inline-block',
          transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
          transition: 'transform 150ms', fontSize: 9,
        }}>▶</span>
        {expanded
          ? 'REPLIER LES DÉTAILS'
          : 'DÉROULER : PROGRESSION · BUILD · IMPACT ITEMS · SKILL ORDER · SORTS'}
      </button>

      {/* Section dépliable */}
      {expanded && (
        <>
          <div style={{ marginTop: 14 }}>
            <PersonalProgressionChart me={me} detail={detail} />
          </div>

          <div style={{ marginTop: 14 }}>
            <BuildTimeline me={me} detail={detail} version={version} />
          </div>

          <div style={{ marginTop: 14 }}>
            <ItemImpact me={me} detail={detail} version={version} />
          </div>

          <div style={{ marginTop: 14 }}>
            <SkillOrderGrid me={me} />
          </div>

          <div style={{ marginTop: 14 }}>
            <ChampionAbilities me={me} champMap={champMap} version={version} spellMap={spellMap} />
          </div>
        </>
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────────
// PerformanceOverview : score /100 + radar GPI 6 axes + "What to improve".
// Calcule pour chaque axe un score 0-100 normalisé par rapport au max du match
// (le meilleur joueur sur cet axe vaut 100). Le score global est la moyenne des axes.
// ────────────────────────────────────────────────────────────────────────────────
interface AxisDef {
  key: string; label: string; short: string
  desc: string
  // Valeur brute extraite d'un participant (à normaliser ensuite)
  raw: (p: Participant, durationSec: number, teamKills: number, teamDmg: number, teamObjDmg: number) => number
  // Texte de conseil quand le score est faible
  improve: string
}

// ── Axes universels (fallback si rôle inconnu) ──
const GPI_AXES_DEFAULT: AxisDef[] = [
  { key: 'combat',   label: 'Combat',    short: 'CBT', desc: 'Tes dégâts par minute infligés aux champions.',
    raw: (p, d) => d === 0 ? 0 : p.damageDealt / (d / 60),
    improve: 'Augmente tes dégâts par minute : reste actif en team-fights et envoie ton burst au bon timing.' },
  { key: 'survie',   label: 'Survie',    short: 'SUR', desc: 'Capacité à rester en vie (inverse des morts).',
    raw: (p) => 1 / Math.max(p.deaths, 1),
    improve: 'Réduis tes morts : prends moins de risques, ward avant les fights.' },
  { key: 'vision',   label: 'Vision',    short: 'VIS', desc: 'Ton score de vision total (wards posées/détruites).',
    raw: (p) => p.visionScore,
    improve: 'Achète plus de wards de contrôle et ward les objectifs avant qu\'ils ne spawn.' },
  { key: 'economie', label: 'Économie',  short: 'ÉCO', desc: 'Or par minute + CS.',
    raw: (p, d) => d === 0 ? 0 : (p.goldEarned + p.cs * 25) / (d / 60),
    improve: 'Travaille ton last-hit et évite les morts qui te font perdre de l\'or.' },
  { key: 'carry',    label: 'Carry',     short: 'CRY', desc: 'Ta part de dégâts dans le total d\'équipe (%).',
    raw: (p, _, __, teamDmg) => teamDmg === 0 ? 0 : (p.damageDealt / teamDmg) * 100,
    improve: 'Augmente ta part de dégâts d\'équipe : concentre-toi sur les cibles prioritaires.' },
  { key: 'objectifs',label: 'Objectifs', short: 'OBJ', desc: 'Dégâts aux objectifs (drake/baron/tours).',
    raw: (p) => (p.damageObjectives ?? 0) + (p.damageTurrets ?? 0),
    improve: 'Participe plus aux drakes/barons/tours. Push pour exercer une pression sur les objectifs.' },
]

// ── Axes spécifiques au rôle ──
// Chaque rôle a 6 axes pertinents pour ses responsabilités.
const GPI_AXES_BY_ROLE: Record<string, AxisDef[]> = {
  TOP: [
    { key: 'cbt',  label: 'Combat',     short: 'CBT',  desc: 'Tes dégâts par minute infligés aux champions.',
      raw: (p, d) => d === 0 ? 0 : p.damageDealt / (d / 60),
      improve: 'Augmente ton DPM : engage avec ton tank stack ou full burst sur le carry ennemi.' },
    { key: 'tank', label: 'Tank',       short: 'TANK', desc: 'Dégâts subis pour absorber les coups. Crucial pour un top tank/bruiser.',
      raw: (p) => p.damageTaken,
      improve: 'Reste devant l\'équipe en team-fight pour absorber les dégâts. Investis dans des objets de tank.' },
    { key: 'farm', label: 'Farm',       short: 'CS',   desc: 'Ton total de CS. Le top doit farmer hard sa lane.',
      raw: (p) => p.cs,
      improve: 'Améliore ton last-hit. Reste sur ta lane plus longtemps avant de TP en team-fight.' },
    { key: 'solo', label: 'Présence',   short: 'SOLO', desc: 'Kills + assists, reflète ton impact en lane solo et en team-fight.',
      raw: (p) => p.kills + p.assists,
      improve: 'Pression ta lane en solo, et TP/roam aux bons moments pour avoir des kills/assists.' },
    { key: 'obj',  label: 'Objectifs',  short: 'OBJ',  desc: 'Dégâts aux tours et objectifs.',
      raw: (p) => (p.damageObjectives ?? 0) + (p.damageTurrets ?? 0),
      improve: 'Splitpush ta lane et focus les tours dès qu\'elles sont seules.' },
    { key: 'sur',  label: 'Survie',     short: 'SUR',  desc: 'Capacité à rester en vie.',
      raw: (p) => 1 / Math.max(p.deaths, 1),
      improve: 'Évite les ganks : ward la rivière, recule au CD de flash, joue safe quand t\'es behind.' },
  ],
  JUNGLE: [
    { key: 'kp',   label: 'Kill Part.', short: 'KP',   desc: '(Kills + assists) / kills d\'équipe. Le jungler doit être présent partout.',
      raw: (p, _, tk) => tk === 0 ? 0 : ((p.kills + p.assists) / tk) * 100,
      improve: 'Gank plus tes lanes et active-toi aux objectifs. Ta KP devrait être au-dessus de 55%.' },
    { key: 'vis',  label: 'Vision',     short: 'VIS',  desc: 'Score de vision. Crucial : tu vois la map pour ton équipe.',
      raw: (p) => p.visionScore,
      improve: 'Ward le river bushes, scuttle, et les jungles ennemies pour tracker l\'ennemi.' },
    { key: 'obj',  label: 'Objectifs',  short: 'OBJ',  desc: 'Dégâts aux objectifs (drake/baron/héraut). Le jungler est le pilote.',
      raw: (p) => p.damageObjectives ?? 0,
      improve: 'Secure tous les drakes et héraut. Smite est ta responsabilité.' },
    { key: 'ctrl', label: 'Contrôle',   short: 'CTRL', desc: 'Tes assists. Reflète ta présence dans tous les fights.',
      raw: (p) => p.assists,
      improve: 'Sois toujours là pour engage ou peel quand un fight éclate.' },
    { key: 'cbt',  label: 'Combat',     short: 'CBT',  desc: 'Tes dégâts par minute infligés aux champions.',
      raw: (p, d) => d === 0 ? 0 : p.damageDealt / (d / 60),
      improve: 'Investis dans des items de dégâts si tu joues un jungler bruiser/carry.' },
    { key: 'eco',  label: 'Économie',   short: 'ÉCO',  desc: 'Or par minute. Le jungler doit clear sa jungle efficacement.',
      raw: (p, d) => d === 0 ? 0 : p.goldEarned / (d / 60),
      improve: 'Optimise ton clear : pas de mort en early, full clear avec scuttle.' },
  ],
  MIDDLE: [
    { key: 'cbt',  label: 'Combat',     short: 'CBT',  desc: 'Dégâts par minute. Le mid doit être un dommager-clé.',
      raw: (p, d) => d === 0 ? 0 : p.damageDealt / (d / 60),
      improve: 'Reste sur ta lane pour pusher avant d\'avoir tes items. Hit le carry ennemi en team-fight.' },
    { key: 'kp',   label: 'Kill Part.', short: 'KP',   desc: '(Kills+assists) / kills d\'équipe. Le mid roam beaucoup.',
      raw: (p, _, tk) => tk === 0 ? 0 : ((p.kills + p.assists) / tk) * 100,
      improve: 'Roam aux side lanes (TF/Ryze/Galio). Aide ton jungler aux objectifs.' },
    { key: 'cs',   label: 'CS',         short: 'CS',   desc: 'Creep score. Tu dois farmer entre les roams.',
      raw: (p) => p.cs,
      improve: 'Vise 7+ CS/min sur ta lane. Ne reste pas mort à côté du wave.' },
    { key: 'dmg',  label: 'Dégâts',     short: 'DMG',  desc: 'Ta part de dégâts dans le total d\'équipe (%).',
      raw: (p, _, __, teamDmg) => teamDmg === 0 ? 0 : (p.damageDealt / teamDmg) * 100,
      improve: 'Tape les cibles prioritaires. Évite de wast ton burst sur un tank.' },
    { key: 'kill', label: 'Kills',      short: 'KILL', desc: 'Nombre de kills. Le mid est souvent un assassin/burst mage.',
      raw: (p) => p.kills,
      improve: 'Cherche les solo kills sur ta lane et pick les engages au prio target.' },
    { key: 'vis',  label: 'Vision',     short: 'VIS',  desc: 'Score de vision (sweep et ward au mid).',
      raw: (p) => p.visionScore,
      improve: 'Ward les bushes mid et le river quand tu roam. Sweep avant un baron.' },
  ],
  BOTTOM: [
    { key: 'dmg',  label: 'Dégâts',     short: 'DMG',  desc: 'Ta part de dégâts d\'équipe (%). Tu DOIS porter en dommages.',
      raw: (p, _, __, teamDmg) => teamDmg === 0 ? 0 : (p.damageDealt / teamDmg) * 100,
      improve: 'Reste en backline et tape les tanks/carries. Tu es la source #1 de dégâts soutenus.' },
    { key: 'dpm',  label: 'DPM',        short: 'DPM',  desc: 'Dégâts par minute. Constance = victoire pour un ADC.',
      raw: (p, d) => d === 0 ? 0 : p.damageDealt / (d / 60),
      improve: 'Sois actif en team-fight de A à Z. Tape tout le temps.' },
    { key: 'cs',   label: 'CS',         short: 'CS',   desc: 'Creep score. Vise 9+ CS/min sur ta bot lane.',
      raw: (p) => p.cs,
      improve: 'Améliore ton last-hit. Reste en lane plus longtemps avant de roam.' },
    { key: 'gpm',  label: 'Or/min',     short: 'GPM',  desc: 'Or par minute. Te permet d\'avoir tes items vite.',
      raw: (p, d) => d === 0 ? 0 : p.goldEarned / (d / 60),
      improve: 'Évite les morts. Stack les CS et les kills early pour rush ton premier item.' },
    { key: 'kp',   label: 'Kill Part.', short: 'KP',   desc: '(Kills+assists)/kills d\'équipe.',
      raw: (p, _, tk) => tk === 0 ? 0 : ((p.kills + p.assists) / tk) * 100,
      improve: 'Sois présent en team-fight. Pas de splitpush en early/mid game.' },
    { key: 'sur',  label: 'Survie',     short: 'SUR',  desc: 'Capacité à rester en vie. Un ADC mort = 0 dégâts.',
      raw: (p) => 1 / Math.max(p.deaths, 1),
      improve: 'Position-toi bien : reste en backline et ne te fais pas catch.' },
  ],
  UTILITY: [
    { key: 'vis',   label: 'Vision',    short: 'VIS',  desc: 'Score de vision. Ton job #1 c\'est de voir la map.',
      raw: (p) => p.visionScore,
      improve: 'Garde tes wards sur CD. Achète une rose de contrôle dès que tu reviens en base.' },
    { key: 'wards', label: 'Wards',     short: 'WRD',  desc: 'Wards posées + wards détruites. Ton activité de vision.',
      raw: (p) => (p.wardsPlaced ?? 0) + (p.wardsKilled ?? 0),
      improve: 'Sweep les wards ennemies avant un drake/baron.' },
    { key: 'heal',  label: 'Soutien',   short: 'HEAL', desc: 'Soins totaux + soins sur alliés.',
      raw: (p) => (p.totalHeal ?? 0) + (p.healOnTeammates ?? 0),
      improve: 'Reste en range de ton ADC pour le shield/heal en lane.' },
    { key: 'cc',    label: 'CC',        short: 'CC',   desc: 'Temps total de CC infligé aux ennemis (secondes).',
      raw: (p) => p.timeCcOthers ?? 0,
      improve: 'Engage avec ton CC sur les prio targets. Time-le pour ton ADC.' },
    { key: 'asst',  label: 'Assists',   short: 'ASST', desc: 'Nombre d\'assists. Le support participe à tous les fights.',
      raw: (p) => p.assists,
      improve: 'Roam et aide ton jungler aux objectifs. Sois présent en team-fight.' },
    { key: 'tank',  label: 'Tank',      short: 'TANK', desc: 'Dégâts subis. Tu encaisses pour ton ADC.',
      raw: (p) => p.damageTaken,
      improve: 'Peel pour ton ADC : interpose-toi entre lui et la menace.' },
  ],
}

// Helper : retourne les 6 axes adaptés au rôle (fallback : universels)
function getAxesForRole(role?: string): AxisDef[] {
  if (role && GPI_AXES_BY_ROLE[role]) return GPI_AXES_BY_ROLE[role]
  return GPI_AXES_DEFAULT
}

function PerformanceOverview({ me, detail }: { me: Participant; detail: MatchDetail }) {
  const dur = detail.gameDuration

  // 6 axes adaptés au rôle du joueur (TOP/JGL/MID/ADC/SUP) — fallback universel sinon
  const AXES = useMemo(() => getAxesForRole(me.teamPosition), [me.teamPosition])
  const roleLabel = POS[me.teamPosition] || '—'

  // Sommes équipe pour les ratios
  const myTeam = detail.participants.filter(p => p.teamId === me.teamId)
  const teamKills = myTeam.reduce((s, p) => s + p.kills, 0)
  const teamDmg   = myTeam.reduce((s, p) => s + p.damageDealt, 0)
  const teamObjDmg= myTeam.reduce((s, p) => s + (p.damageObjectives ?? 0), 0)
  void teamKills; void teamDmg; void teamObjDmg

  // Calculer la valeur brute par axe pour chaque joueur (normalisation vs max du match)
  const rawAll = detail.participants.map(p => {
    const tk  = detail.participants.filter(q => q.teamId === p.teamId).reduce((s, q) => s + q.kills, 0)
    const td  = detail.participants.filter(q => q.teamId === p.teamId).reduce((s, q) => s + q.damageDealt, 0)
    const tod = detail.participants.filter(q => q.teamId === p.teamId).reduce((s, q) => s + (q.damageObjectives ?? 0), 0)
    return Object.fromEntries(AXES.map(a => [a.key, a.raw(p, dur, tk, td, tod)])) as Record<string, number>
  })

  // Max par axe (pour normaliser à 100)
  const maxByAxis = Object.fromEntries(
    AXES.map(a => [a.key, Math.max(...rawAll.map(r => r[a.key]), 1)]),
  ) as Record<string, number>

  // Mes scores normalisés (0-100)
  const myIdx     = detail.participants.findIndex(p => p.puuid === me.puuid)
  const myRaw     = rawAll[myIdx]
  const myScores  = Object.fromEntries(
    AXES.map(a => [a.key, Math.round((myRaw[a.key] / maxByAxis[a.key]) * 100)]),
  ) as Record<string, number>

  // Score global = moyenne des 6 axes
  const overall = Math.round(
    AXES.reduce((s, a) => s + myScores[a.key], 0) / AXES.length,
  )

  // Note alphabétique
  const grade =
    overall >= 90 ? 'S+' : overall >= 80 ? 'S' :
    overall >= 70 ? 'A' : overall >= 60 ? 'B' :
    overall >= 50 ? 'C' : overall >= 40 ? 'D' : 'E'
  const gradeColor =
    overall >= 80 ? '#EF9F27' :
    overall >= 60 ? '#5DCAA5' :
    overall >= 40 ? '#A1A1AA' : '#E24B4A'

  // 2 axes les plus faibles → "What to improve"
  const weakest = [...AXES]
    .map(a => ({ axis: a, score: myScores[a.key] }))
    .sort((a, b) => a.score - b.score)
    .slice(0, 2)

  // Géométrie du radar (hexagone)
  const W = 220, H = 220, CX = W / 2, CY = H / 2, R = 85
  const pointFor = (idx: number, value: number) => {
    // 6 axes répartis sur 360°, -90° en haut
    const angle = (-Math.PI / 2) + (idx / AXES.length) * 2 * Math.PI
    const dist  = (value / 100) * R
    return { x: CX + Math.cos(angle) * dist, y: CY + Math.sin(angle) * dist }
  }
  const labelFor = (idx: number) => {
    const angle = (-Math.PI / 2) + (idx / AXES.length) * 2 * Math.PI
    return { x: CX + Math.cos(angle) * (R + 14), y: CY + Math.sin(angle) * (R + 14) }
  }
  const myPolygon = AXES.map((a, i) => pointFor(i, myScores[a.key]))
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ') + ' Z'

  return (
    <div style={{
      display: 'grid', gap: 14,
      gridTemplateColumns: 'minmax(180px, 250px) 1fr',
      alignItems: 'stretch',
    }}>
      {/* Colonne gauche : score + improve */}
      <div>
        {/* Score circle */}
        <div style={{
          padding: '14px 16px', borderRadius: 8,
          background: 'rgba(0,0,0,0.25)',
          border: `1px solid ${gradeColor}55`,
          textAlign: 'center',
        }}>
          <div style={{ fontSize: 10, color: 'var(--text-dim)', letterSpacing: 2, marginBottom: 4 }}>
            SCORE {roleLabel !== '—' && <span style={{ color: '#EF9F27' }}>{roleLabel}</span>}
          </div>
          <div style={{
            fontSize: 44, fontWeight: 900, color: gradeColor, lineHeight: 1,
          }}>
            {overall}
            <span style={{ fontSize: 16, color: 'var(--text-dim)', fontWeight: 400 }}>/100</span>
          </div>
          <div style={{
            display: 'inline-block', marginTop: 6, padding: '2px 10px',
            borderRadius: 4, background: gradeColor, color: '#1a0d2e',
            fontSize: 14, fontWeight: 800, letterSpacing: 2,
          }}>
            {grade}
          </div>
        </div>

        {/* What to improve */}
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 10, color: 'var(--text-dim)', letterSpacing: 1.5, marginBottom: 6, textTransform: 'uppercase' }}>
            À améliorer
          </div>
          {weakest.map((w, i) => (
            <div key={i} style={{
              padding: '6px 10px', marginBottom: 4, borderRadius: 6,
              background: 'rgba(226,75,74,0.08)',
              borderLeft: '3px solid #E24B4A',
              fontSize: 11, lineHeight: 1.4,
            }}>
              <span style={{ color: '#E24B4A', fontWeight: 700 }}>{w.axis.label}</span>
              <span style={{ color: 'var(--text-dim)', marginLeft: 6 }}>· {w.score}/100</span>
              <div style={{ color: 'var(--text-muted)', marginTop: 2 }}>
                {w.axis.improve}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Colonne droite : radar SVG + labels HTML overlay (pour les tooltips stylés) */}
      <div style={{
        padding: 12, borderRadius: 8,
        background: 'rgba(0,0,0,0.25)',
        border: '1px solid rgba(255,255,255,0.06)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        overflow: 'visible',
      }}>
        <div style={{ position: 'relative', width: '100%', maxWidth: 280 }}>
          <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
            {/* Grilles concentriques (4 paliers) */}
            {[0.25, 0.5, 0.75, 1].map(scale => {
              const pts = AXES.map((_, i) => pointFor(i, scale * 100))
              const d   = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ') + ' Z'
              return <path key={scale} d={d}
                fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
            })}
            {/* Axes (lignes du centre vers chaque sommet) */}
            {AXES.map((_, i) => {
              const p = pointFor(i, 100)
              return <line key={i} x1={CX} y1={CY} x2={p.x} y2={p.y}
                stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
            })}
            {/* Polygone du joueur */}
            <path d={myPolygon} fill={`${gradeColor}30`} stroke={gradeColor} strokeWidth="2"
              strokeLinejoin="round" />
            {/* Points sur chaque sommet */}
            {AXES.map((a, i) => {
              const p = pointFor(i, myScores[a.key])
              return <circle key={i} cx={p.x} cy={p.y} r="3.5" fill={gradeColor} stroke="#0a0612" strokeWidth="1" />
            })}
            {/* Scores aux sommets (en SVG car ancrés au polygone, pas au label externe) */}
            {AXES.map((a, i) => {
              const p = pointFor(i, myScores[a.key])
              const angle = (-Math.PI / 2) + (i / AXES.length) * 2 * Math.PI
              const offX = Math.cos(angle) * 12
              const offY = Math.sin(angle) * 12
              return (
                <text key={i} x={p.x + offX} y={p.y + offY} textAnchor="middle" dominantBaseline="middle"
                  fill={gradeColor} fontSize="9" fontWeight="700">
                  {myScores[a.key]}
                </text>
              )
            })}
          </svg>

          {/* Labels des axes en HTML overlay (pour tooltip stylé au hover) */}
          {AXES.map((a, i) => {
            const l = labelFor(i)
            return (
              <RadarAxisLabel
                key={i}
                axis={a}
                color={gradeColor}
                leftPct={(l.x / W) * 100}
                topPct={(l.y / H) * 100}
              />
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── Label HTML d'un axe du radar (positionné en % sur l'overlay) ──
// Affiche l'acronyme (CBT, SUR, …). Au hover, tooltip stylée avec :
// nom complet de l'axe + description de ce qu'il mesure.
function RadarAxisLabel({ axis, color, leftPct, topPct }: {
  axis: AxisDef; color: string
  leftPct: number; topPct: number
}) {
  const [hover, setHover] = useState(false)
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: 'absolute',
        left: `${leftPct}%`, top: `${topPct}%`,
        transform: 'translate(-50%, -50%)',
        fontSize: 10, fontWeight: 700, color: '#F5F2FA',
        cursor: 'help', zIndex: hover ? 20 : 5,
        whiteSpace: 'nowrap',
        userSelect: 'none',
      }}
    >
      {axis.short}
      {hover && (
        <div role="tooltip" style={{
          position: 'absolute',
          top: 'calc(100% + 6px)', left: '50%', transform: 'translateX(-50%)',
          width: 'max-content', maxWidth: 240,
          padding: '8px 10px', borderRadius: 6,
          background: 'rgba(8,5,18,0.97)',
          border: `1px solid ${color}aa`,
          color: '#F5F2FA', fontSize: 11, fontWeight: 400,
          lineHeight: 1.45, textAlign: 'left', letterSpacing: 0,
          whiteSpace: 'normal',
          boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
          pointerEvents: 'none',
        }}>
          <strong style={{ color, fontSize: 11 }}>{axis.label}</strong>
          <div style={{ color: 'var(--text-muted)', marginTop: 3 }}>{axis.desc}</div>
        </div>
      )}
    </div>
  )
}

// ── Comparaison vs valeurs moyennes du rang du joueur ──
function RankComparison({ me, detail, rankKey }: {
  me: Participant; detail: MatchDetail; rankKey: string
}) {
  const rank = RANK_AVG[rankKey]
  if (!rank) return null

  const dur = detail.gameDuration
  const teamKills = detail.participants.filter(p => p.teamId === me.teamId).reduce((s, p) => s + p.kills, 0)

  const myKda = me.deaths === 0 ? me.kills + me.assists : (me.kills + me.assists) / me.deaths
  const myDpm = dur === 0 ? 0 : me.damageDealt / (dur / 60)
  const myGpm = dur === 0 ? 0 : me.goldEarned / (dur / 60)
  const myCspm = dur === 0 ? 0 : me.cs / (dur / 60)
  const myKp = teamKills === 0 ? 0 : ((me.kills + me.assists) / teamKills) * 100

  const stats: { label: string; mine: number; avg: number; format: (v: number) => string }[] = [
    { label: 'KDA',         mine: myKda,         avg: rank.kda,         format: v => v.toFixed(2) },
    { label: 'KP %',        mine: myKp,          avg: rank.kp,          format: v => `${Math.round(v)}%` },
    { label: 'Dégâts/min',  mine: myDpm,         avg: rank.dpm,         format: v => Math.round(v).toString() },
    { label: 'Or/min',      mine: myGpm,         avg: rank.gpm,         format: v => Math.round(v).toString() },
    { label: 'CS/min',      mine: myCspm,        avg: rank.csPerMin,    format: v => v.toFixed(1) },
    { label: 'Score vision',mine: me.visionScore, avg: rank.visionScore, format: v => Math.round(v).toString() },
  ]

  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
        Vs moyenne <span style={{ color: rank.color, fontWeight: 700 }}>{rank.label}</span>
        <span style={{ color: 'var(--text-muted)', marginLeft: 6, textTransform: 'none', letterSpacing: 0, fontSize: 10 }}>
          (basée sur les stats publiques de la communauté)
        </span>
      </div>
      <div style={{
        display: 'grid', gap: 8,
        gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
      }}>
        {stats.map(s => {
          const diff   = s.avg === 0 ? 0 : ((s.mine - s.avg) / s.avg) * 100
          const better = s.mine >= s.avg
          const color  = Math.abs(diff) < 5 ? '#A1A1AA' : better ? '#5DCAA5' : '#E24B4A'
          return (
            <div key={s.label} style={{
              padding: '10px 12px', borderRadius: 6,
              background: 'rgba(0,0,0,0.2)',
              borderTop: '1px solid rgba(255,255,255,0.04)',
              borderRight: '1px solid rgba(255,255,255,0.04)',
              borderBottom: '1px solid rgba(255,255,255,0.04)',
              borderLeft: `2px solid ${color}`,
            }}>
              <div style={{ fontSize: 9, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
                {s.label}
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span style={{ fontSize: 18, fontWeight: 700, color: '#F5F2FA' }}>
                  {s.format(s.mine)}
                </span>
                <span style={{ fontSize: 10, color }}>
                  {diff >= 0 ? '+' : ''}{diff.toFixed(0)}%
                </span>
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 2 }}>
                {rank.label} : {s.format(s.avg)}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Cartes de stats : ma valeur vs moyenne du match ──
function PersonalStatsCards({ me, detail }: { me: Participant; detail: MatchDetail }) {
  const dur = detail.gameDuration
  const teamKills = detail.participants.filter(p => p.teamId === me.teamId).reduce((s, p) => s + p.kills, 0)
  const myKp = teamKills > 0 ? ((me.kills + me.assists) / teamKills) * 100 : 0
  const myKda = me.deaths === 0 ? me.kills + me.assists : (me.kills + me.assists) / me.deaths

  // Moyenne du match (les 10 joueurs)
  const avg = (fn: (p: Participant) => number) =>
    detail.participants.reduce((s, p) => s + fn(p), 0) / detail.participants.length

  const stats: { label: string; me: number; avg: number; format: (v: number) => string; betterIfHigher?: boolean }[] = [
    { label: 'Ratio KDA',     me: myKda,                 avg: avg(p => p.deaths === 0 ? p.kills + p.assists : (p.kills + p.assists) / p.deaths), format: v => v.toFixed(2), betterIfHigher: true },
    { label: 'KP %',          me: myKp,                  avg: avg(p => {
      const tk = detail.participants.filter(q => q.teamId === p.teamId).reduce((s, q) => s + q.kills, 0)
      return tk === 0 ? 0 : ((p.kills + p.assists) / tk) * 100
    }), format: v => `${Math.round(v)}%`, betterIfHigher: true },
    { label: 'Dégâts/min',    me: dur === 0 ? 0 : me.damageDealt / (dur / 60), avg: avg(p => dur === 0 ? 0 : p.damageDealt / (dur / 60)), format: v => Math.round(v).toString(), betterIfHigher: true },
    { label: 'Or/min',        me: dur === 0 ? 0 : me.goldEarned / (dur / 60), avg: avg(p => dur === 0 ? 0 : p.goldEarned / (dur / 60)), format: v => Math.round(v).toString(), betterIfHigher: true },
    { label: 'CS/min',        me: dur === 0 ? 0 : me.cs / (dur / 60), avg: avg(p => dur === 0 ? 0 : p.cs / (dur / 60)), format: v => v.toFixed(1), betterIfHigher: true },
    { label: 'Score vision',  me: me.visionScore,        avg: avg(p => p.visionScore), format: v => Math.round(v).toString(), betterIfHigher: true },
    { label: 'Dégâts subis',  me: me.damageTaken,        avg: avg(p => p.damageTaken), format: v => `${(v/1000).toFixed(1)}K`, betterIfHigher: true },
    { label: 'Wards posées',  me: me.wardsPlaced,        avg: avg(p => p.wardsPlaced), format: v => Math.round(v).toString(), betterIfHigher: true },
  ]

  return (
    <div style={{
      display: 'grid', gap: 8,
      gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
    }}>
      {stats.map(s => {
        const diff    = s.avg === 0 ? 0 : ((s.me - s.avg) / s.avg) * 100
        const better  = (s.betterIfHigher ?? true) ? s.me >= s.avg : s.me <= s.avg
        const color   = Math.abs(diff) < 5 ? '#A1A1AA' : (better ? '#5DCAA5' : '#E24B4A')
        return (
          <div key={s.label} style={{
            padding: '10px 12px', borderRadius: 6,
            background: 'rgba(0,0,0,0.2)',
            borderTop: '1px solid rgba(255,255,255,0.04)',
            borderRight: '1px solid rgba(255,255,255,0.04)',
            borderBottom: '1px solid rgba(255,255,255,0.04)',
            borderLeft: `2px solid ${color}`,
          }}>
            <div style={{ fontSize: 9, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
              {s.label}
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <span style={{ fontSize: 18, fontWeight: 700, color: '#F5F2FA' }}>
                {s.format(s.me)}
              </span>
              <span style={{ fontSize: 10, color }}>
                {diff >= 0 ? '+' : ''}{diff.toFixed(0)}%
              </span>
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 2 }}>
              moy. {s.format(s.avg)}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Graphique de progression personnelle (mes valeurs sur la durée) ──
type PersoMode = 'gold' | 'xp' | 'level' | 'cs'
const PERSO_MODES: { key: PersoMode; label: string }[] = [
  { key: 'gold',  label: 'Mon or' },
  { key: 'xp',    label: 'Mon XP' },
  { key: 'level', label: 'Mon niveau' },
  { key: 'cs',    label: 'Mon CS' },
]

function PersonalProgressionChart({ me, detail }: { me: Participant; detail: MatchDetail }) {
  const [mode, setMode] = useState<PersoMode>('gold')
  const frames = detail.timeline ?? []
  if (frames.length === 0) {
    return <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>Données timeline non disponibles.</div>
  }

  // Trouver mon index dans participants[]
  const myIdx = detail.participants.findIndex(p => p.puuid === me.puuid)
  if (myIdx < 0) return null

  // Géométrie
  const W = 800, H = 200
  const PADL = 50, PADR = 18, PADT = 10, PADB = 26
  const innerW = W - PADL - PADR
  const innerH = H - PADT - PADB
  const lastTs = frames[frames.length - 1].ts

  // Valeurs selon le mode
  const myValues: number[] = frames.map(f => {
    if (mode === 'gold')  return f.playerGold[myIdx] ?? 0
    if (mode === 'level') return f.playerLevel[myIdx] ?? 1
    // XP et CS ne sont pas exposés par joueur ; on prend le total équipe / 5 comme approximation visuelle
    if (mode === 'xp')    return (f.teamXp[me.teamId === 100 ? 0 : 1] ?? 0) / 5
    if (mode === 'cs')    return (f.teamCs[me.teamId === 100 ? 0 : 1] ?? 0) / 5
    return 0
  })

  // Moyenne de l'équipe (hors moi) pour comparer
  const teamAvgValues: number[] = frames.map(f => {
    const teammates = detail.participants
      .map((p, i) => ({ p, i }))
      .filter(x => x.p.teamId === me.teamId && x.i !== myIdx)
    if (teammates.length === 0) return 0
    if (mode === 'gold')  return teammates.reduce((s, x) => s + (f.playerGold[x.i] ?? 0), 0) / teammates.length
    if (mode === 'level') return teammates.reduce((s, x) => s + (f.playerLevel[x.i] ?? 1), 0) / teammates.length
    if (mode === 'xp')    return (f.teamXp[me.teamId === 100 ? 0 : 1] ?? 0) / 5
    if (mode === 'cs')    return (f.teamCs[me.teamId === 100 ? 0 : 1] ?? 0) / 5
    return 0
  })

  const allValues = [...myValues, ...teamAvgValues]
  const minV = Math.min(...allValues, 0)
  const maxV = Math.max(...allValues, 1)
  const range = maxV - minV || 1
  const yForValue = (v: number) => PADT + innerH - ((v - minV) / range) * innerH
  const xForIndex = (i: number) => PADL + (frames[i].ts / lastTs) * innerW
  const pathFor = (vals: number[]) =>
    vals.map((v, i) => `${i === 0 ? 'M' : 'L'} ${xForIndex(i).toFixed(1)} ${yForValue(v).toFixed(1)}`).join(' ')

  const fmt = (v: number) => {
    if (mode === 'gold' || mode === 'xp') return `${(v / 1000).toFixed(1)}K`
    if (mode === 'level') return Math.round(v).toString()
    return Math.round(v).toString()
  }

  // Graduations X
  const totalMin = Math.ceil(lastTs / 60000)
  const xTicks: number[] = []
  for (let m = 0; m <= totalMin; m += 5) xTicks.push(m)

  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
        Ma progression dans la partie
      </div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
        {PERSO_MODES.map(m => {
          const isActive = m.key === mode
          return (
            <button key={m.key} onClick={() => setMode(m.key)} style={{
              padding: '3px 9px', borderRadius: 5, fontSize: 11,
              cursor: 'pointer', transition: 'all 120ms',
              background: isActive ? 'rgba(127,119,221,0.22)' : 'rgba(255,255,255,0.03)',
              border: isActive ? '1px solid #7F77DD' : '1px solid rgba(255,255,255,0.08)',
              color: isActive ? '#F5F2FA' : 'var(--text-muted)',
              fontWeight: isActive ? 600 : 400,
            }}>{m.label}</button>
          )
        })}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
        style={{ width: '100%', height: 200, display: 'block' }}>
        {/* Grille */}
        {[0.25, 0.5, 0.75].map(p => (
          <line key={p}
            x1={PADL} y1={PADT + innerH * p}
            x2={W - 18} y2={PADT + innerH * p}
            stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
        ))}
        {/* Moyenne équipe (gris pointillé) */}
        <path d={pathFor(teamAvgValues)} fill="none" stroke="rgba(161,161,170,0.5)"
          strokeWidth="1.5" strokeDasharray="4,3" />
        {/* Mes valeurs (or, plein) */}
        <path d={pathFor(myValues)} fill="none" stroke="#EF9F27" strokeWidth="2.5" strokeLinecap="round" />

        {/* Graduations X */}
        {xTicks.map(min => {
          const x = PADL + (min * 60000 / lastTs) * innerW
          if (x > W - 18) return null
          return (
            <g key={min}>
              <line x1={x} y1={PADT + innerH} x2={x} y2={PADT + innerH + 3} stroke="rgba(255,255,255,0.2)" />
              <text x={x} y={PADT + innerH + 14} textAnchor="middle" fill="var(--text-dim)" fontSize="10">{min}m</text>
            </g>
          )
        })}
        {/* Graduations Y */}
        {[0, 0.5, 1].map(p => {
          const v = minV + range * (1 - p)
          return (
            <text key={p} x={PADL - 6} y={PADT + innerH * p + 3}
              textAnchor="end" fill="var(--text-dim)" fontSize="10">{fmt(v)}</text>
          )
        })}
      </svg>
      <div style={{ fontSize: 10, color: 'var(--text-dim)', textAlign: 'right', marginTop: 4 }}>
        <span style={{ color: '#EF9F27', fontWeight: 600 }}>━ Moi</span>{' · '}
        <span>┄ Moyenne équipe</span>
      </div>
    </div>
  )
}

// ── Build pendant la partie : timeline d'items achetés ──
function BuildTimeline({ me, detail, version }: {
  me: Participant; detail: MatchDetail; version: string
}) {
  const events = me.itemEvents ?? []
  if (events.length === 0) {
    return (
      <div>
        <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
          Mon build dans la partie
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
          Données build non disponibles.
        </div>
      </div>
    )
  }

  // Filtrer pour ne garder que les achats nets (PURCHASED moins UNDONE consécutifs)
  // et ignorer les SOLD pour la lisibilité
  const cleaned: ItemEvent[] = []
  events.forEach(ev => {
    if (ev.type === 'UNDONE') {
      // Annuler le dernier PURCHASED de même itemId
      for (let i = cleaned.length - 1; i >= 0; i--) {
        if (cleaned[i].type === 'PURCHASED' && cleaned[i].itemId === ev.itemId) {
          cleaned.splice(i, 1); break
        }
      }
    } else if (ev.type === 'PURCHASED') {
      cleaned.push(ev)
    }
  })

  // Grouper en "trips" : achats < 30s d'écart
  const trips: ItemEvent[][] = []
  cleaned.forEach(ev => {
    const last = trips[trips.length - 1]
    if (last && ev.ts - last[last.length - 1].ts < 30000) last.push(ev)
    else trips.push([ev])
  })

  const fmtTs = (ts: number) => {
    const m = Math.floor(ts / 60000)
    const s = Math.floor((ts / 1000) % 60).toString().padStart(2, '0')
    return `${m}:${s}`
  }

  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
        Mon build dans la partie ({cleaned.length} achats)
      </div>
      <div style={{
        display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap',
        padding: 10, borderRadius: 6, background: 'rgba(0,0,0,0.2)',
      }}>
        {trips.map((trip, ti) => (
          <div key={ti} style={{
            display: 'flex', alignItems: 'center', gap: 4,
            padding: '4px 8px', borderRadius: 4,
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.05)',
          }}>
            <span style={{ fontSize: 9, color: 'var(--text-dim)', marginRight: 2 }}>
              {fmtTs(trip[0].ts)}
            </span>
            {trip.map((ev, i) => (
              <img key={i} src={itemImg(version, ev.itemId)} alt=""
                title={`${ev.itemId} @ ${fmtTs(ev.ts)}`}
                style={{ width: 28, height: 28, borderRadius: 3 }}
                onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Impact d'items : deux vues complémentaires ──

const STAT_LABELS: Partial<Record<string, string>> = {
  abilityPower: 'PA', attackDamage: 'AD', armor: 'Armure', magicResistance: 'RM',
  health: 'PV', abilityHaste: 'Hâte', lethality: 'Létalité',
  criticalStrikeChance: 'Crit', omnivamp: 'Omnivamp',
  attackSpeed: 'Vit. att.', movespeed: 'Vit. mvt',
}
const STAT_TO_PLAYER: Partial<Record<string, keyof PlayerFrameStats>> = {
  abilityPower: 'ap', attackDamage: 'ad', armor: 'armor', magicResistance: 'mr',
  health: 'hpMax', abilityHaste: 'haste', attackSpeed: 'attackSpeed',
  movespeed: 'moveSpeed', omnivamp: 'omnivamp',
}
function fmtStatValue(key: string, v: number): string {
  if (key === 'criticalStrikeChance') return v < 1 ? `+${Math.round(v * 100)}%` : `+${Math.round(v)}%`
  if (key === 'omnivamp' || key === 'attackSpeed') return `+${Math.round(v)}%`
  return `+${Math.round(v)}`
}
type MerakiStatMap = Partial<Record<string, number>>
type MerakiItemsResponse = {
  stats: Record<string, MerakiStatMap>; outdated: boolean
  ddPatch: string; merakiPatch: string; error?: boolean
}

function ItemImpact({ me, detail, version }: {
  me: Participant; detail: MatchDetail; version: string
}) {
  const [view,         setView]         = useState<'timeline' | 'importance' | 'window'>('timeline')
  const [metric,       setMetric]       = useState<string>('gold')
  const [itemData,     setItemData]     = useState<Record<string, { name: string; gold: { total: number }; tags?: string[]; into?: string[] }>>({})
  const [itemLoaded,   setItemLoaded]   = useState(false)
  const [merakiData,   setMerakiData]   = useState<MerakiItemsResponse | null>(null)
  const [merakiLoaded, setMerakiLoaded] = useState(false)

  useEffect(() => {
    if (!version || itemLoaded) return
    fetch(`${DDN}/cdn/${version}/data/fr_FR/item.json`)
      .then(r => r.json())
      .then(j => { setItemData(j.data ?? {}); setItemLoaded(true) })
      .catch(() => setItemLoaded(true))
  }, [version, itemLoaded])

  useEffect(() => {
    if (merakiLoaded) return
    fetch('/api/external/items')
      .then(r => r.json())
      .then((j: MerakiItemsResponse) => { setMerakiData(j); setMerakiLoaded(true) })
      .catch(() => setMerakiLoaded(true))
  }, [merakiLoaded])

  const frames = detail.timeline ?? []
  const myIdx  = detail.participants.findIndex(p => p.puuid === me.puuid)

  // Vue 1 enrichie : playerStats présents (cache v2) + match classé
  const hasPlayerStats = frames.some(f => f.playerStats && f.playerStats.length > 0)
  const isRanked       = detail.queueId === 420 || detail.queueId === 440
  const showVue1       = hasPlayerStats && isRanked

  // Achats nets (PURCHASED − UNDONE) — même logique que BuildTimeline
  const cleanedPurchases: ItemEvent[] = []
  ;(me.itemEvents ?? []).forEach(ev => {
    if (ev.type === 'UNDONE') {
      for (let i = cleanedPurchases.length - 1; i >= 0; i--) {
        if (cleanedPurchases[i].type === 'PURCHASED' && cleanedPurchases[i].itemId === ev.itemId) {
          cleanedPurchases.splice(i, 1); break
        }
      }
    } else if (ev.type === 'PURCHASED') {
      cleanedPurchases.push(ev)
    }
  })

  // ── VUE 1 : Timeline SVG ──
  function TimelineView() {
    if (frames.length === 0 || myIdx < 0) {
      return <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>Données timeline non disponibles.</div>
    }

    type MetricDef = { key: string; label: string; color: string; getValue: (f: TimelineFrame) => number }
    const METRICS: MetricDef[] = [
      { key: 'gold',  label: 'Or',          color: '#EF9F27', getValue: f => f.playerGold[myIdx] ?? 0 },
      ...(showVue1 ? [
        { key: 'ap',    label: 'PA',          color: '#7F77DD', getValue: (f: TimelineFrame) => f.playerStats?.[myIdx]?.ap ?? 0 },
        { key: 'ad',    label: 'AD',          color: '#E24B4A', getValue: (f: TimelineFrame) => f.playerStats?.[myIdx]?.ad ?? 0 },
        { key: 'armor', label: 'Armure',      color: '#5DCAA5', getValue: (f: TimelineFrame) => f.playerStats?.[myIdx]?.armor ?? 0 },
        { key: 'mr',    label: 'RM',          color: '#3A8AC9', getValue: (f: TimelineFrame) => f.playerStats?.[myIdx]?.mr ?? 0 },
        { key: 'hpMax', label: 'PV max',      color: '#BA7517', getValue: (f: TimelineFrame) => f.playerStats?.[myIdx]?.hpMax ?? 0 },
        { key: 'haste', label: 'Hâte',        color: '#A8A3E8', getValue: (f: TimelineFrame) => f.playerStats?.[myIdx]?.haste ?? 0 },
        { key: 'dmg',   label: 'Dégâts champs', color: '#E24B4A', getValue: (f: TimelineFrame) => f.playerStats?.[myIdx]?.dmgChampions ?? 0 },
      ] as MetricDef[] : []),
    ]

    const sel    = METRICS.find(m => m.key === metric) ?? METRICS[0]
    const values = frames.map(f => sel.getValue(f))
    const maxVal = Math.max(...values, 1)

    const W = 800, H = 220, PADL = 54, PADR = 18, PADT = 32, PADB = 26
    const innerW = W - PADL - PADR
    const innerH = H - PADT - PADB
    const lastTs  = frames[frames.length - 1].ts || 1
    const xForTs  = (ts: number) => PADL + (ts / lastTs) * innerW
    const xForIdx = (i: number)  => PADL + (frames[i].ts / lastTs) * innerW
    const yFor    = (v: number)  => PADT + innerH - (v / maxVal) * innerH
    const path    = values.map((v, i) => `${i === 0 ? 'M' : 'L'} ${xForIdx(i).toFixed(1)} ${yFor(v).toFixed(1)}`).join(' ')

    const totalMin = Math.ceil(lastTs / 60000)
    const xTicks: number[] = []
    for (let m = 0; m <= totalMin; m += 5) xTicks.push(m)

    type PurchaseGroup = { ts: number; items: number[] }
    const groups: PurchaseGroup[] = []
    cleanedPurchases.forEach(ev => {
      const last = groups[groups.length - 1]
      if (last && ev.ts - last.ts < 5000) last.items.push(ev.itemId)
      else groups.push({ ts: ev.ts, items: [ev.itemId] })
    })
    const ICON = 22, ICON_GAP = 2

    const isCorrelation = metric === 'gold' || metric === 'dmg'
    const fmtY = (v: number) =>
      metric === 'gold' ? `${(v / 1000).toFixed(1)}K`
      : (v >= 1000 ? `${(v / 1000).toFixed(1)}K` : String(Math.round(v)))

    return (
      <div>
        <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', marginBottom: 8 }}>
          {METRICS.map(m => {
            const active = metric === m.key
            return (
              <button key={m.key} onClick={() => setMetric(m.key)} style={{
                padding: '2px 8px', borderRadius: 4, fontSize: 10, cursor: 'pointer',
                background: active ? 'rgba(127,119,221,0.18)' : 'rgba(255,255,255,0.03)',
                border: active ? `1px solid ${m.color}` : '1px solid rgba(255,255,255,0.08)',
                color: active ? m.color : 'var(--text-muted)', fontWeight: active ? 600 : 400,
                transition: 'all 100ms',
              }}>{m.label}</button>
            )
          })}
        </div>
        {!showVue1 && (
          <div style={{ fontSize: 10, color: 'var(--text-dim)', fontStyle: 'italic', marginBottom: 6 }}>
            Courbes PA/AD/Armure/RM/PV max disponibles pour les matchs classés consultés après le dernier déploiement.
          </div>
        )}
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
          style={{ width: '100%', height: 220, display: 'block', overflow: 'visible' }}>
          {[0.25, 0.5, 0.75].map(p => (
            <line key={p} x1={PADL} y1={PADT + innerH * p} x2={W - PADR} y2={PADT + innerH * p}
              stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
          ))}
          {groups.map((g, gi) => (
            <line key={gi}
              x1={xForTs(g.ts)} y1={PADT} x2={xForTs(g.ts)} y2={PADT + innerH}
              stroke="rgba(239,159,39,0.25)" strokeWidth="1" strokeDasharray="3,3" />
          ))}
          <path d={path} fill="none" stroke={sel.color} strokeWidth="2.5" strokeLinecap="round" />
          {groups.map((g, gi) => {
            const x = xForTs(g.ts)
            const totalW = g.items.length * (ICON + ICON_GAP) - ICON_GAP
            return (
              <g key={gi}>
                {g.items.map((id, ii) => (
                  <image key={ii}
                    href={itemImg(version, id)}
                    x={x - totalW / 2 + ii * (ICON + ICON_GAP)} y={PADT - ICON - 4}
                    width={ICON} height={ICON}
                    onError={(e) => { (e.currentTarget as SVGImageElement).style.display = 'none' }} />
                ))}
              </g>
            )
          })}
          {xTicks.map(min => {
            const x = PADL + (min * 60000 / lastTs) * innerW
            if (x > W - PADR) return null
            return (
              <g key={min}>
                <line x1={x} y1={PADT + innerH} x2={x} y2={PADT + innerH + 3} stroke="rgba(255,255,255,0.2)" />
                <text x={x} y={PADT + innerH + 14} textAnchor="middle" fill="var(--text-dim)" fontSize="10">{min}m</text>
              </g>
            )
          })}
          {[0, 0.5, 1].map(p => (
            <text key={p} x={PADL - 6} y={PADT + innerH * p + 3}
              textAnchor="end" fill="var(--text-dim)" fontSize="10">{fmtY(maxVal * (1 - p))}</text>
          ))}
        </svg>
        <div style={{ fontSize: 10, color: 'var(--text-dim)', textAlign: 'right', marginTop: 4 }}>
          <span style={{ color: sel.color, fontWeight: 600 }}>━ {sel.label}</span>
          {'  ┊  '}
          <span style={{ color: 'rgba(239,159,39,0.6)' }}>┊ Achat item</span>
          {isCorrelation && <>{' · '}<span style={{ fontStyle: 'italic' }}>corrélation — pas causalité</span></>}
          {showVue1 && !isCorrelation && <>{' · '}<span style={{ fontStyle: 'italic' }}>valeurs réelles par frame (~1 min)</span></>}
        </div>
      </div>
    )
  }

  // ── VUE 2 : Importance relative ──
  function ImportanceView() {
    const finalItems = [...me.items, me.trinket]
      .filter(id => id > 0)
      .map(id => ({
        id,
        cost:      itemData[String(id)]?.gold?.total ?? 0,
        name:      itemData[String(id)]?.name ?? String(id),
        itemStats: merakiData?.stats[String(id)] ?? null,
      }))
    const totalCost = finalItems.reduce((s, i) => s + i.cost, 0) || 1
    const allZero   = finalItems.every(i => i.cost === 0)

    const lastFrame = frames[frames.length - 1]
    const myStats   = lastFrame?.playerStats?.[myIdx] ?? null

    const phys  = me.physicalDamageDealt ?? 0
    const magic = me.magicDamageDealt    ?? 0
    const tru   = me.trueDamageDealt     ?? 0
    const dmgTotal = phys + magic + tru

    return (
      <div>
        {merakiData?.outdated && (
          <div style={{
            fontSize: 10, color: '#EF9F27', padding: '4px 10px', borderRadius: 4,
            background: 'rgba(239,159,39,0.08)', border: '1px solid rgba(239,159,39,0.25)',
            marginBottom: 10,
          }}>
            ⚠ Stats potentiellement datées — Meraki patch {merakiData.merakiPatch}, patch live {merakiData.ddPatch}.
          </div>
        )}
        <div style={{ fontSize: 10, color: 'var(--text-dim)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>
          Part d&apos;or par item (build final)
        </div>
        {!itemLoaded ? (
          <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>Chargement…</div>
        ) : finalItems.length === 0 ? (
          <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>Aucun item dans le build final.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {finalItems.map(item => {
              const pct = allZero ? 0 : Math.round((item.cost / totalCost) * 100)
              const statEntries = item.itemStats
                ? Object.entries(item.itemStats).filter(([, v]) => v && v !== 0)
                : []
              return (
                <div key={item.id}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: statEntries.length > 0 ? 4 : 0 }}>
                    <img src={itemImg(version, item.id)} alt=""
                      style={{ width: 28, height: 28, borderRadius: 3, flexShrink: 0 }}
                      onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', width: 130, flexShrink: 0,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {item.name}
                    </div>
                    <div style={{ flex: 1, height: 8, background: 'rgba(255,255,255,0.05)', borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{
                        width: `${pct}%`, height: '100%', borderRadius: 4,
                        background: item.cost > 0 ? '#7F77DD' : 'rgba(255,255,255,0.1)',
                        transition: 'width 400ms ease',
                      }} />
                    </div>
                    <div style={{ fontSize: 10, color: item.cost > 0 ? 'var(--text-muted)' : 'var(--text-dim)',
                      minWidth: 70, textAlign: 'right', flexShrink: 0 }}>
                      {item.cost > 0 ? `${item.cost.toLocaleString('fr-FR')} g · ${pct}%` : '?'}
                    </div>
                  </div>
                  {statEntries.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, paddingLeft: 36 }}>
                      {statEntries.map(([k, v]) => {
                        const label     = STAT_LABELS[k]
                        if (!label || !v) return null
                        const playerKey = STAT_TO_PLAYER[k]
                        const total     = (playerKey && myStats) ? (myStats[playerKey] as number) : 0
                        const contrib   = total > 0 ? Math.round((v / total) * 100) : null
                        return (
                          <span key={k} style={{
                            padding: '1px 6px', borderRadius: 3, fontSize: 10,
                            background: 'rgba(127,119,221,0.08)',
                            border: '1px solid rgba(127,119,221,0.18)',
                            color: 'var(--text-muted)',
                          }}>
                            {fmtStatValue(k, v)} {label}
                            {contrib !== null && contrib > 0 && contrib <= 100 && (
                              <span style={{ color: 'var(--text-dim)', marginLeft: 3 }}>({contrib}%)</span>
                            )}
                          </span>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
        <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          <div style={{ fontSize: 10, color: 'var(--text-dim)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 2 }}>
            Profil de dégâts global
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-dim)', fontStyle: 'italic', marginBottom: 8 }}>
            Données réelles, niveau joueur — pas par item
          </div>
          {dmgTotal > 0 ? (
            <>
              <div style={{ height: 12, borderRadius: 6, overflow: 'hidden', display: 'flex', marginBottom: 6 }}>
                <div style={{ width: `${(phys / dmgTotal) * 100}%`, background: '#E24B4A' }} title={`Physique : ${(phys / 1000).toFixed(1)}K`} />
                <div style={{ width: `${(magic / dmgTotal) * 100}%`, background: '#7F77DD' }} title={`Magique : ${(magic / 1000).toFixed(1)}K`} />
                <div style={{ width: `${(tru / dmgTotal) * 100}%`, background: 'rgba(245,242,250,0.85)' }} title={`Vrai : ${(tru / 1000).toFixed(1)}K`} />
              </div>
              <div style={{ display: 'flex', gap: 12, fontSize: 10, color: 'var(--text-dim)', flexWrap: 'wrap' }}>
                <span><span style={{ color: '#E24B4A', fontWeight: 700 }}>■</span> Physique : {(phys / 1000).toFixed(1)}K ({Math.round((phys / dmgTotal) * 100)}%)</span>
                <span><span style={{ color: '#7F77DD', fontWeight: 700 }}>■</span> Magique : {(magic / 1000).toFixed(1)}K ({Math.round((magic / dmgTotal) * 100)}%)</span>
                {tru > 0 && <span><span style={{ color: 'rgba(245,242,250,0.85)', fontWeight: 700 }}>■</span> Vrai : {(tru / 1000).toFixed(1)}K ({Math.round((tru / dmgTotal) * 100)}%)</span>}
              </div>
            </>
          ) : (
            <div style={{ fontSize: 11, color: 'var(--text-dim)', fontStyle: 'italic' }}>
              Profil de dégâts non disponible pour ce match (données historiques).
              {me.damageDealt > 0 && (
                <span style={{ marginLeft: 6, color: 'var(--text-muted)', fontStyle: 'normal' }}>
                  Total : {(me.damageDealt / 1000).toFixed(1)}K dégâts aux champions.
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── VUE 3 : Avant / Après par item ──
  // Segments = intervalles entre acquisitions (l'« après » d'un item = l'« avant »
  // du suivant : la partie est continue, ce n'est pas une répétition erronée).
  function BeforeAfterView() {
    if (frames.length === 0 || myIdx < 0) {
      return <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>Données timeline non disponibles.</div>
    }
    const rows = computeItemImpact({
      itemEvents: me.itemEvents ?? [],
      frames,
      kills: detail.kills ?? [],
      catalog: itemData as ItemCatalog,
      myIdx,
      gameDurationMs: frames[frames.length - 1].ts,
    })
    if (rows.length === 0) {
      return <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>Aucun item de build significatif à comparer.</div>
    }

    const durLabel = (w: WindowStats) => {
      const s = Math.round(w.durationMs / 1000)
      return s >= 60 ? `${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}` : `${s}s`
    }
    const delta = (a: number | null, b: number | null): { txt: string; color: string } => {
      if (a === null || b === null) return { txt: '—', color: 'var(--text-dim)' }
      if (a === 0) return b === 0 ? { txt: '≈', color: 'var(--text-dim)' } : { txt: 'nouv.', color: '#5DCAA5' }
      const p = ((b - a) / a) * 100
      if (Math.abs(p) < 5) return { txt: '≈', color: 'var(--text-dim)' }
      return { txt: `${p > 0 ? '↑ +' : '↓ '}${Math.round(p)}%`, color: p > 0 ? '#5DCAA5' : '#E24B4A' }
    }
    const nGold = (v: number | null) => (v === null ? '—' : Math.round(v).toLocaleString('fr-FR'))
    const nCs   = (v: number | null) => (v === null ? '—' : v.toFixed(1))
    const nDmg  = (v: number | null) => (v === null ? '—' : Math.round(v).toLocaleString('fr-FR'))
    const kda   = (w: WindowStats) => `${w.totals.kills}/${w.totals.deaths}/${w.totals.assists}`

    type StatRow = { label: string; a: number | null; b: number | null; fmt: (v: number | null) => string }

    return (
      <div>
        {/* Libellé d'honnêteté — NON négociable */}
        <div style={{ fontSize: 10, fontStyle: 'italic', color: 'var(--text-dim)', marginBottom: 10, lineHeight: 1.5 }}>
          Stats du joueur <span style={{ color: 'var(--text-muted)' }}>pendant que cet item était actif dans son inventaire</span> — corrélation temporelle, <b>pas un impact causal</b> (la fenêtre « après » cumule aussi les autres achats, les niveaux et l&apos;état de la partie).
        </div>

        {!hasPlayerStats && (
          <div style={{ fontSize: 10, color: '#EF9F27', padding: '4px 10px', borderRadius: 4, background: 'rgba(239,159,39,0.08)', border: '1px solid rgba(239,159,39,0.25)', marginBottom: 10 }}>
            ⚠ Dégâts par fenêtre indisponibles pour ce match — seuls or, CS et K/D/A sont comparables.
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {rows.map((row, ri) => {
            const statRows: StatRow[] = [
              { label: 'Or / min',   a: row.before.perMin.gold,         b: row.after.perMin.gold,         fmt: nGold },
              { label: 'CS / min',   a: row.before.perMin.cs,           b: row.after.perMin.cs,           fmt: nCs  },
              { label: 'Dég. / min', a: row.before.perMin.dmgChampions, b: row.after.perMin.dmgChampions, fmt: nDmg },
            ]
            return (
              <div key={ri} style={{ borderRadius: 6, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', padding: 10 }}>
                {/* En-tête item */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  {row.itemIds.map((id, i) => (
                    <img key={i} src={itemImg(version, id)} alt=""
                      style={{ width: 26, height: 26, borderRadius: 3, flexShrink: 0 }}
                      onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
                  ))}
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {row.itemIds.map(id => itemData[String(id)]?.name ?? `#${id}`).join(' + ')}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-dim)', flexShrink: 0 }}>acheté {fmt(Math.floor(row.ts / 1000))}</div>
                </div>

                {/* Grille avant → après */}
                <div style={{ display: 'grid', gridTemplateColumns: '82px 1fr 1fr 66px', gap: '3px 8px', alignItems: 'center', fontSize: 11 }}>
                  <div />
                  <div style={{ fontSize: 9, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'right', opacity: row.before.short ? 0.5 : 1 }}>Avant{row.before.short ? ' ⚠' : ''}</div>
                  <div style={{ fontSize: 9, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'right', opacity: row.after.short ? 0.5 : 1 }}>Après{row.after.short ? ' ⚠' : ''}</div>
                  <div />

                  {statRows.map(sr => {
                    const d = delta(sr.a, sr.b)
                    return (
                      <Fragment key={sr.label}>
                        <div style={{ color: 'var(--text-dim)' }}>{sr.label}</div>
                        <div style={{ textAlign: 'right', color: 'var(--text-muted)', opacity: row.before.short ? 0.45 : 1 }}>{sr.fmt(sr.a)}</div>
                        <div style={{ textAlign: 'right', color: 'var(--text-muted)', opacity: row.after.short ? 0.45 : 1 }}>{sr.fmt(sr.b)}</div>
                        <div style={{ textAlign: 'right', color: d.color, fontSize: 10, fontWeight: 600 }}>{d.txt}</div>
                      </Fragment>
                    )
                  })}

                  <div style={{ color: 'var(--text-dim)' }}>K/D/A</div>
                  <div style={{ textAlign: 'right', color: 'var(--text-muted)', opacity: row.before.short ? 0.45 : 1 }}>{kda(row.before)}</div>
                  <div style={{ textAlign: 'right', color: 'var(--text-muted)', opacity: row.after.short ? 0.45 : 1 }}>{kda(row.after)}</div>
                  <div />
                </div>

                <div style={{ fontSize: 9, color: 'var(--text-dim)', marginTop: 6, textAlign: 'right' }}>
                  fenêtres : avant {durLabel(row.before)} · après {durLabel(row.after)}
                  {(row.before.short || row.after.short) && <span style={{ color: '#EF9F27' }}> · ⚠ fenêtre courte (&lt;45s), /min peu fiable</span>}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
        Impact d&apos;items
      </div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
        {([
          { key: 'timeline',   label: showVue1 ? 'Timeline (stats + achats)' : 'Timeline (or + achats)' },
          { key: 'importance', label: 'Importance relative' },
          { key: 'window',     label: 'Avant / après par item' },
        ] as { key: 'timeline' | 'importance' | 'window'; label: string }[]).map(v => {
          const active = view === v.key
          return (
            <button key={v.key} onClick={() => setView(v.key)} style={{
              padding: '3px 10px', borderRadius: 5, fontSize: 11,
              cursor: 'pointer', transition: 'all 120ms',
              background: active ? 'rgba(127,119,221,0.22)' : 'rgba(255,255,255,0.03)',
              border: active ? '1px solid #7F77DD' : '1px solid rgba(255,255,255,0.08)',
              color: active ? '#F5F2FA' : 'var(--text-muted)',
              fontWeight: active ? 600 : 400,
            }}>{v.label}</button>
          )
        })}
      </div>
      <div style={{ padding: 12, borderRadius: 6, background: 'rgba(0,0,0,0.2)' }}>
        {view === 'timeline' ? <TimelineView /> : view === 'importance' ? <ImportanceView /> : <BeforeAfterView />}
      </div>
    </div>
  )
}

// ── Ordre de sorts (Q/W/E/R) ──
function SkillOrderGrid({ me }: { me: Participant }) {
  const events = me.skillEvents ?? []
  if (events.length === 0) {
    return (
      <div>
        <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
          Ordre de sorts
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
          Données skill order non disponibles.
        </div>
      </div>
    )
  }

  const SLOT_LABELS = ['Q', 'W', 'E', 'R']
  const SLOT_COLORS = ['#3A8AC9', '#5DCAA5', '#EF9F27', '#E24B4A']
  const totalLevels = events.length

  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
        Ordre de sorts (niveau 1 → {totalLevels})
      </div>
      <div style={{
        display: 'grid', gap: 2,
        gridTemplateColumns: `42px repeat(${totalLevels}, minmax(22px, 1fr))`,
        padding: 10, borderRadius: 6, background: 'rgba(0,0,0,0.2)',
        fontSize: 10,
      }}>
        {/* Header niveaux */}
        <div></div>
        {events.map((_, i) => (
          <div key={i} style={{ textAlign: 'center', color: 'var(--text-dim)' }}>{i + 1}</div>
        ))}
        {/* Lignes Q/W/E/R */}
        {SLOT_LABELS.map((label, slotIdx) => (
          <Fragment key={label}>
            <div style={{ color: SLOT_COLORS[slotIdx], fontWeight: 700, textAlign: 'center' }}>{label}</div>
            {events.map((ev, lvl) => (
              <div key={lvl} style={{
                width: '100%', height: 22, borderRadius: 3,
                background: ev.slot === slotIdx + 1 ? SLOT_COLORS[slotIdx] : 'rgba(255,255,255,0.03)',
                border: ev.slot === slotIdx + 1 ? 'none' : '1px solid rgba(255,255,255,0.04)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: ev.slot === slotIdx + 1 ? '#0a0612' : 'transparent',
                fontWeight: 700, fontSize: 9,
              }}>
                {ev.slot === slotIdx + 1 ? lvl + 1 : ''}
              </div>
            ))}
          </Fragment>
        ))}
      </div>
    </div>
  )
}

// ── Stats des sorts du champion (fetch DDragon) ──
function ChampionAbilities({ me, champMap, version }: {
  me: Participant; champMap: Record<number, ChampInfo>
  spellMap: Record<number, SpellInfo>; version: string
}) {
  const champ = champMap[me.championId]
  const [data, setData] = useState<ChampionFull | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!champ || !version) return
    let cancelled = false
    fetch(`https://ddragon.leagueoflegends.com/cdn/${version}/data/fr_FR/champion/${champ.id}.json`)
      .then(r => r.json())
      .then((j: { data: Record<string, { passive: { name: string; description: string; image: { full: string } }; spells: { id: string; name: string; description: string; image: { full: string }; cooldownBurn: string; costBurn: string; rangeBurn: string }[] }> }) => {
        if (cancelled) return
        const d = j.data[champ.id]
        if (!d) { setError('Champion introuvable'); return }
        setData({
          passive: { name: d.passive.name, description: d.passive.description, image: d.passive.image.full },
          abilities: d.spells.map(sp => ({
            id: sp.id, name: sp.name, description: sp.description, image: sp.image.full,
            cooldown: sp.cooldownBurn, cost: sp.costBurn, range: sp.rangeBurn,
          })),
        })
      })
      .catch(() => { if (!cancelled) setError('Impossible de charger les sorts.') })
    return () => { cancelled = true }
  }, [champ, version])

  if (!champ) return null
  if (error) return <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{error}</div>
  if (!data) return <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>Chargement des sorts…</div>

  // HTML descriptions de Riot — on supprime juste les balises XML simples pour rendre le texte
  const cleanHtml = (s: string) => s
    .replace(/<br\s*\/?>/g, '\n')
    .replace(/<[^>]+>/g, '')

  const SLOTS = ['P', 'Q', 'W', 'E', 'R']
  const all = [
    { ...data.passive, slot: 'P', cooldown: '', cost: '', range: '' },
    ...data.abilities.map((a, i) => ({ ...a, slot: SLOTS[i + 1] ?? '?' })),
  ]

  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
        Sorts de {champ.name}
      </div>
      <div style={{
        display: 'grid', gap: 6,
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
      }}>
        {all.map((ab, i) => (
          <div key={i} style={{
            display: 'flex', gap: 8, padding: 8, borderRadius: 6,
            background: 'rgba(0,0,0,0.2)',
            border: '1px solid rgba(255,255,255,0.04)',
          }}>
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <img src={
                ab.slot === 'P'
                  ? `https://ddragon.leagueoflegends.com/cdn/${version}/img/passive/${ab.image}`
                  : `https://ddragon.leagueoflegends.com/cdn/${version}/img/spell/${ab.image}`
              } alt="" style={{ width: 42, height: 42, borderRadius: 4 }} />
              <span style={{
                position: 'absolute', bottom: -3, left: -3, fontSize: 9, fontWeight: 700,
                padding: '0 4px', borderRadius: 2, background: '#7F77DD', color: '#fff',
              }}>{ab.slot}</span>
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#F5F2FA', marginBottom: 2 }}>
                {ab.name}
              </div>
              {ab.slot !== 'P' && (
                <div style={{ fontSize: 9, color: 'var(--text-dim)', marginBottom: 4, display: 'flex', gap: 8 }}>
                  {ab.cooldown && <span>⏱ {ab.cooldown}s</span>}
                  {ab.cost     && <span>💧 {ab.cost}</span>}
                  {ab.range    && <span>📏 {ab.range}</span>}
                </div>
              )}
              <div style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.4, whiteSpace: 'pre-wrap', maxHeight: 80, overflowY: 'auto' }}>
                {cleanHtml(ab.description)}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────────
// Différences de stats à des timestamps clés (5/10/15/20/25 min).
// Permet de voir rapidement "qui menait à X minute" pour or, XP, CS.
// ────────────────────────────────────────────────────────────────────────────────
function TimestampDiffs({ detail }: { detail: MatchDetail }) {
  const frames = detail.timeline ?? []
  if (frames.length === 0) return null

  // Trouver la frame la plus proche d'une cible (en ms)
  const frameAt = (targetMs: number) => {
    let best = frames[0], bestDelta = Math.abs(frames[0].ts - targetMs)
    for (const f of frames) {
      const d = Math.abs(f.ts - targetMs)
      if (d < bestDelta) { best = f; bestDelta = d }
    }
    return best
  }

  const gameMinutes = Math.floor(detail.gameDuration / 60)
  // Timestamps disponibles : on n'affiche que ceux <= durée de la partie
  const TARGETS = [5, 10, 14, 15, 20, 25, 30, 35, 40].filter(m => m <= gameMinutes + 1)

  const border = 'rgba(255,255,255,0.06)'
  return (
    <section style={{
      marginBottom: 18, padding: '14px 18px', borderRadius: 10,
      background: 'rgba(255,255,255,0.02)',
      borderTop: `1px solid ${border}`, borderRight: `1px solid ${border}`,
      borderBottom: `1px solid ${border}`, borderLeft: `1px solid ${border}`,
    }}>
      <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
        Différentiels à des moments clés (bleu - rouge)
      </div>

      <div style={{ display: 'grid', gap: 6, gridTemplateColumns: `60px repeat(${TARGETS.length}, 1fr)` }}>
        {/* Header colonnes */}
        <div></div>
        {TARGETS.map(m => (
          <div key={m} style={{ textAlign: 'center', fontSize: 10, color: 'var(--text-dim)', fontWeight: 700, letterSpacing: 1 }}>
            {m}M
          </div>
        ))}

        {/* Ligne OR */}
        <DiffRow label="OR"  frames={TARGETS.map(m => frameAt(m * 60000))} get={f => f.teamGold[0] - f.teamGold[1]} format={v => `${(Math.abs(v)/1000).toFixed(1)}K`} />
        {/* Ligne XP */}
        <DiffRow label="XP"  frames={TARGETS.map(m => frameAt(m * 60000))} get={f => f.teamXp[0]   - f.teamXp[1]}   format={v => `${(Math.abs(v)/1000).toFixed(1)}K`} />
        {/* Ligne CS */}
        <DiffRow label="CS"  frames={TARGETS.map(m => frameAt(m * 60000))} get={f => f.teamCs[0]   - f.teamCs[1]}   format={v => Math.abs(v).toString()} />
      </div>
    </section>
  )
}

function DiffRow({ label, frames, get, format }: {
  label: string; frames: TimelineFrame[]
  get: (f: TimelineFrame) => number; format: (v: number) => string
}) {
  return (
    <>
      <div style={{ fontSize: 10, color: 'var(--text-dim)', fontWeight: 700, letterSpacing: 1, display: 'flex', alignItems: 'center' }}>
        {label}
      </div>
      {frames.map((f, i) => {
        const diff = get(f)
        const color = Math.abs(diff) < 100 ? '#A1A1AA' : diff > 0 ? '#3A8AC9' : '#E24B4A'
        return (
          <div key={i} style={{
            textAlign: 'center', padding: '6px 4px', borderRadius: 4,
            background: `${color}11`,
            border: `1px solid ${color}44`,
            color, fontSize: 11, fontWeight: 600,
          }}>
            {diff > 0 ? '+' : diff < 0 ? '−' : ''}{format(diff)}
          </div>
        )
      })}
    </>
  )
}

// ────────────────────────────────────────────────────────────────────────────────
// MapHeatmap : carte interactive Summoner's Rift avec points (kills ou wards).
// Range slider pour filtrer la fenêtre de temps. Mode 'global' affiche tout.
// ────────────────────────────────────────────────────────────────────────────────
// Carte locale (pas de CORS, pas de version DDragon à gérer).
// Si l'utilisateur n'a pas encore déposé le fichier, fallback automatique sur la
// carte DDragon versionnée puis sur l'URL non versionnée.
const RIFT_MAP_URL = '/icons/maps/summoners_rift.png'
// La grille de Riot va de 0..14820 (approximatif). 0,0 = bottom-left.
const RIFT_SIZE = 14820

// Mapping wardType Riot → label français lisible
const WARD_TYPE_LABEL: Record<string, string> = {
  YELLOW_TRINKET: 'Totem balise (jaune)',
  SIGHT_WARD:     'Balise de vision (verte)',
  CONTROL_WARD:   'Balise de contrôle (rose)',
  BLUE_TRINKET:   'Lentille oraculaire (bleue)',
  TEEMO_MUSHROOM: 'Champignon de Teemo',
  UNDEFINED:      'Ward (type inconnu)',
  UNKNOWN:        'Ward (type inconnu)',
}

function MapHeatmap({ detail, mode, champMap, version }: {
  detail: MatchDetail; mode: 'kills' | 'wards'
  champMap: Record<number, ChampInfo>; version: string
}) {
  // participantId Riot (1..10) → Participant
  const pById = (id: number): Participant | undefined =>
    detail.participants[id - 1]
  const totalMin = Math.ceil(detail.gameDuration / 60)
  const [from, setFrom]   = useState(0)
  const [to,   setTo]     = useState(totalMin)
  const [teamFilter, setTeamFilter] = useState<'all' | 100 | 200>('all')

  const events = mode === 'kills'
    ? (detail.kills ?? []).filter(e => e.position)
    : (detail.wards ?? []).filter(e => e.position)

  const filtered = events.filter(e => {
    const min = e.ts / 60000
    if (min < from || min > to) return false
    if (teamFilter !== 'all' && e.teamId !== teamFilter) return false
    return true
  })

  // Convertit position Riot (0..14820, 0,0=bottom-left) en % (top-left origin)
  const pctX = (x: number) => (x / RIFT_SIZE) * 100
  const pctY = (y: number) => ((RIFT_SIZE - y) / RIFT_SIZE) * 100

  const border = 'rgba(255,255,255,0.06)'
  const titleLabel = mode === 'kills' ? 'Carte des kills' : 'Carte des wards'
  const count = filtered.length

  return (
    <section style={{
      marginBottom: 18, padding: '14px 18px', borderRadius: 10,
      background: 'rgba(255,255,255,0.02)',
      borderTop: `1px solid ${border}`, borderRight: `1px solid ${border}`,
      borderBottom: `1px solid ${border}`, borderLeft: `1px solid ${border}`,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1 }}>
          {titleLabel} — {count} évén.
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {(['all', 100, 200] as const).map(t => {
            const active = teamFilter === t
            const lbl    = t === 'all' ? 'Toutes' : t === 100 ? 'Bleue' : 'Rouge'
            const col    = t === 100 ? '#3A8AC9' : t === 200 ? '#E24B4A' : '#7F77DD'
            return (
              <button key={t} onClick={() => setTeamFilter(t)} style={{
                padding: '3px 9px', borderRadius: 5, fontSize: 11, cursor: 'pointer',
                background: active ? `${col}22` : 'rgba(255,255,255,0.03)',
                border: `1px solid ${active ? col : 'rgba(255,255,255,0.08)'}`,
                color: active ? '#F5F2FA' : 'var(--text-muted)', fontWeight: active ? 600 : 400,
              }}>{lbl}</button>
            )
          })}
        </div>
      </div>

      {/* Fenêtre temporelle : deux curseurs (début / fin de la fenêtre à afficher) */}
      <div style={{ marginBottom: 12 }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          fontSize: 11, color: 'var(--text-dim)', marginBottom: 4,
        }}>
          <span>
            Fenêtre affichée : <strong style={{ color: '#F5F2FA' }}>{from}m → {to}m</strong>
            {' '}<span style={{ color: 'var(--text-muted)' }}>(sur {totalMin}m total)</span>
          </span>
          <button onClick={() => { setFrom(0); setTo(totalMin) }} style={{
            padding: '3px 10px', borderRadius: 5, fontSize: 11, cursor: 'pointer',
            background: from === 0 && to === totalMin ? 'rgba(239,159,39,0.15)' : 'rgba(127,119,221,0.15)',
            border: `1px solid ${from === 0 && to === totalMin ? '#EF9F27' : 'rgba(127,119,221,0.3)'}`,
            color: '#F5F2FA', fontWeight: 600,
          }}>Toute la partie</button>
        </div>
        {/* Slider de DÉBUT */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 11, color: 'var(--text-muted)' }}>
          <span style={{ minWidth: 50 }}>Début</span>
          <input type="range" min={0} max={totalMin} value={from}
            onChange={e => setFrom(Math.min(Number(e.target.value), to))}
            style={{ flex: 1 }} />
          <span style={{ minWidth: 36, textAlign: 'right', fontWeight: 600, color: '#F5F2FA' }}>{from}m</span>
        </div>
        {/* Slider de FIN */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
          <span style={{ minWidth: 50 }}>Fin</span>
          <input type="range" min={0} max={totalMin} value={to}
            onChange={e => setTo(Math.max(Number(e.target.value), from))}
            style={{ flex: 1 }} />
          <span style={{ minWidth: 36, textAlign: 'right', fontWeight: 600, color: '#F5F2FA' }}>{to}m</span>
        </div>
      </div>

      {/* La carte */}
      <div style={{ position: 'relative', aspectRatio: '1 / 1', maxWidth: 600, margin: '0 auto' }}>
        <img src={RIFT_MAP_URL} alt="Summoner's Rift"
          onError={e => {
            // Fallback 1 : DDragon versionné, sinon non versionné
            const img = e.currentTarget as HTMLImageElement
            if (img.src.endsWith('summoners_rift.png')) {
              img.src = 'https://ddragon.leagueoflegends.com/cdn/14.24.1/img/map/map11.png'
            } else if (img.src.includes('14.24.1')) {
              img.src = 'https://ddragon.leagueoflegends.com/cdn/img/map/map11.png'
            }
          }}
          style={{ width: '100%', height: '100%', borderRadius: 6, display: 'block', opacity: 0.8, background: '#0a0612' }} />
        {/* Points avec tooltip détaillé au hover */}
        {filtered.map((e, i) => (
          <HoverPoint
            key={i}
            event={e}
            mode={mode}
            x={pctX(e.position!.x)}
            y={pctY(e.position!.y)}
            pById={pById}
            champMap={champMap}
            version={version}
          />
        ))}
      </div>

      {/* Légende */}
      <div style={{ fontSize: 10, color: 'var(--text-dim)', textAlign: 'center', marginTop: 8 }}>
        {mode === 'kills'
          ? 'Cercle bleu = kill par équipe bleue · rouge = par équipe rouge'
          : 'Cercle bleu = ward bleue · rouge = ward rouge'}
      </div>
    </section>
  )
}

// ────────────────────────────────────────────────────────────────────────────────
// HoverPoint : un point sur la carte (kill ou ward) avec tooltip détaillé.
// Pour un kill : victime / tueur / assists. Pour une ward : type / poseur / action.
// ────────────────────────────────────────────────────────────────────────────────
function HoverPoint({ event, mode, x, y, pById, champMap, version }: {
  event: KillEvent | WardEvent
  mode: 'kills' | 'wards'
  x: number; y: number
  pById: (id: number) => Participant | undefined
  champMap: Record<number, ChampInfo>
  version: string
}) {
  const [hover, setHover] = useState(false)
  const isKill = mode === 'kills'
  const color  = event.teamId === 100 ? '#3A8AC9' : '#E24B4A'
  const size   = isKill ? 12 : 8

  const fmtTs = (ts: number) =>
    `${Math.floor(ts/60000)}m${Math.floor((ts/1000)%60).toString().padStart(2,'0')}`

  // Le tooltip déborde de la carte : on choisit son ancrage selon la position
  const tooltipLeft = x < 50  // si on est dans la moitié gauche → tooltip à droite du point
  const tooltipTop  = y < 50  // si on est dans la moitié haute → tooltip en bas du point

  return (
    <>
      <div
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          position: 'absolute',
          left: `calc(${x}% - ${size/2 + 4}px)`,
          top:  `calc(${y}% - ${size/2 + 4}px)`,
          width: size + 8, height: size + 8,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'help',
          zIndex: hover ? 20 : 10,
        }}
      >
        {/* Le point visible */}
        <div style={{
          width: size, height: size, borderRadius: '50%',
          background: color, border: '1.5px solid rgba(255,255,255,0.85)',
          boxShadow: isKill ? `0 0 8px ${color}` : undefined,
          opacity: hover ? 1 : 0.85,
          transform: hover ? 'scale(1.4)' : 'scale(1)',
          transition: 'transform 100ms, opacity 100ms',
        }} />

        {/* Tooltip — largeur auto en fonction du contenu, avec min/max */}
        {hover && (
          <div style={{
            position: 'absolute',
            ...(tooltipLeft ? { left: '100%', marginLeft: 6 } : { right: '100%', marginRight: 6 }),
            ...(tooltipTop  ? { top: 0 } : { bottom: 0 }),
            width: 'max-content',
            minWidth: 180,
            maxWidth: 380,
            padding: '8px 10px', borderRadius: 6,
            background: 'rgba(8,5,18,0.97)',
            border: `1px solid ${color}aa`,
            color: '#F5F2FA', fontSize: 11, lineHeight: 1.4,
            boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
            pointerEvents: 'none', whiteSpace: 'nowrap',
          }}>
            {isKill ? (
              <KillTooltip k={event as KillEvent} pById={pById} champMap={champMap} version={version} fmtTs={fmtTs} />
            ) : (
              <WardTooltip w={event as WardEvent} pById={pById} champMap={champMap} version={version} fmtTs={fmtTs} />
            )}
          </div>
        )}
      </div>
    </>
  )
}

function KillTooltip({ k, pById, champMap, version, fmtTs }: {
  k: KillEvent
  pById: (id: number) => Participant | undefined
  champMap: Record<number, ChampInfo>
  version: string
  fmtTs: (ts: number) => string
}) {
  const killer = k.killerId > 0 ? pById(k.killerId) : undefined
  const victim = pById(k.victimId)
  const assists = k.assistingIds.map(id => pById(id)).filter(Boolean) as Participant[]

  const PlayerLine = ({ p, label, color }: { p?: Participant; label: string; color: string }) => {
    if (!p) return null
    const champ = champMap[p.championId]
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
        <span style={{ fontSize: 9, color: 'var(--text-dim)', width: 56, letterSpacing: 1, flexShrink: 0 }}>{label}</span>
        {champ && <img src={champImg(version, champ.image)} alt=""
          style={{ width: 18, height: 18, borderRadius: 3, border: `1px solid ${color}`, flexShrink: 0 }} />}
        <span style={{ color, fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0 }}>
          {p.riotIdGameName || champ?.name || p.championName}
        </span>
        <span style={{ color: 'var(--text-dim)', whiteSpace: 'nowrap', flexShrink: 0 }}>· {champ?.name ?? p.championName}</span>
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5, paddingBottom: 5, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <span style={{ fontSize: 10, color: 'var(--text-dim)', letterSpacing: 1 }}>KILL</span>
        <span style={{ fontWeight: 700 }}>{fmtTs(k.ts)}</span>
      </div>
      <PlayerLine p={victim} label="VICTIME" color="#E24B4A" />
      {killer
        ? <PlayerLine p={killer} label="TUÉ PAR" color="#5DCAA5" />
        : <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
            <span style={{ fontSize: 9, color: 'var(--text-dim)', width: 56, letterSpacing: 1, flexShrink: 0 }}>TUÉ PAR</span>
            <span style={{ color: 'var(--text-muted)', fontStyle: 'italic', whiteSpace: 'nowrap', flexShrink: 0 }}>Tourelle / sbire / monstre</span>
          </div>}
      {assists.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 9, color: 'var(--text-dim)', width: 56, letterSpacing: 1, flexShrink: 0 }}>ASSIST</span>
          {assists.map((a, i) => {
            const c = champMap[a.championId]
            return c && (
              <img key={i} src={champImg(version, c.image)} alt={a.riotIdGameName || c.name}
                title={a.riotIdGameName || c.name}
                style={{ width: 18, height: 18, borderRadius: 3, border: '1px solid rgba(255,255,255,0.2)' }} />
            )
          })}
        </div>
      )}
    </div>
  )
}

function WardTooltip({ w, pById, champMap, version, fmtTs }: {
  w: WardEvent
  pById: (id: number) => Participant | undefined
  champMap: Record<number, ChampInfo>
  version: string
  fmtTs: (ts: number) => string
}) {
  const creator = pById(w.creatorId)
  const champ   = creator ? champMap[creator.championId] : undefined
  const wardLbl = WARD_TYPE_LABEL[w.wardType] ?? w.wardType
  const actionLbl = w.action === 'PLACED' ? 'POSÉE' : 'DÉTRUITE'
  const actionColor = w.action === 'PLACED' ? '#5DCAA5' : '#EF9F27'

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5, paddingBottom: 5, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <span style={{ fontSize: 10, color: actionColor, letterSpacing: 1, fontWeight: 700 }}>{actionLbl}</span>
        <span style={{ fontWeight: 700 }}>{fmtTs(w.ts)}</span>
      </div>
      <div style={{ fontSize: 11, color: '#F5F2FA', marginBottom: 4 }}>{wardLbl}</div>
      {creator && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 9, color: 'var(--text-dim)', width: 80, letterSpacing: 1, flexShrink: 0 }}>
            {w.action === 'PLACED' ? 'PAR' : 'DÉTRUITE PAR'}
          </span>
          {champ && <img src={champImg(version, champ.image)} alt=""
            style={{ width: 18, height: 18, borderRadius: 3, border: `1px solid ${creator.teamId === 100 ? '#3A8AC9' : '#E24B4A'}`, flexShrink: 0 }} />}
          <span style={{ color: creator.teamId === 100 ? '#3A8AC9' : '#E24B4A', fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0 }}>
            {creator.riotIdGameName || champ?.name || creator.championName}
          </span>
        </div>
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────────
// Graphique d'évolution sur la durée de la partie (basé sur les frames timeline).
// Plusieurs vues sélectionnables :
//  - Différentiel d'or, d'XP, de CS entre les 2 équipes (courbes diff bleu/rouge)
//  - Or par joueur (10 courbes filtrables par camp / rôle)
//  - Niveau par joueur
// Tracé en SVG manuel (pas de dépendance à recharts).
// ────────────────────────────────────────────────────────────────────────────────
type TimelineMode =
  // Différentiel équipes
  | 'goldDiff' | 'xpDiff' | 'csDiff'
  // Cumul équipe (2 courbes : bleu vs rouge)
  | 'teamGold' | 'teamXp' | 'teamCs'
  // 10 courbes par joueur
  | 'goldAll' | 'xpAll' | 'csAll' | 'levelAll'
  // 5 courbes équipe bleue
  | 'goldBlue' | 'xpBlue' | 'csBlue' | 'levelBlue'
  // 5 courbes équipe rouge
  | 'goldRed'  | 'xpRed'  | 'csRed'  | 'levelRed'

const TIMELINE_MODES: { key: TimelineMode; label: string; group: string }[] = [
  // — Différentiel —
  { key: 'goldDiff',  label: 'Diff. or',  group: 'Différentiel' },
  { key: 'xpDiff',    label: 'Diff. XP',  group: 'Différentiel' },
  { key: 'csDiff',    label: 'Diff. CS',  group: 'Différentiel' },
  // — Cumul équipe —
  { key: 'teamGold',  label: 'Or équipes', group: 'Cumul équipe' },
  { key: 'teamXp',    label: 'XP équipes', group: 'Cumul équipe' },
  { key: 'teamCs',    label: 'CS équipes', group: 'Cumul équipe' },
  // — Tous les joueurs —
  { key: 'goldAll',   label: 'Or',     group: 'Les 10 joueurs' },
  { key: 'xpAll',     label: 'XP',     group: 'Les 10 joueurs' },
  { key: 'csAll',     label: 'CS',     group: 'Les 10 joueurs' },
  { key: 'levelAll',  label: 'Niveau', group: 'Les 10 joueurs' },
  // — Équipe bleue —
  { key: 'goldBlue',  label: 'Or',     group: 'Équipe bleue' },
  { key: 'xpBlue',    label: 'XP',     group: 'Équipe bleue' },
  { key: 'csBlue',    label: 'CS',     group: 'Équipe bleue' },
  { key: 'levelBlue', label: 'Niveau', group: 'Équipe bleue' },
  // — Équipe rouge —
  { key: 'goldRed',   label: 'Or',     group: 'Équipe rouge' },
  { key: 'xpRed',     label: 'XP',     group: 'Équipe rouge' },
  { key: 'csRed',     label: 'CS',     group: 'Équipe rouge' },
  { key: 'levelRed',  label: 'Niveau', group: 'Équipe rouge' },
]

function TimelineChart({ detail, champMap, version }: {
  detail: MatchDetail; champMap: Record<number, ChampInfo>; version: string
}) {
  const [mode, setMode] = useState<TimelineMode>('goldDiff')
  const [hover, setHover] = useState<number | null>(null) // index de la frame survolée

  const frames = detail.timeline ?? []
  if (frames.length === 0) return null

  // ── Géométrie ──
  const W = 800, H = 220
  const PADL = 50, PADR = 18, PADT = 16, PADB = 28
  const innerW = W - PADL - PADR
  const innerH = H - PADT - PADB

  // X = temps (minutes) de 0 à dernière frame
  const lastTs   = frames[frames.length - 1].ts
  const xForFrame = (i: number) => PADL + (frames[i].ts / lastTs) * innerW

  // Construction des séries selon le mode
  type Series = { values: number[]; color: string; label: string; champId?: number }
  const series: Series[] = []

  // Helper : récupère la valeur d'un joueur sur une frame, selon la métrique
  type PlayerKey = 'gold' | 'xp' | 'cs' | 'level'
  const playerValue = (f: TimelineFrame, idx: number, key: PlayerKey): number => {
    if (key === 'gold')  return f.playerGold[idx] ?? 0
    if (key === 'level') return f.playerLevel[idx] ?? 1
    if (key === 'xp')    return f.playerXp?.[idx] ?? 0
    if (key === 'cs')    return f.playerCs?.[idx] ?? 0
    return 0
  }

  // Helper : ajoute des courbes pour un sous-ensemble de joueurs
  const pushPlayers = (filter: (p: Participant) => boolean, key: PlayerKey) => {
    detail.participants.forEach((p, idx) => {
      if (!filter(p)) return
      const values = frames.map(f => playerValue(f, idx, key))
      series.push({
        values,
        color: p.teamId === 100 ? '#3A8AC9' : '#E24B4A',
        label: p.riotIdGameName || p.championName,
        champId: p.championId,
      })
    })
  }

  if (mode === 'goldDiff' || mode === 'xpDiff' || mode === 'csDiff') {
    // 1 série : différentiel bleu - rouge
    const key = mode === 'goldDiff' ? 'teamGold' : mode === 'xpDiff' ? 'teamXp' : 'teamCs'
    const values = frames.map(f => {
      const arr = (f as unknown as Record<string, [number, number]>)[key]
      return arr[0] - arr[1]
    })
    series.push({ values, color: '#7F77DD', label: 'Diff bleu - rouge' })
  } else if (mode === 'teamGold' || mode === 'teamXp' || mode === 'teamCs') {
    // 2 courbes : équipe bleue vs équipe rouge (cumul)
    const key = mode === 'teamGold' ? 'teamGold' : mode === 'teamXp' ? 'teamXp' : 'teamCs'
    series.push({
      values: frames.map(f => (f as unknown as Record<string, [number, number]>)[key][0]),
      color: '#3A8AC9', label: 'Équipe bleue',
    })
    series.push({
      values: frames.map(f => (f as unknown as Record<string, [number, number]>)[key][1]),
      color: '#E24B4A', label: 'Équipe rouge',
    })
  } else if (mode === 'goldAll')   pushPlayers(() => true, 'gold')
  else   if (mode === 'xpAll')     pushPlayers(() => true, 'xp')
  else   if (mode === 'csAll')     pushPlayers(() => true, 'cs')
  else   if (mode === 'levelAll')  pushPlayers(() => true, 'level')
  else   if (mode === 'goldBlue')  pushPlayers(p => p.teamId === 100, 'gold')
  else   if (mode === 'xpBlue')    pushPlayers(p => p.teamId === 100, 'xp')
  else   if (mode === 'csBlue')    pushPlayers(p => p.teamId === 100, 'cs')
  else   if (mode === 'levelBlue') pushPlayers(p => p.teamId === 100, 'level')
  else   if (mode === 'goldRed')   pushPlayers(p => p.teamId === 200, 'gold')
  else   if (mode === 'xpRed')     pushPlayers(p => p.teamId === 200, 'xp')
  else   if (mode === 'csRed')     pushPlayers(p => p.teamId === 200, 'cs')
  else   if (mode === 'levelRed')  pushPlayers(p => p.teamId === 200, 'level')

  // Min/Max global pour normaliser Y
  const isDiff = mode.endsWith('Diff')
  const allValues = series.flatMap(s => s.values)
  const minV = Math.min(...allValues, isDiff ? 0 : Infinity)
  const maxV = Math.max(...allValues, isDiff ? 0 : -Infinity)
  const range = maxV - minV || 1

  const yForValue = (v: number) => PADT + innerH - ((v - minV) / range) * innerH
  const xForIndex = (i: number) => xForFrame(i)
  const zeroY     = yForValue(0)

  // Format pour tooltip
  const fmt = (v: number) => {
    // Niveau : entier
    if (mode === 'levelAll' || mode === 'levelBlue' || mode === 'levelRed') {
      return Math.round(v).toString()
    }
    // Or, XP : K€
    if (mode.startsWith('gold') || mode.startsWith('xp') || mode === 'teamGold' || mode === 'teamXp') {
      return `${(v / 1000).toFixed(1)}K`
    }
    // CS : entier (mais peut être différentiel)
    if (mode.startsWith('cs') || mode === 'teamCs') {
      return Math.round(v).toString()
    }
    return v.toLocaleString('fr-FR')
  }

  // Construction des paths SVG
  const pathFor = (s: Series) =>
    s.values.map((v, i) => `${i === 0 ? 'M' : 'L'} ${xForIndex(i).toFixed(1)} ${yForValue(v).toFixed(1)}`).join(' ')

  // Pour les diff : zone d'aire colorée selon le signe
  const areaPath = isDiff && series[0]
    ? series[0].values.map((v, i) => {
        const x = xForIndex(i)
        const y = yForValue(v)
        return `${i === 0 ? `M ${x} ${zeroY} L ${x} ${y}` : `L ${x} ${y}`}`
      }).join(' ') + ` L ${xForIndex(series[0].values.length - 1)} ${zeroY} Z`
    : null

  // Graduations X (toutes les 5 minutes)
  const totalMin = Math.ceil(lastTs / 60000)
  const xTicks: number[] = []
  for (let m = 0; m <= totalMin; m += 5) xTicks.push(m)

  return (
    <section style={{
      marginTop: 18, padding: '14px 18px', borderRadius: 10,
      background: 'rgba(255,255,255,0.02)',
      borderTop: '1px solid rgba(255,255,255,0.06)', borderRight: '1px solid rgba(255,255,255,0.06)',
      borderBottom: '1px solid rgba(255,255,255,0.06)', borderLeft: '1px solid rgba(255,255,255,0.06)',
    }}>
      <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
        Évolution sur la durée — {TIMELINE_MODES.find(m => m.key === mode)?.label}
      </div>

      {/* Boutons par groupe (déduit dynamiquement de TIMELINE_MODES) */}
      {Array.from(new Set(TIMELINE_MODES.map(m => m.group))).map(group => (
        <div key={group} style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 9, color: 'var(--text-dim)', letterSpacing: 1, marginBottom: 4, textTransform: 'uppercase' }}>
            {group}
          </div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {TIMELINE_MODES.filter(m => m.group === group).map(m => {
              const isActive = m.key === mode
              return (
                <button key={m.key} onClick={() => setMode(m.key)} style={{
                  padding: '3px 9px', borderRadius: 5, fontSize: 11,
                  cursor: 'pointer', transition: 'all 120ms',
                  background: isActive ? 'rgba(127,119,221,0.22)' : 'rgba(255,255,255,0.03)',
                  border: isActive ? '1px solid #7F77DD' : '1px solid rgba(255,255,255,0.08)',
                  color: isActive ? '#F5F2FA' : 'var(--text-muted)',
                  fontWeight: isActive ? 600 : 400,
                }}>{m.label}</button>
              )
            })}
          </div>
        </div>
      ))}

      {/* SVG */}
      <div style={{ position: 'relative', marginTop: 8 }}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
          style={{ width: '100%', height: 220, display: 'block' }}
          onMouseLeave={() => setHover(null)}
        >
          {/* Grille horizontale */}
          {[0.25, 0.5, 0.75].map(p => (
            <line key={p}
              x1={PADL} y1={PADT + innerH * p}
              x2={W - PADR} y2={PADT + innerH * p}
              stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
          ))}
          {/* Axe Y zéro pour les diff */}
          {isDiff && (
            <line x1={PADL} y1={zeroY} x2={W - PADR} y2={zeroY}
              stroke="rgba(255,255,255,0.18)" strokeWidth="1" strokeDasharray="3,3" />
          )}
          {/* Aire colorée pour la diff */}
          {areaPath && series[0] && (
            <path d={areaPath} fill={
              series[0].values[series[0].values.length - 1] >= 0 ? 'rgba(58,138,201,0.18)' : 'rgba(226,75,74,0.18)'
            } />
          )}

          {/* Courbes */}
          {series.map((s, i) => (
            <path key={i} d={pathFor(s)}
              fill="none" stroke={s.color} strokeWidth={isDiff ? 2 : 1.4}
              strokeLinecap="round" strokeLinejoin="round" opacity={hover === null || isDiff ? 0.95 : 0.4} />
          ))}

          {/* Hover line + dots */}
          {hover !== null && (
            <>
              <line x1={xForIndex(hover)} y1={PADT} x2={xForIndex(hover)} y2={PADT + innerH}
                stroke="rgba(255,255,255,0.25)" strokeWidth="1" />
              {series.map((s, i) => (
                <circle key={i} cx={xForIndex(hover)} cy={yForValue(s.values[hover])}
                  r="3" fill={s.color} stroke="#0a0612" strokeWidth="1.5" />
              ))}
            </>
          )}

          {/* Zone hit pour le hover (overlay invisible par minute) */}
          {frames.map((_, i) => {
            const x1 = i === 0 ? PADL : (xForIndex(i - 1) + xForIndex(i)) / 2
            const x2 = i === frames.length - 1 ? W - PADR : (xForIndex(i) + xForIndex(i + 1)) / 2
            return (
              <rect key={i} x={x1} y={PADT} width={x2 - x1} height={innerH}
                fill="transparent" onMouseEnter={() => setHover(i)} />
            )
          })}

          {/* Graduations X (minutes) */}
          {xTicks.map(min => {
            const x = PADL + (min * 60000 / lastTs) * innerW
            if (x > W - PADR) return null
            return (
              <g key={min}>
                <line x1={x} y1={PADT + innerH} x2={x} y2={PADT + innerH + 4} stroke="rgba(255,255,255,0.2)" />
                <text x={x} y={PADT + innerH + 16} textAnchor="middle"
                  fill="var(--text-dim)" fontSize="10">{min}m</text>
              </g>
            )
          })}

          {/* Graduations Y (3 valeurs) */}
          {[0, 0.5, 1].map(p => {
            const v = minV + range * (1 - p)
            return (
              <text key={p} x={PADL - 6} y={PADT + innerH * p + 3}
                textAnchor="end" fill="var(--text-dim)" fontSize="10">
                {fmt(v)}
              </text>
            )
          })}
        </svg>

        {/* Tooltip flottant */}
        {hover !== null && (
          <div style={{
            position: 'absolute', top: 6, right: 8, padding: '6px 10px',
            background: 'rgba(8,5,18,0.95)', border: '1px solid rgba(127,119,221,0.4)',
            borderRadius: 5, fontSize: 11, color: '#F5F2FA',
            pointerEvents: 'none', minWidth: 140,
          }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>
              {Math.floor((frames[hover].ts) / 60000)}m{Math.floor(((frames[hover].ts) / 1000) % 60).toString().padStart(2,'0')}
            </div>
            {/* Toutes les courbes triées par valeur décroissante au point survolé */}
            {series
              .map((s, i) => ({ s, idx: i, v: s.values[hover] }))
              .sort((a, b) => b.v - a.v)
              .map(({ s, idx, v }) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  {s.champId && champMap[s.champId] && (
                    <img src={champImg(version, champMap[s.champId].image)} alt=""
                      style={{ width: 12, height: 12, borderRadius: 2 }} />
                  )}
                  <span style={{ width: 10, height: 2, background: s.color, display: 'inline-block' }} />
                  <span style={{ flex: 1, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {s.label}
                  </span>
                  <span style={{ fontWeight: 600 }}>{fmt(v)}</span>
                </div>
              ))}
          </div>
        )}
      </div>
    </section>
  )
}

// ────────────────────────────────────────────────────────────────────────────────
// Cartes par rôle (TOP/JGL/MID/ADC/SUP) — matchups blue vs red avec 3 stats clés.
// ────────────────────────────────────────────────────────────────────────────────
const ROLE_ORDER: { riot: string; label: string }[] = [
  { riot: 'TOP',     label: 'TOP' },
  { riot: 'JUNGLE',  label: 'JUNGLE' },
  { riot: 'MIDDLE',  label: 'MID' },
  { riot: 'BOTTOM',  label: 'ADC' },
  { riot: 'UTILITY', label: 'SUPPORT' },
]

function RoleCards({ detail, champMap, version, myTeamId }: {
  detail: MatchDetail; champMap: Record<number, ChampInfo>; version: string
  myTeamId?: number
}) {
  const border = 'rgba(255,255,255,0.06)'

  // Total kills par équipe (pour calcul du KP%)
  const teamKills = (id: 100 | 200) =>
    detail.participants.filter(p => p.teamId === id).reduce((s, p) => s + p.kills, 0)
  const blueTeamKills = teamKills(100)
  const redTeamKills  = teamKills(200)
  const kp = (p: Participant | undefined, total: number) =>
    !p || total === 0 ? 0 : Math.round(((p.kills + p.assists) / total) * 100)

  return (
    <div style={{
      marginBottom: 18,
      display: 'grid', gap: 8,
      gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    }}>
      {ROLE_ORDER.map(role => {
        const blue = detail.participants.find(p => p.teamId === 100 && p.teamPosition === role.riot)
        const red  = detail.participants.find(p => p.teamId === 200 && p.teamPosition === role.riot)
        if (!blue && !red) return null

        // Stats role-specific (différenciées par poste pour éviter la redondance)
        type Stat = { label: string; blueVal: number; redVal: number; format?: (v: number) => string }
        const baseStats: Record<string, Stat[]> = {
          // TOP : tank/bruiser → KDA / dégâts subis / CS
          TOP: [
            { label: 'KDA',     blueVal: kdaScore(blue),                redVal: kdaScore(red),                format: kdaFmt(blue, red) },
            { label: 'TANK',    blueVal: blue?.damageTaken ?? 0,         redVal: red?.damageTaken ?? 0,         format: v => `${(v/1000).toFixed(1)}K` },
            { label: 'CS',      blueVal: blue?.cs ?? 0,                  redVal: red?.cs ?? 0 },
          ],
          // JUNGLE : coordination → KDA / KP% / vision
          JUNGLE: [
            { label: 'KDA',     blueVal: kdaScore(blue),                redVal: kdaScore(red),                format: kdaFmt(blue, red) },
            { label: 'KP%',     blueVal: kp(blue, blueTeamKills),        redVal: kp(red, redTeamKills),         format: v => `${v}%` },
            { label: 'VISION',  blueVal: blue?.visionScore ?? 0,         redVal: red?.visionScore ?? 0 },
          ],
          // MID : playmaker → KDA / dégâts / KP%
          MIDDLE: [
            { label: 'KDA',     blueVal: kdaScore(blue),                redVal: kdaScore(red),                format: kdaFmt(blue, red) },
            { label: 'DÉGÂTS', blueVal: blue?.damageDealt ?? 0,         redVal: red?.damageDealt ?? 0,         format: v => `${(v/1000).toFixed(1)}K` },
            { label: 'KP%',     blueVal: kp(blue, blueTeamKills),        redVal: kp(red, redTeamKills),         format: v => `${v}%` },
          ],
          // ADC : carry → dégâts / CS / or
          BOTTOM: [
            { label: 'DÉGÂTS', blueVal: blue?.damageDealt ?? 0,         redVal: red?.damageDealt ?? 0,         format: v => `${(v/1000).toFixed(1)}K` },
            { label: 'CS',      blueVal: blue?.cs ?? 0,                  redVal: red?.cs ?? 0 },
            { label: 'OR',      blueVal: blue?.goldEarned ?? 0,          redVal: red?.goldEarned ?? 0,          format: v => `${(v/1000).toFixed(1)}K` },
          ],
          // SUPPORT : utility → vision / wards / assists
          UTILITY: [
            { label: 'VISION',  blueVal: blue?.visionScore ?? 0,         redVal: red?.visionScore ?? 0 },
            { label: 'WARDS',   blueVal: blue?.wardsPlaced ?? 0,         redVal: red?.wardsPlaced ?? 0 },
            { label: 'ASSISTS', blueVal: blue?.assists ?? 0,             redVal: red?.assists ?? 0 },
          ],
        }
        const stats = baseStats[role.riot] ?? []

        return (
          <div key={role.riot} style={{
            padding: '12px 10px', borderRadius: 8,
            background: 'rgba(255,255,255,0.02)',
            borderTop: `1px solid ${border}`, borderRight: `1px solid ${border}`,
            borderBottom: `1px solid ${border}`, borderLeft: `1px solid ${border}`,
            display: 'flex', flexDirection: 'column', alignItems: 'stretch',
          }}>
            {/* Header rôle (centré) */}
            <div style={{
              fontSize: 10, fontWeight: 700, letterSpacing: 1.5,
              color: 'var(--text-muted)', textAlign: 'center', marginBottom: 8,
            }}>
              {role.label}
            </div>

            {/* Champions face à face (parfaitement centrés) */}
            <div style={{
              display: 'flex', justifyContent: 'center', alignItems: 'center',
              gap: 12, marginBottom: 12,
            }}>
              <PlayerHead p={blue} side="blue" champMap={champMap} version={version} highlight={myTeamId === 100} />
              <span style={{ fontSize: 10, color: 'var(--text-dim)', fontWeight: 600 }}>VS</span>
              <PlayerHead p={red}  side="red"  champMap={champMap} version={version} highlight={myTeamId === 200} />
            </div>

            {/* Stats role-specific */}
            {stats.map(s => {
              const fmt   = s.format ?? ((v: number) => v.toLocaleString('fr-FR'))
              const blueWin = s.blueVal >= s.redVal
              const equal = s.blueVal === s.redVal
              return (
                <div key={s.label} style={{
                  display: 'flex', alignItems: 'center', gap: 6, fontSize: 11,
                  padding: '2px 0',
                }}>
                  <span style={{
                    flex: 1, textAlign: 'right',
                    color: !equal && blueWin ? '#3A8AC9' : 'var(--text-dim)',
                    fontWeight: !equal && blueWin ? 700 : 400,
                  }}>
                    {fmt(s.blueVal)}
                  </span>
                  <span style={{
                    fontSize: 9, color: 'var(--text-dim)',
                    textTransform: 'uppercase', letterSpacing: 1, minWidth: 56, textAlign: 'center',
                  }}>{s.label}</span>
                  <span style={{
                    flex: 1, textAlign: 'left',
                    color: !equal && !blueWin ? '#E24B4A' : 'var(--text-dim)',
                    fontWeight: !equal && !blueWin ? 700 : 400,
                  }}>
                    {fmt(s.redVal)}
                  </span>
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}

function PlayerHead({ p, side, champMap, version, highlight }: {
  p?: Participant; side: 'blue' | 'red'
  champMap: Record<number, ChampInfo>; version: string
  highlight?: boolean
}) {
  if (!p) return <div style={{ width: 32, height: 32, borderRadius: 4, background: '#222' }} />
  const champ = champMap[p.championId]
  const ring  = side === 'blue' ? '#3A8AC9' : '#E24B4A'
  return (
    <div title={p.riotIdGameName || champ?.name || p.championName} style={{
      width: 32, height: 32, borderRadius: 4, overflow: 'hidden',
      border: `2px solid ${ring}`,
      boxShadow: highlight ? `0 0 0 2px #EF9F27` : undefined,
    }}>
      {champ
        ? <img src={champImg(version, champ.image)} alt="" style={{ width: '100%', height: '100%', display: 'block' }} />
        : <div style={{ width: '100%', height: '100%', background: '#222' }} />}
    </div>
  )
}

function kdaScore(p?: Participant) {
  if (!p) return 0
  return p.deaths === 0 ? p.kills + p.assists + 5 : (p.kills + p.assists) / p.deaths
}
function kdaFmt(b?: Participant, r?: Participant) {
  return (v: number) => {
    // Affiche 'K/D/A' si applicable, sinon le ratio
    const target = v === kdaScore(b) ? b : v === kdaScore(r) ? r : null
    if (target) return `${target.kills}/${target.deaths}/${target.assists}`
    return v.toFixed(2)
  }
}

// ── Badge joueur avec tooltip explicatif au hover ──
function Badge({ info }: { info: BadgeInfo }) {
  const [hover, setHover] = useState(false)
  return (
    <span
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}
    >
      <span style={{
        fontSize: 9, fontWeight: 700, letterSpacing: 0.5,
        padding: '1px 5px', borderRadius: 3,
        background: info.bg ?? 'transparent',
        color: info.color, whiteSpace: 'nowrap', cursor: 'help',
      }}>{info.label}</span>
      {hover && (
        <div role="tooltip" style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 50,
          padding: '6px 10px', borderRadius: 5,
          background: 'rgba(8,5,18,0.97)',
          border: '1px solid rgba(127,119,221,0.4)',
          color: '#F5F2FA', fontSize: 11, fontWeight: 400, letterSpacing: 0,
          whiteSpace: 'nowrap',
          boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
          pointerEvents: 'none',
        }}>
          <strong style={{ color: info.bg ?? '#7F77DD' }}>{info.label}</strong>
          <span style={{ color: 'var(--text-dim)' }}> — </span>
          {info.desc}
        </div>
      )}
    </span>
  )
}

// ── Petite icône de drake typé (avec fallback emoji) ──
function DrakeIcon({ kind }: { kind: string; fallbackCount: number }) {
  const [failed, setFailed] = useState(false)
  if (failed) {
    return <span title={kind} style={{ fontSize: 14 }}>🐉</span>
  }
  return (
    <img src={`/icons/objectives/_${kind}.png`} title={kind}
      width={20} height={20} alt=""
      onError={() => setFailed(true)}
      style={{ display: 'block', objectFit: 'contain' }} />
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
