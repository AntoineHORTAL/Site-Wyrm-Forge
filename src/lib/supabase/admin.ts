import 'server-only'
import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Client Supabase `service_role` — LE SEUL du site.
 *
 * ⚠️ Ce client CONTOURNE la RLS et tous les triggers de garde (`current_user`
 * vaut `service_role`, pas `authenticated`). Tout ce qu'il touche est écrit sans
 * qu'aucune policy ne s'y oppose.
 *
 * ⚠️ `import 'server-only'` : un import depuis un composant client devient une
 * **erreur de build**, pas une clé service role dans le bundle du navigateur.
 *
 * ════════════════════════════════════════════════════════════════════════════
 *  POURQUOI CE FICHIER EXISTE, ALORS QUE LA CONVENTION DIT L'INVERSE
 * ════════════════════════════════════════════════════════════════════════════
 * `AGENTS.md` § Règles critiques : « Supabase client : toujours `createClient`
 * depuis `@/lib/supabase/client` — ne jamais instancier directement ». Cette
 * règle vise le client NAVIGATEUR, et elle reste entière : rien de ce qui rend
 * une page ne doit passer par ici.
 *
 * Jusqu'ici, tout ce qui avait besoin de `service_role` vivait dans une Edge
 * Function (`SUPABASE_SERVICE_ROLE_KEY` y est injectée automatiquement). Le
 * webhook Stripe ne peut pas : Stripe signe le corps de la requête avec
 * `STRIPE_WEBHOOK_SECRET`, la vérification doit donc avoir lieu là où arrive la
 * requête. Faire relayer une EF par la route Next reviendrait à recopier le
 * secret à deux endroits et à ouvrir un second point d'entrée à garder.
 *
 * La clé n'est donc PAS élargie : elle est ajoutée aux variables Vercel (jamais
 * en dur, jamais préfixée `NEXT_PUBLIC_`), et son usage est borné à ce module.
 *
 * ════════════════════════════════════════════════════════════════════════════
 *  RÈGLE D'USAGE
 * ════════════════════════════════════════════════════════════════════════════
 * Ce client sert à APPELER LES RPC qui portent leur propre logique de garde
 * (`stripe_apply_subscription_event`), pas à écrire directement dans les tables.
 * Un `.from('profiles').update({ tier })` d'ici passerait, et court-circuiterait
 * du même coup la garde d'ordre des événements et l'exclusion des admins — deux
 * règles qui vivent dans la fonction SQL. Passer par la RPC n'est pas un détour
 * de style, c'est ce qui rend l'écriture correcte.
 */

let cached: SupabaseClient | null = null

export function createAdminClient(): SupabaseClient {
  if (cached) return cached

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    // Le nom manquant part dans les logs serveur, pas dans le message d'erreur
    // — même compromis que `requireEnv` / `requireSecret`.
    console.error('[supabase/admin] NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY manquante')
    throw new Error('Configuration serveur incomplète.')
  }

  // ⚠️ L'URL est celle du projet EFFECTIF (`NEXT_PUBLIC_SUPABASE_URL`), pas une
  // constante : c'est elle qui décide prod ou test, exactement comme
  // `isTestDatabase`. Une URL en dur ici ferait écrire un webhook de test dans
  // la base de production.
  cached = createSupabaseClient(url, key, {
    auth: {
      // Aucune session à porter : ce client n'a pas d'utilisateur, et un refresh
      // de token en tâche de fond dans une route serverless ne servirait qu'à
      // maintenir un timer vivant après la réponse.
      persistSession: false,
      autoRefreshToken: false,
    },
  })
  return cached
}
