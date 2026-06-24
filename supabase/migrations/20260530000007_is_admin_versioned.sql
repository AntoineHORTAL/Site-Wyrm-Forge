-- Versionnage de is_admin() — existait en production sans migration.
-- Définition récupérée via pg_get_functiondef, reproduite à l'identique.
-- SET search_path ajouté par sécurité (bonne pratique SECURITY DEFINER).
CREATE OR REPLACE FUNCTION public.is_admin()
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid());
$function$;
