-- ════════════════════════════════════════════════════════════════════════════
--  `scenarios` — retrait du jeu ad-hoc (policies PUBLIC + index redondant)
-- ════════════════════════════════════════════════════════════════════════════
-- ÉTAT AVANT CETTE MIGRATION
-- --------------------------
-- La table porte DEUX jeux de policies qui font la même chose :
--
--   • le jeu voulu, versionné par 20260622000001_scenarios.sql :
--       scn_select_own / scn_insert_own / scn_update_own / scn_delete_own
--     → `TO authenticated`, prédicat `(SELECT auth.uid()) = user_id` ;
--
--   • le jeu ad-hoc, créé à la main sur le remote avant le versionnage puis
--     REPRODUIT fidèlement par 20260815000005_versioning_scenarios_adhoc.sql :
--       "Users can view/create/update/delete their own scenarios"
--     → AUCUNE clause `TO` (donc PUBLIC, `anon` compris), prédicat
--       `user_id = auth.uid()`.
--
-- 20260815000005 les a codifiés SANS les retirer — c'était sa fonction :
-- reproduire la prod, pas la corriger. Le nettoyage était décidé mais la
-- migration n'a jamais été écrite. C'est celle-ci.
--
-- POURQUOI CE N'EST PAS QU'UN DOUBLON COSMÉTIQUE
-- ----------------------------------------------
-- Les policies permissives se cumulent en OU : le jeu ad-hoc n'ouvre aucune
-- ligne de plus que `scn_*`, et un `anon` n'obtient rien puisque `auth.uid()`
-- vaut NULL pour lui → `user_id = NULL` n'est jamais vrai.
--
-- MAIS la table n'a jamais reçu de `REVOKE` : elle garde le GRANT ALL par
-- défaut de Supabase pour `anon`. Le refus d'un visiteur non connecté ne tient
-- donc AUJOURD'HUI qu'à l'évaluation d'un prédicat à NULL, pas au modèle de
-- droits. Concrètement, une sonde `anon` reçoit un `200 []` — elle a le droit
-- de lire, il n'y a simplement rien à voir. C'est la même fragilité que
-- `prac_admins` (cf. 20260901000002) : une policy ajoutée demain sans clause
-- `TO`, ou un prédicat réécrit sans y penser, ouvre la table.
--
-- Après cette migration, la sonde `anon` passe de `200 []` à `42501`
-- (permission denied) : le refus devient structurel.
--
-- ⚠️ ORDRE DES MIGRATIONS — LIRE AVANT DE RENUMÉROTER
-- ---------------------------------------------------
-- Cette migration DOIT rester APRÈS 20260815000005, qui crée les objets qu'on
-- retire ici. Sur une base reconstruite depuis zéro, 20260815000005 les crée
-- puis celle-ci les supprime : deux pas au lieu d'un, mais l'état final est
-- correct et l'historique reste fidèle. On ne corrige PAS 20260815000005 à la
-- source — elle est déjà appliquée sur test et prod, et on ne réécrit pas une
-- migration appliquée.
--
-- IMPACT FONCTIONNEL ATTENDU : AUCUN pour un utilisateur connecté. Le seul
-- consommateur côté site est `src/components/dashboard/tabs/ScenariosTab.tsx`
-- (CRUD client direct, onglet derrière l'authentification, `getUser()` en
-- amont) ; côté app WPF, `ScenarioService` fait du PostgREST sous JWT user.
-- Les deux sont `authenticated` et conservent leurs 4 policies `scn_*` et le
-- GRANT ci-dessous. service_role n'est pas concerné.
-- ════════════════════════════════════════════════════════════════════════════


-- ── 1. Moindre privilège : le refus d'`anon` devient un privilège, pas un
--       prédicat qui s'évalue à NULL ─────────────────────────────────────────
-- Même patron que 20260627000003 (tracked_players) et que les 4 tables du
-- module prac. Le GRANT rétablit exactement ce dont `authenticated` a besoin —
-- il est déjà posé par 20260622000001:49, on le rejoue car le REVOKE ci-dessus
-- l'emporte aussi.
REVOKE ALL ON public.scenarios FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scenarios TO authenticated;   -- anon : aucun privilège


-- ── 2. Retrait du jeu de policies ad-hoc ────────────────────────────────────
-- Les 4 policies `scn_*` de 20260622000001 restent en place et couvrent les
-- mêmes opérations, en plus strict (clause `TO authenticated` explicite).
-- ⚠️ Ne PAS retirer davantage : la table serait alors sans policy, donc en
-- refus total sous RLS.
DROP POLICY IF EXISTS "Users can view their own scenarios"   ON public.scenarios;
DROP POLICY IF EXISTS "Users can create their own scenarios" ON public.scenarios;
DROP POLICY IF EXISTS "Users can update their own scenarios" ON public.scenarios;
DROP POLICY IF EXISTS "Users can delete their own scenarios" ON public.scenarios;


-- ── 3. Index redondant ──────────────────────────────────────────────────────
-- `scenarios_user_idx (user_id)` est un préfixe STRICT de
-- `idx_scenarios_user_time (user_id, created_at DESC)` : tout plan qui
-- utiliserait le premier peut utiliser le second. Il ne coûte que de la
-- maintenance à l'écriture. Constat déjà écrit dans l'en-tête de
-- 20260815000005, qui le reproduisait sans le retirer.
DROP INDEX IF EXISTS public.scenarios_user_idx;


-- ── Vérification (à jouer après le push) ────────────────────────────────────
-- a) il ne reste QUE les 4 policies scn_*, toutes `TO authenticated` :
--      select polname, polcmd, polroles::regrole[]
--        from pg_policy where polrelid = 'public.scenarios'::regclass
--       order by polname;
--    → attendu : 4 lignes scn_delete_own / scn_insert_own / scn_select_own /
--      scn_update_own, toutes {authenticated}.
--
-- b) privilèges de table :
--      select grantee, privilege_type
--        from information_schema.role_table_grants
--       where table_schema = 'public' and table_name = 'scenarios'
--         and grantee in ('anon','authenticated')
--       order by grantee, privilege_type;
--    → attendu : authenticated | DELETE/INSERT/SELECT/UPDATE, et RIEN pour anon.
--
-- c) index restants :
--      select indexname from pg_indexes
--       where schemaname = 'public' and tablename = 'scenarios';
--    → attendu : la PK + idx_scenarios_user_time. Plus de scenarios_user_idx.
--
-- d) sonde `anon` (clé anon, sans session) :
--      select * from scenarios limit 1;
--    → attendu : 42501 permission denied. AVANT cette migration : 200 [].
--
-- e) non-régression utilisateur : CRUD complet depuis l'onglet Scénarios
--    (create / read / update / delete) sous JWT utilisateur → inchangé.
