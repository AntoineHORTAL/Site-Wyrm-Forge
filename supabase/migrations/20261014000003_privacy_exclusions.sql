-- Droit d'opposition des joueurs consultés (chantier confidentialité, lot 2).
--
-- Un joueur, inscrit ou non, peut s'opposer à ce que Wyrm Forge garde des données
-- à son nom (politique de confidentialité, § 7). Effacer l'existant ne suffit
-- pas : la prochaine recherche de son Riot ID recréerait des échantillons et une
-- entrée d'autocomplétion. D'où une liste d'exclusion, qui ne contient QUE le
-- PUUID (rien d'autre n'est gardé sur la personne).
--
-- Deux gardes, une par donnée :
--   • rank_stat_samples : trigger BEFORE INSERT qui écarte la ligne. Garantie
--     en base, quel que soit l'écrivain ;
--   • searched_summoners : la table est lisible par anon (autocomplétion) et ne
--     porte pas de PUUID — et ne doit pas en porter. La garde est donc dans
--     l'Edge Function (`_shared/searched-summoners.ts`), en échec FERMÉ : si la
--     liste ne peut pas être lue, rien n'est écrit.
--
-- Procédure (SQL Editor, rôle postgres), après vérification de l'identité :
--   select public.privacy_forget_player('<puuid>', 'euw1', '<nom>', '<tag>');
-- Ajoute le PUUID à la liste et efface l'existant : échantillons, entrées de
-- cache qui le contiennent, entrée d'autocomplétion du Riot ID donné.

CREATE TABLE IF NOT EXISTS public.riot_privacy_exclusions (
  puuid      text        PRIMARY KEY CHECK (puuid ~ '^[A-Za-z0-9_-]{70,128}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.riot_privacy_exclusions ENABLE ROW LEVEL SECURITY;
-- Aucune policy : ni anon ni authenticated n'y accèdent. Lue par les Edge
-- Functions en service_role, écrite par `privacy_forget_player` uniquement.
REVOKE ALL ON public.riot_privacy_exclusions FROM anon, authenticated;

-- ── Garde des échantillons ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_rank_stat_samples_skip_excluded()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF EXISTS (SELECT 1 FROM public.riot_privacy_exclusions e WHERE e.puuid = NEW.puuid) THEN
    RETURN NULL;   -- ligne écartée en silence : le harvest est fire-and-forget
  END IF;
  RETURN NEW;
END;
$fn$;

REVOKE ALL ON FUNCTION public.fn_rank_stat_samples_skip_excluded() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_rank_stat_samples_skip_excluded() FROM anon, authenticated;

DROP TRIGGER IF EXISTS trg_rank_stat_samples_skip_excluded ON public.rank_stat_samples;
CREATE TRIGGER trg_rank_stat_samples_skip_excluded
  BEFORE INSERT ON public.rank_stat_samples
  FOR EACH ROW EXECUTE FUNCTION public.fn_rank_stat_samples_skip_excluded();

-- ── Procédure d'opposition ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.privacy_forget_player(
  p_puuid     text,
  p_region    text DEFAULT NULL,
  p_game_name text DEFAULT NULL,
  p_tag_line  text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_samples int;
  v_cache   int;
  v_search  int := 0;
BEGIN
  IF p_puuid IS NULL OR p_puuid !~ '^[A-Za-z0-9_-]{70,128}$' THEN
    RAISE EXCEPTION 'invalid_puuid';
  END IF;

  INSERT INTO public.riot_privacy_exclusions (puuid) VALUES (p_puuid)
  ON CONFLICT (puuid) DO NOTHING;

  DELETE FROM public.rank_stat_samples WHERE puuid = p_puuid;
  GET DIAGNOSTICS v_samples = ROW_COUNT;

  -- strpos et non LIKE : `_` est un joker de LIKE et figure dans les PUUID.
  DELETE FROM public.riot_cache
   WHERE strpos(cache_key, p_puuid) > 0
      OR strpos(response_body::text, p_puuid) > 0;
  GET DIAGNOSTICS v_cache = ROW_COUNT;

  IF p_game_name IS NOT NULL AND p_tag_line IS NOT NULL THEN
    DELETE FROM public.searched_summoners
     WHERE (p_region IS NULL OR region = p_region)
       AND lower(game_name) = lower(p_game_name)
       AND lower(tag_line)  = lower(p_tag_line);
    GET DIAGNOSTICS v_search = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object(
    'rank_stat_samples',  v_samples,
    'riot_cache',         v_cache,
    'searched_summoners', v_search
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.privacy_forget_player(text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.privacy_forget_player(text, text, text, text) FROM anon, authenticated;

-- ── Auto-vérification ────────────────────────────────────────────────────────
DO $$
BEGIN
  IF has_table_privilege('anon', 'public.riot_privacy_exclusions', 'SELECT')
     OR has_table_privilege('authenticated', 'public.riot_privacy_exclusions', 'SELECT') THEN
    RAISE EXCEPTION 'riot_privacy_exclusions lisible par anon ou authenticated.';
  END IF;
  IF has_function_privilege('anon', 'public.privacy_forget_player(text, text, text, text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.privacy_forget_player(text, text, text, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'privacy_forget_player() exécutable par anon ou authenticated.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_rank_stat_samples_skip_excluded') THEN
    RAISE EXCEPTION 'Trigger trg_rank_stat_samples_skip_excluded absent.';
  END IF;
END
$$;
