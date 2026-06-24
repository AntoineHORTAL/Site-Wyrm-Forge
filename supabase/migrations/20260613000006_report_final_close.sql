-- Migration 20260613000006 : clôture du tournoi size-agnostic.
-- report_match_result clôturait le tournoi sur le code 'M14' (finale du format 8).
-- Pour les formats 4 (finale M6) et 16 (finale M30), il faut clôturer sur le match
-- de bracket = 'final', quel que soit son code.

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
  IF v_created_by <> auth.uid() AND NOT public.is_admin() THEN
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
