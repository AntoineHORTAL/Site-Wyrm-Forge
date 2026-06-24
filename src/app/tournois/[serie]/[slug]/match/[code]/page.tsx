// Page détail d'un match — /tournois/[serie]/[slug]/match/[code]
// Server Component :
//   1. série + tournoi par slugs (RLS masque les drafts → notFound)
//   2. tous les matchs du tournoi → résolution du match par code (notFound sinon)
//   3. équipes + joueurs publics (vue tournament_players_public, sans discord)
//   4. garde organisateur (created_by OU admin tournoi) → canManage, passé au client
//   5. navigation amont/aval calculée depuis le câblage next/loser_next
// L'état vivant (statut, vainqueur) + les actions orga sont gérés par MatchLive (client).

import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import MatchLive, { type MatchTeamInfo } from '@/components/tournois/MatchLive'
import TwitchCast from '@/components/tournois/TwitchCast'
import {
  TOURNAMENT_STATUS_LABELS,
  TOURNAMENT_STATUS_COLORS,
  tournamentPath,
  tournamentUrl,
  type Tournament,
  type TournamentTeam,
  type TournamentMatch,
  type TournamentPlayerPublic,
} from '@/lib/tournois'

export const dynamic = 'force-dynamic'

// Résout le tournoi par (série slug, tournoi slug). null si l'un manque (RLS incluse).
async function fetchTournament(serie: string, slug: string): Promise<Tournament | null> {
  const supabase = await createClient()
  const { data: s } = await supabase
    .from('tournament_series').select('id').eq('slug', serie).maybeSingle()
  if (!s) return null
  const { data } = await supabase
    .from('tournaments').select('*')
    .eq('series_id', (s as { id: string }).id)
    .eq('slug', slug)
    .maybeSingle()
  return (data as Tournament | null) ?? null
}

export async function generateMetadata(
  { params }: { params: Promise<{ serie: string; slug: string; code: string }> },
): Promise<Metadata> {
  const { serie, slug, code } = await params
  const t = await fetchTournament(serie, slug)
  const name = t?.name ?? 'Tournoi'
  const canonical = tournamentUrl(serie, slug, `/match/${code}`)
  return {
    title: `Match ${code} — ${name} — Wyrm Forge`,
    description: `Détail du match ${code} du ${name} : équipes, joueurs et résultat en direct.`,
    alternates: { canonical },
    openGraph: {
      url: canonical,
      title: `Match ${code} — ${name} — Wyrm Forge`,
      description: `Tournoi communautaire organisé par Wyrm Forge.`,
    },
  }
}

export default async function MatchPage({
  params,
}: {
  params: Promise<{ serie: string; slug: string; code: string }>
}) {
  const { serie, slug, code } = await params

  // 1. Tournoi (RLS) — draft invisible aux non-propriétaires → notFound
  const tournament = await fetchTournament(serie, slug)
  if (!tournament) notFound()

  const supabase = await createClient()

  // 2-3. Matchs + équipes en parallèle
  const [matchesRes, teamsRes, { data: { user } }] = await Promise.all([
    supabase.from('matches').select('*').eq('tournament_id', tournament.id),
    supabase.from('tournament_teams').select('*').eq('tournament_id', tournament.id),
    supabase.auth.getUser(),
  ])

  const allMatches = (matchesRes.data ?? []) as TournamentMatch[]
  const allTeams   = (teamsRes.data   ?? []) as TournamentTeam[]

  const match = allMatches.find((m) => m.code === code)
  if (!match) notFound()

  // Joueurs publics (sans discord) des équipes du tournoi
  const teamIds = allTeams.map((t) => t.id)
  let players: TournamentPlayerPublic[] = []
  if (teamIds.length > 0) {
    const { data } = await supabase
      .from('tournament_players_public')
      .select('id, team_id, riot_pseudo, user_id, created_at')
      .in('team_id', teamIds)
      .order('created_at', { ascending: true })
    players = (data ?? []) as TournamentPlayerPublic[]
  }

  // 4. Garde organisateur : créateur OU admin tournoi (table tournament_admins)
  let canManage = false
  if (user) {
    if (tournament.created_by === user.id) {
      canManage = true
    } else {
      const { data: allowed } = await supabase.rpc('is_tournament_admin', {
        p_uid: user.id, p_tournament: tournament.id,
      })
      canManage = allowed === true
    }
  }

  // ── Maps dérivées ──────────────────────────────────────────────────────────
  const teams: Record<string, MatchTeamInfo> = {}
  for (const t of allTeams) teams[t.id] = { name: t.name, seed: t.seed }

  const teamPlayers: Record<string, string[]> = {}
  for (const p of players) (teamPlayers[p.team_id] ??= []).push(p.riot_pseudo)

  const codeById = new Map(allMatches.map((m) => [m.id, m.code]))

  // 5. Navigation amont (feeders) / aval (destinations)
  const feeders = allMatches
    .filter((m) => m.next_match_id === match.id || m.loser_next_match_id === match.id)
    .map((m) => ({
      code: m.code,
      kind: m.next_match_id === match.id ? ('winner' as const) : ('loser' as const),
    }))
    .sort((a, b) => parseInt(a.code.slice(1), 10) - parseInt(b.code.slice(1), 10))

  const winnerDest = match.next_match_id       ? codeById.get(match.next_match_id)       ?? null : null
  const loserDest  = match.loser_next_match_id ? codeById.get(match.loser_next_match_id) ?? null : null

  const navLinkStyle: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '7px 14px', borderRadius: 5,
    background: 'rgba(28,58,110,0.35)', border: '1px solid rgba(47,111,222,0.3)',
    color: '#8fc6f5', fontFamily: 'Rajdhani, sans-serif', fontWeight: 600,
    fontSize: 13, textDecoration: 'none', textTransform: 'uppercase', letterSpacing: '.05em',
  }

  return (
    <div
      style={{
        maxWidth: 900,
        margin: '0 auto',
        padding: 'clamp(24px, 4vw, 40px) clamp(16px, 3vw, 32px)',
        display: 'flex',
        flexDirection: 'column',
        gap: 24,
      }}
    >
      {/* ── En-tête tournoi ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Link
          href={tournamentPath(serie, slug, `?tab=bracket&focus=${match.code}`)}
          className="xv2-data"
          style={{ color: '#8fa0bb', fontSize: 13, textDecoration: 'none' }}
        >
          ← Retour au bracket
        </Link>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <h1 className="xv2-display" style={{ fontSize: 'clamp(22px, 4vw, 34px)', color: '#fff', margin: 0 }}>
            {tournament.name}
          </h1>
          <span
            className="xv2-data"
            style={{
              fontSize: 12, padding: '3px 10px', borderRadius: 4,
              textTransform: 'uppercase', letterSpacing: '.06em',
              color: TOURNAMENT_STATUS_COLORS[tournament.status],
              border: `1px solid ${TOURNAMENT_STATUS_COLORS[tournament.status]}`,
            }}
          >
            {TOURNAMENT_STATUS_LABELS[tournament.status]}
          </span>
        </div>

        {(tournament.cashprize_label || tournament.cashprize_bonus) && (
          <p className="xv2-data" style={{ margin: 0, color: '#EF9F27', fontSize: 14 }}>
            🏆 {tournament.cashprize_label}
            {tournament.cashprize_bonus ? ` ${tournament.cashprize_bonus}` : ''}
          </p>
        )}
      </div>

      {/* ── Carte match vivante + contrôles orga ── */}
      <MatchLive
        tournamentId={tournament.id}
        initialMatch={match}
        teams={teams}
        teamPlayers={teamPlayers}
        canManage={canManage}
      />

      {/* ── Cast Twitch — uniquement si le tournoi est en cours ── */}
      {tournament.status === 'live' && tournament.twitch_url && (
        <TwitchCast twitchUrl={tournament.twitch_url} casterName={tournament.caster_name} />
      )}

      {/* ── Navigation amont / aval ── */}
      {(feeders.length > 0 || winnerDest || loserDest) && (
        <nav
          aria-label="Navigation dans le bracket"
          style={{
            display: 'flex', flexDirection: 'column', gap: 14,
            padding: '18px 20px',
            background: 'rgba(20,9,28,0.5)',
            border: '1px solid rgba(47,111,222,0.2)',
            borderRadius: 8,
          }}
        >
          {feeders.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span className="xv2-data" style={{ color: '#6e85a0', fontSize: 12, textTransform: 'uppercase', letterSpacing: '.08em' }}>
                Provenance
              </span>
              {feeders.map((f) => (
                <Link key={f.code} href={tournamentPath(serie, slug, `/match/${f.code}`)} style={navLinkStyle}>
                  {f.code}
                  <span style={{ color: f.kind === 'winner' ? '#5DCAA5' : '#c98fe0', fontSize: 11 }}>
                    {f.kind === 'winner' ? 'gagnant' : 'perdant'}
                  </span>
                </Link>
              ))}
            </div>
          )}

          {(winnerDest || loserDest) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span className="xv2-data" style={{ color: '#6e85a0', fontSize: 12, textTransform: 'uppercase', letterSpacing: '.08em' }}>
                Suite
              </span>
              {winnerDest && (
                <Link href={tournamentPath(serie, slug, `/match/${winnerDest}`)} style={navLinkStyle}>
                  Gagnant → {winnerDest}
                </Link>
              )}
              {loserDest && (
                <Link href={tournamentPath(serie, slug, `/match/${loserDest}`)} style={{ ...navLinkStyle, color: '#c98fe0', borderColor: 'rgba(123,63,143,0.5)' }}>
                  Perdant → {loserDest}
                </Link>
              )}
            </div>
          )}
        </nav>
      )}
    </div>
  )
}
