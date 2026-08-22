'use client'

import { createContext, useContext, useCallback, useEffect, useState } from 'react'
import { landingDicts, type Lang, type LandingDict } from '@/locales/landing'

/* Clé localStorage — préfixe `wf-` comme le reste des préférences du site.
   Renommée depuis `wf-landing-lang` quand la portée est passée de la vitrine à tout
   le site : le nom « landing » était devenu faux. */
const STORAGE_KEY = 'wf-lang'

/* Ancienne clé du chantier vitrine. Lue en repli pour ne pas perdre le choix des
   visiteurs déjà enregistrés, puis recopiée sous la nouvelle clé. Volontairement
   PAS supprimée (même logique que le namespace v1 des scénarios MatchUp) : un
   rollback du déploiement retrouve la préférence d'origine intacte. */
const LEGACY_STORAGE_KEY = 'wf-landing-lang'

interface LanguageCtx {
  lang: Lang
  setLang: (l: Lang) => void
  /** Dictionnaire VITRINE de la langue courante (voir src/locales/landing.ts). */
  t: LandingDict
}

/* Valeur par défaut = français : les composants de la vitrine consommés hors
   provider (cas théorique) affichent le contenu FR au lieu de planter. */
const Ctx = createContext<LanguageCtx>({ lang: 'fr', setLang: () => {}, t: landingDicts.fr })

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  // Volontairement 'fr' au premier rendu, serveur ET client : le HTML rendu par le
  // serveur et celui de l'hydratation sont donc identiques — pas de mismatch. La
  // préférence stockée n'est lue qu'APRÈS l'hydratation, dans l'effet ci-dessous
  // (lire localStorage pendant le rendu produirait exactement le bug inverse).
  const [lang, setLangState] = useState<Lang>('fr')

  useEffect(() => {
    try {
      const stored =
        window.localStorage.getItem(STORAGE_KEY) ?? window.localStorage.getItem(LEGACY_STORAGE_KEY)
      // Le setState en effet ci-dessous est ICI la solution, pas le problème : c'est ce
      // qui garantit que le premier rendu client est identique au rendu serveur. Lire
      // localStorage pendant le rendu (ce que suggère la règle) provoquerait le mismatch
      // d'hydratation qu'on cherche à éviter.
      if (stored === 'fr' || stored === 'en') {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- voir ci-dessus
        setLangState(stored)
        // Convergence : la valeur lue depuis l'ancienne clé est recopiée sous la
        // nouvelle, pour que la migration n'ait lieu qu'une fois par navigateur.
        window.localStorage.setItem(STORAGE_KEY, stored)
      }
    } catch {
      /* stockage indisponible (navigation privée, cookies bloqués) → on reste en FR */
    }
  }, [])

  // `<html lang>` est fixé à "fr" dans le layout : on le réaligne côté client pour
  // que lecteurs d'écran et traduction automatique voient la bonne langue.
  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])

  const setLang = useCallback((l: Lang) => {
    setLangState(l)
    try {
      window.localStorage.setItem(STORAGE_KEY, l)
    } catch {
      /* non persistable : le choix reste valable jusqu'au rechargement */
    }
  }, [])

  return (
    <Ctx.Provider value={{ lang, setLang, t: landingDicts[lang] }}>
      {children}
    </Ctx.Provider>
  )
}

/**
 * Langue courante + dictionnaire de la VITRINE.
 *
 * Le provider est monté dans le layout racine : `lang` / `setLang` sont donc
 * disponibles partout (vitrine, dashboard, pages connectées) et il n'existe qu'UN
 * seul état de langue — c'est ce qui fait qu'un choix fait sur la vitrine survit à
 * la connexion, et inversement.
 *
 * Le dictionnaire de la zone connectée a son propre hook, `useDashboard()`, qui vit
 * avec son dico (`src/locales/dashboard/`). Il n'est volontairement PAS exposé ici :
 * ce fichier est importé par toutes les pages via le layout, y compris publiques —
 * y brancher le dico dashboard embarquerait ses chaînes dans le bundle des visiteurs.
 */
export const useLanguage = () => useContext(Ctx)
