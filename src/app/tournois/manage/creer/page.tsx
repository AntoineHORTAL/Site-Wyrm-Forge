// Page création de tournoi — /tournois/manage/creer  (public : /manage/creer)
// Server Component — garde : session requise ET is_tournament_admin(global/série).
// Sinon redirect. La création passe par l'EF tournament-admin (action create_tournament),
// qui REVÉRIFIE le droit par série (jamais confiance au front).

import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ecosystemsPath, managePath, type TournamentSeries } from '@/lib/tournois'
import { Xv2Logo } from '@/components/tournois/Xv2Deco'
import CreateTournamentForm from '@/components/tournois/CreateTournamentForm'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Créer un tournoi — Wyrm Forge',
  robots: { index: false },
}

export default async function CreateTournamentPage({
  searchParams,
}: {
  searchParams: Promise<{ serie?: string }>
}) {
  const { serie } = await searchParams
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(ecosystemsPath())

  const [{ data: allowed }, seriesRes] = await Promise.all([
    supabase.rpc('is_tournament_admin', { p_uid: user.id, p_tournament: null }),
    supabase.from('tournament_series').select('*').order('sort_order', { ascending: true }),
  ])
  if (allowed !== true) redirect(ecosystemsPath())

  const series   = (seriesRes.data ?? []) as TournamentSeries[]
  const preselectSerieId = serie ? series.find((s) => s.slug === serie)?.id : undefined

  return (
    <div
      style={{
        maxWidth: 820,
        margin: '0 auto',
        padding: 'clamp(28px, 5vw, 52px) clamp(16px, 3vw, 32px)',
      }}
    >
      {/* Bouton retour vers le back-office */}
      <div style={{ marginBottom: 20 }}>
        <Link href={managePath()} className="xv2-btn-outline" style={{ display: 'inline-flex' }}>
          ← Retour
        </Link>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 28 }}>
        <Xv2Logo size={44} />
        <div>
          <h1 className="xv2-display" style={{ fontSize: 'clamp(24px, 4vw, 38px)', color: '#fff', margin: 0 }}>
            CRÉER UN TOURNOI
          </h1>
          <p className="xv2-data" style={{ margin: '4px 0 0', color: '#8fa0bb', fontSize: 13 }}>
            Le tournoi est créé en brouillon — tu ouvriras les inscriptions depuis le panneau organisateur.
          </p>
        </div>
      </div>

      <CreateTournamentForm series={series} preselectSerieId={preselectSerieId} />
    </div>
  )
}
