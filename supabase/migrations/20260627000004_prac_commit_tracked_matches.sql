-- Migration 20260627000004 : fonction prac_commit_tracked_matches (chantier 3, lot 3B).
--
-- Écriture atomique des matchs trackés sélectionnés par l'admin. Appelée
-- EXCLUSIVEMENT par l'EF prac-track via service_role (REVOKE FROM PUBLIC).
--
-- Fenêtre de concurrence fermée : l'EF fait l'appel réseau riot-matches + extrait
-- le snapshot HORS verrou, puis passe les lignes ici. Cette fonction verrouille la
-- ligne tracked_players en FOR SHARE — qui entre en conflit avec le FOR UPDATE que
-- respond_consent (lot B) prend sur la même ligne au revoke. Les deux chemins se
-- sérialisent donc : si le joueur révoque entre le resolve et le commit, soit le
-- revoke passe d'abord (FOR SHARE relit 'revoked' → RAISE, aucun insert), soit le
-- commit passe d'abord (le revoke attend, puis son trigger AFTER UPDATE purge les
-- lignes fraîchement insérées). Aucun tracked_matches orphelin ne survit au revoke.
--
-- L'insert et le check accepted sont dans la MÊME transaction implicite de la
-- fonction → pas de fenêtre TOCTOU (contrairement à un SELECT puis INSERT séparés
-- via PostgREST, qui sont deux transactions non verrouillables entre elles).
--
-- Dépend de : tracked_players, tracked_matches (migrations 20260626000002 / 000002 3A).
--
-- Idempotent : CREATE OR REPLACE + INSERT ON CONFLICT DO NOTHING.

CREATE OR REPLACE FUNCTION public.prac_commit_tracked_matches(
  p_tracked_player_id uuid,
  p_added_by          uuid,
  p_rows              jsonb
)
RETURNS int            -- nombre de lignes réellement insérées (skipped = passées - retour)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status   text;
  v_inserted int;
BEGIN
  -- Verrou de ligne : sérialise vs le FOR UPDATE de respond_consent (revoke).
  SELECT status INTO v_status
    FROM public.tracked_players
   WHERE id = p_tracked_player_id
   FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'tracked_player_not_found';
  END IF;
  IF v_status <> 'accepted' THEN
    RAISE EXCEPTION 'player_not_accepted';
  END IF;

  WITH ins AS (
    INSERT INTO public.tracked_matches (
      tracked_player_id, match_id, region, added_by, game_creation,
      champion_id, champion_name, queue_id, win,
      kills, deaths, assists, cs, duration_s,
      position, vision_score, damage_dealt, gold_earned
    )
    SELECT
      p_tracked_player_id, r.match_id, r.region, p_added_by, r.game_creation,
      r.champion_id, r.champion_name, r.queue_id, r.win,
      r.kills, r.deaths, r.assists, r.cs, r.duration_s,
      r.position, r.vision_score, r.damage_dealt, r.gold_earned
    FROM jsonb_to_recordset(p_rows) AS r(
      match_id      text,
      region        text,
      game_creation timestamptz,
      champion_id   int,
      champion_name text,
      queue_id      int,
      win           boolean,
      kills         int,
      deaths        int,
      assists       int,
      cs            int,
      duration_s    int,
      position      text,
      vision_score  int,
      damage_dealt  int,
      gold_earned   int
    )
    ON CONFLICT (tracked_player_id, match_id) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_inserted FROM ins;

  RETURN v_inserted;
END;
$$;

-- Réservée à l'EF prac-track (service_role bypasse le REVOKE).
REVOKE EXECUTE ON FUNCTION public.prac_commit_tracked_matches(uuid, uuid, jsonb) FROM PUBLIC;
