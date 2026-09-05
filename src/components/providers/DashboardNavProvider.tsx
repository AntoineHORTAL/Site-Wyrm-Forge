'use client'

import { createContext, useCallback, useContext, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import type { DashTab } from '@/lib/session-types'

/**
 * Onglet actif du dashboard, partagé entre `src/app/page.tsx` (qui le REND) et le
 * header global (qui le PILOTE depuis n'importe quelle route).
 *
 * Le header est monté dans le layout racine : il ne peut plus recevoir
 * `activeTab` / `onTabChange` en props depuis `page.tsx`. Sans ce contexte, les
 * onglets du drawer mobile appelleraient un `onTabChange` inexistant hors de `/`.
 *
 * ⚠️ Ce module n'importe VOLONTAIREMENT pas `Dashboard` (ni `dashTabs`) : il vit
 * dans le layout racine, donc dans le bundle de toutes les pages, y compris
 * publiques. Y brancher le dashboard embarquerait ses onglets chez les visiteurs.
 * C'est aussi pourquoi la validation du deep-link `?tab=` reste dans `page.tsx`,
 * qui connaît déjà la liste des onglets.
 */
interface DashboardNavCtx {
  activeTab: DashTab
  setActiveTab: (tab: DashTab) => void
  /**
   * Change d'onglet DEPUIS N'IMPORTE OÙ.
   *
   * Sur `/`, c'est un simple changement d'état. Ailleurs (/champions, /matches…),
   * `page.tsx` n'est pas monté : changer l'état ne rendrait rien. On repasse donc
   * par le deep-link `/?tab=…`, que `page.tsx` sait déjà relire au montage.
   */
  goToTab: (tab: DashTab) => void
  /** Compteur d'ouvertures de la Forge — incrémenté à chaque demande, jamais lu comme booléen. */
  forgeRequest: number
  requestForge: () => void
}

const Ctx = createContext<DashboardNavCtx>({
  activeTab: 'accueil',
  setActiveTab: () => {},
  goToTab: () => {},
  forgeRequest: 0,
  requestForge: () => {},
})

export function DashboardNavProvider({ children }: { children: React.ReactNode }) {
  const [activeTab, setActiveTab] = useState<DashTab>('accueil')
  const [forgeRequest, setForgeRequest] = useState(0)
  const router = useRouter()
  const pathname = usePathname()

  const goToTab = useCallback((tab: DashTab) => {
    if (pathname === '/') { setActiveTab(tab); return }
    router.push(`/?tab=${tab}`)
  }, [pathname, router])

  const requestForge = useCallback(() => {
    setForgeRequest(r => r + 1)
    goToTab('ecailles')
  }, [goToTab])

  return (
    <Ctx.Provider value={{ activeTab, setActiveTab, goToTab, forgeRequest, requestForge }}>
      {children}
    </Ctx.Provider>
  )
}

export const useDashboardNav = () => useContext(Ctx)
