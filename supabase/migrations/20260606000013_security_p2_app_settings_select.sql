-- P2 : Restriction SELECT app_settings — BLOQUÉE, migration conservée comme trace d'audit.
--
-- Objectif initial : restreindre le SELECT à is_admin() uniquement pour masquer les
-- plafonds d'Écailles (cap_daily_scales, streak_bonus_pct) aux utilisateurs authentifiés.
--
-- Bloqué par : AdminTab.tsx lit app_settings directement côté client (lignes 187 et 206).
-- Restreindre le SELECT casserait l'affichage admin des réglages actifs.
--
-- Décision : la policy SELECT reste ouverte à authenticated (valeurs non secrètes).
-- À revisiter si des valeurs sensibles sont ajoutées à app_settings.

SELECT 1; -- no-op intentionnel
