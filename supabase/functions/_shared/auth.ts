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
    // Do not expose the secret name in production error messages
    throw new Error('Configuration serveur incomplète.')
  }
  return value
}

/**
 * Compare un secret fourni par l'appelant à sa valeur attendue, en TEMPS
 * CONSTANT.
 *
 * Pourquoi ne pas utiliser `===` : la comparaison de chaînes de V8 s'arrête au
 * premier caractère qui diffère. Le temps de réponse dépend donc du nombre de
 * caractères corrects en tête du token, ce qui permet en théorie de le
 * reconstituer caractère par caractère. Sur nos tokens (haute entropie, mesure
 * noyée dans la latence réseau) l'attaque n'est pas praticable — c'est de la
 * défense en profondeur, pas la correction d'une faille exploitable.
 *
 * Méthode : on compare les empreintes SHA-256, pas les chaînes. Deux avantages
 * sur une boucle XOR directe — les deux opérandes font toujours 32 octets (la
 * LONGUEUR du token fourni ne fuit pas non plus), et la boucle parcourt
 * systématiquement les 32 octets sans court-circuit.
 */
export async function secretsMatch(provided: string | null, expected: string): Promise<boolean> {
  if (!provided) return false

  const enc = new TextEncoder()
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(provided)),
    crypto.subtle.digest('SHA-256', enc.encode(expected)),
  ])

  const x = new Uint8Array(a)
  const y = new Uint8Array(b)
  let diff = 0
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i]
  return diff === 0
}
