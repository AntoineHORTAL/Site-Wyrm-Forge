-- Tests SQL — prac_search_profiles (Search-1, migration 20260628000002).
--
-- 7 blocs indépendants pour le SQL Editor distant, exécutés UN PAR UN.
-- auth.uid() piloté par SET LOCAL ROLE authenticated + set_config. AUCUN seed :
-- on s'appuie sur les profils réels existants (lecture seule → pas de ROLLBACK
-- nécessaire, mais on encadre quand même par BEGIN/ROLLBACK par discipline).
--
-- Données réelles utilisées (vérifiées le 2026-06-28) :
--   • 'Corentin Fautr' → dossier tracked_players 'accepted', non lié Riot
--   • 'admin'          → riot_gamename 'M41GU5', lié Riot, aucun dossier
--   • 'Antoine HORTAL' / 'test_pseudo' → non liés, aucun dossier
-- UUID : admin prac 35252895-… ; non-admin 115c0a52-…
--
-- ✅ Exécutés contre le remote le 2026-06-28 — 7/7 conformes.

-- ════════════════════════════════════════════════════════════════════════════
-- T1 — Garde : un non-admin est refusé.
-- Attendu : ERROR  P0001: not_prac_admin
-- ════════════════════════════════════════════════════════════════════════════
BEGIN;
  SET LOCAL ROLE authenticated;
  SELECT set_config('request.jwt.claims', json_build_object('sub','115c0a52-cc2a-46b4-9163-7e30aa95e3a1','role','authenticated')::text, true);
  SELECT * FROM public.prac_search_profiles('cor');
ROLLBACK;

-- ════════════════════════════════════════════════════════════════════════════
-- T2 — Recherche par username + tracking_status='accepted'.
-- Attendu : 1 ligne, username='Corentin Fautr', tracking_status='accepted', linked=false
-- ════════════════════════════════════════════════════════════════════════════
BEGIN;
  SET LOCAL ROLE authenticated;
  SELECT set_config('request.jwt.claims', json_build_object('sub','35252895-c25d-4aba-b1a6-e5a5575a43ea','role','authenticated')::text, true);
  SELECT username, riot_gamename, linked, tracking_status
    FROM public.prac_search_profiles('Corentin');
ROLLBACK;

-- ════════════════════════════════════════════════════════════════════════════
-- T3 — Recherche par riot_gamename + linked=true + tracking_status NULL.
-- 'M41' → matche riot_gamename 'M41GU5' (username 'admin', lié, jamais sollicité).
-- Attendu : 1 ligne, username='admin', linked=true, tracking_status=NULL
-- ════════════════════════════════════════════════════════════════════════════
BEGIN;
  SET LOCAL ROLE authenticated;
  SELECT set_config('request.jwt.claims', json_build_object('sub','35252895-c25d-4aba-b1a6-e5a5575a43ea','role','authenticated')::text, true);
  SELECT username, riot_gamename, linked, tracking_status
    FROM public.prac_search_profiles('M41');
ROLLBACK;

-- ════════════════════════════════════════════════════════════════════════════
-- T4 — Anti-dump : requête < 2 caractères → aucun résultat (pas d'erreur).
-- Attendu : 0 ligne
-- ════════════════════════════════════════════════════════════════════════════
BEGIN;
  SET LOCAL ROLE authenticated;
  SELECT set_config('request.jwt.claims', json_build_object('sub','35252895-c25d-4aba-b1a6-e5a5575a43ea','role','authenticated')::text, true);
  SELECT count(*) AS rows FROM public.prac_search_profiles('a');
ROLLBACK;

-- ════════════════════════════════════════════════════════════════════════════
-- T5 — Limite + ordre. 'in' matche 'admin', 'Antoine HORTAL', 'Corentin Fautr' (3).
-- Attendu : 'cap p_limit=2' → rows=2, noms='Antoine HORTAL, Corentin Fautr' ;
--           'défaut' → rows=3.
--   (Aucun ne commence par 'in' → tri par username ; la collation de la base classe
--    les MAJUSCULES avant les minuscules → ordre : Antoine HORTAL, Corentin Fautr, admin.
--    p_limit=2 garde les 2 premiers. La vraie assertion est le COMPTE, 2 vs 3.)
-- ════════════════════════════════════════════════════════════════════════════
BEGIN;
  SET LOCAL ROLE authenticated;
  SELECT set_config('request.jwt.claims', json_build_object('sub','35252895-c25d-4aba-b1a6-e5a5575a43ea','role','authenticated')::text, true);
  SELECT 'cap p_limit=2' AS cas, count(*) AS rows, string_agg(username, ', ' ORDER BY username) AS noms
    FROM public.prac_search_profiles('in', 2)
  UNION ALL
  SELECT 'défaut (10)', count(*), NULL
    FROM public.prac_search_profiles('in');
ROLLBACK;

-- ════════════════════════════════════════════════════════════════════════════
-- T6 — Échappement des métacaractères LIKE : '%%' traité LITTÉRALEMENT.
-- Aucun username ne contient le caractère '%' → 0 ligne (et surtout pas « tout »).
-- Attendu : 0 ligne
-- ════════════════════════════════════════════════════════════════════════════
BEGIN;
  SET LOCAL ROLE authenticated;
  SELECT set_config('request.jwt.claims', json_build_object('sub','35252895-c25d-4aba-b1a6-e5a5575a43ea','role','authenticated')::text, true);
  SELECT count(*) AS rows FROM public.prac_search_profiles('%%');
ROLLBACK;

-- ════════════════════════════════════════════════════════════════════════════
-- T7 — Contrat « champs minimaux » : les colonnes sensibles ne sont PAS exposées.
-- Sélectionner `email` depuis le résultat doit échouer (colonne inexistante).
-- Attendu : ERROR  42703: column "email" does not exist
-- ════════════════════════════════════════════════════════════════════════════
BEGIN;
  SET LOCAL ROLE authenticated;
  SELECT set_config('request.jwt.claims', json_build_object('sub','35252895-c25d-4aba-b1a6-e5a5575a43ea','role','authenticated')::text, true);
  SELECT email FROM public.prac_search_profiles('cor');
ROLLBACK;
