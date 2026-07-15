-- F6 (suite) — garde anti-drift : interdit STRUCTURELLEMENT tout DEFAULT non-NULL
-- sur les colonnes riot_* de public.profiles.
--
-- CONTEXTE : le DEFAULT 'euw1' ad hoc sur riot_platform (drift non versionné, retiré par
-- 20260715000003) avait cassé le signup en heurtant fn_protect_riot_columns (branche
-- INSERT : RAISE si un riot_* est NOT NULL sur un INSERT authenticated). La défense
-- `riot_platform: null` dans les 2 payloads de signup ne couvre qu'UNE colonne : un
-- DEFAULT non-NULL réapparaissant sur riot_puuid / riot_gamename / riot_tagline /
-- riot_link_pending / riot_link_expires_at recasserait le signup à l'identique, sans être
-- attrapé. Cette garde traite la CLASSE de risque, pas une colonne.
--
-- LÉGITIMITÉ : aucune des 7 colonnes riot_* n'a de raison métier d'un DEFAULT non-NULL —
-- NULL = "non lié / non renseigné" (puuid, gamename, tagline, platform, rank) ou
-- "aucun challenge de liaison en cours" (link_pending, link_expires_at).
--
-- MÉCANISME : un CHECK constraint ne peut pas interdire un DEFAULT (il valide des lignes,
-- pas la définition de colonne). On utilise un EVENT TRIGGER sur ddl_command_end
-- (faisabilité vérifiée sur ce projet) : après tout ALTER/CREATE TABLE, si une colonne
-- riot_* de profiles porte un DEFAULT non-NULL, la transaction DDL est rejetée
-- (rollback). Prévention continue, quelle que soit la source (migration OU SQL editor).
-- riot_rank est inclus par uniformité bien qu'il ne soit pas dans fn_protect_riot_columns
-- (donc non "signup-critical") — aucune colonne riot_* ne doit avoir de DEFAULT non-NULL.
--
-- Rejouable : DO-block précondition idempotent ; CREATE OR REPLACE FUNCTION + DROP/CREATE
-- de l'event trigger (les event triggers n'ont pas de OR REPLACE).

-- 1) Précondition — l'état courant doit être propre (échoue bruyamment sinon).
DO $$
DECLARE v_col text;
BEGIN
  SELECT column_name INTO v_col
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'profiles'
    AND column_name IN ('riot_puuid','riot_gamename','riot_tagline','riot_platform',
                        'riot_rank','riot_link_pending','riot_link_expires_at')
    AND column_default IS NOT NULL
  LIMIT 1;
  IF v_col IS NOT NULL THEN
    RAISE EXCEPTION 'F6 guard: public.profiles.% a deja un DEFAULT non-NULL — corriger avant d''installer la garde', v_col;
  END IF;
END $$;

-- 2) Fonction de garde (event trigger).
CREATE OR REPLACE FUNCTION public.fn_guard_riot_no_default()
RETURNS event_trigger
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $$
DECLARE v_col text;
BEGIN
  SELECT column_name INTO v_col
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'profiles'
    AND column_name IN ('riot_puuid','riot_gamename','riot_tagline','riot_platform',
                        'riot_rank','riot_link_pending','riot_link_expires_at')
    AND column_default IS NOT NULL
  LIMIT 1;

  IF v_col IS NOT NULL THEN
    RAISE EXCEPTION 'DEFAULT non-NULL interdit sur public.profiles.% (colonne riot_*) — garde anti-drift F6 (heurte fn_protect_riot_columns au signup)', v_col
      USING ERRCODE = 'feature_not_supported';
  END IF;
END $$;

-- 3) Event trigger — DROP/CREATE (pas de CREATE OR REPLACE pour les event triggers).
DROP EVENT TRIGGER IF EXISTS trg_guard_riot_no_default;
CREATE EVENT TRIGGER trg_guard_riot_no_default
  ON ddl_command_end
  WHEN TAG IN ('ALTER TABLE', 'CREATE TABLE')
  EXECUTE FUNCTION public.fn_guard_riot_no_default();
