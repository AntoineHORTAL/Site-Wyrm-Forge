/**
 * Fond de carte de la Faille de l'invocateur — SOURCE UNIQUE du site.
 *
 * Lu par l'éditeur Jungle Path, les Scénarios et la carte des événements de la page
 * de match. Avant, chacun recopiait son URL et ses replis : trois copies, dont un
 * second repli DDragon sans version qui répondait 403.
 *
 * ⚠️ Le CADRAGE de cette image est le repère de tout ce qui est posé dessus : tracés
 * des Scénarios (pourcentages, partagés avec l'app — `ScenarioService.MapImageUrl`),
 * points de la page de match (coordonnées de jeu / `RIFT_SIZE`). Les versions DDragon
 * 14.24.1 et 16.20.1 ont exactement le même cadrage (bases, coins, contour) ; seuls
 * les murs de jungle changent. Monter la version = comparer d'abord les deux images.
 */

/** Image servie par le site (`public/`) : DDragon `map11` 16.20.1, 512×512. */
export const RIFT_MAP_LOCAL = '/icons/maps/summoners_rift.png'

/**
 * Version DDragon du repli — FIGÉE, comme celle de l'app (éditeur Jungle Path et
 * Scénarios). La « dernière version » changerait de dessin sans prévenir.
 */
export const RIFT_MAP_DDRAGON_VERSION = '16.20.1'

/** Repli si l'image locale ne charge pas. Un seul : il n'y a rien de sûr après. */
export const RIFT_MAP_FALLBACK =
  `https://ddragon.leagueoflegends.com/cdn/${RIFT_MAP_DDRAGON_VERSION}/img/map/map11.png`

/**
 * À brancher sur `onError` : bascule une fois de l'image locale vers DDragon. Si le
 * repli échoue à son tour, on s'arrête (pas de boucle d'erreurs).
 */
export function applyRiftMapFallback(img: HTMLImageElement): void {
  if (img.src.endsWith(RIFT_MAP_LOCAL)) img.src = RIFT_MAP_FALLBACK
}
