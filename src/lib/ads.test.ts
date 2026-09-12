import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import {
  shouldShowAds, shouldShowPublicAds, hasAdConsent, adConsentState, setAdConsent,
  onAdConsentChange, consentFromTcf, TCF_PURPOSE_STORAGE, TCF_VENDOR_GOOGLE,
  AD_FORMATS, AD_BREAKPOINTS,
} from './ads'

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

describe('🔴 verrou commercial sur une page PUBLIQUE', () => {
  // `shouldShowAds` refuse un palier inconnu, et c'est le bon défaut DANS le
  // dashboard : un profil non chargé appartient forcément à quelqu'un. Sur
  // /champions et /patch-notes, la majorité des visiteurs n'ont pas de compte —
  // appliquer la même règle n'y afficherait JAMAIS le moindre emplacement.
  const anonyme  = { loading: false, signedIn: false, tier: null }
  const gratuit  = { loading: false, signedIn: true,  tier: 'apprenti' }
  const abonne   = { loading: false, signedIn: true,  tier: 'forgeron' }

  it('un visiteur anonyme voit les emplacements — il est sur l’offre gratuite', () => {
    expect(shouldShowPublicAds(anonyme)).toBe(true)
    // La différence avec le dashboard tient ici, et nulle part ailleurs.
    expect(shouldShowAds(null)).toBe(false)
  })

  it('un abonné payant n’en voit aucun, connecté sur une page publique', () => {
    expect(shouldShowPublicAds(abonne)).toBe(false)
    for (const tier of ['forgeron', 'maître', 'légion', 'monarque']) {
      expect(shouldShowPublicAds({ loading: false, signedIn: true, tier }), tier).toBe(false)
    }
  })

  it('un connecté au palier gratuit en voit', () => {
    expect(shouldShowPublicAds(gratuit)).toBe(true)
  })

  it('un admin n’en voit jamais, connecté ou non résolu', () => {
    expect(shouldShowPublicAds({ ...gratuit, isAdmin: true })).toBe(false)
  })

  it('🔴 RIEN tant que la session n’est pas résolue', () => {
    // Réserver 250 px de hauteur pour les retirer une seconde plus tard, c'est
    // provoquer le décalage de contenu (CLS) qu'`AdSlot` existe pour éviter —
    // et montrer brièvement un emplacement à quelqu'un qui paie pour ne pas en
    // avoir.
    expect(shouldShowPublicAds({ loading: true, signedIn: false, tier: null })).toBe(false)
    expect(shouldShowPublicAds({ loading: true, signedIn: true, tier: 'apprenti' })).toBe(false)
    expect(shouldShowPublicAds({ loading: true, signedIn: true, tier: 'forgeron' })).toBe(false)
  })

  it('ne contourne PAS le verrou légal', () => {
    // Les deux verrous sont indépendants : celui-ci n'ouvre qu'un droit
    // commercial. Tant qu'aucune CMP n'existe, `AdSlot` ne charge rien.
    expect(shouldShowPublicAds(anonyme)).toBe(true)
    expect(hasAdConsent()).toBe(false)
  })
})

describe('verrou légal — consentement RGPD', () => {
  it('reste fermé tant que personne n’a accepté', () => {
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

/* ════════════════════════════════════════════════════════════════════════════
   🔴 VERROU LÉGAL — le consentement, dans les deux sens
   ════════════════════════════════════════════════════════════════════════════
   `hasAdConsent()` renvoyait `false` en dur jusqu'à l'arrivée de la CMP. Elle
   lit désormais un état alimenté par la Google CMP via le signal TCF. Deux
   choses doivent être vraies, et une seule des deux suffirait à faire un site
   non conforme :

     • REFUSÉ (ou pas encore répondu) ⇒ `false`, donc aucune requête tierce :
       ni `AdSlot` ni `AdSenseScript` ne chargent quoi que ce soit ;
     • ACCEPTÉ ⇒ `true`, et les abonnés en sont PRÉVENUS — sans quoi il faudrait
       recharger la page pour voir la moindre publicité. */

describe('🔴 état du consentement — fermé par défaut', () => {
  beforeEach(() => { setAdConsent('unknown') })

  it('démarre à « unknown », et « unknown » n’est pas un consentement', () => {
    expect(adConsentState()).toBe('unknown')
    expect(hasAdConsent()).toBe(false)
  })

  it('distingue « pas encore répondu » de « a refusé »', () => {
    // La différence compte : l'interface ne doit pas traiter un silence comme
    // un refus enregistré, et le test doit pouvoir vérifier que le défaut est
    // fermé SANS être un refus.
    setAdConsent('denied')
    expect(adConsentState()).toBe('denied')
    expect(hasAdConsent()).toBe(false)
  })

  it('n’ouvre que sur « granted »', () => {
    setAdConsent('granted')
    expect(hasAdConsent()).toBe(true)
    setAdConsent('denied')
    expect(hasAdConsent()).toBe(false)
  })
})

describe('🔴 les abonnés sont prévenus — pas de rechargement nécessaire', () => {
  beforeEach(() => { setAdConsent('unknown') })

  it('prévient à chaque changement effectif', () => {
    const vu: boolean[] = []
    const stop = onAdConsentChange(() => vu.push(hasAdConsent()))

    setAdConsent('granted')
    setAdConsent('denied')
    stop()

    // C'est CE mécanisme qui fait apparaître les publicités au clic sur
    // « Accepter » : `useAdConsent()` s'y abonne, donc `AdSlot` et
    // `AdSenseScript` se re-rendent au lieu d'attendre un rechargement.
    expect(vu).toEqual([true, false])
  })

  it('ne prévient pas pour un état identique', () => {
    // La CMP rappelle son écouteur à chaque événement TCF, y compris quand
    // rien n'a bougé. Sans ce garde, chaque rappel re-rendrait tous les
    // emplacements de la page.
    setAdConsent('granted')
    let appels = 0
    const stop = onAdConsentChange(() => { appels++ })
    setAdConsent('granted')
    setAdConsent('granted')
    stop()
    expect(appels).toBe(0)
  })

  it('le désabonnement est effectif', () => {
    let appels = 0
    const stop = onAdConsentChange(() => { appels++ })
    stop()
    setAdConsent('granted')
    expect(appels).toBe(0)
  })
})

describe('🔴 lecture du signal TCF de la CMP', () => {
  const accepteTout = {
    eventStatus: 'useractioncomplete',
    gdprApplies: true,
    purpose: { consents: { [TCF_PURPOSE_STORAGE]: true, 3: true, 4: true } },
    vendor: { consents: { [TCF_VENDOR_GOOGLE]: true } },
  }

  it('accepté (finalité 1 + Google) ⇒ granted', () => {
    expect(consentFromTcf(accepteTout)).toBe('granted')
  })

  it('refusé ⇒ denied, jamais granted', () => {
    expect(consentFromTcf({
      eventStatus: 'useractioncomplete', gdprApplies: true,
      purpose: { consents: {} }, vendor: { consents: {} },
    })).toBe('denied')
  })

  it('la finalité 1 SEULE ne suffit pas : il faut aussi le vendeur Google', () => {
    // Sans consentement vendeur, Google n'a pas le droit de déposer : charger
    // son script reviendrait à faire une requête pour rien, en ayant l'air
    // d'avoir un accord.
    expect(consentFromTcf({
      eventStatus: 'useractioncomplete', gdprApplies: true,
      purpose: { consents: { [TCF_PURPOSE_STORAGE]: true } },
      vendor: { consents: { [TCF_VENDOR_GOOGLE]: false } },
    })).toBe('denied')
  })

  it('la personnalisation n’est PAS exigée — la finalité 1 suffit avec Google', () => {
    // Sans les finalités 3 et 4, Google sert des publicités non personnalisées :
    // c'est un affichage valable, et l'exiger priverait de revenus les visiteurs
    // qui refusent le ciblage sans refuser la publicité.
    expect(consentFromTcf({
      eventStatus: 'useractioncomplete', gdprApplies: true,
      purpose: { consents: { [TCF_PURPOSE_STORAGE]: true, 3: false, 4: false } },
      vendor: { consents: { [TCF_VENDOR_GOOGLE]: true } },
    })).toBe('granted')
  })

  it('bannière à l’écran, pas encore de réponse ⇒ unknown, pas denied', () => {
    expect(consentFromTcf({
      eventStatus: 'cmpuishown', gdprApplies: true,
      purpose: { consents: {} }, vendor: { consents: {} },
    })).toBe('unknown')
  })

  it('un choix relu au chargement suivant est honoré (`tcloaded`)', () => {
    expect(consentFromTcf({ ...accepteTout, eventStatus: 'tcloaded' })).toBe('granted')
    expect(consentFromTcf({
      eventStatus: 'tcloaded', gdprApplies: true,
      purpose: { consents: {} }, vendor: { consents: {} },
    })).toBe('denied')
  })

  it('hors champ du RGPD ⇒ granted, faute de bannière à attendre', () => {
    // La CMP n'affiche RIEN hors EEE : sans cette règle, ces visiteurs
    // resteraient bloqués en `unknown` et ne verraient jamais de publicité,
    // sans que rien ne le signale.
    expect(consentFromTcf({ gdprApplies: false })).toBe('granted')
  })

  it('signal absent ou illisible ⇒ unknown, jamais granted', () => {
    expect(consentFromTcf(null)).toBe('unknown')
    expect(consentFromTcf(undefined)).toBe('unknown')
    expect(consentFromTcf({})).toBe('unknown')
  })
})

describe('🔴 de la bannière au verrou — le trajet complet', () => {
  beforeEach(() => { setAdConsent('unknown') })

  /** Ce que fait `ConsentManager` quand la CMP rappelle son écouteur. */
  const cmpDit = (signal: Parameters<typeof consentFromTcf>[0]) =>
    setAdConsent(consentFromTcf(signal))

  it('ACCEPTÉ → hasAdConsent() passe à true et les abonnés sont prévenus', () => {
    let prevenu = false
    const stop = onAdConsentChange(() => { prevenu = true })

    cmpDit({
      eventStatus: 'useractioncomplete', gdprApplies: true,
      purpose: { consents: { [TCF_PURPOSE_STORAGE]: true } },
      vendor: { consents: { [TCF_VENDOR_GOOGLE]: true } },
    })
    stop()

    expect(hasAdConsent()).toBe(true)
    expect(prevenu).toBe(true)
  })

  it('REFUSÉ → hasAdConsent() reste false : aucune requête tierce', () => {
    cmpDit({
      eventStatus: 'useractioncomplete', gdprApplies: true,
      purpose: { consents: {} }, vendor: { consents: {} },
    })
    expect(hasAdConsent()).toBe(false)
    expect(adConsentState()).toBe('denied')
  })

  it('CHANGEMENT D’AVIS → le verrou se referme sans rechargement', () => {
    // Le parcours « Gérer les cookies » : la CMP rappelle le même écouteur avec
    // un nouveau signal, et tout ce qui est abonné suit.
    cmpDit({
      eventStatus: 'useractioncomplete', gdprApplies: true,
      purpose: { consents: { [TCF_PURPOSE_STORAGE]: true } },
      vendor: { consents: { [TCF_VENDOR_GOOGLE]: true } },
    })
    expect(hasAdConsent()).toBe(true)

    cmpDit({
      eventStatus: 'useractioncomplete', gdprApplies: true,
      purpose: { consents: {} }, vendor: { consents: {} },
    })
    expect(hasAdConsent()).toBe(false)
  })

  it('le verrou COMMERCIAL ne contourne pas le verrou légal', () => {
    // Un visiteur anonyme a DROIT à un emplacement, mais l'emplacement reste
    // vide tant que le consentement n'est pas acquis. Les deux verrous sont
    // indépendants et doivent tous deux être ouverts.
    expect(shouldShowPublicAds({ loading: false, signedIn: false, tier: null })).toBe(true)
    expect(hasAdConsent()).toBe(false)
  })
})
