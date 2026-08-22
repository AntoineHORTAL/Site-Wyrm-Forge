import { describe, it, expect } from 'vitest'
import { landingFr, landingEn, landingDicts, formatPrice } from './landing'

/**
 * `LandingDict = typeof landingFr` force déjà les mêmes CLÉS des deux côtés à la
 * compilation. Ce que le type ne couvre PAS : la LONGUEUR des tableaux. Un
 * `nav.links` à 5 entrées en EN compilerait sans broncher et afficherait
 * `undefined` sur le 6ᵉ lien de la barre de navigation, en silence.
 *
 * Les composants indexent aussi ces tableaux par position pour retrouver leur
 * icône (`featureIcons[i]`, `trustIcons[i]`) ou leur destination
 * (`columnHrefs[ci][li]`, `legalHrefs[i]`) — un décalage de longueur casserait
 * cet appariement.
 */
describe('parité de structure FR / EN', () => {
  it('expose exactement les deux langues', () => {
    expect(Object.keys(landingDicts).sort()).toEqual(['en', 'fr'])
  })

  it('a les mêmes longueurs de tableaux dans les deux langues', () => {
    expect(landingEn.nav.links).toHaveLength(landingFr.nav.links.length)
    expect(landingEn.hero.badges).toHaveLength(landingFr.hero.badges.length)
    expect(landingEn.hero.overlay.stats).toHaveLength(landingFr.hero.overlay.stats.length)
    expect(landingEn.features.items).toHaveLength(landingFr.features.items.length)
    expect(landingEn.community.items).toHaveLength(landingFr.community.items.length)
    expect(landingEn.pricing.tiers).toHaveLength(landingFr.pricing.tiers.length)
    expect(landingEn.faq.items).toHaveLength(landingFr.faq.items.length)
    expect(landingEn.footer.columns).toHaveLength(landingFr.footer.columns.length)
    expect(landingEn.footer.legalLinks).toHaveLength(landingFr.footer.legalLinks.length)

    landingFr.footer.columns.forEach((col, i) => {
      expect(landingEn.footer.columns[i].links).toHaveLength(col.links.length)
    })
    landingFr.pricing.tiers.forEach((tier, i) => {
      expect(landingEn.pricing.tiers[i].features).toHaveLength(tier.features.length)
    })
  })

  it('correspond aux cardinalités attendues par les composants', () => {
    // Nav.tsx — NAV_SECTION_IDS (accueil, features, communaute, tarifs, telecharger, faq)
    expect(landingFr.nav.links).toHaveLength(6)
    // Features.tsx — featureIcons / Community.tsx — trustIcons
    expect(landingFr.features.items).toHaveLength(5)
    expect(landingFr.community.items).toHaveLength(3)
    // Pricing.tsx — tiers (Apprenti, Forgeron, Maître)
    expect(landingFr.pricing.tiers).toHaveLength(3)
    // Hero.tsx — OverlayMock lit stats[0..5]
    expect(landingFr.hero.overlay.stats).toHaveLength(6)
    // Footer.tsx — columnHrefs (3 colonnes de 4) / legalHrefs (3 routes)
    expect(landingFr.footer.columns).toHaveLength(3)
    landingFr.footer.columns.forEach(col => expect(col.links).toHaveLength(4))
    expect(landingFr.footer.legalLinks).toHaveLength(3)
  })

  it('ne laisse aucune chaîne vide', () => {
    const walk = (node: unknown, path: string) => {
      if (typeof node === 'string') {
        expect(node.trim(), `chaîne vide en ${path}`).not.toBe('')
      } else if (Array.isArray(node)) {
        node.forEach((v, i) => walk(v, `${path}[${i}]`))
      } else if (node && typeof node === 'object') {
        Object.entries(node).forEach(([k, v]) => walk(v, `${path}.${k}`))
      }
    }
    walk(landingFr, 'fr')
    walk(landingEn, 'en')
  })

  it('conserve le marqueur {price} dans les deux langues', () => {
    // Pricing.tsx fait un .replace('{price}', …) — sans le marqueur, le prix disparaît
    expect(landingFr.pricing.billedAnnually).toContain('{price}')
    expect(landingEn.pricing.billedAnnually).toContain('{price}')
  })

  it('traduit réellement le contenu (pas de copie du FR)', () => {
    expect(landingEn.hero.subtitle).not.toBe(landingFr.hero.subtitle)
    expect(landingEn.faq.items[0].a).not.toBe(landingFr.faq.items[0].a)
    expect(landingEn.footer.tagline).not.toBe(landingFr.footer.tagline)
  })

  /**
   * Les noms de paliers sont traduits pour l'AFFICHAGE seulement. Les valeurs de
   * `profiles.tier` en base (partagées avec l'app WPF) restent portées par le
   * tableau `tiers` de Pricing.tsx et ne bougent pas — d'où le double verrou :
   * le FR reste calé sur les valeurs canoniques, l'EN doit en différer.
   */
  it('traduit les noms de paliers en anglais, FR calé sur profiles.tier', () => {
    expect(landingFr.pricing.tiers.map(t => t.name)).toEqual(['Apprenti', 'Forgeron', 'Maître'])

    landingFr.pricing.tiers.forEach((tier, i) => {
      const en = landingEn.pricing.tiers[i].name
      expect(en, `nom de palier resté en français en EN (index ${i})`).not.toBe(tier.name)
    })
  })
})

/**
 * Le symbole € ne se place pas du même côté selon la langue : « 2€ » en français,
 * « €2 » en anglais. C'est une convention typographique, pas un détail cosmétique —
 * et rien dans le typage ne l'empêche de régresser en silence, d'où ces tests.
 */
describe('formatage des prix', () => {
  it('place le symbole € APRÈS le montant en français', () => {
    expect(formatPrice(2, 'fr')).toBe('2€')
    expect(formatPrice(1.8, 'fr')).toBe('1,80€')
  })

  it('place le symbole € AVANT le montant en anglais', () => {
    expect(formatPrice(2, 'en')).toBe('€2')
    expect(formatPrice(1.8, 'en')).toBe('€1.80')
  })

  it('omet les décimales sur un entier, en affiche deux sinon', () => {
    // Prix annuels réellement affichés par Pricing.tsx (mensuel × 12 × 0,9)
    expect(formatPrice(21.6, 'fr')).toBe('21,60€')
    expect(formatPrice(54, 'en')).toBe('€54')
  })

  it('garde le marqueur {amount} dans le gabarit des deux langues', () => {
    // formatPrice fait un .replace('{amount}', …) — sans marqueur, le montant disparaît
    expect(landingFr.pricing.priceFormat).toContain('{amount}')
    expect(landingEn.pricing.priceFormat).toContain('{amount}')
  })

  it("n'écrit le symbole € nulle part ailleurs que dans le gabarit", () => {
    // `billedAnnually` reçoit un prix DÉJÀ formaté : un € en dur ferait « 21,60€€/an »
    Object.values(landingDicts).forEach(dict => {
      Object.entries(dict.pricing).forEach(([key, value]) => {
        if (key === 'priceFormat' || typeof value !== 'string') return
        expect(value, `symbole € en dur dans pricing.${key}`).not.toContain('€')
      })
    })
  })
})
