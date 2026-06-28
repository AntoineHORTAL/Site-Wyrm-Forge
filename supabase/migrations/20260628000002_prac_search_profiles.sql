-- Migration 20260628000002 : fonction prac_search_profiles (module prac, Search-1).
--
-- Recherche de profils par un admin prac, pour alimenter l'UI « Ajouter un joueur »
-- (appel ensuite request_tracking sur le profil choisi).
--
-- ── Pourquoi SECURITY DEFINER ──────────────────────────────────────────────────
-- La RLS de `profiles` n'autorise un user qu'à lire SON propre profil
-- (`auth.uid() = id OR is_admin()`). Un admin prac n'est PAS forcément admin site
-- → il ne peut pas lister les autres profils via RLS. Cette fonction bypasse la
-- RLS en tant qu'owner (postgres), MAIS :
--   • garde interne `is_prac_admin(auth.uid())` → RAISE 'not_prac_admin' sinon ;
--   • `REVOKE FROM PUBLIC` + `GRANT authenticated` (jamais anon) ;
--   • ne retourne que des CHAMPS MINIMAUX d'identité (username + Riot ID + plateforme
--     + booléen `linked` + statut de suivi). JAMAIS email / role / tier / riot_puuid brut.
-- Elle n'ajoute AUCUNE policy à `profiles` et n'élargit pas l'accès du reste du site.
--
-- Appelée en RPC DIRECT (supabase.rpc), pas via Edge Function : la fonction est
-- définer + gardée, donc le client authentifié l'appelle directement (pattern 4A/4C).
--
-- Dépend de : profiles, tracked_players, is_prac_admin(uuid).
-- Idempotent : CREATE OR REPLACE.

CREATE OR REPLACE FUNCTION public.prac_search_profiles(
  p_query text,
  p_limit int DEFAULT 10
)
RETURNS TABLE (
  profile_id      uuid,
  username        text,
  riot_gamename   text,
  riot_tagline    text,
  riot_platform   text,
  linked          boolean,
  tracking_status text     -- statut tracked_players du profil (NULL = jamais sollicité)
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_q     text := trim(coalesce(p_query, ''));
  v_esc   text;
  v_limit int  := LEAST(GREATEST(coalesce(p_limit, 10), 1), 25);  -- borne [1, 25]
BEGIN
  -- Garde : admin prac uniquement (exposition d'identités réelles).
  IF NOT public.is_prac_admin(auth.uid()) THEN
    RAISE EXCEPTION 'not_prac_admin';
  END IF;

  -- Anti-dump : requête trop courte → aucun résultat (pas d'erreur).
  IF length(v_q) < 2 THEN
    RETURN;
  END IF;

  -- Échappe les métacaractères LIKE pour traiter la saisie LITTÉRALEMENT
  -- (backslash en premier). Sinon un '%' utilisateur deviendrait un joker.
  v_esc := replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_');

  RETURN QUERY
  SELECT
    p.id,
    p.username,
    p.riot_gamename,
    p.riot_tagline,
    p.riot_platform,
    (p.riot_puuid IS NOT NULL)            AS linked,
    tp.status                             AS tracking_status
  FROM public.profiles p
  LEFT JOIN public.tracked_players tp ON tp.profile_id = p.id
  WHERE p.username      ILIKE '%' || v_esc || '%'
     OR p.riot_gamename ILIKE '%' || v_esc || '%'
  ORDER BY
    -- Les correspondances par préfixe d'abord, puis tri alphabétique.
    ((p.username ILIKE v_esc || '%') OR (p.riot_gamename ILIKE v_esc || '%')) DESC,
    p.username
  LIMIT v_limit;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.prac_search_profiles(text, int) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.prac_search_profiles(text, int) TO authenticated;
