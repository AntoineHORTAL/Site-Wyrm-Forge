-- Feature flags du système Écailles dans app_settings.
-- M0 : tous les flags sont désactivés par défaut (false / valeur minimale).
-- La table, son RLS et le trigger updated_at existent depuis la migration
-- 20260530000009_app_settings.sql — aucune modification de schéma ici.
--
-- Flags :
--   ecailles_enabled  : active / désactive l'intégralité du système Écailles
--   shop_enabled      : active / désactive la boutique cosmétique
--   quests_enabled    : active / désactive les quêtes journalières
--   cap_daily_scales  : plafond d'Écailles gagnables par jour par compte
--   streak_bonus_pct  : bonus de streak en % par jour consécutif de connexion/quête
--
-- RLS héritée de app_settings :
--   SELECT  → authenticated
--   UPDATE  → is_admin() uniquement
--   INSERT / DELETE → aucune policy client (service_role only)

INSERT INTO public.app_settings (key, value) VALUES
  ('ecailles_enabled',  'false'),
  ('shop_enabled',      'false'),
  ('quests_enabled',    'false'),
  ('cap_daily_scales',  '25'),
  ('streak_bonus_pct',  '10')
ON CONFLICT (key) DO NOTHING;
