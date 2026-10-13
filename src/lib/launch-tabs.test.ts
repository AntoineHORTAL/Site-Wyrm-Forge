import { describe, it, expect } from 'vitest'
import { isAdminOnlyEntry, isLaunchTabVisible } from '@/lib/launch-tabs'

/**
 * Entrées de navigation gardées par un flag de LANCEMENT (Écailles, Scénarios, Kit).
 * Règle unique des deux barres : la barre latérale (Dashboard) et le tiroir mobile
 * (Nav) — le tiroir ne filtrait que les Écailles et laissait voir Kit et Scénarios à
 * tout compte connecté.
 */
const fermes = { ecaillesEnabled: false, scenariosEnabled: false, kitEnabled: false }
const lances = { ecaillesEnabled: true, scenariosEnabled: true, kitEnabled: true }

describe('visibilité des entrées gardées par un flag de lancement', () => {
  it.each(['ecailles', 'scenarios', 'kit'])('%s : invisible pour un compte non admin tant que fermé', id => {
    expect(isLaunchTabVisible(id, fermes, false)).toBe(false)
    expect(isLaunchTabVisible(id, lances, false)).toBe(true)
  })

  it.each(['ecailles', 'scenarios', 'kit'])('%s : visible pour un admin, marquée « Non lancé · admin »', id => {
    expect(isLaunchTabVisible(id, fermes, true)).toBe(true)
    expect(isAdminOnlyEntry(id, fermes)).toBe(true)
    expect(isAdminOnlyEntry(id, lances)).toBe(false)
  })

  it('les autres onglets ne dépendent d\'aucun de ces flags', () => {
    expect(isLaunchTabVisible('matchup', fermes, false)).toBe(true)
    expect(isAdminOnlyEntry('matchup', fermes)).toBe(false)
  })

  it('chaque flag ne garde que son onglet', () => {
    const kitSeul = { ...fermes, kitEnabled: true }
    expect(isLaunchTabVisible('kit', kitSeul, false)).toBe(true)
    expect(isLaunchTabVisible('scenarios', kitSeul, false)).toBe(false)
  })
})
