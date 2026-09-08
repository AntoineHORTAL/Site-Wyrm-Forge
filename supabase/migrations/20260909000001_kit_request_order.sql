-- Migration 20260909000001 : kit_request_order (dépôt d'une demande par le CLIENT)
-- + extension de kit_set_details au player_snapshot (correction admin).
-- Lot 2 du service « Kit sur mesure ».
--
-- ════════════════════════════════════════════════════════════════════════════
--  CE QUE CETTE MIGRATION CHANGE, ET CE QU'ELLE NE CHANGE PAS
-- ════════════════════════════════════════════════════════════════════════════
-- Au lot 1, TOUTE écriture passait par une fonction gardée par `is_admin()` :
-- le client ne pouvait que LIRE sa propre ligne (policy `ko_select`). C'était
-- volontaire — il n'existait aucune surface cliente.
--
-- Le lot 2 ouvre UN chemin d'écriture au client, et un seul : déposer une
-- demande. `kit_request_order` est la première fonction du module accordée à un
-- non-admin. Tout le reste est inchangé :
--   • aucune policy INSERT/UPDATE/DELETE n'est ajoutée — un `.update()` client
--     reste refusé par la base ;
--   • `kit_set_status` reste admin-only : le client ne fait PAS avancer son
--     dossier, et ne peut donc pas se l'annuler non plus (voir plus bas) ;
--   • le journal `kit_order_events` reste illisible pour lui.
--
-- ⚠️ `created_by` porte désormais DEUX sémantiques. Son commentaire d'origine
-- (20260908000001) dit « l'admin qui a ouvert le dossier ». C'est devenu « QUI a
-- ouvert le dossier — un admin via kit_open_order, ou le client lui-même via
-- kit_request_order ». On ne migre pas la colonne : la distinction se lit
-- exactement, sans ambiguïté, en comparant `created_by` à `user_id`
-- (égaux ⇒ dépôt client). Ajouter une colonne pour cette information la
-- dupliquerait.
--
-- ════════════════════════════════════════════════════════════════════════════
--  LE GEL DU SNAPSHOT EST STRUCTUREL, PAS DISCIPLINÉ
-- ════════════════════════════════════════════════════════════════════════════
-- `player_snapshot` est écrit UNE FOIS, à la création, et il n'existe aucun
-- chemin par lequel le client puisse le réécrire : pas de policy UPDATE, et
-- `kit_request_order` échoue si un dossier actif existe déjà. Ce n'est donc pas
-- une convention que le front doit respecter — c'est l'absence de porte.
--
-- Le point du gel : `profiles.riot_rank` est choisi par l'utilisateur et change
-- quand il veut. Relire le rang « au moment de la prise » par jointure
-- renverrait celui d'AUJOURD'HUI, ce qui vide de son sens la mesure de
-- progression que ce service vend. D'où une COPIE, jamais un pointeur.
--
-- Seule exception, ouverte ci-dessous : l'ADMIN peut corriger un snapshot via
-- `kit_set_details`. Un Riot ID mal tapé par le client serait sinon définitif,
-- ni corrigeable par lui ni par personne. Le gel protège contre la RELECTURE
-- LIVE depuis `profiles`, pas contre une correction — et celle-ci est tracée.
--
-- Dépend de : kit_orders + kit_order_events + is_admin() (20260908000001),
--             app_settings.value (20260530000009 / 20260905000001).
--
-- Idempotent : CREATE OR REPLACE + DROP FUNCTION IF EXISTS. Rejouable.

-- ════════════════════════════════════════════════════════════════════════════
--  1. GARDES PARTAGÉES — forme et taille d'un snapshot
-- ════════════════════════════════════════════════════════════════════════════
-- Fonction plutôt que deux blocs recopiés : `kit_request_order` (client) et
-- `kit_set_details` (admin) doivent appliquer EXACTEMENT la même borne. Deux
-- copies divergeraient au premier ajustement, et c'est le chemin CLIENT qui
-- deviendrait le plus permissif — l'inverse de ce qu'on veut.
--
-- 4 Ko : le formulaire du lot 2 porte un rang, une identité Riot, un binôme
-- éventuel et quatre champs de texte libre. 4 Ko les couvre largement tout en
-- fermant la porte au dépôt d'un mégaoctet de JSON par un client qui appelle
-- PostgREST directement. La borne est en OCTETS du texte JSON, pas en nombre de
-- clés : c'est ce qui coûte réellement en stockage et en transfert.
CREATE OR REPLACE FUNCTION public.kit_assert_snapshot(p_snapshot jsonb)
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
BEGIN
  IF p_snapshot IS NULL OR jsonb_typeof(p_snapshot) <> 'object' THEN
    RAISE EXCEPTION 'invalid_snapshot';
  END IF;

  IF octet_length(p_snapshot::text) > 4096 THEN
    RAISE EXCEPTION 'snapshot_too_large';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.kit_assert_snapshot(jsonb) FROM PUBLIC;

-- ════════════════════════════════════════════════════════════════════════════
--  2. kit_request_order — le client dépose sa demande
-- ════════════════════════════════════════════════════════════════════════════
-- Ouvre un dossier en `demande` pour `auth.uid()`. C'est le point d'entrée que
-- le lot 1 avait prévu sans pouvoir le livrer : le commentaire de
-- `kit_open_order` annonçait déjà « `demande` — le chemin du LOT 2 : le client
-- remplit le formulaire, le dossier existe avant que l'argent n'arrive ».
--
-- Ordre des gardes, et pourquoi celui-là :
--   1. authentification — sans `auth.uid()`, rien n'est attribuable ;
--   2. FEATURE FLAG, relu EN BASE ;
--   3. forme et taille du snapshot ;
--   4. unicité du dossier actif, déléguée à l'index partiel.
--
-- ⚠️ La garde 2 est le cœur de cette fonction. `useFlag()` côté navigateur ne
-- masque qu'un onglet : la table est exposée par PostgREST, et une RPC accordée
-- à `authenticated` est appelable par n'importe quel compte avec un `curl`. Sans
-- cette relecture, `kit_sur_mesure_enabled` ne serait qu'un rideau — et le
-- service serait ouvert avant son lancement. C'est la règle déjà écrite dans
-- `src/lib/feature-flags.ts` : « l'application RÉELLE des coupures qui coûtent
-- reste côté serveur ». Un flag est de la présentation ; ceci est la barrière.
--
-- Lecture du flag : `value = 'true'` suffit et reste vrai à travers le
-- lancement. Le bouton « Lancer » d'AdminTab fait passer `kind` de `'launch'` à
-- `'kill'` mais pose `value = 'true'` dans le même UPDATE — le test ne regarde
-- donc jamais `kind`. `kit_sur_mesure_enabled` a `parent_key = NULL` : aucune
-- hiérarchie à résoudre ici (si on lui donnait un parent un jour, cette lecture
-- devrait remonter la chaîne comme le fait `resolveFlags` côté client).
--
-- Ligne absente ⇒ refus. Repli FERMÉ, aligné sur `flagFallback` pour un flag de
-- lancement : jamais de fuite d'un service pas encore ouvert, fût-ce sur une
-- base où la migration de catalogue n'aurait pas été jouée.
CREATE OR REPLACE FUNCTION public.kit_request_order(p_snapshot jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid  uuid := auth.uid();
  v_flag text;
  v_id   uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT value INTO v_flag
    FROM public.app_settings
   WHERE key = 'kit_sur_mesure_enabled';

  IF v_flag IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'kit_service_disabled';
  END IF;

  PERFORM public.kit_assert_snapshot(p_snapshot);

  -- `created_by = v_uid` : le client est l'auteur de son propre dépôt.
  -- `created_by = user_id` est donc la signature d'une demande cliente, par
  -- opposition à un dossier ouvert par l'admin (`kit_open_order`).
  INSERT INTO public.kit_orders (user_id, created_by, status, player_snapshot)
  VALUES (v_uid, v_uid, 'demande', p_snapshot)
  RETURNING id INTO v_id;

  INSERT INTO public.kit_order_events (kit_order_id, from_status, to_status, actor)
  VALUES (v_id, NULL, 'demande', v_uid);

  RETURN v_id;

EXCEPTION
  -- L'index partiel `uq_kit_orders_active` a parlé : ce client a déjà un dossier
  -- en cours. C'est AUSSI le garde-fou anti-spam de cette fonction — une demande
  -- à la fois, et le client ne peut pas s'annuler (kit_set_status est admin-only)
  -- pour en redéposer une. Assumé au volume de ce service ; si un client se
  -- désiste, l'admin annule le dossier et un nouveau dépôt redevient possible.
  WHEN unique_violation THEN
    RAISE EXCEPTION 'kit_order_already_active';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.kit_request_order(jsonb) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.kit_request_order(jsonb) TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
--  3. kit_set_details — ajout de p_player_snapshot (ADMIN uniquement)
-- ════════════════════════════════════════════════════════════════════════════
-- ⚠️ DROP AVANT CREATE, et ce n'est pas cosmétique. Ajouter un paramètre à
-- DEFAULT ne remplace pas la fonction : Postgres crée une SURCHARGE. Les deux
-- coexisteraient, et un appel à trois arguments deviendrait AMBIGU (il satisfait
-- l'ancienne exactement et la nouvelle par défaut) — erreur 42725 à l'exécution,
-- sur un chemin que le lot 1 utilise déjà. D'où la suppression explicite de
-- l'ancienne signature.
--
-- Le corps est identique au lot 1, à la troisième colonne près. La sémantique de
-- mise à jour PARTIELLE est inchangée : `NULL` = « ne change pas ce champ », et
-- on ne peut donc pas REMETTRE un champ à NULL par cette fonction.
DROP FUNCTION IF EXISTS public.kit_set_details(uuid, integer, text);

CREATE OR REPLACE FUNCTION public.kit_set_details(
  p_order_id          uuid,
  p_price_total_cents integer DEFAULT NULL,
  p_admin_note        text    DEFAULT NULL,
  p_player_snapshot   jsonb   DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not_admin';
  END IF;

  -- Mêmes bornes que le dépôt client : une correction admin ne doit pas pouvoir
  -- introduire ce que le client n'avait pas le droit d'envoyer.
  IF p_player_snapshot IS NOT NULL THEN
    PERFORM public.kit_assert_snapshot(p_player_snapshot);
  END IF;

  UPDATE public.kit_orders
     SET price_total_cents = COALESCE(p_price_total_cents, price_total_cents),
         admin_note        = COALESCE(p_admin_note,        admin_note),
         player_snapshot   = COALESCE(p_player_snapshot,   player_snapshot)
   WHERE id = p_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'kit_order_not_found';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.kit_set_details(uuid, integer, text, jsonb) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.kit_set_details(uuid, integer, text, jsonb) TO authenticated;
