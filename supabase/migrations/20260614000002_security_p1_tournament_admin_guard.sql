-- P1 (2026-06-14) — Gardes des RPC tournois sur is_tournament_admin().
--
-- Avant : seed_bracket / report_match_result / undo_match_result / start_match
-- utilisaient « v_created_by <> auth.uid() AND NOT public.is_admin() ».
-- Deux problèmes :
--   (a) is_admin() = admin GLOBAL profiles uniquement → un admin de SÉRIE
--       (scope 'series:xv2') ou de TOURNOI non-créateur ne pouvait pas gérer.
--   (b) Couplage au P0-1 : tant que la policy UPDATE profiles était ouverte, un
--       user auto-élevé en admin contournait ces gardes. (P0-1 fermé au LOT 1,
--       mais on retire de toute façon la dépendance à is_admin() ici.)
--
-- Après : « NOT (v_created_by = auth.uid()
--               OR public.is_tournament_admin(auth.uid(), <tournament_id>)) ».
-- is_tournament_admin couvre déjà : admin global + scope 'series:{slug}' +
-- scope tournoi précis → un admin global reste couvert SANS is_admin().
--
-- Le refus explicite « auth.uid() IS NULL » de start_match est CONSERVÉ.
-- Corps des fonctions reproduits À L'IDENTIQUE des dernières migrations
-- (20260613000005 seed, 20260613000006 report, 20260612000001 start,
--  20260611000003 undo) — seule la garde de droits change.

-- ── seed_bracket (corps = 20260613000005) ────────────────────────────────────
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
  IF NOT (v_created_by = auth.uid()
          OR public.is_tournament_admin(auth.uid(), p_tournament_id)) THEN
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

-- ── report_match_result (corps = 20260613000006) ─────────────────────────────
CREATE OR REPLACE FUNCTION public.report_match_result(p_match_id UUID, p_winner_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tournament_id      UUID;
  v_bracket            TEXT;
  v_team_a             UUID;
  v_team_b             UUID;
  v_current_winner     UUID;
  v_next_match_id      UUID;
  v_next_match_slot    TEXT;
  v_loser_next_id      UUID;
  v_loser_next_slot    TEXT;
  v_created_by         UUID;
  v_loser_id           UUID;
BEGIN
  SELECT
    m.tournament_id, m.bracket, m.team_a, m.team_b, m.winner_id,
    m.next_match_id, m.next_match_slot, m.loser_next_match_id, m.loser_next_match_slot
  INTO
    v_tournament_id, v_bracket, v_team_a, v_team_b, v_current_winner,
    v_next_match_id, v_next_match_slot, v_loser_next_id, v_loser_next_slot
  FROM public.matches m
  WHERE m.id = p_match_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'match_not_found'; END IF;

  PERFORM pg_advisory_xact_lock(hashtext(v_tournament_id::text));

  SELECT created_by INTO v_created_by FROM public.tournaments WHERE id = v_tournament_id;
  IF NOT (v_created_by = auth.uid()
          OR public.is_tournament_admin(auth.uid(), v_tournament_id)) THEN
    RAISE EXCEPTION 'match_forbidden';
  END IF;

  IF v_team_a IS NULL OR v_team_b IS NULL THEN RAISE EXCEPTION 'match_teams_not_set'; END IF;
  IF p_winner_id NOT IN (v_team_a, v_team_b) THEN RAISE EXCEPTION 'winner_not_in_match'; END IF;
  IF v_current_winner IS NOT NULL THEN RAISE EXCEPTION 'already_reported'; END IF;

  v_loser_id := CASE WHEN p_winner_id = v_team_a THEN v_team_b ELSE v_team_a END;

  UPDATE public.matches SET winner_id = p_winner_id WHERE id = p_match_id;

  -- Propagation du gagnant
  IF v_next_match_id IS NOT NULL THEN
    IF v_next_match_slot = 'a' THEN
      UPDATE public.matches SET team_a = p_winner_id WHERE id = v_next_match_id;
    ELSE
      UPDATE public.matches SET team_b = p_winner_id WHERE id = v_next_match_id;
    END IF;
  END IF;

  -- Propagation du perdant (loser bracket)
  IF v_loser_next_id IS NOT NULL THEN
    IF v_loser_next_slot = 'a' THEN
      UPDATE public.matches SET team_a = v_loser_id WHERE id = v_loser_next_id;
    ELSE
      UPDATE public.matches SET team_b = v_loser_id WHERE id = v_loser_next_id;
    END IF;
  END IF;

  -- Clôture du tournoi quand la GRANDE FINALE est jouée (size-agnostic : 4/8/16)
  IF v_bracket = 'final' THEN
    UPDATE public.tournaments SET status = 'finished' WHERE id = v_tournament_id;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.report_match_result(UUID, UUID) FROM PUBLIC;

-- ── start_match (corps = 20260612000001 — refus auth.uid() IS NULL conservé) ──
CREATE OR REPLACE FUNCTION public.start_match(p_match_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tournament_id UUID;
  v_status        TEXT;
  v_created_by    UUID;
BEGIN
  -- ── Lecture du match ─────────────────────────────────────────────────────
  SELECT m.tournament_id INTO v_tournament_id
    FROM public.matches m
   WHERE m.id = p_match_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'match_not_found';
  END IF;

  -- ── Advisory lock xact sur le tournoi ────────────────────────────────────
  PERFORM pg_advisory_xact_lock(hashtext(v_tournament_id::text));

  -- ── Vérification des droits ──────────────────────────────────────────────
  -- auth.uid() IS NULL (service_role sans JWT) est explicitement refusé :
  -- la fonction doit être appelée via un client JWT utilisateur.
  SELECT created_by INTO v_created_by
    FROM public.tournaments
   WHERE id = v_tournament_id;

  IF auth.uid() IS NULL
     OR NOT (v_created_by = auth.uid()
             OR public.is_tournament_admin(auth.uid(), v_tournament_id)) THEN
    RAISE EXCEPTION 'match_forbidden';
  END IF;

  -- ── Garde métier : relire le statut SOUS le lock ─────────────────────────
  SELECT status INTO v_status
    FROM public.matches
   WHERE id = p_match_id;

  IF v_status <> 'ready' THEN
    RAISE EXCEPTION 'match_wrong_status';
  END IF;

  -- ── Lancement ────────────────────────────────────────────────────────────
  UPDATE public.matches
     SET status     = 'in_progress',
         started_at = now()
   WHERE id = p_match_id;

END;
$$;

REVOKE EXECUTE ON FUNCTION public.start_match(UUID) FROM PUBLIC;

-- ── undo_match_result (corps = 20260611000003) ───────────────────────────────
CREATE OR REPLACE FUNCTION public.undo_match_result(p_match_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tournament_id   UUID;
  v_team_a          UUID;
  v_team_b          UUID;
  v_current_winner  UUID;
  v_loser_id        UUID;
  v_next_match_id   UUID;
  v_next_match_slot TEXT;
  v_loser_next_id   UUID;
  v_loser_next_slot TEXT;
  v_created_by      UUID;
BEGIN
  -- ── Lecture du match ─────────────────────────────────────────────────────
  SELECT
    m.tournament_id,
    m.team_a,
    m.team_b,
    m.winner_id,
    m.next_match_id,
    m.next_match_slot,
    m.loser_next_match_id,
    m.loser_next_match_slot
  INTO
    v_tournament_id,
    v_team_a,
    v_team_b,
    v_current_winner,
    v_next_match_id,
    v_next_match_slot,
    v_loser_next_id,
    v_loser_next_slot
  FROM public.matches m
  WHERE m.id = p_match_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'match_not_found';
  END IF;

  -- ── Advisory lock xact sur le tournoi ───────────────────────────────────
  PERFORM pg_advisory_xact_lock(hashtext(v_tournament_id::text));

  -- ── Vérification des droits ──────────────────────────────────────────────
  SELECT created_by INTO v_created_by
    FROM public.tournaments
   WHERE id = v_tournament_id;

  IF NOT (v_created_by = auth.uid()
          OR public.is_tournament_admin(auth.uid(), v_tournament_id)) THEN
    RAISE EXCEPTION 'match_forbidden';
  END IF;

  -- Si aucun résultat posé, undo est un no-op silencieux (idempotent)
  IF v_current_winner IS NULL THEN
    RETURN;
  END IF;

  -- ── Garde : vérification des matchs aval ────────────────────────────────
  IF v_next_match_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.matches WHERE id = v_next_match_id AND winner_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'downstream_played';
  END IF;

  IF v_loser_next_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.matches WHERE id = v_loser_next_id AND winner_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'downstream_played';
  END IF;

  -- ── Déduction du perdant (tel qu'il avait été calculé) ──────────────────
  v_loser_id := CASE
    WHEN v_current_winner = v_team_a THEN v_team_b
    ELSE v_team_a
  END;

  -- ── Retrait de la propagation gagnant ───────────────────────────────────
  IF v_next_match_id IS NOT NULL THEN
    IF v_next_match_slot = 'a' THEN
      UPDATE public.matches SET team_a = NULL WHERE id = v_next_match_id;
    ELSE
      UPDATE public.matches SET team_b = NULL WHERE id = v_next_match_id;
    END IF;
  END IF;

  -- ── Retrait de la propagation perdant ───────────────────────────────────
  IF v_loser_next_id IS NOT NULL THEN
    IF v_loser_next_slot = 'a' THEN
      UPDATE public.matches SET team_a = NULL WHERE id = v_loser_next_id;
    ELSE
      UPDATE public.matches SET team_b = NULL WHERE id = v_loser_next_id;
    END IF;
  END IF;

  -- ── Annulation du résultat ───────────────────────────────────────────────
  UPDATE public.matches
     SET winner_id = NULL
   WHERE id = p_match_id;

END;
$$;

REVOKE EXECUTE ON FUNCTION public.undo_match_result(UUID) FROM PUBLIC;
