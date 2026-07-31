'use client'

// ════════════════════════════════════════════════════════════════════════════
//  PostGameTab — bilan IA d'une partie (première brique)
// ════════════════════════════════════════════════════════════════════════════
// UNE seule des 9 combinaisons prévues : profondeur « simple » × mode « perso ».
// Le but de cette brique est de valider le patron EF/prompt/coût de bout en
// bout — les 8 autres combinaisons réutiliseront cette structure, il ne faut
// donc pas la spécialiser davantage.
//
// Le solde affiché est celui du pot « Chaleur de la Forge », PARTAGÉ avec
// MatchUp : lancer un bilan ici réduit aussi ce qui reste pour un match up.

import { useCallback, useEffect, useState } from 'react'
import { useTheme } from '@/components/providers/ThemeProvider'
import type { UserProfile } from '@/app/page'
import {
  analyzePostGame, getPostGameQuota, canAffordPostGame,
  type PostGameQuota, type PostGameResult,
} from '@/lib/postgame/api'

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPA_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Forme « slim » renvoyée par riot-matches — on ne lit que ce qu'il faut pour
// présenter un choix. Le détail complet est refetché SERVEUR par l'EF : le
// client n'a rien à en savoir, et surtout rien à lui transmettre.
interface SlimMatch {
  matchId: string
  championName?: string
  win?: boolean
  kills?: number
  deaths?: number
  assists?: number
  gameCreation?: number
  gameDuration?: number
  queueId?: number
}

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`
const dayFr = (ms: number) =>
  new Date(ms).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })

export default function PostGameTab({ profile }: { profile?: UserProfile | null }) {
  const { theme } = useTheme()
  const c = theme === 'mythic'

  const puuid    = profile?.riot_puuid
  const platform = profile?.riot_platform ?? 'euw1'

  const [matches, setMatches] = useState<SlimMatch[] | null>(null)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [quota, setQuota]   = useState<PostGameQuota | null>(null)
  const [busy, setBusy]     = useState(false)
  const [result, setResult] = useState<PostGameResult | null>(null)

  // Historique récent du joueur (riot-matches est public, la clé Riot reste
  // côté serveur). Sans compte Riot lié, il n'y a rien à proposer.
  useEffect(() => {
    if (!puuid) return
    let alive = true
    ;(async () => {
      try {
        const qs = new URLSearchParams({ puuid, platform, count: '10' })
        const res = await fetch(`${SUPA_URL}/functions/v1/riot-matches?${qs}`, {
          headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` },
        })
        const body = await res.json().catch(() => null)
        if (!alive) return
        if (!res.ok) { setLoadErr(body?.error ?? 'Historique indisponible.'); return }
        const list: SlimMatch[] = body?.matches ?? (Array.isArray(body) ? body : [])
        setMatches(list)
        if (list.length) setSelected(list[0].matchId)
      } catch {
        if (alive) setLoadErr('Erreur réseau — historique indisponible.')
      }
    })()
    return () => { alive = false }
  }, [puuid, platform])

  useEffect(() => { getPostGameQuota().then(q => setQuota(q)) }, [])

  const run = useCallback(async () => {
    if (!selected || !puuid || busy) return
    setBusy(true)
    const r = await analyzePostGame(selected, puuid, platform)
    setResult(r)
    // La réponse porte l'état de solde (succès comme 429) — on s'en sert plutôt
    // que de refaire un GET, sauf sur erreur réseau/serveur où il est inconnu.
    if (r.success || r.overQuota) {
      setQuota({ used: r.used, limit: r.limit, remaining: r.remaining, model: r.model, resetsAt: r.resetsAt, costs: r.costs })
    }
    setBusy(false)
  }, [selected, puuid, platform, busy])

  const cost      = quota?.costs.simple_perso ?? 0
  const affordable = canAffordPostGame(quota)
  const canRun    = !!selected && !!puuid && !busy && affordable

  if (!puuid) {
    return (
      <div style={{ padding: 24 }}>
        <p style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.7 }}>
          Lie ton compte Riot depuis ta page profil pour analyser tes parties.
        </p>
      </div>
    )
  }

  return (
    <div>
      {/* En-tête : solde partagé + coût de l'action */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Bilan de partie</div>
        {quota && (
          <span style={{ fontSize: 12, color: affordable ? 'var(--text-muted)' : '#E5484D' }}>
            Chaleur de la Forge — {quota.remaining} braise{quota.remaining > 1 ? 's' : ''} sur {quota.limit}
            {cost > 0 ? ` · ce bilan en coûte ${cost}` : ''}
          </span>
        )}
      </div>

      {loadErr && (
        <p style={{ fontSize: 13, color: '#E5484D', marginBottom: 12 }}>{loadErr}</p>
      )}

      {/* Sélecteur de match */}
      {matches === null && !loadErr && (
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Chargement de ton historique…</p>
      )}
      {matches?.length === 0 && (
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Aucune partie récente trouvée.</p>
      )}

      {!!matches?.length && (
        <div style={{ display: 'grid', gap: 6, marginBottom: 16 }}>
          {matches.map(m => {
            const on = m.matchId === selected
            return (
              <button
                key={m.matchId}
                onClick={() => setSelected(m.matchId)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left',
                  padding: '10px 14px', borderRadius: 8, cursor: 'pointer',
                  background: on ? (c ? 'rgba(186,117,23,0.12)' : 'rgba(127,119,221,0.12)') : 'var(--card)',
                  border: `1px solid ${on ? (c ? '#BA7517' : '#7F77DD') : 'var(--border)'}`,
                  color: 'var(--text)', fontSize: 13,
                }}
              >
                <span style={{
                  width: 8, height: 8, borderRadius: 4, flexShrink: 0,
                  background: m.win ? '#5DCAA5' : '#E5484D',
                }} />
                <span style={{ fontWeight: 600, minWidth: 90 }}>{m.championName ?? '—'}</span>
                <span style={{ color: 'var(--text-muted)' }}>
                  {m.kills ?? 0}/{m.deaths ?? 0}/{m.assists ?? 0}
                </span>
                <span style={{ color: 'var(--text-dim)', marginLeft: 'auto', fontSize: 12 }}>
                  {m.gameDuration ? mmss(m.gameDuration) : ''}
                  {m.gameCreation ? ` · ${dayFr(m.gameCreation)}` : ''}
                </span>
              </button>
            )
          })}
        </div>
      )}

      <button
        onClick={run}
        disabled={!canRun}
        style={{
          padding: '9px 18px', borderRadius: 8, fontSize: 13, fontWeight: 700,
          cursor: canRun ? 'pointer' : 'not-allowed',
          opacity: canRun ? 1 : 0.5,
          background: c ? 'rgba(186,117,23,0.18)' : 'rgba(127,119,221,0.18)',
          border: `1px solid ${c ? '#BA7517' : '#7F77DD'}`,
          color: 'var(--text)',
        }}
      >
        {busy ? 'Analyse…' : 'Analyser cette partie'}{cost > 0 ? ` · ${cost}` : ''}
      </button>

      {/* Solde insuffisant : message explicite, sinon le bouton grisé n'explique rien */}
      {quota && !affordable && (
        <p style={{ fontSize: 12, color: '#E5484D', marginTop: 8 }}>
          Il te reste {quota.remaining} braises — il en faut {cost} pour ce bilan.
        </p>
      )}

      {result && (
        <div style={{
          marginTop: 16, padding: '14px 18px', borderRadius: 10,
          background: 'var(--card)',
          border: `1px solid ${result.success ? 'var(--border)' : '#E5484D'}`,
        }}>
          {result.truncated && (
            <div style={{ fontSize: 12, color: '#EF9F27', marginBottom: 8 }}>
              ⚠ Analyse tronquée (limite de longueur atteinte).
            </div>
          )}
          <div style={{
            fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap',
            color: result.success ? 'var(--text)' : '#E5484D',
          }}>
            {result.text}
          </div>
        </div>
      )}
    </div>
  )
}
