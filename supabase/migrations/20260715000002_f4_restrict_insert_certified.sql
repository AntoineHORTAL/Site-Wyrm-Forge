-- F4 (audit sécurité) — la policy INSERT permettait l'auto-attribution de certified=true.
--
-- restrict_insert_privileges (RESTRICTIVE, TO authenticated, cmd INSERT) contraignait
-- role='user' et tier='apprenti' mais PAS certified. Un utilisateur authentifié pouvait
-- donc insérer SA propre ligne profil avec certified = true (id = auth.uid(), role='user',
-- tier='apprenti' → toutes les WITH CHECK passaient), s'octroyant le badge certifié sans
-- passer par un admin.
--
-- Aucun flux légitime ne pose certified=true à l'INSERT :
--   - création de profil = INSERT avec certified:false en dur
--     (src/app/auth/callback/route.ts, AuthModal) ;
--   - certification d'un profil existant = UPDATE admin uniquement
--     (src/components/dashboard/tabs/AdminTab.tsx : .update({ certified }) ),
--     protégé par le trigger BEFORE UPDATE trg_protect_privilege_columns
--     (fn_protect_privilege_columns) qui n'autorise la mutation de role/tier/
--     tier_expires_at/certified qu'aux admins (is_admin()). Ce trigger ne
--     s'applique PAS à l'INSERT, d'où le trou fermé ici côté policy.
--
-- Correctif : ajout de « certified = false » à la clause WITH CHECK. La policy étant
-- RESTRICTIVE, cette condition est obligatoire pour tout INSERT client. ALTER POLICY
-- remplace la seule expression WITH CHECK ; le caractère RESTRICTIVE et le TO authenticated
-- sont préservés (non modifiables/inchangés par ALTER POLICY).
--
-- Ancienne WITH CHECK (pour trace) :
--   ((id = auth.uid()) AND (role = 'user'::text) AND (tier = 'apprenti'::text))

ALTER POLICY restrict_insert_privileges ON public.profiles
  WITH CHECK (
    id = auth.uid()
    AND role = 'user'
    AND tier = 'apprenti'
    AND certified = false
  );
