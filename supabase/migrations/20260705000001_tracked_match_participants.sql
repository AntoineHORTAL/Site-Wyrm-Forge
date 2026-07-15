-- Migration 20260705000001 : table tracked_match_participants + extension de
-- prac_commit_tracked_matches (chantier « accès lecture 3 niveaux », Lot A).
--
-- Stocke les PUUIDs des 10 participants de chaque match tracké — utilisés UNIQUEMENT
-- comme jeton d'accès interne pour la catégorie 3 (co-joueur lié qui partage un match
-- avec un joueur tracké, Lots B/C). Les puuids NE DOIVENT JAMAIS atteindre un client.
--
-- Pourquoi une table dédiée et PAS une colonne participant_puuids sur tracked_matches :
--   tracked_matches a GRANT SELECT ... TO authenticated (toutes colonnes). La RLS filtre
--   les LIGNES, pas les COLONNES → un admin/self voyant une ligne pourrait SELECT la
--   colonne et lire les puuids des 9 autres joueurs non-consentants. Masquer une colonne
--   sous un GRANT table-level exige des GRANTs colonne-par-colonne fragiles. Une table
--   séparée en deny-all client (modèle prac_notification_log / app_events) donne une
--   frontière dure : client authenticated → permission denied (42501), lecture réservée
--   aux fonctions SECURITY DEFINER (Lots B/C) + écritures service_role.
--
-- Immuabilité + purge héritées de tracked_matches via FK ON DELETE CASCADE :
--   remove_tracking → DELETE tracked_players → cascade tracked_matches → cascade ici.
--   revoke → trigger fn_purge_tracked_matches_on_revoke → DELETE tracked_matches → cascade ici.
--
-- Dépend de : tracked_matches (20260627000002), tracked_players.
-- Idempotent : CREATE ... IF NOT EXISTS + CREATE OR REPLACE.

-- ── 1. Table ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tracked_match_participants (
  tracked_match_id uuid NOT NULL REFERENCES public.tracked_matches(id) ON DELETE CASCADE,
  puuid            text NOT NULL,
  PRIMARY KEY (tracked_match_id, puuid)
);

-- Lookup « quels matchs trackés contiennent MON puuid » (accès cat. 3 + liste filtrée, Lots B/C).
CREATE INDEX IF NOT EXISTS idx_tmp_puuid ON public.tracked_match_participants (puuid);

-- ── 2. Frontière deny-all client ──────────────────────────────────────────────
-- RLS activée + AUCUNE policy + REVOKE ALL sans aucun GRANT → un client authenticated
-- obtient permission denied (42501), anon zéro. service_role conserve ses privilèges
-- par défaut Supabase (écritures via la fonction de commit ci-dessous).
ALTER TABLE public.tracked_match_participants ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.tracked_match_participants FROM anon, authenticated;

-- ── 3. Extension de prac_commit_tracked_matches ───────────────────────────────
-- p_rows gagne un champ participant_puuids text[] par ligne. Même signature, même
-- transaction atomique. Les participants ne sont insérés que pour les matchs
-- RÉELLEMENT insérés (RETURNING de ins) — un doublon ON CONFLICT ne réinsère rien.
-- participant_puuids NULL/absent (ex. secret RIOT_INTERNAL_TOKEN non configuré côté EF)
-- → aucun participant inséré, le match reste tracké (dégradé propre, pas d'accès cat. 3
-- sur ce match tant qu'il n'est pas re-committé/backfillé).
CREATE OR REPLACE FUNCTION public.prac_commit_tracked_matches(
  p_tracked_player_id uuid,
  p_added_by          uuid,
  p_rows              jsonb
)
RETURNS int
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

  WITH input AS (
    SELECT * FROM jsonb_to_recordset(p_rows) AS r(
      match_id           text,
      region             text,
      game_creation      timestamptz,
      champion_id        int,
      champion_name      text,
      queue_id           int,
      win                boolean,
      kills              int,
      deaths             int,
      assists            int,
      cs                 int,
      duration_s         int,
      position           text,
      vision_score       int,
      damage_dealt       int,
      gold_earned        int,
      participant_puuids text[]
    )
  ),
  ins AS (
    INSERT INTO public.tracked_matches (
      tracked_player_id, match_id, region, added_by, game_creation,
      champion_id, champion_name, queue_id, win,
      kills, deaths, assists, cs, duration_s,
      position, vision_score, damage_dealt, gold_earned
    )
    SELECT
      p_tracked_player_id, i.match_id, i.region, p_added_by, i.game_creation,
      i.champion_id, i.champion_name, i.queue_id, i.win,
      i.kills, i.deaths, i.assists, i.cs, i.duration_s,
      i.position, i.vision_score, i.damage_dealt, i.gold_earned
    FROM input i
    ON CONFLICT (tracked_player_id, match_id) DO NOTHING
    RETURNING id, match_id
  ),
  -- CTE modifiante : s'exécute toujours (spec PG), même sans être lue par le SELECT final.
  -- Insère les participants des SEULS matchs fraîchement insérés (join sur ins.RETURNING).
  part AS (
    INSERT INTO public.tracked_match_participants (tracked_match_id, puuid)
    SELECT ins.id, pp
      FROM ins
      JOIN input i ON i.match_id = ins.match_id
      CROSS JOIN LATERAL unnest(i.participant_puuids) AS pp
     WHERE i.participant_puuids IS NOT NULL
    ON CONFLICT DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_inserted FROM ins;

  RETURN v_inserted;
END;
$$;

-- Réservée à l'EF prac-track (service_role bypasse le REVOKE).
REVOKE EXECUTE ON FUNCTION public.prac_commit_tracked_matches(uuid, uuid, jsonb) FROM PUBLIC;
