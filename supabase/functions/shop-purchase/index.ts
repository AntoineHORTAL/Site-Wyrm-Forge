// Edge Function : achat d'un cosmétique depuis la boutique d'Écailles.
//
// Appel : POST /functions/v1/shop-purchase
// Headers : Authorization: Bearer <JWT>
// Body JSON : { cosmetic_id: number }
//
// Réponse succès : { success: true }
// L'atomicité, le verrou advisory et l'idempotence sont délégués à la
// fonction DB `purchase_cosmetic` (SECURITY DEFINER). L'EF se contente
// d'orchestrer et de mapper les erreurs métier vers des codes HTTP lisibles.
import { createClient }                     from 'https://esm.sh/@supabase/supabase-js@2'
import { handleCors, jsonResponse }         from '../_shared/cors.ts'
import { getUser, requireSecret }           from '../_shared/auth.ts'
import { isFeatureEnabled }                 from '../_shared/feature-flags.ts'

Deno.serve(async (req) => {
  // ── Preflight CORS ────────────────────────────────────────────────────────
  const cors = handleCors(req)
  if (cors) return cors

  try {
    // ── Étape 1 — Feature flag ────────────────────────────────────────────
    // Vérifié EN PREMIER, avant même de parser le JWT, pour économiser
    // un aller-retour Auth inutile quand la boutique est désactivée.
    // isFeatureEnabled est fail-closed : une erreur DB retourne false.
    const enabled = await isFeatureEnabled('shop_enabled')
    if (!enabled) {
      return jsonResponse({ error: 'La boutique est actuellement désactivée.' }, 403)
    }

    // ── Étape 2 — Auth ───────────────────────────────────────────────────
    const user = await getUser(req)
    if (!user) return jsonResponse({ error: 'Authentification requise.' }, 401)

    // ── Étape 3 — Parsing + validation du body ───────────────────────────
    // On valide strictement : entier positif uniquement.
    // Un BIGINT Postgres est représentable sans perte en Number JS
    // tant qu'il reste sous Number.MAX_SAFE_INTEGER (9 007 199 254 740 991).
    let body: unknown
    try {
      body = await req.json()
    } catch {
      return jsonResponse({ error: 'Corps de requête invalide (JSON attendu).' }, 400)
    }

    const cosmetic_id = (body as Record<string, unknown>)?.cosmetic_id
    if (
      !cosmetic_id ||
      typeof cosmetic_id !== 'number' ||
      !Number.isInteger(cosmetic_id) ||
      cosmetic_id <= 0
    ) {
      return jsonResponse({ error: 'cosmetic_id invalide.' }, 400)
    }

    // ── Étape 4 — Appel DB via service_role ─────────────────────────────
    // On utilise service_role pour bypass RLS et appeler purchase_cosmetic
    // qui est SECURITY DEFINER. Le solde n'est jamais re-vérifié ici :
    // c'est la responsabilité exclusive de la fonction DB.
    const db = createClient(
      Deno.env.get('SUPABASE_URL')!,
      requireSecret('SUPABASE_SERVICE_ROLE_KEY'),
    )

    const { error } = await db.rpc('purchase_cosmetic', {
      p_user_id:     user.id,
      p_cosmetic_id: cosmetic_id,
    })

    // ── Étape 5 — Mapping des erreurs métier ─────────────────────────────
    // Les erreurs Postgres RAISE EXCEPTION remontent dans error.message.
    // On mappe les codes métier connus → codes HTTP sémantiques.
    if (error) {
      const msg = error.message ?? ''

      if (msg.includes('cosmetic_unavailable')) {
        return jsonResponse({ error: 'Ce cosmétique n\'est pas disponible.' }, 404)
      }
      if (msg.includes('already_owned')) {
        return jsonResponse({ error: 'Tu possèdes déjà ce cosmétique.' }, 409)
      }
      if (msg.includes('insufficient_balance')) {
        return jsonResponse({ error: 'Solde d\'Écailles insuffisant.' }, 402)
      }

      // Erreur inattendue — on logue pour faciliter le debug sans exposer
      // le détail de l'erreur Postgres à l'appelant.
      console.error('shop-purchase: unexpected DB error', error)
      return jsonResponse({ error: 'Erreur lors de l\'achat.' }, 500)
    }

    // Succès — l'équipement est une action séparée (is_equipped = false en DB)
    return jsonResponse({ success: true }, 200)

  } catch (e) {
    // Ne jamais exposer le détail (message JS/Postgres) à l'appelant — log only.
    console.error('shop-purchase: unhandled exception', e instanceof Error ? e.message : String(e))
    return jsonResponse({ error: 'Erreur serveur inattendue.' }, 500)
  }
})
