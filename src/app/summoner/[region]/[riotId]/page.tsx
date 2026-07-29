'use client'

import React, { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import PlayerSearchBar from '@/components/player/PlayerSearchBar'
import type { MatchInfo, RankEntry, RankResponse } from '@/lib/riot-types'

// DDragon : cartes + URLs partagées (Lot D3) — ce bloc était recopié à
// l'identique ici, dans /match et dans /matches.
import {
  loadDDragonMaps, champImg, itemImg, spellImg, runeImg, profileIconImg,
  type ChampInfo, type SpellInfo, type RuneInfo,
} from '@/lib/ddragon'
// Libellés + couleurs des rangs LoL — table partagée (Lot D4). Ne pas
// confondre avec les couleurs des tiers d'abonnement Wyrm Forge.
import { TIER_COLORS, TIER_FR } from '@/lib/lol-tiers'

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPA_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const FN_URL   = (name: string, p: Record<string, string>) =>
  `${SUPA_URL}/functions/v1/${name}?${new URLSearchParams(p).toString()}`
const FN_HEADERS = { apikey: SUPA_KEY }

const QUEUES: Record<number, string> = {
  420: 'Classée Solo/Duo', 440: 'Classée Flex',
  400: 'Normale Draft',    430: 'Normale Aveugle',
  450: 'ARAM',             900: 'URF',
  0: 'Personnalisée',      1700: 'Arena',
}

const POS: Record<string, string> = {
  TOP: 'TOP', JUNGLE: 'JGL', MIDDLE: 'MID', BOTTOM: 'ADC', UTILITY: 'SUP',
}

// Distribution de rang Solo Queue — LeagueOfGraphs · S1 2026 · Avr. 2026
const TIER_PCT: Record<string, number> = {
  IRON: 2.6, BRONZE: 16, SILVER: 23, GOLD: 24,
  PLATINUM: 18, EMERALD: 11, DIAMOND: 3.7,
  MASTER: 1.1, GRANDMASTER: 0.073, CHALLENGER: 0.031,
}
const TIER_ORDER_P = ['IRON','BRONZE','SILVER','GOLD','PLATINUM','EMERALD','DIAMOND','MASTER','GRANDMASTER','CHALLENGER']
const DIV_ORDER    = ['IV','III','II','I']

// Mappe les labels d'affichage vers les codes plateforme Riot (ex: EUW → euw1)
const REGION_ALIASES: Record<string, string> = {
  EUW: 'euw1', EUNE: 'eun1', NA: 'na1', KR: 'kr',
  BR: 'br1', JP: 'jp1', OCE: 'oc1', TR: 'tr1',
}

function computeTopPercent(tier: string, rank: string): number {
  const tierPct = TIER_PCT[tier] ?? 0
  const idx     = TIER_ORDER_P.indexOf(tier)
  if (idx === -1) return 50
  const below     = TIER_ORDER_P.slice(0, idx).reduce((s, t) => s + (TIER_PCT[t] ?? 0), 0)
  const hasDivs   = !['MASTER','GRANDMASTER','CHALLENGER'].includes(tier)
  const divFrac   = hasDivs ? tierPct / 4 : 0
  const divIdx    = hasDivs ? (DIV_ORDER.indexOf(rank) >= 0 ? DIV_ORDER.indexOf(rank) : 0) : 0
  const belowPct  = below + (hasDivs ? divIdx * divFrac + divFrac / 2 : tierPct / 2)
  return Math.max(0.01, Math.min(99.99, 100 - belowPct))
}

interface RankAvg {
  sample_count: number
  avg_kills: number; avg_deaths: number; avg_assists: number
  avg_cs_per_min: number; avg_vision_score: number
  avg_damage_dealt: number; avg_gold_earned: number
  avg_winrate: number
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

export default function SummonerPage() {
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
  const [puuid,    setPuuid]    = useState('')
  const [profileIconId, setProfileIconId] = useState(29)
  const [summonerLevel, setSummonerLevel] = useState<number | null>(null)

  // États de chargement
  const [loadingInit,    setLoadingInit]    = useState(true)
  const [loadingMatches, setLoadingMatches] = useState(false)
  const [loadingMore,    setLoadingMore]    = useState(false)
  const [reachedEnd,     setReachedEnd]     = useState(false)
  const [matchError,     setMatchError]     = useState('')
  const [rankError,      setRankError]      = useState('')
  const [userScrolled,   setUserScrolled]   = useState(false)

  // Cosmétiques Wyrm Forge équipés par ce joueur (liés via riot_puuid)
  interface CosmeticItem { slug: string; name: string; image_url: string | null }
  interface EquippedCosmetics {
    badges:        CosmeticItem[]   // jusqu'à 5
    avatar?:       CosmeticItem
    avatar_frame?: CosmeticItem
  }
  const [cosmetics, setCosmetics] = useState<EquippedCosmetics>({ badges: [] })

  // Comparaison de rang
  const [rankAvg,        setRankAvg]        = useState<RankAvg | null>(null)
  const [rankAvgLoading, setRankAvgLoading] = useState(false)
  const [dominantRole,   setDominantRole]   = useState('')
  const [compTab,        setCompTab]        = useState<'percentile' | 'vs-rang'>('percentile')

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
      setMatches([]); setPuuid(''); setReachedEnd(false); setMatchError(''); setRankError('')
      // Reset des états de comparaison de rang
      setRankAvg(null); setRankAvgLoading(false); setDominantRole(''); setCompTab('percentile')
      setCosmetics({ badges: [] })

      try {
        // DDragon — loader partagé et mémoïsé (une seule salve réseau par
        // session, au lieu d'un rechargement complet à chaque navigation).
        const dd = await loadDDragonMaps()
        if (cancelled) return
        setVersion(dd.version)
        setChampMap(dd.champs)
        setSpellMap(dd.spells)
        setRuneMap(dd.runes)

        // 1. Rang d'abord — peuple le cache riot_cache avant l'appel riot-matches,
        //    pour que le harvest harvestRankStats puisse y lire le tier immédiatement.
        const rankRes = await fetch(FN_URL('riot-rank', { gameName, tagLine, platform: region }), { headers: FN_HEADERS })
        if (cancelled) return

        // Premier puuid résolu, depuis rang OU matches selon ce qui répond en premier
        let resolvedPuuid = ''
        // Entries de rang conservées pour le fetch Vue B plus bas
        let rd: RankResponse | null = null

        if (rankRes.ok) {
          rd = await rankRes.json() as RankResponse
          resolvedPuuid = rd.puuid
          setRankData(rd); setPuuid(rd.puuid)
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
          if (!resolvedPuuid) resolvedPuuid = md.puuid ?? ''
          setPuuid(p => p || (md.puuid ?? ''))
          const list: MatchInfo[] = md.matches ?? []
          setMatches(list)
          if (list.length < PAGE_SIZE) setReachedEnd(true)

          // Rôle dominant : on préfère Solo/Duo, puis Flex, pour trouver le rôle joué le plus souvent
          const soloMatchesPos = list.filter(m => m.queueId === 420 && m.position)
          const flexMatchesPos = list.filter(m => m.queueId === 440 && m.position)
          const posArr  = soloMatchesPos.length > 0 ? soloMatchesPos : flexMatchesPos
          const roleQueue = soloMatchesPos.length > 0 ? 420 : 440
          const posCount: Record<string, number> = {}
          posArr.forEach(m => { posCount[m.position] = (posCount[m.position] ?? 0) + 1 })
          const domRole = Object.entries(posCount).sort((a, b) => b[1] - a[1])[0]?.[0] ?? ''
          if (!cancelled) setDominantRole(domRole)

          // Fetch Vue B (agrégats par rang) — non bloquant, les stats sont optionnelles
          const rankEntries = rd?.entries ?? []
          const soloTierLocal = rankEntries.find((e: any) => e.queueType === 'RANKED_SOLO_5x5')?.tier
          const flexTierLocal = rankEntries.find((e: any) => e.queueType === 'RANKED_FLEX_SR')?.tier
          const tierForQ = roleQueue === 420 ? soloTierLocal : flexTierLocal

          if (domRole && tierForQ) {
            setRankAvgLoading(true)
            fetch(`${SUPA_URL}/rest/v1/rpc/get_rank_avg`, {
              method: 'POST',
              headers: { ...FN_HEADERS, 'Content-Type': 'application/json' },
              body: JSON.stringify({ p_region: region, p_queue: roleQueue, p_tier: tierForQ, p_role: domRole }),
            })
              .then(r => r.ok ? r.json() : [])
              .then((rows: RankAvg[]) => { if (!cancelled) setRankAvg(rows[0] ?? null) })
              .catch(() => {})
              .finally(() => { if (!cancelled) setRankAvgLoading(false) })
          }
        } else if (matchRes.status === 404) {
          setMatchError('Invocateur introuvable. Vérifie le Riot ID et la région.')
        } else if (matchRes.status === 429) {
          setMatchError('Trop de requêtes — réessaie dans une minute.')
        } else if (matchRes.status === 503) {
          setMatchError('Service temporairement indisponible.')
        } else {
          setMatchError('Impossible de charger les parties.')
        }

        // Cosmétiques Wyrm Forge — fire-and-forget, indépendant du rang.
        // Déclenché dès qu'un puuid est résolu (rang ou matches), jamais bloquant.
        if (resolvedPuuid && !cancelled) {
          fetch(`${SUPA_URL}/rest/v1/rpc/get_equipped_cosmetics`, {
            method:  'POST',
            headers: { ...FN_HEADERS, 'Content-Type': 'application/json' },
            body: JSON.stringify({ p_puuid: resolvedPuuid }),
          })
            .then(r => r.ok ? r.json() : [])
            .then((rows: Array<{ type: string; slug: string; name: string; image_url: string | null }>) => {
              if (cancelled) return
              const c: EquippedCosmetics = { badges: [] }
              for (const row of rows) {
                if (row.type === 'badge')        c.badges.push(row)
                if (row.type === 'avatar')       c.avatar       = row
                if (row.type === 'avatar_frame') c.avatar_frame = row
              }
              setCosmetics(c)
            })
            .catch(() => {}) // non lié / aucun équipé → dégradation silencieuse
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

  useEffect(() => {
    if (userScrolled) return
    const onScroll = () => setUserScrolled(true)
    window.addEventListener('scroll', onScroll, { once: true, passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [userScrolled])

  useEffect(() => {
    if (!sentinelRef.current || !userScrolled || reachedEnd || loadingMatches || loadingMore) return
    const obs = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && matches.length > 0 && matches.length < MAX_TOTAL)
        loadMore(matches.length)
    }, { rootMargin: '200px' })
    obs.observe(sentinelRef.current)
    return () => obs.disconnect()
  }, [userScrolled, reachedEnd, loadingMatches, loadingMore, matches.length])

  const soloEntry  = rankData?.entries.find(e => e.queueType === 'RANKED_SOLO_5x5')
  const flexEntry  = rankData?.entries.find(e => e.queueType === 'RANKED_FLEX_SR')
  const isLoading  = loadingInit

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
          <PlayerSearchBar defaultRegion={region} />
        </div>
        <div style={{
          padding: '14px 18px', borderRadius: 8, fontSize: 13,
          background: 'rgba(226,75,74,0.08)', border: '1px solid rgba(226,75,74,0.3)',
          color: '#E24B4A',
        }}>
          Format invalide. Utilise : /summoner/[région]/GameName%23TAG
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
        <PlayerSearchBar defaultRegion={region} defaultRiotId={`${gameName}#${tagLine}`} />
      </div>

      {isLoading && (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>Chargement…</div>
      )}

      {!isLoading && (
        <>
          {/* En-tête joueur */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
            padding: '18px 20px', borderRadius: 12, marginBottom: 20,
            background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)',
          }}>
            {/* Photo de profil — priorité : avatar Wyrm Forge > icône DDragon */}
            <div style={{ position: 'relative', flexShrink: 0, width: 72, height: 72 }}>
              {cosmetics.avatar?.image_url ? (
                <img
                  src={cosmetics.avatar.image_url}
                  alt={cosmetics.avatar.name}
                  style={{ width: 72, height: 72, borderRadius: 10, display: 'block',
                           border: '2px solid rgba(255,255,255,0.12)', objectFit: 'cover' }}
                />
              ) : version ? (
                <img
                  src={profileIconImg(version, profileIconId)}
                  alt=""
                  style={{ width: 72, height: 72, borderRadius: 10, display: 'block',
                           border: '2px solid rgba(255,255,255,0.12)' }}
                  onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                />
              ) : null}

              {/* Contour Wyrm Forge superposé en overlay par-dessus la photo */}
              {cosmetics.avatar_frame?.image_url && (
                <img
                  src={cosmetics.avatar_frame.image_url}
                  alt=""
                  style={{ position: 'absolute', inset: 0, width: 72, height: 72,
                           borderRadius: 10, objectFit: 'cover', pointerEvents: 'none' }}
                />
              )}
            </div>

            <div style={{ flex: 1, minWidth: 180 }}>
              <div style={{ fontSize: 22, fontWeight: 800 }}>
                {gameName}
                <span style={{ color: 'var(--text-dim)', fontWeight: 400, fontSize: 18 }}>#{tagLine}</span>
              </div>
              {/* Badges Wyrm Forge — rangée d'icônes façon HLTV, tooltip = nom du badge */}
              {cosmetics.badges.length > 0 && (
                <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
                  {cosmetics.badges.map(badge => (
                    <div
                      key={badge.slug}
                      title={badge.name}
                      style={{
                        width: 22, height: 22, borderRadius: 4, flexShrink: 0,
                        background: 'rgba(255,255,255,0.06)',
                        border: '1px solid rgba(255,255,255,0.12)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: 'default',
                      }}
                    >
                      {badge.image_url
                        ? <img src={badge.image_url} alt={badge.name} width={16} height={16}
                               style={{ borderRadius: 2, display: 'block', objectFit: 'cover' }} />
                        : <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>🏅</span>
                      }
                    </div>
                  ))}
                </div>
              )}
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

          {/* Comparaison de rang */}
          {(soloEntry || flexEntry) && !loadingInit && (() => {
            const entry   = soloEntry ?? flexEntry!
            const issoloQ = !!soloEntry
            const qForComp = issoloQ ? 420 : 440

            return (
              <div style={{
                padding: '14px 18px', borderRadius: 10, marginBottom: 16,
                background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)',
              }}>
                {/* Onglets Percentile / Vs ton rang */}
                <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
                  {(['percentile', 'vs-rang'] as const).map(tab => (
                    <button key={tab} onClick={() => setCompTab(tab)} style={{
                      padding: '4px 14px', borderRadius: 20, fontSize: 12, cursor: 'pointer',
                      border: compTab === tab ? '1px solid rgba(127,119,221,0.5)' : '1px solid rgba(255,255,255,0.08)',
                      background: compTab === tab ? 'rgba(127,119,221,0.12)' : 'transparent',
                      color: compTab === tab ? '#A9A4F5' : 'var(--text-dim)',
                    }}>
                      {tab === 'percentile' ? 'Percentile' : 'Vs ton rang'}
                    </button>
                  ))}
                </div>

                {/* Vue A — Percentile : estimation de position dans la ladder */}
                {compTab === 'percentile' && (() => {
                  const pct      = computeTopPercent(entry.tier, entry.rank)
                  const tierColor = TIER_COLORS[entry.tier] ?? '#F5F2FA'
                  const tierFr    = TIER_FR[entry.tier] ?? entry.tier
                  const hasRank   = entry.rank && !['MASTER','GRANDMASTER','CHALLENGER'].includes(entry.tier)
                  return (
                    <div>
                      <div style={{ fontSize: 30, fontWeight: 800, color: tierColor, lineHeight: 1.1 }}>
                        Top ~{pct < 1 ? pct.toFixed(2) : pct < 10 ? pct.toFixed(1) : Math.round(pct)}%
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                        {tierFr}{hasRank ? ` ${entry.rank}` : ''} · {issoloQ ? 'Solo/Duo' : 'Flex'} · {region.toUpperCase()}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 8 }}>
                        Estimation approx. · LeagueOfGraphs · S1 2026 · Avr. 2026
                      </div>
                    </div>
                  )
                })()}

                {/* Vue B — Comparaison vs la moyenne du rang */}
                {compTab === 'vs-rang' && (() => {
                  if (rankAvgLoading) return (
                    <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Chargement…</div>
                  )

                  const tierFr   = TIER_FR[entry.tier] ?? entry.tier
                  const roleLabel = POS[dominantRole] ?? dominantRole

                  if (!dominantRole) return (
                    <div style={{ fontSize: 12, color: 'var(--text-dim)', fontStyle: 'italic' }}>
                      Pas assez de parties classées récentes pour établir un rôle dominant.
                    </div>
                  )

                  if (!rankAvg) return (
                    <div style={{ fontSize: 12, color: 'var(--text-dim)', fontStyle: 'italic' }}>
                      Pas encore assez de données pour {tierFr} · {roleLabel} — ce benchmark se remplit au fil des consultations.
                    </div>
                  )

                  const roleMs = matches.filter(m => m.queueId === qForComp && m.position === dominantRole)
                  const n = roleMs.length

                  if (n === 0) return (
                    <div style={{ fontSize: 12, color: 'var(--text-dim)', fontStyle: 'italic' }}>
                      Aucune partie {issoloQ ? 'Solo/Duo' : 'Flex'} récente en {roleLabel}.
                    </div>
                  )

                  const avg = (fn: (m: MatchInfo) => number) =>
                    roleMs.reduce((s, m) => s + fn(m), 0) / n

                  const pK   = avg(m => m.kills)
                  const pD   = avg(m => m.deaths)
                  const pA   = avg(m => m.assists)
                  const pKda = pD < 0.01 ? pK + pA : (pK + pA) / pD
                  const pCsM = avg(m => m.duration > 0 ? m.cs / (m.duration / 60) : 0)
                  const pVis = avg(m => m.visionScore)
                  const pDmg = avg(m => m.damageDealt)

                  const aKda = rankAvg.avg_deaths < 0.01
                    ? rankAvg.avg_kills + rankAvg.avg_assists
                    : (rankAvg.avg_kills + rankAvg.avg_assists) / rankAvg.avg_deaths

                  // d = écart en % par rapport à la moyenne du rang (positif = au-dessus)
                  const diff  = (p: number, a: number) => a > 0 ? Math.round(((p - a) / a) * 100) : 0
                  const arrow = (d: number) => d >= 5 ? '↑' : d <= -5 ? '↓' : '≈'
                  const arrowClr = (d: number) => d >= 5 ? '#5DCAA5' : d <= -5 ? '#E24B4A' : '#71717A'

                  const rows = [
                    { label: 'CS/min',  p: pCsM.toFixed(1),              a: rankAvg.avg_cs_per_min.toFixed(1),                          d: diff(pCsM, rankAvg.avg_cs_per_min) },
                    { label: 'Vision',  p: Math.round(pVis).toString(),   a: Math.round(rankAvg.avg_vision_score).toString(),             d: diff(pVis, rankAvg.avg_vision_score) },
                    { label: 'Dégâts',  p: `${Math.round(pDmg/1000)}k`,  a: `${Math.round(rankAvg.avg_damage_dealt/1000)}k`,             d: diff(pDmg, rankAvg.avg_damage_dealt) },
                    { label: 'KDA',     p: pKda.toFixed(2),               a: aKda.toFixed(2),                                            d: diff(pKda, aKda) },
                  ]

                  return (
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10 }}>
                        {tierFr} · {issoloQ ? 'Solo/Duo' : 'Flex'} · {roleLabel}
                        <span style={{ marginLeft: 8, color: 'var(--text-dim)' }}>({rankAvg.sample_count} parties référencées)</span>
                      </div>
                      {/* Grille inline justifiée : pas de media query nécessaire sur ce petit bloc desktop */}
                      <div style={{ display: 'grid', gridTemplateColumns: '70px 60px 80px 24px', gap: '5px 10px', alignItems: 'center' }}>
                        {['Stat', 'Toi', 'Rang moy.', ''].map((h, i) => (
                          <div key={i} style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1 }}>{h}</div>
                        ))}
                        {rows.map(r => (
                          <React.Fragment key={r.label}>
                            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{r.label}</div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: '#F5F2FA' }}>{r.p}</div>
                            <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>{r.a}</div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: arrowClr(r.d) }}>{arrow(r.d)}</div>
                          </React.Fragment>
                        ))}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 8 }}>
                        Tes {n} dernières parties en {roleLabel}
                      </div>
                    </div>
                  )
                })()}
              </div>
            )
          })()}

          {/* Erreur matchs */}
          {matchError && (
            <div style={{
              padding: '14px 18px', borderRadius: 8, fontSize: 13,
              background: 'rgba(226,75,74,0.08)', border: '1px solid rgba(226,75,74,0.3)',
              color: '#E24B4A', marginBottom: 16,
            }}>{matchError}</div>
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

          {/* Liste des matchs */}
          {loadingMatches ? (
            <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-muted)' }}>Chargement…</div>
          ) : matches.length > 0 ? (
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
                const viewerPuuid = puuid

                return (
                  <div
                    key={m.matchId}
                    onClick={() => {
                      const qs = viewerPuuid ? `?puuid=${encodeURIComponent(viewerPuuid)}` : ''
                      router.push(`/match/${region}/${m.matchId}${qs}`)
                    }}
                    role="button" tabIndex={0}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
                      padding: '10px 14px', borderRadius: 8,
                      background: '#18181B',
                      borderTop: '1px solid #27272A', borderRight: '1px solid #27272A',
                      borderBottom: '1px solid #27272A', borderLeft: `3px solid ${winColor}`,
                      cursor: 'pointer', transition: 'background 120ms',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = '#18181B' }}
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

                    {/* Résultat + durée */}
                    <div style={{ marginLeft: 'auto', textAlign: 'right', flexShrink: 0 }}>
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
