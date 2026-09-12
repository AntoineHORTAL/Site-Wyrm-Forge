'use client'

import { useLanguage } from '@/components/providers/LanguageProvider'
import { useTheme } from '@/components/providers/ThemeProvider'

/**
 * Section éditoriale de la vitrine — « Qu'est-ce que Wyrm Forge ? »
 *
 * Ajoutée au chantier AdSense du 2026-09-12, en réponse au motif de refus
 * « contenu à faible valeur informative ». Les autres sections de la vitrine
 * sont faites de titres courts, d'icônes et de cartes : excellentes pour vendre,
 * pauvres à lire. Celle-ci est du TEXTE SUIVI — ce qui explique le produit à
 * quelqu'un qui n'en a jamais entendu parler, y compris un examinateur.
 *
 * 🔴 Rendue par le SERVEUR, comme tout le reste de la vitrine depuis que
 * `app/page.tsx` ne court-circuite plus sur `loading`. C'est ce qui met ce texte
 * dans le HTML servi : un composant client rend quand même son HTML au SSR, à
 * condition que son parent le rende — c'était tout le problème.
 *
 * ⚠️ Ne rien mettre ici qui dépende d'un `useEffect`, d'une donnée réseau ou du
 * `localStorage` : ce bloc doit rester intégralement présent dans la réponse du
 * serveur, sans quoi il ne sert plus à rien.
 *
 * Le ton suit la charte du dossier légal plutôt que celle du marketing :
 * factuel, aucune promesse de résultat en jeu, et la non-affiliation à Riot
 * Games rappelée — c'est le même engagement que les CGU § 11.
 */
export default function About() {
  const { t } = useLanguage()
  const { theme } = useTheme()
  const c = theme === 'mythic'
  const a = t.about

  return (
    <section
      id="a-propos"
      style={{
        background: c ? '#0A0710' : '#09090B',
        padding: 'clamp(56px, 8vw, 96px) clamp(20px, 5vw, 48px)',
        borderTop: c ? '1px solid rgba(186,117,23,0.18)' : '1px solid #1F1F23',
      }}
    >
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        <p style={{
          fontFamily: 'Cinzel, serif', fontSize: 11, letterSpacing: '.34em',
          color: c ? '#9D8BF5' : '#A1A1AA', textTransform: 'uppercase', margin: '0 0 12px',
        }}>
          {a.eyebrow}
        </p>

        <h2 className="font-mythic" style={{
          fontSize: 'clamp(26px, 4.4vw, 38px)', fontWeight: 700,
          lineHeight: 1.15, margin: '0 0 20px', color: '#F5F2FA',
        }}>
          {a.titleBefore}<span className="accent-text">{a.titleAccent}</span>{a.titleAfter}
        </h2>

        <p style={{
          fontSize: 16, lineHeight: 1.75, color: 'var(--text-muted)', margin: '0 0 36px',
        }}>
          {a.intro}
        </p>

        <div style={{ display: 'grid', gap: 28 }}>
          {a.sections.map(s => (
            <article key={s.title}>
              <h3 style={{
                fontSize: 17, fontWeight: 700, margin: '0 0 8px',
                color: c ? 'var(--gold-pale)' : '#FAFAFA',
              }}>
                {s.title}
              </h3>
              <p style={{ fontSize: 15, lineHeight: 1.75, color: 'var(--text-muted)', margin: 0 }}>
                {s.body}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
