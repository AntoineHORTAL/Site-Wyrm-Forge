'use client'

import { useState, useEffect } from 'react'
import { useTheme } from '@/components/providers/ThemeProvider'
import { createClient } from '@/lib/supabase/client'

// ─── Types ─────────────────────────────────────────────────────────────────────
interface ChampInfo { id: string; name: string; image: string; numericId: number }
interface MatchInfo {
  matchId: string; championId: number; championName: string
  queueId: number; queueName: string
  kills: number; deaths: number; assists: number
  cs: number; duration: number; win: boolean; gameCreation: number
}

const DDN      = 'https://ddragon.leagueoflegends.com'
const champImg = (v: string, img: string) => `${DDN}/cdn/${v}/img/champion/${img}`

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

  // DDragon
  const [version, setVersion]   = useState('')
  const [champMap, setChampMap] = useState<Record<number, ChampInfo>>({}) // numericId → champ

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
      const cRes = await fetch(`${DDN}/cdn/${v}/data/fr_FR/champion.json`)
      const cData = await cRes.json()
      const map: Record<number, ChampInfo> = {}
      Object.values(cData.data).forEach((ch: any) => {
        map[Number(ch.key)] = { id: ch.id, name: ch.name, image: ch.image.full, numericId: Number(ch.key) }
      })
      setChampMap(map)

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
    } catch {
      setMatchError('Impossible de joindre l\'API Riot.')
    } finally {
      setLoadingMatches(false)
    }
  }

  // ── Sauvegarder le Riot ID ────────────────────────────────────────────────
  async function saveRiotId() {
    const raw = riotInput.trim()
    const match = raw.match(/^(.+)#(.+)$/)
    if (!match) { setRiotError('Format invalide — utilise GameName#TAG'); return }

    const [, gameName, tagLine] = match
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

        {/* ── Liste des matchs ── */}
        {!loadingMatches && !matchError && matches.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {matches.map(m => {
              const champ = champMap[m.championId]
              return (
                <div key={m.matchId} style={{
                  display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
                  padding: '12px 16px', borderRadius: 8, background: bg,
                  border: `1px solid ${border}`,
                  borderLeft: `3px solid ${m.win ? '#5DCAA5' : '#E24B4A'}`,
                }}>
                  {/* Champion icon */}
                  {champ && version ? (
                    <img src={champImg(version, champ.image)} alt={champ.name}
                      style={{ width: 40, height: 40, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} />
                  ) : (
                    <div style={{
                      width: 40, height: 40, borderRadius: 6, flexShrink: 0,
                      background: 'linear-gradient(135deg,#7F77DD,#534AB7)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 12, fontWeight: 600, color: 'white',
                    }}>{m.championName.slice(0, 2)}</div>
                  )}

                  {/* Champion + mode */}
                  <div style={{ flex: '1 1 120px', minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#F5F2FA', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {champ?.name ?? m.championName}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{m.queueName}</div>
                  </div>

                  {/* KDA */}
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', flexShrink: 0 }}>
                    {kda(m.kills, m.deaths, m.assists)}
                  </div>

                  {/* CS + durée */}
                  <div style={{ fontSize: 12, color: 'var(--text-dim)', flexShrink: 0 }}>
                    {m.cs} CS · {fmt(m.duration)}
                  </div>

                  {/* Résultat */}
                  <div style={{
                    fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1,
                    color: m.win ? '#5DCAA5' : '#E24B4A', flexShrink: 0,
                  }}>
                    {m.win ? 'Victoire' : 'Défaite'}
                  </div>

                  {/* Temps */}
                  <div style={{ fontSize: 11, color: 'var(--text-dim)', flexShrink: 0, marginLeft: 'auto' }}>
                    {timeAgo(m.gameCreation)}
                  </div>
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
