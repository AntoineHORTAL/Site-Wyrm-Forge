-- Migration 20260613000002 : infrastructure de la page création (bloc E).
--   1. Colonne `category` (classification libre des tournois).
--   2. Extension des slugs réservés : ajout de 'creer', 'live', 'tournois'
--      (critique : avec le routing sous-domaine, /creer est la route de création
--       — un slug 'creer' serait masqué par cette route Next.js).
--   3. Bucket Storage `tournament-heroes` (images d'affiche) + policies.

-- ── 1. Colonne category ──────────────────────────────────────────────────────
ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS category text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_tournaments_category'
  ) THEN
    ALTER TABLE public.tournaments
      ADD CONSTRAINT chk_tournaments_category
      CHECK (category IS NULL OR category IN ('amis','quotidien','hebdo','road-to-worlds'));
  END IF;
END $$;

-- ── 2. Slugs réservés (liste étendue) ────────────────────────────────────────
ALTER TABLE public.tournaments DROP CONSTRAINT IF EXISTS chk_slug_not_reserved;
ALTER TABLE public.tournaments
  ADD CONSTRAINT chk_slug_not_reserved
  CHECK (
    lower(slug) NOT IN (
      'xv2', 'amis', 'quotidiens', 'hebdo', 'road-to-worlds',
      'admin', 'creer', 'live', 'tournois'
    )
  );

-- ── 3. Bucket Storage tournament-heroes ──────────────────────────────────────
-- public en lecture (URL d'affiche servie publiquement), 5 Mo max, png/jpeg/webp.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'tournament-heroes', 'tournament-heroes', true,
  5242880, ARRAY['image/png','image/jpeg','image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public             = EXCLUDED.public,
  file_size_limit    = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Lecture publique des objets du bucket
DROP POLICY IF EXISTS tournament_heroes_read ON storage.objects;
CREATE POLICY tournament_heroes_read ON storage.objects
  FOR SELECT
  USING (bucket_id = 'tournament-heroes');

-- Upload réservé aux admins tournois (global ou série)
DROP POLICY IF EXISTS tournament_heroes_insert ON storage.objects;
CREATE POLICY tournament_heroes_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'tournament-heroes'
    AND public.is_tournament_admin(auth.uid(), NULL)
  );

-- Remplacement / suppression réservés aux mêmes admins
DROP POLICY IF EXISTS tournament_heroes_update ON storage.objects;
CREATE POLICY tournament_heroes_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'tournament-heroes'
    AND public.is_tournament_admin(auth.uid(), NULL)
  );

DROP POLICY IF EXISTS tournament_heroes_delete ON storage.objects;
CREATE POLICY tournament_heroes_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'tournament-heroes'
    AND public.is_tournament_admin(auth.uid(), NULL)
  );
