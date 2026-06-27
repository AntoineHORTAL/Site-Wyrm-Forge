-- Migration 20260627000001 : fonction respond_consent (chantier 2, lot B).
--
-- Réponse du JOUEUR à une demande de tracking : accept / decline / revoke.
-- Pendant du couple admin request_tracking / remove_tracking (lot A) côté joueur.
-- SECURITY DEFINER (owned postgres → bypass RLS) : la fonction n'agit QUE sur la
-- ligne de auth.uid() — pas de paramètre d'id, impossible de répondre pour autrui.
--
-- Dépend de : tracked_players + trigger updated_at (migration 20260626000002).
--
-- Idempotent : CREATE OR REPLACE.

-- ── respond_consent(p_decision) — le joueur répond à sa demande de tracking ────
-- Calquée sur clear_riot_link() / request_tracking : SECURITY DEFINER + search_path.
-- Machine d'états (seules ces transitions sont valides ; tout le reste →
-- 'invalid_transition') :
--   accept  : pending  → accepted
--   accept  : revoked  → accepted   (ré-acceptation après révocation)
--   decline : pending  → declined
--   revoke  : accepted → revoked
-- 'declined' est terminal côté joueur : seul l'admin (request_tracking, lot A) le
-- rouvre vers 'pending'.
CREATE OR REPLACE FUNCTION public.respond_consent(p_decision text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id         uuid;
  v_status     text;
  v_new_status text;
BEGIN
  IF p_decision NOT IN ('accept', 'decline', 'revoke') THEN
    RAISE EXCEPTION 'invalid_action';
  END IF;

  -- Dossier du joueur courant uniquement. FOR UPDATE : verrouille la ligne pour
  -- sérialiser un double-clic / appel concurrent (évite une double transition).
  SELECT id, status INTO v_id, v_status
    FROM public.tracked_players
   WHERE profile_id = auth.uid()
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'no_consent_request';
  END IF;

  IF    p_decision = 'accept'  AND v_status = 'pending'  THEN v_new_status := 'accepted';
  ELSIF p_decision = 'accept'  AND v_status = 'revoked'  THEN v_new_status := 'accepted';
  ELSIF p_decision = 'decline' AND v_status = 'pending'  THEN v_new_status := 'declined';
  ELSIF p_decision = 'revoke'  AND v_status = 'accepted' THEN v_new_status := 'revoked';
  ELSE
    RAISE EXCEPTION 'invalid_transition';
  END IF;

  UPDATE public.tracked_players
     SET status       = v_new_status,
         responded_at = now()
   WHERE id = v_id;
  -- (updated_at est bumpé par trg_tracked_players_updated_at.)

  -- ⚠️ CHANTIER 3 — purge sur révocation (accepted → revoked) :
  -- un trigger AFTER UPDATE supprimera les tracked_matches du joueur révoqué
  -- (FK tracked_player_id ... ON DELETE CASCADE, contrat figé au cadrage architecte).
  -- La table tracked_matches n'existe pas encore → rien à purger ici. NE PAS OUBLIER
  -- d'ajouter le trigger quand la table sera créée au ch3.

  RETURN v_new_status;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.respond_consent(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.respond_consent(text) TO authenticated;
