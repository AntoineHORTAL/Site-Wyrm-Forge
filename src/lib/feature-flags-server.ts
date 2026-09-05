import { createClient } from '@/lib/supabase/server'
import { flagFallback, resolveFlags, type FlagRow } from '@/lib/feature-flags'

/**
 * Fraîcheur du cache serveur des flags, en secondes.
 *
 * Alignée sur le poll de `FeatureFlagsProvider` : le chemin serveur et le chemin
 * client ont ainsi la MÊME latence de propagation, et il n'y a qu'un seul nombre
 * à retenir pour tout le dispositif. Un flag basculé dans l'AdminTab atteint donc
 * une page publique en 60 s au pire, exactement comme le dashboard.
 */
export const FLAGS_REVALIDATE_SECONDS = 60

/**
 * Lecture d'un flag pour une route PUBLIQUE rendue côté serveur.
 *
 * ⚠️ N'UTILISE PAS `@/lib/supabase/server` — et c'est tout l'intérêt. Ce client-là
 * appelle `cookies()`, ce qui fait basculer la route en rendu DYNAMIQUE d'office :
 * `/matches`, prérendue à la compilation, y perdrait sa génération statique et
 * paierait une requête Supabase par visiteur.
 *
 * Or les flags n'ont besoin d'AUCUNE session : la policy `as_select_anon`
 * (migration 20260905000001) les expose au rôle `anon`. Un `fetch` nu avec la clé
 * publique suffit donc, et il ouvre deux portes que le client Supabase fermait :
 *   • pas de `cookies()` → la route reste éligible au rendu statique ;
 *   • `next.revalidate` → Next met la réponse en cache, donc UNE requête toutes
 *     les 60 s par route, et non une par visiteur.
 *
 * Le tag `feature-flags` permettra, si le besoin apparaît, de purger le cache à la
 * demande depuis l'AdminTab (`revalidateTag`) pour une propagation immédiate.
 *
 * Fail-open / fail-closed selon {@link flagFallback}, comme partout ailleurs.
 */
export async function isPublicFlagEnabled(key: string): Promise<boolean> {
  try {
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!base || !anon) return flagFallback(key)

    const res = await fetch(
      `${base.replace(/\/$/, '')}/rest/v1/app_settings?select=key,value,kind,parent_key`,
      {
        headers: { apikey: anon, Authorization: `Bearer ${anon}` },
        next: { revalidate: FLAGS_REVALIDATE_SECONDS, tags: ['feature-flags'] },
      },
    )
    if (!res.ok) return flagFallback(key)

    const rows: unknown = await res.json()
    if (!Array.isArray(rows) || rows.length === 0) return flagFallback(key)

    // Filtré ICI plutôt que dans l'URL : en `anon` la RLS ne renvoie de toute
    // façon que les lignes publiques (les 39 flags), et un filtre PostgREST en
    // dur dans l'URL serait une syntaxe de plus à maintenir pour rien.
    const flags = (rows as FlagRow[]).filter(r => r.kind === 'launch' || r.kind === 'kill')
    if (flags.length === 0) return flagFallback(key)

    const value = resolveFlags(flags)[key]
    return value === undefined ? flagFallback(key) : value
  } catch {
    return flagFallback(key)
  }
}

/**
 * Lecture d'un feature flag depuis un COMPOSANT SERVEUR.
 *
 * `FeatureFlagsProvider` couvre tout ce qui est rendu côté client. Il ne peut rien
 * pour un layout `async` qui décide d'un `redirect()` avant même de rendre —
 * c'est le cas du shell prac, dont la garde doit tomber avant que la moindre
 * donnée interne ne parte au navigateur. D'où cette lecture serveur, qui partage
 * les fonctions PURES du provider (résolution des parents, repli asymétrique)
 * pour que les deux chemins ne puissent pas diverger.
 *
 * ⚠️ Pas de cache : un kill switch dont la propagation dépendrait d'un cache
 * n'est pas un kill switch. Le coût est d'une requête par rendu serveur d'une
 * route ainsi gardée — négligeable, et `/prac/*` est déjà `force-dynamic`.
 *
 * Fail-open / fail-closed selon `flagFallback` : en cas d'erreur, un kill switch
 * laisse passer (une panne de base ne doit pas fermer un outil interne) et un
 * flag de lancement bloque.
 */
export async function isFlagEnabledServer(key: string): Promise<boolean> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('app_settings')
      .select('key, value, kind, parent_key')
      .in('kind', ['launch', 'kill'])

    if (error || !data || data.length === 0) return flagFallback(key)

    const resolved = resolveFlags(data as FlagRow[])
    const value = resolved[key]
    return value === undefined ? flagFallback(key) : value
  } catch {
    return flagFallback(key)
  }
}
