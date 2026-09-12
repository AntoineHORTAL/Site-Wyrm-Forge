import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Lang } from '@/locales/landing'

/**
 * Les quatre pages légales RENDUES, dans les deux langues.
 *
 * `locales/legal/legal.test.ts` vérifie les dictionnaires ; ici on monte la
 * chaîne complète — `*Content` → `LegalPage` → `Section` / `Todo` /
 * `SubscriptionTerms` — et on lit le HTML produit. C'est la seule façon
 * d'attraper ce qui casse ENTRE le dictionnaire et l'écran :
 *
 *  • une page qui resterait branchée sur le dico français quelle que soit la
 *    langue (l'oubli le plus probable : un `legalShellFr` importé en dur) ;
 *  • la date de mise à jour, désormais FORMATÉE et non plus rédigée : elle doit
 *    tomber sur le même jour dans les deux langues (c'est `CGV_VERSION`) ;
 *  • les prix des clauses d'abonnement, qui viennent de `PRICING_TIERS` et
 *    doivent suivre la convention de la langue (« 3€ » / « €3 ») ;
 *  • les trous `<Todo>`, qui doivent rester VISIBLES à l'écran en anglais.
 *
 * La langue est pilotée en remplaçant `useLanguage` : le vrai provider démarre
 * toujours en français et ne lit `localStorage` qu'après hydratation, il ne peut
 * donc pas produire un rendu anglais côté serveur.
 */

let lang: Lang = 'fr'

vi.mock('@/components/providers/LanguageProvider', () => ({
  useLanguage: () => ({ lang, setLang: () => {}, t: {} }),
}))

// `LegalPage` appelle `useRouter()` pour son bouton « Retour » : hors contexte
// de routeur, next/navigation lève. Le bouton n'est pas l'objet du test.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ back: () => {} }),
}))

const { default: MentionsLegalesContent } = await import('./MentionsLegalesContent')
const { default: ConfidentialiteContent } = await import('./ConfidentialiteContent')
const { default: CguContent } = await import('./CguContent')
const { default: CgvContent } = await import('./CgvContent')

const PAGES = [
  { route: '/mentions-legales', Content: MentionsLegalesContent },
  { route: '/confidentialite',  Content: ConfidentialiteContent },
  { route: '/cgu',              Content: CguContent },
  { route: '/cgv',              Content: CgvContent },
]

function render(Content: () => React.ReactNode, l: Lang): string {
  lang = l
  return renderToStaticMarkup(<Content />)
}

beforeEach(() => { lang = 'fr' })

describe('pages légales — la bascule de langue change bien le document', () => {
  it.each(PAGES)('$route rend un document différent en FR et en EN', ({ Content }) => {
    const fr = render(Content, 'fr')
    const en = render(Content, 'en')
    expect(fr.length).toBeGreaterThan(2000)
    expect(en.length).toBeGreaterThan(2000)
    expect(en).not.toBe(fr)
  })

  it.each(PAGES)('$route — coquille traduite (retour, mise à jour, mention Riot)', ({ Content }) => {
    const fr = render(Content, 'fr')
    const en = render(Content, 'en')

    expect(fr).toContain('← Retour')
    expect(en).toContain('← Back')

    expect(fr).toContain('Dernière mise à jour')
    expect(en).toContain('Last updated')

    expect(fr).toContain('Non affilié à Riot Games')
    expect(en).toContain('Not affiliated with Riot Games')
  })

  it.each(PAGES)('$route — la date de mise à jour est la même, formatée par langue', ({ Content }) => {
    // Formatée depuis l'ISO `2026-09-11` : même jour, deux écritures. Une date
    // rédigée à la main dans chaque dictionnaire finirait par diverger — et pour
    // les CGV, cette date EST la version enregistrée avec la preuve.
    expect(render(Content, 'fr')).toContain('Dernière mise à jour : 11 septembre 2026')
    expect(render(Content, 'en')).toContain('Last updated: 11 September 2026')
  })

  it.each(PAGES)('$route — navigation croisée traduite, sans lien vers soi-même', ({ route, Content }) => {
    const fr = render(Content, 'fr')
    const en = render(Content, 'en')
    // Appariés PAR POSITION à `LEGAL_LINKS` (LegalPage.tsx) et à
    // `legalShell.navLabels` : les trois AUTRES documents sont listés, jamais
    // celui qu'on est en train de lire.
    const links = [
      { href: '/mentions-legales', fr: 'Mentions légales', en: 'Legal notice' },
      { href: '/confidentialite',  fr: 'Confidentialité',  en: 'Privacy' },
      { href: '/cgu',              fr: 'CGU',              en: 'Terms of use' },
      { href: '/cgv',              fr: 'CGV',              en: 'Terms of sale' },
    ]
    for (const link of links) {
      const self = link.href === route
      expect(fr.includes(`${link.fr} →`), `fr ${link.href}`).toBe(!self)
      expect(en.includes(`${link.en} →`), `en ${link.href}`).toBe(!self)
    }
    // La page courante est retirée de la navigation du bas.
    expect(en).not.toContain(`href="${route}"`)
  })

  it.each(PAGES)('$route — la note de traduction n’apparaît qu’en anglais', ({ Content }) => {
    expect(render(Content, 'fr')).not.toContain('English translation')
    expect(render(Content, 'en')).toContain('English translation')
  })
})

describe('pages légales — le corps du document est traduit', () => {
  it('/mentions-legales garde ses trous visibles dans les deux langues', () => {
    const fr = render(MentionsLegalesContent, 'fr')
    const en = render(MentionsLegalesContent, 'en')
    // Trois trous rendus : TVA, nom du président, médiateur (nom / adresse / URL).
    expect(fr).toContain('À COMPLÉTER PAR HORTAL')
    expect(en).toContain('TO BE COMPLETED BY HORTAL')
    const count = (html: string) => html.split('HORTAL').length - 1
    expect(count(en)).toBe(count(fr))
    expect(count(fr)).toBeGreaterThan(0)
  })

  it('/cgv rend le formulaire de rétractation dans les deux langues', () => {
    expect(render(CgvContent, 'fr')).toContain('Formulaire de rétractation')
    expect(render(CgvContent, 'en')).toContain('Withdrawal form')
  })

  it('/cgv rend l’encadré réglementaire de garantie légale dans les deux langues', () => {
    expect(render(CgvContent, 'fr'))
      .toContain('Garantie légale de conformité — contenus et services numériques')
    expect(render(CgvContent, 'en'))
      .toContain('Statutory guarantee of conformity — digital content and digital services')
  })

  it('/confidentialite garde les identifiants techniques non traduits', () => {
    // Clés de stockage local et nom du cookie de session : le lecteur doit les
    // retrouver tels quels dans son navigateur.
    for (const l of ['fr', 'en'] as const) {
      const html = render(ConfidentialiteContent, l)
      expect(html).toContain('wf.stripe.checkout-intent')
      expect(html).toContain('sb-…-auth-token')
    }
  })
})

describe('clauses d’abonnement partagées — prix et paliers suivent la langue', () => {
  it.each([
    { route: '/cgu', Content: CguContent },
    { route: '/cgv', Content: CgvContent },
  ])('$route affiche les montants dans la convention de la langue', ({ Content }) => {
    const fr = render(Content, 'fr')
    const en = render(Content, 'en')
    // `PRICING_TIERS` : Forgeron 3 €/mois, 30 €/an ; Maître 6 €/mois, 60 €/an.
    // La POSITION du symbole vient de `pricing.priceFormat` (locales/landing.ts) :
    // « 3€ » en français, « €3 » en anglais — même source que la grille tarifaire.
    expect(fr).toContain('3€ par mois')
    expect(fr).toContain('30€ par an')
    expect(en).toContain('€3 per month')
    expect(en).toContain('€30 per year')
  })

  it.each([
    { route: '/cgu', Content: CguContent },
    { route: '/cgv', Content: CgvContent },
  ])('$route nomme les paliers comme la grille tarifaire de la même langue', ({ Content }) => {
    // `pricing.tiers[i].name` (locales/landing.ts) dit « Forgeron » / « Maître »
    // en français et « Blacksmith » / « Master » en anglais : un contrat qui
    // nommerait le palier autrement que l'écran de souscription serait illisible.
    const fr = render(Content, 'fr')
    const en = render(Content, 'en')
    expect(fr).toContain('Forgeron')
    expect(fr).toContain('Maître')
    expect(en).toContain('Blacksmith')
    expect(en).toContain('Master')
  })
})
