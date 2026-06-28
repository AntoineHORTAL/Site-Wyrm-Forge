'use client'

/**
 * /prac/ajouter-joueur — recherche d'un profil + envoi d'une demande de suivi.
 * Admin prac only (garde portée par src/app/prac/layout.tsx).
 *
 * DISTINCTE de /prac/ajouter (qui tracke des MATCHS d'un joueur déjà suivi).
 * Ici on ajoute un joueur au roster : recherche → bouton → request_tracking.
 *
 * Deux RPC directs (SECURITY DEFINER + gardés, pas d'EF) :
 *   • prac_search_profiles(q) → profils + tracking_status (champs minimaux).
 *   • request_tracking(profile_id) → crée/rouvre une demande (status → pending).
 * Le bouton par ligne dépend de tracking_status (Suivre / en attente / déjà
 * suivi / renvoyer une demande). Re-search après chaque action (resync).
 */
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { ProfileSearchResult } from '@/lib/prac'

const supabase = createClient()

// Erreurs request_tracking → message FR.
function reqErrToFr(raw: string): string {
  if (raw.includes('already_tracked')) return 'Ce joueur est déjà suivi.'
  if (raw.includes('not_prac_admin'))  return 'Accès non autorisé.'
  return 'Une erreur est survenue. Réessaie.'
}

export default function PracAjouterJoueurPage() {
  const [query, setQuery]     = useState('')
  const [results, setResults] = useState<ProfileSearchResult[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [error, setError]     = useState('')
  const [busyId, setBusyId]   = useState('')   // profile_id en cours d'action

  const runSearch = useCallback(async (q: string) => {
    setSearching(true); setError('')
    const { data, error } = await supabase.rpc('prac_search_profiles', { p_query: q })
    if (error) { setError(error.message); setSearching(false); return }
    setResults((data ?? []) as ProfileSearchResult[])
    setSearching(false)
  }, [])

  // Recherche débouncée. < 2 caractères → rien (cohérent avec le seuil serveur).
  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) { setResults(null); setError(''); return }
    const t = setTimeout(() => { void runSearch(q) }, 300)
    return () => clearTimeout(t)
  }, [query, runSearch])

  async function doTrack(profileId: string) {
    if (busyId) return
    setBusyId(profileId); setError('')
    const { error } = await supabase.rpc('request_tracking', { p_profile_id: profileId })
    setBusyId('')
    if (error) setError(reqErrToFr(error.message))
    await runSearch(query.trim())   // resync dans tous les cas (l'état a pu changer)
  }

  return (
    <div>
      <h1 style={{ fontFamily: 'Cinzel, serif', fontSize: 'clamp(24px, 3.5vw, 34px)', margin: '0 0 6px', color: '#fff' }}>
        Ajouter un joueur
      </h1>
      <p style={{ color: '#9b93b5', fontSize: 14, margin: '0 0 24px' }}>
        Recherche un membre par pseudo Wyrm Forge ou Riot ID, puis envoie-lui une demande de suivi.
        Le tracking de ses matchs se fait ensuite depuis « Tracker des matchs ».
      </p>

      <section style={card}>
        <Label>Recherche</Label>
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Pseudo ou Riot ID (min. 2 caractères)…"
          style={input}
        />
        {error && <Banner kind="err">{error}</Banner>}
      </section>

      {/* Résultats */}
      <section style={{ ...card, marginTop: 16 }}>
        {query.trim().length < 2 ? (
          <p style={muted}>Saisis au moins 2 caractères pour lancer la recherche.</p>
        ) : searching && results === null ? (
          <p style={muted}>Recherche…</p>
        ) : results && results.length === 0 ? (
          <p style={muted}>Aucun profil ne correspond à « {query.trim()} ».</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(results ?? []).map((r) => (
              <div
                key={r.profile_id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 8,
                  background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#E9E6F2', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {r.username ?? 'Joueur'}
                    {!r.linked && <span style={{ color: '#EF9F27', fontWeight: 400, fontSize: 12 }}> · non lié</span>}
                  </div>
                  <div style={{ fontSize: 12, color: '#9b93b5' }}>
                    {r.riot_gamename ? `${r.riot_gamename}#${r.riot_tagline}` : '—'}{r.riot_platform ? ` · ${r.riot_platform}` : ''}
                  </div>
                </div>
                <ActionButton
                  status={r.tracking_status}
                  busy={busyId === r.profile_id}
                  onTrack={() => doTrack(r.profile_id)}
                />
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

// Bouton dépendant du statut de suivi (cf. tracking_status de prac_search_profiles).
function ActionButton({ status, busy, onTrack }: {
  status: ProfileSearchResult['tracking_status']; busy: boolean; onTrack: () => void
}) {
  if (status === 'pending')  return <Pill color="#EF9F27">Demande en attente</Pill>
  if (status === 'accepted') return <Pill color="#5DCAA5">Déjà suivi</Pill>

  // null / declined / revoked → action possible (request_tracking crée OU rouvre).
  const label = status === 'declined' || status === 'revoked' ? 'Renvoyer une demande' : 'Suivre'
  return (
    <button onClick={onTrack} disabled={busy} style={{ ...btnPrimary, opacity: busy ? 0.6 : 1, whiteSpace: 'nowrap' }}>
      {busy ? '…' : label}
    </button>
  )
}

// ── Présentation (palette shell prac) ─────────────────────────────────────────
const card: React.CSSProperties = {
  padding: '18px 20px', borderRadius: 10,
  background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
}
const input: React.CSSProperties = {
  width: '100%', padding: '9px 11px', borderRadius: 6, fontSize: 14,
  background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.12)',
  color: '#E9E6F2', fontFamily: 'inherit', outline: 'none',
}
const btnPrimary: React.CSSProperties = {
  padding: '8px 16px', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer',
  background: 'rgba(239,159,39,0.18)', border: '1px solid #EF9F27', color: '#fff',
}
const muted: React.CSSProperties = { color: '#9b93b5', fontSize: 13, margin: 0 }

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.08em', color: '#9b93b5', marginBottom: 6, fontWeight: 600 }}>
      {children}
    </div>
  )
}

function Pill({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span style={{
      padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap',
      background: `${color}1A`, border: `1px solid ${color}`, color,
    }}>{children}</span>
  )
}

function Banner({ kind, children }: { kind: 'ok' | 'err'; children: React.ReactNode }) {
  const c = kind === 'ok' ? '#5DCAA5' : '#E24B4A'
  return (
    <div style={{
      marginTop: 12, padding: '8px 12px', borderRadius: 6, fontSize: 13,
      background: `${c}1A`, borderLeft: `3px solid ${c}`, color: c,
    }}>{children}</div>
  )
}
