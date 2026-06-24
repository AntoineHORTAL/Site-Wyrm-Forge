-- Migration 20260613000004 : rattachement des tournois aux séries + adaptations.
--   1. tournaments.series_id (NOT NULL, FK) — source de vérité de l'écosystème.
--   2. Unicité du slug PAR SÉRIE (au lieu de globale).
--   3. category → 'amis' | 'communautaire' (suppression quotidien/hebdo/road-to-worlds).
--   4. Slugs réservés tournoi recomposés (plus de noms de séries ; garde manage/creer/match/live).
--   5. is_tournament_admin : scope 'series:{slug}' via tournament_series.slug.
--   6. is_series_admin : nouvelle garde série (création de tournoi par série).
--   7. RLS draft : visible au créateur OU admin tournoi (is_tournament_admin).

-- ── 1. series_id ──────────────────────────────────────────────────────────────
ALTER TABLE public.tournaments ADD COLUMN IF NOT EXISTS series_id uuid;

-- Backfill : tout l'existant rejoint la série 'xv2' (seul écosystème à ce jour ;
-- l'ancienne colonne texte series valait 'XV2' ou NULL).
UPDATE public.tournaments t
   SET series_id = s.id
  FROM public.tournament_series s
 WHERE s.slug = 'xv2'
   AND t.series_id IS NULL;

ALTER TABLE public.tournaments
  ALTER COLUMN series_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_tournaments_series') THEN
    ALTER TABLE public.tournaments
      ADD CONSTRAINT fk_tournaments_series
      FOREIGN KEY (series_id) REFERENCES public.tournament_series (id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_tournaments_series_id ON public.tournaments (series_id);

-- Colonne texte 'series' : conservée pour filet de sécurité mais DÉPRÉCIÉE.
-- DEPRECATED : la source de vérité de l'écosystème est désormais series_id
-- (FK → tournament_series). Ne plus lire/écrire tournaments.series. Suppression
-- prévue dans une migration ultérieure une fois la bascule confirmée.
COMMENT ON COLUMN public.tournaments.series IS
  'DEPRECATED — remplacé par series_id (FK tournament_series). Ne plus utiliser.';

-- ── 2. Unicité du slug PAR SÉRIE ─────────────────────────────────────────────
ALTER TABLE public.tournaments DROP CONSTRAINT IF EXISTS uq_tournaments_slug;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_tournaments_series_slug') THEN
    ALTER TABLE public.tournaments
      ADD CONSTRAINT uq_tournaments_series_slug UNIQUE (series_id, slug);
  END IF;
END $$;

-- ── 3. category amis | communautaire ─────────────────────────────────────────
ALTER TABLE public.tournaments DROP CONSTRAINT IF EXISTS chk_tournaments_category;

UPDATE public.tournaments
   SET category = CASE
     WHEN category IN ('quotidien', 'hebdo', 'road-to-worlds') THEN 'communautaire'
     WHEN category IS NULL THEN 'amis'
     ELSE category
   END;

ALTER TABLE public.tournaments ALTER COLUMN category SET DEFAULT 'amis';
ALTER TABLE public.tournaments ALTER COLUMN category SET NOT NULL;
ALTER TABLE public.tournaments
  ADD CONSTRAINT chk_tournaments_category CHECK (category IN ('amis', 'communautaire'));

-- ── 4. Slugs réservés tournoi (recomposés) ───────────────────────────────────
-- Les noms de séries ne sont plus réservés (segment d'URL distinct). On garde
-- 'match' (sous-route /[serie]/[slug]/match) et on bloque 'manage'/'creer'/'live'
-- par sécurité (éviter toute ambiguïté de lecture d'URL).
ALTER TABLE public.tournaments DROP CONSTRAINT IF EXISTS chk_slug_not_reserved;
ALTER TABLE public.tournaments
  ADD CONSTRAINT chk_slug_not_reserved
  CHECK (lower(slug) NOT IN ('manage', 'creer', 'match', 'live'));

-- ── 5. is_tournament_admin : scope série via tournament_series.slug ───────────
CREATE OR REPLACE FUNCTION public.is_tournament_admin(
  p_uid        uuid,
  p_tournament uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_series_slug text;
BEGIN
  IF p_uid IS NULL THEN
    RETURN false;
  END IF;

  -- Admin global
  IF EXISTS (
    SELECT 1 FROM public.tournament_admins WHERE user_id = p_uid AND scope = 'global'
  ) THEN
    RETURN true;
  END IF;

  -- Contexte création (pas de tournoi cible) : une série quelconque suffit
  IF p_tournament IS NULL THEN
    RETURN EXISTS (
      SELECT 1 FROM public.tournament_admins WHERE user_id = p_uid AND scope LIKE 'series:%'
    );
  END IF;

  -- Scope tournoi précis
  IF EXISTS (
    SELECT 1 FROM public.tournament_admins WHERE user_id = p_uid AND scope = p_tournament::text
  ) THEN
    RETURN true;
  END IF;

  -- Scope série du tournoi (via tournament_series.slug). SECURITY DEFINER : la
  -- lecture de tournaments/tournament_series ici s'exécute en tant que propriétaire
  -- et NE redéclenche PAS les policies RLS (pas de récursion possible avec la
  -- policy draft qui appelle cette fonction).
  SELECT s.slug INTO v_series_slug
    FROM public.tournaments t
    JOIN public.tournament_series s ON s.id = t.series_id
   WHERE t.id = p_tournament;

  IF v_series_slug IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.tournament_admins
     WHERE user_id = p_uid AND scope = 'series:' || v_series_slug
  ) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.is_tournament_admin(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_tournament_admin(uuid, uuid) TO authenticated;

-- ── 6. is_series_admin : droit de créer un tournoi DANS une série donnée ──────
-- true si admin global OU admin de cette série précise. Sert à empêcher un admin
-- 'series:xv2' de créer un tournoi dans une autre série.
CREATE OR REPLACE FUNCTION public.is_series_admin(
  p_uid       uuid,
  p_series_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slug text;
BEGIN
  IF p_uid IS NULL THEN
    RETURN false;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.tournament_admins WHERE user_id = p_uid AND scope = 'global'
  ) THEN
    RETURN true;
  END IF;

  IF p_series_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT slug INTO v_slug FROM public.tournament_series WHERE id = p_series_id;
  IF v_slug IS NULL THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.tournament_admins
     WHERE user_id = p_uid AND scope = 'series:' || v_slug
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.is_series_admin(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_series_admin(uuid, uuid) TO authenticated;

-- ── 7. RLS draft : créateur OU admin tournoi (au lieu de is_admin profiles) ───
DROP POLICY IF EXISTS "trn_select_draft_owner_or_admin" ON public.tournaments;
CREATE POLICY "trn_select_draft_owner_or_admin" ON public.tournaments
  FOR SELECT
  USING (
    status = 'draft'
    AND (created_by = auth.uid() OR public.is_tournament_admin(auth.uid(), id))
  );
