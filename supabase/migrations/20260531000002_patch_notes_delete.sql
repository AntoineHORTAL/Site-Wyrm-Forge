-- Policy DELETE réservée aux admins : permet de supprimer les brouillons
-- invalides avant régénération. L'admin doit dépublier un patch avant de
-- pouvoir le supprimer (les patches publiés sont protégés par cette règle
-- puisque is_admin() ne bypasse pas RLS ici — seul l'admin authentifié peut).
CREATE POLICY pn_delete_admin ON patch_notes
  FOR DELETE
  TO authenticated
  USING (is_admin());
