// ════════════════════════════════════════════════════════════════════════════
//  lang-param — la langue demandée par l'URL (`?lang=en`)
// ════════════════════════════════════════════════════════════════════════════
// POURQUOI CE PARAMÈTRE EXISTE, ET POUR UN SEUL CAS.
//
// Les e-mails transactionnels d'abonnement sont bilingues (leur langue vient de
// `checkout_consent_log.locale`). Leurs liens, eux, pointaient vers `/cgv` et
// `/profil` tout court : le destinataire d'un e-mail ANGLAIS qui les ouvrait
// depuis son application mail sur mobile tombait sur la version FRANÇAISE, parce
// que ce navigateur-là n'a jamais eu l'occasion d'écrire `wf-lang` — la langue
// du site vit dans le `localStorage`, qui ne franchit ni l'e-mail ni l'appareil.
//
// Le paramètre ne sert QUE À ÇA. Les liens du site n'en portent pas et n'ont
// aucune raison d'en porter : la navigation normale suit l'état du provider et
// la préférence stockée, exactement comme avant. Ce n'est pas un routage i18n
// par URL — il n'y a toujours qu'une seule URL par page.
//
// Module PUR (aucun import React, aucun accès à `window`) : c'est ici que vit la
// règle de priorité, donc c'est ici qu'elle se teste, sans jsdom — que le repo
// n'installe pas. `LanguageProvider` ne fait que lui passer
// `window.location.search` et la valeur lue dans le stockage.
//
// Aucun import `@/…` : même convention que `src/lib/intl.ts` et
// `src/lib/live-game.ts`. Le seul import est un type, effacé à la compilation.

import type { Lang } from '../locales/landing'

/**
 * Nom du paramètre. ⚠️ Il est écrit AUSSI côté e-mails, dans
 * `supabase/functions/_shared/subscription-emails.ts` — module partagé avec
 * l'Edge Function Deno, qui ne peut pas importer `src/`. Les deux côtés sont
 * verrouillés ensemble par `subscription-emails-worker.test.ts`, qui compare le
 * lien rendu à cette constante.
 */
export const LANG_PARAM = 'lang'

/** Valeur reconnue comme une langue du site, sinon `null`. */
function asLang(value: string | null | undefined): Lang | null {
  const v = value?.trim().toLowerCase()
  return v === 'fr' || v === 'en' ? v : null
}

/**
 * Langue demandée par la query string, ou `null`.
 *
 * Volontairement STRICT : `fr` ou `en`, rien d'autre. Contrairement à la locale
 * des e-mails (qui vient de la base et peut porter une étiquette régionale),
 * cette valeur est produite par nos propres liens — une valeur inattendue vient
 * donc d'ailleurs, et le repli sur la préférence habituelle est le bon réflexe.
 */
export function langFromSearch(search: string): Lang | null {
  if (!search) return null
  try {
    return asLang(new URLSearchParams(search).get(LANG_PARAM))
  } catch {
    // Query string illisible (encodage cassé) : on ignore, le site reste dans
    // la langue habituelle du visiteur.
    return null
  }
}

export interface InitialLang {
  lang: Lang
  /** `'url'` = demandée par un lien (e-mail) ; `'storage'` = préférence du visiteur. */
  source: 'url' | 'storage'
}

/**
 * Langue à appliquer au premier rendu client, et d'où elle vient.
 *
 * Priorité : **URL > préférence stockée**, et `null` quand on ne sait rien —
 * auquel cas l'appelant ne touche à rien et le site reste en français, comme
 * avant l'existence de ce paramètre.
 *
 * L'URL l'emporte parce qu'elle est le signal le plus RÉCENT et le plus
 * EXPLICITE : quelqu'un qui clique le lien d'un e-mail anglais veut lire la page
 * en anglais, même si ce navigateur avait gardé « fr » d'une visite précédente.
 */
export function resolveInitialLang(search: string, stored: string | null): InitialLang | null {
  const fromUrl = langFromSearch(search)
  if (fromUrl) return { lang: fromUrl, source: 'url' }

  const fromStorage = asLang(stored)
  if (fromStorage) return { lang: fromStorage, source: 'storage' }

  return null
}

/**
 * Ajoute la langue à une URL DU SITE.
 *
 * Réservé aux liens SORTANTS (e-mails) ; le site ne s'en sert pas pour ses
 * propres liens. Exporté surtout pour que les tests disposent de la même
 * construction que celle appliquée aux e-mails.
 */
export function withLangParam(url: string, lang: Lang): string {
  return `${url}${url.includes('?') ? '&' : '?'}${LANG_PARAM}=${lang}`
}
