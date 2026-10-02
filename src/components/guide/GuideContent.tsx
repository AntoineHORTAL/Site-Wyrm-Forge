'use client'

import { useEffect, useState } from 'react'
import { useLanguage } from '@/components/providers/LanguageProvider'
import { useTheme } from '@/components/providers/ThemeProvider'
import { WINDOWS_DOWNLOAD_URL } from '@/lib/download'
import { GUIDE_APP_VERSION, GUIDE_UPDATED } from '@/lib/guide-release'
import type { VisibleGuideEntry, VisibleGuideSection } from '@/lib/guide'
import { formatDate } from '@/lib/intl'
import { guideDicts, type GuideDict } from '@/locales/guide'
import type { Lang } from '@/locales/landing'

/* Page `/guide` — le CONTENU. La page serveur (`src/app/guide/page.tsx`) a déjà
   tranché deux choses avant d'arriver ici :
   - la langue du premier rendu (`serverLang`, lue dans `?lang=`) ;
   - les sous-sections visibles (`sections`, filtrées par les feature flags).
   Ce composant n'est client que pour SUIVRE la bascule de langue du header.

   ⚠️ LANGUE AFFICHÉE = `serverLang` TANT QUE LE PROVIDER N'A PAS BOUGÉ.
   `LanguageProvider` démarre à 'fr' au serveur comme au client, puis applique
   l'URL ou la préférence stockée dans un effet. Lire sa valeur dès le premier
   rendu ferait servir du FRANÇAIS sur `/guide?lang=en` — exactement ce que la
   lecture serveur existe pour éviter. On ne suit donc le provider qu'à partir du
   moment où sa langue CHANGE : préférence stockée appliquée, URL appliquée, ou
   clic sur la bascule. Ensuite on le suit toujours (y compris retour à 'fr'). */

export default function GuideContent({ serverLang, sections }: {
  serverLang: Lang
  sections: VisibleGuideSection[]
}) {
  const { lang } = useLanguage()
  const { theme } = useTheme()
  const c = theme === 'mythic'

  const [initialProviderLang] = useState(lang)
  const [follow, setFollow] = useState(false)
  useEffect(() => {
    // Bascule à sens unique, posée dans un effet parce que c'est le seul endroit
    // où l'on sait que le provider a appliqué sa langue après l'hydratation.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- voir ci-dessus
    if (lang !== initialProviderLang) setFollow(true)
  }, [lang, initialProviderLang])

  const shown: Lang = follow ? lang : serverLang
  const d = guideDicts[shown]

  // Construite par composants et non `new Date('AAAA-MM-JJ')` (minuit UTC) : à
  // l'ouest de Greenwich, la date affichée reculerait d'un jour.
  const [y, m, day] = GUIDE_UPDATED.split('-').map(Number)
  const updated = formatDate(new Date(y, m - 1, day), shown, { dateStyle: 'long' })

  const heading = c ? 'var(--gold-pale)' : 'var(--text)'

  return (
    <main lang={shown} className="guide-main">
      <p className="land-eyebrow guide-eyebrow">{d.eyebrow}</p>
      <h1 className="font-mythic guide-h1">
        {d.title} <span className="accent-text">{d.titleAccent}</span>
      </h1>
      <p className="guide-intro">{d.intro}</p>
      <p className="guide-meta">
        <span>{d.updated.replace('{date}', updated)}</span>
        <span aria-hidden="true"> · </span>
        <span>{d.version.replace('{version}', GUIDE_APP_VERSION)}</span>
      </p>

      <nav aria-labelledby="guide-toc-title" className="wf-card guide-toc">
        <h2 id="guide-toc-title" className="guide-toc-title">{d.tocTitle}</h2>
        <ol className="guide-toc-sections">
          {sections.map(s => (
            <li key={s.id}>
              <a href={`#${s.id}`} className="guide-toc-section">{d.sections[s.id].title}</a>
              <ul className="guide-toc-entries">
                {s.intro && <TocLink id={s.intro.id} d={d} />}
                {s.groups.map(g => (
                  <li key={g.id}>
                    <a href={`#${g.id}`} className="guide-toc-group">{d.groups[g.id]}</a>
                    <ul className="guide-toc-entries">
                      {g.entries.map(e => <TocLink key={e.id} id={e.id} d={d} />)}
                    </ul>
                  </li>
                ))}
                {s.entries.map(e => <TocLink key={e.id} id={e.id} d={d} />)}
              </ul>
            </li>
          ))}
        </ol>
      </nav>

      {sections.map(s => (
        <section key={s.id} id={s.id} aria-labelledby={`${s.id}-title`} className="guide-section">
          <h2 id={`${s.id}-title`} className="font-mythic guide-h2" style={{ color: heading }}>
            {d.sections[s.id].title}
          </h2>
          <p className="guide-blurb">{d.sections[s.id].blurb}</p>

          {s.id === 'app' && (
            <p className="guide-download">
              <a className="wf-btn-primary" href={WINDOWS_DOWNLOAD_URL} download>{d.downloadCta}</a>
            </p>
          )}

          {s.intro && <Entry entry={s.intro} d={d} level={3} heading={heading} />}

          {s.groups.map(g => (
            <div key={g.id} id={g.id} className="guide-group">
              <h3 className="guide-group-title">{d.groups[g.id]}</h3>
              {g.entries.map(e => <Entry key={e.id} entry={e} d={d} level={4} heading={heading} />)}
            </div>
          ))}

          {s.entries.map(e => <Entry key={e.id} entry={e} d={d} level={3} heading={heading} />)}
        </section>
      ))}
    </main>
  )
}

function TocLink({ id, d }: { id: VisibleGuideEntry['id']; d: GuideDict }) {
  return (
    <li>
      <a href={`#${id}`} className="guide-toc-link">{d.entries[id].name}</a>
    </li>
  )
}

function Entry({ entry, d, level, heading }: {
  entry: VisibleGuideEntry
  d: GuideDict
  level: 3 | 4
  heading: string
}) {
  const t = d.entries[entry.id]
  const H = level === 3 ? 'h3' : 'h4'
  const tier = entry.showAi && t.aiTier ? t.aiTier : (t.tier ?? d.defaultTier)
  const steps = entry.showAi && t.aiSteps ? [...t.steps, ...t.aiSteps] : t.steps

  return (
    <article id={entry.id} aria-labelledby={`${entry.id}-title`} className="wf-card guide-entry">
      <H id={`${entry.id}-title`} className="guide-entry-title" style={{ color: heading }}>{t.name}</H>

      <dl className="guide-fields">
        <dt>{d.labels.purpose}</dt>
        <dd>{t.purpose}</dd>
        <dt>{d.labels.where}</dt>
        <dd>{t.where}</dd>
        <dt>{d.labels.tier}</dt>
        <dd>{tier}</dd>
      </dl>

      <p className="guide-label">{d.labels.steps}</p>
      <ol className="guide-steps">
        {steps.map((s, i) => <li key={i}>{s}</li>)}
      </ol>

      {t.inGame && (
        <>
          <p className="guide-label">{d.labels.inGame}</p>
          <p className="guide-text">{t.inGame}</p>
        </>
      )}

      {t.note && (
        <p className="guide-note"><strong>{d.labels.note}</strong> {t.note}</p>
      )}

      {/* Emplacement de capture — VISIBLE à dessein : une capture manquante doit
          se voir sur la page, pas se perdre dans un commentaire. */}
      <figure className="guide-shot" data-guide-screenshot={entry.id}>
        <figcaption>
          <span className="guide-shot-label">{d.labels.screenshot}</span>
          <span>{t.screenshot}</span>
        </figcaption>
      </figure>
    </article>
  )
}
