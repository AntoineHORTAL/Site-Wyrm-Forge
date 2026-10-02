// ════════════════════════════════════════════════════════════════════════════
//  guide-seo — URL et metadata de `/guide`, dans les DEUX langues
// ════════════════════════════════════════════════════════════════════════════
// 🔴 POURQUOI `/guide?lang=en` EXISTE ALORS QUE LE SITE N'A PAS DE ROUTAGE i18n.
//
// Partout ailleurs, la langue est un état CLIENT (`LanguageProvider`, stockage
// `wf-lang`) : le serveur rend toujours le français, et un robot ne voit donc
// jamais une page en anglais. Pour `/guide`, page faite pour être trouvée, ce
// serait jeter la moitié du contenu. La page lit donc `?lang=` CÔTÉ SERVEUR
// (décision du 2026-10-02) : `/guide` sert le français, `/guide?lang=en`
// l'anglais, et chacune déclare l'autre en `hreflang`.
//
// Le paramètre est celui des e-mails (`LANG_PARAM`), lu avec la même règle
// stricte (`fr` | `en`, sinon français) : un seul paramètre de langue sur le site.
//
// Module PUR : il se teste sans Next ni jsdom.

import type { Metadata } from 'next'
import { guideDicts } from '../locales/guide'
import type { Lang } from '../locales/landing'
import { withLangParam } from './lang-param'
import { canonical } from './site-url'

export const GUIDE_PATH = '/guide'

/** Chemin de la version d'une langue — le français reste l'URL nue. */
export function guidePath(lang: Lang): string {
  return lang === 'en' ? withLangParam(GUIDE_PATH, 'en') : GUIDE_PATH
}

/**
 * Les alternatives de langue, en URL ABSOLUES — partagées par les metadata de
 * la page et par le sitemap, pour que les deux ne puissent pas diverger.
 * `x-default` pointe le français, qui fait foi.
 */
export function guideLanguageAlternates(): Record<string, string> {
  return {
    fr: canonical(guidePath('fr')),
    en: canonical(guidePath('en')),
    'x-default': canonical(guidePath('fr')),
  }
}

export function guideMetadata(lang: Lang): Metadata {
  const d = guideDicts[lang]
  return {
    title: d.meta.title,
    description: d.meta.description,
    // Chaque version est canonique pour elle-même : déclarer `/guide` canonique
    // de la version anglaise dirait à Google de ne PAS indexer l'anglais.
    alternates: {
      canonical: canonical(guidePath(lang)),
      languages: guideLanguageAlternates(),
    },
    openGraph: {
      title: d.meta.title,
      description: d.meta.description,
      url: canonical(guidePath(lang)),
      locale: lang === 'en' ? 'en_GB' : 'fr_FR',
      type: 'article',
    },
  }
}
