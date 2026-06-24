-- Migration 20260611000003 : Fonctions report_match_result + undo_match_result.
--
-- report_match_result(p_match_id, p_winner_id) :
--   Enregistre le résultat d'un match et propage le gagnant / perdant aux matchs
--   suivants selon le câblage next_match_id / loser_next_match_id.
--   Si le match code = 'M14' (Grande Finale), clôt le tournoi (status = 'finished').
--
-- undo_match_result(p_match_id) :
--   Annule le résultat d'un match en vérifiant qu'aucun match en aval n'a déjà
--   été joué (refus de casser le bracket en cours).
--
-- Protection contre la concurrence :
--   Advisory lock xact sur hashtext(tournament_id) — même espace de noms que
--   seed_bracket, donc les deux ne peuvent pas s'exécuter en parallèle sur le
--   même tournoi.
--
-- Erreurs levées :
--   'match_not_found'       — match inexistant
--   'match_forbidden'       — appelant non propriétaire du tournoi et non admin
--   'match_teams_not_set'   — team_a ou team_b NULL (match pas encore prêt)
--   'winner_not_in_match'   — p_winner_id ∉ {team_a, team_b}
--   'already_reported'      — winner_id déjà posé (empêche l'écrasement silencieux)
--   'downstream_played'     — (undo uniquement) un match en aval a déjà un résultat
--
-- Non exposées en RPC direct — REVOKE EXECUTE FROM PUBLIC.
-- Appelées par l'Edge Function tournaments-admin (service_role).

-- ---------------------------------------------------------------------------
-- report_match_result
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.report_match_result(
  p_match_id  UUID,
  p_winner_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tournament_id      UUID;
  v_code               TEXT;
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
  -- ── Lecture du match ─────────────────────────────────────────────────────
  SELECT
    m.tournament_id,
    m.code,
    m.team_a,
    m.team_b,
    m.winner_id,
    m.next_match_id,
    m.next_match_slot,
    m.loser_next_match_id,
    m.loser_next_match_slot
  INTO
    v_tournament_id,
    v_code,
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
  -- Doit être acquis APRÈS la lecture du tournament_id pour éviter un deadlock.
  PERFORM pg_advisory_xact_lock(hashtext(v_tournament_id::text));

  -- ── Vérification des droits ──────────────────────────────────────────────
  SELECT created_by INTO v_created_by
    FROM public.tournaments
   WHERE id = v_tournament_id;

  IF v_created_by <> auth.uid() AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'match_forbidden';
  END IF;

  -- ── Gardes métier ────────────────────────────────────────────────────────

  IF v_team_a IS NULL OR v_team_b IS NULL THEN
    RAISE EXCEPTION 'match_teams_not_set';
  END IF;

  IF p_winner_id NOT IN (v_team_a, v_team_b) THEN
    RAISE EXCEPTION 'winner_not_in_match';
  END IF;

  -- Refus explicite d'écrasement — passer par undo_match_result si correction nécessaire
  IF v_current_winner IS NOT NULL THEN
    RAISE EXCEPTION 'already_reported';
  END IF;

  -- ── Déduction du perdant ─────────────────────────────────────────────────
  v_loser_id := CASE
    WHEN p_winner_id = v_team_a THEN v_team_b
    ELSE v_team_a
  END;

  -- ── Étape 2 : Enregistrement du résultat ────────────────────────────────
  UPDATE public.matches
     SET winner_id = p_winner_id
   WHERE id = p_match_id;

  -- ── Étape 3 : Propagation du gagnant ────────────────────────────────────
  -- Le gagnant avance dans le bracket (winner ou final).
  IF v_next_match_id IS NOT NULL THEN
    IF v_next_match_slot = 'a' THEN
      UPDATE public.matches SET team_a = p_winner_id WHERE id = v_next_match_id;
    ELSE
      UPDATE public.matches SET team_b = p_winner_id WHERE id = v_next_match_id;
    END IF;
  END IF;

  -- ── Étape 4 : Propagation du perdant (loser bracket) ────────────────────
  -- Si le match n'a pas de loser_next_match_id, le perdant est éliminé définitivement.
  IF v_loser_next_id IS NOT NULL THEN
    IF v_loser_next_slot = 'a' THEN
      UPDATE public.matches SET team_a = v_loser_id WHERE id = v_loser_next_id;
    ELSE
      UPDATE public.matches SET team_b = v_loser_id WHERE id = v_loser_next_id;
    END IF;
  END IF;

  -- ── Étape 5 : Clôture du tournoi si M14 ─────────────────────────────────
  IF v_code = 'M14' THEN
    UPDATE public.tournaments
       SET status = 'finished'
     WHERE id = v_tournament_id;
  END IF;

END;
$$;

REVOKE EXECUTE ON FUNCTION public.report_match_result(UUID, UUID) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- undo_match_result
-- ---------------------------------------------------------------------------

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

  IF v_created_by <> auth.uid() AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'match_forbidden';
  END IF;

  -- Si aucun résultat posé, undo est un no-op silencieux (idempotent)
  IF v_current_winner IS NULL THEN
    RETURN;
  END IF;

  -- ── Garde : vérification des matchs aval ────────────────────────────────
  -- On refuse l'annulation si un match en aval a déjà un résultat posé,
  -- car retirer le résultat ici rendrait incohérent le bracket déjà joué.
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
  -- Remet à NULL le slot occupé par le gagnant dans le match suivant.
  IF v_next_match_id IS NOT NULL THEN
    IF v_next_match_slot = 'a' THEN
      UPDATE public.matches SET team_a = NULL WHERE id = v_next_match_id;
    ELSE
      UPDATE public.matches SET team_b = NULL WHERE id = v_next_match_id;
    END IF;
  END IF;

  -- ── Retrait de la propagation perdant ───────────────────────────────────
  -- Remet à NULL le slot occupé par le perdant dans le match loser suivant.
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
