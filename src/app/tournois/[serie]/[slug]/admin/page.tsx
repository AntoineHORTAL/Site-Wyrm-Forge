// Panneau organisateur — /tournois/[slug]/admin
// Server Component — garde d'accès : session requise ET (created_by OU admin).
// Les actions sont exécutées par AdminPanel (client) via l'EF tournament-admin,
// qui revérifie les droits côté serveur (jamais confiance au front).

import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Xv2Logo } from '@/components/tournois/Xv2Deco'
import AdminPanel from '@/components/tournois/AdminPanel'
import { tournamentPath, type Tournament, type TournamentTeam, type TournamentMatch } from '@/lib/tournois'

export const dynamic = 'force-dynamic'

export default async function TournoisAdminPage({
  params,
}: {
  params: Promise<{ serie: string; slug: string }>
}) {
  const { serie, slug } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect(tournamentPath(serie, slug))
  }

  // Série puis tournoi (RLS : drafts visibles au créateur/admin uniquement)
  const { data: seriesRow } = await supabase
    .from('tournament_series').select('id').eq('slug', serie).maybeSingle()
  if (!seriesRow) notFound()

  const { data: tournamentData } = await supabase
    .from('tournaments')
    .select('*')
    .eq('series_id', (seriesRow as { id: string }).id)
    .eq('slug', slug)
    .maybeSingle()

  const tournament = tournamentData as Tournament | null
  if (!tournament) notFound()

  // Garde d'accès : créateur du tournoi OU admin tournoi (table tournament_admins :
  // scope global, série du tournoi, ou ce tournoi précis). L'EF revérifie de toute façon.
  const isOwner = tournament.created_by === user.id
  let canManage = isOwner
  if (!canManage) {
    const { data: allowed } = await supabase.rpc('is_tournament_admin', {
      p_uid: user.id, p_tournament: tournament.id,
    })
    canManage = allowed === true
  }
  if (!canManage) {
    redirect(tournamentPath(serie, slug))
  }

  // Équipes + matchs en parallèle
  const [teamsRes, matchesRes] = await Promise.all([
    supabase
      .from('tournament_teams')
      .select('*')
      .eq('tournament_id', tournament.id)
      .order('created_at', { ascending: true }),
    supabase
      .from('matches')
      .select('*')
      .eq('tournament_id', tournament.id),
  ])

  const teams   = (teamsRes.data   ?? []) as TournamentTeam[]
  const matches = (matchesRes.data ?? []) as TournamentMatch[]

  return (
    <div
      style={{
        maxWidth: 900,
        margin: '0 auto',
        padding: 'clamp(32px, 5vw, 56px) clamp(16px, 3vw, 32px)',
      }}
    >
      {/* En-tête admin */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          marginBottom: 32,
        }}
      >
        <Xv2Logo size={44} />
        <div>
          <h1
            className="xv2-display"
            style={{
              fontSize: 'clamp(22px, 4vw, 36px)',
              color: '#fff',
              margin: 0,
            }}
          >
            PANNEAU ORGANISATEUR
          </h1>
          <p
            className="xv2-data"
            style={{ margin: '4px 0 0', color: '#8fa0bb', fontSize: 13 }}
          >
            {tournament.name}
          </p>
        </div>
      </div>

      {/* Bandeau brouillon */}
      {tournament.status === 'draft' && (
        <div
          role="status"
          style={{
            marginBottom: 24,
            padding: '12px 18px',
            background: 'rgba(239,159,39,0.1)',
            border: '1px solid rgba(239,159,39,0.4)',
            borderRadius: 6,
          }}
        >
          <p className="xv2-data" style={{ margin: 0, color: '#EF9F27', fontSize: 14 }}>
            Brouillon — ouvre les inscriptions quand tu es prêt.
          </p>
        </div>
      )}

      {/* Séparateur */}
      <div
        style={{
          height: 1,
          background: 'linear-gradient(90deg, rgba(47,111,222,0.5), rgba(240,106,216,0.3), transparent)',
          marginBottom: 32,
        }}
      />

      {/* Actions organisateur */}
      <AdminPanel tournament={tournament} teams={teams} matches={matches} />

      {/* Lien retour */}
      <div style={{ marginTop: 32 }}>
        <Link
          href={tournamentPath(serie, slug)}
          className="xv2-btn-outline"
          style={{ display: 'inline-flex' }}
        >
          ← Retour au tournoi
        </Link>
      </div>
    </div>
  )
}
