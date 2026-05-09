// Vérification du JWT Supabase pour les fonctions qui nécessitent un user connecté.
// Importé par toutes les Edge Functions privées.
import { createClient, type User } from 'https://esm.sh/@supabase/supabase-js@2'

/**
 * Récupère le user à partir du header Authorization de la requête.
 * Retourne `null` si non authentifié — la fonction appelante décide quoi faire.
 */
export async function getUser(req: Request): Promise<User | null> {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return null

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  )

  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) return null
  return data.user
}

/**
 * Lit un secret depuis les variables d'environnement Supabase.
 * Throw une erreur claire si la clé n'est pas définie (utile en dev).
 */
export function requireSecret(name: string): string {
  const value = Deno.env.get(name)
  if (!value) {
    throw new Error(`Secret manquant : ${name}. Lance "supabase secrets set ${name}=..."`)
  }
  return value
}
