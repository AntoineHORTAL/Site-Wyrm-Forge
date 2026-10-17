-- Migration 20261017000002 : la table `scenarios` obéit au flag `scenarios_enabled`.
--
-- ════════════════════════════════════════════════════════════════════════════
--  POURQUOI
-- ════════════════════════════════════════════════════════════════════════════
-- `scenarios_enabled` est un flag de LANCEMENT (kind 'launch', value 'false' sur
-- TEST et PROD depuis le 2026-09-06). Jusqu'ici il n'était qu'un RIDEAU :
--   • le site cachait l'entrée de navigation, mais `/?tab=scenarios` affichait
--     encore l'onglet (écran « bientôt ») ;
--   • l'app WPF ne lisait pas du tout le flag : bouton et onglet toujours là ;
--   • la base ne le regardait pas : les 4 policies `scn_*` ne testaient que
--     `auth.uid() = user_id`. N'importe quel compte connecté lisait, créait,
--     modifiait et supprimait ses scénarios au `curl`, flag fermé.
-- Les deux clients cachent désormais l'onglet ; cette migration est la BARRIÈRE.
-- Même principe que la relecture du flag dans `kit_request_order` (20260909000001) :
-- un flag est de la présentation, la coupure réelle est côté serveur.
--
-- ════════════════════════════════════════════════════════════════════════════
--  CE QUE ÇA CHANGE
-- ════════════════════════════════════════════════════════════════════════════
-- Flag FERMÉ : un compte non admin ne voit plus AUCUNE ligne (SELECT → []),
-- et INSERT / UPDATE / DELETE sont refusés (INSERT → 42501 « new row violates
-- row-level security policy » ; UPDATE / DELETE → 0 ligne touchée).
-- Les lignes existantes ne sont PAS supprimées : elles redeviennent visibles à
-- l'ouverture du flag.
--
-- Flag OUVERT depuis l'AdminTab : effet IMMÉDIAT, à la requête suivante, sans
-- déploiement — la policy relit `app_settings` à chaque requête. Les clients, eux,
-- suivent à leur rythme (site 60 s, app 5 min).
--
-- Passe-droit ADMIN conservé (décision HORTAL du 2026-10-17) : `is_admin()` voit et
-- écrit ses propres scénarios flag fermé — c'est ce qui permet de recetter avant
-- lancement, comme sur le site. « Ses propres » : le prédicat de propriété reste
-- obligatoire pour tout le monde, admin compris. L'app WPF n'a pas de notion
-- d'admin : elle cache l'onglet à tous, flag fermé.
--
-- ⚠️ Le verrou « palier payant » des Scénarios reste PUREMENT CÔTÉ CLIENT : cette
-- migration ne le traite pas (dette documentée dans AGENTS.md § table scenarios).
--
-- ════════════════════════════════════════════════════════════════════════════
--  `launch_flag_on(p_key)` — un flag est-il ouvert, vu de la base ?
-- ════════════════════════════════════════════════════════════════════════════
-- Vrai si la ligne existe, est un flag PUBLIC (jamais une valeur de tuning privée :
-- la fonction est appelable par tout compte connecté et ne doit rien révéler de
-- ce que `as_select_anon` cache) et vaut 'true', ET si tous ses ancêtres
-- (`parent_key`) valent 'true' — même règle que `resolveFlags` côté clients.
-- Ligne absente ⇒ false : repli FERMÉ, aligné sur `flagFallback` pour un flag de
-- lancement. `kind` n'est pas regardé : « Lancer » (AdminTab) passe 'launch' →
-- 'kill' en posant 'true' dans la même écriture, la valeur suffit.
--
-- SECURITY DEFINER pour lire `app_settings` sans dépendre de ses policies (qui
-- évoluent pour d'autres raisons), STABLE pour que le planificateur l'évalue une
-- fois par requête : les policies l'enveloppent dans un `(SELECT …)` (initPlan),
-- comme `auth.uid()`.
--
-- Droits — règle des trois instructions (20260909000002) : `REVOKE … FROM PUBLIC`
-- seul ne retire rien, les DEFAULT PRIVILEGES de Supabase accordent EXECUTE
-- nominativement à `anon` et `authenticated`. `authenticated` DOIT garder EXECUTE :
-- les policies s'évaluent avec les droits du rôle appelant, sans lui toute lecture
-- de `scenarios` lèverait 42501. `anon` n'a aucun accès à `scenarios`
-- (20260901000003) : il n'en a pas besoin.
--
-- Idempotent : CREATE OR REPLACE + DROP/CREATE POLICY, rejouable.

CREATE OR REPLACE FUNCTION public.launch_flag_on(p_key text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH RECURSIVE chain AS (
    SELECT s.key, s.value, s.parent_key, 1 AS depth
      FROM public.app_settings s
     WHERE s.key = p_key
       AND s.kind <> 'setting'
       AND s.is_public
    UNION ALL
    SELECT p.key, p.value, p.parent_key, c.depth + 1
      FROM public.app_settings p
      JOIN chain c ON p.key = c.parent_key
     WHERE c.depth < 8              -- garde-fou anti-cycle, comme côté client
  )
  SELECT EXISTS (SELECT 1 FROM chain)
     AND NOT EXISTS (SELECT 1 FROM chain WHERE value IS DISTINCT FROM 'true')
     -- Un parent déclaré mais introuvable (ou une chaîne trop longue) ⇒ fermé.
     AND NOT EXISTS (
       SELECT 1 FROM chain c
        WHERE c.parent_key IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM chain p WHERE p.key = c.parent_key)
     );
$$;

REVOKE ALL ON FUNCTION public.launch_flag_on(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.launch_flag_on(text) FROM anon;
GRANT  EXECUTE ON FUNCTION public.launch_flag_on(text) TO authenticated;

-- ── Les 4 policies `scn_*` : propriété ET (flag ouvert OU admin) ─────────────
-- Mêmes noms, mêmes rôles (`TO authenticated`) que 20260622000001 : seul le
-- prédicat s'allonge. `WITH CHECK` porte la même condition que `USING`, sinon un
-- UPDATE pourrait réécrire une ligne flag fermé.

DROP POLICY IF EXISTS "scn_select_own" ON public.scenarios;
CREATE POLICY "scn_select_own"
  ON public.scenarios FOR SELECT TO authenticated
  USING (
    (SELECT auth.uid()) = user_id
    AND ((SELECT public.launch_flag_on('scenarios_enabled')) OR (SELECT public.is_admin()))
  );

DROP POLICY IF EXISTS "scn_insert_own" ON public.scenarios;
CREATE POLICY "scn_insert_own"
  ON public.scenarios FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) = user_id
    AND ((SELECT public.launch_flag_on('scenarios_enabled')) OR (SELECT public.is_admin()))
  );

DROP POLICY IF EXISTS "scn_update_own" ON public.scenarios;
CREATE POLICY "scn_update_own"
  ON public.scenarios FOR UPDATE TO authenticated
  USING (
    (SELECT auth.uid()) = user_id
    AND ((SELECT public.launch_flag_on('scenarios_enabled')) OR (SELECT public.is_admin()))
  )
  WITH CHECK (
    (SELECT auth.uid()) = user_id
    AND ((SELECT public.launch_flag_on('scenarios_enabled')) OR (SELECT public.is_admin()))
  );

DROP POLICY IF EXISTS "scn_delete_own" ON public.scenarios;
CREATE POLICY "scn_delete_own"
  ON public.scenarios FOR DELETE TO authenticated
  USING (
    (SELECT auth.uid()) = user_id
    AND ((SELECT public.launch_flag_on('scenarios_enabled')) OR (SELECT public.is_admin()))
  );

-- ── Auto-vérification : fait échouer le push si l'état visé n'est pas atteint ──
-- Une révocation qui ne révoque rien passe la relecture de code (20260909000002) :
-- on interroge les privilèges réels, dans les deux sens, et les 4 policies.
DO $$
DECLARE
  v_fn regprocedure := 'public.launch_flag_on(text)'::regprocedure;
  v_n  int;
BEGIN
  IF has_function_privilege('anon', v_fn, 'EXECUTE') THEN
    RAISE EXCEPTION 'launch_flag_on : anon a encore EXECUTE';
  END IF;
  IF NOT has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN
    RAISE EXCEPTION 'launch_flag_on : authenticated a perdu EXECUTE — toute lecture de scenarios casserait';
  END IF;
  SELECT count(*) INTO v_n
    FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'scenarios'
     AND policyname IN ('scn_select_own','scn_insert_own','scn_update_own','scn_delete_own')
     AND coalesce(qual, '') || coalesce(with_check, '') LIKE '%launch_flag_on%';
  IF v_n <> 4 THEN
    RAISE EXCEPTION 'scenarios : % policies scn_* sur 4 relisent le flag', v_n;
  END IF;
  SELECT count(*) INTO v_n
    FROM pg_policies WHERE schemaname = 'public' AND tablename = 'scenarios';
  IF v_n <> 4 THEN
    RAISE EXCEPTION 'scenarios : % policies au lieu de 4 — une policy permissive en trop contournerait le flag', v_n;
  END IF;
END
$$;
