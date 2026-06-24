-- Migration : remplace summary_md (TEXT) par summary_jsonb (JSONB).
-- Aucune donnée publiée en base + brouillons invalides (bug de version).
-- On purge proprement avant de modifier le schéma.

TRUNCATE patch_notes;

ALTER TABLE patch_notes
  DROP COLUMN summary_md,
  ADD  COLUMN summary_jsonb JSONB NOT NULL;
