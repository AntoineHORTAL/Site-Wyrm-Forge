import { describe, it, expect } from 'vitest'
import {
  TIER_ORDER, TIER_FR, TIER_COLORS, TIER_FALLBACK_COLOR,
  tierColor, tierLabel, hasDivision, formatTier,
} from './lol-tiers'

describe('tables de rangs LoL', () => {
  it('couvrent les 10 paliers, libellés et couleurs alignés', () => {
    expect(TIER_ORDER).toHaveLength(10)
    for (const t of TIER_ORDER) {
      expect(TIER_FR[t], `libellé manquant pour ${t}`).toBeTruthy()
      expect(TIER_COLORS[t], `couleur manquante pour ${t}`).toMatch(/^#[0-9A-F]{6}$/i)
    }
  })

  it('valeurs normatives du contrat §D', () => {
    expect(TIER_FR.IRON).toBe('Fer')
    expect(TIER_FR.EMERALD).toBe('Émeraude')
    expect(TIER_FR.GRANDMASTER).toBe('Grand Maître')
    expect(TIER_COLORS.GOLD).toBe('#E4A800')
    expect(TIER_COLORS.CHALLENGER).toBe('#F4E342')
  })

  it('ne contient AUCUN tier d’abonnement Wyrm Forge', () => {
    // Garde-fou contre la confusion documentée : apprenti/forgeron/… sont un
    // concept différent, définis ailleurs. Les mélanger produirait des
    // couleurs incohérentes entre le rang LoL et le badge d'abonnement.
    for (const k of ['apprenti', 'forgeron', 'maître', 'légion', 'architecte', 'architecte+']) {
      expect(TIER_COLORS[k]).toBeUndefined()
      expect(TIER_FR[k]).toBeUndefined()
    }
  })
})

describe('tierColor / tierLabel', () => {
  it('résolvent un tier connu', () => {
    expect(tierColor('DIAMOND')).toBe('#4A90D9')
    expect(tierLabel('PLATINUM')).toBe('Platine')
  })
  it('tier inconnu → couleur neutre, libellé brut (jamais undefined)', () => {
    expect(tierColor('UNRANKED')).toBe(TIER_FALLBACK_COLOR)
    expect(tierLabel('UNRANKED')).toBe('UNRANKED')
    expect(tierColor('')).toBe(TIER_FALLBACK_COLOR)
  })
})

describe('formatTier — divisions', () => {
  it('affiche la division pour les paliers qui en ont', () => {
    expect(formatTier('GOLD', 'II')).toBe('Or II')
    expect(formatTier('IRON', 'IV')).toBe('Fer IV')
    expect(formatTier('EMERALD', 'I')).toBe('Émeraude I')
  })

  it('MASTER / GRANDMASTER / CHALLENGER : jamais de division', () => {
    // L'API renvoie bien rank:"I" pour ces paliers, mais « Maître I »
    // n'existe pas dans le jeu — l'afficher serait faux.
    expect(hasDivision('MASTER')).toBe(false)
    expect(formatTier('MASTER', 'I')).toBe('Maître')
    expect(formatTier('GRANDMASTER', 'I')).toBe('Grand Maître')
    expect(formatTier('CHALLENGER', 'I')).toBe('Challenger')
  })

  it('division absente → libellé seul', () => {
    expect(formatTier('GOLD')).toBe('Or')
    expect(formatTier('GOLD', null)).toBe('Or')
    expect(formatTier('GOLD', '')).toBe('Or')
  })
})
