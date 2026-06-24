-- Migration 20260613000001 : table tournament_admins + is_tournament_admin().
--
-- Remplace la béquille env TOURNAMENT_CREATORS. Les droits d'administration des
-- tournois ne sont PAS branchés sur profiles.role (P0 auto-élévation non résolu :
-- la policy UPDATE de profiles n'est pas encore verrouillée par colonnes).
-- Table dédiée, isolée, RLS stricte : le client ne peut que LIRE ses propres droits.
--
-- scope :
--   'global'          → tous les tournois + droit de créer
--   'series:{nom}'    → tous les tournois d'une série + droit de créer
--   '{tournament_id}' → ce tournoi précis uniquement (uuid en texte)

CREATE TABLE IF NOT EXISTS public.tournament_admins (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  scope       text NOT NULL,
  granted_by  uuid REFERENCES auth.users,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, scope)
);

CREATE INDEX IF NOT EXISTS idx_tournament_admins_user ON public.tournament_admins (user_id);

ALTER TABLE public.tournament_admins ENABLE ROW LEVEL SECURITY;

-- Lecture : un utilisateur ne voit QUE ses propres droits (pour afficher les boutons).
DROP POLICY IF EXISTS ta_select_self ON public.tournament_admins;
CREATE POLICY ta_select_self ON public.tournament_admins
  FOR SELECT
  USING (auth.uid() = user_id);

-- Aucune policy INSERT/UPDATE/DELETE pour le client : tout passe par l'Edge Function
-- tournament-admin via service_role (actions grant_admin / revoke_admin).

-- ── Fonction helper is_tournament_admin ──────────────────────────────────────
-- SECURITY DEFINER : lit tournament_admins (et tournaments.series) en contournant
-- la RLS ta_select_self, pour pouvoir évaluer les droits de n'importe quel user.
-- p_tournament NULL = contexte "création" (pas de tournoi cible) : on exige un
-- scope 'global' OU une série quelconque ('series:%').
CREATE OR REPLACE FUNCTION public.is_tournament_admin(
  p_uid        uuid,
  p_tournament uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_series text;
BEGIN
  IF p_uid IS NULL THEN
    RETURN false;
  END IF;

  -- Admin global → tout pouvoir
  IF EXISTS (
    SELECT 1 FROM public.tournament_admins
     WHERE user_id = p_uid AND scope = 'global'
  ) THEN
    RETURN true;
  END IF;

  -- Contexte création (pas de tournoi cible) : exiger une série quelconque
  IF p_tournament IS NULL THEN
    RETURN EXISTS (
      SELECT 1 FROM public.tournament_admins
       WHERE user_id = p_uid AND scope LIKE 'series:%'
    );
  END IF;

  -- Scope tournoi précis
  IF EXISTS (
    SELECT 1 FROM public.tournament_admins
     WHERE user_id = p_uid AND scope = p_tournament::text
  ) THEN
    RETURN true;
  END IF;

  -- Scope série du tournoi
  SELECT series INTO v_series FROM public.tournaments WHERE id = p_tournament;
  IF v_series IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.tournament_admins
     WHERE user_id = p_uid AND scope = 'series:' || v_series
  ) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.is_tournament_admin(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_tournament_admin(uuid, uuid) TO authenticated;

-- ── BOOTSTRAP (à exécuter À LA MAIN — voir docs/tournois.md) ──────────────────
-- Le premier admin global doit être inséré manuellement : l'action grant_admin de
-- l'Edge Function exige déjà d'être admin global, donc impossible de s'auto-amorcer.
-- Exemple (remplacer l'email) :
--   INSERT INTO public.tournament_admins (user_id, scope)
--   SELECT id, 'global' FROM auth.users WHERE email = 'antoinehortal2001@gmail.com'
--   ON CONFLICT (user_id, scope) DO NOTHING;
