-- P1 : Corriger streak_bonus_pct — valeur attendue : '0' (bonus désactivé au démarrage).
--
-- Contexte : la migration M0 (20260606000001) a inséré streak_bonus_pct = '10'.
-- La migration M5 (20260606000006) a tenté d'insérer '0' avec ON CONFLICT DO NOTHING
-- → le DO NOTHING a laissé '10' en base. Le bonus streak est donc actif à 10% par jour
-- dès le déploiement, contrairement à l'intention documentée.
-- Ce UPDATE force la valeur correcte de façon idempotente.

UPDATE public.app_settings
  SET value = '0'
  WHERE key = 'streak_bonus_pct';
