-- Table searched_summoners : historique des invocateurs recherchés.
-- Alimente l'autocomplete public (suggestions de noms) sans nécessiter de login.
--
-- Alimentation : Edge Functions uniquement, via service_role (bypass RLS).
--   → aucune policy INSERT/UPDATE côté client (anon + authenticated bloqués).
-- Lecture : anon + authenticated (suggestions publiques, pas de données sensibles).
-- DELETE : aucune policy → bloqué par défaut.
-- Clé primaire composite (region, game_name, tag_line) : unicité garantie,
--   upsert idempotent depuis les Edge Functions.

CREATE TABLE IF NOT EXISTS public.searched_summoners (
  region     TEXT        NOT NULL,
  game_name  TEXT        NOT NULL,
  tag_line   TEXT        NOT NULL,
  last_seen  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (region, game_name, tag_line)
);

-- Index prefix ILIKE pour autocomplete : game_name insensible à la casse par région
CREATE INDEX IF NOT EXISTS idx_ss_prefix
  ON public.searched_summoners (region, lower(game_name) text_pattern_ops);

-- RLS
ALTER TABLE public.searched_summoners ENABLE ROW LEVEL SECURITY;

-- SELECT public : anon + authenticated (suggestions autocomplete sans login)
CREATE POLICY "ss_select_public_anon"
  ON public.searched_summoners FOR SELECT TO anon
  USING (true);

CREATE POLICY "ss_select_public_auth"
  ON public.searched_summoners FOR SELECT TO authenticated
  USING (true);

-- INSERT : aucune policy → refusé aux clients (anon + authenticated).
-- Les Edge Functions insèrent via service_role (bypass RLS).

-- UPDATE : aucune policy → refusé aux clients.
-- last_seen est mis à jour via upsert service_role dans les Edge Functions.

-- DELETE : aucune policy → refusé par défaut.
