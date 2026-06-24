-- P0 CRITIQUE (2026-06-14) — Verrouillage des colonnes de privilège de profiles.
--
-- Faille fermée :
--   La policy UPDATE de profiles était PERMISSIVE `(auth.uid() = id OR is_admin())`
--   SANS restriction de colonnes et SANS policy RESTRICTIVE. Conséquence : tout
--   utilisateur authentifié pouvait exécuter
--     UPDATE profiles SET tier='architecte+', certified=true, role='admin'
--       WHERE id = auth.uid();
--   → auto-élévation de privilèges confirmée.
--   La migration ...009 a bien activé RLS + recréé le guard INSERT, mais n'a
--   jamais corrigé la policy UPDATE. Le trigger trg_protect_riot_columns ne
--   couvre QUE les colonnes riot_* → les colonnes de privilège restaient libres.
--
-- Pourquoi un trigger plutôt qu'une policy RESTRICTIVE :
--   Une policy RLS WITH CHECK ne voit que la NOUVELLE ligne (NEW), jamais
--   l'ANCIENNE (OLD). Elle ne peut donc pas exprimer « interdire le CHANGEMENT
--   de valeur d'une colonne ». Un trigger BEFORE UPDATE compare OLD/NEW et est
--   le bon outil pour bloquer la mutation des colonnes sensibles par un non-admin.
--
-- Colonnes de privilège protégées : role, tier, tier_expires_at, certified.
--   (Il n'existe PAS de colonne is_admin sur profiles — le statut admin est porté
--    par la table admin_users + la fonction is_admin().)
--
-- Bypass légitimes (NON bloqués par le trigger) :
--   • service_role  — Edge Functions (current_user = 'service_role')
--   • postgres      — SECURITY DEFINER + SQL admin direct (current_user = 'postgres')
--   • admin authentifié — is_admin() = true (gestion des tiers via SQL/EF admin)
--
-- Impact fonctionnel : NUL. Un grep a prouvé qu'aucun code front ni aucune EF
-- n'écrit role/tier/tier_expires_at/certified depuis un client authentifié. La
-- gestion des tiers se fait en SQL admin (postgres) ou via une future EF
-- service_role — toutes deux non bloquées.

-- ── 1. Policy UPDATE : remplacement propre (pas d'empilement) ─────────────────

-- Supprime TOUTE policy UPDATE existante sur profiles (quel que soit son nom,
-- y compris la permissive trop large créée hors versionnage en prod) avant de
-- recréer la version canonique. Évite de laisser traîner une policy permissive.
DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname
      FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename  = 'profiles'
       AND cmd        = 'UPDATE'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.profiles', pol.policyname);
  END LOOP;
END $$;

-- Policy permissive : un user peut éditer SA ligne, un admin n'importe laquelle.
-- La restriction de COLONNES est assurée par le trigger ci-dessous (RLS ne peut
-- pas comparer OLD/NEW).
CREATE POLICY "profiles_update_self_or_admin"
  ON public.profiles
  AS PERMISSIVE
  FOR UPDATE TO authenticated
  USING      (auth.uid() = id OR public.is_admin())
  WITH CHECK (auth.uid() = id OR public.is_admin());

-- ── 2. Trigger : interdire la mutation des colonnes de privilège par un non-admin ──

CREATE OR REPLACE FUNCTION public.fn_protect_privilege_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Ne s'applique qu'aux appels client directs (JWT user → current_user = 'authenticated').
  -- service_role / postgres passent au travers (bypass légitime). Parmi les
  -- 'authenticated', les admins (is_admin()) sont autorisés à muter ces colonnes.
  IF current_user = 'authenticated'
     AND NOT public.is_admin()
     AND (
       NEW.role            IS DISTINCT FROM OLD.role            OR
       NEW.tier            IS DISTINCT FROM OLD.tier            OR
       NEW.tier_expires_at IS DISTINCT FROM OLD.tier_expires_at OR
       NEW.certified       IS DISTINCT FROM OLD.certified
     ) THEN
    RAISE EXCEPTION 'direct modification of privilege columns not allowed'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

-- Idempotent sur re-run.
DROP TRIGGER IF EXISTS trg_protect_privilege_columns ON public.profiles;

CREATE TRIGGER trg_protect_privilege_columns
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_protect_privilege_columns();
