// Utilitaire de lecture des feature flags stockés dans app_settings.
// Utilisé par les Edge Functions qui doivent conditionner leur comportement
// sur l'état d'une fonctionnalité (ex : écailles activées ou non).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { flagChainOpen, type FlagChainRow } from './flag-chain.ts'

/**
 * Indique si un feature flag est actif.
 *
 * Utilise service_role pour bypass RLS garanti — app_settings n'a pas de
 * policy SELECT pour anon, seul authenticated y a accès côté client.
 *
 * Fail closed : toute erreur ou clé absente retourne false, jamais d'exception
 * propagée. Cela évite qu'un problème DB ouvre accidentellement une feature.
 *
 * Hiérarchie `parent_key` appliquée (depuis le 2026-10-17, `flag-chain.ts`) : un
 * flag n'est actif que si tous ses ancêtres le sont. `shop-purchase` et
 * `quest-claim` lisent ainsi `ecailles_enabled` en plus de leur propre flag, comme
 * les clients. Une seule requête : le catalogue entier (une cinquantaine de lignes),
 * puis la chaîne résolue en mémoire.
 */
export async function isFeatureEnabled(key: string): Promise<boolean> {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      // service_role bypass RLS — ne jamais utiliser anon ici
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data, error } = await supabase
      .from('app_settings')
      .select('key, value, parent_key')

    if (error || !data) return false
    return flagChainOpen(data as FlagChainRow[], key)
  } catch {
    // Fail closed : on ne propage jamais l'erreur vers l'appelant
    return false
  }
}
