-- ════════════════════════════════════════════════════════════════════════════
--  SÉCURITÉ S1 — disjoncteur et limiteur Riot appelables par `anon`
-- ════════════════════════════════════════════════════════════════════════════
-- Constat (SECURITY_AUDIT.md, S1, 2026-11-27), mesuré sur TEST par la sonde de
-- 20260731000002 avec la seule clé anon publique :
--
--   fn_riot_quota_increment → HTTP 200 [{"calls_made":0,"circuit_open":false}]
--   fn_riot_quota_check     → HTTP 200
--   fn_riot_rate_increment  → HTTP 400 23514 (contrainte du CORPS : exécutée)
--   consume_ai_quota        → HTTP 401 42501 (témoin : barrière en place)
--
-- ACL relevée sur TEST : {postgres=X, anon=X, service_role=X}.
--
-- ── Cause ───────────────────────────────────────────────────────────────────
-- 20260606000010_security_p1_revoke.sql a révoqué ces trois fonctions de PUBLIC
-- et de `authenticated`, mais pas de `anon`. Or les ALTER DEFAULT PRIVILEGES de
-- Supabase accordent EXECUTE NOMINATIVEMENT à `anon` : le grant est resté. Même
-- défaut que celui décrit par 20260731000002, qui n'avait pas repris ces trois-là.
--
-- ── Impact avant correctif ──────────────────────────────────────────────────
-- • fn_riot_quota_increment : un seul POST anonyme `{"p_calls": 100000}` ouvre
--   le disjoncteur journalier (`riot_daily_quota.circuit_open`). Toutes les EF
--   qui lisent `isCircuitOpen()` — riot-rank, riot-matches, riot-match-detail,
--   riot-live-game, riot-rotation, riot-link-init, riot-link-verify — répondent
--   alors 503 (ou servent du cache périmé) à TOUS les utilisateurs du site et de
--   l'app jusqu'à minuit UTC. Rejouable chaque jour, sans compte.
-- • fn_riot_rate_increment : insertion illimitée de lignes dans
--   `riot_rate_limits` (purgée toutes les 5 min, mais gonflable entre-temps).
-- • fn_riot_quota_check : lecture du compteur du jour (fuite mineure).
--
-- ── Aucun client impacté ────────────────────────────────────────────────────
-- Seuls appelants : `_shared/circuit-breaker.ts` et `_shared/rate-limit.ts`, qui
-- passent par SUPABASE_SERVICE_ROLE_KEY. Ni le site (src/) ni l'app WPF n'appellent
-- ces fonctions (vérifié par recherche le 2026-11-27). `service_role` garde EXECUTE,
-- réaffirmé explicitement ci-dessous.
--
-- Périmètre limité à ces trois fonctions (décision HORTAL du 2026-11-27). Ne pas
-- étendre ce patron à is_admin() : des policies sans clause TO l'évaluent pour
-- `anon`. Les fonctions trigger ne sont pas appelables en RPC.
--
-- Additive et rejouable : REVOKE/GRANT sont idempotents. Aucun changement de
-- schéma, aucune donnée touchée.
-- ════════════════════════════════════════════════════════════════════════════

REVOKE ALL ON FUNCTION public.fn_riot_quota_increment(integer, text)                     FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_riot_quota_increment(integer, text)                     FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_riot_quota_increment(integer, text)                 TO service_role;

REVOKE ALL ON FUNCTION public.fn_riot_quota_check()                                      FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_riot_quota_check()                                      FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_riot_quota_check()                                  TO service_role;

REVOKE ALL ON FUNCTION public.fn_riot_rate_increment(text, text, timestamptz)            FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_riot_rate_increment(text, text, timestamptz)            FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_riot_rate_increment(text, text, timestamptz)        TO service_role;

-- ── Auto-vérification — une révocation qui ne révoque rien est le bug visé ────
-- Le `db push` ÉCHOUE si l'état visé n'est pas atteint, dans les deux sens :
-- client encore autorisé, ou service_role privé (les EF tomberaient en 42501 et le
-- limiteur, qui « échoue ouvert », se désactiverait sans bruit).
DO $$
DECLARE
  v_fn  text;
  v_bad text[] := '{}';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    RAISE NOTICE 'Rôle « anon » absent — vérification ignorée (Postgres hors Supabase).';
    RETURN;
  END IF;

  FOREACH v_fn IN ARRAY ARRAY[
    'public.fn_riot_quota_increment(integer,text)',
    'public.fn_riot_quota_check()',
    'public.fn_riot_rate_increment(text,text,timestamptz)'
  ] LOOP
    IF has_function_privilege('anon', v_fn::regprocedure, 'EXECUTE') THEN
      v_bad := v_bad || (v_fn || ' [anon]');
    END IF;
    IF has_function_privilege('authenticated', v_fn::regprocedure, 'EXECUTE') THEN
      v_bad := v_bad || (v_fn || ' [authenticated]');
    END IF;
    IF NOT has_function_privilege('service_role', v_fn::regprocedure, 'EXECUTE') THEN
      v_bad := v_bad || (v_fn || ' [service_role PRIVÉ]');
    END IF;
  END LOOP;

  IF array_length(v_bad, 1) > 0 THEN
    RAISE EXCEPTION 'S1 — état visé non atteint : %', array_to_string(v_bad, ', ');
  END IF;
END $$;
