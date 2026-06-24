-- Migration 20260613000005 : bracket adaptatif 4 / 8 / 16 équipes.
--   1. CHECK max_teams IN (4,8,16).
--   2. seed_bracket() réécrite : lit max_teams, applique le template correspondant.
--
-- Les listes VALUES _tpl ci-dessous REPRODUISENT EXACTEMENT src/lib/tournois/
-- bracket-template.ts (le script de concordance TS↔SQL le vérifie pour les 3 tailles).
-- Double élimination SANS bracket reset (grande finale unique). 2N-2 matchs.

-- ── 1. Contrainte max_teams ───────────────────────────────────────────────────
ALTER TABLE public.tournaments DROP CONSTRAINT IF EXISTS chk_tournaments_max_teams;
ALTER TABLE public.tournaments
  ADD CONSTRAINT chk_tournaments_max_teams CHECK (max_teams IN (4, 8, 16));

-- ── 2. seed_bracket adaptatif ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.seed_bracket(p_tournament_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status     TEXT;
  v_created_by UUID;
  v_max        INT;
  v_count      INT;
  v_exists     INT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_tournament_id::text));

  SELECT status, created_by, max_teams
    INTO v_status, v_created_by, v_max
    FROM public.tournaments WHERE id = p_tournament_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'tournament_not_found'; END IF;
  IF v_created_by <> auth.uid() AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'tournament_forbidden';
  END IF;
  IF v_status NOT IN ('registration', 'live') THEN
    RAISE EXCEPTION 'tournament_wrong_status';
  END IF;
  IF v_max NOT IN (4, 8, 16) THEN
    RAISE EXCEPTION 'bracket_unsupported_size';
  END IF;

  SELECT COUNT(*) INTO v_count
    FROM public.tournament_teams
   WHERE tournament_id = p_tournament_id AND status = 'validated';
  IF v_count <> v_max THEN RAISE EXCEPTION 'bracket_wrong_team_count'; END IF;

  SELECT COUNT(*) INTO v_exists FROM public.matches WHERE tournament_id = p_tournament_id;
  IF v_exists > 0 THEN RAISE EXCEPTION 'bracket_already_seeded'; END IF;

  -- Seeds 1..N par ordre d'inscription
  CREATE TEMP TABLE _seed (seed INT, team_id UUID) ON COMMIT DROP;
  INSERT INTO _seed (seed, team_id)
    SELECT ROW_NUMBER() OVER (ORDER BY created_at ASC), id
      FROM public.tournament_teams
     WHERE tournament_id = p_tournament_id AND status = 'validated';
  UPDATE public.tournament_teams tt SET seed = s.seed FROM _seed s WHERE tt.id = s.team_id;

  -- Template du bracket selon la taille (= bracket-template.ts)
  CREATE TEMP TABLE _tpl (
    code TEXT, bracket TEXT, round INT, position INT,
    seed_a INT, seed_b INT, nxt TEXT, nslot TEXT, lnxt TEXT, lslot TEXT
  ) ON COMMIT DROP;

  IF v_max = 4 THEN
    INSERT INTO _tpl VALUES
      ('M1','winner',1,1,1,4,'M3','a','M4','a'),
      ('M2','winner',1,2,2,3,'M3','b','M4','b'),
      ('M3','winner',2,1,NULL,NULL,'M6','a','M5','a'),
      ('M4','loser', 1,1,NULL,NULL,'M5','b',NULL,NULL),
      ('M5','loser', 2,1,NULL,NULL,'M6','b',NULL,NULL),
      ('M6','final', 1,1,NULL,NULL,NULL,NULL,NULL,NULL);

  ELSIF v_max = 8 THEN
    INSERT INTO _tpl VALUES
      ('M1', 'winner',1,1,1,8,'M7', 'a','M5', 'a'),
      ('M2', 'winner',1,2,4,5,'M7', 'b','M5', 'b'),
      ('M3', 'winner',1,3,3,6,'M8', 'a','M6', 'a'),
      ('M4', 'winner',1,4,2,7,'M8', 'b','M6', 'b'),
      ('M5', 'loser', 1,1,NULL,NULL,'M9', 'b',NULL,NULL),
      ('M6', 'loser', 1,2,NULL,NULL,'M10','b',NULL,NULL),
      ('M7', 'winner',2,1,NULL,NULL,'M11','a','M9', 'a'),
      ('M8', 'winner',2,2,NULL,NULL,'M11','b','M10','a'),
      ('M9', 'loser', 2,1,NULL,NULL,'M12','a',NULL,NULL),
      ('M10','loser', 2,2,NULL,NULL,'M12','b',NULL,NULL),
      ('M11','winner',3,1,NULL,NULL,'M14','a','M13','a'),
      ('M12','loser', 3,1,NULL,NULL,'M13','b',NULL,NULL),
      ('M13','loser', 4,1,NULL,NULL,'M14','b',NULL,NULL),
      ('M14','final', 1,1,NULL,NULL,NULL,NULL,NULL,NULL);

  ELSE  -- v_max = 16
    INSERT INTO _tpl VALUES
      ('M1', 'winner',1,1,1,16,'M9', 'a','M16','a'),
      ('M2', 'winner',1,2,8,9, 'M9', 'b','M16','b'),
      ('M3', 'winner',1,3,5,12,'M10','a','M17','a'),
      ('M4', 'winner',1,4,4,13,'M10','b','M17','b'),
      ('M5', 'winner',1,5,3,14,'M11','a','M18','a'),
      ('M6', 'winner',1,6,6,11,'M11','b','M18','b'),
      ('M7', 'winner',1,7,7,10,'M12','a','M19','a'),
      ('M8', 'winner',1,8,2,15,'M12','b','M19','b'),
      ('M9', 'winner',2,1,NULL,NULL,'M13','a','M20','a'),
      ('M10','winner',2,2,NULL,NULL,'M13','b','M21','a'),
      ('M11','winner',2,3,NULL,NULL,'M14','a','M22','a'),
      ('M12','winner',2,4,NULL,NULL,'M14','b','M23','a'),
      ('M13','winner',3,1,NULL,NULL,'M15','a','M26','a'),
      ('M14','winner',3,2,NULL,NULL,'M15','b','M27','a'),
      ('M15','winner',4,1,NULL,NULL,'M30','a','M29','a'),
      ('M16','loser', 1,1,NULL,NULL,'M22','b',NULL,NULL),
      ('M17','loser', 1,2,NULL,NULL,'M23','b',NULL,NULL),
      ('M18','loser', 1,3,NULL,NULL,'M20','b',NULL,NULL),
      ('M19','loser', 1,4,NULL,NULL,'M21','b',NULL,NULL),
      ('M20','loser', 2,1,NULL,NULL,'M24','a',NULL,NULL),
      ('M21','loser', 2,2,NULL,NULL,'M24','b',NULL,NULL),
      ('M22','loser', 2,3,NULL,NULL,'M25','a',NULL,NULL),
      ('M23','loser', 2,4,NULL,NULL,'M25','b',NULL,NULL),
      ('M24','loser', 3,1,NULL,NULL,'M27','b',NULL,NULL),
      ('M25','loser', 3,2,NULL,NULL,'M26','b',NULL,NULL),
      ('M26','loser', 4,1,NULL,NULL,'M28','a',NULL,NULL),
      ('M27','loser', 4,2,NULL,NULL,'M28','b',NULL,NULL),
      ('M28','loser', 5,1,NULL,NULL,'M29','b',NULL,NULL),
      ('M29','loser', 6,1,NULL,NULL,'M30','b',NULL,NULL),
      ('M30','final', 1,1,NULL,NULL,NULL,NULL,NULL,NULL);
  END IF;

  -- UUID par code
  CREATE TEMP TABLE _ids (code TEXT, id UUID) ON COMMIT DROP;
  INSERT INTO _ids (code, id) SELECT code, gen_random_uuid() FROM _tpl;

  -- Insertion des matchs (team_a/team_b résolus depuis les seeds sur le WB round 1)
  INSERT INTO public.matches
    (id, tournament_id, code, bracket, round, position, team_a, team_b)
    SELECT i.id, p_tournament_id, t.code, t.bracket, t.round, t.position,
           sa.team_id, sb.team_id
      FROM _tpl t
      JOIN _ids i  ON i.code = t.code
      LEFT JOIN _seed sa ON sa.seed = t.seed_a
      LEFT JOIN _seed sb ON sb.seed = t.seed_b;

  -- Câblage next (gagnant) + loser_next (perdant)
  UPDATE public.matches mm SET
    next_match_id         = ni.id,
    next_match_slot       = NULLIF(t.nslot, '')::text,
    loser_next_match_id   = li.id,
    loser_next_match_slot = NULLIF(t.lslot, '')::text
    FROM _tpl t
    JOIN _ids self ON self.code = t.code
    LEFT JOIN _ids ni ON ni.code = t.nxt
    LEFT JOIN _ids li ON li.code = t.lnxt
   WHERE mm.id = self.id;

  UPDATE public.tournaments SET status = 'live' WHERE id = p_tournament_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.seed_bracket(UUID) FROM PUBLIC;
