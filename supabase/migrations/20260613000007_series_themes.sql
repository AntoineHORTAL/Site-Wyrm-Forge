-- Migration 20260613000007 : thèmes bornés par série.
--   theme_preset : choix dans une LISTE FERMÉE (définie dans le code, src/lib/tournois/themes.ts).
--   theme_primary / theme_accent : override fin de 2 couleurs, validées par regex hex STRICTE.
-- Aucune chaîne libre n'est jamais interprétée comme CSS (sécurité — cf. docs/tournois.md).

ALTER TABLE public.tournament_series
  ADD COLUMN IF NOT EXISTS theme_preset  text NOT NULL DEFAULT 'xv2',
  ADD COLUMN IF NOT EXISTS theme_primary text,
  ADD COLUMN IF NOT EXISTS theme_accent  text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_series_theme_preset') THEN
    ALTER TABLE public.tournament_series
      ADD CONSTRAINT chk_series_theme_preset
      CHECK (theme_preset IN ('xv2', 'neon', 'forge', 'ocean', 'ember'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_series_theme_primary') THEN
    ALTER TABLE public.tournament_series
      ADD CONSTRAINT chk_series_theme_primary
      CHECK (theme_primary IS NULL OR theme_primary ~ '^#[0-9a-fA-F]{6}$');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_series_theme_accent') THEN
    ALTER TABLE public.tournament_series
      ADD CONSTRAINT chk_series_theme_accent
      CHECK (theme_accent IS NULL OR theme_accent ~ '^#[0-9a-fA-F]{6}$');
  END IF;
END $$;
