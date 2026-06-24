-- P3-3d (2026-06-14) — Dédup app_events (ferme le farm d'événements de quête).
--
-- Faille : riot-match-detail logguait un app_event 'match_viewed' à CHAQUE
-- consultation, sans dédup. Un utilisateur pouvait rejouer le même matchId N
-- fois pour gonfler le compteur et valider/farmer les quêtes app (app_view_match,
-- app_view_3_matches).
--
-- Correctif en deux temps :
--   1. Contrainte UNIQUE (user_id, event_type, ref_id) — un événement référencé
--      ne peut exister qu'une fois par utilisateur. Les ref_id NULL ne sont pas
--      concernés (NULLs distincts en UNIQUE Postgres) : aucun impact sur d'éventuels
--      événements futurs sans référence.
--   2. logMatchViewed passe en upsert ON CONFLICT DO NOTHING (côté EF).
--      quest-claim compte désormais les ref_id DISTINCTS (côté EF).
--
-- NB : contrainte UNIQUE TOTALE (pas d'index partiel) → l'inférence ON CONFLICT
-- (user_id, event_type, ref_id) côté PostgREST/upsert ne nécessite PAS de
-- prédicat WHERE (évite le piège 42P10 des index partiels).

-- ── 1. Purge des doublons existants (garde la plus ancienne ligne par groupe) ──
-- Seuls les groupes à ref_id NON NULL sont concernés (= la cible de la contrainte).
DELETE FROM public.app_events a
USING public.app_events b
WHERE a.user_id    = b.user_id
  AND a.event_type = b.event_type
  AND a.ref_id     = b.ref_id          -- '=' exclut naturellement les NULL
  AND a.id > b.id;

-- ── 2. Contrainte UNIQUE (idempotente) ───────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_app_events_dedup'
  ) THEN
    ALTER TABLE public.app_events
      ADD CONSTRAINT uq_app_events_dedup UNIQUE (user_id, event_type, ref_id);
  END IF;
END $$;
