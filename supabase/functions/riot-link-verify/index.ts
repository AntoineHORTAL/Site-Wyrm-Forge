// Edge Function : vérifie que l'utilisateur a bien changé son icône d'invocateur
// vers l'icône-cible générée lors du riot-link-init. Si oui, lie le compte Riot.
//
// Appel : POST /functions/v1/riot-link-verify
// Headers : Authorization: Bearer <JWT>
// Body : vide (toutes les infos viennent du pending en DB)
//
// Réponse succès : { success: true, game_name, tag_line, platform }
import { createClient }                  from 'https://esm.sh/@supabase/supabase-js@2'
import { handleCors, jsonResponse }      from '../_shared/cors.ts'
import { getUser, requireSecret }        from '../_shared/auth.ts'
import { isRateLimited }                 from '../_shared/rate-limit.ts'
import { isCircuitOpen, incrementQuota } from '../_shared/circuit-breaker.ts'

// Plateformes LoL valides — re-validation défensive du `platform` lu depuis le
// pending JSONB avant toute construction d'URL Riot (anti-SSRF résiduel, même si
// riot-link-init a déjà validé à l'écriture).
const ROUTING: Record<string, string> = {
  euw1: 'europe', eun1: 'europe', tr1: 'europe', ru: 'europe',
  na1: 'americas', br1: 'americas', la1: 'americas', la2: 'americas',
  kr: 'asia', jp1: 'asia',
  oc1: 'sea', sg2: 'sea', tw2: 'sea', vn2: 'sea', ph2: 'sea', th2: 'sea',
}

Deno.serve(async (req) => {
  const cors = handleCors(req)
  if (cors) return cors

  try {
    // ── Auth ──────────────────────────────────────────────────────────────────
    const user = await getUser(req)
    if (!user) return jsonResponse({ error: 'Authentification requise.' }, 401)

    // ── Rate limit IP — protège l'oracle RiotID→PUUID contre l'abus ───────────
    if (await isRateLimited(req, 'riot-link-verify')) {
      return jsonResponse({ error: 'Trop de requêtes. Réessaie dans une minute.' }, 429)
    }

    const serviceUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = requireSecret('SUPABASE_SERVICE_ROLE_KEY')
    const db = createClient(serviceUrl, serviceKey)

    // ── Étape 1 : Lire le pending ─────────────────────────────────────────────
    const { data: profile } = await db
      .from('profiles')
      .select('riot_link_pending, riot_link_expires_at')
      .eq('id', user.id)
      .single()

    if (!profile?.riot_link_pending) {
      return jsonResponse({ error: 'Aucune vérification en attente.' }, 400)
    }

    // Vérification expiration
    const expiresAt = new Date(profile.riot_link_expires_at)
    if (expiresAt <= new Date()) {
      // Nettoyer le pending expiré pour laisser l'utilisateur recommencer proprement
      await db
        .from('profiles')
        .update({ riot_link_pending: null, riot_link_expires_at: null })
        .eq('id', user.id)
      return jsonResponse({ error: 'Délai expiré. Recommence la liaison.' }, 400)
    }

    const pending = profile.riot_link_pending as {
      target_icon:     number
      candidate_puuid: string
      platform:        string
      game_name:       string
      tag_line:        string
      last_verify_at?: string
    }

    // ── Anti-spam : cooldown de 5 secondes entre deux tentatives ─────────────
    // On stocke last_verify_at dans le JSONB du pending pour ne pas avoir besoin
    // d'une colonne supplémentaire. On le met à jour à chaque appel.
    if (pending.last_verify_at) {
      const lastVerify = new Date(pending.last_verify_at)
      const elapsed = Date.now() - lastVerify.getTime()
      if (elapsed < 5000) {
        return jsonResponse({ error: 'Trop rapide. Attends quelques secondes avant de réessayer.' }, 429)
      }
    }

    // Mettre à jour last_verify_at dans le JSONB (fire-and-forget — on ne bloque pas
    // sur cette mise à jour, l'anti-spam sera légèrement optimiste en cas de race)
    const updatedPending = { ...pending, last_verify_at: new Date().toISOString() }
    db.from('profiles')
      .update({ riot_link_pending: updatedPending })
      .eq('id', user.id)
      .then()

    const { candidate_puuid, platform, game_name, tag_line, target_icon } = pending

    // ── Étape 2 : Re-vérifier l'unicité du PUUID ─────────────────────────────
    // Un autre utilisateur a pu lier ce PUUID entre l'init et le verify.
    const { data: existing } = await db
      .from('profiles')
      .select('id')
      .eq('riot_puuid', candidate_puuid)
      .neq('id', user.id)
      .maybeSingle()

    if (existing) {
      // Nettoyer le pending — le challenge ne peut plus aboutir
      await db
        .from('profiles')
        .update({ riot_link_pending: null, riot_link_expires_at: null })
        .eq('id', user.id)
      return jsonResponse(
        { error: 'Ce compte Riot est déjà lié à un autre compte Wyrm Forge.' },
        409,
      )
    }

    // ── Étape 3 : Lire l'icône actuelle via Summoner-V4 ───────────────────────
    // Re-validation SSRF : le platform vient du pending JSONB — on refuse toute
    // valeur hors liste blanche avant de l'injecter dans l'hostname de l'URL.
    if (!Object.hasOwn(ROUTING, platform)) {
      return jsonResponse({ error: 'Région invalide.' }, 400)
    }

    // Circuit breaker quota Riot quotidien — avant l'appel réel.
    if (await isCircuitOpen()) {
      return jsonResponse({ error: 'Service temporairement indisponible. Réessaie plus tard.' }, 503)
    }

    const apiKey  = requireSecret('RIOT_API_KEY')
    const headers = { 'X-Riot-Token': apiKey }

    const sumRes = await fetch(
      `https://${platform}.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${encodeURIComponent(candidate_puuid)}`,
      { headers },
    )

    if (!sumRes.ok) {
      if (sumRes.status === 429) return jsonResponse({ error: 'Trop de requêtes vers Riot. Réessaie dans quelques secondes.' }, 429)
      return jsonResponse({ error: `Erreur Riot API (${sumRes.status}).` }, 503)
    }

    const { profileIconId } = await sumRes.json()
    const currentIcon: number = profileIconId ?? 0

    // Comptabilise l'appel Riot réellement émis (summoner-v4).
    await incrementQuota('riot-link-verify', 1)

    // ── Étape 4 : Comparer l'icône actuelle à la cible ───────────────────────
    if (currentIcon === target_icon) {
      // Match ! On grave la liaison dans la DB et on nettoie le pending.
      const { error: linkErr } = await db
        .from('profiles')
        .update({
          riot_puuid:          candidate_puuid,
          riot_gamename:       game_name,
          riot_tagline:        tag_line,
          riot_platform:       platform,
          riot_link_pending:   null,
          riot_link_expires_at: null,
        })
        .eq('id', user.id)

      if (linkErr) {
        console.error('riot-link-verify: link error', linkErr)
        return jsonResponse({ error: 'Erreur lors de la liaison du compte.' }, 500)
      }

      return jsonResponse({ success: true, game_name, tag_line, platform }, 200)
    }

    // Icône non détectée — on laisse le pending intact pour que l'utilisateur
    // puisse réessayer tant que la fenêtre de 15 min n'est pas écoulée.
    return jsonResponse(
      { error: 'Icône non détectée. Vérifie que tu as bien changé ton icône, puis réessaie.' },
      400,
    )

  } catch (e) {
    console.error('riot-link-verify: unhandled exception', e instanceof Error ? e.message : String(e))
    return jsonResponse({ error: 'Erreur serveur inattendue.' }, 500)
  }
})
