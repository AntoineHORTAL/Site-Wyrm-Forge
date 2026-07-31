-- ════════════════════════════════════════════════════════════════════════════
--  SÉCURITÉ — fonctions SECURITY DEFINER appelables en RPC par anon
-- ════════════════════════════════════════════════════════════════════════════
-- Constat mesuré le 2026-07-31 (sonde PostgREST avec la seule clé anon publique) :
-- quatre fonctions documentées « REVOKE FROM PUBLIC, aucun GRANT → service_role
-- only » S'EXÉCUTAIENT en réalité sous le rôle anon.
--
--   consume_ai_quota            → HTTP 409 (violation de FK) = corps exécuté
--   refund_ai_quota             → HTTP 204 = exécutée AVEC SUCCÈS
--   prac_commit_tracked_matches → P0001 'tracked_player_not_found' = corps exécuté
--   prac_notify_claim           → HTTP 409 (violation de FK) = corps exécuté
--
-- ── Cause ───────────────────────────────────────────────────────────────────
-- Les ALTER DEFAULT PRIVILEGES du projet Supabase accordent EXECUTE sur les
-- fonctions du schéma `public` NOMINATIVEMENT aux rôles anon et authenticated.
-- `REVOKE ... FROM PUBLIC` ne retire que le privilège du pseudo-rôle PUBLIC ;
-- il ne touche PAS un grant nominatif. Les deux révocations sont nécessaires.
-- Le dépôt contenait déjà le bon patron : 20260606000010_security_p1_revoke.sql
-- révoque explicitement `authenticated` sur les fonctions du circuit breaker,
-- pour exactement cette raison. Le patron n'avait simplement pas été rejoué sur
-- les migrations suivantes.
--
-- ── Impact avant correctif ──────────────────────────────────────────────────
-- • refund_ai_quota est le plus grave : appelable par quiconque possède la clé
--   anon (publique par construction), pour n'importe quel user_id. Un
--   utilisateur pouvait se rembourser son propre quota après chaque analyse et
--   obtenir un nombre ILLIMITÉ d'analyses IA — le système de quota entier était
--   contournable. C'est la fondation sur laquelle repose tout le chantier budget.
-- • consume_ai_quota : permet de brûler le quota d'un tiers (nuisance).
-- • prac_commit_tracked_matches : injection de matchs fabriqués dans le suivi
--   d'un joueur, si l'attaquant devine un tracked_player_id (UUID, donc difficile
--   mais non impossible).
-- • prac_notify_claim : réservation de créneaux de notification → suppression
--   silencieuse d'e-mails de consentement.
--
-- Aucun impact sur le fonctionnement : les Edge Functions passent par
-- service_role, qui n'est concerné par aucune de ces révocations.
--
-- Idempotent : REVOKE sur un privilège déjà absent est un no-op silencieux.
-- ════════════════════════════════════════════════════════════════════════════

-- ── Quota IA (infra du chantier budget) ─────────────────────────────────────
REVOKE ALL ON FUNCTION public.consume_ai_quota(uuid, text, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.consume_ai_quota(uuid, text, int) FROM anon, authenticated;

REVOKE ALL ON FUNCTION public.refund_ai_quota(uuid, text)       FROM PUBLIC;
REVOKE ALL ON FUNCTION public.refund_ai_quota(uuid, text)       FROM anon, authenticated;

-- ── Module prac ─────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.prac_commit_tracked_matches(uuid, uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prac_commit_tracked_matches(uuid, uuid, jsonb) FROM anon, authenticated;

REVOKE ALL ON FUNCTION public.prac_notify_claim(uuid, timestamptz, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prac_notify_claim(uuid, timestamptz, text, text) FROM anon, authenticated;

-- ── Note pour les migrations futures ────────────────────────────────────────
-- Toute nouvelle fonction SECURITY DEFINER destinée à service_role doit porter
-- LES DEUX révocations. Vérifier ensuite par une sonde RPC avec la clé anon :
--   PGRST202 = absente · 42501 = barrière OK · tout autre code = EXÉCUTÉE.
-- Un `REVOKE FROM PUBLIC` seul passe la relecture de code mais pas la sonde.
