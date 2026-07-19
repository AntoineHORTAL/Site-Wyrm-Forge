// Edge Function : quota de consultation du DÉTAIL d'un match pour les visiteurs
// anonymes (F3 Lot 2). SÉPARÉE du limiteur de recherche (Lot 1, clé `rate:ip:{ip}`).
//
// Deux actions, aucune donnée Riot n'est touchée ici :
//   • GET  → PEEK : lecture seule du quota (aucune mutation). Alimente l'affichage
//            « X/10 » sur les boutons « Voir tous les détails » de /matches.
//   • POST { matchId } → COMMIT : réserve un créneau pour ce match. Idempotent par
//            match dans la fenêtre (re-consulter le même match = gratuit). Refuse
//            (429) si le budget de 10 matchs distincts/h est atteint ET le match neuf.
//
// Le limiteur borne le nombre de MATCHS DISTINCTS (pas d'appels) — cf.
// `_shared/ip-rate-limit.ts`. Accès public (verify_jwt = false) : la clé anon suffit.
import { handleCors, jsonResponse } from '../_shared/cors.ts'
import { peekDetailRateLimit, commitDetailRateLimit, riotCacheDetailBackend, DETAIL_RATE_LIMIT } from '../_shared/ip-rate-limit.ts'

// Riot match IDs : préfixe région + underscore + ID numérique (ex. EUW1_1234567890).
const MATCH_ID_RE = /^[A-Z0-9]+_\d+$/

function sanitize(s: string): string {
  return s.replace(/[​-‏‪-‮⁠-⁯﻿]/g, '').trim()
}

Deno.serve(async (req) => {
  const cors = handleCors(req)
  if (cors) return cors

  const backend = riotCacheDetailBackend()

  try {
    // ── PEEK (lecture seule) — affichage du quota restant ────────────────────
    if (req.method === 'GET') {
      const peek = await peekDetailRateLimit(req, backend)
      return jsonResponse({
        limit:     peek.limit,
        used:      peek.used,
        remaining: peek.remaining,
        viewed:    peek.viewedIds,
      }, 200)
    }

    // ── COMMIT (réservation d'un créneau) — au clic sur « Voir les détails » ──
    if (req.method === 'POST') {
      const body    = await req.json().catch(() => null)
      const matchId = typeof body?.matchId === 'string' ? sanitize(body.matchId) : ''

      // Validation de forme (anti path-injection dans la clé de cache).
      if (!MATCH_ID_RE.test(matchId)) {
        return jsonResponse({ error: 'Format matchId invalide.' }, 400)
      }

      const c = await commitDetailRateLimit(req, backend, matchId)
      if (!c.allowed) {
        return jsonResponse(
          { allowed: false, remaining: 0, already_viewed: false, retry_after_s: c.retryAfterS, limit: DETAIL_RATE_LIMIT },
          429,
          { 'Retry-After': String(c.retryAfterS) },
        )
      }
      return jsonResponse(
        { allowed: true, remaining: c.remaining, already_viewed: c.alreadyViewed, limit: DETAIL_RATE_LIMIT },
        200,
      )
    }

    return jsonResponse({ error: 'Méthode non autorisée.' }, 405)
  } catch (e) {
    console.error('detail-quota: unhandled exception', e instanceof Error ? e.message : String(e))
    return jsonResponse({ error: 'Erreur serveur inattendue.' }, 500)
  }
})
