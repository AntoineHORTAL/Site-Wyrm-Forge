// Vitrine d'une série — /tournois/[serie]  (public : /[serie])
// Server Component. Si le segment ne correspond à aucune série :
//   - 'creer' (legacy) → 308 vers /manage/creer
//   - sinon, compat liens 1-niveau : si UN seul tournoi porte ce slug → 308 vers
//     /[serie]/[slug] ; sinon notFound().

import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, permanentRedirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Xv2Logo, Xv2Cross } from '@/components/tournois/Xv2Deco'
import TournamentCard from '@/components/tournois/TournamentCard'
import {
  ecosystemsPath, seriesPath, managePath, tournamentPath, seriesUrl,
  type TournamentSeries, type Tournament, type StandingRow,
} from '@/lib/tournois'
import { resolveThemeVars } from '@/lib/tournois/themes'

export const dynamic = 'force-dynamic'

async function fetchSeries(slug: string): Promise<TournamentSeries | null> {
  const supabase = await createClient()
  const { data } = await supabase.from('tournament_series').select('*').eq('slug', slug).maybeSingle()
  return (data as TournamentSeries | null) ?? null
}

export async function generateMetadata(
  { params }: { params: Promise<{ serie: string }> },
): Promise<Metadata> {
  const { serie } = await params
  const s = await fetchSeries(serie)
  const name = s?.display_name ?? 'Tournois'
  return {
    title: `${name} — Wyrm Forge`,
    description: s?.description ?? `Tournois de la série ${name}.`,
    alternates: { canonical: seriesUrl(serie) },
  }
}

export default async function SeriesPage({
  params, searchParams,
}: {
  params:       Promise<{ serie: string }>
  searchParams: Promise<{ statut?: string }>
}) {
  const { serie } = await params
  const { statut } = await searchParams
  const supabase = await createClient()

  const s = await fetchSeries(serie)

  // ── Pas de série : redirection legacy / compat 1-niveau ────────────────────
  if (!s) {
    if (serie === 'creer') permanentRedirect(managePath('/creer'))
    // Compat : ancien lien /[slug] → si UN seul tournoi non-draft porte ce slug, 308.
    const { data: matches } = await supabase
      .from('tournaments')
      .select('slug, series_id')
      .eq('slug', serie)
      .neq('status', 'draft')
    const rows = (matches ?? []) as { slug: string; series_id: string }[]
    if (rows.length === 1) {
      const { data: sRow } = await supabase
        .from('tournament_series').select('slug').eq('id', rows[0].series_id).maybeSingle()
      const sSlug = (sRow as { slug: string } | null)?.slug
      if (sSlug) permanentRedirect(tournamentPath(sSlug, rows[0].slug))
    }
    notFound()
  }

  // ── Vitrine ────────────────────────────────────────────────────────────────
  // RLS : les drafts ne sont inclus que pour le créateur / admin tournoi.
  const { data: tData } = await supabase
    .from('tournaments')
    .select('*')
    .eq('series_id', s.id)
    .order('starts_at', { ascending: false, nullsFirst: false })
  const all = (tData ?? []) as Tournament[]

  // Garde admin de série (création + filtre Brouillons)
  const { data: { user } } = await supabase.auth.getUser()
  let canManageSeries = false
  if (user) {
    const { data: allowed } = await supabase.rpc('is_series_admin', { p_uid: user.id, p_series_id: s.id })
    canManageSeries = allowed === true
  }

  // Filtre par statut (?statut=). 'brouillons' réservé aux admins.
  const STATUS_BY_FILTER: Record<string, Tournament['status']> = {
    avenir: 'registration', encours: 'live', termines: 'finished', brouillons: 'draft',
  }
  const activeStatut = statut && STATUS_BY_FILTER[statut] ? statut : null
  const tournaments = activeStatut
    ? all.filter((t) => t.status === STATUS_BY_FILTER[activeStatut])
    : all.filter((t) => t.status !== 'draft')   // "Tous" = hors brouillons

  const ongoing  = all.find((t) => t.status === 'live' || t.status === 'registration')
  const finished = all.filter((t) => t.status === 'finished')

  // Palmarès : champion (tête du classement) des éditions terminées
  let palmares: { tournament: string; serieSlug: string; tSlug: string; champion: string | null }[] = []
  if (finished.length > 0) {
    const { data: stData } = await supabase
      .from('tournament_standings')
      .select('tournament_id, team_name, points, wins, losses')
      .in('tournament_id', finished.map((t) => t.id))
    const rows = (stData ?? []) as (StandingRow & { tournament_id: string })[]
    const best = new Map<string, { team: string; points: number }>()
    for (const r of rows) {
      const cur = best.get(r.tournament_id)
      if (!cur || r.points > cur.points) best.set(r.tournament_id, { team: r.team_name, points: r.points })
    }
    palmares = finished.map((t) => ({
      tournament: t.name, serieSlug: s.slug, tSlug: t.slug,
      champion: best.get(t.id)?.team ?? null,
    }))
  }

  return (
    <div style={{
      ...resolveThemeVars(s.theme_preset, s.theme_primary, s.theme_accent),
      maxWidth: 1200, margin: '0 auto', padding: 'clamp(24px, 4vw, 48px) clamp(16px, 3vw, 32px)',
      display: 'flex', flexDirection: 'column', gap: 36,
    }}>

      {/* Bouton retour → listing des écosystèmes + bouton créer (admin série) */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <Link href={ecosystemsPath()} className="xv2-data" style={{ fontSize: 13, color: '#8fc6f5', textDecoration: 'none' }}>
          ← Tous les écosystèmes
        </Link>
        {canManageSeries && (
          <Link href={managePath(`/creer?serie=${s.slug}`)} className="xv2-btn-outline" style={{ display: 'inline-flex' }}>
            + Créer un tournoi
          </Link>
        )}
      </div>

      {/* Hero série */}
      <section style={{
        position: 'relative', overflow: 'hidden', borderRadius: 8, padding: '40px 36px',
        background: 'linear-gradient(160deg, rgba(28,58,110,0.6) 0%, rgba(20,9,28,0.95) 60%)',
        border: '1px solid rgba(47,111,222,0.3)',
      }}>
        {s.hero_image_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={s.hero_image_url} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.2 }} />
        )}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
          {s.logo_url
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={s.logo_url} alt="" style={{ width: 56, height: 56, objectFit: 'contain' }} />
            : <Xv2Logo size={48} />}
          <div>
            <h1 className="xv2-display" style={{ fontSize: 'clamp(28px, 5vw, 48px)', color: '#fff', margin: 0 }}>
              {s.display_name}
            </h1>
            {s.description && (
              <p className="xv2-data" style={{ margin: '6px 0 0', color: '#8fa0bb', fontSize: 15 }}>{s.description}</p>
            )}
          </div>
        </div>

        {/* Édition en cours mise en avant */}
        {ongoing && (
          <Link href={tournamentPath(s.slug, ongoing.slug)} className="xv2-btn-primary" style={{ marginTop: 24 }}>
            {ongoing.status === 'live' ? 'Suivre l\'édition en cours' : 'Inscriptions ouvertes — rejoindre'} →
          </Link>
        )}
      </section>

      {/* Filtres par statut — Brouillons réservé aux admins de la série */}
      <nav style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }} aria-label="Filtrer par statut">
        {([
          ['', 'Tous'], ['avenir', 'À venir'], ['encours', 'En cours'], ['termines', 'Terminés'],
          ...(canManageSeries ? [['brouillons', 'Brouillons']] : []),
        ] as [string, string][]).map(([id, label]) => {
          const active = (activeStatut ?? '') === id
          return (
            <Link key={id || 'tous'} href={id ? seriesPath(s.slug, `?statut=${id}`) : seriesPath(s.slug)} className="xv2-data" style={{
              padding: '7px 16px', borderRadius: 3, textDecoration: 'none', fontSize: 13,
              color: active ? '#fff' : '#8fa0bb',
              background: active ? 'linear-gradient(135deg, #1c3a6e 0%, #2f6fde 100%)' : 'rgba(20,9,28,0.6)',
              border: '1px solid rgba(47,111,222,0.25)', textTransform: 'uppercase', letterSpacing: '.06em',
            }}>{label}</Link>
          )
        })}
      </nav>

      {/* Liste des tournois */}
      {tournaments.length === 0 ? (
        <p className="xv2-data" style={{ color: '#8fa0bb', fontSize: 15 }}>Aucun tournoi pour ce filtre.</p>
      ) : (
        <div className="xv2-card-grid">
          {tournaments.map((t) => (
            <TournamentCard
              key={t.id}
              serie={s.slug}
              tournament={{
                slug: t.slug, name: t.name, format: t.format, map: t.map, status: t.status,
                starts_at: t.starts_at, cashprize_label: t.cashprize_label, max_teams: t.max_teams,
              }}
            />
          ))}
        </div>
      )}

      {/* Palmarès */}
      {palmares.length > 0 && (
        <section>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <Xv2Cross size={14} color="#f06ad8" />
            <h2 className="xv2-display" style={{ fontSize: 22, color: '#fff', margin: 0 }}>PALMARÈS</h2>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {palmares.map((p) => (
              <Link key={p.tSlug} href={tournamentPath(p.serieSlug, p.tSlug, '?tab=classement')} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                padding: '12px 16px', borderRadius: 6, textDecoration: 'none',
                background: 'rgba(28,58,110,0.2)', border: '1px solid rgba(47,111,222,0.2)',
              }}>
                <span className="xv2-data" style={{ color: '#fff', fontSize: 14 }}>{p.tournament}</span>
                <span className="xv2-display" style={{ color: '#f06ad8', fontSize: 14 }}>
                  {p.champion ? `🏆 ${p.champion}` : '—'}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
