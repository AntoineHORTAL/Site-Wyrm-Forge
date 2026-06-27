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

const supabase = createClient()

type ConsentStatus = 'pending' | 'accepted' | 'declined' | 'revoked'

interface TrackedRow {
  status: ConsentStatus
  requested_at: string
  responded_at: string | null
}

type Decision = 'accept' | 'decline' | 'revoke'

// Erreurs levées par respond_consent → message FR. Tous ces cas signifient que
// l'état a changé entre le chargement de la page et le clic (concurrence) → on
// resynchronise en rechargeant le dossier.
function rpcErrorToFr(raw: string): string {
  if (raw.includes('no_consent_request'))  return 'Aucune demande de suivi ne te concerne (elle a peut-être été retirée).'
  if (raw.includes('invalid_transition'))  return 'Action impossible : l\'état de ta demande a changé. On a rafraîchi la page.'
  if (raw.includes('invalid_action'))       return 'Action inconnue.'
  return 'Une erreur est survenue. Réessaie dans un instant.'
}

export default function ConsentPage() {
  const [authReady, setAuthReady] = useState(false)
  const [connected, setConnected] = useState(false)
  const [row,     setRow]     = useState<TrackedRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy,    setBusy]    = useState(false)
  const [msg,     setMsg]     = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    setAuthReady(true)
    if (!user) { setConnected(false); setLoading(false); return }
    setConnected(true)

    const { data } = await supabase
      .from('tracked_players')
      .select('status, requested_at, responded_at')
      .eq('profile_id', user.id)
      .maybeSingle()
    setRow((data as TrackedRow | null) ?? null)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function respond(decision: Decision) {
    if (busy) return
    setBusy(true); setMsg(null)
    const { data, error } = await supabase.rpc('respond_consent', { p_decision: decision })
    if (error) {
      setMsg({ kind: 'err', text: rpcErrorToFr(error.message) })
      await load()          // resync : l'état a divergé (dossier retiré / déjà changé)
      setBusy(false)
      return
    }
    // respond_consent RETURNS le nouveau status — on resync proprement depuis la DB.
    await load()
    const newStatus = typeof data === 'string' ? (data as ConsentStatus) : null
    setMsg({ kind: 'ok', text: okMessage(newStatus) })
    setBusy(false)
  }

  // ── Rendu ────────────────────────────────────────────────────────────────
  if (loading && !authReady) {
    return <Shell><p style={{ color: 'var(--text-muted)' }}>Chargement…</p></Shell>
  }

  if (authReady && !connected) {
    return (
      <Shell>
        <Card>
          <Label>Suivi de performances</Label>
          <p style={pStyle}>
            Connecte-toi à ton compte Wyrm Forge pour consulter une éventuelle demande de suivi.
          </p>
          <Link href="/" style={primaryBtnStyle}>Aller à la connexion</Link>
        </Card>
      </Shell>
    )
  }

  return (
    <Shell>
      <Card>
        <Label>Suivi de performances</Label>

        {/* Aucun dossier : page neutre, jamais d'erreur */}
        {!row && (
          <p style={pStyle}>
            Aucune demande de suivi en cours te concernant. Si un organisateur
            souhaite suivre tes performances, tu recevras une demande ici.
          </p>
        )}

        {/* pending : Accepter / Refuser */}
        {row?.status === 'pending' && (
          <>
            <p style={pStyle}>
              Un organisateur Wyrm Forge souhaite <strong style={{ color: '#F5F2FA' }}>suivre tes
              performances League of Legends</strong> dans le temps (historique de parties trackées).
              Aucune donnée n&apos;est collectée tant que tu n&apos;as pas accepté.
            </p>
            <Meta requestedAt={row.requested_at} />
            <Actions>
              <button onClick={() => respond('accept')}  disabled={busy} style={primaryBtnStyle}>
                {busy ? '…' : 'Accepter le suivi'}
              </button>
              <button onClick={() => respond('decline')} disabled={busy} style={dangerBtnStyle}>
                {busy ? '…' : 'Refuser'}
              </button>
            </Actions>
          </>
        )}

        {/* accepted : suivi actif + Révoquer */}
        {row?.status === 'accepted' && (
          <>
            <StatusPill color="#5DCAA5">Suivi actif</StatusPill>
            <p style={pStyle}>
              Tu as accepté le suivi de tes performances. Tu peux le révoquer à tout moment —
              tes données de suivi seront alors supprimées.
            </p>
            <Meta requestedAt={row.requested_at} respondedAt={row.responded_at} />
            <Actions>
              <button onClick={() => respond('revoke')} disabled={busy} style={dangerBtnStyle}>
                {busy ? '…' : 'Révoquer le suivi'}
              </button>
            </Actions>
          </>
        )}

        {/* declined : terminal côté joueur — PAS de bouton Accepter */}
        {row?.status === 'declined' && (
          <>
            <StatusPill color="#A1A1AA">Demande refusée</StatusPill>
            <p style={pStyle}>
              Tu as refusé cette demande de suivi. Aucune donnée n&apos;est collectée.
              Si tu changes d&apos;avis, un organisateur devra te renvoyer une nouvelle demande.
            </p>
            <Meta requestedAt={row.requested_at} respondedAt={row.responded_at} />
          </>
        )}

        {/* revoked : réactivation possible (accept valide depuis revoked) */}
        {row?.status === 'revoked' && (
          <>
            <StatusPill color="#A1A1AA">Suivi révoqué</StatusPill>
            <p style={pStyle}>
              Tu as révoqué le suivi de tes performances. Tu peux le réactiver quand tu veux —
              le suivi reprendra à partir de maintenant.
            </p>
            <Meta requestedAt={row.requested_at} respondedAt={row.responded_at} />
            <Actions>
              <button onClick={() => respond('accept')} disabled={busy} style={primaryBtnStyle}>
                {busy ? '…' : 'Réactiver le suivi'}
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
    </Shell>
  )
}

// ── Messages de succès selon le nouvel état ───────────────────────────────────
function okMessage(status: ConsentStatus | null): string {
  switch (status) {
    case 'accepted': return 'Suivi accepté. Merci !'
    case 'declined': return 'Demande refusée.'
    case 'revoked':  return 'Suivi révoqué. Tes données de suivi seront supprimées.'
    default:         return 'C\'est noté.'
  }
}

// ── Sous-composants de présentation (palette /profil) ─────────────────────────
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main style={{
      minHeight: '100vh', padding: '24px clamp(12px, 4vw, 40px)',
      maxWidth: 680, margin: '0 auto', color: '#F5F2FA',
    }}>
      <Link href="/" style={{
        display: 'inline-block', color: 'var(--text-muted)', fontSize: 13,
        textDecoration: 'none', padding: '6px 0', marginBottom: 14,
      }}>← Retour</Link>
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
  const fmt = (d: string) => new Date(d).toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'long', year: 'numeric',
  })
  return (
    <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 14 }}>
      Demande du {fmt(requestedAt)}
      {respondedAt && <> · réponse le {fmt(respondedAt)}</>}
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
