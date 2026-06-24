// Back-office transverse — /tournois/manage  (public : /manage)
// Garde : non connecté → connexion (site principal) ; connecté non-admin → listing ;
// admin → liste des tournois gérables SELON LE SCOPE (global = tout ; series:x = la
// série ; tournoi précis = ce tournoi). Distinct du panneau orga d'UN tournoi
// (/[serie]/[slug]/admin).

import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import {
  ecosystemsPath, tournamentPath,
  TOURNAMENT_STATUS_LABELS, TOURNAMENT_STATUS_COLORS,
  type Tournament, type TournamentSeries,
} from '@/lib/tournois'
import { Xv2Logo } from '@/components/tournois/Xv2Deco'
import AdminRightsPanel from '@/components/tournois/AdminRightsPanel'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Gestion des tournois — Wyrm Forge',
  robots: { index: false },
}

export default async function ManagePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Non connecté → page de connexion du site principal (retour manuel ensuite)
  if (!user) {
    const site = process.env.NEXT_PUBLIC_SITE_URL
    redirect(site ? site.replace(/\/$/, '') + '/' : ecosystemsPath())
  }

  // Droits de l'utilisateur (RLS ta_select_self : ne lit que ses propres lignes)
  const [{ data: adminRows }, { data: seriesData }] = await Promise.all([
    supabase.from('tournament_admins').select('scope').eq('user_id', user.id),
    supabase.from('tournament_series').select('*').order('sort_order', { ascending: true }),
  ])
  const scopes = (adminRows ?? []).map((r) => (r as { scope: string }).scope)
  if (scopes.length === 0) {
    redirect(ecosystemsPath())   // connecté mais aucun droit
  }

  const series = (seriesData ?? []) as TournamentSeries[]
  const seriesById = new Map(series.map((s) => [s.id, s]))
  const slugById   = new Map(series.map((s) => [s.id, s.slug]))

  const isGlobal       = scopes.includes('global')
  const adminSeriesSlugs = scopes.filter((s) => s.startsWith('series:')).map((s) => s.slice('series:'.length))
  const adminTournamentIds = scopes.filter((s) => /^[0-9a-f-]{36}$/i.test(s))

  // Tournois gérables (drafts inclus via RLS draft policy is_tournament_admin)
  let query = supabase.from('tournaments').select('*').order('created_at', { ascending: false })
  if (!isGlobal) {
    const seriesIds = series.filter((s) => adminSeriesSlugs.includes(s.slug)).map((s) => s.id)
    const ors: string[] = []
    if (seriesIds.length) ors.push(`series_id.in.(${seriesIds.join(',')})`)
    if (adminTournamentIds.length) ors.push(`id.in.(${adminTournamentIds.join(',')})`)
    ors.push(`created_by.eq.${user.id}`)
    query = query.or(ors.join(','))
  }
  const { data: tData } = await query
  const tournaments = (tData ?? []) as Tournament[]

  const btn: React.CSSProperties = {
    background: 'rgba(28,58,110,0.6)', border: '1px solid rgba(47,111,222,0.4)', borderRadius: 4,
    color: '#8fc6f5', fontFamily: 'Rajdhani, sans-serif', fontWeight: 600, fontSize: 13,
    padding: '6px 12px', textDecoration: 'none', textTransform: 'uppercase', letterSpacing: '.05em',
  }

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: 'clamp(28px, 5vw, 52px) clamp(16px, 3vw, 32px)' }}>
      <div style={{ marginBottom: 18 }}>
        <Link href={ecosystemsPath()} className="xv2-data" style={{ fontSize: 13, color: '#8fc6f5', textDecoration: 'none' }}>
          ← Tous les écosystèmes
        </Link>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 28, flexWrap: 'wrap' }}>
        <Xv2Logo size={44} />
        <div style={{ flex: 1, minWidth: 200 }}>
          <h1 className="xv2-display" style={{ fontSize: 'clamp(24px, 4vw, 38px)', color: '#fff', margin: 0 }}>
            GESTION DES TOURNOIS
          </h1>
          <p className="xv2-data" style={{ margin: '4px 0 0', color: '#8fa0bb', fontSize: 13 }}>
            {isGlobal ? 'Administrateur global' : `Portée : ${adminSeriesSlugs.map((s) => `série ${s}`).join(', ') || 'tournois assignés'}`}
          </p>
        </div>
      </div>

      {tournaments.length === 0 ? (
        <p className="xv2-data" style={{ color: '#8fa0bb', fontSize: 15 }}>
          Aucun tournoi à gérer pour l&apos;instant. Crée-en un depuis la vitrine de la série.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {tournaments.map((t) => {
            const serieSlug = slugById.get(t.series_id) ?? ''
            const serieName = seriesById.get(t.series_id)?.display_name ?? serieSlug
            return (
              <div key={t.id} style={{
                display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
                padding: '12px 16px', borderRadius: 6,
                background: 'rgba(28,58,110,0.2)', border: '1px solid rgba(47,111,222,0.2)',
              }}>
                <div style={{ flex: 1, minWidth: 180 }}>
                  <span className="xv2-display" style={{ color: '#fff', fontSize: 15 }}>{t.name}</span>
                  <span className="xv2-data" style={{ color: '#6e85a0', fontSize: 12, marginLeft: 8 }}>{serieName}</span>
                </div>
                <span className="xv2-data" style={{
                  fontSize: 12, textTransform: 'uppercase', letterSpacing: '.06em',
                  color: TOURNAMENT_STATUS_COLORS[t.status],
                }}>
                  {TOURNAMENT_STATUS_LABELS[t.status]}
                </span>
                <Link href={tournamentPath(serieSlug, t.slug, '/admin')} style={btn}>Gérer</Link>
                <Link href={tournamentPath(serieSlug, t.slug)} style={{ ...btn, color: '#8fa0bb' }}>Voir</Link>
              </div>
            )
          })}
        </div>
      )}

      {isGlobal && <AdminRightsPanel series={series} />}
    </div>
  )
}
