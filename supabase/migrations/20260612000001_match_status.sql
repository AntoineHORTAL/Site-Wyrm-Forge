-- Migration 20260612000001 : États de match — colonnes status/started_at + start_match.
--
-- 1. Colonnes ajoutées à public.matches :
--      status     TEXT NOT NULL DEFAULT 'pending'
--                 CHECK ('pending'|'ready'|'in_progress'|'finished')
--      started_at TIMESTAMPTZ NULL — posé par start_match()
--
-- 2. Trigger trg_match_auto_status (BEFORE INSERT OR UPDATE) :
--    statut DÉRIVÉ des données, sauf 'in_progress' qui est posé explicitement
--    par start_match() et préservé par le trigger :
--      winner_id NOT NULL                  → 'finished'
--      team_a OU team_b NULL               → 'pending'  (+ started_at remis à NULL)
--      les deux équipes, pas de vainqueur  → 'ready' si status ∈ (pending, finished)
--                                            ('finished' → 'ready' couvre undo_match_result)
--    Conséquences : seed_bracket / report_match_result / undo_match_result n'ont
--    PAS besoin d'être modifiées — la propagation des équipes et des résultats
--    met à jour le statut automatiquement.
--
-- 3. Backfill des matchs existants selon la même logique.
--
-- 4. RPC start_match(p_match_id UUID) — SECURITY DEFINER, REVOKE FROM PUBLIC.
--    Réservée à l'organisateur (created_by) ou un admin, via auth.uid() →
--    DOIT être appelée avec un client JWT utilisateur (jamais service_role seul).
--    Exige status = 'ready', pose status = 'in_progress' + started_at = now().
--    Erreurs : 'match_not_found', 'match_forbidden', 'match_wrong_status'.
--
-- Realtime : la table matches est déjà dans la publication supabase_realtime
-- (migration 20260611000004) — les changements de statut sont poussés aux clients.

-- ── 1. Colonnes status + started_at ──────────────────────────────────────────

ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS status     TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;

ALTER TABLE public.matches
  ADD CONSTRAINT chk_match_status
  CHECK (status IN ('pending', 'ready', 'in_progress', 'finished'));

COMMENT ON COLUMN public.matches.status IS
  'pending = équipes incomplètes | ready = prêt à lancer | in_progress = en cours (start_match) | finished = résultat posé';

-- ── 2. Trigger de dérivation automatique du statut ───────────────────────────

CREATE OR REPLACE FUNCTION public.fn_match_auto_status()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.winner_id IS NOT NULL THEN
    -- Résultat posé (report_match_result) — terminal
    NEW.status := 'finished';
  ELSIF NEW.team_a IS NULL OR NEW.team_b IS NULL THEN
    -- Équipe(s) manquante(s) — couvre aussi undo_match_result qui vide un slot aval
    NEW.status     := 'pending';
    NEW.started_at := NULL;
  ELSIF NEW.status IN ('pending', 'finished') THEN
    -- Les deux équipes sont là, pas de vainqueur :
    --   pending  → ready (propagation d'équipe)
    --   finished → ready (undo_match_result a retiré le winner_id)
    -- 'in_progress' (posé par start_match) est volontairement préservé.
    NEW.status     := 'ready';
    NEW.started_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_match_auto_status ON public.matches;
CREATE TRIGGER trg_match_auto_status
  BEFORE INSERT OR UPDATE ON public.matches
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_match_auto_status();

-- ── 3. Backfill des matchs existants ────────────────────────────────────────

UPDATE public.matches
   SET status = CASE
     WHEN winner_id IS NOT NULL                    THEN 'finished'
     WHEN team_a IS NOT NULL AND team_b IS NOT NULL THEN 'ready'
     ELSE 'pending'
   END
 WHERE status = 'pending';  -- valeur DEFAULT posée par l'ALTER — idempotent

-- ── 4. RPC start_match ───────────────────────────────────────────────────────

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
  -- Même espace de noms que seed_bracket / report_match_result : pas
  -- d'exécution concurrente sur le même tournoi.
  PERFORM pg_advisory_xact_lock(hashtext(v_tournament_id::text));

  -- ── Vérification des droits ──────────────────────────────────────────────
  -- auth.uid() IS NULL (service_role sans JWT) est explicitement refusé :
  -- la fonction doit être appelée via un client JWT utilisateur.
  SELECT created_by INTO v_created_by
    FROM public.tournaments
   WHERE id = v_tournament_id;

  IF auth.uid() IS NULL
     OR (v_created_by <> auth.uid() AND NOT public.is_admin()) THEN
    RAISE EXCEPTION 'match_forbidden';
  END IF;

  -- ── Garde métier : relire le statut SOUS le lock ─────────────────────────
  -- (un report_match_result concurrent a pu terminer le match entre-temps)
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

-- Non exposée en RPC direct — Edge Function tournament-admin (userDb JWT) uniquement.
REVOKE EXECUTE ON FUNCTION public.start_match(UUID) FROM PUBLIC;
