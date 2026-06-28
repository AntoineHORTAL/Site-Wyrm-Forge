'use client'

/**
 * /prac/joueurs — roster complet des joueurs suivis (accepted), admin prac only.
 *
 * Garde d'accès portée par src/app/prac/layout.tsx (prac_admins).
 *
 * Roster (option a, cadrage 4B) = TOUS les joueurs 'accepted', même ceux à 0 match
 * tracké (affichés « — » plutôt que masqués : c'est l'info utile pour l'admin).
 * Deux sources fusionnées CÔTÉ CLIENT :
 *   • EF prac-track {action:'list'} → roster + identité (service_role : un admin
 *     prac n'est pas forcément admin site → ne peut pas lire profiles via RLS).
 *   • RPC prac_top_winrate(1) → winrate/games des seuls joueurs ayant ≥1 match.
 * Le merge se fait sur tracked_player_id. prac_top_winrate ne renvoie PAS les
 * joueurs à 0 match (INNER JOIN) → ils gardent « — ».
 */
import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { callPracTrack, num, type PracPlayer, type TopWinrateRow } from '@/lib/prac'

const supabase = createClient()

interface Row extends PracPlayer {
  games:   number | null
  winrate: number | null
  kda:     number | null
}

export default function PracJoueursPage() {
  const [rows, setRows]       = useState<Row[] | null>(null)
  const [error, setError]     = useState('')

  const load = useCallback(async () => {
    const { data: sess } = await supabase.auth.getSession()
    const token = sess.session?.access_token
    if (!token) { setError('Session expirée — reconnecte-toi.'); return }

    // 1. Roster (EF) + 2. winrates (RPC direct) en parallèle.
    const [listRes, wrRes] = await Promise.all([
      callPracTrack<{ players: PracPlayer[] }>({ action: 'list' }, token),
      supabase.rpc('prac_top_winrate', { p_min_matches: 1 }),
    ])

    if (listRes.error)      { setError(listRes.error); return }
    if (wrRes.error)        { setError(wrRes.error.message); return }

    const stats = new Map<string, TopWinrateRow>()
    for (const r of (wrRes.data ?? []) as TopWinrateRow[]) stats.set(r.tracked_player_id, r)

    const merged: Row[] = (listRes.data?.players ?? []).map((p) => {
      const s = stats.get(p.tracked_player_id)
      return {
        ...p,
        games:   s ? s.games : null,
        winrate: s ? num(s.winrate) : null,
        kda:     s ? num(s.avg_kda) : null,
      }
    })

    // Tri : joueurs avec parties d'abord (winrate desc), puis le reste (alpha).
    merged.sort((a, b) => {
      const ag = a.games ?? -1, bg = b.games ?? -1
      if ((ag >= 0) !== (bg >= 0)) return bg - ag        // ceux avec parties en haut
      if (ag >= 0 && bg >= 0 && b.winrate !== a.winrate) return (b.winrate ?? 0) - (a.winrate ?? 0)
      return (a.username ?? a.game_name ?? '').localeCompare(b.username ?? b.game_name ?? '')
    })

    setRows(merged)
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <div>
      <h1 style={{ fontFamily: 'Cinzel, serif', fontSize: 'clamp(24px, 3.5vw, 34px)', margin: '0 0 6px', color: '#fff' }}>
        Players suivis
      </h1>
      <p style={{ color: '#9b93b5', fontSize: 14, margin: '0 0 24px' }}>
        Tous les joueurs ayant accepté le suivi. Clique sur un joueur pour voir son détail et ses matchs trackés.
      </p>

      {error && <Banner>{error}</Banner>}

      {rows === null && !error && (
        <p style={{ color: '#9b93b5', fontSize: 13 }}>Chargement…</p>
      )}

      {rows !== null && rows.length === 0 && (
        <section style={card}>
          <p style={{ color: '#9b93b5', fontSize: 13, margin: 0 }}>
            Aucun joueur n&apos;a accepté le suivi pour l&apos;instant.
          </p>
        </section>
      )}

      {rows !== null && rows.length > 0 && (
        <section style={{ ...card, padding: 0, overflow: 'hidden' }}>
          {/* En-tête colonnes (caché en mobile étroit via flex) */}
          <div style={{ ...rowBase, color: '#9b93b5', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <span style={{ flex: 1, minWidth: 0 }}>Joueur</span>
            <span style={colNum}>Parties</span>
            <span style={colNum}>Winrate</span>
            <span style={colNum}>KDA</span>
          </div>

          {rows.map((r) => (
            <Link
              key={r.tracked_player_id}
              href={`/prac/joueurs/${r.tracked_player_id}`}
              style={{ ...rowBase, textDecoration: 'none', color: '#E9E6F2', borderBottom: '1px solid rgba(255,255,255,0.05)' }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#E9E6F2', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {r.username ?? r.game_name ?? 'Joueur'}
                  {!r.linked && <span style={{ color: '#EF9F27', fontWeight: 400, fontSize: 12 }}> · non lié</span>}
                </div>
                <div style={{ fontSize: 12, color: '#9b93b5' }}>
                  {r.game_name ? `${r.game_name}#${r.tag_line}` : '—'} · {r.platform}
                </div>
              </div>
              <span style={colNum}>{r.games ?? '—'}</span>
              <span style={{ ...colNum, color: r.winrate === null ? '#6c6585' : r.winrate >= 50 ? '#5DCAA5' : '#E24B4A', fontWeight: 700 }}>
                {r.winrate === null ? '—' : `${r.winrate.toFixed(0)}%`}
              </span>
              <span style={colNum}>{r.kda === null ? '—' : r.kda.toFixed(2)}</span>
            </Link>
          ))}
        </section>
      )}
    </div>
  )
}

// ── Présentation (palette shell prac) ─────────────────────────────────────────
const card: React.CSSProperties = {
  padding: '18px 20px', borderRadius: 10,
  background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
}
const rowBase: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 12, padding: '12px 18px',
}
const colNum: React.CSSProperties = {
  width: 84, flexShrink: 0, textAlign: 'right', fontSize: 14, color: '#E9E6F2',
}

function Banner({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      marginBottom: 16, padding: '8px 12px', borderRadius: 6, fontSize: 13,
      background: '#E24B4A1A', borderLeft: '3px solid #E24B4A', color: '#E24B4A',
    }}>{children}</div>
  )
}
