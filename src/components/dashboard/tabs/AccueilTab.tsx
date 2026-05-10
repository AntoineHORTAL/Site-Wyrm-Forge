'use client'

import { useState, useEffect } from 'react'
import { useTheme } from '@/components/providers/ThemeProvider'
import { createClient } from '@/lib/supabase/client'

// ─── Types ─────────────────────────────────────────────────────────────────────
interface ChampInfo { id: string; name: string; image: string; numericId: number }
interface SpellInfo { id: string; name: string; image: string }
interface RuneInfo  { id: number; name: string; icon: string }
// Détail complet d'une partie (chargé à la demande quand on déplie)
interface MatchParticipant {
  puuid: string
  riotIdGameName: string
  riotIdTagline: string
  championId: number
  championName: string
  teamId: number
  teamPosition: string
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
interface MatchTeam {
  teamId: number; win: boolean; bans: number[]
  objectives: { baron: number; dragon: number; herald: number; tower: number; inhibitor: number; champion: number }
}
interface MatchDetail {
  matchId: string; gameCreation: number; gameDuration: number; queueId: number; gameVersion: string
  participants: MatchParticipant[]
  teams: MatchTeam[]
}

interface MatchInfo {
  matchId: string; championId: number; championName: string
  queueId: number; queueName: string
  kills: number; deaths: number; assists: number
  cs: number; duration: number; win: boolean; gameCreation: number
  // Enrichi
  summoner1Id: number; summoner2Id: number
  keystoneId: number; secondaryStyleId: number
  items: number[]; trinket: number
  position: string
  visionScore: number; damageDealt: number; goldEarned: number
  teamKills: number
  pentaKills: number; quadraKills: number; tripleKills: number
}

// Mapping position Riot → label court
const POS: Record<string, string> = {
  TOP: 'TOP', JUNGLE: 'JGL', MIDDLE: 'MID', BOTTOM: 'ADC', UTILITY: 'SUP',
}

const DDN      = 'https://ddragon.leagueoflegends.com'
const champImg = (v: string, img: string) => `${DDN}/cdn/${v}/img/champion/${img}`
const itemImg  = (v: string, id: number)  => `${DDN}/cdn/${v}/img/item/${id}.png`
const spellImg = (v: string, img: string) => `${DDN}/cdn/${v}/img/spell/${img}`
const runeImg  = (path: string)            => `${DDN}/cdn/img/${path}` // path déjà complet dans runesReforged

// Edge Functions Supabase — la clé Riot est stockée côté serveur Supabase, jamais exposée.
const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPA_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const FN_URL   = (name: string, params: Record<string, string>) =>
  `${SUPA_URL}/functions/v1/${name}?${new URLSearchParams(params).toString()}`

const PLATFORMS = [
  { value: 'euw1', label: 'EUW' }, { value: 'eun1', label: 'EUNE' },
  { value: 'na1',  label: 'NA'  }, { value: 'kr',   label: 'KR'   },
  { value: 'br1',  label: 'BR'  }, { value: 'jp1',  label: 'JP'   },
  { value: 'oc1',  label: 'OCE' }, { value: 'tr1',  label: 'TR'   },
]

function fmt(secs: number) {
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return `${m}m${String(s).padStart(2, '0')}`
}

function kda(k: number, d: number, a: number) {
  const ratio = d === 0 ? (k + a).toFixed(1) : ((k + a) / d).toFixed(2)
  return `${k}/${d}/${a} (${ratio})`
}

// Retire les caractères Unicode invisibles (bidi marks, zero-width, BOM)
// que certains copier-coller (Discord, terminaux) injectent autour du texte.
function sanitize(s: string): string {
  return s.replace(/[​-‏‪-‮⁠-⁯﻿]/g, '').trim()
}

function timeAgo(ts: number) {
  const diff = Date.now() - ts
  const h = Math.floor(diff / 3_600_000)
  if (h < 1) return 'il y a moins d\'1h'
  if (h < 24) return `il y a ${h}h`
  const d = Math.floor(h / 24)
  return `il y a ${d}j`
}

// ─── Component ─────────────────────────────────────────────────────────────────
export default function AccueilTab() {
  const { theme } = useTheme()
  const c = theme === 'mythic'
  const supabase = createClient()

  // PUUID du joueur connecté (pour highlight dans le détail)
  const [puuid, setPuuid] = useState<string>('')

  // Détail des matchs (chargé à la demande)
  const [expandedId, setExpandedId]   = useState<string | null>(null)
  const [detailCache, setDetailCache] = useState<Record<string, MatchDetail>>({})
  const [detailLoading, setDetailLoading] = useState<Record<string, boolean>>({})
  const [detailError, setDetailError]   = useState<Record<string, string>>({})

  // DDragon
  const [version, setVersion]   = useState('')
  const [champMap, setChampMap] = useState<Record<number, ChampInfo>>({}) // numericId → champ
  const [spellMap, setSpellMap] = useState<Record<number, SpellInfo>>({}) // spellId  → spell
  const [runeMap,  setRuneMap]  = useState<Record<number, RuneInfo>>({})  // perkId   → rune (keystone + arbres)

  // Rotation
  const [rotation, setRotation]       = useState<ChampInfo[]>([])
  const [loadingRot, setLoadingRot]   = useState(true)
  const [platform, setPlatform]       = useState('euw1')

  // Riot ID
  const [userId, setUserId]           = useState<string | null>(null)
  const [riotInput, setRiotInput]     = useState('') // "GameName#TAG"
  const [savedRiot, setSavedRiot]     = useState<{ gameName: string; tagLine: string; platform: string } | null>(null)
  const [savingRiot, setSavingRiot]   = useState(false)
  const [riotError, setRiotError]     = useState('')
  const [editMode, setEditMode]       = useState(false)

  // Matches
  const [matches, setMatches]         = useState<MatchInfo[]>([])
  const [loadingMatches, setLoadingMatches] = useState(false)
  const [matchError, setMatchError]   = useState('')

  const border  = c ? 'rgba(186,117,23,0.2)' : '#27272A'
  const bg      = c ? 'rgba(42,21,71,0.4)'   : '#18181B'
  const accent  = c ? '#BA7517'               : '#7F77DD'
  const gold    = c ? '#FAC775'               : '#EF9F27'

  // ── Init : DDragon + user + rotation ─────────────────────────────────────
  useEffect(() => {
    async function init() {
      // Version DDragon
      const vRes = await fetch(`${DDN}/api/versions.json`)
      const versions: string[] = await vRes.json()
      const v = versions[0]
      setVersion(v)

      // Champion.json → map numericId → ChampInfo
      const [cRes, sRes, rRes] = await Promise.all([
        fetch(`${DDN}/cdn/${v}/data/fr_FR/champion.json`),
        fetch(`${DDN}/cdn/${v}/data/fr_FR/summoner.json`),
        fetch(`${DDN}/cdn/${v}/data/fr_FR/runesReforged.json`),
      ])
      const cData = await cRes.json()
      const map: Record<number, ChampInfo> = {}
      Object.values(cData.data).forEach((ch: any) => {
        map[Number(ch.key)] = { id: ch.id, name: ch.name, image: ch.image.full, numericId: Number(ch.key) }
      })
      setChampMap(map)

      // Summoner spells → map spellId → SpellInfo
      const sData = await sRes.json()
      const sm: Record<number, SpellInfo> = {}
      Object.values(sData.data).forEach((sp: any) => {
        sm[Number(sp.key)] = { id: sp.id, name: sp.name, image: sp.image.full }
      })
      setSpellMap(sm)

      // Runes : on indexe à la fois les keystones (1ère ligne de chaque arbre)
      // ET les ID de chemins (Domination, Précision, etc.) avec leur icône d'arbre.
      const rData: any[] = await rRes.json()
      const rm: Record<number, RuneInfo> = {}
      rData.forEach(tree => {
        // Arbre lui-même (utile pour secondaryStyleId)
        rm[tree.id] = { id: tree.id, name: tree.name, icon: tree.icon }
        // Toutes les runes de l'arbre
        tree.slots.forEach((slot: any) => {
          slot.runes.forEach((rune: any) => {
            rm[rune.id] = { id: rune.id, name: rune.name, icon: rune.icon }
          })
        })
      })
      setRuneMap(rm)

      // User Supabase + Riot ID sauvegardé
      const { data: { user } } = await supabase.auth.getUser()
      setUserId(user?.id ?? null)

      if (user) {
        const { data } = await supabase
          .from('profiles')
          .select('riot_gamename, riot_tagline, riot_platform')
          .eq('id', user.id)
          .single()
        if (data?.riot_gamename) {
          const saved = {
            gameName: data.riot_gamename,
            tagLine:  data.riot_tagline  ?? '',
            platform: data.riot_platform ?? 'euw1',
          }
          setSavedRiot(saved)
          setRiotInput(`${saved.gameName}#${saved.tagLine}`)
          setPlatform(saved.platform)
        }
      }

      // Rotation (après avoir le map des champions)
      loadRotation(v, map, platform)
    }
    init()
  }, [])

  // ── Recharger la rotation si la platform change ───────────────────────────
  useEffect(() => {
    if (version && Object.keys(champMap).length > 0)
      loadRotation(version, champMap, platform)
  }, [platform])

  async function loadRotation(v: string, map: Record<number, ChampInfo>, plat: string) {
    setLoadingRot(true)
    try {
      // Edge Function publique — pas besoin de JWT, juste l'apikey Supabase.
      const res = await fetch(FN_URL('riot-rotation', { platform: plat }), {
        headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` },
      })
      const data = await res.json()
      if (!res.ok) { setRotation([]); return }
      const champs = (data.freeChampionIds as number[])
        .map(id => map[id])
        .filter(Boolean)
      setRotation(champs)
    } catch {
      setRotation([])
    } finally {
      setLoadingRot(false)
    }
  }

  // ── Charger les matches quand savedRiot est disponible ────────────────────
  useEffect(() => {
    if (savedRiot && version) loadMatches(savedRiot)
  }, [savedRiot])

  // Toggle l'affichage détaillé d'une partie (charge à la 1ère ouverture, cache ensuite).
  async function toggleDetail(matchId: string, platform: string) {
    if (expandedId === matchId) { setExpandedId(null); return }
    setExpandedId(matchId)
    if (detailCache[matchId]) return // déjà chargé

    setDetailLoading(prev => ({ ...prev, [matchId]: true }))
    setDetailError(prev => ({ ...prev, [matchId]: '' }))
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        setDetailError(prev => ({ ...prev, [matchId]: 'Connexion requise.' }))
        return
      }
      const res = await fetch(
        FN_URL('riot-match-detail', { matchId, platform }),
        { headers: { apikey: SUPA_KEY, Authorization: `Bearer ${session.access_token}` } },
      )
      const data = await res.json()
      if (!res.ok) {
        setDetailError(prev => ({ ...prev, [matchId]: data.error ?? 'Erreur Riot API' }))
        return
      }
      setDetailCache(prev => ({ ...prev, [matchId]: data }))
    } catch {
      setDetailError(prev => ({ ...prev, [matchId]: 'Impossible de charger le détail.' }))
    } finally {
      setDetailLoading(prev => ({ ...prev, [matchId]: false }))
    }
  }

  async function loadMatches(riot: { gameName: string; tagLine: string; platform: string }) {
    setLoadingMatches(true)
    setMatchError('')
    try {
      // Edge Function privée — on envoie le JWT du user pour que Supabase valide l'auth.
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setMatchError('Connexion requise pour voir l\'historique.'); return }

      const res = await fetch(
        FN_URL('riot-matches', {
          gameName: riot.gameName,
          tagLine:  riot.tagLine,
          platform: riot.platform,
          count:    '5',
        }),
        {
          headers: {
            apikey:        SUPA_KEY,
            Authorization: `Bearer ${session.access_token}`,
          },
        },
      )
      const data = await res.json()
      if (!res.ok) { setMatchError(data.error ?? 'Erreur Riot API'); return }
      setMatches(data.matches ?? [])
      if (data.puuid) setPuuid(data.puuid)
    } catch {
      setMatchError('Impossible de joindre l\'API Riot.')
    } finally {
      setLoadingMatches(false)
    }
  }

  // ── Sauvegarder le Riot ID ────────────────────────────────────────────────
  async function saveRiotId() {
    const raw = sanitize(riotInput)
    const match = raw.match(/^(.+)#(.+)$/)
    if (!match) { setRiotError('Format invalide — utilise GameName#TAG'); return }

    const gameName = sanitize(match[1])
    const tagLine  = sanitize(match[2])
    setSavingRiot(true)
    setRiotError('')

    if (userId) {
      const { error } = await supabase.from('profiles').update({
        riot_gamename: gameName,
        riot_tagline:  tagLine,
        riot_platform: platform,
      }).eq('id', userId)
      if (error) { setRiotError('Erreur lors de la sauvegarde.'); setSavingRiot(false); return }
    }

    const saved = { gameName, tagLine, platform }
    setSavedRiot(saved)
    setEditMode(false)
    setSavingRiot(false)
    loadMatches(saved)
  }

  // ── Stats des 5 parties ───────────────────────────────────────────────────
  const wins    = matches.filter(m => m.win).length
  const losses  = matches.length - wins
  const winrate = matches.length > 0 ? Math.round((wins / matches.length) * 100) : null
  const avgKda  = matches.length > 0
    ? ((matches.reduce((s, m) => s + m.kills + m.assists, 0) / matches.length) /
       Math.max(matches.reduce((s, m) => s + m.deaths, 0) / matches.length, 1)).toFixed(2)
    : null
  const avgCs = matches.length > 0
    ? Math.round(matches.reduce((s, m) => s + m.cs, 0) / matches.length)
    : null

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>

      {/* ══ ROTATION ══════════════════════════════════════════════════════ */}
      <section>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#F5F2FA' }}>Rotation gratuite</div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2 }}>Champions disponibles cette semaine</div>
          </div>
          {/* Sélecteur de serveur */}
          <select
            value={platform}
            onChange={e => setPlatform(e.target.value)}
            style={{
              padding: '6px 10px', borderRadius: 6, fontSize: 12,
              background: c ? 'rgba(20,10,35,0.8)' : '#27272A',
              border: `1px solid ${border}`, color: 'var(--text)',
              fontFamily: 'inherit', cursor: 'pointer', outline: 'none',
            }}
          >
            {PLATFORMS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </div>

        {loadingRot ? (
          <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-muted)', fontSize: 13 }}>
            Chargement de la rotation…
          </div>
        ) : rotation.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-dim)', fontSize: 13 }}>
            Rotation indisponible — clé API non configurée ou expirée.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(72px, 1fr))', gap: 8 }}>
            {rotation.map(champ => (
              <div key={champ.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
                <img
                  src={champImg(version, champ.image)}
                  alt={champ.name}
                  style={{
                    width: 58, height: 58, borderRadius: 8,
                    objectFit: 'cover', border: `2px solid ${border}`,
                    transition: 'border-color 0.15s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = accent)}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = border)}
                />
                <div style={{ fontSize: 10, color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.2 }}>
                  {champ.name}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ══ MATCHES ═══════════════════════════════════════════════════════ */}
      <section>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#F5F2FA' }}>Mes 5 dernières parties</div>
            {savedRiot && !editMode && (
              <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2 }}>
                {savedRiot.gameName}<span style={{ color: 'var(--text-dim)' }}>#{savedRiot.tagLine}</span>
                {' · '}
                <span style={{ color: accent }}>{PLATFORMS.find(p => p.value === savedRiot.platform)?.label}</span>
              </div>
            )}
          </div>
          {savedRiot && !editMode && (
            <button onClick={() => setEditMode(true)} style={{
              padding: '5px 12px', borderRadius: 6, fontSize: 12,
              background: 'transparent', border: `1px solid ${border}`,
              color: 'var(--text-muted)', cursor: 'pointer', fontFamily: 'inherit',
            }}>Changer</button>
          )}
        </div>

        {/* ── Saisie Riot ID ── */}
        {(!savedRiot || editMode) && (
          <div style={{
            padding: 20, borderRadius: 10, background: bg,
            border: `1px solid ${border}`, marginBottom: 16,
            display: 'flex', flexDirection: 'column', gap: 12,
          }}>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              Saisis ton Riot ID pour voir ton historique de parties.
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
              <input
                value={riotInput}
                onChange={e => { setRiotInput(e.target.value); setRiotError('') }}
                onKeyDown={e => e.key === 'Enter' && saveRiotId()}
                placeholder="GameName#EUW"
                style={{
                  flex: '1 1 180px', padding: '9px 12px', borderRadius: 6,
                  background: c ? 'rgba(20,10,35,0.6)' : '#27272A',
                  border: `1px solid ${riotError ? '#E24B4A' : border}`,
                  color: 'var(--text)', fontFamily: 'inherit', fontSize: 13, outline: 'none',
                }}
              />
              <select
                value={platform}
                onChange={e => setPlatform(e.target.value)}
                style={{
                  padding: '9px 10px', borderRadius: 6, fontSize: 13,
                  background: c ? 'rgba(20,10,35,0.6)' : '#27272A',
                  border: `1px solid ${border}`, color: 'var(--text)',
                  fontFamily: 'inherit', cursor: 'pointer', outline: 'none',
                }}
              >
                {PLATFORMS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
              <button onClick={saveRiotId} disabled={savingRiot} style={{
                padding: '9px 18px', borderRadius: 6,
                background: 'linear-gradient(135deg,#7F77DD,#534AB7)',
                border: 'none', color: 'white', fontSize: 13, fontWeight: 600,
                cursor: savingRiot ? 'default' : 'pointer', fontFamily: 'inherit',
                opacity: savingRiot ? 0.6 : 1,
              }}>
                {savingRiot ? '…' : 'Valider'}
              </button>
              {editMode && (
                <button onClick={() => { setEditMode(false); setRiotError('') }} style={{
                  padding: '9px 12px', borderRadius: 6, fontSize: 13,
                  background: 'transparent', border: `1px solid ${border}`,
                  color: 'var(--text-muted)', cursor: 'pointer', fontFamily: 'inherit',
                }}>Annuler</button>
              )}
            </div>
            {riotError && <div style={{ fontSize: 12, color: '#E24B4A' }}>{riotError}</div>}
            {!userId && (
              <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                Connecte-toi pour que ton Riot ID soit sauvegardé.
              </div>
            )}
          </div>
        )}

        {/* ── Stats résumées ── */}
        {matches.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 16 }}>
            {[
              { label: 'Parties', value: String(matches.length) },
              { label: 'Victoires', value: `${wins}W ${losses}L`, color: wins > losses ? '#5DCAA5' : wins < losses ? '#E24B4A' : undefined },
              { label: 'Winrate', value: `${winrate}%`, color: (winrate ?? 0) >= 50 ? '#5DCAA5' : '#E24B4A' },
              { label: 'KDA moy.', value: avgKda ?? '-' },
              { label: 'CS moy.', value: avgCs ? String(avgCs) : '-' },
            ].map((s, i) => (
              <div key={i} style={{
                padding: '12px 16px', borderRadius: 8, background: bg, border: `1px solid ${border}`,
              }}>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
                  {s.label}
                </div>
                <div style={{ fontSize: 18, fontWeight: 600, color: s.color ?? '#F5F2FA' }}>
                  {s.value}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Loading / error ── */}
        {loadingMatches && (
          <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-muted)', fontSize: 13 }}>
            Chargement des parties…
          </div>
        )}
        {matchError && (
          <div style={{
            padding: '14px 18px', borderRadius: 8, fontSize: 13,
            background: 'rgba(226,75,74,0.08)', border: '1px solid rgba(226,75,74,0.3)',
            color: '#E24B4A',
          }}>{matchError}</div>
        )}

        {/* ── Liste des matchs (style op.gg/blitz : champ + summs + rune + KDA + items + meta) ── */}
        {!loadingMatches && !matchError && matches.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {matches.map(m => {
              const champ      = champMap[m.championId]
              const summ1      = m.summoner1Id ? spellMap[m.summoner1Id] : undefined
              const summ2      = m.summoner2Id ? spellMap[m.summoner2Id] : undefined
              const keystone   = m.keystoneId ? runeMap[m.keystoneId] : undefined
              const secondary  = m.secondaryStyleId ? runeMap[m.secondaryStyleId] : undefined
              const csPerMin   = m.duration > 0 ? (m.cs / (m.duration / 60)).toFixed(1) : '0'
              const kp         = (m.teamKills ?? 0) > 0 ? Math.round(((m.kills + m.assists) / m.teamKills) * 100) : null
              const multiKill  = (m.pentaKills ?? 0) > 0 ? 'PENTAKILL' : (m.quadraKills ?? 0) > 0 ? 'QUADRA' : (m.tripleKills ?? 0) > 0 ? 'TRIPLE' : null
              const winColor   = m.win ? '#5DCAA5' : '#E24B4A'
              const items      = [...(Array.isArray(m.items) ? m.items : []), m.trinket ?? 0]

              const isExpanded = expandedId === m.matchId
              const detail     = detailCache[m.matchId]
              const dLoading   = !!detailLoading[m.matchId]
              const dError     = detailError[m.matchId]

              return (
                <div key={m.matchId} style={{
                  borderRadius: 8, background: bg,
                  border: `1px solid ${border}`, borderLeft: `3px solid ${winColor}`,
                  overflow: 'hidden',
                }}>
                <div
                  onClick={() => savedRiot && toggleDetail(m.matchId, savedRiot.platform)}
                  role="button"
                  tabIndex={0}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
                    padding: '10px 14px', cursor: 'pointer',
                    transition: 'background 120ms',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.02)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = '' }}
                >
                  {/* Chevron indicateur */}
                  <div style={{
                    fontSize: 11, color: 'var(--text-dim)', flexShrink: 0, width: 12,
                    transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                    transition: 'transform 150ms',
                  }}>▶</div>

                  {/* Bloc 1 — Champion + summs + rune */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                    {/* Champion */}
                    {champ && version ? (
                      <img src={champImg(version, champ.image)} alt={champ.name}
                        style={{ width: 48, height: 48, borderRadius: 6, objectFit: 'cover' }} />
                    ) : (
                      <div style={{
                        width: 48, height: 48, borderRadius: 6,
                        background: 'linear-gradient(135deg,#7F77DD,#534AB7)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 13, fontWeight: 600, color: 'white',
                      }}>{m.championName.slice(0, 2)}</div>
                    )}

                    {/* Sorts d'invocateur */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      {summ1 && version && (
                        <img src={spellImg(version, summ1.image)} title={summ1.name} alt=""
                          style={{ width: 22, height: 22, borderRadius: 4, background: '#000' }} />
                      )}
                      {summ2 && version && (
                        <img src={spellImg(version, summ2.image)} title={summ2.name} alt=""
                          style={{ width: 22, height: 22, borderRadius: 4, background: '#000' }} />
                      )}
                    </div>

                    {/* Runes (keystone + arbre secondaire) */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      {keystone && (
                        <img src={runeImg(keystone.icon)} title={keystone.name} alt=""
                          style={{ width: 22, height: 22, borderRadius: '50%', background: '#0a0612' }} />
                      )}
                      {secondary && (
                        <img src={runeImg(secondary.icon)} title={secondary.name} alt=""
                          style={{ width: 22, height: 22, borderRadius: '50%', background: '#0a0612', padding: 2 }} />
                      )}
                    </div>
                  </div>

                  {/* Bloc 2 — Champion name + queue + position */}
                  <div style={{ flex: '0 1 130px', minWidth: 110 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#F5F2FA', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {champ?.name ?? m.championName}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-dim)', display: 'flex', gap: 6, alignItems: 'center' }}>
                      <span>{m.queueName}</span>
                      {POS[m.position] && (
                        <>
                          <span>·</span>
                          <span style={{ color: accent, fontWeight: 600 }}>{POS[m.position]}</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Bloc 3 — KDA + KP */}
                  <div style={{ flex: '0 0 auto', textAlign: 'center', minWidth: 90 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#F5F2FA' }}>
                      {m.kills} / <span style={{ color: '#E24B4A' }}>{m.deaths}</span> / {m.assists}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                      {(m.deaths === 0 ? (m.kills + m.assists) : ((m.kills + m.assists) / m.deaths)).toFixed(2)} KDA
                      {kp !== null && <> · <span style={{ color: gold }}>{kp}%</span> KP</>}
                    </div>
                  </div>

                  {/* Bloc 4 — CS + Vision */}
                  <div style={{ flex: '0 0 auto', textAlign: 'center', minWidth: 80 }}>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      {m.cs} CS <span style={{ color: 'var(--text-dim)' }}>({csPerMin}/min)</span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                      Vision {m.visionScore}
                    </div>
                  </div>

                  {/* Bloc 5 — Items (6 + trinket) */}
                  <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                    {items.map((id, i) => (
                      <div key={i} style={{
                        width: 24, height: 24, borderRadius: 4,
                        background: id ? 'transparent' : 'rgba(255,255,255,0.05)',
                        border: id ? 'none' : `1px dashed ${border}`,
                      }}>
                        {id > 0 && version && (
                          <img src={itemImg(version, id)} alt=""
                            style={{ width: 24, height: 24, borderRadius: 4, display: 'block' }}
                            onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Bloc 6 — Résultat + meta (temps / durée / multikill) */}
                  <div style={{ marginLeft: 'auto', textAlign: 'right', flexShrink: 0 }}>
                    <div style={{
                      fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1,
                      color: winColor,
                    }}>
                      {m.win ? 'Victoire' : 'Défaite'}
                      {multiKill && (
                        <span style={{
                          marginLeft: 6, padding: '1px 6px', borderRadius: 3, fontSize: 9,
                          background: gold, color: '#1a0d2e',
                        }}>{multiKill}</span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                      {fmt(m.duration)} · {timeAgo(m.gameCreation)}
                    </div>
                  </div>
                </div>

                {/* ── Panneau détail (visible si déplié) ── */}
                {isExpanded && (
                  <div style={{
                    borderTop: `1px solid ${border}`,
                    background: 'rgba(0,0,0,0.15)',
                    padding: '14px 16px',
                  }}>
                    {dLoading && (
                      <div style={{ textAlign: 'center', color: 'var(--text-dim)', fontSize: 12, padding: '20px 0' }}>
                        Chargement du détail…
                      </div>
                    )}
                    {dError && (
                      <div style={{ color: '#E24B4A', fontSize: 12 }}>{dError}</div>
                    )}
                    {detail && version && (
                      <MatchDetailPanel
                        detail={detail}
                        version={version}
                        champMap={champMap}
                        spellMap={spellMap}
                        runeMap={runeMap}
                        myPuuid={puuid}
                        accent={accent}
                        gold={gold}
                        border={border}
                      />
                    )}
                  </div>
                )}
                </div>
              )
            })}
          </div>
        )}

        {/* ── Aucun match sans erreur ── */}
        {!loadingMatches && !matchError && savedRiot && matches.length === 0 && (
          <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-dim)', fontSize: 13 }}>
            Aucune partie trouvée récemment.
          </div>
        )}
      </section>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────────
// Composant MatchDetailPanel
// Affiche les 10 joueurs (2 équipes) + bans + objectifs + dégâts.
// Highlight la ligne du joueur connecté.
// ────────────────────────────────────────────────────────────────────────────────
function MatchDetailPanel({
  detail, version, champMap, spellMap, runeMap, myPuuid, accent, gold, border,
}: {
  detail: MatchDetail; version: string
  champMap: Record<number, ChampInfo>
  spellMap: Record<number, SpellInfo>
  runeMap:  Record<number, RuneInfo>
  myPuuid: string
  accent: string; gold: string; border: string
}) {
  // Damage max pour normaliser la barre
  const maxDmg = Math.max(...detail.participants.map(p => p.damageDealt), 1)

  // Rendu d'une équipe (5 joueurs)
  const renderTeam = (teamId: number, label: string) => {
    const team    = detail.teams.find(t => t.teamId === teamId)
    const players = detail.participants.filter(p => p.teamId === teamId)
    if (!team) return null

    const totalKills = players.reduce((s, p) => s + p.kills, 0)
    const totalGold  = players.reduce((s, p) => s + p.goldEarned, 0)
    const teamColor  = team.win ? '#5DCAA5' : '#E24B4A'

    return (
      <div style={{ marginBottom: 16 }}>
        {/* Header équipe : résultat + bans + objectifs + total kills/gold */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
          marginBottom: 6, padding: '6px 10px', borderRadius: 6,
          background: 'rgba(255,255,255,0.03)',
        }}>
          <span style={{ fontWeight: 700, color: teamColor, fontSize: 12, letterSpacing: 1 }}>
            {label} · {team.win ? 'VICTOIRE' : 'DÉFAITE'}
          </span>
          <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>
            {totalKills} kills · {Math.round(totalGold / 1000)}K or
          </span>
          <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>
            🏯 {team.objectives.tower} · 🐉 {team.objectives.dragon} ·
            🦇 {team.objectives.baron} · 🦅 {team.objectives.herald}
          </span>
          {team.bans.length > 0 && (
            <div style={{ display: 'flex', gap: 3, marginLeft: 'auto', alignItems: 'center' }}>
              <span style={{ fontSize: 10, color: 'var(--text-dim)', marginRight: 4 }}>BANS</span>
              {team.bans.map((banId, i) => {
                const c = champMap[banId]
                return c
                  ? <img key={i} src={`https://ddragon.leagueoflegends.com/cdn/${version}/img/champion/${c.image}`}
                      title={c.name} alt=""
                      style={{ width: 22, height: 22, borderRadius: 3, opacity: 0.6, filter: 'grayscale(0.6)' }} />
                  : <div key={i} style={{ width: 22, height: 22, borderRadius: 3, background: 'rgba(255,255,255,0.05)' }} />
              })}
            </div>
          )}
        </div>

        {/* Lignes joueurs */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {players.map(p => {
            const champ      = champMap[p.championId]
            const summ1      = p.summoner1Id ? spellMap[p.summoner1Id] : undefined
            const summ2      = p.summoner2Id ? spellMap[p.summoner2Id] : undefined
            const keystone   = p.keystoneId ? runeMap[p.keystoneId] : undefined
            const isMe       = p.puuid === myPuuid
            const dmgPct     = (p.damageDealt / maxDmg) * 100
            const items      = [...p.items, p.trinket]

            return (
              <div key={p.puuid} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '6px 8px', borderRadius: 4,
                background: isMe ? 'rgba(127,119,221,0.10)' : 'transparent',
                border: isMe ? `1px solid ${accent}55` : '1px solid transparent',
                fontSize: 12,
              }}>
                {/* Champion + level */}
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  {champ
                    ? <img src={`https://ddragon.leagueoflegends.com/cdn/${version}/img/champion/${champ.image}`}
                        alt="" style={{ width: 32, height: 32, borderRadius: 4 }} />
                    : <div style={{ width: 32, height: 32, borderRadius: 4, background: '#222' }} />
                  }
                  <div style={{
                    position: 'absolute', bottom: -2, right: -2, fontSize: 9, fontWeight: 700,
                    background: 'rgba(0,0,0,0.85)', padding: '0 3px', borderRadius: 2,
                    color: '#F5F2FA', border: `1px solid ${border}`, lineHeight: '12px',
                  }}>{p.level}</div>
                </div>

                {/* Summs */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 1, flexShrink: 0 }}>
                  {summ1 && <img src={`https://ddragon.leagueoflegends.com/cdn/${version}/img/spell/${summ1.image}`} alt="" title={summ1.name}
                    style={{ width: 15, height: 15, borderRadius: 2 }} />}
                  {summ2 && <img src={`https://ddragon.leagueoflegends.com/cdn/${version}/img/spell/${summ2.image}`} alt="" title={summ2.name}
                    style={{ width: 15, height: 15, borderRadius: 2 }} />}
                </div>

                {/* Keystone */}
                {keystone && (
                  <img src={`https://ddragon.leagueoflegends.com/cdn/img/${keystone.icon}`}
                    alt="" title={keystone.name}
                    style={{ width: 24, height: 24, flexShrink: 0 }} />
                )}

                {/* Pseudo + champ name */}
                <div style={{ flex: '1 1 120px', minWidth: 0 }}>
                  <div style={{
                    color: isMe ? gold : '#F5F2FA', fontWeight: isMe ? 700 : 500,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    {p.riotIdGameName || champ?.name || p.championName}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>
                    {champ?.name ?? p.championName}
                  </div>
                </div>

                {/* KDA */}
                <div style={{ minWidth: 70, textAlign: 'center', color: 'var(--text-muted)' }}>
                  {p.kills}/<span style={{ color: '#E24B4A' }}>{p.deaths}</span>/{p.assists}
                </div>

                {/* CS */}
                <div style={{ minWidth: 50, textAlign: 'right', color: 'var(--text-dim)' }}>
                  {p.cs} CS
                </div>

                {/* Or */}
                <div style={{ minWidth: 55, textAlign: 'right', color: gold }}>
                  {(p.goldEarned / 1000).toFixed(1)}K
                </div>

                {/* Damage bar */}
                <div style={{ flex: '0 0 110px', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <div style={{ flex: 1, height: 6, background: 'rgba(255,255,255,0.05)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ width: `${dmgPct}%`, height: '100%', background: '#E24B4A' }} />
                  </div>
                  <span style={{ fontSize: 10, color: 'var(--text-dim)', minWidth: 36, textAlign: 'right' }}>
                    {(p.damageDealt / 1000).toFixed(1)}K
                  </span>
                </div>

                {/* Vision */}
                <div style={{ minWidth: 60, textAlign: 'right', color: 'var(--text-dim)', fontSize: 11 }}>
                  Vis {p.visionScore}
                </div>

                {/* Items */}
                <div style={{ display: 'flex', gap: 1, flexShrink: 0 }}>
                  {items.map((id, i) => (
                    <div key={i} style={{
                      width: 18, height: 18, borderRadius: 2,
                      background: id ? 'transparent' : 'rgba(255,255,255,0.04)',
                    }}>
                      {id > 0 && (
                        <img src={`https://ddragon.leagueoflegends.com/cdn/${version}/img/item/${id}.png`}
                          alt="" style={{ width: 18, height: 18, borderRadius: 2, display: 'block' }}
                          onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
                      )}
                    </div>
                  ))}
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
      {renderTeam(100, 'ÉQUIPE BLEUE')}
      {renderTeam(200, 'ÉQUIPE ROUGE')}
    </div>
  )
}
