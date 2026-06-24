'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

// ─── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  theme: 'mythic' | 'classic'
}

// Snapshot du profil pertinent pour ce composant
interface RiotProfile {
  riot_puuid:          string | null
  riot_gamename:       string | null
  riot_tagline:        string | null
  riot_platform:       string | null
  riot_link_pending:   { target_icon: number; candidate_puuid: string; platform: string; game_name: string; tag_line: string } | null
  riot_link_expires_at: string | null
}

type Step = 'loading' | 'linked' | 'idle' | 'init_loading' | 'pending' | 'verify_loading'

// ─── Constantes ────────────────────────────────────────────────────────────────

const DDN = 'https://ddragon.leagueoflegends.com'
const DD_FALLBACK_VERSION = '15.10.1'

const PLATFORMS = [
  { value: 'euw1', label: 'EUW'  }, { value: 'eun1', label: 'EUNE' },
  { value: 'na1',  label: 'NA'   }, { value: 'kr',   label: 'KR'   },
  { value: 'br1',  label: 'BR'   }, { value: 'jp1',  label: 'JP'   },
  { value: 'oc1',  label: 'OCE'  }, { value: 'tr1',  label: 'TR'   },
  { value: 'la1',  label: 'LAN'  }, { value: 'la2',  label: 'LAS'  },
  { value: 'ru',   label: 'RU'   },
]

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPA_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// ─── Helpers ───────────────────────────────────────────────────────────────────

/** Formate un nombre de secondes en MM:SS. */
function fmtCountdown(secs: number): string {
  const m = Math.max(0, Math.floor(secs / 60))
  const s = Math.max(0, secs % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

// ─── Composant ─────────────────────────────────────────────────────────────────

export default function RiotLinkBlock({ theme }: Props) {
  const c = theme === 'mythic'

  // Couleurs thème — alignées avec AccueilTab et AdminTab
  const border = c ? 'rgba(186,117,23,0.2)' : '#27272A'
  const bg     = c ? 'rgba(42,21,71,0.4)'   : '#18181B'
  const accent = c ? '#BA7517'               : '#7F77DD'

  const supabase = createClient()

  // ── State ──────────────────────────────────────────────────────────────────
  const [step,          setStep]          = useState<Step>('loading')
  const [profile,       setProfile]       = useState<RiotProfile | null>(null)
  const [inputRiotId,   setInputRiotId]   = useState('')    // "GameName#TAG"
  const [inputPlatform, setInputPlatform] = useState('euw1')
  const [targetIconId,  setTargetIconId]  = useState<number | null>(null)
  const [expiresAt,     setExpiresAt]     = useState<Date | null>(null)
  const [error,         setError]         = useState<string | null>(null)
  const [ddVersion,     setDdVersion]     = useState(DD_FALLBACK_VERSION)
  const [countdown,     setCountdown]     = useState(0)   // secondes restantes
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Chargement initial ────────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      // Version DDragon — nécessaire pour afficher l'image de l'icône-cible
      try {
        const vRes = await fetch(`${DDN}/api/versions.json`)
        const versions: string[] = await vRes.json()
        if (versions[0]) setDdVersion(versions[0])
      } catch {
        // On garde le fallback hardcodé — pas critique
      }

      // Profil utilisateur
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setStep('idle'); return }

      const { data } = await supabase
        .from('profiles')
        .select('riot_puuid, riot_gamename, riot_tagline, riot_platform, riot_link_pending, riot_link_expires_at')
        .eq('id', user.id)
        .single()

      if (!data) { setStep('idle'); return }
      setProfile(data as RiotProfile)

      if (data.riot_puuid) {
        setStep('linked')
        return
      }

      // Reprendre un challenge en cours si la fenêtre n'est pas encore expirée
      if (data.riot_link_pending && data.riot_link_expires_at) {
        const exp = new Date(data.riot_link_expires_at)
        if (exp > new Date()) {
          setTargetIconId(data.riot_link_pending.target_icon)
          setExpiresAt(exp)
          setStep('pending')
          return
        }
      }

      setStep('idle')
    }
    load()
  }, [])

  // ── Countdown timer ────────────────────────────────────────────────────────
  // Le timer tourne uniquement quand on est à l'étape 'pending'.
  // Il remet à zéro et revient à 'idle' quand expiresAt est dépassé.
  useEffect(() => {
    if (step !== 'pending' || !expiresAt) return

    function tick() {
      const remaining = Math.round((expiresAt!.getTime() - Date.now()) / 1000)
      if (remaining <= 0) {
        setCountdown(0)
        setStep('idle')
        setError('Délai expiré. Relance la liaison.')
        clearInterval(countdownRef.current!)
      } else {
        setCountdown(remaining)
      }
    }

    tick() // Premier tick immédiat pour éviter le flash "00:00"
    countdownRef.current = setInterval(tick, 1000)
    return () => clearInterval(countdownRef.current!)
  }, [step, expiresAt])

  // ── Actions ────────────────────────────────────────────────────────────────

  async function handleInit() {
    setError(null)

    // Parser "GameName#TAG"
    const raw   = inputRiotId.trim()
    const match = raw.match(/^(.+)#(.+)$/)
    if (!match) {
      setError('Format invalide — utilise GameName#TAG (ex. Faker#T1)')
      return
    }
    const gameName = match[1].trim()
    const tagLine  = match[2].trim()
    if (!gameName || !tagLine) {
      setError('Format invalide — le nom ou le tag est vide.')
      return
    }

    setStep('init_loading')

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setError('Connexion requise.'); setStep('idle'); return }

      const res = await fetch(`${SUPA_URL}/functions/v1/riot-link-init`, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          apikey:          SUPA_KEY,
          Authorization:   `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ gameName, tagLine, platform: inputPlatform }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? 'Erreur lors de l\'initialisation.')
        setStep('idle')
        return
      }

      setTargetIconId(data.target_icon_id)
      setExpiresAt(new Date(data.expires_at))
      setStep('pending')

    } catch {
      setError('Impossible de joindre le serveur.')
      setStep('idle')
    }
  }

  async function handleVerify() {
    setError(null)
    setStep('verify_loading')

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setError('Connexion requise.'); setStep('pending'); return }

      const res = await fetch(`${SUPA_URL}/functions/v1/riot-link-verify`, {
        method:  'POST',
        headers: {
          apikey:        SUPA_KEY,
          Authorization: `Bearer ${session.access_token}`,
        },
      })

      const data = await res.json()

      if (!res.ok) {
        // Sur erreur 400 (icône non trouvée), on repasse à 'pending' pour que
        // l'utilisateur puisse réessayer sans relancer tout le challenge.
        setError(data.error ?? 'Erreur lors de la vérification.')
        setStep('pending')
        return
      }

      // Liaison réussie — recharger le profil pour afficher l'état 'linked'
      setProfile(prev => prev ? {
        ...prev,
        riot_puuid:    'confirmed', // valeur sentinel — le vrai puuid est en DB
        riot_gamename: data.game_name,
        riot_tagline:  data.tag_line,
        riot_platform: data.platform,
      } : prev)
      setStep('linked')

    } catch {
      setError('Impossible de joindre le serveur.')
      setStep('pending')
    }
  }

  async function handleUnlink() {
    setError(null)
    try {
      // clear_riot_link est une fonction RPC Supabase qui efface les colonnes
      // riot_* du profil connecté (à créer côté DB).
      const { error } = await supabase.rpc('clear_riot_link')
      if (error) { setError('Erreur lors de la déliaison.'); return }

      setProfile(prev => prev ? {
        ...prev,
        riot_puuid: null, riot_gamename: null, riot_tagline: null, riot_platform: null,
      } : prev)
      setStep('idle')
    } catch {
      setError('Impossible de joindre le serveur.')
    }
  }

  async function handleCancel() {
    setError(null)
    try {
      await supabase.rpc('clear_riot_link')
    } catch {
      // Même si l'annulation échoue côté DB, on remet l'UI à zéro —
      // le pending expirera tout seul dans 15 min.
    }
    clearInterval(countdownRef.current!)
    setTargetIconId(null)
    setExpiresAt(null)
    setStep('idle')
  }

  // ── Rendu ──────────────────────────────────────────────────────────────────

  const containerStyle: React.CSSProperties = {
    padding:      '18px 20px',
    borderRadius: 12,
    background:   'rgba(255,255,255,0.02)',
    border:       '1px solid rgba(255,255,255,0.07)',
  }

  const titleStyle: React.CSSProperties = {
    fontSize:      12,
    fontVariant:   'small-caps',
    color:         'var(--text-dim)',
    letterSpacing: 1,
    marginBottom:  14,
    textTransform: 'uppercase',
  }

  // Style bouton principal — suit le pattern des boutons accent du dashboard
  const btnPrimaryStyle: React.CSSProperties = {
    padding:     '9px 18px',
    borderRadius: 6,
    background:  `linear-gradient(135deg,${accent},${c ? '#8B5E0A' : '#534AB7'})`,
    border:      'none',
    color:       'white',
    fontSize:    13,
    fontWeight:  600,
    cursor:      'pointer',
    fontFamily:  'inherit',
  }

  const btnSecondaryStyle: React.CSSProperties = {
    padding:     '9px 14px',
    borderRadius: 6,
    background:  'transparent',
    border:      `1px solid ${border}`,
    color:       'var(--text-muted)',
    fontSize:    13,
    cursor:      'pointer',
    fontFamily:  'inherit',
  }

  const inputStyle: React.CSSProperties = {
    flex:        '1 1 180px',
    padding:     '9px 12px',
    borderRadius: 6,
    background:   c ? 'rgba(20,10,35,0.6)' : '#27272A',
    border:       `1px solid ${border}`,
    color:       'var(--text)',
    fontFamily:  'inherit',
    fontSize:    13,
    outline:     'none',
  }

  const selectStyle: React.CSSProperties = {
    padding:     '9px 10px',
    borderRadius: 6,
    fontSize:    13,
    background:   c ? 'rgba(20,10,35,0.6)' : '#27272A',
    border:       `1px solid ${border}`,
    color:       'var(--text)',
    fontFamily:  'inherit',
    cursor:      'pointer',
    outline:     'none',
  }

  return (
    <div style={containerStyle}>
      <div style={titleStyle}>Mon compte Riot</div>

      {/* ── Chargement initial ── */}
      {step === 'loading' && (
        <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>Chargement…</div>
      )}

      {/* ── Compte lié ── */}
      {step === 'linked' && profile && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: '#5DCAA5', fontSize: 16 }}>✓</span>
            <div>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#F5F2FA' }}>
                {profile.riot_gamename}
                <span style={{ color: 'var(--text-dim)' }}>#{profile.riot_tagline}</span>
              </span>
              <span style={{ fontSize: 11, color: accent, marginLeft: 8 }}>
                {PLATFORMS.find(p => p.value === profile.riot_platform)?.label ?? profile.riot_platform}
              </span>
            </div>
          </div>
          <button onClick={handleUnlink} style={btnSecondaryStyle}>Délier</button>
        </div>
      )}

      {/* ── Formulaire de saisie ── */}
      {step === 'idle' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            Lie ton compte Riot pour prouver que tu en es le propriétaire.
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            <input
              value={inputRiotId}
              onChange={e => { setInputRiotId(e.target.value); setError(null) }}
              onKeyDown={e => e.key === 'Enter' && handleInit()}
              placeholder="Faker#T1"
              style={inputStyle}
            />
            <select
              value={inputPlatform}
              onChange={e => setInputPlatform(e.target.value)}
              style={selectStyle}
            >
              {PLATFORMS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
            <button onClick={handleInit} style={btnPrimaryStyle}>
              Lier mon compte
            </button>
          </div>
          {error && <div style={{ fontSize: 12, color: '#EF4444' }}>{error}</div>}
        </div>
      )}

      {/* ── Init en cours ── */}
      {step === 'init_loading' && (
        <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>Initialisation du challenge…</div>
      )}

      {/* ── Challenge en attente ── */}
      {step === 'pending' && targetIconId !== null && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            Change ton icône d&apos;invocateur pour :
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            {/* Image DDragon de l'icône-cible */}
            <img
              src={`${DDN}/cdn/${ddVersion}/img/profileicon/${targetIconId}.png`}
              alt={`Icône d'invocateur n°${targetIconId}`}
              width={72}
              height={72}
              style={{ borderRadius: 8, border: `2px solid ${accent}`, display: 'block' }}
            />
            <div>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#F5F2FA', fontFamily: 'monospace' }}>
                {fmtCountdown(countdown)}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>
                restantes pour valider
              </div>
            </div>
          </div>

          <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
            Équipe cette icône dans le client LoL, puis clique sur Vérifier.
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={handleVerify} style={btnPrimaryStyle}>
              Vérifier
            </button>
            <button onClick={handleCancel} style={btnSecondaryStyle}>
              Annuler
            </button>
          </div>

          {error && <div style={{ fontSize: 12, color: '#EF4444' }}>{error}</div>}
        </div>
      )}

      {/* ── Verify en cours ── */}
      {step === 'verify_loading' && (
        <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>Vérification de l&apos;icône en cours…</div>
      )}
    </div>
  )
}
