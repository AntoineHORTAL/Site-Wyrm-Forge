// Edge Function : rotation gratuite des champions LoL.
// Accès public — données publiques Riot, clé protégée côté serveur.
//
// Appel : GET /functions/v1/riot-rotation?platform=euw1
// Headers : apikey: <SUPABASE_ANON_KEY>
//
// Réponse : { freeChampionIds: number[], freeChampionIdsForNewPlayers: number[], maxNewPlayerLevel: number }
import { handleCors, jsonResponse } from '../_shared/cors.ts'
import { requireSecret } from '../_shared/auth.ts'
import { cacheGet, cacheSet, cacheGetStale } from '../_shared/cache.ts'
import { isRateLimited } from '../_shared/rate-limit.ts'
import { isCircuitOpen, incrementQuota, secondsUntilMidnightUtc } from '../_shared/circuit-breaker.ts'

const FN = 'riot-rotation'

const ROUTING: Record<string, string> = {
  euw1: 'europe', eun1: 'europe', tr1: 'europe', ru: 'europe',
  na1: 'americas', br1: 'americas', la1: 'americas', la2: 'americas', oc1: 'americas',
  kr: 'asia', jp1: 'asia',
}

// ── Expiration hebdomadaire du cache ────────────────────────────────────────
// La rotation gratuite change UNE FOIS PAR SEMAINE, le mardi (heure US).
// ⚠️ APPROXIMATION ASSUMÉE : l'API ne renvoie AUCUN timestamp de fin de rotation
// (réponse limitée aux clés { sr, newplayer } — vérifié en prod ; le
// champion-rotations-v3 standard de Riot n'expose pas non plus de date de fin).
// Faute de donnée réelle, on cale l'expiration sur le prochain mardi 12:00 UTC.
// - 12:00 UTC : se situe après le basculement (tôt le mardi, matinée US) pour
//   limiter la fenêtre où l'ancienne rotation serait encore servie.
// - Limite connue : si Riot décale exceptionnellement le jour (ex. pour éviter
//   un jour de patch), la nouvelle rotation peut être servie en retard jusqu'au
//   mardi suivant. Compromis accepté — objectif : ~1 appel Riot / semaine.
const ROTATION_FLIP_DOW  = 2   // mardi (0=dim, 1=lun, 2=mar, …)
const ROTATION_FLIP_HOUR = 12  // 12:00 UTC

/** Retourne le prochain mardi 12:00 UTC STRICTEMENT postérieur à `from` (ISO). */
function nextRotationExpiryIso(from: Date = new Date()): string {
  const d = new Date(Date.UTC(
    from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate(),
    ROTATION_FLIP_HOUR, 0, 0, 0,
  ))
  while (d <= from || d.getUTCDay() !== ROTATION_FLIP_DOW) {
    d.setUTCDate(d.getUTCDate() + 1)
  }
  return d.toISOString()
}

Deno.serve(async (req) => {
  const cors = handleCors(req)
  if (cors) return cors

  try {
    const url      = new URL(req.url)
    const platform = url.searchParams.get('platform') ?? 'euw1'

    // Validate platform against known list to prevent SSRF via hostname injection
    if (!Object.hasOwn(ROUTING, platform)) {
      return jsonResponse({ error: 'Région invalide.' }, 400)
    }

    // Rate limiting — blocks bots before any DB/Riot work
    if (await isRateLimited(req, FN)) {
      return jsonResponse({ error: 'Trop de requêtes. Réessaie dans une minute.' }, 429)
    }

    const cacheKey = `rotation:${platform}`

    // Cache read (fresh)
    const cached = await cacheGet(cacheKey)
    if (cached !== null) {
      return jsonResponse(cached, 200, { 'X-Cache': 'HIT' })
    }

    // Circuit breaker — check before any real Riot call
    if (await isCircuitOpen()) {
      const stale = await cacheGetStale(cacheKey)
      if (stale !== null) {
        return jsonResponse(stale, 200, { 'X-Cache': 'STALE' })
      }
      return jsonResponse(
        { error: 'Service temporairement indisponible.', reason: 'quota_exceeded', resets_in: secondsUntilMidnightUtc() },
        503,
      )
    }

    const apiKey = requireSecret('RIOT_API_KEY')

    const res = await fetch(
      `https://${platform}.api.riotgames.com/lol/platform/v3/champion-rotations`,
      { headers: { 'X-Riot-Token': apiKey } },
    )

    if (!res.ok) {
      // R1 : l'appel Riot a été consommé → il compte, même en échec.
      // Pas de cache négatif ici : `platform` est déjà validé contre ROUTING, un
      // 404 n'est pas atteignable par une entrée client — tout échec est transitoire.
      await incrementQuota(FN, 1)
      // Never forward Riot's error body — it may contain internal details (C1 fix)
      return jsonResponse({ error: `Riot API ${res.status}` }, res.status)
    }

    const raw = await res.json()

    // Normalisation du contrat de données consommé par le front (freeChampionIds).
    // L'upstream renvoie actuellement les clés abrégées { sr, newplayer } ; on
    // accepte aussi le format Riot standard { freeChampionIds, ... } au cas où
    // l'upstream y reviendrait. Sans ça, le front lit `undefined.map()` → throw →
    // rotation vide → message trompeur « clé API non configurée ou expirée ».
    const data = {
      freeChampionIds:              raw.freeChampionIds              ?? raw.sr        ?? [],
      freeChampionIdsForNewPlayers: raw.freeChampionIdsForNewPlayers ?? raw.newplayer ?? [],
      maxNewPlayerLevel:            raw.maxNewPlayerLevel            ?? null,
    }
    // Cache calé sur le prochain basculement de rotation (≈ 1 appel Riot/semaine)
    // plutôt que sur le TTL plat par défaut.
    await cacheSet(cacheKey, FN, data, nextRotationExpiryIso())
    await incrementQuota(FN)

    return jsonResponse(data, 200, { 'X-Cache': 'MISS' })
  } catch (e) {
    console.error('riot-rotation: unhandled exception', e instanceof Error ? e.message : String(e))
    return jsonResponse({ error: 'Erreur serveur inattendue.' }, 500)
  }
})
