-- F2 (audit sécurité) — search_path manquant sur 4 fonctions SECURITY DEFINER.
--
-- Les fonctions increment_likes / increment_saves / increment_jp_likes /
-- increment_jp_saves sont SECURITY DEFINER mais avaient proconfig = NULL :
-- aucun search_path figé. Une fonction SECURITY DEFINER sans search_path
-- explicite résout ses identifiants non qualifiés selon le search_path de
-- l'APPELANT — vecteur d'escalade classique (un rôle malveillant peut placer
-- un objet homonyme dans un schéma prioritaire et le faire exécuter avec les
-- privilèges du définisseur).
--
-- Les 4 corps ne référencent que des tables NON qualifiées vivant dans public
-- (workshop_builds, workshop_junglepaths — vérifiées dans public), donc
-- figer search_path = public préserve exactement la résolution actuelle sans
-- effet de bord.
--
-- Rejouable : ré-exécuter ces ALTER FUNCTION est sans effet de bord (même config).

ALTER FUNCTION public.increment_likes(build_id uuid)    SET search_path = public;
ALTER FUNCTION public.increment_saves(build_id uuid)    SET search_path = public;
ALTER FUNCTION public.increment_jp_likes(path_id uuid)  SET search_path = public;
ALTER FUNCTION public.increment_jp_saves(path_id uuid)  SET search_path = public;
