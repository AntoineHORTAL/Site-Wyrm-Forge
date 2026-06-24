-- Migration 20260611000002 : Fonction seed_bracket — génération du bracket DE 8 équipes.
--
-- Génère les 14 matchs du format Double Élimination (8 équipes) avec câblage complet
-- des FK next_match_id / loser_next_match_id.
--
-- Préconditions vérifiées (RAISE EXCEPTION si violation) :
--   'tournament_not_found'       — tournoi inexistant
--   'tournament_forbidden'       — appelant non propriétaire et non admin
--   'tournament_wrong_status'    — status ni 'registration' ni 'live'
--   'bracket_wrong_team_count'   — nombre de teams validées ≠ 8
--   'bracket_already_seeded'     — des matchs existent déjà pour ce tournoi
--
-- Logique :
--   1. Advisory lock xact par tournament_id (sérialise les appels concurrents)
--   2. Vérification des préconditions
--   3. Attribution des seeds 1-8 aux équipes (order by created_at)
--   4. Création des 14 matchs en variables locales (UUID générés d'abord)
--   5. Insertion des 14 matchs avec team_a/team_b sur les WB round 1
--   6. Câblage des FK next_match_id / loser_next_match_id via UPDATE
--   7. Passage du tournoi en status 'live'
--
-- Câblage DE standard (8 équipes) :
--   M1  WB r1 p1 : G→M7.a  P→M5.a   seeds 1 vs 8
--   M2  WB r1 p2 : G→M7.b  P→M5.b   seeds 4 vs 5
--   M3  WB r1 p3 : G→M8.a  P→M6.a   seeds 3 vs 6
--   M4  WB r1 p4 : G→M8.b  P→M6.b   seeds 2 vs 7
--   M5  LB r1 p1 : G→M9.b  (éliminé)
--   M6  LB r1 p2 : G→M10.b (éliminé)
--   M7  WB r2 p1 : G→M11.a P→M9.a
--   M8  WB r2 p2 : G→M11.b P→M10.a
--   M9  LB r2 p1 : G→M12.a (éliminé)
--   M10 LB r2 p2 : G→M12.b (éliminé)
--   M11 WB r3 p1 : G→M14.a P→M13.a
--   M12 LB r3 p1 : G→M13.b (éliminé)
--   M13 LB r4 p1 : G→M14.b (éliminé)
--   M14 Final    : champion (aucun next_match)
--
-- Non exposée en RPC direct — REVOKE EXECUTE FROM PUBLIC.
-- Appelée par l'Edge Function tournaments-admin (service_role).

CREATE OR REPLACE FUNCTION public.seed_bracket(p_tournament_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- UUIDs des 14 matchs, créés au début pour câblage FK en UPDATE
  v_m1  UUID; v_m2  UUID; v_m3  UUID; v_m4  UUID;
  v_m5  UUID; v_m6  UUID; v_m7  UUID; v_m8  UUID;
  v_m9  UUID; v_m10 UUID; v_m11 UUID; v_m12 UUID;
  v_m13 UUID; v_m14 UUID;

  -- Seeds des équipes (seed_1 = meilleure tête de série)
  v_seed_1 UUID; v_seed_2 UUID; v_seed_3 UUID; v_seed_4 UUID;
  v_seed_5 UUID; v_seed_6 UUID; v_seed_7 UUID; v_seed_8 UUID;

  v_status       TEXT;
  v_created_by   UUID;
  v_team_count   INT;
  v_match_exists INT;
BEGIN
  -- ── Étape 1 : Advisory lock xact sur le tournoi ─────────────────────────
  -- Sérialise les appels concurrents (ex. double-clic bouton admin).
  -- Le hash de l'UUID en int4 est suffisant pour l'espace de noms advisory.
  PERFORM pg_advisory_xact_lock(hashtext(p_tournament_id::text));

  -- ── Étape 2 : Vérification des préconditions ────────────────────────────

  SELECT status, created_by
    INTO v_status, v_created_by
    FROM public.tournaments
   WHERE id = p_tournament_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'tournament_not_found';
  END IF;

  -- Seul le créateur ou un admin peut seeder
  IF v_created_by <> auth.uid() AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'tournament_forbidden';
  END IF;

  IF v_status NOT IN ('registration', 'live') THEN
    RAISE EXCEPTION 'tournament_wrong_status';
  END IF;

  SELECT COUNT(*)::INT
    INTO v_team_count
    FROM public.tournament_teams
   WHERE tournament_id = p_tournament_id
     AND status = 'validated';

  IF v_team_count <> 8 THEN
    RAISE EXCEPTION 'bracket_wrong_team_count';
  END IF;

  -- Idempotence : si des matchs existent, refuser (ne pas écraser silencieusement)
  SELECT COUNT(*)::INT
    INTO v_match_exists
    FROM public.matches
   WHERE tournament_id = p_tournament_id;

  IF v_match_exists > 0 THEN
    RAISE EXCEPTION 'bracket_already_seeded';
  END IF;

  -- ── Étape 3 : Attribution des seeds 1-8 ────────────────────────────────
  -- Ordre : created_at ASC (premier inscrit = seed 1)
  -- L'UPDATE utilise un row_number() sur les équipes validées.
  WITH seeded AS (
    SELECT
      id,
      ROW_NUMBER() OVER (ORDER BY created_at ASC) AS rn
    FROM public.tournament_teams
    WHERE tournament_id = p_tournament_id
      AND status = 'validated'
  )
  UPDATE public.tournament_teams tt
     SET seed = s.rn
    FROM seeded s
   WHERE tt.id = s.id;

  -- Charger les UUIDs d'équipe par seed pour le câblage team_a/team_b
  SELECT id INTO v_seed_1 FROM public.tournament_teams
   WHERE tournament_id = p_tournament_id AND seed = 1;
  SELECT id INTO v_seed_2 FROM public.tournament_teams
   WHERE tournament_id = p_tournament_id AND seed = 2;
  SELECT id INTO v_seed_3 FROM public.tournament_teams
   WHERE tournament_id = p_tournament_id AND seed = 3;
  SELECT id INTO v_seed_4 FROM public.tournament_teams
   WHERE tournament_id = p_tournament_id AND seed = 4;
  SELECT id INTO v_seed_5 FROM public.tournament_teams
   WHERE tournament_id = p_tournament_id AND seed = 5;
  SELECT id INTO v_seed_6 FROM public.tournament_teams
   WHERE tournament_id = p_tournament_id AND seed = 6;
  SELECT id INTO v_seed_7 FROM public.tournament_teams
   WHERE tournament_id = p_tournament_id AND seed = 7;
  SELECT id INTO v_seed_8 FROM public.tournament_teams
   WHERE tournament_id = p_tournament_id AND seed = 8;

  -- ── Étape 4 : Génération des 14 UUIDs de matchs ─────────────────────────
  -- On génère tous les IDs avant l'INSERT pour pouvoir câbler les FK.
  v_m1  := gen_random_uuid(); v_m2  := gen_random_uuid();
  v_m3  := gen_random_uuid(); v_m4  := gen_random_uuid();
  v_m5  := gen_random_uuid(); v_m6  := gen_random_uuid();
  v_m7  := gen_random_uuid(); v_m8  := gen_random_uuid();
  v_m9  := gen_random_uuid(); v_m10 := gen_random_uuid();
  v_m11 := gen_random_uuid(); v_m12 := gen_random_uuid();
  v_m13 := gen_random_uuid(); v_m14 := gen_random_uuid();

  -- ── Étape 5 : Insertion des 14 matchs (sans FK FK entre matchs pour l'instant)
  -- Les FK next_match_id / loser_next_match_id seront câblées par UPDATE ensuite.
  -- team_a / team_b renseignés uniquement sur les 4 matchs WB round 1.
  INSERT INTO public.matches
    (id, tournament_id, code, bracket, round, position, team_a, team_b)
  VALUES
    -- WB round 1
    (v_m1,  p_tournament_id, 'M1',  'winner', 1, 1, v_seed_1, v_seed_8),
    (v_m2,  p_tournament_id, 'M2',  'winner', 1, 2, v_seed_4, v_seed_5),
    (v_m3,  p_tournament_id, 'M3',  'winner', 1, 3, v_seed_3, v_seed_6),
    (v_m4,  p_tournament_id, 'M4',  'winner', 1, 4, v_seed_2, v_seed_7),
    -- LB round 1
    (v_m5,  p_tournament_id, 'M5',  'loser',  1, 1, NULL, NULL),
    (v_m6,  p_tournament_id, 'M6',  'loser',  1, 2, NULL, NULL),
    -- WB round 2
    (v_m7,  p_tournament_id, 'M7',  'winner', 2, 1, NULL, NULL),
    (v_m8,  p_tournament_id, 'M8',  'winner', 2, 2, NULL, NULL),
    -- LB round 2
    (v_m9,  p_tournament_id, 'M9',  'loser',  2, 1, NULL, NULL),
    (v_m10, p_tournament_id, 'M10', 'loser',  2, 2, NULL, NULL),
    -- WB round 3
    (v_m11, p_tournament_id, 'M11', 'winner', 3, 1, NULL, NULL),
    -- LB round 3
    (v_m12, p_tournament_id, 'M12', 'loser',  3, 1, NULL, NULL),
    -- LB round 4
    (v_m13, p_tournament_id, 'M13', 'loser',  4, 1, NULL, NULL),
    -- Grande Finale
    (v_m14, p_tournament_id, 'M14', 'final',  1, 1, NULL, NULL);

  -- ── Étape 6 : Câblage des FK next_match_id / loser_next_match_id ────────
  --
  -- Convention de lecture du tableau de câblage :
  --   next_match_id      / next_match_slot      → destination du GAGNANT
  --   loser_next_match_id / loser_next_match_slot → destination du PERDANT

  -- M1 : G→M7.a | P→M5.a
  UPDATE public.matches SET
    next_match_id        = v_m7,  next_match_slot        = 'a',
    loser_next_match_id  = v_m5,  loser_next_match_slot  = 'a'
  WHERE id = v_m1;

  -- M2 : G→M7.b | P→M5.b
  UPDATE public.matches SET
    next_match_id        = v_m7,  next_match_slot        = 'b',
    loser_next_match_id  = v_m5,  loser_next_match_slot  = 'b'
  WHERE id = v_m2;

  -- M3 : G→M8.a | P→M6.a
  UPDATE public.matches SET
    next_match_id        = v_m8,  next_match_slot        = 'a',
    loser_next_match_id  = v_m6,  loser_next_match_slot  = 'a'
  WHERE id = v_m3;

  -- M4 : G→M8.b | P→M6.b
  UPDATE public.matches SET
    next_match_id        = v_m8,  next_match_slot        = 'b',
    loser_next_match_id  = v_m6,  loser_next_match_slot  = 'b'
  WHERE id = v_m4;

  -- M5 (LB r1 p1) : G→M9.b | Perdant éliminé
  UPDATE public.matches SET
    next_match_id        = v_m9,  next_match_slot        = 'b',
    loser_next_match_id  = NULL,   loser_next_match_slot  = NULL
  WHERE id = v_m5;

  -- M6 (LB r1 p2) : G→M10.b | Perdant éliminé
  UPDATE public.matches SET
    next_match_id        = v_m10, next_match_slot        = 'b',
    loser_next_match_id  = NULL,   loser_next_match_slot  = NULL
  WHERE id = v_m6;

  -- M7 (WB r2 p1) : G→M11.a | P→M9.a
  UPDATE public.matches SET
    next_match_id        = v_m11, next_match_slot        = 'a',
    loser_next_match_id  = v_m9,  loser_next_match_slot  = 'a'
  WHERE id = v_m7;

  -- M8 (WB r2 p2) : G→M11.b | P→M10.a
  UPDATE public.matches SET
    next_match_id        = v_m11, next_match_slot        = 'b',
    loser_next_match_id  = v_m10, loser_next_match_slot  = 'a'
  WHERE id = v_m8;

  -- M9 (LB r2 p1) : G→M12.a | Perdant éliminé
  UPDATE public.matches SET
    next_match_id        = v_m12, next_match_slot        = 'a',
    loser_next_match_id  = NULL,   loser_next_match_slot  = NULL
  WHERE id = v_m9;

  -- M10 (LB r2 p2) : G→M12.b | Perdant éliminé
  UPDATE public.matches SET
    next_match_id        = v_m12, next_match_slot        = 'b',
    loser_next_match_id  = NULL,   loser_next_match_slot  = NULL
  WHERE id = v_m10;

  -- M11 (WB r3 p1) : G→M14.a | P→M13.a
  UPDATE public.matches SET
    next_match_id        = v_m14, next_match_slot        = 'a',
    loser_next_match_id  = v_m13, loser_next_match_slot  = 'a'
  WHERE id = v_m11;

  -- M12 (LB r3 p1) : G→M13.b | Perdant éliminé
  UPDATE public.matches SET
    next_match_id        = v_m13, next_match_slot        = 'b',
    loser_next_match_id  = NULL,   loser_next_match_slot  = NULL
  WHERE id = v_m12;

  -- M13 (LB r4 p1) : G→M14.b | Perdant éliminé
  UPDATE public.matches SET
    next_match_id        = v_m14, next_match_slot        = 'b',
    loser_next_match_id  = NULL,   loser_next_match_slot  = NULL
  WHERE id = v_m13;

  -- M14 (Grande Finale) : champion — aucun next_match
  -- Pas d'UPDATE nécessaire, les NULLs sont déjà en place.

  -- ── Étape 7 : Passage en status 'live' ──────────────────────────────────
  UPDATE public.tournaments
     SET status = 'live'
   WHERE id = p_tournament_id;

END;
$$;

-- Non exposée en RPC direct — Edge Function tournaments-admin (service_role) uniquement.
REVOKE EXECUTE ON FUNCTION public.seed_bracket(UUID) FROM PUBLIC;
