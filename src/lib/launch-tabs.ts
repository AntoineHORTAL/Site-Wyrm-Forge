/**
 * Entrées de navigation gardées par un flag de LANCEMENT (Écailles, Scénarios, Kit).
 * Module PUR, partagé par la barre latérale (Dashboard.tsx) et le tiroir mobile
 * (Nav.tsx) : une seule règle pour les deux barres, testable sans client Supabase.
 */

export interface LaunchTabFlags { ecaillesEnabled: boolean; scenariosEnabled: boolean; kitEnabled: boolean }

/**
 * L'entrée `tabId` figure-t-elle dans la navigation ? Règle UNIQUE des deux barres —
 * barre latérale (desktop) et tiroir (mobile, `Nav.tsx`) : le tiroir ne filtrait que
 * les Écailles, et laissait voir Kit et Scénarios à tout compte connecté.
 */
export function isLaunchTabVisible(tabId: string, flags: LaunchTabFlags, isAdmin: boolean): boolean {
  return isAdmin || !isAdminOnlyEntry(tabId, flags)
}

/**
 * L'entrée `tabId` n'est-elle dans la navigation QUE grâce au passe-droit admin ?
 * Vrai pour un onglet gardé par un flag de LANCEMENT encore fermé (convention
 * `'hidden'` : invisible pour tout autre compte). L'appelant ne l'utilise que pour
 * les entrées déjà retenues par `isLaunchTabVisible` — un non-admin ne les voit
 * donc jamais, et un admin sait ce que le public ne voit pas encore.
 */
export function isAdminOnlyEntry(
  tabId: string,
  flags: LaunchTabFlags,
): boolean {
  return (tabId === 'ecailles'  && !flags.ecaillesEnabled)
      || (tabId === 'scenarios' && !flags.scenariosEnabled)
      || (tabId === 'kit'       && !flags.kitEnabled)
}
