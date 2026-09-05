'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  readFlag, resolveFlags, startFlagsRefresh, REFRESH_INTERVAL_MS,
  type FlagRow,
} from '@/lib/feature-flags'

/**
 * Feature flags du catalogue `app_settings`, pour TOUT le site.
 *
 * ⚠️ MONTÉ AU-DESSUS DE `SessionProvider`, et surtout pas dedans. Ce provider ne
 * doit dépendre d'AUCUN utilisateur : `/matches`, `/champions`, `/live` et la
 * vitrine sont publiques, et ce sont précisément les visiteurs anonymes qu'on ne
 * peut prévenir autrement quand un kill switch tombe. La lecture anonyme est
 * rendue possible par la policy `as_select_anon` (migration 20260905000001), qui
 * expose les lignes `is_public` au rôle `anon` — soit exactement les 39 flags.
 *
 * Une SEULE requête rapporte tout le catalogue, et la hiérarchie `parent_key` est
 * aplatie une fois pour toutes (voir `resolveFlags`) : `useFlag()` n'est ensuite
 * qu'une lecture d'objet.
 *
 * Toute la logique vit dans `@/lib/feature-flags` — module pur et testé. Ce
 * fichier ne porte que l'état React et le cycle de vie.
 */
interface FeatureFlagsCtx {
  /** Map clé → valeur EFFECTIVE (parents déjà appliqués). */
  flags: Record<string, boolean>
  /**
   * `true` tant que le premier chargement n'a pas répondu. À lire pour éviter le
   * flash « contenu caché puis affiché » sur un écran qui rend deux mises en page
   * très différentes selon le flag.
   */
  isLoading: boolean
  /** Force une relecture immédiate (utilisé par l'AdminTab à l'étape 4). */
  refresh: () => void
}

const Ctx = createContext<FeatureFlagsCtx>({
  flags: {}, isLoading: true, refresh: () => {},
})

export function FeatureFlagsProvider({ children }: { children: React.ReactNode }) {
  const [flags, setFlags] = useState<Record<string, boolean>>({})
  const [isLoading, setIsLoading] = useState(true)

  // Client Supabase stable : `createClient()` construit un nouvel objet à chaque
  // appel, et un nouvel objet à chaque rendu invaliderait les dépendances de
  // `fetchFlags` — donc de l'effet, donc du timer, à chaque rendu.
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null)
  if (supabaseRef.current === null) supabaseRef.current = createClient()

  const fetchFlags = useCallback(async () => {
    const { data, error } = await supabaseRef.current!
      .from('app_settings')
      .select('key, value, kind, parent_key')
      .in('kind', ['launch', 'kill'])

    // ⚠️ Une erreur ne VIDE PAS l'état : on garde la dernière vérité connue. La
    // remplacer par {} ferait retomber chaque clé sur son repli — c'est-à-dire
    // rallumerait en silence une feature qu'un admin vient de couper.
    if (error || !data) {
      setIsLoading(false)
      return
    }

    // Même raisonnement pour une réponse VIDE : le catalogue n'est jamais vide,
    // une réponse à zéro ligne signale plutôt une RLS mal posée qu'une bascule.
    if (data.length > 0) setFlags(resolveFlags(data as FlagRow[]))
    setIsLoading(false)
  }, [])

  useEffect(() => {
    void fetchFlags()

    return startFlagsRefresh({
      onRefresh: () => { void fetchFlags() },
      addEventListener: (type, handler) => document.addEventListener(type, handler),
      removeEventListener: (type, handler) => document.removeEventListener(type, handler),
      setInterval: (handler, ms) => window.setInterval(handler, ms),
      clearInterval: id => window.clearInterval(id as number),
      isHidden: () => document.hidden,
      intervalMs: REFRESH_INTERVAL_MS,
    })
  }, [fetchFlags])

  const value = useMemo<FeatureFlagsCtx>(
    () => ({ flags, isLoading, refresh: () => { void fetchFlags() } }),
    [flags, isLoading, fetchFlags],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

/**
 * Une feature est-elle active ? Applique la hiérarchie `parent_key` (déjà résolue)
 * puis, si la clé est absente, le repli asymétrique : `false` pour un flag de
 * lancement, `true` pour un kill switch.
 */
export function useFlag(key: string): boolean {
  return readFlag(useContext(Ctx).flags, key)
}

/** État complet — pour les écrans qui doivent attendre le premier chargement. */
export function useFeatureFlags(): FeatureFlagsCtx {
  return useContext(Ctx)
}
