-- Feature Patch Notes : table patch_notes + RLS.
-- Leçons de l'audit Workshop appliquées :
--   • Table versionnée dès la création (pas de création dashboard).
--   • RLS posée dans la même migration.
--   • INSERT réservé à service_role (Edge Function), pas de policy INSERT client.
--   • SELECT published : anon + authenticated.
--   • SELECT draft + UPDATE : admin uniquement via is_admin().

CREATE TABLE IF NOT EXISTS patch_notes (
  id           BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  version      TEXT        NOT NULL UNIQUE,
  title        TEXT        NOT NULL,
  summary_md   TEXT        NOT NULL,
  raw_source   TEXT,
  image_url    TEXT,
  status       TEXT        NOT NULL DEFAULT 'draft'
                           CHECK (status IN ('draft', 'published')),
  source_url   TEXT,
  model        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at TIMESTAMPTZ,
  published_by UUID        REFERENCES auth.users
);

CREATE INDEX idx_patch_notes_status_published
  ON patch_notes (status, published_at DESC);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION fn_set_updated_at()
  RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_patch_notes_updated_at
  BEFORE UPDATE ON patch_notes
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- RLS
ALTER TABLE patch_notes ENABLE ROW LEVEL SECURITY;

-- SELECT published : tout le monde (anon + authenticated)
CREATE POLICY "pn_select_published_anon"
  ON patch_notes FOR SELECT TO anon
  USING (status = 'published');

CREATE POLICY "pn_select_published_auth"
  ON patch_notes FOR SELECT TO authenticated
  USING (status = 'published');

-- SELECT draft : admin uniquement (OR avec published → admin voit tout)
CREATE POLICY "pn_select_draft_admin"
  ON patch_notes FOR SELECT TO authenticated
  USING (is_admin());

-- UPDATE : admin uniquement (édition + publication depuis le client)
CREATE POLICY "pn_update_admin"
  ON patch_notes FOR UPDATE TO authenticated
  USING  (is_admin())
  WITH CHECK (is_admin());

-- INSERT : aucune policy → refusé aux clients.
-- L'Edge Function patch-notes-generator insère via service_role (bypass RLS).

-- DELETE : aucune policy → refusé par défaut.
