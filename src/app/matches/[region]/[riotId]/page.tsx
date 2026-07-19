'use client'

/**
 * Historique de parties public (F3) — /matches/[region]/GameName%23TAG
 *
 * Accessible sans connexion. Adapté de /summoner (profil public) en version
 * CENTRÉE SUR L'HISTORIQUE : on garde l'en-tête joueur + les badges de rang +
 * les stats résumées + la liste de matchs (façon op.gg/u.gg), et on retire les
 * blocs « profil » (cosmétiques Wyrm Forge, comparaison de rang Vue A/B) qui
 * restent la signature de /summoner.
 *
 * L'appel `riot-rank` est CONSERVÉ (avant `riot-matches`) : il amorce le cache
 * riot_cache pour que le harvest `harvestRankStats` lise le tier sans appel Riot
 * supplémentaire — même contrat que /summoner.
 *
 * Les lignes de match sont STATIQUES en Lot 1. Les actions par match
 * (« Développer » scoreboard inline + « Voir tous les détails » avec quota)
 * arrivent en Lot 2.
 */
import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import PlayerSearchBar from '@/components/player/PlayerSearchBar'
import { createClient } from '@/lib/supabase/client'
import type { MatchInfo, RankEntry, RankResponse } from '@/lib/riot-types'

const DDN      = 'https://ddragon.leagueoflegends.com'
const champImg = (v: string, img: string) => `${DDN}/cdn/${v}/img/champion/${img}`
const itemImg  = (v: string, id: number)  => `${DDN}/cdn/${v}/img/item/${id}.png`
const spellImg = (v: string, img: string) => `${DDN}/cdn/${v}/img/spell/${img}`
const runeImg  = (path: string)            => `${DDN}/cdn/img/${path}`

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPA_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const FN_URL   = (name: string, p: Record<string, string>) =>
  `${SUPA_URL}/functions/v1/${name}?${new URLSearchParams(p).toString()}`
const FN_HEADERS = { apikey: SUPA_KEY }

const supabase = createClient()

// Plafond de consultations détaillées/IP/h côté client — miroir de DETAIL_RATE_LIMIT
// (Edge Function detail-quota). Sert de valeur d'affichage tant que le peek n'a pas
// répondu ; l'autorité reste le serveur (le commit fait foi).
const DETAIL_LIMIT_FALLBACK = 10

const QUEUES: Record<number, string> = {
  420: 'Classée Solo/Duo', 440: 'Classée Flex',
  400: 'Normale Draft',    430: 'Normale Aveugle',
  450: 'ARAM',             900: 'URF',
  0: 'Personnalisée',      1700: 'Arena',
}

const POS: Record<string, string> = {
  TOP: 'TOP', JUNGLE: 'JGL', MIDDLE: 'MID', BOTTOM: 'ADC', UTILITY: 'SUP',
}

const TIER_COLORS: Record<string, string> = {
  IRON: '#5A5A5A', BRONZE: '#B87333', SILVER: '#A8A8A8', GOLD: '#E4A800',
  PLATINUM: '#4FCEAC', EMERALD: '#00BA57', DIAMOND: '#4A90D9',
  MASTER: '#9B4DCA', GRANDMASTER: '#E84057', CHALLENGER: '#F4E342',
}
const TIER_FR: Record<string, string> = {
  IRON: 'Fer', BRONZE: 'Bronze', SILVER: 'Argent', GOLD: 'Or',
  PLATINUM: 'Platine', EMERALD: 'Émeraude', DIAMOND: 'Diamant',
  MASTER: 'Maître', GRANDMASTER: 'Grand Maître', CHALLENGER: 'Challenger',
}

// Mappe les labels d'affichage vers les codes plateforme Riot (ex: EUW → euw1)
const REGION_ALIASES: Record<string, string> = {
  EUW: 'euw1', EUNE: 'eun1', NA: 'na1', KR: 'kr',
  BR: 'br1', JP: 'jp1', OCE: 'oc1', TR: 'tr1',
}

function fmt(secs: number) {
  const m = Math.floor(secs / 60), s = secs % 60
  return `${m}m${String(s).padStart(2, '0')}`
}
function timeAgo(ts: number) {
  const h = Math.floor((Date.now() - ts) / 3_600_000)
  if (h < 1) return 'il y a < 1h'
  if (h < 24) return `il y a ${h}h`
  return `il y a ${Math.floor(h / 24)}j`
}

interface ChampInfo { id: string; name: string; image: string }
interface SpellInfo { id: string; name: string; image: string }
interface RuneInfo  { id: number; name: string; icon: string }

// Badge de rang (Solo/Duo ou Flex) — présentation pure, hissé au scope module
// (aucune fermeture sur l'état du composant → pas de remount à chaque render).
function RankBadge({ e }: { e: RankEntry }) {
  const color  = TIER_COLORS[e.tier] ?? '#A1A1AA'
  const tierFr = TIER_FR[e.tier] ?? e.tier
  const hasRank = e.rank && !['MASTER','GRANDMASTER','CHALLENGER'].includes(e.tier)
  const wr  = e.wins + e.losses > 0 ? Math.round((e.wins / (e.wins + e.losses)) * 100) : null
  return (
    <div style={{
      padding: '8px 12px', borderRadius: 6,
      background: 'rgba(255,255,255,0.03)', border: `1px solid rgba(255,255,255,0.08)`,
      display: 'flex', flexDirection: 'column', gap: 2,
    }}>
      <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1 }}>
        {e.queueType === 'RANKED_SOLO_5x5' ? 'Solo/Duo' : 'Flex'}
      </div>
      <div style={{ fontSize: 14, fontWeight: 700, color }}>
        {tierFr}{hasRank ? ` ${e.rank}` : ''} — {e.lp} LP
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
        {e.wins}V {e.losses}D{wr !== null ? ` · ${wr}% WR` : ''}
        {e.hotStreak && <span style={{ marginLeft: 6, color: '#E24B4A', fontSize: 10 }}>🔥</span>}
      </div>
    </div>
  )
}

// Bouton « Voir tous les détails » d'une ligne de match (F3 Lot 2).
// Connecté → accès illimité (aucun compteur). Anonyme → affiche le quota restant
// « X/10 » (peek), grisé si épuisé. Un match déjà consulté dans la fenêtre est
// gratuit (label neutre). Présentation pure — la logique de commit vit dans onOpen.
function DetailButton({ matchId, isConnected, alreadyViewed, remaining, limit, onOpen }: {
  matchId: string
  isConnected: boolean | null
  alreadyViewed: boolean
  remaining: number | null
  limit: number
  onOpen: (matchId: string) => void
}) {
  const anon      = isConnected === false
  const exhausted = anon && !alreadyViewed && remaining !== null && remaining <= 0

  let label: string
  let title: string | undefined
  if (!anon) {
    label = 'Voir tous les détails'
  } else if (alreadyViewed) {
    label = 'Voir les détails'
    title = 'Déjà consulté — ne recompte pas dans ton quota.'
  } else if (exhausted) {
    label = `Quota atteint (0/${limit})`
    title = 'Limite de consultations détaillées atteinte. Réessaie dans une heure.'
  } else {
    label = `Voir les détails · ${remaining ?? limit}/${limit}`
    title = `Il te reste ${remaining ?? limit} consultation${(remaining ?? limit) > 1 ? 's' : ''} détaillée${(remaining ?? limit) > 1 ? 's' : ''} cette heure.`
  }

  return (
    <button
      onClick={() => { if (!exhausted) onOpen(matchId) }}
      disabled={exhausted}
      title={title}
      style={{
        padding: '5px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600,
        whiteSpace: 'nowrap',
        cursor: exhausted ? 'not-allowed' : 'pointer',
        background: exhausted ? 'rgba(255,255,255,0.03)' : 'rgba(127,119,221,0.10)',
        border: exhausted ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(127,119,221,0.30)',
        color: exhausted ? 'var(--text-dim)' : '#B9B2F0',
        transition: 'background 120ms',
      }}
      onMouseEnter={e => { if (!exhausted) e.currentTarget.style.background = 'rgba(127,119,221,0.22)' }}
      onMouseLeave={e => { if (!exhausted) e.currentTarget.style.background = 'rgba(127,119,221,0.10)' }}
    >
      {label}
    </button>
  )
}

export default function MatchesPage() {
  const { region: rawRegion, riotId: riotIdEncoded } =
    useParams<{ region: string; riotId: string }>()
  const router = useRouter()

  // Normalise la région : accepte les labels (EUW) et les codes plateforme (euw1)
  const region   = REGION_ALIASES[(rawRegion ?? '').toUpperCase()] ?? rawRegion ?? 'euw1'
  const riotId   = decodeURIComponent(riotIdEncoded ?? '')
  const hashIdx  = riotId.indexOf('#')
  const gameName = hashIdx >= 0 ? riotId.slice(0, hashIdx) : riotId
  const tagLine  = hashIdx >= 0 ? riotId.slice(hashIdx + 1) : ''

  // DDragon
  const [version,  setVersion]  = useState('')
  const [champMap, setChampMap] = useState<Record<number, ChampInfo>>({})
  const [spellMap, setSpellMap] = useState<Record<number, SpellInfo>>({})
  const [runeMap,  setRuneMap]  = useState<Record<number, RuneInfo>>({})

  // Données joueur
  const [rankData, setRankData] = useState<RankResponse | null>(null)
  const [matches,  setMatches]  = useState<MatchInfo[]>([])
  const [profileIconId, setProfileIconId] = useState(29)
  const [summonerLevel, setSummonerLevel] = useState<number | null>(null)
  const [searchedPuuid, setSearchedPuuid] = useState('')

  // Quota détail (F3 Lot 2) — non-connectés uniquement. Un connecté a un accès
  // illimité au détail : pas de peek, pas de compteur affiché.
  const [isConnected,    setIsConnected]    = useState<boolean | null>(null)
  const [detailLimit,    setDetailLimit]    = useState(DETAIL_LIMIT_FALLBACK)
  const [detailRemaining,setDetailRemaining]= useState<number | null>(null)
  const [viewedIds,      setViewedIds]      = useState<Set<string>>(new Set())
  const [quotaError,     setQuotaError]     = useState('')

  // États de chargement
  const [loadingInit,    setLoadingInit]    = useState(true)
  const [loadingMore,    setLoadingMore]    = useState(false)
  const [reachedEnd,     setReachedEnd]     = useState(false)
  const [matchError,     setMatchError]     = useState('')
  const [rankError,      setRankError]      = useState('')
  const [userScrolled,   setUserScrolled]   = useState(false)

  const inFlightRef = useRef(false)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const PAGE_SIZE = 10
  const MAX_TOTAL = 100

  // DDragon + rank + premier batch de matchs
  useEffect(() => {
    if (!gameName || !tagLine || !region) return
    let cancelled = false

    async function init() {
      setLoadingInit(true)
      setMatches([]); setReachedEnd(false); setMatchError(''); setRankError('')

      try {
        // DDragon
        const vRes = await fetch(`${DDN}/api/versions.json`)
        const versions: string[] = await vRes.json()
        const v = versions[0]
        setVersion(v)

        const [cRes, sRes, rRes] = await Promise.all([
          fetch(`${DDN}/cdn/${v}/data/fr_FR/champion.json`),
          fetch(`${DDN}/cdn/${v}/data/fr_FR/summoner.json`),
          fetch(`${DDN}/cdn/${v}/data/fr_FR/runesReforged.json`),
        ])
        const [cData, sData, rData] = await Promise.all([cRes.json(), sRes.json(), rRes.json()])

        if (cancelled) return

        const cm: Record<number, ChampInfo> = {}
        Object.values(cData.data).forEach((ch: any) => {
          cm[Number(ch.key)] = { id: ch.id, name: ch.name, image: ch.image.full }
        })
        setChampMap(cm)

        const sm: Record<number, SpellInfo> = {}
        Object.values(sData.data).forEach((sp: any) => {
          sm[Number(sp.key)] = { id: sp.id, name: sp.name, image: sp.image.full }
        })
        setSpellMap(sm)

        const rm: Record<number, RuneInfo> = {}
        rData.forEach((tree: any) => {
          rm[tree.id] = { id: tree.id, name: tree.name, icon: tree.icon }
          tree.slots?.forEach((slot: any) =>
            slot.runes?.forEach((rune: any) => {
              rm[rune.id] = { id: rune.id, name: rune.name, icon: rune.icon }
            })
          )
        })
        setRuneMap(rm)

        // 1. Rang d'abord — amorce le cache riot_cache avant l'appel riot-matches,
        //    pour que le harvest harvestRankStats puisse y lire le tier immédiatement.
        const rankRes = await fetch(FN_URL('riot-rank', { gameName, tagLine, platform: region }), { headers: FN_HEADERS })
        if (cancelled) return

        if (rankRes.ok) {
          const rd = await rankRes.json() as RankResponse
          setRankData(rd)
          setProfileIconId(rd.profileIconId ?? 29)
          setSummonerLevel(rd.summonerLevel ?? null)
        } else {
          setRankError('Rang indisponible.')
        }

        // 2. Matches ensuite — le harvest côté Edge Function lira le rang depuis le cache
        const matchRes = await fetch(FN_URL('riot-matches', { gameName, tagLine, platform: region, count: String(PAGE_SIZE) }), { headers: FN_HEADERS })
        if (cancelled) return

        if (matchRes.ok) {
          const md = await matchRes.json()
          const list: MatchInfo[] = md.matches ?? []
          setMatches(list)
          if (typeof md.puuid === 'string') setSearchedPuuid(md.puuid) // highlight sur /match
          if (list.length < PAGE_SIZE) setReachedEnd(true)
        } else if (matchRes.status === 404) {
          setMatchError('Invocateur introuvable. Vérifie le Riot ID et la région.')
        } else if (matchRes.status === 429) {
          // Le limiteur soutenu (recherche) renvoie retry_after_s → message « X minutes ».
          // L'ancien limiteur rafale (20/min) n'a pas ce champ → repli « une minute ».
          const body = await matchRes.json().catch(() => null)
          const secs = body?.retry_after_s
          if (typeof secs === 'number' && secs > 0) {
            const mins = Math.max(1, Math.ceil(secs / 60))
            setMatchError(`Trop de recherches — réessaie dans ${mins} minute${mins > 1 ? 's' : ''}.`)
          } else {
            setMatchError('Trop de requêtes — réessaie dans une minute.')
          }
        } else if (matchRes.status === 503) {
          setMatchError('Service temporairement indisponible.')
        } else {
          setMatchError('Impossible de charger les parties.')
        }
      } catch {
        if (!cancelled) setMatchError('Erreur réseau.')
      } finally {
        if (!cancelled) setLoadingInit(false)
      }
    }

    init()
    return () => { cancelled = true }
  }, [region, gameName, tagLine])

  async function loadMore(start: number) {
    if (inFlightRef.current || reachedEnd || !gameName || !tagLine) return
    inFlightRef.current = true
    setLoadingMore(true)
    try {
      const res = await fetch(
        FN_URL('riot-matches', { gameName, tagLine, platform: region, count: String(PAGE_SIZE), start: String(start) }),
        { headers: FN_HEADERS },
      )
      if (!res.ok) return
      const md = await res.json()
      const list: MatchInfo[] = md.matches ?? []
      setMatches(prev => [...prev, ...list])
      if (list.length < PAGE_SIZE) setReachedEnd(true)
    } finally {
      setLoadingMore(false)
      inFlightRef.current = false
    }
  }

  // Quota détail : détecte la session puis, pour un visiteur anonyme, lit (PEEK,
  // sans incrément) le quota restant pour l'afficher « X/10 » sur chaque bouton.
  useEffect(() => {
    let cancelled = false
    async function initQuota() {
      const { data: { session } } = await supabase.auth.getSession()
      if (cancelled) return
      const connected = !!session
      setIsConnected(connected)
      if (connected) return // accès illimité : ni peek ni compteur

      try {
        const res = await fetch(FN_URL('detail-quota', {}), { headers: FN_HEADERS })
        if (cancelled || !res.ok) return
        const q = await res.json()
        if (typeof q.limit === 'number')     setDetailLimit(q.limit)
        if (typeof q.remaining === 'number') setDetailRemaining(q.remaining)
        if (Array.isArray(q.viewed))         setViewedIds(new Set(q.viewed))
      } catch {
        // fail-open : on ne bloque pas l'affichage si le peek échoue.
      }
    }
    initQuota()
    return () => { cancelled = true }
  }, [])

  // Clic « Voir tous les détails ». Connecté → navigation directe. Anonyme →
  // COMMIT (incrément) avant de naviguer : évite tout 429 surprise sur /match.
  // Re-consulter un match déjà vu dans la fenêtre est gratuit (idempotent).
  async function openDetail(matchId: string) {
    setQuotaError('')
    const target = `/match/${region}/${matchId}${searchedPuuid ? `?puuid=${searchedPuuid}` : ''}`

    if (isConnected) { router.push(target); return }
    if (viewedIds.has(matchId)) { router.push(target); return } // déjà compté → gratuit
    if (detailRemaining !== null && detailRemaining <= 0) {
      setQuotaError(`Quota de consultations détaillées atteint (0/${detailLimit}). Réessaie dans une heure.`)
      return
    }

    try {
      const res = await fetch(FN_URL('detail-quota', {}), {
        method: 'POST',
        headers: { ...FN_HEADERS, 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchId }),
      })
      if (res.status === 429) {
        setDetailRemaining(0)
        setQuotaError(`Quota de consultations détaillées atteint (0/${detailLimit}). Réessaie dans une heure.`)
        return
      }
      if (!res.ok) { setQuotaError('Impossible d\'ouvrir le détail. Réessaie.'); return }
      const q = await res.json()
      setViewedIds(prev => new Set(prev).add(matchId))
      if (typeof q.remaining === 'number') setDetailRemaining(q.remaining)
      router.push(target)
    } catch {
      setQuotaError('Erreur réseau. Réessaie.')
    }
  }

  useEffect(() => {
    if (userScrolled) return
    const onScroll = () => setUserScrolled(true)
    window.addEventListener('scroll', onScroll, { once: true, passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [userScrolled])

  useEffect(() => {
    if (!sentinelRef.current || !userScrolled || reachedEnd || loadingMore) return
    const obs = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && matches.length > 0 && matches.length < MAX_TOTAL)
        loadMore(matches.length)
    }, { rootMargin: '200px' })
    obs.observe(sentinelRef.current)
    return () => obs.disconnect()
  }, [userScrolled, reachedEnd, loadingMore, matches.length])

  const soloEntry  = rankData?.entries.find(e => e.queueType === 'RANKED_SOLO_5x5')
  const flexEntry  = rankData?.entries.find(e => e.queueType === 'RANKED_FLEX_SR')

  // Riot ID invalide (pas de #) → message d'erreur sans crash réseau
  if (!tagLine) {
    return (
      <main style={{
        minHeight: '100vh', padding: '24px clamp(12px, 4vw, 40px)',
        maxWidth: 1100, margin: '0 auto', color: '#F5F2FA',
      }}>
        <button onClick={() => router.back()} style={{
          background: 'transparent', border: 'none', cursor: 'pointer',
          color: 'var(--text-muted)', fontSize: 13, padding: '6px 0',
          marginBottom: 20, display: 'flex', alignItems: 'center', gap: 6,
        }}>← Retour</button>
        <div style={{ marginBottom: 28 }}>
          <PlayerSearchBar basePath="/matches" defaultRegion={region} />
        </div>
        <div style={{
          padding: '14px 18px', borderRadius: 8, fontSize: 13,
          background: 'rgba(226,75,74,0.08)', border: '1px solid rgba(226,75,74,0.3)',
          color: '#E24B4A',
        }}>
          Format invalide. Utilise : /matches/[région]/GameName%23TAG
        </div>
      </main>
    )
  }

  return (
    <main style={{
      minHeight: '100vh', padding: '24px clamp(12px, 4vw, 40px)',
      maxWidth: 1100, margin: '0 auto', color: '#F5F2FA',
    }}>
      {/* Retour */}
      <button onClick={() => router.back()} style={{
        background: 'transparent', border: 'none', cursor: 'pointer',
        color: 'var(--text-muted)', fontSize: 13, padding: '6px 0',
        marginBottom: 20, display: 'flex', alignItems: 'center', gap: 6,
      }}>← Retour</button>

      {/* Barre de recherche */}
      <div style={{ marginBottom: 28 }}>
        <PlayerSearchBar basePath="/matches" defaultRegion={region} defaultRiotId={`${gameName}#${tagLine}`} />
      </div>

      {loadingInit && (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>Chargement…</div>
      )}

      {!loadingInit && (
        <>
          {/* En-tête joueur */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
            padding: '18px 20px', borderRadius: 12, marginBottom: 20,
            background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)',
          }}>
            <div style={{ position: 'relative', flexShrink: 0, width: 72, height: 72 }}>
              {version && (
                <img
                  src={`${DDN}/cdn/${version}/img/profileicon/${profileIconId}.png`}
                  alt=""
                  style={{ width: 72, height: 72, borderRadius: 10, display: 'block',
                           border: '2px solid rgba(255,255,255,0.12)' }}
                  onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                />
              )}
            </div>

            <div style={{ flex: 1, minWidth: 180 }}>
              <div style={{ fontSize: 22, fontWeight: 800 }}>
                {gameName}
                <span style={{ color: 'var(--text-dim)', fontWeight: 400, fontSize: 18 }}>#{tagLine}</span>
              </div>
              {summonerLevel !== null && (
                <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2 }}>
                  Niveau {summonerLevel}
                </div>
              )}
              {rankError && <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>{rankError}</div>}
            </div>
            {(soloEntry || flexEntry) && (
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {soloEntry && <RankBadge e={soloEntry} />}
                {flexEntry && <RankBadge e={flexEntry} />}
              </div>
            )}
            {!soloEntry && !flexEntry && !rankError && (
              <div style={{ fontSize: 12, color: 'var(--text-dim)', fontStyle: 'italic' }}>Non classé</div>
            )}
          </div>

          {/* Erreur matchs */}
          {matchError && (
            <div style={{
              padding: '14px 18px', borderRadius: 8, fontSize: 13,
              background: 'rgba(226,75,74,0.08)', border: '1px solid rgba(226,75,74,0.3)',
              color: '#E24B4A', marginBottom: 16,
            }}>{matchError}</div>
          )}

          {/* Quota détail épuisé / erreur d'ouverture (F3 Lot 2) */}
          {quotaError && (
            <div style={{
              padding: '12px 16px', borderRadius: 8, fontSize: 13,
              background: 'rgba(239,159,39,0.08)', border: '1px solid rgba(239,159,39,0.35)',
              color: '#EF9F27', marginBottom: 16,
            }}>{quotaError}</div>
          )}

          {/* Stats résumées */}
          {matches.length > 0 && (() => {
            const wins  = matches.filter(m => m.win).length
            const total = matches.length
            const wr    = Math.round((wins / total) * 100)
            const avgKda = ((matches.reduce((s, m) => s + m.kills + m.assists, 0) / total) /
                            Math.max(matches.reduce((s, m) => s + m.deaths, 0) / total, 1)).toFixed(2)
            return (
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
                {[
                  { label: 'Parties',  value: String(total) },
                  { label: 'W/L',      value: `${wins}V ${total - wins}D`, color: wins > total - wins ? '#5DCAA5' : '#E24B4A' },
                  { label: 'Winrate',  value: `${wr}%`, color: wr >= 50 ? '#5DCAA5' : '#E24B4A' },
                  { label: 'KDA moy.', value: avgKda },
                ].map((s, i) => (
                  <div key={i} style={{
                    padding: '10px 14px', borderRadius: 8,
                    background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)',
                    minWidth: 100,
                  }}>
                    <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 3 }}>
                      {s.label}
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 600, color: (s as any).color ?? '#F5F2FA' }}>{s.value}</div>
                  </div>
                ))}
              </div>
            )
          })()}

          {/* Liste des matchs — lignes statiques en Lot 1 (actions détail → Lot 2) */}
          {matches.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {matches.map(m => {
                const champ    = champMap[m.championId]
                const summ1    = spellMap[m.summoner1Id]
                const summ2    = spellMap[m.summoner2Id]
                const keystone = m.keystoneId ? runeMap[m.keystoneId] : undefined
                const seconday = m.secondaryStyleId ? runeMap[m.secondaryStyleId] : undefined
                const csPerMin = m.duration > 0 ? (m.cs / (m.duration / 60)).toFixed(1) : '0'
                const kp       = (m.teamKills ?? 0) > 0 ? Math.round(((m.kills + m.assists) / m.teamKills) * 100) : null
                const multiKill = (m.pentaKills ?? 0) > 0 ? 'PENTAKILL' : (m.quadraKills ?? 0) > 0 ? 'QUADRA' : (m.tripleKills ?? 0) > 0 ? 'TRIPLE' : null
                const winColor = m.win ? '#5DCAA5' : '#E24B4A'
                const items    = [...(m.items ?? []), m.trinket ?? 0]

                return (
                  <div
                    key={m.matchId}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
                      padding: '10px 14px', borderRadius: 8,
                      background: '#18181B',
                      borderTop: '1px solid #27272A', borderRight: '1px solid #27272A',
                      borderBottom: '1px solid #27272A', borderLeft: `3px solid ${winColor}`,
                    }}
                  >
                    {/* Champion + sorts + runes */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                      {champ && version ? (
                        <img src={champImg(version, champ.image)} alt={champ.name}
                          style={{ width: 48, height: 48, borderRadius: 6, objectFit: 'cover' }} />
                      ) : (
                        <div style={{
                          width: 48, height: 48, borderRadius: 6,
                          background: 'linear-gradient(135deg,#7F77DD,#534AB7)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 13, fontWeight: 600, color: 'white',
                        }}>{m.championName?.slice(0, 2) ?? '?'}</div>
                      )}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        {summ1 && version && <img src={spellImg(version, summ1.image)} alt="" title={summ1.name}
                          style={{ width: 22, height: 22, borderRadius: 4 }} />}
                        {summ2 && version && <img src={spellImg(version, summ2.image)} alt="" title={summ2.name}
                          style={{ width: 22, height: 22, borderRadius: 4 }} />}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        {keystone && <img src={runeImg(keystone.icon)} alt="" title={keystone.name}
                          style={{ width: 22, height: 22, borderRadius: '50%', background: '#0a0612' }} />}
                        {seconday && <img src={runeImg(seconday.icon)} alt="" title={seconday.name}
                          style={{ width: 22, height: 22, borderRadius: '50%', background: '#0a0612', padding: 2 }} />}
                      </div>
                    </div>

                    {/* Champion + file + position */}
                    <div style={{ flex: '0 1 130px', minWidth: 110 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#F5F2FA', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {champ?.name ?? m.championName}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-dim)', display: 'flex', gap: 5 }}>
                        <span>{QUEUES[m.queueId] ?? m.queueName ?? 'Partie'}</span>
                        {POS[m.position] && <><span>·</span><span style={{ color: '#7F77DD', fontWeight: 600 }}>{POS[m.position]}</span></>}
                      </div>
                    </div>

                    {/* KDA */}
                    <div style={{ flex: '0 0 auto', textAlign: 'center', minWidth: 90 }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>
                        {m.kills} / <span style={{ color: '#E24B4A' }}>{m.deaths}</span> / {m.assists}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                        {(m.deaths === 0 ? (m.kills + m.assists) : ((m.kills + m.assists) / m.deaths)).toFixed(2)} KDA
                        {kp !== null && <> · <span style={{ color: '#EF9F27' }}>{kp}% KP</span></>}
                      </div>
                    </div>

                    {/* CS */}
                    <div style={{ flex: '0 0 auto', textAlign: 'center', minWidth: 80 }}>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        {m.cs} CS <span style={{ color: 'var(--text-dim)' }}>({csPerMin}/min)</span>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>Vision {m.visionScore}</div>
                    </div>

                    {/* Items */}
                    <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                      {items.map((id, i) => (
                        <div key={i} style={{
                          width: 24, height: 24, borderRadius: 4,
                          background: id ? 'transparent' : 'rgba(255,255,255,0.05)',
                          border: id ? 'none' : '1px dashed #27272A',
                        }}>
                          {id > 0 && version && (
                            <img src={itemImg(version, id)} alt=""
                              style={{ width: 24, height: 24, borderRadius: 4, display: 'block' }}
                              onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Résultat + durée + bouton détail */}
                    <div style={{
                      marginLeft: 'auto', flexShrink: 0,
                      display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6,
                    }}>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: winColor }}>
                          {m.win ? 'Victoire' : 'Défaite'}
                          {multiKill && (
                            <span style={{ marginLeft: 6, padding: '1px 6px', borderRadius: 3, fontSize: 9, background: '#EF9F27', color: '#1a0d2e' }}>
                              {multiKill}
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                          {fmt(m.duration)} · {timeAgo(m.gameCreation)}
                        </div>
                      </div>
                      <DetailButton
                        matchId={m.matchId}
                        isConnected={isConnected}
                        alreadyViewed={viewedIds.has(m.matchId)}
                        remaining={detailRemaining}
                        limit={detailLimit}
                        onOpen={openDetail}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          ) : !matchError ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-dim)', fontSize: 13 }}>
              Aucune partie trouvée.
            </div>
          ) : null}

          {/* Sentinel + infinite scroll */}
          {matches.length > 0 && (
            <div ref={sentinelRef} style={{ textAlign: 'center', marginTop: 12, minHeight: 40 }}>
              {loadingMore && (
                <div style={{ color: 'var(--text-muted)', fontSize: 12, padding: '10px 0' }}>Chargement…</div>
              )}
              {!loadingMore && !reachedEnd && matches.length < MAX_TOTAL && (
                <button
                  onClick={() => loadMore(matches.length)}
                  style={{
                    padding: '8px 18px', borderRadius: 6, fontSize: 12,
                    cursor: 'pointer', background: 'rgba(127,119,221,0.08)',
                    border: '1px solid rgba(127,119,221,0.25)', color: 'var(--text-muted)',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(127,119,221,0.2)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'rgba(127,119,221,0.08)' }}
                >
                  Charger {PAGE_SIZE} parties de plus
                </button>
              )}
              {reachedEnd && (
                <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                  Fin de l&apos;historique — {matches.length} parties affichées
                </div>
              )}
            </div>
          )}
        </>
      )}
    </main>
  )
}
