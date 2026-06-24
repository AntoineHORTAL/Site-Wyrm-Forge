// Page tournoi individuel — /tournois/[serie]/[slug]  (public : /[serie]/[slug])
// Server Component — fetch Supabase SSR :
//   1. série par slug, puis tournoi par (series_id, slug) — RLS masque les drafts
//   2. en PARALLÈLE : équipes + matchs + standings
// Les 3 vues (présentation / bracket / classement) sont commutées via ?tab=
// dans TournamentLive (client) qui détient l'abonnement Realtime sur matches.

import type { Metadata } from 'next'
import { Suspense } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import TournamentPoster from '@/components/tournois/TournamentPoster'
import TournamentRules  from '@/components/tournois/TournamentRules'
import TournamentTabs, { type TournamentTab } from '@/components/tournois/TournamentTabs'
import TournamentLive   from '@/components/tournois/TournamentLive'
import TournamentAdminActions from '@/components/tournois/TournamentAdminActions'
import {
  parseRules,
  tournamentUrl,
  seriesPath,
  type Tournament,
  type TournamentSeries,
  type TournamentTeam,
  type TournamentMatch,
  type StandingRow,
} from '@/lib/tournois'
import { resolveThemeVars } from '@/lib/tournois/themes'

export const dynamic = 'force-dynamic'

function defaultTabForStatus(status: string): TournamentTab {
  if (status === 'live')     return 'bracket'
  if (status === 'finished') return 'classement'
  return 'presentation'
}

// Résout série + tournoi par leurs slugs respectifs. null si l'un manque (RLS incluse).
async function fetchTournament(
  serie: string,
  slug: string,
): Promise<{ tournament: Tournament; series: TournamentSeries } | null> {
  const supabase = await createClient()

  const { data: seriesData } = await supabase
    .from('tournament_series')
    .select('*')
    .eq('slug', serie)
    .maybeSingle()
  const series = seriesData as TournamentSeries | null
  if (!series) return null

  const { data: tData } = await supabase
    .from('tournaments')
    .select('*')
    .eq('series_id', series.id)
    .eq('slug', slug)
    .maybeSingle()
  const tournament = tData as Tournament | null
  if (!tournament) return null

  return { tournament, series }
}

// ─── Metadata ────────────────────────────────────────────────────────────────
export async function generateMetadata(
  { params }: { params: Promise<{ serie: string; slug: string }> }
): Promise<Metadata> {
  const { serie, slug } = await params
  const found = await fetchTournament(serie, slug)
  const name = found?.tournament.name ?? 'Tournoi'
  const canonical = tournamentUrl(serie, slug)
  return {
    title: `${name} — Wyrm Forge`,
    description: `Suivez le bracket, le classement et les règles du ${name}.`,
    alternates: { canonical },
    openGraph: {
      url: canonical,
      title: `${name} — Wyrm Forge`,
      description: `Tournoi communautaire organisé par Wyrm Forge.`,
    },
  }
}

// ─── Page ────────────────────────────────────────────────────────────────────
export default async function TournoisSlugPage({
  params,
  searchParams,
}: {
  params:       Promise<{ serie: string; slug: string }>
  searchParams: Promise<{ tab?: string }>
}) {
  const { serie, slug } = await params
  const { tab }         = await searchParams

  const found = await fetchTournament(serie, slug)
  if (!found) notFound()
  const { tournament: t, series } = found

  const supabase = await createClient()
  const [teamsRes, matchesRes, standingsRes] = await Promise.all([
    supabase.from('tournament_teams').select('*').eq('tournament_id', t.id).order('created_at', { ascending: true }),
    supabase.from('matches').select('*').eq('tournament_id', t.id),
    supabase.from('tournament_standings').select('*').eq('tournament_id', t.id).order('points', { ascending: false }),
  ])

  const teams     = (teamsRes.data     ?? []) as TournamentTeam[]
  const matches   = (matchesRes.data   ?? []) as TournamentMatch[]
  const standings = (standingsRes.data ?? []) as StandingRow[]

  // Garde admin (créateur OU admin tournoi) — pilote les actions orga
  const { data: { user } } = await supabase.auth.getUser()
  let canManage = false
  if (user) {
    if (t.created_by === user.id) canManage = true
    else {
      const { data: allowed } = await supabase.rpc('is_tournament_admin', { p_uid: user.id, p_tournament: t.id })
      canManage = allowed === true
    }
  }

  const rules     = parseRules(t.rules)
  const defTab    = defaultTabForStatus(t.status)
  const activeTab = (['presentation', 'bracket', 'classement'].includes(tab ?? '')
    ? tab as TournamentTab
    : defTab)

  return (
    <div
      style={{
        ...resolveThemeVars(series.theme_preset, series.theme_primary, series.theme_accent),
        maxWidth: 1200,
        margin: '0 auto',
        padding: 'clamp(24px, 4vw, 40px) clamp(16px, 3vw, 32px)',
        display: 'flex',
        flexDirection: 'column',
        gap: 32,
      }}
    >
      {/* Bouton retour → vitrine de la série */}
      <div>
        <Link href={seriesPath(serie)} className="xv2-data" style={{ color: '#8fa0bb', fontSize: 13, textDecoration: 'none' }}>
          ← {series.display_name}
        </Link>
      </div>

      {/* Actions organisateur (admin uniquement ; EF revérifie) */}
      {canManage && (
        <TournamentAdminActions serie={serie} slug={t.slug} tournamentId={t.id} status={t.status} />
      )}

      {/* Bandeau brouillon — visible uniquement par le créateur/admin (RLS) */}
      {t.status === 'draft' && (
        <div
          role="status"
          style={{
            padding: '12px 18px',
            background: 'rgba(239,159,39,0.1)',
            border: '1px solid rgba(239,159,39,0.4)',
            borderRadius: 6,
          }}
        >
          <p className="xv2-data" style={{ margin: 0, color: '#EF9F27', fontSize: 14 }}>
            Brouillon — ce tournoi n&apos;est visible que par toi. Ouvre les inscriptions
            depuis le panneau organisateur quand tu es prêt.
          </p>
        </div>
      )}

      {/* ── Poster annonce ── */}
      <TournamentPoster
        name={t.name}
        format={t.format}
        map={t.map}
        max_teams={t.max_teams}
        cashprize_label={t.cashprize_label ?? ''}
        cashprize_bonus={t.cashprize_bonus ?? undefined}
        starts_at={t.starts_at ?? t.created_at}
        caster_name={t.caster_name ?? undefined}
        twitch_url={t.twitch_url ?? undefined}
        series={series.display_name}
        hero_image_url={t.hero_image_url ?? undefined}
      />

      {/* ── Règles ── */}
      {rules.length > 0 && (
        <TournamentRules
          rules={rules}
          cashprize_label={t.cashprize_label ?? ''}
          cashprize_bonus={t.cashprize_bonus ?? undefined}
          format={t.format}
          map={t.map}
          caster_name={t.caster_name ?? undefined}
          twitch_url={t.twitch_url ?? undefined}
          series={series.display_name}
          hero_image_url={t.hero_image_url ?? undefined}
          starts_at={t.starts_at ?? t.created_at}
        />
      )}

      {/* ── Tabs Présentation / Bracket / Classement ── */}
      <section>
        <Suspense fallback={<div style={{ height: 48 }} />}>
          <TournamentTabs serie={serie} slug={slug} defaultTab={defTab} />
        </Suspense>

        <div style={{ marginTop: 24 }}>
          <TournamentLive
            tournament={t}
            serie={serie}
            initialTeams={teams}
            initialMatches={matches}
            initialStandings={standings}
            activeTab={activeTab}
          />
        </div>
      </section>
    </div>
  )
}
