import { describe, it, expect } from 'vitest'
import { isAdminOnlyEntry, isLaunchTabVisible, resolveDashTab, LAUNCH_FALLBACK_TAB } from '@/lib/launch-tabs'

/**
 * Entrées de navigation gardées par un flag de LANCEMENT (Écailles, Scénarios, Kit,
 * éditeur Jungle Path du site). Règle unique des deux barres — la barre latérale
 * (Dashboard) et le tiroir mobile (Nav) : le tiroir ne filtrait que les Écailles et
 * laissait voir Kit et Scénarios à tout compte connecté — et du routeur d'onglets.
 */
const fermes = { ecaillesEnabled: false, scenariosEnabled: false, kitEnabled: false, jungleEnabled: false }
const lances = { ecaillesEnabled: true, scenariosEnabled: true, kitEnabled: true, jungleEnabled: true }
const GARDES = ['ecailles', 'scenarios', 'kit', 'jungle']

describe('visibilité des entrées gardées par un flag de lancement', () => {
  it.each(GARDES)('%s : invisible pour un compte non admin tant que fermé', id => {
    expect(isLaunchTabVisible(id, fermes, false)).toBe(false)
    expect(isLaunchTabVisible(id, lances, false)).toBe(true)
  })

  it.each(GARDES)('%s : visible pour un admin, marquée « Non lancé · admin »', id => {
    expect(isLaunchTabVisible(id, fermes, true)).toBe(true)
    expect(isAdminOnlyEntry(id, fermes)).toBe(true)
    expect(isAdminOnlyEntry(id, lances)).toBe(false)
  })

  it('les autres onglets ne dépendent d\'aucun de ces flags', () => {
    expect(isLaunchTabVisible('matchup', fermes, false)).toBe(true)
    expect(isAdminOnlyEntry('matchup', fermes)).toBe(false)
    // Le Workshop Jungle (consultation des parcours partagés) est une feature
    // livrée, à ne pas confondre avec l'éditeur Jungle Path du site.
    expect(isLaunchTabVisible('workshop-jungle', fermes, false)).toBe(true)
  })

  it('chaque flag ne garde que son onglet', () => {
    const kitSeul = { ...fermes, kitEnabled: true }
    expect(isLaunchTabVisible('kit', kitSeul, false)).toBe(true)
    expect(isLaunchTabVisible('scenarios', kitSeul, false)).toBe(false)
    // Ouvrir les Scénarios n'ouvre pas l'éditeur Jungle Path, et inversement.
    const scenariosSeuls = { ...fermes, scenariosEnabled: true }
    expect(isLaunchTabVisible('scenarios', scenariosSeuls, false)).toBe(true)
    expect(isLaunchTabVisible('jungle', scenariosSeuls, false)).toBe(false)
    const jungleSeul = { ...fermes, jungleEnabled: true }
    expect(isLaunchTabVisible('jungle', jungleSeul, false)).toBe(true)
    expect(isLaunchTabVisible('scenarios', jungleSeul, false)).toBe(false)
  })
})

describe('URL directe (`?tab=`) vers un onglet de lancement fermé', () => {
  it.each(GARDES)('%s : un non-admin est rendu sur l\'Accueil, jamais sur un écran « bientôt »', id => {
    expect(resolveDashTab(id, fermes, false)).toBe(LAUNCH_FALLBACK_TAB)
    expect(LAUNCH_FALLBACK_TAB).toBe('accueil')
  })

  it.each(GARDES)('%s : ouvert, ou admin, l\'onglet demandé est rendu', id => {
    expect(resolveDashTab(id, lances, false)).toBe(id)
    expect(resolveDashTab(id, fermes, true)).toBe(id)
  })

  it('un onglet sans flag de lancement est toujours rendu tel quel', () => {
    for (const id of ['accueil', 'todo', 'builds', 'matchup', 'workshop-jungle', 'admin']) {
      expect(resolveDashTab(id, fermes, false)).toBe(id)
    }
  })
})
