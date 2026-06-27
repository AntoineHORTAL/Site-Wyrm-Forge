// Shell du module prac (prac.wyrm-forge.com) — outil interne de suivi de joueurs.
// Garde d'accès appliquée à TOUTES les routes /prac/* :
//   non connecté        → site principal (connexion)
//   connecté non-admin  → site principal (accès réservé)
//   admin prac          → shell + nav + contenu
// Détection via prac_admins (RLS pa_select_self : ne lit que sa propre ligne).

import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Prac — Suivi de joueurs · Wyrm Forge',
  robots: { index: false, follow: false },
}

function siteRoot(): string {
  const site = process.env.NEXT_PUBLIC_SITE_URL
  return site ? site.replace(/\/$/, '') + '/' : '/'
}

export default async function PracLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect(siteRoot())

  const { data: adminRow } = await supabase
    .from('prac_admins')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!adminRow) redirect(siteRoot())   // connecté mais pas admin prac

  return (
    <div style={{ minHeight: '100vh', background: '#100c1c', color: '#E9E6F2' }}>
      <header
        style={{
          display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
          padding: '16px clamp(16px, 4vw, 40px)',
          borderBottom: '1px solid rgba(186,117,23,0.25)',
          background: 'rgba(20,14,32,0.7)',
        }}
      >
        <Link href="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontFamily: 'Cinzel, serif', fontSize: 22, fontWeight: 700, color: '#EF9F27' }}>PRAC</span>
          <span style={{ fontSize: 12, color: '#9b93b5', letterSpacing: '.08em', textTransform: 'uppercase' }}>
            Suivi de joueurs
          </span>
        </Link>

        <nav style={{ display: 'flex', gap: 18, marginLeft: 'auto', alignItems: 'center', flexWrap: 'wrap' }}>
          <Link href="/" style={{ color: '#E9E6F2', fontSize: 14, textDecoration: 'none' }}>Accueil</Link>
          <span style={{ color: '#6c6585', fontSize: 14 }} title="Bientôt (chantier 4)">Joueurs suivis</span>
          <span style={{ color: '#6c6585', fontSize: 14 }} title="Bientôt (chantier 2)">Ajouter un joueur</span>
          <span style={{ fontSize: 12, color: '#9b93b5', paddingLeft: 12, borderLeft: '1px solid rgba(255,255,255,0.12)' }}>
            {user.email}
          </span>
        </nav>
      </header>

      <main style={{ maxWidth: 1100, margin: '0 auto', padding: 'clamp(24px, 4vw, 48px) clamp(16px, 4vw, 40px)' }}>
        {children}
      </main>
    </div>
  )
}
