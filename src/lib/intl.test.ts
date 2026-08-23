import { describe, it, expect } from 'vitest'
import { intlLocale, formatNumber, formatDate, formatTime, formatDateTime } from './intl'

/**
 * Ces tests verrouillent ce qui CHANGE entre les deux langues, pas le rendu exact
 * d'`Intl` : le détail des libellés de mois dépend des données ICU embarquées dans le
 * moteur, et les figer rendrait la suite fragile d'une version de Node à l'autre.
 *
 * Ce qui est vérifié : la locale choisie, le fait que les deux langues produisent bien
 * des sorties DIFFÉRENTES là où c'est visible, et les séparateurs de milliers — le
 * format le plus présent à l'écran (or du Builder, soldes d'Écailles).
 */
describe('intlLocale', () => {
  it('mappe les deux langues du site sur une locale Intl', () => {
    expect(intlLocale('fr')).toBe('fr-FR')
    expect(intlLocale('en')).toBe('en-GB')
  })

  it('choisit en-GB, comme formatPrice sur la vitrine', () => {
    // Deux locales anglaises différentes sur le même site donneraient des dates
    // incohérentes entre la vitrine et le dashboard.
    expect(intlLocale('en')).not.toBe('en-US')
  })
})

describe('formatNumber', () => {
  it('sépare les milliers selon la langue', () => {
    // FR : espace insécable (U+202F ou U+00A0 selon ICU) ; EN : virgule.
    expect(formatNumber(1234, 'en')).toBe('1,234')
    expect(formatNumber(1234, 'fr')).not.toBe('1,234')
    expect(formatNumber(1234, 'fr')).toMatch(/^1[\s  ]234$/)
  })

  it('laisse les petits nombres identiques dans les deux langues', () => {
    expect(formatNumber(950, 'fr')).toBe('950')
    expect(formatNumber(950, 'en')).toBe('950')
  })

  it('transmet les options Intl', () => {
    expect(formatNumber(0.5, 'en', { minimumFractionDigits: 2 })).toBe('0.50')
    expect(formatNumber(0.5, 'fr', { minimumFractionDigits: 2 })).toBe('0,50')
  })
})

describe('formatDate / formatTime / formatDateTime', () => {
  // Date fixe : 14 janvier 2026, 09:05 UTC.
  const ISO = '2026-01-14T09:05:00.000Z'

  it('produit des libellés de mois différents selon la langue', () => {
    const opts = { day: 'numeric', month: 'long', year: 'numeric' } as const
    expect(formatDate(ISO, 'fr', opts)).toContain('janvier')
    expect(formatDate(ISO, 'en', opts)).toContain('January')
  })

  it('accepte un Date, un timestamp ou une chaîne ISO', () => {
    const attendu = formatDate(ISO, 'en')
    expect(formatDate(new Date(ISO), 'en')).toBe(attendu)
    expect(formatDate(new Date(ISO).getTime(), 'en')).toBe(attendu)
  })

  it('garde l\'ordre jour/mois en anglais — c\'est le point du choix en-GB', () => {
    // `en-US` donnerait « 1/14/2026 » : le jour et le mois seraient inversés par
    // rapport au français, ce qui déplace la mise en page des listes de matchs.
    const en = formatDate(ISO, 'en', { day: '2-digit', month: '2-digit', year: 'numeric' })
    expect(en.startsWith('14')).toBe(true)
  })

  it('formate l\'heure sur 24 h dans les deux langues', () => {
    const opts = { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' } as const
    expect(formatTime(ISO, 'fr', opts)).toBe('09:05')
    expect(formatTime(ISO, 'en', opts)).toBe('09:05')
  })

  it('compose date et heure en un seul appel', () => {
    const opts = { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' } as const
    expect(formatDateTime(ISO, 'en', opts)).toContain('09:05')
    expect(formatDateTime(ISO, 'en', opts)).toContain('14')
  })

  it('ne jette pas sur une date invalide', () => {
    // Une donnée serveur absente ou malformée ne doit pas faire tomber la page :
    // `Intl` renvoie « Invalid Date », ce qui est laid mais visible et non fatal.
    expect(() => formatDate('pas une date', 'fr')).not.toThrow()
  })
})
