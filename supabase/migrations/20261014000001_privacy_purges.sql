-- Purges automatiques des données de joueurs et des IP (chantier confidentialité).
--
-- Principe : le code tient ce que promet la politique de confidentialité, pas
-- l'inverse. Mesuré en PROD le 2026-10-14 avant cette migration : seuls deux
-- jobs pg_cron existaient (purge_riot_rate_limits, subscription-emails-drain).
-- Rien ne purgeait rank_stat_samples (« un an au maximum » promis),
-- riot_cache (206 lignes expirées gardées, dont des IP en clair dans les clés
-- `rate:*`, la plus ancienne expirée depuis plus d'un mois) ni
-- searched_summoners (durée illimitée).
--
-- Ce que fait `privacy_purge()`, toutes les 15 minutes :
--   • rank_stat_samples  : lignes de plus d'un an ;
--   • riot_cache `rate:*`: clés des limiteurs par IP, dès leur expiration
--                          (aucune lecture des clés expirées) ;
--   • riot_cache, le reste : 48 h après expiration. Pas plus tôt : quand le
--     quota Riot du jour est épuisé, `cacheGetStale` ressert une entrée expirée,
--     quel que soit son âge. 48 h couvrent une journée de panne entière (le
--     quota repart à minuit UTC) ;
--   • searched_summoners : 6 mois sans nouvelle recherche (`last_seen`).
--
-- Et une seule fois, ici :
--   • le détail des matchs, qui expirait en 2099, est ramené à création +
--     30 jours (nouveau TTL de `_shared/cache.ts`) ;
--   • searched_summoners est vidé (décision HORTAL, option a) : ses lignes
--     mêlaient vraies recherches et participants des matchs ouverts, sans
--     colonne pour les distinguer. L'autocomplétion se remplit à nouveau à
--     partir des seules recherches ;
--   • une première purge est jouée immédiatement.
--
-- ⚠️ ORDRE DE DÉPLOIEMENT : les Edge Functions D'ABORD (riot-match-detail ne
-- doit plus alimenter searched_summoners, les limiteurs doivent hacher l'IP),
-- cette migration ENSUITE. Dans l'ordre inverse, le vidage serait aussitôt
-- recomblé par les participants des matchs ouverts.
--
-- Aucun changement de schéma : l'app WPF ne lit aucune de ces tables
-- directement (elle passe par les Edge Functions).

CREATE OR REPLACE FUNCTION public.privacy_purge()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_rank   int;
  v_rate   int;
  v_cache  int;
  v_search int;
BEGIN
  DELETE FROM public.rank_stat_samples
   WHERE collected_at < now() - interval '1 year';
  GET DIAGNOSTICS v_rank = ROW_COUNT;

  DELETE FROM public.riot_cache
   WHERE cache_key LIKE 'rate:%'
     AND expires_at < now();
  GET DIAGNOSTICS v_rate = ROW_COUNT;

  DELETE FROM public.riot_cache
   WHERE cache_key NOT LIKE 'rate:%'
     AND expires_at < now() - interval '48 hours';
  GET DIAGNOSTICS v_cache = ROW_COUNT;

  DELETE FROM public.searched_summoners
   WHERE last_seen < now() - interval '6 months';
  GET DIAGNOSTICS v_search = ROW_COUNT;

  RETURN jsonb_build_object(
    'rank_stat_samples',  v_rank,
    'riot_cache_rate',    v_rate,
    'riot_cache_expired', v_cache,
    'searched_summoners', v_search
  );
END;
$fn$;

-- Appelée par pg_cron (rôle postgres) uniquement. Les trois instructions,
-- règle de 20260909000002 : REVOKE FROM PUBLIC seul ne retire pas les grants
-- nominatifs que Supabase pose sur anon et authenticated.
REVOKE ALL ON FUNCTION public.privacy_purge() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.privacy_purge() FROM anon, authenticated;

-- ── Rattrapage unique ────────────────────────────────────────────────────────
UPDATE public.riot_cache
   SET expires_at = created_at + interval '30 days'
 WHERE function_name = 'riot-match-detail'
   AND expires_at > now() + interval '1 year';

DELETE FROM public.searched_summoners;

SELECT public.privacy_purge();

-- ── Planification ────────────────────────────────────────────────────────────
DO $cron$
BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'privacy-purge';
  PERFORM cron.schedule('privacy-purge', '*/15 * * * *', 'select public.privacy_purge()');
END
$cron$;

-- ── Auto-vérification — le `db push` ÉCHOUE si l'état visé n'est pas atteint ──
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'privacy-purge' AND active) THEN
    RAISE EXCEPTION 'Job pg_cron privacy-purge absent ou inactif.';
  END IF;

  IF has_function_privilege('anon', 'public.privacy_purge()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.privacy_purge()', 'EXECUTE') THEN
    RAISE EXCEPTION 'privacy_purge() reste exécutable par anon ou authenticated.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.riot_cache
              WHERE function_name = 'riot-match-detail'
                AND expires_at > now() + interval '31 days') THEN
    RAISE EXCEPTION 'Détail de match encore en cache au-delà de 30 jours.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.riot_cache
              WHERE cache_key LIKE 'rate:%' AND expires_at < now()) THEN
    RAISE EXCEPTION 'Clés de limitation expirées encore présentes.';
  END IF;
END
$$;
