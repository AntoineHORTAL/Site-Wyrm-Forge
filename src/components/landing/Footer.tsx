'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useTheme } from '@/components/providers/ThemeProvider'
import { useLanguage } from '@/components/providers/LanguageProvider'
import { WINDOWS_DOWNLOAD_URL } from '@/lib/download'

/* Destinations seules — les libellés vivent dans src/locales/landing.ts
   (`footer.legalLinks` et `footer.columns`, même ordre). */

/* Liens légaux de la barre basse — routes réelles (src/app/{cgu,confidentialite,
   mentions-legales}/page.tsx), contrairement aux colonnes ci-dessous encore en '#'. */
const legalHrefs = ['/cgu', '/confidentialite', '/mentions-legales']

/* Colonnes de liens du footer (les liens légaux vivent dans `legalHrefs` ci-dessus).
   - Routes inexistantes pour l'instant → '#' (placeholder, à brancher plus tard)
   - Liens fonctionnels : ancres de la home (#features, #communaute) + téléchargement
   - Réseaux sociaux : '#' tant que les URLs ne sont pas fournies */
const columnHrefs: { href: string; download?: boolean }[][] = [
  [
    { href: '/#features' },
    { href: WINDOWS_DOWNLOAD_URL, download: true },
    { href: '/#communaute' },
    { href: '#' },
  ],
  [{ href: '#' }, { href: '#' }, { href: '#' }, { href: '#' }],
  [{ href: '#' }, { href: '#' }, { href: '#' }, { href: '#' }],
]

function FooterLink({ label, href, download, c }: { label: string; href: string; download?: boolean; c: boolean }) {
  return (
    <a
      href={href}
      {...(download ? { download: true } : {})}
      className="land-footer-link"
      style={{
        display: 'block',
        color: c ? '#888780' : '#71717A',
        textDecoration: 'none',
        fontSize: 14,
        lineHeight: 2,
      }}
    >
      {label}
    </a>
  )
}

export default function Footer() {
  const { theme } = useTheme()
  const c = theme === 'mythic'
  const { t } = useLanguage()
  const f = t.footer

  return (
    <footer
      style={{
        background: c ? '#050309' : '#09090B',
        padding: '56px 32px 32px',
        borderTop: c ? '1px solid rgba(186,117,23,0.2)' : '1px solid #1F1F23',
      }}
    >
      {/* ── Grille principale : marque + 3 colonnes de liens ── */}
      <div className="land-footer-grid">
        {/* Colonne marque */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <Image src="/wyrm-logo.ico" alt="Wyrm Forge" width={34} height={34}
              style={{ borderRadius: 8, objectFit: 'cover' }} />
            <span className="font-mythic" style={{ fontSize: 18 }}>
              Wyrm <span className="accent-text">Forge</span>
            </span>
          </div>
          <p style={{ color: c ? '#888780' : '#71717A', fontSize: 14, lineHeight: 1.6, maxWidth: 260, margin: 0 }}>
            {f.tagline}
          </p>
        </div>

        {/* Colonnes de liens */}
        {f.columns.map((col, ci) => (
          <div key={col.title}>
            <h3 style={{
              fontSize: 12, letterSpacing: '0.12em', textTransform: 'uppercase',
              color: c ? '#BA7517' : '#A1A1AA', fontWeight: 600, margin: '0 0 12px',
            }}>
              {col.title}
            </h3>
            {col.links.map((label, li) => (
              <FooterLink
                key={label}
                label={label}
                href={columnHrefs[ci][li].href}
                download={columnHrefs[ci][li].download}
                c={c}
              />
            ))}
          </div>
        ))}
      </div>

      {/* ── Barre basse : copyright + liens légaux ── */}
      <div style={{
        maxWidth: 1180, margin: '40px auto 0', paddingTop: 24,
        borderTop: c ? '1px solid rgba(186,117,23,0.12)' : '1px solid #1F1F23',
        display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 16,
      }}>
        <span style={{ color: c ? '#5F5E5A' : '#52525B', fontSize: 12 }}>
          {f.copyright}
        </span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24 }}>
          {f.legalLinks.map((label, i) => (
            <Link key={legalHrefs[i]} href={legalHrefs[i]}
              style={{ color: c ? '#888780' : '#71717A', textDecoration: 'none', fontSize: 12 }}>
              {label}
            </Link>
          ))}
        </div>
      </div>

      {/* ── Mention légale Riot (obligatoire — Developer Agreement) ── */}
      <div style={{
        maxWidth: 760, margin: '20px auto 0', textAlign: 'center',
        color: c ? '#5F5E5A' : '#52525B', fontSize: 11, lineHeight: 1.6,
      }}>
        {f.riotDisclaimer}
        <br />
        <span style={{ color: c ? '#888780' : '#71717A' }}>{f.poweredBy}</span>
      </div>
    </footer>
  )
}
