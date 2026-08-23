'use client'

/**
 * Page de consentement au suivi de performances : /consent
 *
 * Le module interne « prac » (suivi de joueurs) ne stocke aucune donnée Riot
 * d'un joueur tant que celui-ci n'a pas accepté. Cette page est l'interface
 * JOUEUR (site public, hors gating prac_admins) pour répondre à une demande de
 * suivi : accepter, refuser, révoquer, ou réactiver après révocation.
 *
 * Lecture : tracked_players WHERE profile_id = auth.uid() via la policy RLS
 * tp_select (Lot A). Écriture : RPC respond_consent (Lot B), seul point d'entrée.
 *
 * Machine d'états côté fonction (rappel) :
 *   accept : pending → accepted | revoked → accepted (réactivation)
 *   decline: pending → declined
 *   revoke : accepted → revoked
 * 'declined' est terminal côté joueur : AUCUN bouton « Accepter » dans ce cas
 * (la fonction lèverait invalid_transition). Seul l'admin peut rouvrir.
 */
import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import {
  num, matchKda, csPerMin, queueLabel,
  type PlayerStats, type TrackedMatchRow,
} from '@/lib/prac'
import { useDashboard, type DashboardDict } from '@/locales/dashboard'
import { consentRpcError, consentOkMessage, gamesLabel } from '@/locales/dashboard/profil'

const supabase = createClient()

type ConsentStatus = 'pending' | 'accepted' | 'declined' | 'revoked'

interface TrackedRow {
  id: string
  status: ConsentStatus
  requested_at: string
  responded_at: string | null
}

type Decision = 'accept' | 'decline' | 'revoke'

/**
 * Statuts possibles de `tracked_players.status` (CHECK en base). Exporté pour que le
 * dico prouve qu'il a une pastille pour chacun de ceux qui en affichent une.
 */
export const CONSENT_STATUSES = ['pending', 'accepted', 'declined', 'revoked'] as const

/**
 * Codes levés par `RAISE EXCEPTION` dans `respond_consent` (migration 20260627000001).
 * Recopiés ici : le client ne peut pas les importer depuis le SQL.
 */
export const CONSENT_RPC_ERRORS = ['no_consent_request', 'invalid_transition', 'invalid_action'] as const

export default function ConsentPage() {
  const dico = useDashboard()
  const P = dico.profil
  const C = P.consent
  const [authReady, setAuthReady] = useState(false)
  const [connected, setConnected] = useState(false)
  const [row,     setRow]     = useState<TrackedRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy,    setBusy]    = useState(false)
  const [msg,     setMsg]     = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  // Bloc « Ton suivi » (4D) — peuplé uniquement quand status='accepted'.
  const [stats,   setStats]   = useState<PlayerStats | null>(null)
  const [matches, setMatches] = useState<TrackedMatchRow[] | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    setAuthReady(true)
    if (!user) { setConnected(false); setLoading(false); return }
    setConnected(true)

    const { data } = await supabase
      .from('tracked_players')
      .select('id, status, requested_at, responded_at')
      .eq('profile_id', user.id)
      .maybeSingle()
    const r = (data as TrackedRow | null) ?? null
    setRow(r)

    // Vue self : agrégats (prac_player_stats branche self) + matchs bruts
    // (tracked_matches via RLS tm_select self). Uniquement si accepté — sur
    // declined/revoked il n'y a rien à montrer (revoke purge les matchs).
    if (r?.status === 'accepted') {
      const [statsRes, matchRes] = await Promise.all([
        supabase.rpc('prac_player_stats', { p_tracked_player_id: r.id }),
        supabase
          .from('tracked_matches')
          .select('id, match_id, region, game_creation, champion_name, champion_id, queue_id, win, kills, deaths, assists, cs, duration_s, position, vision_score, damage_dealt, gold_earned')
          .eq('tracked_player_id', r.id)
          .order('game_creation', { ascending: false }),
      ])
      setStats(statsRes.error ? null : ((statsRes.data ?? []) as PlayerStats[])[0] ?? null)
      setMatches(matchRes.error ? [] : ((matchRes.data ?? []) as TrackedMatchRow[]))
    } else {
      setStats(null); setMatches(null)
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function respond(decision: Decision) {
    if (busy) return
    setBusy(true); setMsg(null)
    const { data, error } = await supabase.rpc('respond_consent', { p_decision: decision })
    if (error) {
      setMsg({ kind: 'err', text: consentRpcError(P, error.message) })
      await load()          // resync : l'état a divergé (dossier retiré / déjà changé)
      setBusy(false)
      return
    }
    // respond_consent RETURNS le nouveau status — on resync proprement depuis la DB.
    await load()
    const newStatus = typeof data === 'string' ? (data as ConsentStatus) : null
    setMsg({ kind: 'ok', text: consentOkMessage(P, newStatus) })
    setBusy(false)
  }

  // ── Rendu ────────────────────────────────────────────────────────────────
  if (loading && !authReady) {
    return <Shell><p style={{ color: 'var(--text-muted)' }}>{dico.common.loading}</p></Shell>
  }

  if (authReady && !connected) {
    return (
      <Shell>
        <Card>
          <Label>{C.title}</Label>
          <p style={pStyle}>{C.signedOut}</p>
          <Link href="/" style={primaryBtnStyle}>{C.signIn}</Link>
        </Card>
      </Shell>
    )
  }

  return (
    <Shell>
      <Card>
        <Label>{C.title}</Label>

        {/* Aucun dossier : page neutre, jamais d'erreur */}
        {!row && <p style={pStyle}>{C.none}</p>}

        {/* pending : Accepter / Refuser */}
        {row?.status === 'pending' && (
          <>
            <p style={pStyle}>
              {C.pendingBefore} <strong style={{ color: '#F5F2FA' }}>{C.pendingStrong}</strong> {C.pendingAfter}
            </p>
            <Meta requestedAt={row.requested_at} />
            <Actions>
              <button onClick={() => respond('accept')}  disabled={busy} style={primaryBtnStyle}>
                {busy ? '…' : C.accept}
              </button>
              <button onClick={() => respond('decline')} disabled={busy} style={dangerBtnStyle}>
                {busy ? '…' : C.decline}
              </button>
            </Actions>
          </>
        )}

        {/* accepted : suivi actif + Révoquer */}
        {row?.status === 'accepted' && (
          <>
            <StatusPill color="#5DCAA5">{C.pills.accepted}</StatusPill>
            <p style={pStyle}>{C.acceptedText}</p>
            <Meta requestedAt={row.requested_at} respondedAt={row.responded_at} />
            <Actions>
              <button onClick={() => respond('revoke')} disabled={busy} style={dangerBtnStyle}>
                {busy ? '…' : C.revoke}
              </button>
            </Actions>
          </>
        )}

        {/* declined : terminal côté joueur — PAS de bouton Accepter */}
        {row?.status === 'declined' && (
          <>
            <StatusPill color="#A1A1AA">{C.pills.declined}</StatusPill>
            <p style={pStyle}>{C.declinedText}</p>
            <Meta requestedAt={row.requested_at} respondedAt={row.responded_at} />
          </>
        )}

        {/* revoked : réactivation possible (accept valide depuis revoked) */}
        {row?.status === 'revoked' && (
          <>
            <StatusPill color="#A1A1AA">{C.pills.revoked}</StatusPill>
            <p style={pStyle}>{C.revokedText}</p>
            <Meta requestedAt={row.requested_at} respondedAt={row.responded_at} />
            <Actions>
              <button onClick={() => respond('accept')} disabled={busy} style={primaryBtnStyle}>
                {busy ? '…' : C.reactivate}
              </button>
            </Actions>
          </>
        )}

        {msg && (
          <div style={{
            marginTop: 14, padding: '8px 12px', borderRadius: 4, fontSize: 13,
            background: msg.kind === 'ok' ? 'rgba(93,202,165,0.10)' : 'rgba(226,75,74,0.10)',
            borderLeft: `3px solid ${msg.kind === 'ok' ? '#5DCAA5' : '#E24B4A'}`,
            color: msg.kind === 'ok' ? '#5DCAA5' : '#E24B4A',
          }}>{msg.text}</div>
        )}
      </Card>

      {/* Vue self (4D) : ce que le suivi a enregistré, en toute transparence. */}
      {row?.status === 'accepted' && <SelfTracking dico={dico} stats={stats} matches={matches} />}
    </Shell>
  )
}

// ── Bloc « Ton suivi » (vue self, palette /consent) ───────────────────────────
function SelfTracking({ dico, stats, matches }: {
  dico: DashboardDict
  stats: PlayerStats | null; matches: TrackedMatchRow[] | null
}) {
  const P = dico.profil
  const C = P.consent
  const games = stats?.games ?? 0
  // Le bilan « · 8V 4D » est optionnel (agrégats absents) : il est composé à part puis
  // interpolé dans la phrase, qui porte elle-même sa parenthèse fermante.
  const record = stats
    ? C.record.replace('{wins}', String(stats.wins)).replace('{losses}', String(games - stats.wins))
    : ''
  const intro = (games > 1 ? C.selfIntroOther : C.selfIntroOne)
    .replace('{count}', String(games))
    .replace('{record}', record)
  return (
    <section style={{ ...selfCard, marginTop: 16 }}>
      <Label>{C.selfTitle}</Label>

      {games === 0 ? (
        <p style={pStyle}>{C.selfEmpty}</p>
      ) : (
        <>
          <p style={{ ...pStyle, marginBottom: 16 }}>{intro}</p>

          {/* Tuiles d'agrégats */}
          {stats && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
              <Tile label={P.shared.winrate} value={`${num(stats.winrate).toFixed(0)}%`} accent={num(stats.winrate) >= 50 ? '#5DCAA5' : '#E24B4A'} />
              <Tile label={C.kda} value={num(stats.avg_kda).toFixed(2)} />
              <Tile label={C.csPerMin} value={num(stats.avg_cs_per_min).toFixed(2)} />
              <Tile label={C.vision} value={num(stats.avg_vision_score).toFixed(1)} />
              <Tile label={C.damage} value={num(stats.avg_damage_dealt).toLocaleString('fr-FR')} />
              <Tile label={C.gold} value={num(stats.avg_gold_earned).toLocaleString('fr-FR')} />
            </div>
          )}

          {/* Top champions */}
          {stats && stats.top_champions.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={subLabel}>{P.shared.topChampions}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {stats.top_champions.map((c) => (
                  <div key={c.champion} style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 13 }}>
                    <span style={{ flex: 1, minWidth: 0, color: '#F5F2FA', fontWeight: 600 }}>{c.champion}</span>
                    <span style={{ width: 86, textAlign: 'right', color: 'var(--text-dim)' }}>{gamesLabel(P, c.games)}</span>
                    <span style={{ width: 56, textAlign: 'right', fontWeight: 700, color: c.winrate >= 50 ? '#5DCAA5' : '#E24B4A' }}>{c.winrate.toFixed(0)}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Liste des matchs suivis */}
          <div style={subLabel}>{C.trackedTitle.replace('{count}', String(matches?.length ?? 0))}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {(matches ?? []).map((m) => (
              <Link
                key={m.id}
                href={`/match/${m.region}/${m.match_id}`}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', borderRadius: 6,
                  background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
                  textDecoration: 'none', color: '#F5F2FA',
                }}
              >
                <span style={{ width: 9, height: 9, borderRadius: '50%', flexShrink: 0, background: m.win ? '#5DCAA5' : '#E24B4A' }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>
                    {m.champion_name ?? C.championFallback}{' '}
                    <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>
                      · {m.kills ?? 0}/{m.deaths ?? 0}/{m.assists ?? 0} ({matchKda(m.kills, m.deaths, m.assists).toFixed(2)})
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                    {/* `queueLabel` vit dans `lib/prac`, partagé avec /prac/* (hors
                        périmètre) : ses libellés restent français — voir Lot 8. */}
                    {m.queue_id != null ? queueLabel(m.queue_id) : C.queueFallback}
                    {' · '}{csPerMin(m.cs, m.duration_s).toFixed(1)} cs/min
                    {' · '}{new Date(m.game_creation).toLocaleString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, color: m.win ? '#5DCAA5' : '#E24B4A' }}>{m.win ? dico.common.winInitial : dico.common.lossInitial}</span>
              </Link>
            ))}
          </div>
        </>
      )}
    </section>
  )
}

function Tile({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={{
      flex: '1 1 120px', minWidth: 120, padding: '10px 12px', borderRadius: 8,
      background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
    }}>
      <div style={subLabel}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: accent ?? '#F5F2FA' }}>{value}</div>
    </div>
  )
}

const selfCard: React.CSSProperties = {
  padding: '20px 24px', borderRadius: 12,
  background: 'rgba(255,255,255,0.02)',
  border: '1px solid rgba(255,255,255,0.06)',
  borderLeft: '4px solid #7F77DD',
}

const subLabel: React.CSSProperties = {
  fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase',
  letterSpacing: 1, marginBottom: 8, fontWeight: 700,
}

// ── Sous-composants de présentation (palette /profil) ─────────────────────────
function Shell({ children }: { children: React.ReactNode }) {
  const back = useDashboard().profil.shared.back
  return (
    <main style={{
      minHeight: '100vh', padding: '24px clamp(12px, 4vw, 40px)',
      maxWidth: 680, margin: '0 auto', color: '#F5F2FA',
    }}>
      <Link href="/" style={{
        display: 'inline-block', color: 'var(--text-muted)', fontSize: 13,
        textDecoration: 'none', padding: '6px 0', marginBottom: 14,
      }}>{back}</Link>
      {children}
    </main>
  )
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <section style={{
      padding: '20px 24px', borderRadius: 12,
      background: 'rgba(255,255,255,0.02)',
      border: '1px solid rgba(255,255,255,0.06)',
      borderLeft: '4px solid #7F77DD',
    }}>{children}</section>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase',
      letterSpacing: 1, marginBottom: 10, fontWeight: 700,
    }}>{children}</div>
  )
}

function StatusPill({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span style={{
      display: 'inline-block', padding: '3px 10px', borderRadius: 4, marginBottom: 10,
      background: `${color}22`, color, fontSize: 11, fontWeight: 700, letterSpacing: 1,
      textTransform: 'uppercase',
    }}>{children}</span>
  )
}

function Meta({ requestedAt, respondedAt }: { requestedAt: string; respondedAt?: string | null }) {
  const C = useDashboard().profil.consent
  // Les DATES restent formatées en fr-FR — catégorie « locale de données », Lot 8.
  const fmt = (d: string) => new Date(d).toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'long', year: 'numeric',
  })
  return (
    <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 14 }}>
      {C.metaRequested.replace('{date}', fmt(requestedAt))}
      {respondedAt && <> {C.metaResponded.replace('{date}', fmt(respondedAt))}</>}
    </div>
  )
}

function Actions({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>{children}</div>
}

const pStyle: React.CSSProperties = {
  fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.6, margin: '0 0 14px',
}

const primaryBtnStyle: React.CSSProperties = {
  display: 'inline-block', padding: '8px 16px', borderRadius: 6, fontSize: 13, fontWeight: 600,
  cursor: 'pointer', textDecoration: 'none', textAlign: 'center',
  background: 'rgba(239,159,39,0.18)', border: '1px solid #EF9F27', color: '#F5F2FA',
}

const dangerBtnStyle: React.CSSProperties = {
  padding: '8px 16px', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer',
  background: 'rgba(226,75,74,0.15)', border: '1px solid #E24B4A', color: '#E24B4A',
}
