/**
 * Entrées de navigation gardées par un flag de LANCEMENT (Écailles, Scénarios, Kit,
 * éditeur Jungle Path du site).
 * Module PUR, partagé par la barre latérale (Dashboard.tsx), le tiroir mobile
 * (Nav.tsx) et le routeur d'onglets du dashboard : une seule règle pour les trois,
 * testable sans client Supabase.
 */

export interface LaunchTabFlags {
  ecaillesEnabled: boolean
  scenariosEnabled: boolean
  kitEnabled: boolean
  /** `jungle_path_web_enabled` — l'éditeur Jungle Path du SITE (table `jungle_paths`, partagée avec l'app). */
  jungleEnabled: boolean
}

/** Onglet rendu à la place d'un onglet de lancement fermé. */
export const LAUNCH_FALLBACK_TAB = 'accueil'

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
      || (tabId === 'jungle'    && !flags.jungleEnabled)
}

/**
 * Onglet que le dashboard REND pour l'onglet demandé `tabId`.
 *
 * Un onglet de lancement fermé n'est pas seulement absent de la navigation : il est
 * INACCESSIBLE, URL directe comprise (`/?tab=scenarios`, lien partagé, historique).
 * Il ne rend ni écran « bientôt » ni page vide, mais l'Accueil — exactement ce que
 * voit quelqu'un pour qui l'onglet n'existe pas. Un écran « bientôt » annonçait
 * justement la feature à qui tapait l'URL.
 *
 * Même règle que la navigation, donc même passe-droit admin (recette avant
 * lancement). L'onglet demandé n'est PAS réécrit : si le flag s'ouvre (premier
 * chargement des flags, ou bascule depuis l'AdminTab), le même `?tab=` affiche
 * l'onglet sans que la personne ait à recliquer.
 */
export function resolveDashTab<T extends string>(tabId: T, flags: LaunchTabFlags, isAdmin: boolean): T | typeof LAUNCH_FALLBACK_TAB {
  return isLaunchTabVisible(tabId, flags, isAdmin) ? tabId : LAUNCH_FALLBACK_TAB
}
