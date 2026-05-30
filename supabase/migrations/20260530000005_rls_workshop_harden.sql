-- RLS Workshop : suppression des policies permissives + standardisation.
--
-- workshop_builds    : creator_id existe → owner-scoping complet.
-- workshop_junglepaths : pas de colonne propriétaire (seulement creator_name
--   texte libre). INSERT restreint aux utilisateurs authentifiés uniquement.
--   UPDATE/DELETE absents du site → aucune policy (refus par défaut).
--   Dette technique : ajouter creator_id pour un vrai owner-scoping (voir AGENTS.md).
--
-- item_builds : RLS correcte (ALL TO authenticated USING/WITH CHECK
--   user_id = auth.uid()). Non modifiée, documentée ici pour versionnage.

-- ── 1. Supprimer TOUTES les policies existantes (noms FR/EN inconnus) ─────────

DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT schemaname, tablename, policyname
    FROM   pg_policies
    WHERE  schemaname = 'public'
      AND  tablename  IN ('workshop_builds', 'workshop_junglepaths')
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON %I.%I',
      pol.policyname, pol.schemaname, pol.tablename
    );
  END LOOP;
END;
$$;

-- ── 2. workshop_builds — DEFAULT + policies owner-scopées ─────────────────────

ALTER TABLE workshop_builds
  ALTER COLUMN creator_id SET DEFAULT auth.uid();

CREATE POLICY "wb_select_public"
  ON workshop_builds FOR SELECT
  USING (true);

CREATE POLICY "wb_insert_owner"
  ON workshop_builds FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = creator_id);

CREATE POLICY "wb_update_owner"
  ON workshop_builds FOR UPDATE TO authenticated
  USING  (auth.uid() = creator_id)
  WITH CHECK (auth.uid() = creator_id);

CREATE POLICY "wb_delete_owner"
  ON workshop_builds FOR DELETE TO authenticated
  USING (auth.uid() = creator_id);

-- ── 3. workshop_junglepaths — pas de creator_id ───────────────────────────────
-- Pas de DEFAULT auth.uid() (colonne inexistante).
-- SELECT : public. INSERT : authentifié uniquement (bloque l'anon).
-- UPDATE/DELETE : aucune policy → refusés par défaut (RLS activé).
-- Le site ne fait aucun UPDATE/DELETE direct sur cette table.

CREATE POLICY "wjp_select_public"
  ON workshop_junglepaths FOR SELECT
  USING (true);

CREATE POLICY "wjp_insert_authenticated"
  ON workshop_junglepaths FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- ── 4. item_builds — inchangée, versionnée ───────────────────────────────────
-- Policy existante : ALL TO authenticated
--   USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())
-- Correcte. Aucune modification.
