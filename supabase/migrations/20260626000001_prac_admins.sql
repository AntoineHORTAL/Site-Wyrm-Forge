-- Migration 20260626000001 : table prac_admins + is_prac_admin().
--
-- Socle du module prac.wyrm-forge.com (outil interne de suivi de joueurs).
-- Allowlist plate (PAS de scopes : prac n'a pas de hiérarchie comme les tournois).
-- Découplé de profiles.role et de admin_users : un admin prac n'est pas
-- forcément super-admin du site, et inversement. Même philosophie de sécurité
-- que tournament_admins : table isolée, RLS stricte (le client ne lit QUE ses
-- propres droits), toute écriture passe par service_role (Edge Function).
--
-- Idempotent : CREATE ... IF NOT EXISTS + DROP/CREATE POLICY, rejouable.

CREATE TABLE IF NOT EXISTS public.prac_admins (
  user_id     uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  granted_by  uuid REFERENCES auth.users,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.prac_admins ENABLE ROW LEVEL SECURITY;

-- Lecture : un utilisateur ne voit QUE sa propre ligne (pour évaluer l'accès au shell).
DROP POLICY IF EXISTS pa_select_self ON public.prac_admins;
CREATE POLICY pa_select_self ON public.prac_admins
  FOR SELECT
  USING (auth.uid() = user_id);

-- Aucune policy INSERT/UPDATE/DELETE côté client : gestion via service_role uniquement
-- (futur back-office prac). Pour l'instant l'amorçage est manuel (voir BOOTSTRAP ci-dessous).

-- ── Fonction helper is_prac_admin ────────────────────────────────────────────
-- SECURITY DEFINER : lit prac_admins en contournant la RLS pa_select_self, pour
-- pouvoir évaluer les droits de n'importe quel user (gardes côté serveur / RLS prac).
CREATE OR REPLACE FUNCTION public.is_prac_admin(p_uid uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT p_uid IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.prac_admins WHERE user_id = p_uid);
$$;

REVOKE EXECUTE ON FUNCTION public.is_prac_admin(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_prac_admin(uuid) TO authenticated;

-- ── BOOTSTRAP (à exécuter À LA MAIN) ─────────────────────────────────────────
-- Aucune action client ne peut amorcer la table (writes service_role only).
-- Insérer HORTAL + Ewen manuellement (remplacer l'email d'Ewen) :
--   INSERT INTO public.prac_admins (user_id)
--   SELECT id FROM auth.users
--    WHERE email IN ('antoinehortal2001@gmail.com', 'EWEN_EMAIL_ICI')
--   ON CONFLICT (user_id) DO NOTHING;
