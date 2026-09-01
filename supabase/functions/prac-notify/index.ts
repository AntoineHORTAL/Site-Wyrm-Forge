// Edge Function : notification de demande de suivi (module prac).
//
// LOT 5D — ENVOI RESEND RÉEL (claim-then-send). Reçoit un Database Webhook sur
// tracked_players, filtre les transitions « status devient pending », résout le
// destinataire, puis : (1) CLAIM atomique d'un slot via prac_notify_claim
// (idempotence + reclaim des 'failed'), (2) ENVOI Resend, (3) finalisation
// 'sent'/'failed'. Câblage du vrai webhook au Lot 5E.
//
// Déclenchement (5E) : Database Webhook Supabase sur tracked_players (INSERT +
// UPDATE) → POST /functions/v1/prac-notify. Appelant = Postgres (pg_net), pas un
// navigateur → pas de JWT user.
//
// Sécurité : verify_jwt=false (comme prac-track). Seule barrière = header
// X-Internal-Token comparé à PRAC_WEBHOOK_SECRET en code (comparaison à temps
// constant) → 401 sinon (sans ce check l'EF serait un open relay d'e-mails). Le
// secret est porté par le trigger via Vault, plus en clair dans pg_trigger.
//
// Filtrage (les webhooks n'ont pas de condition par colonne) — ne traiter que :
//   - INSERT record.status === 'pending'                       → 'initial'
//   - UPDATE record.status === 'pending' ET old ∈ {declined,revoked} → 'reopen'
//   Tout le reste → 200 { ignored:true } (le webhook attend une réponse).
//
// Idempotence (claim-then-send) :
//   - prac_notify_claim renvoie un id → on possède l'envoi ; NULL → déjà 'sent' ou
//     'pending' in-flight → 200 { skipped:true } (aucun envoi).
//   - Envoi OK  → UPDATE status='sent', provider_message_id → 200 { sent:true }.
//   - Envoi KO  → UPDATE status='failed', error → 500 (le webhook retentera →
//     prac_notify_claim re-claime la ligne 'failed').
import { createClient }   from 'https://esm.sh/@supabase/supabase-js@2'
import { jsonResponse }   from '../_shared/cors.ts'
import { requireSecret, secretsMatch } from '../_shared/auth.ts'
import { sendEmail }      from '../_shared/resend.ts'

const CHANNEL = 'email'

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
    return null   // pending → pending (no-op DB) ou tout autre OLD : pas une (ré)ouverture
  }

  return null     // DELETE ou type inconnu
}

// ── Template e-mail (inline — prac-notify est le seul consommateur) ────────────
// `username` peut être null → on bascule sur une formule générique. La
// personnalisation ne doit JAMAIS bloquer l'envoi.
function buildEmail(transition: Transition, username: string | null, siteUrl: string) {
  const hello   = username ? `Salut ${username},` : 'Salut,'
  const consent = `${siteUrl.replace(/\/+$/, '')}/consent`
  const intro = transition === 'reopen'
    ? 'Un administrateur prac vient de te <strong>renvoyer</strong> une demande de suivi de tes performances sur Wyrm Forge.'
    : 'Un administrateur prac souhaite <strong>suivre tes performances</strong> sur Wyrm Forge.'
  const subject = transition === 'reopen'
    ? 'Nouvelle demande de suivi prac — Wyrm Forge'
    : 'Demande de suivi prac — Wyrm Forge'

  const html = `<!doctype html>
<html lang="fr"><body style="margin:0;background:#1A1A1A;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#e8e8e8;padding:24px">
  <div style="max-width:520px;margin:0 auto;background:#202020;border:1px solid #333;border-radius:12px;padding:28px">
    <h1 style="font-size:20px;margin:0 0 16px;color:#EF9F27">Wyrm Forge — Prac</h1>
    <p style="margin:0 0 12px">${hello}</p>
    <p style="margin:0 0 12px">${intro}</p>
    <p style="margin:0 0 20px">Tu décides : tu peux <strong>accepter</strong> ou <strong>refuser</strong> ce suivi à tout moment depuis ta page de consentement.</p>
    <p style="margin:0 0 24px">
      <a href="${consent}" style="display:inline-block;background:#EF9F27;color:#1A1A1A;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:8px">Gérer ma demande</a>
    </p>
    <p style="margin:0 0 16px;font-size:12px;color:#888">Si le bouton ne fonctionne pas, copie ce lien : ${consent}</p>
    <p style="margin:0;padding-top:14px;border-top:1px solid #333;font-size:11px;color:#777">Tu reçois cet email car un administrateur Wyrm Forge a initié une demande de suivi. Tu peux refuser depuis ta page de consentement.</p>
  </div>
</body></html>`

  const text = `${hello}\n\n${transition === 'reopen'
    ? 'Un administrateur prac vient de te renvoyer une demande de suivi de tes performances sur Wyrm Forge.'
    : 'Un administrateur prac souhaite suivre tes performances sur Wyrm Forge.'}\n\n` +
    `Tu peux accepter ou refuser ce suivi à tout moment ici : ${consent}\n\n` +
    `Tu reçois cet email car un administrateur Wyrm Forge a initié une demande de suivi. Tu peux refuser depuis ta page de consentement.\n`

  return { subject, html, text }
}

Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST') {
      return jsonResponse({ error: 'Méthode non autorisée.' }, 405)
    }

    // ── Barrière d'accès : header interne partagé ────────────────────────────
    const expected = requireSecret('PRAC_WEBHOOK_SECRET')
    const provided = req.headers.get('X-Internal-Token')
    if (!(await secretsMatch(provided, expected))) {
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
      return jsonResponse({ ignored: true }, 200)
    }

    const rec          = payload.record!
    const profileId    = rec.profile_id
    const trackedId    = rec.id            // tracked_players.id (= ancrage idempotence + FK)
    const requestedAt  = rec.requested_at  // instance de demande (ISO timestamptz)
    if (typeof profileId !== 'string' || typeof trackedId !== 'string' || typeof requestedAt !== 'string') {
      console.error('prac-notify: champs manquants dans record', {
        has_profile: typeof profileId, has_id: typeof trackedId, has_requested_at: typeof requestedAt,
      })
      return jsonResponse({ ignored: true, reason: 'missing_fields' }, 200)
    }

    const db = createClient(
      Deno.env.get('SUPABASE_URL')!,
      requireSecret('SUPABASE_SERVICE_ROLE_KEY'),
    )

    // ── Résolution du destinataire (source canonique auth.users) ─────────────
    const { data: userData, error: userErr } = await db.auth.admin.getUserById(profileId)
    if (userErr) {
      console.error('prac-notify: getUserById error', userErr)
      return jsonResponse({ would_send: false, reason: 'lookup_error', profile_id: profileId }, 200)
    }
    const email = userData?.user?.email ?? null
    if (!email) {
      console.error('prac-notify: aucun email pour le profil', { profile_id: profileId })
      return jsonResponse({ would_send: false, reason: 'no_email', profile_id: profileId }, 200)
    }

    // ── Personnalisation best-effort (ne JAMAIS bloquer l'envoi) ──────────────
    let username: string | null = null
    try {
      const { data: prof } = await db
        .from('profiles').select('username').eq('id', profileId).maybeSingle()
      const u = prof?.username
      username = (typeof u === 'string' && u.trim() !== '') ? u : null
    } catch (e) {
      console.error('prac-notify: lecture username échouée (fallback générique)', e instanceof Error ? e.message : String(e))
    }

    // ── (1) CLAIM atomique du slot ───────────────────────────────────────────
    const { data: claimId, error: claimErr } = await db.rpc('prac_notify_claim', {
      p_tracked_player_id: trackedId,
      p_requested_at:      requestedAt,
      p_channel:           CHANNEL,
      p_recipient:         email,
    })
    if (claimErr) {
      console.error('prac-notify: prac_notify_claim error', claimErr)
      return jsonResponse({ error: 'Erreur serveur (claim).' }, 500)
    }
    if (claimId === null || claimId === undefined) {
      // Déjà 'sent' ou 'pending' in-flight → pas de double envoi.
      return jsonResponse({ skipped: true, reason: 'already_notified' }, 200)
    }

    // ── (2) ENVOI Resend ─────────────────────────────────────────────────────
    const siteUrl = Deno.env.get('SITE_URL') ?? 'https://wyrm-forge.com'
    const { subject, html, text } = buildEmail(transition, username, siteUrl)
    const sent = await sendEmail({ to: email, subject, html, text })

    // ── (3) Finalisation du statut ───────────────────────────────────────────
    if (!sent.ok) {
      await db.from('prac_notification_log')
        .update({ status: 'failed', error: (sent.error ?? 'send failed').slice(0, 500), updated_at: new Date().toISOString() })
        .eq('id', claimId)
      console.error('prac-notify: envoi Resend échoué', { profile_id: profileId, status: sent.status, error: sent.error })
      // 500 → le webhook retentera ; prac_notify_claim re-claimera la ligne 'failed'.
      return jsonResponse({ error: 'Envoi e-mail échoué.', detail: sent.error }, 500)
    }

    await db.from('prac_notification_log')
      .update({ status: 'sent', provider_message_id: sent.id ?? null, updated_at: new Date().toISOString() })
      .eq('id', claimId)

    console.log('prac-notify: email sent', JSON.stringify({ transition, profile_id: profileId, message_id: sent.id }))
    return jsonResponse({ sent: true, transition, message_id: sent.id ?? null }, 200)
  } catch (e) {
    console.error('prac-notify: unhandled exception', e instanceof Error ? e.message : String(e))
    return jsonResponse({ error: 'Erreur serveur inattendue.' }, 500)
  }
})
