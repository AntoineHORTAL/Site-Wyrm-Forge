-- Reversement de la dette « bootstrap §3 » — l'index et les 4 policies ad-hoc de
-- `scenarios`, restés sur la prod sans jamais être repris par une migration.
--
-- ÉTAT AVANT CETTE MIGRATION
-- --------------------------
-- `scenarios` a été créée ad-hoc sur le remote, puis codifiée A POSTERIORI par
-- 20260622000001 (`CREATE TABLE IF NOT EXISTS` + policies `scn_*` + index
-- `idx_scenarios_user_time`). Cette codification a repris la table, mais PAS les
-- objets d'origine, qui sont donc restés vivants sur la prod sans support :
--   • l'index `scenarios_user_idx` sur (user_id)
--   • 4 policies aux noms en clair (« Users can view/create/update/delete their
--     own scenarios »)
--
-- La prod porte donc DEUX jeux de policies simultanés. Vérifié le 2026-08-15,
-- reproduit ici à l'identique.
--
-- ⚠️ « PORTÉE IDENTIQUE » EST UN RACCOURCI — la vraie différence est le RÔLE
-- ---------------------------------------------------------------------------
-- L'en-tête de bootstrap/01 décrivait les deux jeux comme « permissifs et de
-- portée identique ». C'est vrai de leur EFFET, pas de leur définition :
--
--   scn_*                     → rôle `authenticated`, prédicat `(SELECT auth.uid()) = user_id`
--   « Users can … »           → rôle PUBLIC (donc anon INCLUS), prédicat `user_id = auth.uid()`
--
-- Les policies permissives se cumulent en OU : ce sont donc les policies ad-hoc,
-- et elles seules, qui s'appliquent au rôle `anon`. Elles ne lui ouvrent rien
-- pour autant — pour un appelant anonyme `auth.uid()` vaut NULL, donc
-- `user_id = NULL` vaut NULL, jamais TRUE, et aucune ligne ne passe.
--
-- Le point mérite d'être écrit noir sur blanc parce que `anon` détient bel et
-- bien les GRANT SELECT/INSERT/UPDATE/DELETE sur cette table (DEFAULT PRIVILEGES
-- Supabase, jamais révoqués ici) : la RLS est sa SEULE barrière. Le refus repose
-- sur l'arithmétique du NULL, pas sur une restriction de rôle. C'est correct
-- aujourd'hui, mais c'est fin — d'où l'intérêt de versionner ces policies plutôt
-- que de les laisser dépendre d'un fichier joué à la main.
--
-- CE QUE CETTE MIGRATION FAIT — ET NE FAIT PAS
-- ---------------------------------------------
-- NO-OP sur la prod comme sur le projet de test : tout y est déjà. Elle achète
-- la résistance au rejeu (`supabase db reset`, branche Supabase, environnement
-- neuf), où ces objets ne tiennent qu'à bootstrap/01.
--
-- Elle NE dédoublonne PAS. Supprimer le jeu ad-hoc (ou l'index redondant) est
-- une décision à part entière, pas un effet de bord d'un reversement : cela
-- retirerait à `anon` ses seules policies et ferait donc reposer son refus sur
-- l'absence de policy plutôt que sur un prédicat NULL — strictement plus sûr,
-- mais c'est un CHANGEMENT de comportement, qui n'a pas sa place dans une
-- migration censée être vérifiablement neutre. À trancher séparément.
--
-- Idem pour l'index : `scenarios_user_idx (user_id)` est un préfixe strict de
-- `idx_scenarios_user_time (user_id, created_at DESC)` et n'apporte donc aucun
-- plan que le second ne couvre déjà. Le retirer est un gain de maintenance réel
-- (une écriture de moins par INSERT/UPDATE), mais c'est un DROP — irréversible
-- au sens du rejeu, et hors périmètre ici.

-- ── 1. Garde : la table doit exister ──────────────────────────────────────────
-- Si un futur réordonnancement faisait passer cette migration avant
-- 20260622000001, on échoue ici plutôt que de laisser `scenarios` sans les
-- policies qui couvrent `anon`.
DO $$
BEGIN
  IF to_regclass('public.scenarios') IS NULL THEN
    RAISE EXCEPTION
      'public.scenarios absente — voir la migration 20260622000001';
  END IF;
END $$;

-- ── 2. Garde : la RLS doit être active ────────────────────────────────────────
-- Ces policies ne valent que si la RLS est activée sur la table. Sans elle, elles
-- sont INERTES et `anon` — qui détient les GRANT — écrit librement. C'est
-- exactement le trou corrigé pour les tables Workshop par 20260815000002 ; on
-- refuse de le recréer en silence ici.
DO $$
BEGIN
  IF NOT (SELECT c.relrowsecurity FROM pg_class c WHERE c.oid = 'public.scenarios'::regclass) THEN
    RAISE EXCEPTION
      'RLS inactive sur public.scenarios — les policies ci-dessous seraient inertes alors que anon détient les GRANT. Voir 20260622000001.';
  END IF;
END $$;

-- ── 3. Index d'origine ────────────────────────────────────────────────────────
-- Redondant avec idx_scenarios_user_time (voir en-tête) mais reproduit tel quel :
-- ce fichier reproduit la prod, il ne l'optimise pas.
CREATE INDEX IF NOT EXISTS scenarios_user_idx ON public.scenarios USING btree (user_id);

-- ── 4. Policies d'origine ─────────────────────────────────────────────────────
-- `CREATE POLICY` n'a pas de forme OR REPLACE ni IF NOT EXISTS : le
-- `DROP POLICY IF EXISTS` qui précède chacune est ce qui rend le bloc rejouable.
-- Prédicats recopiés au caractère près depuis la prod — `user_id = auth.uid()`
-- en appel direct, PAS la forme `(SELECT auth.uid())` des policies scn_*.
DROP POLICY IF EXISTS "Users can view their own scenarios" ON public.scenarios;
CREATE POLICY "Users can view their own scenarios" ON public.scenarios
  FOR SELECT USING ((user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can create their own scenarios" ON public.scenarios;
CREATE POLICY "Users can create their own scenarios" ON public.scenarios
  FOR INSERT WITH CHECK ((user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can update their own scenarios" ON public.scenarios;
CREATE POLICY "Users can update their own scenarios" ON public.scenarios
  FOR UPDATE USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can delete their own scenarios" ON public.scenarios;
CREATE POLICY "Users can delete their own scenarios" ON public.scenarios
  FOR DELETE USING ((user_id = auth.uid()));
