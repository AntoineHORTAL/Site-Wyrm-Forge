'use client'

// TournamentLive — Client Component.
// Détient l'état vivant de la page tournoi (matchs, équipes, classement) et
// l'abonnement Realtime sur la table matches (filtré tournament_id).
// UN SEUL channel par page : le composant reste monté quel que soit le tab
// actif (le contenu du tab est commuté ici, pas côté serveur), cleanup au unmount.

import { useEffect, useRef, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type {
  Tournament,
  TournamentTeam,
  TournamentMatch,
  StandingRow,
} from '@/lib/tournois'
import type { TournamentTab } from './TournamentTabs'
import BracketView, { type BracketTeamInfo } from './bracket/BracketView'
import StandingsTable from './StandingsTable'
import RegistrationForm from './RegistrationForm'

interface TournamentLiveProps {
  tournament:       Tournament
  serie:            string
  initialTeams:     TournamentTeam[]
  initialMatches:   TournamentMatch[]
  initialStandings: StandingRow[]
  activeTab:        TournamentTab
}

export default function TournamentLive({
  tournament,
  serie,
  initialTeams,
  initialMatches,
  initialStandings,
  activeTab,
}: TournamentLiveProps) {
  const [teams, setTeams]           = useState<TournamentTeam[]>(initialTeams)
  const [matches, setMatches]       = useState<TournamentMatch[]>(initialMatches)
  const [standings, setStandings]   = useState<StandingRow[]>(initialStandings)

  // Debounce du refetch : un report_match_result touche plusieurs lignes matches
  // d'affilée (résultat + propagations) — on ne refetch qu'une fois la rafale passée.
  const refetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const refetchDerived = useCallback(() => {
    if (refetchTimer.current) clearTimeout(refetchTimer.current)
    refetchTimer.current = setTimeout(async () => {
      const supabase = createClient()
      const [standingsRes, teamsRes] = await Promise.all([
        supabase
          .from('tournament_standings')
          .select('*')
          .eq('tournament_id', tournament.id)
          .order('points', { ascending: false }),
        supabase
          .from('tournament_teams')
          .select('*')
          .eq('tournament_id', tournament.id)
          .order('created_at', { ascending: true }),
      ])
      if (standingsRes.data) setStandings(standingsRes.data as StandingRow[])
      if (teamsRes.data)     setTeams(teamsRes.data as TournamentTeam[])
    }, 350)
  }, [tournament.id])

  // ── Abonnement Realtime — un seul channel, cleanup au unmount ──────────────
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`tournoi-${tournament.id}`)
      .on(
        'postgres_changes',
        {
          event:  '*',
          schema: 'public',
          table:  'matches',
          filter: `tournament_id=eq.${tournament.id}`,
        },
        (payload) => {
          // Patch local de l'état bracket sans reload
          if (payload.eventType === 'INSERT') {
            const row = payload.new as TournamentMatch
            setMatches((prev) =>
              prev.some((m) => m.id === row.id) ? prev : [...prev, row])
          } else if (payload.eventType === 'UPDATE') {
            const row = payload.new as TournamentMatch
            setMatches((prev) => prev.map((m) => (m.id === row.id ? row : m)))
          } else if (payload.eventType === 'DELETE') {
            const row = payload.old as Partial<TournamentMatch>
            setMatches((prev) => prev.filter((m) => m.id !== row.id))
          }
          // Classement + seeds dérivés des matchs → refetch débounancé
          refetchDerived()
        },
      )
      .subscribe()

    return () => {
      if (refetchTimer.current) clearTimeout(refetchTimer.current)
      supabase.removeChannel(channel)
    }
  }, [tournament.id, refetchDerived])

  // ── Données dérivées pour le bracket ────────────────────────────────────────
  const teamInfos: Record<string, BracketTeamInfo> = {}
  for (const t of teams) {
    teamInfos[t.id] = { name: t.name, seed: t.seed }
  }

  const standingRows = standings.map((s, i) => ({
    rank:      i + 1,
    team_name: s.team_name,
    players:   s.riot_pseudos ?? [],
    wins:      s.wins,
    losses:    s.losses,
    points:    s.points,
  }))

  // ── Rendu par tab ───────────────────────────────────────────────────────────

  if (activeTab === 'bracket') {
    return <BracketView serie={serie} slug={tournament.slug} matches={matches} teams={teamInfos} />
  }

  if (activeTab === 'classement') {
    return <StandingsTable rows={standingRows} />
  }

  // Tab "présentation"
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div
        style={{
          padding: '28px 24px',
          background: 'rgba(28,58,110,0.2)',
          border: '1px solid rgba(47,111,222,0.2)',
          borderRadius: 8,
        }}
      >
        <p
          className="xv2-data"
          style={{ color: '#8fa0bb', fontSize: 15, margin: 0, lineHeight: 1.7 }}
        >
          Les sections Affiche et Règles ci-dessus résument tout ce qu&apos;il faut savoir
          sur ce tournoi. Utilise les onglets <strong style={{ color: '#f06ad8' }}>Bracket</strong>
          {' '}et <strong style={{ color: '#f06ad8' }}>Classement</strong> pour suivre la compétition en direct.
        </p>
      </div>

      {/* Inscription — uniquement quand les inscriptions sont ouvertes */}
      {tournament.status === 'registration' && (
        <RegistrationForm
          tournament={tournament}
          teams={teams}
          onRegistered={refetchDerived}
        />
      )}
    </div>
  )
}
