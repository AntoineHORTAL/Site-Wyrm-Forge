import { describe, it, expect } from 'vitest'
import { isPaidTier, FREE_TIER, TIER_ORDER } from './subscription'
import { shouldShowAds } from './ads'

describe('isPaidTier — qui a accès aux fonctionnalités payantes', () => {
  it('le palier gratuit ne passe pas', () => {
    expect(isPaidTier('apprenti')).toBe(false)
  })

  it('TOUS les paliers payants passent, Forgeron compris', () => {
    // Forgeron est le point de la correction : l'ancien seuil était `maître`,
    // ce qui excluait un abonné payant. `architecte`/`architecte+` (retirés de
    // l'offre, migration 20260901000004) et « monarque » (jamais en base) sont
    // conservés ici À DESSEIN : ils prouvent qu'un palier hors offre garde son
    // accès payant, ce qui est exactement le comportement voulu.
    for (const tier of ['forgeron', 'maître', 'légion', 'architecte', 'architecte+', 'monarque']) {
      expect(isPaidTier(tier), `${tier} doit avoir accès`).toBe(true)
    }
  })

  it('un palier INCONNU passe — le défaut ne dégrade pas un abonné', () => {
    // Contrepartie assumée de la formulation négative : un palier ajouté demain
    // obtient l'accès sans qu'on ait à toucher au code. Le risque inverse (une
    // liste blanche qui prive un client payant en silence) est jugé pire.
    expect(isPaidTier('palier-du-futur')).toBe(true)
  })

  it('un tier absent ou vide NE passe PAS — un verrou se ferme dans le doute', () => {
    expect(isPaidTier(null)).toBe(false)
    expect(isPaidTier(undefined)).toBe(false)
    expect(isPaidTier('')).toBe(false)
  })

  it('tolère la casse et les espaces', () => {
    // La base ne contient que des minuscules, mais `page.tsx` a un repli
    // `'Apprenti'` capitalisé et la colonne n'a aucune contrainte CHECK.
    expect(isPaidTier('Apprenti')).toBe(false)
    expect(isPaidTier('  APPRENTI ')).toBe(false)
    expect(isPaidTier('Forgeron')).toBe(true)
  })

  it("n'est PAS la négation de shouldShowAds sur les cas inconnus", () => {
    // Garde-fou explicite : si quelqu'un remplace un jour isPaidTier par
    // `!shouldShowAds`, ce test tombe. Les deux défauts sont opposés, à dessein.
    expect(shouldShowAds(null)).toBe(false)
    expect(isPaidTier(null)).toBe(false)      // et NON `!shouldShowAds(null)` === true
  })
})

describe('constantes de paliers', () => {
  it('FREE_TIER est bien le premier de TIER_ORDER', () => {
    expect(TIER_ORDER[0]).toBe(FREE_TIER)
  })

  it('TIER_ORDER ne contient aucun doublon', () => {
    expect(new Set(TIER_ORDER).size).toBe(TIER_ORDER.length)
  })

  it('tout TIER_ORDER sauf le premier est payant', () => {
    for (const tier of TIER_ORDER.slice(1)) {
      expect(isPaidTier(tier), `${tier} doit être payant`).toBe(true)
    }
  })
})
