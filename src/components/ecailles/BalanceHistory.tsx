'use client'

import { useState, useEffect } from 'react'
import { useTheme } from '@/components/providers/ThemeProvider'
import { createClient } from '@/lib/supabase/client'
import { useDashboard } from '@/locales/dashboard'

const PAGE_SIZE = 10

interface LedgerRow {
  id: number
  delta: number
  source: string
  ref_id: string | null
  created_at: string
}

interface Props {
  balance: number
  balanceLoading: boolean
}

function fmtDate(iso: string) {
  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso))
}

export default function BalanceHistory({ balance, balanceLoading }: Props) {
  const { theme } = useTheme()
  const c = theme === 'mythic'
  const supabase = createClient()
  const d = useDashboard()
  const e = d.ecailles

  const [rows, setRows] = useState<LedgerRow[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(false)

  const accent = c ? '#EF9F27' : '#7F77DD'
  const border = c ? 'rgba(186,117,23,0.2)' : '#27272A'

  useEffect(() => { loadPage(0, true) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadPage(p: number, reset = false) {
    setLoading(true)
    const from = p * PAGE_SIZE
    const { data } = await supabase
      .from('scales_ledger')
      .select('id, delta, source, ref_id, created_at')
      .order('created_at', { ascending: false })
      .range(from, from + PAGE_SIZE)

    if (data) {
      const fetched = data as LedgerRow[]
      if (reset) setRows(fetched.slice(0, PAGE_SIZE))
      else setRows(prev => [...prev, ...fetched.slice(0, PAGE_SIZE)])
      setHasMore(fetched.length > PAGE_SIZE)
      setPage(p)
    }
    setLoading(false)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* ── Solde ── */}
      <div style={{
        padding: '28px 32px', borderRadius: 12,
        background: c ? 'rgba(186,117,23,0.08)' : 'rgba(127,119,221,0.07)',
        border: `1px solid ${border}`,
        display: 'flex', alignItems: 'center', gap: 20,
      }}>
        <div>
          <div style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 4 }}>{e.balance.yourBalance}</div>
          <div style={{
            fontSize: 36, fontWeight: 700, color: accent,
            fontFamily: c ? 'Cinzel, serif' : 'inherit',
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            {balanceLoading ? '…' : balance.toLocaleString('fr-FR')}
            <img src="/icons/ecaille.png" alt={e.scalesAlt} width={44} height={44} />
          </div>
        </div>
      </div>

      {/* ── Historique ── */}
      <div>
        <h3 style={{ fontSize: 15, fontWeight: 600, color: '#F5F2FA', marginBottom: 12 }}>{e.balance.historyTitle}</h3>

        {loading && rows.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontSize: 14, padding: '20px 0' }}>{d.common.loading}</div>
        ) : rows.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: '40px 32px', borderRadius: 10,
            border: `1.5px dashed ${border}`,
          }}>
            <div style={{ fontSize: 28, marginBottom: 10 }}>📜</div>
            <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: 0 }}>
              {e.balance.empty}
            </p>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {rows.map(row => (
                <div key={row.id} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '10px 14px', borderRadius: 8,
                  background: 'rgba(255,255,255,0.025)',
                  border: `1px solid ${border}`,
                }}>
                  <div>
                    <div style={{ fontSize: 13, color: '#F5F2FA' }}>
                      {e.balance.sources[row.source as keyof typeof e.balance.sources] ?? row.source}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                      {fmtDate(row.created_at)}
                    </div>
                  </div>
                  <span style={{
                    fontSize: 15, fontWeight: 700,
                    color: row.delta > 0 ? '#5DCAA5' : '#E24B4A',
                  }}>
                    {row.delta > 0 ? '+' : ''}{row.delta.toLocaleString('fr-FR')}
                  </span>
                </div>
              ))}
            </div>

            {hasMore && (
              <button
                onClick={() => loadPage(page + 1)}
                disabled={loading}
                style={{
                  marginTop: 12, width: '100%', padding: '9px 0',
                  background: 'transparent', border: `1px solid ${border}`,
                  borderRadius: 8, color: 'var(--text-muted)', fontSize: 13,
                  cursor: loading ? 'wait' : 'pointer', fontFamily: 'inherit',
                }}
              >
                {loading ? d.common.loading : e.balance.loadMore}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
