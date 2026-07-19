'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const supabase = createClient()

const PLATFORMS = [
  { value: 'euw1', label: 'EUW' }, { value: 'eun1', label: 'EUNE' },
  { value: 'na1',  label: 'NA'  }, { value: 'kr',   label: 'KR'   },
  { value: 'br1',  label: 'BR'  }, { value: 'jp1',  label: 'JP'   },
  { value: 'oc1',  label: 'OCE' }, { value: 'tr1',  label: 'TR'   },
]

interface Suggestion { game_name: string; tag_line: string }

interface Props {
  defaultRegion?: string
  defaultRiotId?: string
  // Route de destination (préfixe) : `/summoner` (profil public) par défaut,
  // `/matches` pour la page d'historique publique F3. Non-breaking : les appelants
  // existants gardent /summoner.
  basePath?: string
}

export default function PlayerSearchBar({ defaultRegion = 'euw1', defaultRiotId = '', basePath = '/summoner' }: Props) {
  const router   = useRouter()
  const [input,     setInput]     = useState(defaultRiotId)
  const [region,    setRegion]    = useState(defaultRegion)
  const [error,     setError]     = useState('')
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [showSugg,  setShowSugg]  = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wrapperRef  = useRef<HTMLDivElement>(null)

  // Fermer le dropdown sur clic extérieur
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowSugg(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  function onInputChange(v: string) {
    setInput(v); setError('')
    const gamePart = v.includes('#') ? v.split('#')[0] : v
    if (!gamePart || gamePart.length < 2) { setSuggestions([]); setShowSugg(false); return }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      const { data } = await supabase
        .from('searched_summoners')
        .select('game_name, tag_line')
        .eq('region', region)
        .ilike('game_name', `${gamePart}%`)
        .order('last_seen', { ascending: false })
        .limit(8)
      setSuggestions(data ?? [])
      setShowSugg((data ?? []).length > 0)
    }, 300)
  }

  function navigate(gameName: string, tagLine: string) {
    setShowSugg(false)
    router.push(`${basePath}/${region}/${encodeURIComponent(gameName + '#' + tagLine)}`)
  }

  function onSubmit() {
    const parts = input.split('#')
    if (parts.length !== 2 || !parts[0]?.trim() || !parts[1]?.trim()) {
      setError('Format attendu : GameName#TAG')
      return
    }
    navigate(parts[0].trim(), parts[1].trim())
  }

  return (
    <div ref={wrapperRef} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-start', position: 'relative' }}>
      <div style={{ flex: '1 1 220px', position: 'relative' }}>
        <input
          value={input}
          onChange={e => onInputChange(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') onSubmit() }}
          onFocus={() => suggestions.length > 0 && setShowSugg(true)}
          placeholder="GameName#TAG"
          autoComplete="off"
          style={{
            width: '100%', padding: '9px 12px', borderRadius: 6, fontSize: 13,
            background: '#27272A', border: `1px solid ${error ? '#E24B4A' : '#3F3F46'}`,
            color: '#F5F2FA', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
          }}
        />
        {showSugg && suggestions.length > 0 && (
          <div style={{
            position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 50,
            background: '#18181B', border: '1px solid #3F3F46', borderRadius: 6,
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)', overflow: 'hidden',
          }}>
            {suggestions.map((s, i) => (
              <div
                key={i}
                onMouseDown={() => {
                  setInput(`${s.game_name}#${s.tag_line}`)
                  navigate(s.game_name, s.tag_line)
                }}
                style={{
                  padding: '8px 12px', fontSize: 12, cursor: 'pointer',
                  color: '#F5F2FA', display: 'flex', justifyContent: 'space-between',
                  borderBottom: i < suggestions.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(127,119,221,0.12)' }}
                onMouseLeave={e => { e.currentTarget.style.background = '' }}
              >
                <span>{s.game_name}</span>
                <span style={{ color: 'var(--text-dim)' }}>#{s.tag_line}</span>
              </div>
            ))}
          </div>
        )}
        {error && (
          <div style={{ fontSize: 11, color: '#E24B4A', marginTop: 4 }}>{error}</div>
        )}
      </div>

      <select
        value={region}
        onChange={e => setRegion(e.target.value)}
        style={{
          padding: '9px 10px', borderRadius: 6, fontSize: 13,
          background: '#27272A', border: '1px solid #3F3F46',
          color: '#F5F2FA', fontFamily: 'inherit', cursor: 'pointer', outline: 'none',
        }}
      >
        {PLATFORMS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
      </select>

      <button onClick={onSubmit} style={{
        padding: '9px 18px', borderRadius: 6, fontSize: 13, fontWeight: 600,
        background: 'linear-gradient(135deg,#7F77DD,#534AB7)',
        border: 'none', color: 'white', cursor: 'pointer', fontFamily: 'inherit',
      }}>
        Rechercher
      </button>
    </div>
  )
}
