// ════════════════════════════════════════════════════════════════════════════
//  intl — formatage des DONNÉES (dates, heures, nombres) dans la langue affichée
// ════════════════════════════════════════════════════════════════════════════
// Lot 8 du chantier i18n. Les lots 1 à 7 ont traduit le TEXTE ; il restait
// partout des `toLocaleString('fr-FR')` codés en dur, qui affichaient des dates
// et des nombres français au milieu d'une interface anglaise — « 1 234 » avec
// une espace insécable, « 14 janvier 2026 », « lundi 3 février ».
//
// Même patron que `formatPrice` (vitrine, `locales/landing.ts`) : la fonction
// est PURE et reçoit la langue en paramètre, elle ne lit aucun contexte React.
// Les composants récupèrent `lang` via `useLang()` (`locales/dashboard`).
//
// ⚠️ Ne PAS mettre ici les libellés qui entourent la donnée (« Membre depuis »,
// « à », « il y a ») : ils appartiennent au dictionnaire. Ce module ne produit
// que le fragment formaté par `Intl`.
//
// Aucun import `@/…` : l'alias n'est pas configuré dans vitest (même contrainte
// que `src/lib/live-game.ts` et `src/lib/matchup/payload.ts`). Le seul import
// est un type, effacé à la compilation.

import type { Lang } from '../locales/landing'

/**
 * Locale `Intl` correspondant à la langue affichée.
 *
 * `en-GB` et non `en-US`, pour deux raisons :
 *  - c'est déjà le choix de `formatPrice` sur la vitrine, et deux locales
 *    anglaises différentes sur le même site donneraient des dates incohérentes ;
 *  - l'ordre jour/mois (« 14 Jan 2026 ») reste proche du français, alors que
 *    `en-US` inverse tout (« Jan 14, 2026 ») et déplace la mise en page.
 * Les séparateurs de milliers sont identiques dans les deux (virgule).
 */
export const intlLocale = (lang: Lang): string => (lang === 'en' ? 'en-GB' : 'fr-FR')

/**
 * Nombre formaté avec le séparateur de milliers de la langue.
 *
 * « 1 234 » (espace insécable) en français, « 1,234 » en anglais. C'est le
 * format le plus visible du lot : tous les montants d'or du Builder et tous les
 * soldes d'Écailles passent par là.
 */
export const formatNumber = (n: number, lang: Lang, opts?: Intl.NumberFormatOptions): string =>
  n.toLocaleString(intlLocale(lang), opts)

/** Date seule. `opts` reprend telles quelles les options `Intl.DateTimeFormat`. */
export const formatDate = (
  value: Date | number | string, lang: Lang, opts?: Intl.DateTimeFormatOptions,
): string => new Date(value).toLocaleDateString(intlLocale(lang), opts)

/** Heure seule. */
export const formatTime = (
  value: Date | number | string, lang: Lang, opts?: Intl.DateTimeFormatOptions,
): string => new Date(value).toLocaleTimeString(intlLocale(lang), opts)

/** Date + heure dans un seul appel (`toLocaleString`). */
export const formatDateTime = (
  value: Date | number | string, lang: Lang, opts?: Intl.DateTimeFormatOptions,
): string => new Date(value).toLocaleString(intlLocale(lang), opts)
