/**
 * Captures d'écran de `/guide` — module PUR.
 *
 * La liste vient de `guide-shots.generated.json`, produit par
 * `scripts/guide-shots.mjs` (enchaîné dans `npm run dev` / `build`) à partir des
 * fichiers déposés dans `public/guide/`. Ajouter une capture ne demande donc
 * aucune modification de code : voir l'en-tête du script pour la convention.
 *
 * Texte alternatif : `shotAlts[i]` de l'entrée s'il existe, sinon la description
 * `screenshot` (suivie de « (i/n) » quand la sous-section en a plusieurs).
 */

import manifest from './guide-shots.generated.json'
import type { GuideEntryId } from './guide'
import type { GuideEntryText } from '../locales/guide'

export interface GuideShot {
  /** Chemin public, ex. `/guide/champions-1.webp`. */
  src: string
  width: number
  height: number
}

const SHOTS = manifest as Partial<Record<string, GuideShot[]>>

/** Captures d'une sous-section, dans l'ordre d'affichage. Vide = encadré « à venir ». */
export function guideShots(id: GuideEntryId): readonly GuideShot[] {
  return SHOTS[id] ?? []
}

/** Ids présents dans le manifeste — exposé pour les tests. */
export function guideShotIds(): string[] {
  return Object.keys(SHOTS)
}

/** Texte alternatif de la capture `index` (0-based) parmi `count`. */
export function guideShotAlt(
  t: Pick<GuideEntryText, 'screenshot' | 'shotAlts'>,
  index: number,
  count: number,
): string {
  const own = t.shotAlts?.[index]
  if (own) return own
  return count > 1 ? `${t.screenshot} (${index + 1}/${count})` : t.screenshot
}
