'use client'

/**
 * /prac — accueil du module prac : top 5 des joueurs suivis par winrate.
 * Admin prac only (garde portée par src/app/prac/layout.tsx).
 *
 * Vitrine, pas roster : on n'affiche QUE les joueurs classés (≥ 3 parties
 * trackées) via RPC direct prac_top_winrate(3) — pas d'EF, pas de roster complet
 * (ça, c'est /prac/joueurs). slice(0,5) côté client (la fonction trie déjà
 * winrate DESC, games DESC). Joueurs sous le seuil → absents ici, visibles sur
 * la page liste.
 */
import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { num, pracPath, type TopWinrateRow } from '@/lib/prac'

const supabase = createClient()

const MIN_MATCHES = 3   // seuil « joueur classé » (cadrage 4C)

// Couleur du badge de rang : or / argent / bronze / neutre.
function rankColor(rank: number): string {
  return rank === 1 ? '#EF9F27' : rank === 2 ? '#C7CBD1' : rank === 3 ? '#CD7F32' : 'rgba(255,255,255,0.10)'
}

export default function PracHomePage() {
  const [rows, setRows]   = useState<TopWinrateRow[] | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('prac_top_winrate', { p_min_matches: MIN_MATCHES })
    if (error) { setError(error.message); return }
    setRows(((data ?? []) as TopWinrateRow[]).slice(0, 5))
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <div>
      <h1 style={{ fontFamily: 'Cinzel, serif', fontSize: 'clamp(26px, 4vw, 40px)', margin: '0 0 6px', color: '#fff' }}>
        Suivi de joueurs
      </h1>
      <p style={{ color: '#9b93b5', fontSize: 15, margin: '0 0 28px' }}>
        Top 5 des joueurs suivis par winrate (à partir de {MIN_MATCHES} parties trackées).
      </p>

      {error && <Banner>{error}</Banner>}

      {rows === null && !error && (
        <p style={{ color: '#9b93b5', fontSize: 13 }}>Chargement…</p>
      )}

      {rows !== null && rows.length === 0 && (
        <section style={card}>
          <p style={{ color: '#9b93b5', fontSize: 14, margin: 0 }}>
            Pas encore assez de données. Un joueur apparaît ici dès qu&apos;il a au moins {MIN_MATCHES} parties trackées.
            {' '}Suis les joueurs depuis{' '}
            <Link href={pracPath('/joueurs')} style={{ color: '#EF9F27' }}>Players suivis</Link>.
          </p>
        </section>
      )}

      {rows !== null && rows.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {rows.map((r, i) => {
            const rank = i + 1
            const wr = num(r.winrate)
            return (
              <Link
                key={r.tracked_player_id}
                href={pracPath(`/joueurs/${r.tracked_player_id}`)}
                style={{
                  ...card, display: 'flex', alignItems: 'center', gap: 16,
                  textDecoration: 'none', color: '#E9E6F2',
                  borderColor: rank === 1 ? 'rgba(239,159,39,0.4)' : 'rgba(255,255,255,0.08)',
                }}
              >
                {/* Badge de rang */}
                <span
                  style={{
                    width: 38, height: 38, borderRadius: 19, flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: 'Cinzel, serif', fontSize: 18, fontWeight: 700,
                    background: rank <= 3 ? rankColor(rank) : 'rgba(255,255,255,0.06)',
                    color: rank <= 3 ? '#1A1A1A' : '#9b93b5',
                  }}
                >
                  {rank}
                </span>

                {/* Identité */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {r.username ?? 'Joueur'}
                  </div>
                  <div style={{ fontSize: 12, color: '#9b93b5' }}>
                    {r.games} partie{r.games > 1 ? 's' : ''} · KDA {num(r.avg_kda).toFixed(2)} · {num(r.avg_cs_per_min).toFixed(1)} cs/min
                  </div>
                </div>

                {/* Winrate */}
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 22, fontWeight: 700, color: wr >= 50 ? '#5DCAA5' : '#E24B4A' }}>
                    {wr.toFixed(0)}%
                  </div>
                  <div style={{ fontSize: 11, color: '#9b93b5' }}>{r.wins}V {r.games - r.wins}D</div>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Présentation (palette shell prac) ─────────────────────────────────────────
const card: React.CSSProperties = {
  padding: '16px 20px', borderRadius: 10,
  background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
}

function Banner({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      marginBottom: 16, padding: '8px 12px', borderRadius: 6, fontSize: 13,
      background: '#E24B4A1A', borderLeft: '3px solid #E24B4A', color: '#E24B4A',
    }}>{children}</div>
  )
}
