import type { Metadata } from 'next'
import GuideContent from '@/components/guide/GuideContent'
import { guideFlagKeys, visibleGuide } from '@/lib/guide'
import { guideMetadata } from '@/lib/guide-seo'
import { readPublicFlags } from '@/lib/feature-flags-server'
import { LANG_PARAM, langFromParam } from '@/lib/lang-param'

/* /guide — guide utilisateur, FR et EN, INDEXABLE (contrairement à
   /riot-games.html, volontairement en noindex).

   🔴 Deux décisions sont prises ICI, côté serveur, avant que le HTML ne parte :

   1. LA LANGUE. Le reste du site choisit sa langue côté client, donc ne sert
      jamais que du français aux robots. Ici, `?lang=en` est lu au rendu : la
      réponse HTTP de `/guide?lang=en` est en anglais, metadata comprises, et
      chaque version déclare l'autre en `hreflang` (voir `lib/guide-seo.ts`).
      Contrepartie assumée : lire `searchParams` rend la route dynamique (ƒ).

   2. LES SOUS-SECTIONS VISIBLES. Chacune est rattachée à son feature flag
      (`lib/guide.ts`) ; un kill switch coupé la retire du contenu ET du sommaire.
      Lecture par `readPublicFlags` — fetch public avec `revalidate`, SANS
      `cookies()`, même approche que les gardes de /matches et /live : une
      requête toutes les 60 s, pas une par visiteur. */

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

async function langOf(searchParams: Props['searchParams']) {
  return langFromParam((await searchParams)[LANG_PARAM]) ?? 'fr'
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  return guideMetadata(await langOf(searchParams))
}

export default async function GuidePage({ searchParams }: Props) {
  const [lang, flags] = await Promise.all([langOf(searchParams), readPublicFlags(guideFlagKeys())])
  return <GuideContent serverLang={lang} sections={visibleGuide(flags)} />
}
