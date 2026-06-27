-- Migration 20260626000002 : table tracked_players + fonctions admin (chantier 2, lot A).
--
-- Roster des joueurs trackés par le module prac + statut de consentement.
-- Frontière de sécurité = RLS (pas le layout Next). Lecture : admin prac (tout)
-- OU le joueur sur sa propre ligne. Écritures : EXCLUSIVEMENT via fonctions
-- SECURITY DEFINER (request_tracking / remove_tracking pour l'admin ; respond_consent
-- pour le joueur arrive au lot B) — aucune policy INSERT/UPDATE/DELETE client.
--
-- Dépend de : prac_admins + is_prac_admin(uuid) (migration 20260626000001),
--             profiles(id) (= auth.users.id), fn_set_updated_at() (20260530000008 / 000012).
--
-- Idempotent : CREATE ... IF NOT EXISTS + DROP/CREATE POLICY/TRIGGER + CREATE OR REPLACE.

-- ── 1. Table ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tracked_players (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,  -- joueur tracké
  added_by      uuid NOT NULL REFERENCES auth.users,                             -- admin prac demandeur
  status        text NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'accepted', 'declined', 'revoked')),
  requested_at  timestamptz NOT NULL DEFAULT now(),
  responded_at  timestamptz,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_tracked_players_profile UNIQUE (profile_id)   -- un seul dossier par joueur
);

-- ── 2. Trigger updated_at (réutilise la fonction partagée du repo) ─────────────
DROP TRIGGER IF EXISTS trg_tracked_players_updated_at ON public.tracked_players;
CREATE TRIGGER trg_tracked_players_updated_at
  BEFORE UPDATE ON public.tracked_players
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

-- ── 3. RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE public.tracked_players ENABLE ROW LEVEL SECURITY;

-- Lecture : admin prac (tout) OU le joueur ciblé (sa seule ligne).
DROP POLICY IF EXISTS tp_select ON public.tracked_players;
CREATE POLICY tp_select ON public.tracked_players
  FOR SELECT
  USING (public.is_prac_admin(auth.uid()) OR auth.uid() = profile_id);

-- Aucune policy INSERT/UPDATE/DELETE : RLS activée + absence de policy = deny total
-- pour les rôles client. Toute écriture passe par les fonctions SECURITY DEFINER
-- ci-dessous (owned par postgres → bypass RLS, droits re-vérifiés en interne).
-- Lecture exposée à authenticated uniquement (anon n'a aucune policy → aucun accès).
GRANT SELECT ON public.tracked_players TO authenticated;

-- ── 4. request_tracking(p_profile_id) — admin crée / rouvre une demande ───────
-- Calquée sur clear_riot_link() : SECURITY DEFINER + SET search_path = public.
-- Réouverture : un dossier 'declined' OU 'revoked' repasse en 'pending'
-- (décision de cadrage : revoked traité comme declined). 'pending'/'accepted'
-- déjà actifs → 'already_tracked'.
CREATE OR REPLACE FUNCTION public.request_tracking(p_profile_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id     uuid;
  v_status text;
BEGIN
  IF NOT public.is_prac_admin(auth.uid()) THEN
    RAISE EXCEPTION 'not_prac_admin';
  END IF;

  SELECT id, status INTO v_id, v_status
    FROM public.tracked_players
   WHERE profile_id = p_profile_id;

  IF FOUND THEN
    IF v_status IN ('pending', 'accepted') THEN
      RAISE EXCEPTION 'already_tracked';
    END IF;

    -- declined OU revoked → réouverture
    UPDATE public.tracked_players
       SET status       = 'pending',
           added_by     = auth.uid(),
           requested_at = now(),
           responded_at = NULL
     WHERE id = v_id;
    RETURN v_id;
  END IF;

  INSERT INTO public.tracked_players (profile_id, added_by)
  VALUES (p_profile_id, auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.request_tracking(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_tracking(uuid) TO authenticated;

-- ── 5. remove_tracking(p_profile_id) — admin retire du roster ─────────────────
-- DELETE du dossier. La cascade vers tracked_matches sera effective au chantier 3
-- (FK tracked_player_id ON DELETE CASCADE) — rien à faire ici.
CREATE OR REPLACE FUNCTION public.remove_tracking(p_profile_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_prac_admin(auth.uid()) THEN
    RAISE EXCEPTION 'not_prac_admin';
  END IF;

  DELETE FROM public.tracked_players WHERE profile_id = p_profile_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.remove_tracking(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.remove_tracking(uuid) TO authenticated;
