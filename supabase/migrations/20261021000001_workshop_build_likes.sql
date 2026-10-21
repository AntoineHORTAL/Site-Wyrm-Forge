-- Workshop Builds — un like par utilisateur et par build, retirable, jamais sur
-- son propre build.
--
-- AVANT : `increment_likes(build_id)` (SECURITY DEFINER, exécutable par anon) faisait
-- `likes = likes + 1` sans aucune trace de QUI avait liké. Conséquences :
--   • n'importe qui (même non connecté, même avec la seule clé anon) pouvait liker
--     un build à l'infini ;
--   • impossible de retirer un like, faute de savoir s'il existait ;
--   • l'auteur pouvait liker ses propres builds — et même écrire `likes` en direct,
--     puisque `wb_update_owner` l'autorise à UPDATE toute sa ligne.
--
-- APRÈS :
--   1. `workshop_build_likes` (build_id, user_id) — PK composite = un like max par
--      couple, garanti par la base et non par le client. Lecture de SES likes seulement,
--      aucune écriture client.
--   2. Le compteur `workshop_builds.likes` suit la table par un trigger AFTER
--      INSERT/DELETE sur `workshop_build_likes` (`wbl_sync_like_count`). Ainsi TOUTE
--      disparition d'un like le décompte, y compris la cascade d'une suppression de
--      compte (FK auth.users ON DELETE CASCADE), que la RPC ne voit pas.
--   3. `toggle_build_like(p_build_id)` — SEULE voie d'écriture : authentifié requis,
--      refuse son propre build, retire le like s'il existe, l'ajoute sinon, et renvoie
--      l'état final (liked, like_count) pour que le client affiche la vérité serveur.
--   4. `increment_likes` n'est plus exécutable par les rôles clients (il contournerait
--      tout ce qui précède). La fonction reste en place, inerte : un ancien client
--      reçoit 42501, rien d'autre ne casse.
--   5. Trigger `wb_protect_counters` : un rôle client (anon/authenticated) ne peut
--      plus écrire `likes` ni `saves` par INSERT/UPDATE direct — forcés à 0 à
--      l'INSERT, recopiés depuis OLD à l'UPDATE. Neutralisation silencieuse plutôt
--      qu'erreur : un client qui renvoie la ligne entière continue de fonctionner.
--      Les fonctions SECURITY DEFINER (toggle_build_like via le trigger de synchro,
--      increment_saves) s'exécutent sous `postgres` et passent.
--
-- Les likes déjà comptés avant cette migration n'ont pas d'auteur connu : ils restent
-- dans le compteur. Un retrait ne descend jamais sous 0 (GREATEST).
--
-- ⚠️ `set_updated_at` (BEFORE UPDATE, inconditionnel) bumpe `updated_at` à chaque
-- like/unlike, exactement comme le faisait `increment_likes` et comme le fait toujours
-- `increment_saves`. Aucun client ne lit `workshop_builds.updated_at` (vérifié le
-- 2026-10-21) : comportement conservé, non traité ici.
--
-- Hors périmètre, non touchés (même défaut, chantier séparé) : `increment_jp_likes`
-- (jungle paths), et `increment_saves`, toujours exécutable par anon sans limite.

-- ── 1. Table des likes ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.workshop_build_likes (
  build_id   uuid        NOT NULL REFERENCES public.workshop_builds(id) ON DELETE CASCADE,
  user_id    uuid        NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT workshop_build_likes_pkey PRIMARY KEY (build_id, user_id)
);

-- Lecture « quels builds ai-je likés ? » filtrée par user_id (la PK commence par
-- build_id) + FK user_id → auth.users (cascade à la suppression d'un compte).
CREATE INDEX IF NOT EXISTS workshop_build_likes_user_idx
  ON public.workshop_build_likes (user_id);

ALTER TABLE public.workshop_build_likes ENABLE ROW LEVEL SECURITY;

-- Les DEFAULT PRIVILEGES Supabase accordent ALL à anon/authenticated : on repart de
-- zéro et on ne rend que la lecture. Aucune écriture directe.
REVOKE ALL ON public.workshop_build_likes FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.workshop_build_likes TO authenticated;

DROP POLICY IF EXISTS "wbl_select_own" ON public.workshop_build_likes;
CREATE POLICY "wbl_select_own"
  ON public.workshop_build_likes FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

-- ── 2. Compteur tenu par la table ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.wbl_sync_like_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.workshop_builds
       SET likes = likes + 1
     WHERE id = NEW.build_id;
    RETURN NEW;
  END IF;

  -- DELETE : retrait par toggle, ou cascade d'une suppression de compte. Sur la
  -- cascade d'une suppression de BUILD, la ligne parente est déjà invisible :
  -- l'UPDATE touche 0 ligne, sans erreur.
  UPDATE public.workshop_builds
     SET likes = GREATEST(likes - 1, 0)
   WHERE id = OLD.build_id;
  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.wbl_sync_like_count() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS wbl_sync_like_count ON public.workshop_build_likes;
CREATE TRIGGER wbl_sync_like_count
  AFTER INSERT OR DELETE ON public.workshop_build_likes
  FOR EACH ROW EXECUTE FUNCTION public.wbl_sync_like_count();

-- ── 3. Toggle ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.toggle_build_like(p_build_id uuid)
RETURNS TABLE (liked boolean, like_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_creator uuid;
  v_removed integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  -- FOR UPDATE : deux clics simultanés du même utilisateur se sérialisent sur la
  -- ligne du build. Le second relit l'état laissé par le premier (READ COMMITTED :
  -- nouvel instantané par instruction) au lieu de se croiser entre DELETE et INSERT.
  SELECT wb.creator_id INTO v_creator
    FROM public.workshop_builds wb
   WHERE wb.id = p_build_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'build_not_found' USING ERRCODE = 'P0002';
  END IF;

  -- creator_id NULL (compte supprimé, ON DELETE SET NULL) : build likable par tous.
  IF v_creator = v_uid THEN
    RAISE EXCEPTION 'own_build' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.workshop_build_likes l
   WHERE l.build_id = p_build_id AND l.user_id = v_uid;
  GET DIAGNOSTICS v_removed = ROW_COUNT;

  IF v_removed = 0 THEN
    INSERT INTO public.workshop_build_likes (build_id, user_id)
    VALUES (p_build_id, v_uid);
  END IF;

  -- Le compteur vient d'être tenu par wbl_sync_like_count : on le relit.
  liked := (v_removed = 0);
  SELECT wb.likes INTO like_count
    FROM public.workshop_builds wb
   WHERE wb.id = p_build_id;

  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.toggle_build_like(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.toggle_build_like(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.toggle_build_like(uuid) TO authenticated;

-- ── 4. Ancien compteur non tracé : plus exécutable par les clients ───────────
REVOKE EXECUTE ON FUNCTION public.increment_likes(uuid) FROM PUBLIC, anon, authenticated;

-- ── 5. Compteurs non écrivables en direct par un rôle client ─────────────────
CREATE OR REPLACE FUNCTION public.wb_protect_counters()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- SECURITY INVOKER (défaut) : current_user est le rôle de l'appelant, ou le
  -- propriétaire (postgres) quand l'écriture vient d'une fonction SECURITY DEFINER
  -- (wbl_sync_like_count, increment_saves) — celles-là ne sont pas bridées.
  IF current_user IN ('anon', 'authenticated') THEN
    IF TG_OP = 'INSERT' THEN
      NEW.likes := 0;
      NEW.saves := 0;
    ELSE
      NEW.likes := OLD.likes;
      NEW.saves := OLD.saves;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.wb_protect_counters() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS wb_protect_counters ON public.workshop_builds;
CREATE TRIGGER wb_protect_counters
  BEFORE INSERT OR UPDATE ON public.workshop_builds
  FOR EACH ROW EXECUTE FUNCTION public.wb_protect_counters();

-- ── 6. Auto-vérification : fait échouer la migration si l'état visé n'est pas atteint
DO $$
DECLARE
  v_bad text := '';
BEGIN
  IF has_function_privilege('anon', 'public.toggle_build_like(uuid)', 'EXECUTE') THEN
    v_bad := v_bad || ' toggle_build_like exécutable par anon;';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.toggle_build_like(uuid)', 'EXECUTE') THEN
    v_bad := v_bad || ' toggle_build_like non exécutable par authenticated;';
  END IF;
  IF has_function_privilege('anon', 'public.increment_likes(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.increment_likes(uuid)', 'EXECUTE') THEN
    v_bad := v_bad || ' increment_likes encore exécutable par un rôle client;';
  END IF;
  IF has_function_privilege('anon', 'public.wbl_sync_like_count()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.wbl_sync_like_count()', 'EXECUTE') THEN
    v_bad := v_bad || ' wbl_sync_like_count exécutable par un rôle client;';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p
              WHERE has_table_privilege('anon', 'public.workshop_build_likes', p)) THEN
    v_bad := v_bad || ' anon a un privilège sur workshop_build_likes;';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(ARRAY['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p
              WHERE has_table_privilege('authenticated', 'public.workshop_build_likes', p))
     OR NOT has_table_privilege('authenticated', 'public.workshop_build_likes', 'SELECT') THEN
    v_bad := v_bad || ' authenticated doit avoir SELECT et rien d''autre sur workshop_build_likes;';
  END IF;
  IF (SELECT count(*) FROM pg_policies
       WHERE schemaname = 'public' AND tablename = 'workshop_build_likes') <> 1 THEN
    v_bad := v_bad || ' workshop_build_likes doit porter exactement 1 policy;';
  END IF;

  IF v_bad <> '' THEN
    RAISE EXCEPTION 'Migration 20261021000001 incohérente :%', v_bad;
  END IF;
END $$;
