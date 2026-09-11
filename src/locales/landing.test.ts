import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { landingFr, landingEn, landingDicts, formatPrice } from './landing'
import { NAV_SECTION_IDS, PLAYER_SEARCH_HREF } from '@/lib/nav-links'
import { PRICING_TIERS, FREE_MONTHS_ON_ANNUAL, freeMonthsOnAnnual } from '@/lib/pricing-tiers'
import { TIER_BY_PLAN, isPlanKey } from '@/lib/stripe/plans'

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
    expect(landingEn.features.more).toHaveLength(landingFr.features.more.length)
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
    // Nav.tsx — un libellé par ancre de NAV_SECTION_IDS, appariés par POSITION.
    // Assertion dérivée plutôt que codée en dur : ajouter une ancre sans son
    // libellé (ou l'inverse) casse ici, pas en prod avec un `undefined`.
    expect(landingFr.nav.links).toHaveLength(NAV_SECTION_IDS.length)
    expect(landingFr.nav.links).toHaveLength(6)
    // Features.tsx — deux listes, deux tableaux d'icônes indexés par position :
    // `items` ↔ featureIcons (cartes pleines), `more` ↔ moreIcons (liste compacte).
    expect(landingFr.features.items).toHaveLength(6)
    expect(landingFr.features.more).toHaveLength(6)
    // Community.tsx — trustIcons
    expect(landingFr.community.items).toHaveLength(3)
    // Pricing.tsx — un bloc de copy par palier de `PRICING_TIERS` (appariés par index)
    expect(landingFr.pricing.tiers).toHaveLength(PRICING_TIERS.length)
    expect(landingFr.pricing.tiers).toHaveLength(3)
    // Hero.tsx — OverlayMock lit stats[0..5]
    expect(landingFr.hero.overlay.stats).toHaveLength(6)
    // Footer.tsx — columnHrefs (2 colonnes de 4) / legalHrefs (4 routes : CGU, CGV,
    // confidentialité, mentions légales)
    expect(landingFr.footer.columns).toHaveLength(2)
    landingFr.footer.columns.forEach(col => expect(col.links).toHaveLength(4))
    expect(landingFr.footer.legalLinks).toHaveLength(4)
  })

  /**
   * La barre centrée ne contient QUE des ancres — c'est ce qui rend le scroll-spy
   * correct et le comportement des six liens uniforme. La recherche de joueur, qui
   * navigue au lieu de scroller, vit dans le bloc de droite du header et dans le
   * drawer, avec son propre libellé.
   */
  it('ne garde que des ancres dans la barre centrée', () => {
    // Exactement les six <section id> de la home, dans l'ordre de la page
    // (Hero, Features, Community, Pricing, FinalCTA, FAQ).
    expect([...NAV_SECTION_IDS]).toEqual(['accueil', 'features', 'communaute', 'tarifs', 'telecharger', 'faq'])

    // Aucune entrée ne doit ressembler à une route : une ancre qui commencerait
    // par « / » serait cherchée par `getElementById` et ne ferait rien.
    NAV_SECTION_IDS.forEach(id => expect(id.startsWith('/')).toBe(false))
  })

  /**
   * La recherche de joueur est rendue à DEUX endroits (bloc de droite du header,
   * drawer mobile) depuis un seul libellé et une seule destination. Ces assertions
   * empêchent que l'un des deux dérive.
   */
  it('porte la recherche de joueur hors de la barre centrée', () => {
    expect(PLAYER_SEARCH_HREF).toBe('/matches')

    // Le libellé ne doit pas être resté dans `nav.links` : il y aurait alors DEUX
    // entrées « Joueurs » à l'écran, dont une qui tenterait de scroller.
    expect(landingFr.nav.links).not.toContain(landingFr.nav.players)
    expect(landingEn.nav.links).not.toContain(landingEn.nav.players)

    expect(landingFr.nav.players.trim()).not.toBe('')
    expect(landingEn.nav.players).not.toBe(landingFr.nav.players)
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
 * Grille tarifaire — les MONTANTS vivent dans `src/lib/pricing-tiers.ts`, la COPY
 * dans le dictionnaire. Rien n'oblige les deux à rester d'accord : ces tests le font.
 *
 * L'enjeu n'est pas cosmétique. Le badge du bascule annuel affiche une promesse
 * commerciale (« 2 mois offerts ») ; si un prix annuel bouge sans que le badge
 * suive, le site annonce une remise qu'il n'accorde pas.
 */
describe('paliers tarifaires', () => {
  it('pose des prix annuels ENTIERS, jamais un produit de facteur', () => {
    // L'ancien ANNUAL_FACTOR = 0.9 donnait 32,40 € et 64,80 €. Les prix annuels
    // sont désormais des valeurs commerciales fixes et arrondies.
    expect(PRICING_TIERS.map(t => t.annual)).toEqual([0, 30, 60])
    expect(PRICING_TIERS.map(t => t.monthly)).toEqual([0, 3, 6])
    PRICING_TIERS.forEach(t => {
      expect(Number.isInteger(t.annual), `prix annuel non entier sur ${t.name}`).toBe(true)
    })
  })

  it('garde un seul palier gratuit, et le palier populaire est payant', () => {
    expect(PRICING_TIERS.filter(t => t.monthly === 0)).toHaveLength(1)
    expect(PRICING_TIERS[0].cta).toBe('download')
    const popular = PRICING_TIERS.filter(t => t.popular)
    expect(popular).toHaveLength(1)
    expect(popular[0].monthly).toBeGreaterThan(0)
  })

  it('donne une clé Stripe à CHAQUE palier mis en vente, et à eux seuls', () => {
    // Un palier `subscribe` sans `plan` produirait un bouton qui échoue au clic :
    // la route `/api/stripe/checkout` rejette le corps en `invalid_plan`. Et un
    // `plan` sur un palier non vendu laisserait croire qu'il est achetable.
    for (const t of PRICING_TIERS) {
      if (t.cta === 'subscribe') {
        expect(t.plan, `${t.name} est en vente sans clé de palier`).toBeDefined()
        expect(isPlanKey(t.plan), `${t.name} porte une clé inconnue`).toBe(true)
      } else {
        expect(t.plan, `${t.name} n'est pas en vente mais porte une clé`).toBeUndefined()
      }
    }
  })

  it('fait correspondre la clé ASCII au libellé de la grille — accent compris', () => {
    // `plan` voyage en JSON et en nom de variable d'environnement, `name` est la
    // valeur de `profiles.tier`. Les deux doivent désigner le même palier : sans
    // ce test, « Maître » pourrait vendre un abonnement `forgeron` sans que rien
    // ne proteste, ni au typage ni à l'exécution.
    for (const t of PRICING_TIERS) {
      if (!t.plan) continue
      expect(TIER_BY_PLAN[t.plan], `${t.name} vend un autre palier que le sien`)
        .toBe(t.name.toLowerCase())
    }
  })

  it("tient la promesse « 2 mois offerts » sur TOUS les paliers payants", () => {
    const paid = PRICING_TIERS.filter(t => t.monthly > 0)
    expect(paid.length).toBeGreaterThan(0)
    paid.forEach(t => {
      expect(
        freeMonthsOnAnnual(t),
        `l'annuel de ${t.name} (${t.annual}€) ne vaut pas ${FREE_MONTHS_ON_ANNUAL} mois offerts ` +
        `sur ${t.monthly}€/mois — corriger le prix OU le libellé \`annualPerk\` du dictionnaire`,
      ).toBe(FREE_MONTHS_ON_ANNUAL)
    })
    // Le gratuit n'a pas de remise à offrir.
    expect(freeMonthsOnAnnual(PRICING_TIERS[0])).toBeNull()
  })

  it('annonce ce nombre de mois dans les DEUX langues', () => {
    expect(landingFr.pricing.annualPerk).toContain(String(FREE_MONTHS_ON_ANNUAL))
    expect(landingEn.pricing.annualPerk).toContain(String(FREE_MONTHS_ON_ANNUAL))
    // Le badge ne doit plus annoncer de pourcentage : la remise réelle vaut 16,67 %,
    // qu'aucun arrondi n'exprime honnêtement — d'où le passage aux mois offerts.
    expect(landingFr.pricing.annualPerk).not.toContain('%')
    expect(landingEn.pricing.annualPerk).not.toContain('%')
  })
})

/**
 * 🔴 La grille ne doit JAMAIS promettre une autre offre IA que celle du serveur.
 *
 * Jusqu'au 2026-09-11, elle annonçait « Analyses IA illimitées (Opus) » pour
 * Maître quand le serveur appliquait 135 crédits/semaine sur Sonnet : pratique
 * commerciale trompeuse, sur une vente ouverte. Décision HORTAL : la réalité
 * serveur fait foi. Ce test relit `TIER_CONFIG` dans les DEUX Edge Functions
 * (le pot de crédits est commun) : changer un budget ou un modèle côté serveur
 * sans corriger la grille — ou l'inverse — le fait échouer.
 */
describe('grille tarifaire ↔ budgets IA réellement appliqués', () => {
  const MODEL_LABEL: Record<string, string> = { HAIKU: 'Haiku', SONNET: 'Sonnet' }
  const DB_TIER = ['apprenti', 'forgeron', 'maître']

  function tierConfig(ef: string): Record<string, { credits: number; model: string }> {
    const src = readFileSync(path.resolve(__dirname, `../../supabase/functions/${ef}/index.ts`), 'utf8')
    const out: Record<string, { credits: number; model: string }> = {}
    for (const m of src.matchAll(/'([^']+)':\s*\{\s*credits:\s*(\d+),\s*model:\s*([A-Z_]+)\s*\}/g)) {
      out[m[1]] = { credits: Number(m[2]), model: MODEL_LABEL[m[3]] ?? m[3] }
    }
    return out
  }

  const matchup = tierConfig('matchup-analyze')
  const postgame = tierConfig('postgame-analyze')

  it('les deux Edge Functions appliquent le même barème (pot commun)', () => {
    for (const t of DB_TIER) {
      expect(matchup[t], `TIER_CONFIG['${t}'] introuvable dans matchup-analyze`).toBeDefined()
      expect(postgame[t], `divergence matchup/postgame sur ${t}`).toEqual(matchup[t])
    }
  })

  it.each(DB_TIER.map((t, i) => [t, i] as const))(
    '%s — la ligne IA de la grille dit exactement le budget et le modèle du serveur (FR et EN)',
    (tier, i) => {
      const { credits, model } = matchup[tier]
      const fr = landingFr.pricing.tiers[i].features.filter(f => /\bIA\b/.test(f))
      const en = landingEn.pricing.tiers[i].features.filter(f => /\bAI\b/.test(f))
      expect(fr).toEqual([`${credits} crédits IA / semaine (${model})`])
      expect(en).toEqual([`${credits} AI credits / week (${model})`])
    },
  )

  it('aucune promesse IA « illimitée » ni « Opus » nulle part dans la vitrine', () => {
    for (const d of [landingFr, landingEn]) {
      const all = JSON.stringify(d)
      expect(all).not.toMatch(/Opus/)
      // Sensible à la casse exprès : « IA » / « AI » en capitales = l'IA, et pas
      // les lettres « ai » d'un mot quelconque (« maître », « paths »…).
      expect(all).not.toMatch(
        /\b(IA|AI)\b[^"]{0,30}([Ii]llimit|[Uu]nlimited)|([Ii]llimit|[Uu]nlimited)[^"]{0,30}\b(IA|AI)\b/,
      )
    }
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
    // Montants réellement affichés par Pricing.tsx : le prix annuel est un entier
    // (30 € / 60 €), le « /mois » du mode annuel ne l'est pas (30 / 12 = 2,50 €).
    expect(formatPrice(30, 'fr')).toBe('30€')
    expect(formatPrice(2.5, 'fr')).toBe('2,50€')
    expect(formatPrice(60, 'en')).toBe('€60')
    expect(formatPrice(5, 'en')).toBe('€5')
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
