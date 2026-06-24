-- Migration 20260607000001 : extension du pool de quêtes journalières.
--
-- Contexte : plan architecte validé — pool final de 8 quêtes lol + 2 quêtes app,
-- cap journalier abaissé à 12 Écailles, rewards recalibrés.
--
-- ── Changements additifs ─────────────────────────────────────────────────────
--
-- 1. Deux nouvelles colonnes sur quest_definitions :
--      pool_eligible BOOLEAN NOT NULL DEFAULT true
--      cost_tier     TEXT    NOT NULL DEFAULT 'free'
--    Aucune policy RLS modifiée. Les lectures existantes (SELECT public via
--    qd_select_public) ne sont pas affectées — nouvelles colonnes avec DEFAULT.
--
-- 2. Reconciliation des 3 quêtes initiales :
--      • criteria mis à jour avec le champ queue explicite
--      • rewards recalibrés (cap=12) : play=4, win=7, app=3
--      • cost_tier = 'riot_detail' pour lol_win_game (appel match detail Riot)
--
-- 3. Seed du pool complet — ON CONFLICT (slug) DO NOTHING = idempotent.
--      8 quêtes lol + 2 quêtes app (dont les 3 existantes).
--
-- 4. cap_daily_scales = '12' (était '25').
--
-- ── Clients concernés ────────────────────────────────────────────────────────
--   Site React   : lit quest_definitions (SELECT anon/auth) — reçoit les deux
--                  nouvelles colonnes en plus ; aucun champ existant supprimé.
--   App WPF      : lit quest_definitions (SELECT anon/auth) — idem.
--   Edge Function quest-claim : lit quest par slug + category + reward.
--                  La colonne criteria est lue pour piloter la validation ;
--                  pool_eligible / cost_tier sont informatifs pour la couche
--                  d'orchestration du pool (côté Edge Function, pas encore implémentée).
--   finalize_quest_claim : signature inchangée — aucune modification.
--
-- ── Contraintes respectées ───────────────────────────────────────────────────
--   Zéro DROP. Zéro ALTER COLUMN destructif. Zéro policy supprimée.
--   Aucun slug dupliqué. Tous les INSERTs du seed sont idempotents.

-- ────────────────────────────────────────────────────────────────────────────
-- TÂCHE 1 — Nouvelles colonnes sur quest_definitions
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.quest_definitions
  ADD COLUMN IF NOT EXISTS pool_eligible BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE public.quest_definitions
  ADD COLUMN IF NOT EXISTS cost_tier TEXT NOT NULL DEFAULT 'free';

DO $$ BEGIN
  ALTER TABLE public.quest_definitions
    ADD CONSTRAINT chk_qd_cost_tier
      CHECK (cost_tier IN ('free', 'riot_detail'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ────────────────────────────────────────────────────────────────────────────
-- TÂCHE 2 — Reconciliation des 3 quêtes initiales
-- ────────────────────────────────────────────────────────────────────────────
-- Chaque UPDATE porte :
--   criteria   : ajout du champ queue explicite (queue=420 pour solo/duo)
--   reward     : recalibré pour cap=12 (play=4, win=7, app=3)
--   cost_tier  : free sauf lol_win_game qui appelle le detail Riot
--   pool_eligible : true — toutes actives dans le pool

-- lol_play_game : jouer 1 partie Solo/Duo — vérification légère (pas de detail)
UPDATE public.quest_definitions
   SET criteria      = '{"type":"play","count":1,"queue":420}'::jsonb,
       reward        = 4,
       cost_tier     = 'free',
       pool_eligible = true
 WHERE slug = 'lol_play_game';

-- lol_win_game : gagner 1 partie Solo/Duo — nécessite l'appel match detail Riot
UPDATE public.quest_definitions
   SET criteria      = '{"type":"win","count":1,"queue":420}'::jsonb,
       reward        = 7,
       cost_tier     = 'riot_detail',
       pool_eligible = true
 WHERE slug = 'lol_win_game';

-- app_view_match : consulter 1 détail de partie — vérification app_events
UPDATE public.quest_definitions
   SET criteria      = '{"type":"app_event","event":"match_viewed","count":1}'::jsonb,
       reward        = 3,
       cost_tier     = 'free',
       pool_eligible = true
 WHERE slug = 'app_view_match';

-- ────────────────────────────────────────────────────────────────────────────
-- TÂCHE 3 — Seed du pool complet
-- ────────────────────────────────────────────────────────────────────────────
-- Pool visé : 8 quêtes lol + 2 quêtes app.
-- Quêtes déjà en base (ne pas ré-insérer) : lol_play_game, lol_win_game, app_view_match.
-- Ce seed ajoute les 5 nouvelles quêtes lol + 1 quête app manquantes.
--
-- Décompte final lol :
--   lol_play_game      play 1 q420  reward 4  (existant)
--   lol_win_game       win  1 q420  reward 7  (existant)
--   lol_play_flex      play 1 q440  reward 4  (nouveau)
--   lol_play_2_solo    play 2 q420  reward 5  (nouveau)
--   lol_play_2_flex    play 2 q440  reward 5  (nouveau)
--   lol_play_3_ranked  play 3 ranked reward 6 (nouveau)
--   lol_win_ranked     win  1 ranked reward 7 (nouveau)
--   lol_play_2_ranked  play 2 ranked reward 5 (nouveau — 8e quête lol)
--
-- Décompte final app :
--   app_view_match      app_event match_viewed count=1  reward 3  (existant)
--   app_view_3_matches  app_event match_viewed count=3  reward 5  (nouveau)
--
-- queue "ranked" = union Solo/Duo (420) + Flex (440) — interprété par quest-claim.
-- ON CONFLICT (slug) DO NOTHING : idempotent en cas de ré-application.

INSERT INTO public.quest_definitions
  (slug, name, category, reward, is_active, criteria, pool_eligible, cost_tier)
VALUES
  -- Nouvelles quêtes lol
  (
    'lol_play_flex',
    'Joue une partie Flex',
    'lol', 4, true,
    '{"type":"play","count":1,"queue":440}'::jsonb,
    true, 'free'
  ),
  (
    'lol_play_2_solo',
    'Joue 2 parties classées Solo/Duo',
    'lol', 5, true,
    '{"type":"play","count":2,"queue":420}'::jsonb,
    true, 'free'
  ),
  (
    'lol_play_2_flex',
    'Joue 2 parties Flex',
    'lol', 5, true,
    '{"type":"play","count":2,"queue":440}'::jsonb,
    true, 'free'
  ),
  (
    'lol_play_3_ranked',
    'Joue 3 parties classées',
    'lol', 6, true,
    '{"type":"play","count":3,"queue":"ranked"}'::jsonb,
    true, 'free'
  ),
  (
    'lol_win_ranked',
    'Gagne une partie classée (Solo ou Flex)',
    'lol', 7, true,
    '{"type":"win","count":1,"queue":"ranked"}'::jsonb,
    true, 'riot_detail'
  ),
  (
    'lol_play_2_ranked',
    'Joue 2 parties classées (Solo ou Flex)',
    'lol', 5, true,
    '{"type":"play","count":2,"queue":"ranked"}'::jsonb,
    true, 'free'
  ),
  -- Nouvelle quête app
  (
    'app_view_3_matches',
    'Consulte le détail de 3 parties',
    'app', 5, true,
    '{"type":"app_event","event":"match_viewed","count":3}'::jsonb,
    true, 'free'
  )
ON CONFLICT (slug) DO NOTHING;

-- ────────────────────────────────────────────────────────────────────────────
-- TÂCHE 4 — Mise à jour du cap journalier
-- ────────────────────────────────────────────────────────────────────────────
-- cap_daily_scales passe de '25' à '12'.
-- Calibrage : un set typique (play 1 → 4 + play 2 → 5 + app 1 → 3) = 12 pile.
-- Un set ambitieux (play + win + app) = 4+7+3=14 → tronqué à 12 par finalize_quest_claim.

UPDATE public.app_settings
   SET value = '12'
 WHERE key = 'cap_daily_scales';
