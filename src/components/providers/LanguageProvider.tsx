'use client'

import { createContext, useContext, useCallback, useEffect, useState } from 'react'
import { landingDicts, type Lang, type LandingDict } from '@/locales/landing'

/* Clé localStorage — préfixe `wf-` comme le reste des préférences du site. */
const STORAGE_KEY = 'wf-landing-lang'

interface LanguageCtx {
  lang: Lang
  setLang: (l: Lang) => void
  /** Dictionnaire de la langue courante (voir src/locales/landing.ts). */
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
      const stored = window.localStorage.getItem(STORAGE_KEY)
      // eslint-disable-next-line react-hooks/set-state-in-effect -- setState en effet est
      // ICI la solution, pas le problème : c'est ce qui garantit que le premier rendu
      // client est identique au rendu serveur. Lire localStorage pendant le rendu (ce que
      // suggère la règle) provoquerait le mismatch d'hydratation qu'on cherche à éviter.
      if (stored === 'fr' || stored === 'en') setLangState(stored)
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

export const useLanguage = () => useContext(Ctx)
