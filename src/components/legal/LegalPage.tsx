'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTheme } from '@/components/providers/ThemeProvider'
import { useLanguage } from '@/components/providers/LanguageProvider'
import { formatDate } from '@/lib/intl'
import { LEGAL_CONTACT_EMAIL, useLegalShell } from '@/locales/legal/shell'

/* Coquille partagée des pages légales (/confidentialite, /mentions-legales, /cgu,
   /cgv). Même gabarit que /about (largeur 800, retour, titre Cinzel).

   Les `page.tsx` restent des Server Components pour pouvoir exporter `metadata` ;
   ils ne rendent plus qu'un composant de CONTENU client
   (`src/components/legal/*Content.tsx`) qui lit le dictionnaire de la langue
   courante (`src/locales/legal/`). C'est ce découpage qui permet de traduire ces
   pages sans routage i18n par URL : la langue est un état client, partagé avec
   tout le reste du site (voir `LanguageProvider`).

   ⚠️ `metadata` (titre d'onglet, description) reste en FRANÇAIS : elle est rendue
   côté serveur, où la langue choisie par le visiteur n'est pas connue. Une
   version anglaise supposerait des URL localisées, que le site n'a pas. */

/* Destinations seules — les libellés vivent dans `legalShell.navLabels`, dans le
   MÊME ordre. */
const LEGAL_LINKS = ['/mentions-legales', '/confidentialite', '/cgu', '/cgv']

export function LegalPage({
  title, accent, updated, intro, current, children,
}: {
  /** Première partie du titre (police Cinzel). */
  title: string
  /** Second mot du titre, coloré par `.accent-text`. Optionnel. */
  accent?: string
  /**
   * Date de dernière mise à jour au format ISO `AAAA-MM-JJ`.
   *
   * ⚠️ Une DATE, plus une chaîne rédigée : elle est formatée dans la langue
   * affichée (« 11 septembre 2026 » / « 11 September 2026 »). C'est ce qui
   * garantit que les deux versions d'un même document ne peuvent pas annoncer
   * deux dates différentes — pour les CGV, cette date EST la version
   * enregistrée avec chaque preuve de consentement (`CGV_VERSION`).
   */
  updated: string
  /** Chapô affiché sous le titre. */
  intro: React.ReactNode
  /** Route de la page courante — retirée de la navigation croisée du bas. */
  current: string
  children: React.ReactNode
}) {
  const router = useRouter()
  const { theme } = useTheme()
  const { lang } = useLanguage()
  const shell = useLegalShell()
  const c = theme === 'mythic'

  // Construite à partir des composants, et non par `new Date('2026-09-11')` qui
  // serait minuit UTC : dans un fuseau à l'ouest de Greenwich, la date affichée
  // reculerait d'un jour — et ne correspondrait plus à `CGV_VERSION`.
  const [y, m, d] = updated.split('-').map(Number)
  const updatedLabel = formatDate(new Date(y, m - 1, d), lang, { dateStyle: 'long' })

  const linkColor = c ? 'var(--gold-pale)' : '#7F77DD'

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
      >{shell.back}</button>

      <h1
        className="font-mythic"
        style={{ fontSize: 'clamp(28px, 5vw, 44px)', fontWeight: 700, marginBottom: 10 }}
      >
        {title}{accent ? <> <span className="accent-text">{accent}</span></> : null}
      </h1>

      <p style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 28 }}>
        {shell.updatedPrefix} {updatedLabel}
      </p>

      {/* Avertissement de version de départ — le contenu n'a pas encore été relu
          par un juriste, autant l'assumer explicitement auprès des visiteurs. */}
      <div style={{
        padding: '12px 16px', borderRadius: 8, marginBottom: shell.translationNotice ? 12 : 32,
        background: 'rgba(127,119,221,0.06)',
        border: '1px solid rgba(127,119,221,0.28)',
        color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.6,
      }}>
        {shell.betaNotice}{' '}
        <a href={`mailto:${LEGAL_CONTACT_EMAIL}`} style={{ color: linkColor }}>
          {LEGAL_CONTACT_EMAIL}
        </a>.
      </div>

      {/* Bloc rendu dans la seule version anglaise (chaîne vide en français). */}
      {shell.translationNotice ? (
        <div style={{
          padding: '12px 16px', borderRadius: 8, marginBottom: 32,
          background: 'rgba(239,159,39,0.06)',
          border: '1px solid rgba(239,159,39,0.28)',
          color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.6,
        }}>
          {shell.translationNotice}
        </div>
      ) : null}

      <p style={{ fontSize: 15, color: 'var(--text-muted)', lineHeight: 1.75, marginBottom: 40 }}>
        {intro}
      </p>

      {children}

      {/* Navigation croisée entre les quatre documents légaux */}
      <nav style={{
        marginTop: 48, paddingTop: 24,
        borderTop: '1px solid var(--border)',
        display: 'flex', flexWrap: 'wrap', gap: 20,
      }}>
        {LEGAL_LINKS.map((href, i) => href === current ? null : (
          <Link key={href} href={href}
            style={{ color: 'var(--text-muted)', fontSize: 13, textDecoration: 'none' }}>
            {shell.navLabels[i]} →
          </Link>
        ))}
      </nav>

      <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-dim)', marginTop: 40 }}>
        {shell.footer}
      </p>
    </main>
  )
}
