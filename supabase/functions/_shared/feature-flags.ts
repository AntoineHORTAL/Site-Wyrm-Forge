// Utilitaire de lecture des feature flags stockés dans app_settings.
// Utilisé par les Edge Functions qui doivent conditionner leur comportement
// sur l'état d'une fonctionnalité (ex : écailles activées ou non).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

/**
 * Indique si un feature flag est actif.
 *
 * Utilise service_role pour bypass RLS garanti — app_settings n'a pas de
 * policy SELECT pour anon, seul authenticated y a accès côté client.
 *
 * Fail closed : toute erreur ou clé absente retourne false, jamais d'exception
 * propagée. Cela évite qu'un problème DB ouvre accidentellement une feature.
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
      .select('value')
      .eq('key', key)
      .limit(1)
      .maybeSingle()

    if (error || !data) return false
    return data.value === 'true'
  } catch {
    // Fail closed : on ne propage jamais l'erreur vers l'appelant
    return false
  }
}
