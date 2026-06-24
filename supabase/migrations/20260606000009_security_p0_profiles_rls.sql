-- P0 CRITIQUE : Garantir que RLS est activée sur la table profiles.
-- La migration 20260530000003 a créé la policy restrict_insert_privileges mais
-- n'a jamais exécuté ALTER TABLE profiles ENABLE ROW LEVEL SECURITY.
-- Sans cette activation, toutes les policies (INSERT guard, trigger riot_*)
-- sont inopérantes : n'importe quel utilisateur authentifié pourrait s'auto-promouvoir.
--
-- ALTER TABLE ... ENABLE ROW LEVEL SECURITY est idempotent (pas d'erreur si déjà activé).

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Recréer la policy RESTRICTIVE de façon idempotente pour garantir son état.
-- Contenu identique à 20260530000003, mais précédé d'un DROP IF EXISTS.
DROP POLICY IF EXISTS "restrict_insert_privileges" ON public.profiles;

CREATE POLICY "restrict_insert_privileges"
  ON public.profiles
  AS RESTRICTIVE
  FOR INSERT TO authenticated
  WITH CHECK (
    id   = auth.uid()
    AND role = 'user'
    AND tier = 'apprenti'
  );
