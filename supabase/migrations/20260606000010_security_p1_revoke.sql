-- P1 : REVOKE EXECUTE sur les fonctions internes invocables en RPC par authenticated.
--
-- Problème :
--   1. fn_riot_rate_increment / fn_riot_quota_check / fn_riot_quota_increment :
--      sans REVOKE, un utilisateur authentifié peut appeler ces fonctions SECURITY DEFINER
--      directement via RPC et incrémenter artificiellement le compteur de quota journalier
--      → déclencher l'ouverture du circuit breaker → DoS partiel sur toutes les requêtes Riot.
--   2. is_admin() : sans REVOKE FROM PUBLIC, invocable en RPC direct depuis anon.
--      Pas d'escalade possible (retourne un booléen) mais expose le statut admin.
--
-- Signatures récupérées depuis 20260530000001_riot_protection_tables.sql.
-- Les Edge Functions utilisent service_role qui bypasse les REVOKE → aucun impact.

-- ── Fonctions circuit-breaker Riot ────────────────────────────────────────────

REVOKE EXECUTE ON FUNCTION public.fn_riot_rate_increment(TEXT, TEXT, TIMESTAMPTZ)
  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_riot_rate_increment(TEXT, TEXT, TIMESTAMPTZ)
  FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.fn_riot_quota_check()
  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_riot_quota_check()
  FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.fn_riot_quota_increment(INTEGER, TEXT)
  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_riot_quota_increment(INTEGER, TEXT)
  FROM authenticated;

-- ── is_admin() ────────────────────────────────────────────────────────────────

-- REVOKE le privilege PUBLIC par défaut, puis ré-accorder explicitement à authenticated.
-- Nécessaire : les policies RLS (patch_notes, app_settings, etc.) appellent is_admin()
-- dans le contexte du rôle authenticated — sans GRANT, ces policies casseraient.
-- anon n'en a pas besoin (aucune policy admin ne s'applique à anon).
REVOKE EXECUTE ON FUNCTION public.is_admin()
  FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.is_admin()
  TO authenticated;
