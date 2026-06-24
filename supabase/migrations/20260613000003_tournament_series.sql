-- Migration 20260613000003 : écosystèmes / séries de tournois (routing 2 niveaux).
--
-- Un tournoi appartient désormais à UNE série (écosystème). L'URL publique devient
-- /[serie]/[slug] (ex. /xv2/demo-noel-2024). Le slug de série pilote l'URL ;
-- display_name porte la casse exacte affichée (ex. 'XV2').

CREATE TABLE IF NOT EXISTS public.tournament_series (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug           text NOT NULL UNIQUE,
  display_name   text NOT NULL,
  description    text,
  logo_url       text,
  hero_image_url text,
  sort_order     int  NOT NULL DEFAULT 0,
  is_public      boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  -- slug minuscule, URL-safe, et jamais un segment réservé (routes statiques /manage,
  -- /creer→/manage/creer, /api ; 'live' gardé en réserve).
  CONSTRAINT chk_series_slug CHECK (
    slug ~ '^[a-z0-9-]+$'
    AND slug NOT IN ('manage', 'creer', 'live', 'api')
  )
);

CREATE INDEX IF NOT EXISTS idx_tournament_series_sort ON public.tournament_series (sort_order, slug);

ALTER TABLE public.tournament_series ENABLE ROW LEVEL SECURITY;

-- Lecture publique des séries publiques uniquement (les privées restent invisibles).
DROP POLICY IF EXISTS series_public_read ON public.tournament_series;
CREATE POLICY series_public_read ON public.tournament_series
  FOR SELECT
  USING (is_public = true);

-- Aucune policy INSERT/UPDATE/DELETE client : écriture via EF tournament-admin (service_role).

-- ── Seed de la série XV2 (écosystème historique) ──────────────────────────────
INSERT INTO public.tournament_series (slug, display_name, description, sort_order, is_public)
VALUES (
  'xv2',
  'XV2',
  'Tournois communautaires 2v2 ARAM de la série XV2.',
  0,
  true
)
ON CONFLICT (slug) DO NOTHING;
