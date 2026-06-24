-- P3-3d (2026-06-14) — Étend la protection des colonnes riot_* à l'INSERT.
--
-- Avant : trg_protect_riot_columns ne couvrait que BEFORE UPDATE. Un client
-- authentifié pouvait donc, à la création d'une ligne profiles, poser directement
-- riot_puuid / riot_gamename / etc. (auto-attribution d'un compte Riot sans passer
-- par le flow de vérification icône). Le guard INSERT existant (restrict_insert_
-- privileges) ne contrôle que id/role/tier, pas les colonnes riot_*.
--
-- Après : la fonction gère TG_OP et le trigger couvre BEFORE INSERT OR UPDATE.
--   • INSERT : un authenticated ne peut poser AUCUNE colonne riot_* non NULL.
--              (Les inscriptions normales n'écrivent que id/username/email/tier/
--               certified → riot_* restent NULL → passe sans erreur.)
--   • UPDATE : comportement inchangé (IS DISTINCT FROM OLD).
-- service_role / postgres ne sont pas concernés (current_user != 'authenticated').

CREATE OR REPLACE FUNCTION public.fn_protect_riot_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Ne s'applique qu'aux appels client directs (JWT user → current_user = 'authenticated').
  IF current_user <> 'authenticated' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- Aucune colonne riot_* ne peut être posée par le client à la création.
    IF NEW.riot_puuid           IS NOT NULL OR
       NEW.riot_gamename        IS NOT NULL OR
       NEW.riot_tagline         IS NOT NULL OR
       NEW.riot_platform        IS NOT NULL OR
       NEW.riot_link_pending    IS NOT NULL OR
       NEW.riot_link_expires_at IS NOT NULL THEN
      RAISE EXCEPTION 'direct modification of riot columns not allowed'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSE  -- UPDATE
    IF NEW.riot_puuid           IS DISTINCT FROM OLD.riot_puuid           OR
       NEW.riot_gamename        IS DISTINCT FROM OLD.riot_gamename        OR
       NEW.riot_tagline         IS DISTINCT FROM OLD.riot_tagline         OR
       NEW.riot_platform        IS DISTINCT FROM OLD.riot_platform        OR
       NEW.riot_link_pending    IS DISTINCT FROM OLD.riot_link_pending    OR
       NEW.riot_link_expires_at IS DISTINCT FROM OLD.riot_link_expires_at THEN
      RAISE EXCEPTION 'direct modification of riot columns not allowed'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Recréer le trigger en BEFORE INSERT OR UPDATE (idempotent).
DROP TRIGGER IF EXISTS trg_protect_riot_columns ON public.profiles;

CREATE TRIGGER trg_protect_riot_columns
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_protect_riot_columns();
