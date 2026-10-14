-- Purge des `app_events` après 30 jours (chantier confidentialité).
--
-- Vérifié avant d'écrire cette migration : les deux lecteurs de la table
-- (`quest-claim`, `quest-status`) ne comptent que les événements du jour UTC
-- courant. Les séries de quêtes vivent dans `quest_streaks`, les complétions
-- dans `quest_completions` : aucune n'a besoin de l'historique d'`app_events`.
--
-- ⚠️ Effet de bord ACCEPTÉ : la contrainte `uq_app_events_dedup`
-- (user_id, event_type, ref_id) est TOTALE, pas journalière. Aujourd'hui, un
-- match consulté une fois ne compte plus jamais pour une quête « consulte une
-- partie ». Après purge, un match vu il y a plus de 30 jours compte à nouveau.
-- L'anti-farm qu'elle vise (rejouer le même match le même jour) reste entier,
-- et le plafond journalier d'Écailles borne le reste.

DO $cron$
BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'app-events-purge';
  PERFORM cron.schedule('app-events-purge', '23 3 * * *',
    $$DELETE FROM public.app_events WHERE created_at < now() - interval '30 days'$$);
END
$cron$;

DELETE FROM public.app_events WHERE created_at < now() - interval '30 days';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'app-events-purge' AND active) THEN
    RAISE EXCEPTION 'Job pg_cron app-events-purge absent ou inactif.';
  END IF;
END
$$;
