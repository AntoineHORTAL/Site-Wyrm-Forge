// Création d'une SÉRIE — /tournois/manage/serie/creer  (public : /manage/serie/creer)
// Server Component — garde : session + admin GLOBAL uniquement. Re-vérifié dans
// l'EF (action create_series). Non connecté → site (login) ; connecté non-global → listing.

import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ecosystemsPath } from '@/lib/tournois'
import { Xv2Logo } from '@/components/tournois/Xv2Deco'
import CreateSeriesForm from '@/components/tournois/CreateSeriesForm'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Créer une série — Wyrm Forge',
  robots: { index: false },
}

export default async function CreateSeriesPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    const site = process.env.NEXT_PUBLIC_SITE_URL
    redirect(site ? site.replace(/\/$/, '') + '/' : ecosystemsPath())
  }

  // Admin GLOBAL uniquement
  const { data: globalRow } = await supabase
    .from('tournament_admins').select('id').eq('user_id', user.id).eq('scope', 'global').maybeSingle()
  if (!globalRow) redirect(ecosystemsPath())

  return (
    <div style={{ maxWidth: 820, margin: '0 auto', padding: 'clamp(28px, 5vw, 52px) clamp(16px, 3vw, 32px)' }}>
      <div style={{ marginBottom: 20 }}>
        <Link href={ecosystemsPath()} className="xv2-btn-outline" style={{ display: 'inline-flex' }}>
          ← Retour
        </Link>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 28 }}>
        <Xv2Logo size={44} />
        <div>
          <h1 className="xv2-display" style={{ fontSize: 'clamp(24px, 4vw, 38px)', color: '#fff', margin: 0 }}>
            CRÉER UNE SÉRIE
          </h1>
          <p className="xv2-data" style={{ margin: '4px 0 0', color: '#8fa0bb', fontSize: 13 }}>
            Un écosystème de tournois. Tu créeras ensuite les tournois depuis sa vitrine.
          </p>
        </div>
      </div>

      <CreateSeriesForm />
    </div>
  )
}
