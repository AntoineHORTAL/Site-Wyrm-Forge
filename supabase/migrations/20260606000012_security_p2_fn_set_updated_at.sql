-- P2 : Ajouter SET search_path = public à fn_set_updated_at (trigger patch_notes + app_settings).
--
-- La fonction était sans SET search_path, ce qui l'expose théoriquement à une attaque
-- par substitution de schéma. CREATE OR REPLACE est idempotent ; les triggers existants
-- (trg_patch_notes_updated_at, trg_app_settings_updated_at) restent intacts.

CREATE OR REPLACE FUNCTION public.fn_set_updated_at()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
