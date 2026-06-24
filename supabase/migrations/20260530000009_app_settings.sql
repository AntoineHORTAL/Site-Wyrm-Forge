-- Table app_settings : réglages globaux éditables par les admins.
-- Premier usage : patch_auto_publish (false au lancement).
-- RLS : lecture par les authenticated, écriture admin uniquement.

CREATE TABLE IF NOT EXISTS app_settings (
  key        TEXT        PRIMARY KEY,
  value      TEXT        NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID        REFERENCES auth.users
);

CREATE TRIGGER trg_app_settings_updated_at
  BEFORE UPDATE ON app_settings
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- RLS
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

-- Lecture : utilisateurs authentifiés (l'Edge Function lit via service_role)
CREATE POLICY "as_select_authenticated"
  ON app_settings FOR SELECT TO authenticated
  USING (true);

-- Écriture : admin uniquement (bouton bascule dans AdminTab)
CREATE POLICY "as_update_admin"
  ON app_settings FOR UPDATE TO authenticated
  USING  (is_admin())
  WITH CHECK (is_admin());

-- INSERT / DELETE : aucune policy → bloqués côté client.
-- Les valeurs initiales sont insérées ici (contexte migration = service_role).
INSERT INTO app_settings (key, value) VALUES
  ('patch_auto_publish', 'false')
ON CONFLICT (key) DO NOTHING;
