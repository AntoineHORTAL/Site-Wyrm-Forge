-- Migration 20260627000003 : moindre privilège sur tracked_players (dette Lot A).
--
-- La migration 20260626000002 (Lot A) n'a fait qu'un `GRANT SELECT ... TO
-- authenticated` sans REVOKE préalable. Or Supabase applique des DEFAULT
-- PRIVILEGES accordant ALL (SELECT/INSERT/UPDATE/DELETE/…) à anon ET authenticated
-- sur toute nouvelle table → tracked_players s'est retrouvée avec ALL pour ces deux
-- rôles. Fonctionnellement masqué par la RLS (aucune policy INSERT/UPDATE/DELETE,
-- donc ces opérations sont refusées même privilège accordé), mais ce n'est pas le
-- moindre privilège voulu. Même correctif que tracked_matches (migration 000002).
--
-- Aucun impact fonctionnel : les seules écritures sur tracked_players passent par
-- request_tracking / remove_tracking / respond_consent (SECURITY DEFINER, owned
-- postgres → bypass des grants table). Côté client, tracked_players est lue en
-- SELECT uniquement (ConsentBanner, page /consent). service_role non touché.
--
-- Idempotent : REVOKE/GRANT rejouables sans effet de bord.

REVOKE ALL ON public.tracked_players FROM anon, authenticated;
GRANT SELECT ON public.tracked_players TO authenticated;   -- anon : aucun privilège
