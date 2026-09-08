-- ════════════════════════════════════════════════════════════════════════════
--  SÉCURITÉ — les 5 fonctions du module « Kit sur mesure » étaient exécutables
--             par le rôle `anon`
-- ════════════════════════════════════════════════════════════════════════════
-- Constat mesuré le 2026-09-09 par les tests SQL du lot 2
-- (`supabase/tests/20260909000001_kit_request_order_test.sql`, cas T7 / T13b /
-- T13c) : `has_function_privilege('anon', …, 'EXECUTE')` renvoyait `true` pour
-- les CINQ fonctions du module.
--
--   kit_request_order   → anon entrait dans le corps de la fonction
--   kit_open_order      → idem
--   kit_set_status      → idem
--   kit_set_details     → idem
--   kit_assert_snapshot → idem (helper interne, jamais destiné à être exposé)
--
-- ── Cause — la MÊME que celle de 20260731000002, à la lettre ────────────────
-- Les `ALTER DEFAULT PRIVILEGES` du projet Supabase accordent EXECUTE sur les
-- fonctions du schéma `public` NOMINATIVEMENT aux rôles `anon` et
-- `authenticated`. `REVOKE … FROM PUBLIC` ne retire que le privilège du
-- pseudo-rôle PUBLIC : il ne touche PAS un grant nominatif.
--
-- Les migrations 20260908000001 et 20260909000001 portaient bien leur
-- `REVOKE EXECUTE … FROM PUBLIC` — ce n'était donc pas un oubli d'écriture, mais
-- une révocation qui ne révoquait rien. Le `REVOKE … FROM anon` manquait, et
-- lui seul comptait.
--
-- ⚠️ Le dépôt AVAIT DÉJÀ diagnostiqué et documenté exactement ce piège :
-- `20260731000002_revoke_definer_anon.sql` se termine par une « Note pour les
-- migrations futures » qui dit que toute nouvelle fonction SECURITY DEFINER doit
-- porter LES DEUX révocations, et qu'« un REVOKE FROM PUBLIC seul passe la
-- relecture de code mais pas la sonde ». Les migrations du kit ne l'ont pas
-- suivie. C'est cette note qu'il fallait lire, et c'est celle-ci qui la rejoue.
--
-- ── Impact réel avant correctif ─────────────────────────────────────────────
-- Faible mais non nul, et à ne pas minimiser pour autant :
--
-- • Les quatre RPC gardent leur garde APPLICATIVE interne — `is_admin()` pour
--   trois d'entre elles, `auth.uid() IS NULL → not_authenticated` pour
--   `kit_request_order`. Avec la seule clé anon publique, `auth.uid()` vaut NULL,
--   donc aucune des quatre n'aboutissait à une écriture. La défense en
--   profondeur était entamée d'une couche, pas franchie.
--
-- • `kit_request_order` est le cas le plus proche du problème : elle est la
--   première fonction du module accordée à un non-admin, et sa garde de FLAG
--   (`kit_sur_mesure_enabled`) est ce qui empêche l'ouverture du service avant
--   son lancement. Un porteur de la clé anon atteignait cette garde au lieu
--   d'être arrêté au privilège — le refus tenait donc à UNE condition au lieu de
--   deux.
--
-- • `kit_assert_snapshot` n'a aucune raison d'être appelable de l'extérieur :
--   c'est un helper de validation, il ne lit ni n'écrit rien. Exposé, il ne
--   donne rien à un attaquant — mais il élargit la surface pour zéro bénéfice.
--
-- Aucun impact sur le fonctionnement : `authenticated` conserve ses quatre
-- GRANT, et `service_role` (Edge Functions) n'est concerné par aucune
-- révocation — même parti pris que 20260731000002 et que la note de
-- `prac_notification_log`.
--
-- ── Pourquoi une migration NEUVE plutôt que corriger les deux précédentes ────
-- 20260908000001 est APPLIQUÉE EN PRODUCTION et 20260909000001 sur Test :
-- éditer leur fichier ne les rejouerait nulle part, et laisserait les deux bases
-- trouées tout en donnant l'illusion inverse à la lecture du dépôt. C'est le
-- précédent déjà posé par `20260901000003` sur `scenarios` et par
-- `20260731000002` lui-même : on répare EN AVANT, l'historique n'est pas réécrit.
--
-- Idempotent : un REVOKE sur un privilège déjà absent est un no-op silencieux,
-- et les GRANT sont réaffirmés tels quels.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Les quatre RPC — anon révoqué, authenticated CONSERVÉ ────────────────
-- Contrairement aux fonctions de 20260731000002 (destinées à service_role seul),
-- celles-ci sont légitimement appelables par un utilisateur connecté : ce sont
-- elles qui portent le panneau admin et le dépôt client. On ne révoque donc QUE
-- `anon`, et on réaffirme le GRANT juste après pour que l'état visé se lise en
-- un seul endroit.

REVOKE ALL ON FUNCTION public.kit_request_order(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.kit_request_order(jsonb) FROM anon;
GRANT  EXECUTE ON FUNCTION public.kit_request_order(jsonb) TO authenticated;

REVOKE ALL ON FUNCTION public.kit_open_order(uuid, jsonb, text, integer, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.kit_open_order(uuid, jsonb, text, integer, text) FROM anon;
GRANT  EXECUTE ON FUNCTION public.kit_open_order(uuid, jsonb, text, integer, text) TO authenticated;

REVOKE ALL ON FUNCTION public.kit_set_status(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.kit_set_status(uuid, text, text) FROM anon;
GRANT  EXECUTE ON FUNCTION public.kit_set_status(uuid, text, text) TO authenticated;

-- ⚠️ La signature à QUATRE arguments, seule survivante : la version à trois
-- (uuid, integer, text) a été supprimée par 20260909000001, et une fonction
-- supprimée emporte ses privilèges avec elle. Ne PAS ajouter de REVOKE sur
-- l'ancienne signature : un REVOKE sur une fonction inexistante lève 42883 et
-- ferait échouer cette migration sur toute base déjà à jour.
REVOKE ALL ON FUNCTION public.kit_set_details(uuid, integer, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.kit_set_details(uuid, integer, text, jsonb) FROM anon;
GRANT  EXECUTE ON FUNCTION public.kit_set_details(uuid, integer, text, jsonb) TO authenticated;

-- ── 2. Le helper interne — révoqué des DEUX rôles clients ──────────────────
-- `kit_assert_snapshot` n'est appelée que depuis `kit_request_order` et
-- `kit_set_details`, toutes deux SECURITY DEFINER et donc exécutées sous le rôle
-- propriétaire (postgres) : lui retirer `authenticated` ne casse aucun appel
-- interne. Aucun GRANT n'est réaffirmé — c'est le but.
REVOKE ALL ON FUNCTION public.kit_assert_snapshot(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.kit_assert_snapshot(jsonb) FROM anon, authenticated;

-- ── 3. Vérification — la migration échoue si l'état visé n'est pas atteint ──
-- Une révocation qui ne révoque rien est précisément le bug qu'on répare : la
-- relire dans le fichier ne prouve donc rien. Ce bloc pose la question à la base
-- elle-même, au moment du `db push`, et fait échouer la migration plutôt que de
-- la déclarer appliquée sur une base encore trouée.
--
-- Garde sur l'existence des rôles : `has_function_privilege` lève si le rôle est
-- inconnu, ce qui casserait la migration sur un Postgres nu (CI, local sans
-- stack Supabase) où `anon` et `authenticated` n'existent pas.
DO $$
DECLARE
  v_fn   text;
  v_bad  text[] := '{}';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    RAISE NOTICE 'Rôle « anon » absent — vérification ignorée (Postgres hors Supabase).';
    RETURN;
  END IF;

  FOREACH v_fn IN ARRAY ARRAY[
    'public.kit_request_order(jsonb)',
    'public.kit_open_order(uuid,jsonb,text,integer,text)',
    'public.kit_set_status(uuid,text,text)',
    'public.kit_set_details(uuid,integer,text,jsonb)',
    'public.kit_assert_snapshot(jsonb)'
  ] LOOP
    IF has_function_privilege('anon', v_fn::regprocedure, 'EXECUTE') THEN
      v_bad := v_bad || v_fn;
    END IF;
  END LOOP;

  -- Le helper doit AUSSI être fermé à `authenticated`.
  IF has_function_privilege('authenticated',
       'public.kit_assert_snapshot(jsonb)'::regprocedure, 'EXECUTE') THEN
    v_bad := v_bad || 'public.kit_assert_snapshot(jsonb) [authenticated]';
  END IF;

  IF array_length(v_bad, 1) > 0 THEN
    RAISE EXCEPTION 'Révocation incomplète — encore exécutable : %', array_to_string(v_bad, ', ');
  END IF;

  -- Contrôle inverse : on n'a pas révoqué de travers. Les quatre RPC DOIVENT
  -- rester appelables par un utilisateur connecté, sans quoi le panneau admin et
  -- le dépôt client tomberaient tous les deux en 42501.
  IF NOT (
        has_function_privilege('authenticated', 'public.kit_request_order(jsonb)'::regprocedure, 'EXECUTE')
    AND has_function_privilege('authenticated', 'public.kit_open_order(uuid,jsonb,text,integer,text)'::regprocedure, 'EXECUTE')
    AND has_function_privilege('authenticated', 'public.kit_set_status(uuid,text,text)'::regprocedure, 'EXECUTE')
    AND has_function_privilege('authenticated', 'public.kit_set_details(uuid,integer,text,jsonb)'::regprocedure, 'EXECUTE')
  ) THEN
    RAISE EXCEPTION 'Sur-révocation — `authenticated` a perdu l''accès à une RPC du kit.';
  END IF;
END $$;

-- ── Note pour les migrations futures (rappel de 20260731000002) ─────────────
-- Toute fonction du schéma `public` reçoit EXECUTE nominativement pour `anon` et
-- `authenticated` par les DEFAULT PRIVILEGES du projet. Une nouvelle fonction
-- doit donc TOUJOURS porter :
--     REVOKE ALL ON FUNCTION … FROM PUBLIC;
--     REVOKE ALL ON FUNCTION … FROM anon[, authenticated];   -- selon la cible
--     GRANT  EXECUTE ON FUNCTION … TO <rôle voulu>;
-- Vérifier ensuite par une sonde RPC avec la clé anon :
--   PGRST202 = absente · 42501 = barrière OK · tout autre code = EXÉCUTÉE.
--
-- ⚠️ Le trou n'est PAS limité au module kit. Un balayage des migrations
-- (2026-09-09) montre ~20 fichiers portant un `REVOKE … ON FUNCTION … FROM
-- PUBLIC` sans `FROM anon` — dont les fonctions de prac, des tournois, des
-- quêtes et de `purchase_cosmetic`. Une partie est rattrapée après coup par
-- 20260731000002, 20260614000003 et 20260901000002 ; le reste ne l'est pas.
-- Ces fonctions gardent toutes une garde applicative interne, donc l'exposition
-- est une érosion de la défense en profondeur, pas une porte ouverte. Un audit
-- dédié reste à faire — hors périmètre de cette migration, qui ne traite que le
-- module kit.
