-- Reversement de la dette « bootstrap §2 » — les 2 triggers `updated_at` ad-hoc,
-- posés à la main sur la prod et jamais versionnés.
--
-- ÉTAT AVANT CETTE MIGRATION
-- --------------------------
-- `workshop_builds.updated_at` et `todos.updated_at` existent depuis le
-- pré-versionnage (colonnes créées par 20260529000000, DEFAULT now()), mais
-- RIEN dans les migrations ne les tient à jour. Les deux triggers qui le font
-- vivaient uniquement dans `bootstrap/01_post_push_alignment.sql`, un fichier
-- hors-migration joué une seule fois à la main sur chaque base.
--
-- Vérifié sur la prod le 2026-08-15, définitions reproduites ici à l'identique :
--     CREATE TRIGGER set_updated_at    BEFORE UPDATE ON public.workshop_builds
--       FOR EACH ROW EXECUTE FUNCTION update_updated_at()
--     CREATE TRIGGER todos_updated_at  BEFORE UPDATE ON public.todos
--       FOR EACH ROW EXECUTE FUNCTION update_updated_at()
--
-- CE QUE CETTE MIGRATION PROTÈGE — la dégradation SILENCIEUSE au rejeu
-- --------------------------------------------------------------------
-- NO-OP sur la prod comme sur le projet de test : les deux triggers y sont déjà
-- en place. Ce qu'elle achète est la résistance au rejeu (`supabase db reset`,
-- branche Supabase, environnement neuf), où l'état actuel ne tient qu'à un
-- fichier hors-migration.
--
-- ⚠️ La perte serait INVISIBLE. Sans ces triggers, aucune erreur n'est levée :
-- la colonne `updated_at` existe toujours, et garde simplement à jamais la
-- valeur posée par son DEFAULT à l'INSERT. Une build Workshop modifiée dix fois
-- afficherait toujours sa date de création. C'est une donnée FAUSSE et
-- PLAUSIBLE — la classe de bug la plus coûteuse à diagnostiquer, parce que rien
-- ne la signale.
--
-- POURQUOI `update_updated_at()` ET NON `fn_set_updated_at()`
-- -----------------------------------------------------------
-- Les deux fonctions existent en prod et font exactement la même chose :
--   • `update_updated_at()`  — pré-versionnage, créée par 20260529000000 ;
--     porte ces deux triggers-ci.
--   • `fn_set_updated_at()`  — créée par 20260530000008 ; porte tous les
--     triggers `trg_*_updated_at` versionnés depuis (app_settings, patch_notes,
--     tracked_players, prac_notification_log).
-- Ce doublon est une dette historique CONNUE. Cette migration ne la corrige
-- pas : elle REPRODUIT la prod. Basculer ces deux triggers sur
-- `fn_set_updated_at()` puis supprimer `update_updated_at()` serait une
-- migration à part entière, à décider séparément — la faire ici transformerait
-- un reversement no-op en changement de comportement non demandé.

-- ── 1. Garde : la fonction trigger doit exister ───────────────────────────────
-- Si un futur réordonnancement faisait passer cette migration avant
-- 20260529000000, on veut échouer ici, bruyamment et au déploiement, plutôt que
-- de laisser les deux tables sans bump d'`updated_at` en silence.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = 'update_updated_at'
  ) THEN
    RAISE EXCEPTION
      'public.update_updated_at() absente — voir la migration 20260529000000 (baseline pré-versionnage)';
  END IF;
END $$;

-- ── 2. Garde : les colonnes updated_at doivent exister ────────────────────────
-- `update_updated_at()` affecte NEW.updated_at sans test. Attachée à une table
-- dépourvue de cette colonne, elle échouerait à la première MISE À JOUR — donc
-- en production, pas au déploiement. On préfère le savoir maintenant.
DO $$
DECLARE
  v_missing TEXT;
BEGIN
  SELECT string_agg(expected.tblname, ', ' ORDER BY expected.tblname)
    INTO v_missing
    FROM (VALUES ('workshop_builds'), ('todos')) AS expected(tblname)
   WHERE NOT EXISTS (
     SELECT 1
       FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name   = expected.tblname
        AND c.column_name  = 'updated_at'
   );

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION
      'Colonne updated_at manquante sur : % — voir la migration 20260529000000', v_missing;
  END IF;
END $$;

-- ── 3. Attachement des triggers ───────────────────────────────────────────────
-- `CREATE OR REPLACE TRIGGER` (PostgreSQL 14+, la prod est en 17) : idempotent
-- et non destructif. Un `DROP TRIGGER IF EXISTS` suivi d'un `CREATE` ouvrirait
-- une fenêtre — courte mais réelle — pendant laquelle des UPDATE concurrents
-- passeraient sans bump. Le REPLACE fait la substitution atomiquement.
CREATE OR REPLACE TRIGGER set_updated_at
  BEFORE UPDATE ON public.workshop_builds
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE OR REPLACE TRIGGER todos_updated_at
  BEFORE UPDATE ON public.todos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
