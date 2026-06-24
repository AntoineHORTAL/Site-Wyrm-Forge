// Edge Function : réclamation d'une quête journalière.
//
// Appel : POST /functions/v1/quest-claim
// Headers : Authorization: Bearer <JWT>
// Body JSON : { quest_slug: string }
//
// Réponse succès : { success: true, quest_name: string, reward: number, capped: false }
// Réponse cap    : { success: false, capped: true, reward: 0 }
//
// La finalisation DB (insertion quest_completions + crédit Écailles) est atomique
// via la fonction SECURITY DEFINER `finalize_quest_claim`. L'EF orchestre et
// mappe les erreurs métier en codes HTTP lisibles.
//
// Note comportement daily_cap_reached :
//   finalize_quest_claim est une transaction atomique : si elle raise 'daily_cap_reached',
//   RIEN n'est inséré (ni completion, ni ledger). On ne peut donc pas "créditer 0 mais
//   compter le streak" sans modifier la fonction DB (hors scope). On mappe cette erreur
//   en HTTP 200 + { success: false, capped: true } pour que le front l'affiche proprement
//   sans erreur rouge, sans prétendre que la completion a été inscrite.
import { createClient }             from 'https://esm.sh/@supabase/supabase-js@2'
import { handleCors, jsonResponse } from '../_shared/cors.ts'
import { getUser, requireSecret }   from '../_shared/auth.ts'
import { isFeatureEnabled }         from '../_shared/feature-flags.ts'
import { isRateLimited }            from '../_shared/rate-limit.ts'
import { selectDailySet }           from '../_shared/daily-quests.ts'
import type { QuestDef }            from '../_shared/daily-quests.ts'

// Mapping platform LoL → cluster régional Match-V5 / Account-V1.
// Copie locale volontaire — chaque EF doit être déployable indépendamment
// sans dépendre d'un module partagé qui pourrait ne pas exister.
const ROUTING: Record<string, string> = {
  euw1: 'europe', eun1: 'europe', tr1: 'europe', ru: 'europe',
  na1: 'americas', br1: 'americas', la1: 'americas', la2: 'americas',
  kr: 'asia', jp1: 'asia',
  oc1: 'sea', sg2: 'sea', tw2: 'sea', vn2: 'sea', ph2: 'sea', th2: 'sea',
}

// ── Helper : résolution de la queue criteria → tableau d'IDs de file ─────────
// "ranked" signifie l'union Solo/Duo (420) + Flex (440).
// Documente la sémantique du champ `queue` dans le JSONB criteria.
function resolveQueue(queue: number | string | undefined): number[] {
  if (queue === 420 || queue === '420') return [420]
  if (queue === 440 || queue === '440') return [440]
  if (queue === 'ranked')               return [420, 440]
  return [420] // défaut : Solo/Duo
}

// ── Helper : chargement des match IDs Riot pour une fenêtre UTC ──────────────
// Si plusieurs queues sont demandées, les appels sont parallèles et les IDs
// résultants sont dédupliqués (un match ne peut pas appartenir aux deux files,
// mais on dédup par sécurité pour la logique win-count).
async function fetchMatchIds(
  puuid: string,
  regional: string,
  queues: number[],
  startEpoch: number,
  endEpoch: number,
  riotHeaders: HeadersInit,
): Promise<{ ids: string[]; riotError: 429 | 503 | null }> {
  try {
    const requests = queues.map(q =>
      fetch(
        `https://${regional}.api.riotgames.com/lol/match/v5/matches/by-puuid/${encodeURIComponent(puuid)}/ids` +
        `?queue=${q}&start=0&count=100&startTime=${startEpoch}&endTime=${endEpoch}`,
        { headers: riotHeaders },
      ),
    )

    const responses = await Promise.all(requests)

    // Vérifier les codes d'erreur avant de parser le JSON
    for (const res of responses) {
      if (!res.ok) {
        if (res.status === 429) return { ids: [], riotError: 429 }
        return { ids: [], riotError: 503 }
      }
    }

    // Parser en parallèle et aplatir — Set élimine les doublons éventuels
    const arrays = await Promise.all(responses.map(r => r.json() as Promise<string[]>))
    const ids = [...new Set(arrays.flat())]
    return { ids, riotError: null }

  } catch {
    return { ids: [], riotError: 503 }
  }
}

Deno.serve(async (req) => {
  // ── Preflight CORS ────────────────────────────────────────────────────────
  const cors = handleCors(req)
  if (cors) return cors

  try {
    // ── Étape 1 — Feature flag ────────────────────────────────────────────
    // Vérifié EN PREMIER, avant même de parser le JWT, pour économiser
    // un aller-retour Auth inutile quand les quêtes sont désactivées.
    // isFeatureEnabled est fail-closed : une erreur DB retourne false.
    const enabled = await isFeatureEnabled('quests_enabled')
    if (!enabled) {
      return jsonResponse({ error: 'Les quêtes sont actuellement désactivées.' }, 403)
    }

    // Rate limit par IP — après le flag (évite les appels DB si feature off),
    // avant le JWT (protège contre le credential stuffing).
    if (await isRateLimited(req, 'quest-claim')) {
      return jsonResponse({ error: 'Trop de requêtes. Réessaie dans une minute.' }, 429)
    }

    // ── Étape 2 — Auth ───────────────────────────────────────────────────
    const user = await getUser(req)
    if (!user) return jsonResponse({ error: 'Authentification requise.' }, 401)

    // ── Étape 3 — Parsing body ───────────────────────────────────────────
    // On tente le parse séparément pour distinguer JSON malformé (400)
    // d'un champ manquant (400 avec message ciblé).
    let body: unknown
    try {
      body = await req.json()
    } catch {
      return jsonResponse({ error: 'Corps de requête invalide (JSON attendu).' }, 400)
    }

    const quest_slug = (body as Record<string, unknown>)?.quest_slug
    if (!quest_slug || typeof quest_slug !== 'string') {
      return jsonResponse({ error: 'quest_slug invalide.' }, 400)
    }

    // ── Étape 4 — Charger le pool + lire la définition ───────────────────
    // service_role bypass RLS — quest_definitions n'a pas de policy anon/auth
    const db = createClient(
      Deno.env.get('SUPABASE_URL')!,
      requireSecret('SUPABASE_SERVICE_ROLE_KEY'),
    )

    // On charge le pool complet (éligible au tirage) pour :
    //   a) Trouver la définition de la quête demandée
    //   b) Calculer le set du jour et valider que la quête en fait partie
    const { data: poolData, error: poolErr } = await db
      .from('quest_definitions')
      .select('slug, name, category, reward, criteria, cost_tier, pool_eligible')
      .eq('is_active', true)
      .eq('pool_eligible', true)

    if (poolErr) {
      console.error('quest-claim: erreur lecture pool', poolErr)
      return jsonResponse({ error: 'Erreur serveur lors de la lecture des quêtes.' }, 500)
    }

    const pool = (poolData ?? []) as QuestDef[]

    // Trouver la définition de la quête demandée dans le pool
    const quest = pool.find(q => q.slug === quest_slug)
    if (!quest) return jsonResponse({ error: 'Quête inconnue ou désactivée.' }, 404)

    // ── Étape 5 — Calcul du jour UTC (horloge serveur) ───────────────────
    // On utilise explicitement UTC pour que la fenêtre journalière soit
    // cohérente quelle que soit la timezone du serveur Deno Deploy.
    const now          = new Date()
    const todayUTC     = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
    const dayStr       = todayUTC.toISOString().split('T')[0] // 'YYYY-MM-DD' pour la DB
    const todayStartEpoch = Math.floor(todayUTC.getTime() / 1000)  // epoch seconds pour Riot API
    const todayEndEpoch   = todayStartEpoch + 86400

    // Garde-fou set du jour : calculé CÔTÉ SERVEUR avec le même algorithme que
    // quest-status, garantissant que le slug réclamé est bien dans le set affiché.
    // Empêche de réclamer une quête hors-set en forgeant la requête manuellement.
    const dailySet = selectDailySet(dayStr, pool)
    if (!dailySet.some(q => q.slug === quest_slug)) {
      return jsonResponse(
        { error: 'Cette quête ne fait pas partie du set du jour.' },
        403,
      )
    }

    // ── Étape 6 — Dédup préventif (non-authoritative) ────────────────────
    // Vérification légère AVANT l'appel Riot pour éviter une requête inutile
    // si la quête est déjà réclamée. Le vrai garde-fou idempotent est dans
    // la contrainte UNIQUE de `quest_completions` + la fonction DB.
    const { data: existing } = await db
      .from('quest_completions')
      .select('id')
      .eq('user_id', user.id)
      .eq('quest_slug', quest_slug)
      .eq('day', dayStr)
      .maybeSingle()

    if (existing) return jsonResponse({ error: 'Quête déjà réclamée aujourd\'hui.' }, 409)

    // ── Étape 7 — Vérification de l'action selon la catégorie ────────────
    // Dispatch sur criteria.type — data-driven, extensible sans redéploiement.
    // Le criteria est un JSONB nullable (migration 20260606000008).
    const criteria = quest.criteria as Record<string, unknown> | null

    if (quest.category === 'lol') {
      // Récupérer le profil Riot du user — nécessaire pour appeler Riot API
      const { data: profile } = await db
        .from('profiles')
        .select('riot_puuid, riot_platform')
        .eq('id', user.id)
        .maybeSingle()

      if (!profile?.riot_puuid) {
        return jsonResponse(
          { error: 'Tu dois d\'abord lier ton compte Riot (Mon compte Riot dans le dashboard).' },
          403,
        )
      }

      // Fallback plateforme documenté dans AGENTS.md
      const platform    = profile.riot_platform ?? 'euw1'
      // Validation SSRF : si la plateforme DB est corrompue, on bloque sur 'europe'
      const regional    = ROUTING[platform] ?? 'europe'
      const apiKey      = requireSecret('RIOT_API_KEY')
      const riotHeaders = { 'X-Riot-Token': apiKey }

      // Résolution queue : criteria.queue peut être un number (420/440) ou "ranked"
      const queues = resolveQueue(criteria?.queue as number | string | undefined)

      // Chargement des IDs de matchs — appels parallèles si multi-queue
      const { ids: matchIds, riotError } = await fetchMatchIds(
        profile.riot_puuid,
        regional,
        queues,
        todayStartEpoch,
        todayEndEpoch,
        riotHeaders,
      )

      if (riotError === 429) {
        return jsonResponse(
          { error: 'Trop de requêtes vers Riot. Réessaie dans quelques secondes.' },
          429,
        )
      }
      if (riotError === 503) {
        return jsonResponse({ error: 'Erreur lors de la vérification de tes parties.' }, 503)
      }

      const criteriaType = criteria?.type as string | undefined
      const count        = (criteria?.count as number | undefined) ?? 1

      if (criteriaType === 'play') {
        // Vérifie qu'au moins `count` parties ont été jouées — pas besoin du détail
        if (matchIds.length < count) {
          const label = queues.length > 1 ? 'classée' : queues[0] === 440 ? 'Flex' : 'classée Solo/Duo'
          return jsonResponse(
            { error: `Pas encore ${count} partie(s) ${label} aujourd'hui (UTC).` },
            400,
          )
        }
      } else if (criteriaType === 'win') {
        // Parcours break-early — on cherche `count` victoires parmi les matchs du jour.
        // On s'arrête dès qu'on en a assez pour minimiser les appels Riot.
        if (matchIds.length === 0) {
          return jsonResponse(
            { error: 'Aucune partie classée trouvée aujourd\'hui (UTC).' },
            400,
          )
        }

        let wonCount = 0
        for (const mid of matchIds) {
          if (wonCount >= count) break

          const mRes = await fetch(
            `https://${regional}.api.riotgames.com/lol/match/v5/matches/${encodeURIComponent(mid)}`,
            { headers: riotHeaders },
          )

          if (mRes.status === 429) {
            return jsonResponse(
              { error: 'Trop de requêtes vers Riot. Réessaie dans quelques secondes.' },
              429,
            )
          }
          if (!mRes.ok) continue // tolère les erreurs individuelles — on continue d'essayer

          const mData = await mRes.json()
          const participant = mData?.info?.participants?.find(
            (p: { puuid: string; win: boolean }) => p.puuid === profile.riot_puuid,
          )
          if (participant?.win) wonCount++
        }

        if (wonCount < count) {
          return jsonResponse(
            { error: `Pas encore ${count} victoire(s) classée(s) aujourd'hui (UTC).` },
            400,
          )
        }
      } else if (criteriaType === 'cs') {
        // Vérifie qu'au moins un match du jour atteint le seuil de CS demandé.
        // Break-early dès qu'on trouve un match satisfaisant.
        const threshold = (criteria?.threshold as number | undefined) ?? 0
        if (matchIds.length === 0) {
          return jsonResponse(
            { error: 'Aucune partie classée trouvée aujourd\'hui (UTC).' },
            400,
          )
        }

        let satisfied = false
        for (const mid of matchIds) {
          if (satisfied) break

          const mRes = await fetch(
            `https://${regional}.api.riotgames.com/lol/match/v5/matches/${encodeURIComponent(mid)}`,
            { headers: riotHeaders },
          )

          if (mRes.status === 429) {
            return jsonResponse(
              { error: 'Trop de requêtes vers Riot. Réessaie dans quelques secondes.' },
              429,
            )
          }
          if (!mRes.ok) continue

          const mData = await mRes.json()
          const participant = mData?.info?.participants?.find(
            (p: { puuid: string; totalMinionsKilled: number; neutralMinionsKilled: number }) =>
              p.puuid === profile.riot_puuid,
          )
          if (!participant) continue

          const totalCs = (participant.totalMinionsKilled ?? 0) + (participant.neutralMinionsKilled ?? 0)
          if (totalCs >= threshold) satisfied = true
        }

        if (!satisfied) {
          return jsonResponse(
            { error: `Aucune partie avec ${threshold}+ CS trouvée aujourd'hui (UTC).` },
            400,
          )
        }
      } else {
        // Type de criteria lol inconnu — catégorie non gérée
        return jsonResponse({ error: 'Type de quête non supporté.' }, 400)
      }
    } else if (quest.category === 'app') {
      // Vérification data-driven sur app_events : criteria.type === 'app_event'
      // todayUTC.toISOString() = 'YYYY-MM-DDT00:00:00.000Z' → borne inférieure exacte minuit UTC
      const event      = criteria?.event as string | undefined
      const count      = (criteria?.count as number | undefined) ?? 1

      if (!event) {
        return jsonResponse({ error: 'Configuration de quête invalide (event manquant).' }, 400)
      }

      // Fenêtre UTC bornée [today, tomorrow) — borne haute explicite pour ne pas
      // compter d'événements postérieurs au jour courant.
      const tomorrowUTC = new Date(todayUTC.getTime() + 86_400_000)

      // On compte les ref_id DISTINCTS (anti-farm) : même avec la contrainte
      // UNIQUE uq_app_events_dedup, on dédoublonne explicitement et on ignore les
      // ref_id NULL pour qu'un événement sans référence ne puisse pas être farmé.
      const { data: evRows, error: evErr } = await db
        .from('app_events')
        .select('ref_id')
        .eq('user_id', user.id)
        .eq('event_type', event)
        .gte('created_at', todayUTC.toISOString())
        .lt('created_at', tomorrowUTC.toISOString())

      if (evErr) {
        console.error('quest-claim: erreur lecture app_events', evErr)
        return jsonResponse({ error: 'Erreur lors de la vérification de l\'action.' }, 500)
      }

      const eventCount = new Set(
        (evRows ?? []).map(r => r.ref_id).filter((r): r is string => r !== null),
      ).size

      if (eventCount < count) {
        return jsonResponse(
          { error: `Il te manque des actions pour valider cette quête (${eventCount}/${count}).` },
          400,
        )
      }
    } else {
      // Catégorie inconnue (ex: future catégorie non encore gérée par cette version)
      return jsonResponse({ error: 'Catégorie de quête non supportée.' }, 400)
    }

    // ── Étape 8 — Finalisation atomique (DB) ─────────────────────────────
    // La fonction DB `finalize_quest_claim` gère atomiquement :
    //   1. Re-vérification du dédup (contrainte UNIQUE quest_completions)
    //   2. Vérification du plafond journalier d'Écailles
    //   3. Insertion de la completion + crédit du solde + mise à jour streak
    // Les RAISE EXCEPTION de la fonction remontent dans claimErr.message.
    const { error: claimErr } = await db.rpc('finalize_quest_claim', {
      p_user_id:    user.id,
      p_quest_slug: quest_slug,
      p_day:        dayStr,
      p_reward:     quest.reward,
    })

    if (claimErr) {
      const msg = claimErr.message ?? ''
      if (msg.includes('already_claimed')) {
        return jsonResponse({ error: 'Quête déjà réclamée aujourd\'hui.' }, 409)
      }
      if (msg.includes('daily_cap_reached')) {
        // finalize_quest_claim a rollbacké toute la transaction : ni completion
        // ni ledger n'ont été insérés. On retourne 200 (pas d'erreur utilisateur)
        // avec capped: true pour que le front affiche "Plafond atteint" sans erreur rouge.
        return jsonResponse({ success: false, capped: true, reward: 0 }, 200)
      }
      console.error('quest-claim: DB error', claimErr)
      return jsonResponse({ error: 'Erreur lors de la réclamation.' }, 500)
    }

    return jsonResponse({
      success:    true,
      quest_name: quest.name as string,
      reward:     quest.reward as number,
      capped:     false,
    }, 200)

  } catch (e) {
    console.error('quest-claim: unhandled exception', e instanceof Error ? e.message : String(e))
    return jsonResponse({ error: 'Erreur serveur inattendue.' }, 500)
  }
})
