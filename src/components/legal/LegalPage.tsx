'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTheme } from '@/components/providers/ThemeProvider'

/* Coquille partagée des pages légales (/confidentialite, /mentions-legales, /cgu,
   /cgv). Même gabarit que /about (largeur 800, retour, titre Cinzel) — les pages
   elles-mêmes restent des Server Components pour pouvoir exporter `metadata`,
   seul ce shell est client (useRouter / useTheme). */

const LEGAL_LINKS = [
  { href: '/mentions-legales', label: 'Mentions légales' },
  { href: '/confidentialite',  label: 'Confidentialité' },
  { href: '/cgu',              label: 'CGU' },
  { href: '/cgv',              label: 'CGV' },
]

/** Titre de section + contenu. Utilisé par les trois pages légales. */
export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 36 }}>
      <h2 style={{
        fontSize: 18, fontWeight: 700, marginBottom: 12,
        color: 'var(--gold-pale)',
      }}>
        {title}
      </h2>
      <div style={{ fontSize: 15, color: 'var(--text-muted)', lineHeight: 1.75 }}>
        {children}
      </div>
    </section>
  )
}

/** Liste à puces au style commun des pages légales. */
export function List({ children }: { children: React.ReactNode }) {
  return (
    <ul style={{ margin: '8px 0 0', paddingLeft: 20, display: 'grid', gap: 6 }}>
      {children}
    </ul>
  )
}

/** Encart « information manquante » — rend visible ce que HORTAL doit fournir.
 *  Marqueur unique et greppable : `grep -rn "À COMPLÉTER PAR HORTAL" src` liste
 *  tout ce qui reste à renseigner, badges rendus ET commentaires de source. */
export function Todo({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      display: 'inline-block', padding: '1px 7px', borderRadius: 4,
      background: 'rgba(239,159,39,0.12)', border: '1px dashed rgba(239,159,39,0.45)',
      color: '#EF9F27', fontSize: 13, fontWeight: 600,
    }}>
      [À COMPLÉTER PAR HORTAL — {children}]
    </span>
  )
}

export function LegalPage({
  title, accent, updated, intro, current, children,
}: {
  /** Première partie du titre (police Cinzel). */
  title: string
  /** Second mot du titre, coloré par `.accent-text`. Optionnel. */
  accent?: string
  /** Date de dernière mise à jour, en toutes lettres. */
  updated: string
  /** Chapô affiché sous le titre. */
  intro: React.ReactNode
  /** Route de la page courante — retirée de la navigation croisée du bas. */
  current: string
  children: React.ReactNode
}) {
  const router = useRouter()
  const { theme } = useTheme()
  const c = theme === 'mythic'

  return (
    <main style={{
      minHeight: '100vh',
      padding: 'clamp(24px, 5vw, 64px) clamp(24px, 5vw, 64px)',
      maxWidth: 800,
      margin: '0 auto',
      color: 'var(--text)',
    }}>
      <button
        onClick={() => router.back()}
        style={{
          background: 'transparent', border: 'none', cursor: 'pointer',
          color: 'var(--text-muted)', fontSize: 13, padding: '6px 0', marginBottom: 24,
        }}
      >← Retour</button>

      <h1
        className="font-mythic"
        style={{ fontSize: 'clamp(28px, 5vw, 44px)', fontWeight: 700, marginBottom: 10 }}
      >
        {title}{accent ? <> <span className="accent-text">{accent}</span></> : null}
      </h1>

      <p style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 28 }}>
        Dernière mise à jour : {updated}
      </p>

      {/* Avertissement de version de départ — le contenu n'a pas encore été relu
          par un juriste, autant l'assumer explicitement auprès des visiteurs. */}
      <div style={{
        padding: '12px 16px', borderRadius: 8, marginBottom: 32,
        background: 'rgba(127,119,221,0.06)',
        border: '1px solid rgba(127,119,221,0.28)',
        color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.6,
      }}>
        Wyrm Forge est en bêta. Ce document est appelé à être complété et précisé ; les
        informations encore manquantes y sont signalées en toutes lettres.
        Pour toute question : <a href="mailto:contact@wyrm-forge.com"
          style={{ color: c ? 'var(--gold-pale)' : '#7F77DD' }}>contact@wyrm-forge.com</a>.
      </div>

      <p style={{ fontSize: 15, color: 'var(--text-muted)', lineHeight: 1.75, marginBottom: 40 }}>
        {intro}
      </p>

      {children}

      {/* Navigation croisée entre les trois documents légaux */}
      <nav style={{
        marginTop: 48, paddingTop: 24,
        borderTop: '1px solid var(--border)',
        display: 'flex', flexWrap: 'wrap', gap: 20,
      }}>
        {LEGAL_LINKS.filter(l => l.href !== current).map(l => (
          <Link key={l.href} href={l.href}
            style={{ color: 'var(--text-muted)', fontSize: 13, textDecoration: 'none' }}>
            {l.label} →
          </Link>
        ))}
      </nav>

      <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-dim)', marginTop: 40 }}>
        © 2026 Wyrm Forge. Non affilié à Riot Games.
      </p>
    </main>
  )
}
