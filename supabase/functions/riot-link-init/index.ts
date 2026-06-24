// Edge Function : initialise la liaison compte Riot ↔ compte Wyrm Forge.
// Mécanisme : challenge icône d'invocateur — on génère une icône-cible que
// l'utilisateur doit équiper, prouvant ainsi qu'il possède le compte Riot.
//
// Appel : POST /functions/v1/riot-link-init
// Headers : Authorization: Bearer <JWT>
// Body JSON : { gameName, tagLine, platform }
//
// Réponse succès : { target_icon_id: number, expires_at: string }
import { createClient }                  from 'https://esm.sh/@supabase/supabase-js@2'
import { handleCors, jsonResponse }      from '../_shared/cors.ts'
import { getUser, requireSecret }        from '../_shared/auth.ts'
import { isRateLimited }                 from '../_shared/rate-limit.ts'
import { isCircuitOpen, incrementQuota } from '../_shared/circuit-breaker.ts'

// Icônes de profil par défaut (IDs 0–28) — universellement possédées par tous les
// comptes. On pioche dans cet ensemble pour s'assurer que l'utilisateur peut
// effectivement changer vers l'icône demandée sans déblocage préalable.
const DEFAULT_ICONS = Array.from({ length: 29 }, (_, i) => i) // [0, 1, …, 28]

// Mapping platform LoL → cluster régional Riot Account-V1.
// Doit rester en sync avec les autres Edge Functions (riot-rank, riot-matches…).
const ROUTING: Record<string, string> = {
  euw1: 'europe', eun1: 'europe', tr1: 'europe', ru: 'europe',
  na1: 'americas', br1: 'americas', la1: 'americas', la2: 'americas',
  kr: 'asia', jp1: 'asia',
  oc1: 'sea', sg2: 'sea', tw2: 'sea', vn2: 'sea', ph2: 'sea', th2: 'sea',
}

/**
 * Retourne un élément aléatoire du tableau `arr` différent de `exclude`.
 * Si tous les éléments sont égaux à `exclude` (cas limite), retourne quand même un
 * élément — le challenge sera moins fort mais on ne bloque pas l'utilisateur.
 */
function pickDifferentRandom(arr: number[], exclude: number): number {
  const candidates = arr.filter(n => n !== exclude)
  const pool = candidates.length > 0 ? candidates : arr
  return pool[Math.floor(Math.random() * pool.length)]
}

Deno.serve(async (req) => {
  // Preflight CORS — obligatoire pour les appels depuis le navigateur
  const cors = handleCors(req)
  if (cors) return cors

  try {
    // ── Auth ──────────────────────────────────────────────────────────────────
    const user = await getUser(req)
    if (!user) return jsonResponse({ error: 'Authentification requise.' }, 401)

    // ── Rate limit IP — protège l'oracle RiotID→PUUID contre l'abus ───────────
    if (await isRateLimited(req, 'riot-link-init')) {
      return jsonResponse({ error: 'Trop de requêtes. Réessaie dans une minute.' }, 429)
    }

    // ── Circuit breaker quota Riot quotidien ──────────────────────────────────
    if (await isCircuitOpen()) {
      return jsonResponse({ error: 'Service temporairement indisponible. Réessaie plus tard.' }, 503)
    }

    // ── Lecture du body JSON ─────────────────────────────────────────────────
    let gameName: string, tagLine: string, platform: string
    try {
      const body = await req.json()
      gameName = (body.gameName ?? '').trim()
      tagLine  = (body.tagLine  ?? '').trim()
      platform = (body.platform ?? 'euw1').trim().toLowerCase()
    } catch {
      return jsonResponse({ error: 'Corps JSON invalide.' }, 400)
    }

    if (!gameName || !tagLine) {
      return jsonResponse({ error: 'gameName et tagLine requis.' }, 400)
    }

    // Validation de la plateforme — évite l'injection SSRF via hostname
    if (!Object.hasOwn(ROUTING, platform)) {
      return jsonResponse({ error: 'Région invalide.' }, 400)
    }

    const regional = ROUTING[platform]
    const apiKey   = requireSecret('RIOT_API_KEY')
    const headers  = { 'X-Riot-Token': apiKey }

    // ── Étape 1 : Résoudre le PUUID via Account-V1 ───────────────────────────
    const acctRes = await fetch(
      `https://${regional}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`,
      { headers },
    )

    if (!acctRes.ok) {
      if (acctRes.status === 404) return jsonResponse({ error: 'Invocateur introuvable.' }, 404)
      if (acctRes.status === 429) return jsonResponse({ error: 'Trop de requêtes vers Riot. Réessaie dans quelques secondes.' }, 429)
      return jsonResponse({ error: `Erreur Riot API (${acctRes.status}).` }, 503)
    }

    const { puuid } = await acctRes.json()

    // ── Étape 2 : Vérifier l'unicité du PUUID ────────────────────────────────
    // Un PUUID ne peut être lié qu'à un seul compte Wyrm Forge.
    // On utilise service_role pour bypass RLS — la colonne riot_puuid n'est pas
    // accessible via les policies SELECT anon/authenticated.
    const serviceUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = requireSecret('SUPABASE_SERVICE_ROLE_KEY')
    const db = createClient(serviceUrl, serviceKey)

    const { data: existing } = await db
      .from('profiles')
      .select('id')
      .eq('riot_puuid', puuid)
      .neq('id', user.id)
      .maybeSingle()

    if (existing) {
      return jsonResponse(
        { error: 'Ce compte Riot est déjà lié à un autre compte Wyrm Forge.' },
        409,
      )
    }

    // ── Étape 3 : Lire l'icône actuelle via Summoner-V4 ───────────────────────
    const sumRes = await fetch(
      `https://${platform}.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${encodeURIComponent(puuid)}`,
      { headers },
    )

    if (!sumRes.ok) {
      if (sumRes.status === 429) return jsonResponse({ error: 'Trop de requêtes vers Riot. Réessaie dans quelques secondes.' }, 429)
      return jsonResponse({ error: `Erreur Riot API (${sumRes.status}).` }, 503)
    }

    const { profileIconId } = await sumRes.json()
    const currentIcon: number = profileIconId ?? 0

    // Comptabilise les 2 appels Riot réellement émis (account-v1 + summoner-v4).
    await incrementQuota('riot-link-init', 2)

    // ── Étape 4 : Tirer l'icône-cible (différente de l'icône actuelle) ────────
    const targetIcon = pickDifferentRandom(DEFAULT_ICONS, currentIcon)

    // ── Étape 5 : Écrire le pending dans profiles ─────────────────────────────
    // On stocke toutes les infos du challenge dans un JSONB pour les retrouver
    // lors du verify sans avoir à refaire un appel Account-V1.
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString()

    const pending = {
      target_icon:    targetIcon,
      candidate_puuid: puuid,
      platform,
      game_name:      gameName,
      tag_line:       tagLine,
    }

    const { error: updateErr } = await db
      .from('profiles')
      .update({
        riot_link_pending:    pending,
        riot_link_expires_at: expiresAt,
      })
      .eq('id', user.id)

    if (updateErr) {
      console.error('riot-link-init: update error', updateErr)
      return jsonResponse({ error: 'Erreur lors de l\'initialisation du challenge.' }, 500)
    }

    // ── Étape 6 : Réponse ────────────────────────────────────────────────────
    return jsonResponse({ target_icon_id: targetIcon, expires_at: expiresAt }, 200)

  } catch (e) {
    console.error('riot-link-init: unhandled exception', e instanceof Error ? e.message : String(e))
    return jsonResponse({ error: 'Erreur serveur inattendue.' }, 500)
  }
})
