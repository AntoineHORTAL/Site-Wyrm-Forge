// Edge Function : lecture de l'état des quêtes du jour pour l'utilisateur connecté.
//
// Appel : GET (ou POST sans body) /functions/v1/quest-status
// Headers : Authorization: Bearer <JWT>
//
// Réponse : { day, streak, earned_today, cap, quests[] }
//   quests[].progress : { current, target } pour les quêtes app_event, null pour lol
//
// Contrairement à quest-claim, le flag `quests_enabled` N'EST PAS vérifié ici.
// Une EF de lecture pure doit rester disponible même quand les quêtes sont off :
// le client peut ainsi afficher un écran "désactivé" avec les définitions statiques
// plutôt qu'une erreur 403 opaque. Les quêtes seront toutes `completed_today: false`
// puisqu'aucune completion n'est possible en mode désactivé.
//
// Cette EF ne fait AUCUN INSERT/UPDATE — lecture pure uniquement.
import { createClient }             from 'https://esm.sh/@supabase/supabase-js@2'
import { handleCors, jsonResponse } from '../_shared/cors.ts'
import { getUser, requireSecret }   from '../_shared/auth.ts'
import { selectDailySet }           from '../_shared/daily-quests.ts'
import type { QuestDef }            from '../_shared/daily-quests.ts'

Deno.serve(async (req) => {
  // ── Preflight CORS ──────────────────────────────────────────────────────────
  const cors = handleCors(req)
  if (cors) return cors

  try {
    // ── Auth ────────────────────────────────────────────────────────────────
    // Pas de feature flag ici — cf. note en tête de fichier.
    const user = await getUser(req)
    if (!user) return jsonResponse({ error: 'Authentification requise.' }, 401)

    // ── Calcul du jour UTC (horloge serveur) ─────────────────────────────────
    // Pattern identique à quest-claim : fenêtre journalière alignée sur minuit
    // UTC quelle que soit la timezone du runtime Deno Deploy.
    const now         = new Date()
    const todayUTC    = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
    const tomorrowUTC = new Date(todayUTC.getTime() + 86_400_000) // borne haute fenêtre
    const dayStr      = todayUTC.toISOString().split('T')[0] // 'YYYY-MM-DD'

    // ── Client DB ────────────────────────────────────────────────────────────
    // service_role bypass RLS — quest_definitions, quest_completions,
    // quest_streaks et app_events n'ont pas de policy SELECT pour authenticated.
    const db = createClient(
      Deno.env.get('SUPABASE_URL')!,
      requireSecret('SUPABASE_SERVICE_ROLE_KEY'),
    )

    // ── Quatre requêtes DB en parallèle ─────────────────────────────────────
    // On sépare intentionnellement les quêtes actives, les complétions du jour,
    // le streak et le cap plutôt que de tenter des JOINs via le client JS :
    //   - Plus lisible et maintenable
    //   - Évite les ambiguïtés de filtre sur la relation imbriquée (le filtre
    //     .eq sur une table jointe peut se comporter comme un INNER JOIN selon
    //     la version de supabase-js et la configuration PostgREST)
    //
    // earned_today : somme des rewards des complétions du jour, calculée via
    //   une jointure quest_definitions→quest_completions côté client JS (pas de
    //   RPC dédiée) — on charge les complétions avec leur reward associé.
    const [defsRes, completionsRes, streakRes, capRes] = await Promise.all([
      // Pool complet + éligible au tirage — selectDailySet filtre ensuite
      db
        .from('quest_definitions')
        .select('slug, name, category, reward, criteria, cost_tier, pool_eligible')
        .eq('is_active', true)
        .eq('pool_eligible', true),

      // Complétions du jour pour cet utilisateur — on joint le reward via quest_definitions
      // pour calculer earned_today sans RPC supplémentaire.
      // La jointure PostgREST `quest_definitions(reward)` suppose une FK déclarée.
      // Alternative choisie : charger les complétions + slugs, puis croiser en mémoire
      // avec le pool déjà chargé.
      db
        .from('quest_completions')
        .select('quest_slug')
        .eq('user_id', user.id)
        .eq('day', dayStr),

      db
        .from('quest_streaks')
        .select('current_streak, last_day')
        .eq('user_id', user.id)
        .maybeSingle(),

      // Lecture du cap journalier depuis app_settings (clé cap_daily_scales)
      db
        .from('app_settings')
        .select('value')
        .eq('key', 'cap_daily_scales')
        .maybeSingle(),
    ])

    // ── Gestion des erreurs DB ──────────────────────────────────────────────
    if (defsRes.error) {
      console.error('quest-status: erreur lecture quest_definitions', defsRes.error)
      return jsonResponse({ error: 'Erreur serveur lors de la lecture des quêtes.' }, 500)
    }
    if (completionsRes.error) {
      console.error('quest-status: erreur lecture quest_completions', completionsRes.error)
      return jsonResponse({ error: 'Erreur serveur lors de la lecture des complétions.' }, 500)
    }
    // streakRes.error et capRes.error ne sont pas bloquants — on peut répondre avec des valeurs par défaut
    if (streakRes.error) {
      console.error('quest-status: erreur lecture quest_streaks', streakRes.error)
    }
    if (capRes.error) {
      console.error('quest-status: erreur lecture cap_daily_scales', capRes.error)
    }

    // ── Calcul du set du jour ────────────────────────────────────────────────
    // Même algorithme que quest-claim → set identique pour le même dayStr + pool.
    // Garantit que status et claim sont cohérents sans état partagé entre EFs.
    const pool     = (defsRes.data ?? []) as QuestDef[]
    const dailySet = selectDailySet(dayStr, pool)

    // ── Données auxiliaires ──────────────────────────────────────────────────
    const completedSlugs = new Set(
      (completionsRes.data ?? []).map((c: { quest_slug: string }) => c.quest_slug),
    )

    // earned_today : somme des rewards des quêtes complétées aujourd'hui.
    // On croise les slugs complétés avec le pool pour retrouver le reward sans appel DB supplémentaire.
    const poolBySlug = new Map(pool.map(q => [q.slug, q]))
    const earnedToday = [...completedSlugs].reduce((sum, slug) => {
      const q = poolBySlug.get(slug)
      return sum + ((q?.reward as number | undefined) ?? 0)
    }, 0)

    // null si l'utilisateur n'a jamais complété de quête (maybeSingle → data = null)
    const streak = streakRes.data?.current_streak ?? null

    // cap_daily_scales : valeur numérique, défaut 12 si absent ou non parseable
    const cap = parseInt(capRes.data?.value ?? '12', 10) || 12

    // ── Calcul de la progression des quêtes app_event ────────────────────────
    // Pour les quêtes lol, on ne fait pas d'appel Riot ici — quest-status est
    // une EF de lecture pure qui doit rester rapide.
    // Pour les quêtes app_event du set du jour, on lit le compte d'app_events
    // en parallèle pour afficher une barre de progression côté client.

    // Identifier les quêtes app_event dans le set du jour
    const appEventQuests = dailySet.filter(
      q => q.category === 'app' && (q.criteria as Record<string, unknown> | null)?.type === 'app_event',
    )

    // Charger les counts en parallèle — une requête par quête app_event du set
    const progressResults = await Promise.all(
      appEventQuests.map(async (q) => {
        const criteria = q.criteria as Record<string, unknown>
        const event    = criteria?.event as string | undefined
        if (!event) return { slug: q.slug, current: 0 }

        // Fenêtre UTC bornée [today, tomorrow). La contrainte UNIQUE
        // uq_app_events_dedup garantit count(*) == count(DISTINCT ref_id).
        const { count: eventCount } = await db
          .from('app_events')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('event_type', event)
          .gte('created_at', todayUTC.toISOString())
          .lt('created_at', tomorrowUTC.toISOString())

        return { slug: q.slug, current: eventCount ?? 0 }
      }),
    )

    // Map slug → { current, target } pour injection dans la réponse
    const progressMap = new Map(
      progressResults.map(r => [r.slug, r.current]),
    )

    // ── Construction de la réponse ───────────────────────────────────────────
    const quests = dailySet.map((q) => {
      const criteria = q.criteria as Record<string, unknown> | null
      const isAppEvent = q.category === 'app' && criteria?.type === 'app_event'

      // progress : uniquement pour app_event — null pour lol (pas d'appel Riot ici)
      const progress = isAppEvent
        ? {
            current: progressMap.get(q.slug) ?? 0,
            target:  (criteria?.count as number | undefined) ?? 1,
          }
        : null

      return {
        slug:            q.slug,
        name:            q.name,
        category:        q.category,
        reward:          q.reward,
        completed_today: completedSlugs.has(q.slug),
        progress,
      }
    })

    return jsonResponse({ day: dayStr, streak, earned_today: earnedToday, cap, quests }, 200)

  } catch (e) {
    console.error('quest-status: unhandled exception', e instanceof Error ? e.message : String(e))
    return jsonResponse({ error: 'Erreur serveur inattendue.' }, 500)
  }
})
