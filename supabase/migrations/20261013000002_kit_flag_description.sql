-- Migration 20261013000002 : description du flag `kit_sur_mesure_enabled` complétée.
--
-- La description disait « Coupé, rien n'est visible côté client » — juste pour les
-- clients, mais un admin voit l'entrée « Kit sur mesure » dans la barre latérale
-- (passe-droit de recette, Dashboard.tsx : `isLaunchTabVisible`), désormais marquée
-- « Non lancé · admin ». La description le dit, pour qu'on ne prenne plus ce
-- passe-droit pour une fuite.
--
-- MÉTADONNÉES SEULES : ni `value`, ni `reason`, ni `kind` ne sont touchés. Les
-- triggers `trg_app_settings_updated_at` / `trg_app_settings_actor` ne se
-- déclenchent que sur un changement de `value` : `updated_at` et `updated_by`
-- restent ceux de la dernière vraie bascule.
--
-- Idempotent : rejouable sans effet.
UPDATE public.app_settings
SET desc_fr = 'Service payant d''accompagnement personnalisé : ouverture de dossier, suivi du parcours et tableau des preneurs. Coupé, rien n''est visible côté client (les admins le voient, pour recette).',
    desc_en = 'Paid personalised coaching service: order intake, progress tracking and the buyers table. When off, nothing is visible to clients (admins still see it, for testing).'
WHERE key = 'kit_sur_mesure_enabled';
