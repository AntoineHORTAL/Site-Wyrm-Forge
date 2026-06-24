-- Migration 20260606000008 : ajout de la colonne criteria JSONB sur quest_definitions.
--
-- Objectif : rendre le catalogue de quêtes data-driven — chaque quête décrit
-- elle-même ses conditions de validation sans redéploiement de code.
--
-- Changement : ADDITIF et rétrocompatible.
--   - La colonne est nullable : les quêtes existantes continuent de fonctionner
--     le temps que leur criteria soit peuplé (via UPDATE ci-dessous).
--   - Aucune RLS modifiée, aucune fonction modifiée.
--
-- Schéma du JSONB criteria — formes valides :
--
--   { "type": "play", "count": <int> }
--     → jouer N parties classées dans la fenêtre UTC du jour
--
--   { "type": "win", "count": <int> }
--     → gagner N parties classées dans la fenêtre UTC du jour
--
--   { "type": "cs", "threshold": <int> }
--     → atteindre ≥ threshold CS dans une partie classée du jour
--
--   { "type": "app_event", "event": <string>, "count": <int> }
--     → N occurrences de cet event_type dans app_events pour le jour UTC
--
-- Extensibilité : ajouter de nouvelles quêtes = simple INSERT avec le criteria
-- correspondant, zéro redéploiement.
--
-- Clients concernés :
--   - Site React  : lit quest_definitions via SELECT public (policy qd_select_public)
--                   pour afficher le catalogue et savoir quoi valider côté Edge Function
--   - App WPF     : peut lire quest_definitions via la même policy pour afficher
--                   les quêtes disponibles
--   - Edge Function quests-claim : lit criteria pour piloter la logique de validation
--                   (côté service_role, bypass RLS)

-- -----------------------------------------------------------------------
-- 1. Ajout de la colonne
-- -----------------------------------------------------------------------

ALTER TABLE public.quest_definitions
  ADD COLUMN IF NOT EXISTS criteria JSONB;

-- -----------------------------------------------------------------------
-- 2. Peuplement des seeds existants (migration 20260606000006)
-- -----------------------------------------------------------------------

UPDATE public.quest_definitions
   SET criteria = '{"type": "play", "count": 1}'::jsonb
 WHERE slug = 'lol_play_game';

UPDATE public.quest_definitions
   SET criteria = '{"type": "win", "count": 1}'::jsonb
 WHERE slug = 'lol_win_game';

UPDATE public.quest_definitions
   SET criteria = '{"type": "app_event", "event": "match_viewed", "count": 1}'::jsonb
 WHERE slug = 'app_view_match';
