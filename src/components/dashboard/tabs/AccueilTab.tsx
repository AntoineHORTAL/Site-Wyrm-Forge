'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useTheme } from '@/components/providers/ThemeProvider'
import { createClient } from '@/lib/supabase/client'
import RiotLinkBlock from '@/components/player/RiotLinkBlock'
import { useFlag } from '@/components/providers/FeatureFlagsProvider'
import { UnavailableNotice } from '@/components/dashboard/FeatureScreens'
import { useDashboard, useLang } from '@/locales/dashboard'
import { ddragonLocale } from '@/lib/intl'
import { queueLabel } from '@/locales/dashboard/common'
import type { AccueilDict } from '@/locales/dashboard/accueil'

// ─── Types ─────────────────────────────────────────────────────────────────────
interface ChampInfo { id: string; name: string; image: string; numericId: number }
interface SpellInfo { id: string; name: string; image: string }
interface RuneInfo  { id: number; name: string; icon: string }

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

function timeAgo(ts: number, t: AccueilDict['accueil']) {
  const diff = Date.now() - ts
  const h = Math.floor(diff / 3_600_000)
  if (h < 1) return t.agoLessThanHour
  if (h < 24) return t.agoHours.replace('{n}', String(h))
  const d = Math.floor(h / 24)
  return t.agoDays.replace('{n}', String(d))
}

// ─── Component ─────────────────────────────────────────────────────────────────
export default function AccueilTab() {
  const { theme } = useTheme()
  const c = theme === 'mythic'
  const supabase = createClient()
  const dico = useDashboard()
  const C = dico.common
  // Kill switches de cet onglet — voir les deux sections gardées dans le rendu.
  const riotLinkEnabled    = useFlag('riot_link_enabled')
  const riotHistoryEnabled = useFlag('riot_history_enabled')
  const lang = useLang()
  const tr = dico.accueil.accueil

  // Router (pour ouvrir une partie sur sa page dédiée)
  const router = useRouter()

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
  // puuid de l'invocateur dont on affiche actuellement les matchs (peut être un autre que soi via la recherche).
  // Passé dans l'URL du match pour que la page de détail highlighte le bon joueur.
  const [viewedPuuid, setViewedPuuid] = useState<string>('')
  const [riotError, setRiotError]     = useState('')
  const [editMode, setEditMode]       = useState(false)

  // Matches
  const [matches, setMatches]         = useState<MatchInfo[]>([])
  const [loadingMatches, setLoadingMatches] = useState(false)
  const [loadingMore,    setLoadingMore]    = useState(false)
  // Flag : Riot a renvoyé moins de matchs que demandé (= dernière page)
  const [reachedEnd,     setReachedEnd]     = useState(false)
  // Taille des batchs successifs + cap absolu pour ne pas marteler l'API
  const PAGE_SIZE = 10
  const MAX_TOTAL = 100
  // Sentinel pour l'infinite scroll (IntersectionObserver)
  const sentinelRef = useRef<HTMLDivElement>(null)
  // Lock synchrone : empêche 2 fetches concurrents (l'observer peut fire avant que
  // loadingMore ne soit mis à jour par React, créant un état de double appel).
  const inFlightRef = useRef(false)
  // L'utilisateur a-t-il vraiment scrollé ? Évite le déclenchement auto à l'arrivée
  // sur la page (où la sentinel peut être visible parce que la liste est courte).
  const [userScrolled, setUserScrolled] = useState(false)
  const [matchError, setMatchError]   = useState('')

  const border  = c ? 'rgba(186,117,23,0.2)' : '#27272A'
  const bg      = c ? 'rgba(42,21,71,0.4)'   : '#18181B'
  const accent  = c ? '#BA7517'               : '#7F77DD'
  const gold    = c ? '#FAC775'               : '#EF9F27'

  /**
   * ── DDragon : version + cartes champions / sorts / runes ──────────────────
   *
   * ⚠️ Effet SÉPARÉ depuis le Lot 8, avec `lang` en dépendance. Les trois cartes
   * portent des NOMS (champions, sorts d'invocateur, runes) qui viennent de DDragon
   * et doivent suivre la langue. Les laisser dans l'init d'origine aurait rejoué, à
   * chaque bascule, la lecture du compte Supabase ET le `setPlatform` qui écrase le
   * choix de plateforme en cours.
   */
  useEffect(() => {
    let cancelled = false
    async function loadDD() {
      const vRes = await fetch(`${DDN}/api/versions.json`)
      const versions: string[] = await vRes.json()
      if (cancelled) return
      const v = versions[0]
      setVersion(v)

      const loc = ddragonLocale(lang)
      const [cRes, sRes, rRes] = await Promise.all([
        fetch(`${DDN}/cdn/${v}/data/${loc}/champion.json`),
        fetch(`${DDN}/cdn/${v}/data/${loc}/summoner.json`),
        fetch(`${DDN}/cdn/${v}/data/${loc}/runesReforged.json`),
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
    }
    loadDD()
    return () => { cancelled = true }
  }, [lang])

  // ── Compte : user Supabase + Riot ID sauvegardé (une fois, au montage) ────
  useEffect(() => {
    async function init() {
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
    }
    init()
  }, [])

  /**
   * ── Rotation ──────────────────────────────────────────────────────────────
   *
   * Dépend de la plateforme ET des données DDragon : `loadRotation` résout les ids
   * renvoyés par l'Edge Function en `ChampInfo` COMPLETS (nom inclus) qu'il stocke
   * dans l'état. Sans `champMap` en dépendance, la rotation garderait donc les noms
   * de la langue précédente après une bascule.
   */
  useEffect(() => {
    if (version && Object.keys(champMap).length > 0)
      loadRotation(version, champMap, platform)
  }, [platform, version, champMap])

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

  // Détecter un scroll utilisateur pour activer l'infinite scroll
  // (évite le déclenchement automatique à l'arrivée sur la page si la sentinel
  // est déjà visible parce que la liste est courte).
  useEffect(() => {
    if (userScrolled) return
    const onScroll = () => setUserScrolled(true)
    window.addEventListener('scroll', onScroll, { once: true, passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [userScrolled])

  // ── Infinite scroll : observer une sentinel en bas de la liste ────────────
  useEffect(() => {
    if (!sentinelRef.current || !savedRiot) return
    if (!userScrolled) return            // pas de chargement auto avant scroll
    const el = sentinelRef.current
    const obs = new IntersectionObserver(entries => {
      const visible = entries[0].isIntersecting
      if (visible
        && !loadingMatches && !loadingMore
        && !reachedEnd
        && matches.length > 0
        && matches.length < MAX_TOTAL
      ) {
        loadMatches(savedRiot, { append: true, start: matches.length })
      }
    }, { rootMargin: '200px' })
    obs.observe(el)
    return () => obs.disconnect()
  }, [savedRiot, loadingMatches, loadingMore, reachedEnd, matches.length, userScrolled])

  async function loadMatches(
    riot: { gameName: string; tagLine: string; platform: string },
    { append = false, start = 0 }: { append?: boolean; start?: number } = {},
  ) {
    // Lock synchrone : si un fetch est déjà en cours, on ignore les nouveaux appels.
    if (inFlightRef.current) return
    inFlightRef.current = true
    if (append) setLoadingMore(true); else setLoadingMatches(true)
    setMatchError('')
    if (!append) setReachedEnd(false)
    try {
      // Edge Function privée — on envoie le JWT du user pour que Supabase valide l'auth.
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setMatchError(tr.errorAuth); return }

      const res = await fetch(
        FN_URL('riot-matches', {
          gameName: riot.gameName,
          tagLine:  riot.tagLine,
          platform: riot.platform,
          count:    String(PAGE_SIZE),
          start:    String(start),
        }),
        {
          headers: {
            apikey:        SUPA_KEY,
            Authorization: `Bearer ${session.access_token}`,
          },
        },
      )
      const data = await res.json()
      if (!res.ok) { setMatchError(data.error ?? tr.errorRiot); return }
      const newMatches: MatchInfo[] = data.matches ?? []

      if (append) {
        // Dédup sur la base de l'état actuel (closure stable au moment de l'appel)
        const knownIds = new Set(matches.map(m => m.matchId))
        const filtered = newMatches.filter(m => !knownIds.has(m.matchId))
        const trulyNew = filtered.length

        // Update du state avec une 2ème dédup au cas où prev ait changé entre-temps
        setMatches(prev => {
          const prevIds = new Set(prev.map(m => m.matchId))
          return [...prev, ...filtered.filter(m => !prevIds.has(m.matchId))]
        })

        // Filet silencieux : si Riot a renvoyé des matchs mais aucun n'est nouveau,
        // on considère qu'on est à la fin et on stoppe — pas d'erreur affichée.
        if (newMatches.length > 0 && trulyNew === 0) {
          setReachedEnd(true)
        }
      } else {
        setMatches(newMatches)
      }

      // Si Riot renvoie moins que demandé, on est à la fin de l'historique
      if (newMatches.length < PAGE_SIZE) setReachedEnd(true)
      // Le puuid renvoyé identifie l'invocateur affiché à l'écran (peut être un autre joueur si on l'a recherché)
      if (data.puuid) setViewedPuuid(data.puuid)

    } catch {
      setMatchError(tr.errorUnreachable)
    } finally {
      inFlightRef.current = false
      if (append) setLoadingMore(false); else setLoadingMatches(false)
    }
  }

  // ── Sauvegarder le Riot ID ────────────────────────────────────────────────
  // Note : riot_gamename/riot_tagline/riot_platform sont protégés côté DB par un
  // trigger (trg_protect_riot_columns) — seul riot-link-verify (service_role) peut
  // les écrire. Cette fonction enregistre uniquement en state local pour la session.
  function saveRiotId() {
    const raw = sanitize(riotInput)
    const match = raw.match(/^(.+)#(.+)$/)
    if (!match) { setRiotError(tr.errorFormat); return }

    const gameName = sanitize(match[1])
    const tagLine  = sanitize(match[2])
    setRiotError('')

    const saved = { gameName, tagLine, platform }
    setSavedRiot(saved)
    setEditMode(false)
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

      {/* ══ LIAISON COMPTE RIOT ═══════════════════════════════════════════ */}
      {/* Affiché en premier — invitation à lier le compte avant tout usage.
          Kill switch `riot_link_enabled` (EF riot-link-init / riot-link-verify) :
          coupé, le bloc devient un encart. Convention 'notice' et pas 'hidden' :
          un compte DÉJÀ lié reste lié et continue d'alimenter le reste de l'app —
          faire disparaître le bloc laisserait croire que la liaison a sauté. */}
      {riotLinkEnabled
        ? <RiotLinkBlock theme={theme} />
        : <UnavailableNotice title={C.unavailableTitle} text={C.unavailableText} />}

      {/* ══ ROTATION ══════════════════════════════════════════════════════ */}
      <section>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#F5F2FA' }}>{tr.rotationTitle}</div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2 }}>{tr.rotationSubtitle}</div>
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
            {tr.rotationLoading}
          </div>
        ) : rotation.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-dim)', fontSize: 13 }}>
            {tr.rotationUnavailable}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(72px, 1fr))', gap: 8 }}>
            {rotation.map(champ => (
              <div
                key={champ.id}
                onClick={() => router.push(`/champion/${champ.id}`)}
                role="button"
                tabIndex={0}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
                  cursor: 'pointer',
                }}
              >
                <img
                  src={champImg(version, champ.image)}
                  alt={champ.name}
                  style={{
                    width: 58, height: 58, borderRadius: 8,
                    objectFit: 'cover', border: `2px solid ${border}`,
                    transition: 'border-color 0.15s, transform 0.15s',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.borderColor = accent
                    e.currentTarget.style.transform = 'scale(1.05)'
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.borderColor = border
                    e.currentTarget.style.transform = 'scale(1)'
                  }}
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
      {/* Kill switch `riot_history_enabled` — le même qui garde, côté serveur, les
          EF riot-matches / riot-match-detail / riot-rank. La garde est ici plutôt
          que dans `loadMatches` pour que la section entière (saisie du Riot ID,
          stats résumées, liste, scroll infini) disparaisse d'un bloc : n'en couper
          que le chargement laisserait une section vide avec un scroll qui ne
          charge rien, ce qui se lit comme une panne et non comme une coupure. */}
      {!riotHistoryEnabled ? (
        <section>
          <UnavailableNotice title={C.unavailableTitle} text={C.unavailableText} />
        </section>
      ) : (
      <section>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#F5F2FA' }}>
              {tr.matchesTitle}{matches.length > 0 ? ` (${matches.length})` : ''}
            </div>
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
            }}>{tr.change}</button>
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
              {tr.riotPrompt}
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
              <button onClick={saveRiotId} style={{
                padding: '9px 18px', borderRadius: 6,
                background: 'linear-gradient(135deg,#7F77DD,#534AB7)',
                border: 'none', color: 'white', fontSize: 13, fontWeight: 600,
                cursor: 'pointer', fontFamily: 'inherit',
              }}>
                {tr.riotSubmit}
              </button>
              {editMode && (
                <button onClick={() => { setEditMode(false); setRiotError('') }} style={{
                  padding: '9px 12px', borderRadius: 6, fontSize: 13,
                  background: 'transparent', border: `1px solid ${border}`,
                  color: 'var(--text-muted)', cursor: 'pointer', fontFamily: 'inherit',
                }}>{dico.common.cancel}</button>
              )}
            </div>
            {riotError && <div style={{ fontSize: 12, color: '#E24B4A' }}>{riotError}</div>}
            {!userId && (
              <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                {tr.riotNotLogged}
              </div>
            )}
          </div>
        )}

        {/* ── Stats résumées ── */}
        {matches.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 16 }}>
            {[
              { label: tr.kpiGames, value: String(matches.length) },
              { label: tr.kpiWins, value: `${wins}W ${losses}L`, color: wins > losses ? '#5DCAA5' : wins < losses ? '#E24B4A' : undefined },
              { label: tr.kpiWinrate, value: `${winrate}%`, color: (winrate ?? 0) >= 50 ? '#5DCAA5' : '#E24B4A' },
              { label: tr.kpiKda, value: avgKda ?? '-' },
              { label: tr.kpiCs, value: avgCs ? String(avgCs) : '-' },
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
            {tr.listLoading}
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

              return (
                <div
                  key={m.matchId}
                  onClick={() => {
                    if (!savedRiot) return
                    // On embarque le puuid de l'invocateur affiché → la page de match highlighte LE BON joueur
                    const qs = viewedPuuid ? `?puuid=${encodeURIComponent(viewedPuuid)}` : ''
                    router.push(`/match/${savedRiot.platform}/${m.matchId}${qs}`)
                  }}
                  role="button"
                  tabIndex={0}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
                    padding: '10px 14px', borderRadius: 8, background: bg,
                    borderTop:    `1px solid ${border}`,
                    borderRight:  `1px solid ${border}`,
                    borderBottom: `1px solid ${border}`,
                    borderLeft:   `3px solid ${winColor}`,
                    cursor: 'pointer', transition: 'background 120ms',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = bg }}
                >

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
                      {/* `queueId` est dans la réponse à côté de `queueName` : le
                          libellé est résolu ICI, dans la langue affichée. */}
                      <span>{queueLabel(dico.common, m.queueId)}</span>
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
                      {m.win ? dico.common.win : dico.common.loss}
                      {multiKill && (
                        <span style={{
                          marginLeft: 6, padding: '1px 6px', borderRadius: 3, fontSize: 9,
                          background: gold, color: '#1a0d2e',
                        }}>{multiKill}</span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                      {fmt(m.duration)} · {timeAgo(m.gameCreation, tr)}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* ── Sentinel pour l'infinite scroll + indicateurs ── */}
        {!loadingMatches && !matchError && matches.length > 0 && (
          <div ref={sentinelRef} style={{ textAlign: 'center', marginTop: 12, minHeight: 40 }}>
            {loadingMore && (
              <div style={{ color: 'var(--text-muted)', fontSize: 12, padding: '10px 0' }}>
                {tr.listLoadingMore}
              </div>
            )}
            {!loadingMore && !reachedEnd && matches.length < MAX_TOTAL && (
              <button
                onClick={() => savedRiot && loadMatches(savedRiot, { append: true, start: matches.length })}
                style={{
                  padding: '8px 18px', borderRadius: 6, fontSize: 12, fontWeight: 500,
                  cursor: 'pointer', background: 'rgba(127,119,221,0.08)',
                  border: '1px solid rgba(127,119,221,0.25)',
                  color: 'var(--text-muted)',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(127,119,221,0.2)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(127,119,221,0.08)' }}
              >
                {tr.listLoadMore.replace('{count}', String(PAGE_SIZE))}
              </button>
            )}
            {!loadingMore && reachedEnd && (
              <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                {tr.listEnd.replace('{count}', String(matches.length))}
              </div>
            )}
            {!loadingMore && !reachedEnd && matches.length >= MAX_TOTAL && (
              <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                {tr.listLimit.replace('{count}', String(MAX_TOTAL))}
              </div>
            )}
          </div>
        )}

        {/* ── Aucun match sans erreur ── */}
        {!loadingMatches && !matchError && savedRiot && matches.length === 0 && (
          <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-dim)', fontSize: 13 }}>
            {tr.listEmpty}
          </div>
        )}
      </section>
      )}
    </div>
  )
}
