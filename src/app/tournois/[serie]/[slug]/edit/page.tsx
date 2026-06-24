// Édition d'un tournoi — /tournois/[serie]/[slug]/edit
// Server Component — garde : créateur OU admin tournoi. Réutilise le formulaire
// de création en mode édition (slug & série non modifiables ; EF update_tournament).

import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { tournamentPath, parseRules, type Tournament, type TournamentCategory } from '@/lib/tournois'
import { Xv2Logo } from '@/components/tournois/Xv2Deco'
import CreateTournamentForm, { type EditTarget } from '@/components/tournois/CreateTournamentForm'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Modifier le tournoi — Wyrm Forge',
  robots: { index: false },
}

export default async function EditTournamentPage({
  params,
}: {
  params: Promise<{ serie: string; slug: string }>
}) {
  const { serie, slug } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(tournamentPath(serie, slug))

  const { data: seriesRow } = await supabase
    .from('tournament_series').select('id').eq('slug', serie).maybeSingle()
  if (!seriesRow) notFound()

  const { data: tData } = await supabase
    .from('tournaments').select('*')
    .eq('series_id', (seriesRow as { id: string }).id)
    .eq('slug', slug)
    .maybeSingle()
  const t = tData as Tournament | null
  if (!t) notFound()

  // Garde : créateur OU admin tournoi
  let canManage = t.created_by === user.id
  if (!canManage) {
    const { data: allowed } = await supabase.rpc('is_tournament_admin', { p_uid: user.id, p_tournament: t.id })
    canManage = allowed === true
  }
  if (!canManage) redirect(tournamentPath(serie, slug))

  const editing: EditTarget = {
    id: t.id, serie, slug: t.slug,
    name: t.name, format: t.format, map: t.map, max_teams: t.max_teams,
    starts_at: t.starts_at,
    category: (t.category ?? 'amis') as TournamentCategory,
    cashprize_label: t.cashprize_label,
    cashprize_bonus: t.cashprize_bonus,
    caster_name: t.caster_name,
    twitch_url: t.twitch_url,
    hero_image_url: t.hero_image_url,
    rules: parseRules(t.rules),
  }

  return (
    <div style={{ maxWidth: 820, margin: '0 auto', padding: 'clamp(28px, 5vw, 52px) clamp(16px, 3vw, 32px)' }}>
      <div style={{ marginBottom: 20 }}>
        <Link href={tournamentPath(serie, slug, '/admin')} className="xv2-btn-outline" style={{ display: 'inline-flex' }}>
          ← Retour
        </Link>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 28 }}>
        <Xv2Logo size={44} />
        <div>
          <h1 className="xv2-display" style={{ fontSize: 'clamp(24px, 4vw, 38px)', color: '#fff', margin: 0 }}>
            MODIFIER LE TOURNOI
          </h1>
          <p className="xv2-data" style={{ margin: '4px 0 0', color: '#8fa0bb', fontSize: 13 }}>
            {t.name} — le slug et la série ne sont pas modifiables.
          </p>
        </div>
      </div>

      <CreateTournamentForm series={[]} editing={editing} />
    </div>
  )
}
