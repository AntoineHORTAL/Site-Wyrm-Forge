import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { landingDicts, type Lang } from '@/locales/landing'
import { guideDicts } from '@/locales/guide'
import { GUIDE_ENTRY_IDS, guideFlagKeys, visibleGuide } from '@/lib/guide'
import { GUIDE_APP_VERSION } from '@/lib/guide-release'

/**
 * Rendu de `/guide`. `renderToStaticMarkup` n'exécute aucun effet : ce qui sort
 * ici est la réponse HTTP — ce que lit un robot.
 */

let providerLang: Lang = 'fr'

vi.mock('@/components/providers/LanguageProvider', () => ({
  useLanguage: () => ({ lang: providerLang, setLang: () => {}, t: landingDicts[providerLang] }),
}))
vi.mock('@/components/providers/ThemeProvider', () => ({
  useTheme: () => ({ theme: 'mythic', setTheme: () => {} }),
}))

const { default: GuideContent } = await import('./GuideContent')
const { default: BackToToc, BackToTocButton } = await import('./BackToToc')

const ALL_ON: Record<string, boolean> = Object.fromEntries(guideFlagKeys().map(k => [k, true]))

function render(serverLang: Lang, flags: Record<string, boolean> = ALL_ON): string {
  return renderToStaticMarkup(<GuideContent serverLang={serverLang} sections={visibleGuide(flags)} />)
}

/** Texte visible, balises et entités retirées. */
function textOf(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/&#x27;|&apos;/g, "'")
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim()
}

beforeEach(() => { providerLang = 'fr' })

describe('rendu de la page', () => {
  it.each(['fr', 'en'] as const)('%s — titre, intro, version et une carte par sous-section', (lang) => {
    const html = render(lang)
    const d = guideDicts[lang]
    expect(textOf(html)).toContain(d.titleAccent)
    expect(textOf(html)).toContain(d.intro)
    expect(textOf(html)).toContain(d.version.replace('{version}', GUIDE_APP_VERSION))
    for (const id of GUIDE_ENTRY_IDS) {
      expect(html, id).toContain(`<article id="${id}"`)
      expect(html, `sommaire:${id}`).toContain(`href="#${id}"`)
    }
  })

  it('🔴 la langue servie est celle du serveur, pas la valeur de départ du provider', () => {
    // Le provider vaut 'fr' au premier rendu, toujours. Sur `/guide?lang=en`, le
    // HTML doit pourtant être anglais : c'est tout l'intérêt de la lecture serveur.
    providerLang = 'fr'
    const html = render('en')
    expect(html).toContain('lang="en"')
    expect(textOf(html)).toContain(guideDicts.en.intro)
    expect(textOf(html)).not.toContain(guideDicts.fr.intro)
  })

  it('les deux langues rendent des textes différents', () => {
    expect(textOf(render('en'))).not.toBe(textOf(render('fr')))
  })

  it('chaque sous-section porte son emplacement de capture, visible', () => {
    const html = render('fr')
    for (const id of GUIDE_ENTRY_IDS) expect(html).toContain(`data-guide-screenshot="${id}"`)
    expect(html.match(/data-guide-screenshot=/g)).toHaveLength(GUIDE_ENTRY_IDS.length)
    expect(textOf(html)).toContain(guideDicts.fr.labels.screenshot)
  })

  it('palier par défaut partout, palier IA seulement sur Match Up et Bilan IA', () => {
    const text = textOf(render('fr'))
    const ai = guideDicts.fr.entries['bilan-ia'].tier!
    expect(text.split(ai).length - 1).toBe(2) // Match Up (aiTier) + Bilan IA (tier)
  })

  it('aucune directive noindex dans le contenu', () => {
    expect(render('fr')).not.toMatch(/noindex/i)
  })
})

describe('🔴 masquage par feature flag', () => {
  it('flag coupé ⇒ ni sous-section ni entrée de sommaire', () => {
    const html = render('fr', { ...ALL_ON, live_game_enabled: false })
    expect(html).not.toContain('id="partie-en-direct"')
    expect(html).not.toContain('href="#partie-en-direct"')
    expect(textOf(html)).not.toContain(guideDicts.fr.entries['partie-en-direct'].purpose)
    // Le reste est intact.
    expect(html).toContain('id="patch-notes"')
  })

  it('groupe vidé ⇒ son titre disparaît aussi du contenu et du sommaire', () => {
    const html = render('fr', {
      ...ALL_ON,
      champ_select_advisor_enabled: false, rune_page_apply_enabled: false, item_set_export_enabled: false,
    })
    expect(html).not.toContain('id="avant-partie"')
    expect(html).not.toContain('href="#avant-partie"')
    expect(textOf(html)).not.toContain(guideDicts.fr.groups['avant-partie'])
  })

  it('IA du Match Up coupée ⇒ la sous-section reste, sans ses étapes ni son palier IA', () => {
    const fr = guideDicts.fr.entries['match-up']
    const text = textOf(render('fr', { ...ALL_ON, matchup_ai_enabled: false }))
    expect(text).toContain(fr.purpose)
    expect(text).not.toContain(fr.aiSteps![0])
    expect(text.split(fr.aiTier!).length - 1).toBe(1) // ne reste que dans le Bilan IA
  })
})

describe('bouton « retour au sommaire »', () => {
  it('le sommaire porte l’ancre ciblée et reçoit le focus programmatique', () => {
    const html = render('fr')
    expect(html).toMatch(/<nav id="sommaire" tabindex="-1"/)
  })

  it('absent du HTML servi : au chargement, le sommaire est à l’écran', () => {
    // Avant toute observation (rendu serveur), le sommaire est réputé visible.
    expect(render('fr')).not.toContain('guide-back-to-toc')
    expect(renderToStaticMarkup(<BackToToc label="x" />)).toBe('')
  })

  it.each(['fr', 'en'] as const)('%s — rendu du bouton : libellé accessible et icône décorative', (lang) => {
    const label = guideDicts[lang].backToToc
    const html = renderToStaticMarkup(<BackToTocButton label={label} />)
    expect(html).toContain(`aria-label="${label}"`)
    expect(html).toContain('class="guide-back-to-toc"')
    expect(html).toContain('type="button"')
    expect(html).toMatch(/<svg[^>]*aria-hidden="true"/)
  })
})
