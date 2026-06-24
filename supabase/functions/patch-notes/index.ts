// Edge Function GET publique : liste ou détail des patch notes publiés.
// Accès public — pas de JWT requis, données déjà filtrées sur status='published'.
//
// Usage :
//   GET /functions/v1/patch-notes              → liste (20 derniers)
//   GET /functions/v1/patch-notes?version=14.11 → détail d'un patch spécifique

import { handleCors, jsonResponse } from '../_shared/cors.ts'
import { cacheGet, cacheSet } from '../_shared/cache.ts'
import { isRateLimited } from '../_shared/rate-limit.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const FN = 'patch-notes'

function db() {
  // On utilise le service_role pour simplifier — la RLS filtre déjà les
  // patch notes non publiés, mais le service_role bypasse RLS pour fiabilité
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
}

Deno.serve(async (req) => {
  const cors = handleCors(req)
  if (cors) return cors

  if (req.method !== 'GET') {
    return jsonResponse({ error: 'Méthode non autorisée.' }, 405)
  }

  try {
    // Rate limiting pour éviter l'abus même sur une route publique
    if (await isRateLimited(req, FN)) {
      return jsonResponse({ error: 'Trop de requêtes. Réessaie dans une minute.' }, 429)
    }

    const url     = new URL(req.url)
    const version = url.searchParams.get('version') // ex: "14.11" ou null

    const cacheKey = version ? `patch-notes:detail:${version}` : 'patch-notes:list'

    // Cache read
    const cached = await cacheGet(cacheKey)
    if (cached !== null) {
      return jsonResponse(cached, 200, { 'X-Cache': 'HIT' })
    }

    if (version) {
      // ── Détail d'un patch spécifique ─────────────────────────────────────
      const { data, error } = await db()
        .from('patch_notes')
        .select('id, version, title, summary_jsonb, image_url, published_at')
        .eq('status', 'published')
        .eq('version', version)
        .maybeSingle()

      if (error) {
        console.error('patch-notes detail error:', error)
        return jsonResponse({ error: 'Erreur lors de la récupération.' }, 500)
      }

      if (!data) {
        return jsonResponse({ error: 'Patch notes introuvables.' }, 404)
      }

      const result = { patch: data }
      await cacheSet(cacheKey, FN, result)
      return jsonResponse(result, 200, { 'X-Cache': 'MISS' })

    } else {
      // ── Liste des 20 derniers patchs publiés ──────────────────────────────
      const { data, error } = await db()
        .from('patch_notes')
        .select('id, version, title, summary_jsonb, image_url, published_at')
        .eq('status', 'published')
        .order('published_at', { ascending: false })
        .limit(20)

      if (error) {
        console.error('patch-notes list error:', error)
        return jsonResponse({ error: 'Erreur lors de la récupération.' }, 500)
      }

      const result = { patches: data ?? [] }
      await cacheSet(cacheKey, FN, result)
      return jsonResponse(result, 200, { 'X-Cache': 'MISS' })
    }

  } catch (e) {
    console.error('patch-notes error:', e instanceof Error ? e.message : String(e))
    return jsonResponse({ error: 'Erreur interne du serveur.' }, 500)
  }
})
