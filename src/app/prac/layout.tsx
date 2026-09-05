// Shell du module prac (prac.wyrm-forge.com) — outil interne de suivi de joueurs.
// Garde d'accès appliquée à TOUTES les routes /prac/* :
//   non connecté        → site principal (connexion)
//   connecté non-admin  → site principal (accès réservé)
//   admin prac          → shell + nav + contenu
// Détection via prac_admins (RLS pa_select_self : ne lit que sa propre ligne).

import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import Link from 'next/link'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { isFlagEnabledServer } from '@/lib/feature-flags-server'
import { pracPath } from '@/lib/prac'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Prac — Suivi de joueurs · Wyrm Forge',
  robots: { index: false, follow: false },
}

function siteRoot(): string {
  const site = process.env.NEXT_PUBLIC_SITE_URL
  return site ? site.replace(/\/$/, '') + '/' : '/'
}

// Hostname prac normalisé — même logique que pracHostname() dans src/proxy.ts.
// null si NEXT_PUBLIC_PRAC_HOST absent (local/preview → aucun blocage par host).
function pracHostname(): string | null {
  const h = process.env.NEXT_PUBLIC_PRAC_HOST
  if (!h) return null
  try {
    return new URL(/^https?:\/\//.test(h) ? h : `https://${h}`).hostname
  } catch {
    return null
  }
}

export default async function PracLayout({ children }: { children: ReactNode }) {
  // Défense en profondeur — en PROD (NEXT_PUBLIC_PRAC_HOST défini), /prac n'est servi
  // QUE sur le sous-domaine prac. Tout accès via un autre host (apex wyrm-forge.com) est
  // bloqué, MÊME pour un admin prac authentifié. En LOCAL/preview (host absent), aucun
  // blocage → routing par chemin direct (convention documentée du repo).
  // Le proxy (CAS 4) bloque déjà l'apex en amont ; cette garde tient l'invariant si le
  // proxy est un jour contourné ou mal configuré. Même header `host` que le proxy lit.
  const pHost = pracHostname()
  if (pHost) {
    const hdrs = await headers()
    const host = (hdrs.get('host') ?? '').split(':')[0].toLowerCase()
    if (host !== pHost) redirect(siteRoot())
  }

  // Kill switch `prac_enabled` — placé AVANT les requêtes d'identité, et pas dans
  // le rendu. Deux raisons :
  //   1. couper l'outil doit couper aussi ce qu'il interroge (`auth.getUser`,
  //      `prac_admins`) — une coupure qui continue de sonder la base n'en est pas
  //      une ;
  //   2. `/prac/*` sert un outil INTERNE, `robots: noindex`. Contrairement aux
  //      pages publiques, il n'y a ici personne à ménager : le repli est le même
  //      redirect vers le site principal que pour un non-admin, et il ne révèle
  //      rien de plus que ce que voit déjà un visiteur sans droits.
  //
  // Lecture SERVEUR : ce layout redirige avant tout rendu, `FeatureFlagsProvider`
  // (client) arriverait trop tard.
  if (!await isFlagEnabledServer('prac_enabled')) redirect(siteRoot())

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect(siteRoot())

  const { data: adminRow } = await supabase
    .from('prac_admins')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!adminRow) redirect(siteRoot())   // connecté mais pas admin prac

  // URL ABSOLUE du site principal — le logo + le lien « Accueil » quittent le module prac
  // pour revenir au site Wyrm Forge. Un href="/" serait réécrit en /prac par le proxy
  // (CAS 3) sur le sous-domaine → resterait dans prac. La nav a déjà son propre accès à
  // l'accueil prac (page.tsx via le sous-domaine racine), donc « Accueil » = retour au site.
  const home = siteRoot()

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
        <Link href={home} style={{ textDecoration: 'none', display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontFamily: 'Cinzel, serif', fontSize: 22, fontWeight: 700, color: '#EF9F27' }}>PRAC</span>
          <span style={{ fontSize: 12, color: '#9b93b5', letterSpacing: '.08em', textTransform: 'uppercase' }}>
            Suivi de joueurs
          </span>
        </Link>

        <nav style={{ display: 'flex', gap: 18, marginLeft: 'auto', alignItems: 'center', flexWrap: 'wrap' }}>
          <Link href={home} style={{ color: '#E9E6F2', fontSize: 14, textDecoration: 'none' }}>Accueil</Link>
          <Link href={pracPath('/joueurs')} style={{ color: '#E9E6F2', fontSize: 14, textDecoration: 'none' }}>Players suivis</Link>
          <Link href={pracPath('/ajouter-joueur')} style={{ color: '#E9E6F2', fontSize: 14, textDecoration: 'none' }}>Ajouter un joueur</Link>
          <Link href={pracPath('/ajouter')} style={{ color: '#E9E6F2', fontSize: 14, textDecoration: 'none' }}>Tracker des matchs</Link>
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
