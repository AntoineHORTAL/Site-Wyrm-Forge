// Edge Function : notification de demande de suivi (module prac).
//
// LOT 5B — SQUELETTE LOG-ONLY. Aucun envoi Resend réel ici : on pose la mécanique
// (réception du webhook, vérification du secret, filtrage de la transition,
// résolution du destinataire) et on LOG ce qui SERAIT envoyé. L'envoi Resend
// arrivera au Lot 5D ; le câblage du vrai Database Webhook au Lot 5E.
//
// Déclenchement (à câbler en 5E) : Database Webhook Supabase sur `tracked_players`
// (INSERT + UPDATE) → POST /functions/v1/prac-notify.
//
// Sécurité : verify_jwt=false (comme prac-track). Pas de JWT user ici — l'appelant
// est Postgres (pg_net), pas un navigateur. La seule barrière est le header
// X-Internal-Token comparé à PRAC_WEBHOOK_SECRET. SANS ce check, l'EF serait un
// open relay (n'importe qui pourrait déclencher des e-mails). 401 si absent/incorrect.
//
// Filtrage en code (les Database Webhooks n'ont pas de condition par colonne) :
// on ne traite QUE les transitions où le statut DEVIENT 'pending' :
//   - INSERT avec record.status === 'pending'          (demande initiale)
//   - UPDATE avec record.status === 'pending' ET
//     old_record.status ∈ {'declined','revoked'}       (réouverture)
// Tout le reste (accepted / declined / revoked en eux-mêmes, autres tables) est
// ignoré silencieusement avec un 200 (le webhook attend une réponse).
import { createClient }   from 'https://esm.sh/@supabase/supabase-js@2'
import { jsonResponse }   from '../_shared/cors.ts'
import { requireSecret }  from '../_shared/auth.ts'

// Payload standard d'un Database Webhook Supabase.
interface WebhookPayload {
  type: 'INSERT' | 'UPDATE' | 'DELETE'
  table: string
  schema: string
  record: Record<string, unknown> | null
  old_record: Record<string, unknown> | null
}

type Transition = 'initial' | 'reopen'

// Détermine si l'événement doit déclencher une notification, et de quel type.
// Retourne null si l'événement doit être ignoré.
function relevantTransition(p: WebhookPayload): Transition | null {
  if (p.table !== 'tracked_players') return null
  const newStatus = p.record?.status
  if (newStatus !== 'pending') return null

  if (p.type === 'INSERT') return 'initial'

  if (p.type === 'UPDATE') {
    const oldStatus = p.old_record?.status
    if (oldStatus === 'declined' || oldStatus === 'revoked') return 'reopen'
    // pending → pending (no-op DB), ou tout autre OLD : pas une (ré)ouverture
    return null
  }

  return null   // DELETE ou type inconnu
}

Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST') {
      return jsonResponse({ error: 'Méthode non autorisée.' }, 405)
    }

    // ── Barrière d'accès : header interne partagé ────────────────────────────
    // Comparaison directe (token haute entropie), même esprit que le check
    // X-Internal-Token de patch-notes-generator. 401 (et non 403) : l'appelant
    // n'est pas un user authentifié mais un service interne — l'absence de
    // credential interne = non authentifié.
    const expected = requireSecret('PRAC_WEBHOOK_SECRET')
    const provided = req.headers.get('X-Internal-Token')
    if (!provided || provided !== expected) {
      return jsonResponse({ error: 'Authentification interne requise.' }, 401)
    }

    // ── Parse du payload webhook ─────────────────────────────────────────────
    let payload: WebhookPayload
    try {
      payload = await req.json() as WebhookPayload
    } catch {
      return jsonResponse({ error: 'Corps de requête invalide (JSON attendu).' }, 400)
    }

    // ── Filtrage de la transition pertinente ─────────────────────────────────
    const transition = relevantTransition(payload)
    if (!transition) {
      // Événement non pertinent : on accuse réception sans rien faire.
      return jsonResponse({ ignored: true }, 200)
    }

    const profileId = payload.record?.profile_id
    if (typeof profileId !== 'string') {
      console.error('prac-notify: profile_id manquant dans le payload', { type: payload.type })
      return jsonResponse({ ignored: true, reason: 'missing_profile_id' }, 200)
    }

    // ── Résolution du destinataire (service_role) ────────────────────────────
    // Source canonique = auth.users.email (profiles.email n'est qu'une copie
    // faite à la création, susceptible de dériver). profiles.id = auth.users.id
    // = record.profile_id → lookup direct par id.
    const db = createClient(
      Deno.env.get('SUPABASE_URL')!,
      requireSecret('SUPABASE_SERVICE_ROLE_KEY'),
    )

    const { data: userData, error: userErr } = await db.auth.admin.getUserById(profileId)
    if (userErr) {
      console.error('prac-notify: getUserById error', userErr)
      // 200 : un retry du webhook ne résoudra pas une erreur de lookup d'id.
      return jsonResponse({ would_send: false, reason: 'lookup_error', profile_id: profileId }, 200)
    }
    const email = userData?.user?.email ?? null
    if (!email) {
      console.error('prac-notify: aucun email pour le profil', { profile_id: profileId })
      return jsonResponse({ would_send: false, reason: 'no_email', profile_id: profileId }, 200)
    }

    // ── LOG-ONLY (l'envoi Resend arrivera au Lot 5D) ─────────────────────────
    console.log('prac-notify: would send consent request email', JSON.stringify({
      transition,                 // 'initial' | 'reopen'
      profile_id: profileId,
      email,
    }))

    return jsonResponse({ would_send: true, transition, profile_id: profileId, email }, 200)
  } catch (e) {
    console.error('prac-notify: unhandled exception', e instanceof Error ? e.message : String(e))
    return jsonResponse({ error: 'Erreur serveur inattendue.' }, 500)
  }
})
