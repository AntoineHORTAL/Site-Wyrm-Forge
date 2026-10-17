-- Migration 20261017000003 : les fonctions de cosmétiques obéissent à `cosmetics_enabled`.
--
-- ════════════════════════════════════════════════════════════════════════════
--  POURQUOI
-- ════════════════════════════════════════════════════════════════════════════
-- `cosmetics_enabled` (flag de LANCEMENT, enfant d'`ecailles_enabled`) gouverne
-- l'équipement des cosmétiques. Les clients cachent l'écran quand il est fermé
-- (app : onglet « Équipement » et clin d'œil de l'Accueil, PR app « Forge »), mais
-- la base ne le regardait pas :
--   • `equip_cosmetic` / `unequip_cosmetic` (EXECUTE `authenticated`) étaient
--     appelables au `curl` par tout compte connecté possédant un cosmétique ;
--   • `get_equipped_cosmetics` (EXECUTE `anon` ET `authenticated`) renvoyait les
--     cosmétiques équipés de n'importe quel joueur, page publique comprise — donc
--     annonçait la feature à des visiteurs anonymes.
--
-- Même principe que `scenarios` (20261017000002) : un flag est de la présentation,
-- la coupure réelle est en base. Lecture du flag par `launch_flag_on`, qui remonte
-- `parent_key` : `ecailles_enabled` fermé ferme aussi les cosmétiques.
--
-- ════════════════════════════════════════════════════════════════════════════
--  CE QUI CHANGE — et ce qui NE change PAS
-- ════════════════════════════════════════════════════════════════════════════
--   • equip / unequip, flag fermé : `RAISE 'cosmetics_disabled'`, AVANT tout accès
--     aux lignes (la garde ne dit donc rien de la possession). Admin exempté
--     (recette avant lancement, comme sur le site).
--   • get_equipped_cosmetics, flag fermé : liste VIDE, jamais d'erreur — la page
--     publique qui l'appelle doit rester affichable. Admin exempté quand il appelle
--     sous son JWT (`is_admin()` lit l'appelant) ; un visiteur anonyme n'est jamais
--     admin. Dans une fonction SECURITY DEFINER, `is_admin()` et `launch_flag_on()`
--     s'exécutent avec les droits du propriétaire : aucun GRANT nouveau pour `anon`.
--   • Corps métier recopié À L'IDENTIQUE de la version en place (badges multiples de
--     20260608000001 compris), vérifié contre `pg_get_functiondef` en PROD le
--     2026-10-17. Seule la garde est ajoutée.
--   • Les LECTURES propriétaire (`user_cosmetics`, `scales_ledger`, `get_balance`,
--     quêtes) restent ouvertes, flag fermé : décision HORTAL du 2026-10-17 — ce
--     sont les données de chacun, sans effet sur l'économie, et des lignes réelles
--     existent en PROD.
--   • Aucune écriture d'Écailles ici : achats (`shop-purchase`) et quêtes
--     (`quest-claim`) sont gardés par leur Edge Function, qui remonte désormais la
--     hiérarchie des flags (`_shared/flag-chain.ts`).
--
-- Droits : `CREATE OR REPLACE` conserve les GRANT existants (20260614000003 :
-- equip/unequip → authenticated seul ; get_equipped → anon + authenticated). Le
-- bloc `DO` final les revérifie, avec les gardes.
--
-- Dépend de `launch_flag_on` (20261017000002). Idempotent : CREATE OR REPLACE.

CREATE OR REPLACE FUNCTION public.equip_cosmetic(p_cosmetic_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_type        TEXT;
  v_badge_count INT;
BEGIN
  -- Flag de lancement `cosmetics_enabled` (et son parent) — 20261017000003.
  IF NOT (public.launch_flag_on('cosmetics_enabled') OR public.is_admin()) THEN
    RAISE EXCEPTION 'cosmetics_disabled';
  END IF;

  -- Vérifie la possession et récupère le type en une seule requête
  SELECT c.type INTO v_type
  FROM public.user_cosmetics uc
  JOIN public.cosmetics c ON c.id = uc.cosmetic_id
  WHERE uc.user_id    = auth.uid()
    AND uc.cosmetic_id = p_cosmetic_id;

  IF v_type IS NULL THEN
    RAISE EXCEPTION 'cosmetic_not_owned';
  END IF;

  IF v_type = 'badge' THEN
    -- Badges : pas de déséquipement automatique — multi-sélection jusqu'à 5
    SELECT COUNT(*)::INT INTO v_badge_count
    FROM public.user_cosmetics
    WHERE user_id      = auth.uid()
      AND cosmetic_type = 'badge'
      AND is_equipped   = true;

    IF v_badge_count >= 5 THEN
      RAISE EXCEPTION 'badge_limit_reached';
    END IF;
    -- Pas de UPDATE de déséquipement — les autres badges restent équipés
  ELSE
    -- Autres types : déséquipe l'éventuel cosmétique du même type (1 par type)
    UPDATE public.user_cosmetics
      SET is_equipped = false
    WHERE user_id      = auth.uid()
      AND cosmetic_type = v_type
      AND is_equipped   = true;
  END IF;

  -- Équipe le cosmétique demandé
  UPDATE public.user_cosmetics
    SET is_equipped = true
  WHERE user_id     = auth.uid()
    AND cosmetic_id = p_cosmetic_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.unequip_cosmetic(p_cosmetic_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Flag de lancement `cosmetics_enabled` (et son parent) — 20261017000003.
  IF NOT (public.launch_flag_on('cosmetics_enabled') OR public.is_admin()) THEN
    RAISE EXCEPTION 'cosmetics_disabled';
  END IF;

  -- Vérifie la possession
  IF NOT EXISTS (
    SELECT 1 FROM public.user_cosmetics
    WHERE user_id    = auth.uid()
      AND cosmetic_id = p_cosmetic_id
  ) THEN
    RAISE EXCEPTION 'cosmetic_not_owned';
  END IF;

  UPDATE public.user_cosmetics
    SET is_equipped = false
  WHERE user_id    = auth.uid()
    AND cosmetic_id = p_cosmetic_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_equipped_cosmetics(p_puuid text)
 RETURNS TABLE(type text, slug text, name text, image_url text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT c.type, c.slug, c.name, c.image_url
  FROM public.user_cosmetics uc
  JOIN public.cosmetics c ON c.id  = uc.cosmetic_id
  JOIN public.profiles  p ON p.id  = uc.user_id
  WHERE p.riot_puuid  = p_puuid
    AND uc.is_equipped = true
    -- Flag fermé ⇒ liste vide (jamais d'erreur), sauf pour un admin connecté.
    AND (public.launch_flag_on('cosmetics_enabled') OR public.is_admin());
$function$;

-- ── Auto-vérification : fait échouer le push si l'état visé n'est pas atteint ──
DO $$
DECLARE
  v_eq  regprocedure := 'public.equip_cosmetic(bigint)'::regprocedure;
  v_uq  regprocedure := 'public.unequip_cosmetic(bigint)'::regprocedure;
  v_get regprocedure := 'public.get_equipped_cosmetics(text)'::regprocedure;
BEGIN
  IF has_function_privilege('anon', v_eq, 'EXECUTE') OR has_function_privilege('anon', v_uq, 'EXECUTE') THEN
    RAISE EXCEPTION 'equip/unequip_cosmetic : anon a EXECUTE';
  END IF;
  IF NOT (has_function_privilege('authenticated', v_eq, 'EXECUTE')
      AND has_function_privilege('authenticated', v_uq, 'EXECUTE')
      AND has_function_privilege('authenticated', v_get, 'EXECUTE')
      AND has_function_privilege('anon', v_get, 'EXECUTE')) THEN
    RAISE EXCEPTION 'cosmétiques : un GRANT attendu a disparu';
  END IF;
  IF pg_get_functiondef(v_eq)  NOT LIKE '%cosmetics_disabled%'
  OR pg_get_functiondef(v_uq)  NOT LIKE '%cosmetics_disabled%'
  OR pg_get_functiondef(v_get) NOT LIKE '%launch_flag_on(''cosmetics_enabled'')%' THEN
    RAISE EXCEPTION 'cosmétiques : garde du flag absente d''une des trois fonctions';
  END IF;
END
$$;
