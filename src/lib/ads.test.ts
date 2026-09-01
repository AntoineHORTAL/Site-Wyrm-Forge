import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { shouldShowAds, hasAdConsent, AD_FORMATS, AD_BREAKPOINTS } from './ads'

describe('verrou commercial — qui voit des publicités', () => {
  it('le palier gratuit voit les pubs', () => {
    expect(shouldShowAds('apprenti')).toBe(true)
  })

  it('AUCUN palier payant ne voit de pub', () => {
    // Valeurs de `profiles.tier` (cf. TIER_ORDER dans `lib/subscription.ts`,
    // source unique). La liste inclut À DESSEIN des valeurs hors offre :
    // `architecte`/`architecte+` sont des paliers RETIRÉS (migration
    // 20260901000004), « monarque » n'a jamais existé en base. Toutes doivent
    // rester non-publicitaires : la règle ne dépend pas du nommage des paliers.
    for (const tier of ['forgeron', 'maître', 'légion', 'architecte', 'architecte+', 'monarque']) {
      expect(shouldShowAds(tier), `${tier} ne doit jamais voir de pub`).toBe(false)
    }
  })

  it('un palier INCONNU ne voit pas de pub', () => {
    // Le défaut penche du côté qui ne dégrade pas un abonné : un palier ajouté
    // demain n'affiche pas de pub tant que personne ne l'a décidé.
    expect(shouldShowAds('palier-du-futur')).toBe(false)
    expect(shouldShowAds('')).toBe(false)
    expect(shouldShowAds(null)).toBe(false)
    expect(shouldShowAds(undefined)).toBe(false)
  })

  it('tolère la casse et les espaces', () => {
    // `page.tsx` utilise un repli `'Apprenti'` avec une majuscule pour
    // l'affichage du badge ; la base, elle, stocke en minuscules.
    expect(shouldShowAds('Apprenti')).toBe(true)
    expect(shouldShowAds('  APPRENTI ')).toBe(true)
  })

  it('un admin ne voit jamais de pub, même avec un tier gratuit en base', () => {
    // Cohérent avec `effectiveTier` dans page.tsx, qui pose le marqueur 'admin'
    // à l'affichage pour les admins quelle que soit la valeur en base.
    expect(shouldShowAds('apprenti', true)).toBe(false)
  })
})

describe('verrou légal — consentement RGPD', () => {
  it('refuse le chargement tant qu’aucune CMP n’existe', () => {
    // Ce test est un GARDE-FOU, pas une description : il doit être mis à jour
    // en même temps que la CMP, et sa présence force ce changement à être
    // conscient plutôt que subi.
    expect(hasAdConsent()).toBe(false)
  })
})

describe('formats et seuils', () => {
  it('les deux formats du collant font 600 px de haut', () => {
    // Invariant anti-CLS : la bascule de format à 1440 px ne doit jamais
    // changer la hauteur réservée dans la grille. Ne concerne QUE les deux
    // formats servis dans `.dash-adrail-inner` ; `rectangle-300` vit sous le
    // collant, dans le flux normal, et n'entre pas dans cette bascule.
    expect(AD_FORMATS['skyscraper-160'].height).toBe(600)
    expect(AD_FORMATS['halfpage-300'].height).toBe(600)
  })

  it("l'encart maison a exactement le format du slot qu'il surplombe", () => {
    // HouseAdSlot lit `rectangle-300` au lieu de coder ses dimensions en dur :
    // les deux blocs de la queue doivent rester de la même taille, sinon la
    // colonne devient bancale dès que le format bouge.
    const src = readFileSync(path.resolve(__dirname, '../components/ads/HouseAdSlot.tsx'), 'utf8')
    expect(src).toContain("AD_FORMATS['rectangle-300']")
    expect(src).not.toMatch(/height:s*250/)
  })

  it('le second emplacement est un medium rectangle IAB 300×250', () => {
    // Format standard : toutes les régies savent le servir, ce qui garde le
    // choix du fournisseur ouvert — même raison que pour les deux autres.
    expect(AD_FORMATS['rectangle-300']).toEqual({ width: 300, height: 250 })
  })

  it('le second emplacement tient dans la piste, donc jamais sous 1440 px', () => {
    // La piste ne fait 300 px de large qu'à partir de `widenAt` ; en dessous
    // elle est à 160 px et ne peut pas accueillir une créa de 300. C'est ce qui
    // justifie le `display: none` de `.dash-adrail-tail` hors de ce seuil.
    expect(AD_FORMATS['rectangle-300'].width)
      .toBeGreaterThan(AD_FORMATS['skyscraper-160'].width)
    expect(AD_FORMATS['rectangle-300'].width)
      .toBe(AD_FORMATS['halfpage-300'].width)
  })

  it('la pile complète ne peut PAS être collante sur un viewport courant', () => {
    // Ce test fige la décision documentée dans `DashboardAdRail.tsx` : hauteur
    // requise = offset du collant + 600 + gouttière + 250. Tant qu'elle dépasse
    // la hauteur utile d'un 1080p maximisé, le 300×250 doit rester dans le flux
    // normal. Si un jour les formats changent au point que la pile tienne, ce
    // test échoue et force à reconsidérer le choix plutôt qu'à le subir.
    const OFFSET_COLLANT = 97   // `top` de .dash-adrail-inner (73 de nav + 24)
    const GOUTTIERE = 24        // `margin-top` de .dash-adrail-tail
    const requis = OFFSET_COLLANT
      + AD_FORMATS['halfpage-300'].height + GOUTTIERE + AD_FORMATS['rectangle-300'].height

    // Zone utile d'un 1920×1080 maximisé : 1080 − 40 (barre des tâches)
    // − ~87 (chrome du navigateur) ≈ 953 px. C'est le cas le plus favorable
    // parmi les résolutions courantes, et il ne suffit déjà pas.
    expect(requis).toBeGreaterThan(953)
  })

  it('les seuils respectent le plancher de 768 px de contenu', () => {
    // contenu = V − 240 (sidebar) − 80 (padding .dash-main) − L − 40 (gouttière)
    const contenu = (viewport: number, largeurPub: number) =>
      viewport - 240 - 80 - largeurPub - 40

    // Au seuil haut, le 300×600 laisse le contenu au-dessus du plancher.
    expect(contenu(AD_BREAKPOINTS.widenAt, AD_FORMATS['halfpage-300'].width))
      .toBeGreaterThanOrEqual(768)

    // Au seuil bas, le 160×600 reste dans la tolérance annoncée (760 px, soit
    // 312 px pour la colonne centrale de `.dash-grid-jungle` qui fige 448 px).
    const auSeuilBas = contenu(AD_BREAKPOINTS.hideBelow, AD_FORMATS['skyscraper-160'].width)
    expect(auSeuilBas).toBeGreaterThanOrEqual(760)
    expect(auSeuilBas - 448).toBeGreaterThanOrEqual(300)
  })

  it('globals.css n’a pas divergé des constantes TS', () => {
    // Les largeurs vivent forcément aux deux endroits : le CSS doit réserver
    // l'espace avant tout rendu React (anti-CLS), et le TS doit connaître le
    // format pour le passer à la régie. Ce test est ce qui empêche les deux
    // copies de se désynchroniser en silence.
    const css = readFileSync(path.resolve(__dirname, '../app/globals.css'), 'utf8')

    expect(css).toContain(`@media (min-width: ${AD_BREAKPOINTS.hideBelow}px)`)
    expect(css).toContain(`@media (min-width: ${AD_BREAKPOINTS.widenAt}px)`)
    expect(css).toContain(`--ad-slot-w: ${AD_FORMATS['skyscraper-160'].width}px`)
    expect(css).toContain(`--ad-slot-w: ${AD_FORMATS['halfpage-300'].width}px`)

    // Anti-CLS du second emplacement : les 600 px du collant et les 250 px du
    // rectangle doivent être réservés par le CSS, pas par React. Si ces règles
    // disparaissent, l'espace n'est plus pris avant la première peinture.
    expect(css).toContain(`min-height: ${AD_FORMATS['halfpage-300'].height}px`)
    expect(css).toContain('.dash-adrail-tail')

    // `.dash-adrail-tail` est masquée par défaut et n'est démasquée qu'au seuil
    // haut : c'est la seule largeur de piste (300 px) qui accepte le format.
    expect(css).toContain('.dash-adrail-tail  { display: none;')
    const seuilHaut = css.slice(css.indexOf(`@media (min-width: ${AD_BREAKPOINTS.widenAt}px)`))
    expect(seuilHaut).toMatch(/.dash-adrail-tail { display: flex;[^}]*gap: 24px/)

    // Piste de grille = largeur de la pub + 40 px de gouttière droite.
    expect(css).toContain(`240px 1fr ${AD_FORMATS['skyscraper-160'].width + 40}px`)
    expect(css).toContain(`240px 1fr ${AD_FORMATS['halfpage-300'].width + 40}px`)
  })

  it('la colonne pub est bien exclue de l’impression', () => {
    // Règle préexistante dans globals.css : tout enfant direct de .dash-layout
    // qui n'est pas .dash-main disparaît à l'impression. La colonne pub en
    // hérite gratuitement — à condition de rester un enfant DIRECT.
    const css = readFileSync(path.resolve(__dirname, '../app/globals.css'), 'utf8')
    expect(css).toContain('.dash-layout > :not(.dash-main)')
  })
})
