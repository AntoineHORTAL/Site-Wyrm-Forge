/**
 * Onglets d'analyse IA : Match Up (`tabs/MatchUpTab.tsx`, `dashboard/matchup/*`) et
 * Post Game (`tabs/PostGameTab.tsx`).
 *
 * ⚠️ Ces deux onglets affichent des messages d'erreur DÉJÀ traduits en français
 * dans les couches réseau (`src/lib/matchup/api.ts`, `src/lib/postgame/api.ts`) :
 * mapping des codes 0/401/429/502 et des replis « solde insuffisant » /
 * `opponent_unavailable`. Ces messages font partie du périmètre — les traduire veut
 * dire rendre ces fonctions dépendantes de la langue, pas dupliquer un dico ici.
 *
 * ⏳ Rempli au Lot 5.
 */
export const analyseFr = {}

export type AnalyseDict = typeof analyseFr

export const analyseEn: AnalyseDict = {}
