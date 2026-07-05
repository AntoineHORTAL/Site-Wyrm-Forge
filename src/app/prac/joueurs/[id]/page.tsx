'use client'

/**
 * /prac/joueurs/[id] — détail d'un joueur suivi (admin prac only).
 * [id] = tracked_player_id.
 *
 * Garde d'accès portée par src/app/prac/layout.tsx (prac_admins).
 *
 * Deux lectures, toutes deux DIRECTES (pas d'EF) :
 *   • RPC prac_player_stats(id) → agrégats + top_champions (SECURITY DEFINER,
 *     garde is_prac_admin OR self ; sous /prac l'appelant est admin → branche admin).
 *   • SELECT tracked_matches via RLS tm_select (l'admin prac voit tout).
 * Chaque match linke vers le rendu existant /match/[region]/[matchId] (cadrage :
 * réutilisation, pas de re-rendu prac).
 */
import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  queueLabel, num, matchKda, csPerMin, pracPath,
  type PlayerStats, type TrackedMatchRow,
} from '@/lib/prac'

const supabase = createClient()

export default function PracJoueurDetailPage() {
  const params = useParams<{ id: string }>()
  const id = params.id

  const [stats, setStats]     = useState<PlayerStats | null>(null)
  const [matches, setMatches] = useState<TrackedMatchRow[] | null>(null)
  const [error, setError]     = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    const [statsRes, matchRes] = await Promise.all([
      supabase.rpc('prac_player_stats', { p_tracked_player_id: id }),
      supabase.from('tracked_matches')
        .select('id, match_id, region, game_creation, champion_name, champion_id, queue_id, win, kills, deaths, assists, cs, duration_s, position, vision_score, damage_dealt, gold_earned')
        .eq('tracked_player_id', id)
        .order('game_creation', { ascending: false }),
    ])

    if (statsRes.error) {
      const m = statsRes.error.message
      setError(m === 'not_found' ? 'Joueur introuvable.'
        : m === 'not_authorized' ? 'Accès non autorisé.'
        : m)
      setLoading(false); return
    }
    if (matchRes.error) { setError(matchRes.error.message); setLoading(false); return }

    setStats(((statsRes.data ?? []) as PlayerStats[])[0] ?? null)
    setMatches((matchRes.data ?? []) as TrackedMatchRow[])
    setLoading(false)
  }, [id])

  useEffect(() => { load() }, [load])

  return (
    <div>
      <Link href={pracPath('/joueurs')} style={{ color: '#9b93b5', fontSize: 13, textDecoration: 'none' }}>← Players suivis</Link>

      {loading && <p style={{ color: '#9b93b5', fontSize: 13, marginTop: 16 }}>Chargement…</p>}
      {error && !loading && <Banner>{error}</Banner>}

      {stats && !loading && (
        <>
          <h1 style={{ fontFamily: 'Cinzel, serif', fontSize: 'clamp(24px, 3.5vw, 34px)', margin: '14px 0 4px', color: '#fff' }}>
            {stats.username ?? 'Joueur'}
          </h1>
          <p style={{ color: '#9b93b5', fontSize: 14, margin: '0 0 24px' }}>
            {stats.games} partie{stats.games > 1 ? 's' : ''} trackée{stats.games > 1 ? 's' : ''}
            {stats.games > 0 && <> · {stats.wins}V {stats.losses}D</>}
          </p>

          {stats.games === 0 ? (
            <section style={card}>
              <p style={{ color: '#9b93b5', fontSize: 13, margin: 0 }}>
                Aucun match tracké pour ce joueur. Ajoute des parties depuis{' '}
                <Link href={pracPath('/ajouter')} style={{ color: '#EF9F27' }}>Ajouter un joueur</Link>.
              </p>
            </section>
          ) : (
            <>
              {/* ── Agrégats ── */}
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
                <Tile label="Winrate" value={`${num(stats.winrate).toFixed(0)}%`} accent={num(stats.winrate) >= 50 ? '#5DCAA5' : '#E24B4A'} />
                <Tile label="KDA" value={num(stats.avg_kda).toFixed(2)} />
                <Tile label="CS/min" value={num(stats.avg_cs_per_min).toFixed(2)} />
                <Tile label="Vision" value={num(stats.avg_vision_score).toFixed(1)} />
                <Tile label="Dégâts (moy.)" value={num(stats.avg_damage_dealt).toLocaleString('fr-FR')} />
                <Tile label="Or (moy.)" value={num(stats.avg_gold_earned).toLocaleString('fr-FR')} />
                <Tile label="K / D / A" value={`${num(stats.avg_kills).toFixed(1)} / ${num(stats.avg_deaths).toFixed(1)} / ${num(stats.avg_assists).toFixed(1)}`} />
              </div>

              {/* ── Top champions ── */}
              {stats.top_champions.length > 0 && (
                <section style={{ ...card, marginBottom: 16 }}>
                  <Label>Champions les plus joués</Label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {stats.top_champions.map((c) => (
                      <div key={c.champion} style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 14 }}>
                        <span style={{ flex: 1, minWidth: 0, color: '#E9E6F2', fontWeight: 600 }}>{c.champion}</span>
                        <span style={{ width: 90, textAlign: 'right', color: '#9b93b5', fontSize: 13 }}>
                          {c.games} partie{c.games > 1 ? 's' : ''}
                        </span>
                        <span style={{ width: 70, textAlign: 'right', fontWeight: 700, color: c.winrate >= 50 ? '#5DCAA5' : '#E24B4A' }}>
                          {c.winrate.toFixed(0)}%
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* ── Liste des matchs trackés ── */}
              <Label>Matchs trackés ({matches?.length ?? 0})</Label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {(matches ?? []).map((m) => (
                  <Link
                    key={m.id}
                    href={`/match/${m.region}/${m.match_id}`}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 8,
                      background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
                      textDecoration: 'none', color: '#E9E6F2',
                    }}
                  >
                    <span style={{ width: 10, height: 10, borderRadius: '50%', flexShrink: 0, background: m.win ? '#5DCAA5' : '#E24B4A' }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>
                        {m.champion_name ?? 'Champion'}{' '}
                        <span style={{ color: '#9b93b5', fontWeight: 400 }}>
                          · {m.kills ?? 0}/{m.deaths ?? 0}/{m.assists ?? 0} ({matchKda(m.kills, m.deaths, m.assists).toFixed(2)})
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: '#9b93b5' }}>
                        {m.queue_id != null ? queueLabel(m.queue_id) : 'File ?'}
                        {' · '}{csPerMin(m.cs, m.duration_s).toFixed(1)} cs/min
                        {' · '}{new Date(m.game_creation).toLocaleString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 700, color: m.win ? '#5DCAA5' : '#E24B4A' }}>{m.win ? 'V' : 'D'}</span>
                  </Link>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}

// ── Présentation (palette shell prac) ─────────────────────────────────────────
const card: React.CSSProperties = {
  padding: '18px 20px', borderRadius: 10,
  background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
}

function Tile({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={{ ...card, flex: '1 1 130px', minWidth: 130, padding: '14px 16px' }}>
      <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', color: '#9b93b5', marginBottom: 6, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: accent ?? '#E9E6F2' }}>{value}</div>
    </div>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.08em', color: '#9b93b5', margin: '0 0 10px', fontWeight: 600 }}>
      {children}
    </div>
  )
}

function Banner({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      marginTop: 16, padding: '8px 12px', borderRadius: 6, fontSize: 13,
      background: '#E24B4A1A', borderLeft: '3px solid #E24B4A', color: '#E24B4A',
    }}>{children}</div>
  )
}
