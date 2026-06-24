-- Table rank_stat_samples : agrégation des stats de jeu par rang.
-- Alimente les comparaisons de performance (kills, deaths, CS/min, etc.)
-- par bucket (region, queue, tier, role).
--
-- Alimentation : Edge Functions uniquement, via service_role (bypass RLS).
--   → aucune policy INSERT/UPDATE/DELETE côté client (anon + authenticated bloqués).
-- Lecture des agrégats : via la fonction SECURITY DEFINER get_rank_avg(),
--   accessible à anon + authenticated — aucun accès direct aux lignes brutes.
--
-- Déduplication : UNIQUE (puuid, match_id) garantit un sample par (joueur, partie).
--   Le puuid n'est stocké qu'à cette fin : il ne sert pas à identifier un utilisateur
--   et n'est jamais exposé par get_rank_avg().
-- Purge recommandée (données datées) :
--   DELETE FROM public.rank_stat_samples WHERE collected_at < NOW() - INTERVAL '1 year';

CREATE TABLE IF NOT EXISTS public.rank_stat_samples (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  puuid          TEXT           NOT NULL,
  match_id       TEXT           NOT NULL,
  region         TEXT           NOT NULL,
  queue          INT            NOT NULL,
  tier           TEXT           NOT NULL,
  role           TEXT           NOT NULL,
  kills          INT            NOT NULL,
  deaths         INT            NOT NULL,
  assists        INT            NOT NULL,
  cs_per_min     NUMERIC(5, 2)  NOT NULL,
  vision_score   INT            NOT NULL,
  damage_dealt   INT            NOT NULL,
  gold_earned    INT            NOT NULL,
  duration_s     INT            NOT NULL,
  win            BOOLEAN        NOT NULL,
  collected_at   TIMESTAMPTZ    NOT NULL DEFAULT now(),
  CONSTRAINT uq_rss_puuid_match UNIQUE (puuid, match_id)
);

-- Index composite pour les requêtes d'agrégation par bucket
CREATE INDEX IF NOT EXISTS idx_rss_bucket
  ON public.rank_stat_samples (region, queue, tier, role);

-- Index pour les purges et requêtes temporelles
CREATE INDEX IF NOT EXISTS idx_rss_collected
  ON public.rank_stat_samples (collected_at);

-- RLS
ALTER TABLE public.rank_stat_samples ENABLE ROW LEVEL SECURITY;

-- Aucune policy SELECT/INSERT/UPDATE/DELETE côté client.
-- anon + authenticated : aucun accès direct aux lignes brutes.
-- Les Edge Functions insèrent et mettent à jour via service_role (bypass RLS).
-- Les agrégats sont exposés exclusivement via get_rank_avg() SECURITY DEFINER.

-- Fonction d'agrégation publique : retourne les moyennes pour un bucket donné.
-- SECURITY DEFINER : lit rank_stat_samples sans déclencher les policies RLS.
-- Retourne aucune ligne si le bucket contient moins de p_min_samples échantillons
--   (évite d'exposer des agrégats non représentatifs).
CREATE OR REPLACE FUNCTION public.get_rank_avg(
  p_region      text,
  p_queue       int,
  p_tier        text,
  p_role        text,
  p_min_samples int DEFAULT 50
)
RETURNS TABLE (
  sample_count     bigint,
  avg_kills        numeric,
  avg_deaths       numeric,
  avg_assists      numeric,
  avg_cs_per_min   numeric,
  avg_vision_score numeric,
  avg_damage_dealt numeric,
  avg_gold_earned  numeric,
  avg_winrate      numeric
)
LANGUAGE sql SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COUNT(*)::bigint,
    ROUND(AVG(kills)::numeric, 2),
    ROUND(AVG(deaths)::numeric, 2),
    ROUND(AVG(assists)::numeric, 2),
    ROUND(AVG(cs_per_min)::numeric, 2),
    ROUND(AVG(vision_score)::numeric, 1),
    ROUND(AVG(damage_dealt)::numeric, 0),
    ROUND(AVG(gold_earned)::numeric, 0),
    ROUND(AVG(CASE WHEN win THEN 1.0 ELSE 0.0 END) * 100, 1)
  FROM public.rank_stat_samples
  WHERE region = p_region
    AND queue  = p_queue
    AND tier   = p_tier
    AND role   = p_role
  HAVING COUNT(*) >= p_min_samples
$$;

GRANT EXECUTE ON FUNCTION public.get_rank_avg TO anon, authenticated;
