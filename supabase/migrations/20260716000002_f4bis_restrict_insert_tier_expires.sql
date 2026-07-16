-- F4bis (audit sécurité) — ferme l'angle mort tier_expires_at à l'INSERT sur profiles.
--
-- La policy RESTRICTIVE restrict_insert_privileges (TO authenticated, cmd INSERT)
-- contraignait id/role/tier/certified mais PAS tier_expires_at. Un utilisateur
-- authentifié pouvait donc insérer SA ligne profil avec un tier_expires_at arbitraire
-- (id = auth.uid(), role='user', tier='apprenti', certified=false → WITH CHECK passait).
--
-- Impact réel = FAIBLE (diagnostic confirmé, pas supposé) :
--   Aucun chemin, ni site ni app WPF ni DB, ne se fie à tier_expires_at SEUL pour
--   accorder un accès. Recensement exhaustif des lectures :
--     • Site  — page.tsx : effectiveTier dérive de `tier` uniquement ; tier_expires_at
--       n'alimente que SubscriptionReminder (popup cosmétique, gardée par tier!='apprenti').
--       AdminTab / profil : affichage + stats admin, toujours couplés à `tier`.
--     • WPF   — Accueil.xaml.cs MaybeShowRenewalReminder : rappel de renouvellement,
--       gardé par tier!='apprenti' ; aucun gate d'accès. Nulle part ailleurs.
--     • DB    — 0 policy RLS et 0 fonction ne référencent tier_expires_at pour décider
--       d'un accès (seul fn_protect_privilege_columns le cite, et c'est la garde UPDATE).
--   Comme la policy fige déjà tier='apprenti' à l'INSERT, un tier_expires_at forgé ne
--   déclenche rien (tous les consommateurs exigent tier!='apprenti'). Correctif =
--   defense-in-depth : on ne laisse pas un champ de privilège non contraint à l'INSERT.
--
-- Sûreté du correctif : les deux seuls flux de création de profil laissent
-- tier_expires_at à NULL — AuthModal.tsx (insert sans le champ) et auth/callback/route.ts
-- (upsert sans le champ) — et le DEFAULT DB de la colonne est NULL. La contrainte
-- « tier_expires_at IS NULL » n'affecte donc aucun INSERT légitime. L'attribution d'une
-- date d'expiration reste réservée aux admins via UPDATE (AdminTab), protégée par le
-- trigger trg_protect_privilege_columns.
--
-- Correctif : ajout de « tier_expires_at IS NULL » à la clause WITH CHECK, comme F4
-- (ALTER POLICY remplace la seule expression WITH CHECK ; RESTRICTIVE + TO authenticated
-- préservés, non modifiés par ALTER POLICY).
--
-- Ancienne WITH CHECK (F4, pour trace) :
--   ((id = auth.uid()) AND (role = 'user') AND (tier = 'apprenti') AND (certified = false))

ALTER POLICY restrict_insert_privileges ON public.profiles
  WITH CHECK (
    id = auth.uid()
    AND role = 'user'
    AND tier = 'apprenti'
    AND certified = false
    AND tier_expires_at IS NULL
  );
