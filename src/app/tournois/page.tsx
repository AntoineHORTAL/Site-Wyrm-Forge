// Listing des écosystèmes (séries) — /tournois  (public : /)
// Server Component — grille de cartes série (RLS : séries publiques uniquement).
// Bouton "Gestion" → /manage, visible seulement si l'utilisateur a un droit admin tournoi.

import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Xv2Logo, Xv2Cross } from '@/components/tournois/Xv2Deco'
import { managePath, type TournamentSeries } from '@/lib/tournois'
import { resolveThemeVars } from '@/lib/tournois/themes'
import EcosystemsGrid, { type EcosystemItem } from '@/components/tournois/EcosystemsGrid'

export const dynamic = 'force-dynamic'

export default async function TournoisHomePage() {
  const supabase = await createClient()

  const [seriesRes, tournamentsRes, { data: { user } }] = await Promise.all([
    supabase.from('tournament_series').select('*').order('sort_order', { ascending: true }),
    supabase.from('tournaments').select('series_id, status').neq('status', 'draft'),
    supabase.auth.getUser(),
  ])

  const series = (seriesRes.data ?? []) as TournamentSeries[]
  const tournaments = (tournamentsRes.data ?? []) as { series_id: string; status: string }[]

  // Agrégats par série (table petite → comptage en mémoire)
  const counts = new Map<string, { total: number; finished: number }>()
  for (const t of tournaments) {
    const c = counts.get(t.series_id) ?? { total: 0, finished: 0 }
    c.total += 1
    if (t.status === 'finished') c.finished += 1
    counts.set(t.series_id, c)
  }

  // Bouton Gestion : l'utilisateur a-t-il au moins un droit admin tournoi ?
  let canManage = false
  let isGlobal  = false
  if (user) {
    const { data } = await supabase
      .from('tournament_admins').select('scope').eq('user_id', user.id)
    canManage = !!(data && data.length > 0)
    isGlobal  = !!(data && data.some((r) => (r as { scope: string }).scope === 'global'))
  }

  // Items pour la grille (compteurs + couleur de thème dominante)
  const items: EcosystemItem[] = series.map((s) => {
    const c = counts.get(s.id) ?? { total: 0, finished: 0 }
    return {
      slug: s.slug, display_name: s.display_name, description: s.description,
      logo_url: s.logo_url, hero_image_url: s.hero_image_url,
      total: c.total, finished: c.finished,
      color: resolveThemeVars(s.theme_preset, s.theme_primary, s.theme_accent)['--xv2-pink'],
    }
  })

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: 'clamp(24px, 4vw, 48px) clamp(16px, 3vw, 32px)' }}>

      {/* ── Hero ── */}
      <section
        style={{
          marginBottom: 48, padding: '40px 36px', borderRadius: 8,
          background: 'linear-gradient(160deg, rgba(28,58,110,0.6) 0%, rgba(20,9,28,0.95) 60%)',
          border: '1px solid rgba(47,111,222,0.3)', position: 'relative', overflow: 'hidden',
        }}
      >
        <div style={{ position: 'absolute', top: 16, right: 20, opacity: 0.4 }}>
          <Xv2Cross size={28} color="#f06ad8" />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
          <Xv2Logo size={44} />
          <div style={{ flex: 1, minWidth: 200 }}>
            <h1 className="xv2-display" style={{ fontSize: 'clamp(28px, 5vw, 52px)', color: '#fff', margin: 0, lineHeight: 1 }}>
              ÉCOSYSTÈMES
            </h1>
            <p className="xv2-data" style={{ margin: '6px 0 0', color: '#8fa0bb', fontSize: 15 }}>
              Les séries de tournois communautaires organisées par Wyrm Forge.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10, alignSelf: 'center', flexWrap: 'wrap' }}>
            {isGlobal && (
              <Link href={managePath('/serie/creer')} className="xv2-btn-primary" style={{ border: 'none' }}>
                + Nouvelle série
              </Link>
            )}
            {canManage && (
              <Link href={managePath()} className="xv2-btn-outline">
                Gestion
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* ── Recherche + grille de séries (client) ── */}
      <EcosystemsGrid items={items} />
    </div>
  )
}
