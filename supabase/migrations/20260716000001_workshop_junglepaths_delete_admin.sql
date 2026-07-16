-- Audit sécurité pré-beta (découvert en creusant F5) : workshop_junglepaths
-- n'avait AUCUNE policy DELETE. RLS étant activé, le DELETE était refusé par
-- défaut pour tous les rôles client → aucun contenu publié sur cette table ne
-- pouvait être retiré, PAS MÊME par un admin, hors accès direct service_role.
--
-- Correctif minimal : policy DELETE réservée aux admins, calquée sur
-- pn_delete_admin (patch_notes, migration 20260531000002). is_admin() lit
-- admin_users en SECURITY DEFINER — c'est le check admin du contexte site
-- (≠ is_prac_admin, réservé au module prac).
--
-- Portée volontairement limitée :
--   • Pas de DELETE par l'auteur : workshop_junglepaths n'a pas de creator_id
--     (F5 reste non tranché — reporté après beta, voir AGENTS.md).
--   • Pas de policy UPDATE ajoutée ici (hors scope).
--   • workshop_builds N'est PAS touchée : elle a déjà wb_delete_owner
--     (DELETE owner-based via creator_id) → pas de trou équivalent.

DROP POLICY IF EXISTS "wjp_delete_admin" ON public.workshop_junglepaths;

CREATE POLICY "wjp_delete_admin"
  ON public.workshop_junglepaths FOR DELETE
  TO authenticated
  USING (is_admin());
