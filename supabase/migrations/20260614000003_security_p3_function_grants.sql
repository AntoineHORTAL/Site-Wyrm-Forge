-- P3-3a/3b (2026-06-14) — Verrouillage des EXECUTE sur les fonctions sensibles.
--
-- Constat : les migrations tournois/cosmétiques faisaient « REVOKE EXECUTE FROM
-- PUBLIC » mais Supabase re-GRANT par défaut EXECUTE à anon + authenticated +
-- service_role sur toute nouvelle fonction du schéma public (ALTER DEFAULT
-- PRIVILEGES). Résultat vérifié sur le remote : anon=X et authenticated=X
-- étaient TOUJOURS présents → le REVOKE FROM PUBLIC ne fermait rien pour anon.
-- Ces RPC n'étaient protégées que par leur garde interne auth.uid(). On ajoute
-- ici la défense en profondeur : anon ne peut plus les invoquer du tout.
--
-- Règle appliquée, fonction par fonction :
--   • RPC tournois (seed/report/undo/start) : REVOKE PUBLIC+anon, GRANT authenticated.
--       Appelées via userDb (client JWT user) dans tournament-admin → authenticated requis.
--   • equip/unequip_cosmetic, get_balance, clear_riot_link : REVOKE PUBLIC+anon,
--       GRANT authenticated. Appelées directement depuis le front avec le JWT user.
--   • purchase_cosmetic, finalize_quest_claim : REVOKE PUBLIC+anon+authenticated.
--       Appelées EXCLUSIVEMENT par les EF (shop-purchase / quest-claim) en
--       service_role, qui conserve son grant explicite et bypass de toute façon.
--
-- service_role n'est jamais révoqué (grant explicite conservé) → les EF continuent.
-- get_equipped_cosmetics N'EST PAS touché (lecture publique anon/auth assumée).

-- ── RPC tournois : anon out, authenticated in ────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.seed_bracket(uuid)              FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.seed_bracket(uuid)              TO authenticated;

REVOKE EXECUTE ON FUNCTION public.report_match_result(uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.report_match_result(uuid, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.undo_match_result(uuid)         FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.undo_match_result(uuid)         TO authenticated;

REVOKE EXECUTE ON FUNCTION public.start_match(uuid)               FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.start_match(uuid)               TO authenticated;

-- ── RPC cosmétiques côté user : anon out, authenticated in ───────────────────
REVOKE EXECUTE ON FUNCTION public.equip_cosmetic(bigint)   FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.equip_cosmetic(bigint)   TO authenticated;

REVOKE EXECUTE ON FUNCTION public.unequip_cosmetic(bigint) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.unequip_cosmetic(bigint) TO authenticated;

-- ── Solde + délier Riot : anon out, authenticated in ─────────────────────────
REVOKE EXECUTE ON FUNCTION public.get_balance()     FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_balance()     TO authenticated;

REVOKE EXECUTE ON FUNCTION public.clear_riot_link() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.clear_riot_link() TO authenticated;

-- ── service_role-only : tout le monde out sauf service_role ──────────────────
-- 3b — purchase_cosmetic fait confiance à p_user_id. C'est SÛR uniquement parce
-- que plus personne d'autre que service_role ne peut l'appeler après ce REVOKE.
-- Ne JAMAIS tenter auth.uid() à l'intérieur : il vaut NULL en service_role.
REVOKE EXECUTE ON FUNCTION public.purchase_cosmetic(uuid, bigint)
  FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.finalize_quest_claim(uuid, text, date, integer)
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.purchase_cosmetic(uuid, bigint) IS
$$SECURITY DEFINER. Fait confiance au paramètre p_user_id (débite SON ledger,
lui octroie le cosmétique). Sûr UNIQUEMENT parce que l'EXECUTE est révoqué à
PUBLIC/anon/authenticated : seul service_role (EF shop-purchase) peut l'appeler,
et l'EF force p_user_id = user.id du JWT. Ne pas exposer en RPC direct. Ne pas
lire auth.uid() ici (NULL en service_role).$$;
