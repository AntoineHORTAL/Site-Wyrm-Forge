-- Tests SQL — fonctions d'agrégats prac (lot 4A, migration 20260628000001).
--
-- ⚠️ Pas de stack Supabase locale dans cette session → ces tests sont conçus pour
-- le SQL Editor DISTANT (ou `supabase db query --linked`), exécutés UN PAR UN.
-- Modèle identique aux tests 3A/3B : chaque bloc est autonome, encadré par
-- BEGIN … ROLLBACK (rien ne persiste), auth.uid() piloté par SET LOCAL ROLE
-- authenticated + set_config('request.jwt.claims', …).
--
-- Les blocs « data-dependent » (T2/T3/T4/T5) SEEDENT eux-mêmes leurs matchs sur le
-- joueur tracké réel, AVANT le SET LOCAL ROLE (tracked_matches n'a aucune policy
-- INSERT client → l'insert doit se faire sous le rôle postgres du SQL Editor),
-- puis ROLLBACK. Aucun nouveau compte n'est créé : on réutilise l'unique dossier
-- existant.
--
-- UUID RÉELS utilisés (vérifiés en base le 2026-06-28) :
--   • admin prac      : 35252895-c25d-4aba-b1a6-e5a5575a43ea  (Antoine HORTAL)
--   • non-admin tiers  : 115c0a52-cc2a-46b4-9163-7e30aa95e3a1  (test_pseudo)
--   • dossier tracké   : 579851bf-b1af-4531-8800-e5df5c671ca5  (status=accepted)
--       └─ propriétaire : febe8fb5-e15b-4cd4-ac26-fd5eda221998  (Corentin Fautr, non-admin)
--
-- ✅ Les 7 blocs ont été exécutés contre le remote le 2026-06-28 — tous conformes.

-- ════════════════════════════════════════════════════════════════════════════
-- T1 — prac_top_winrate refuse un non-admin.
-- Attendu : ERROR  P0001: not_prac_admin
-- ════════════════════════════════════════════════════════════════════════════
BEGIN;
  SET LOCAL ROLE authenticated;
  SELECT set_config('request.jwt.claims', json_build_object('sub','115c0a52-cc2a-46b4-9163-7e30aa95e3a1','role','authenticated')::text, true);
  SELECT * FROM public.prac_top_winrate(5);
ROLLBACK;

-- ════════════════════════════════════════════════════════════════════════════
-- T2 — Seuil p_min_matches (le joueur a 6 matchs).
-- Attendu : ligne « min=6 (inclus) » → rows=1, games=6, winrate=66.7
--           ligne « min=7 (exclu)  » → rows=0, games=NULL, winrate=NULL
-- ════════════════════════════════════════════════════════════════════════════
BEGIN;
  INSERT INTO public.tracked_matches
    (tracked_player_id, match_id, region, added_by, game_creation,
     champion_id, champion_name, queue_id, win, kills, deaths, assists, cs, duration_s,
     position, vision_score, damage_dealt, gold_earned)
  VALUES
    ('579851bf-b1af-4531-8800-e5df5c671ca5','SEED_1','euw1','35252895-c25d-4aba-b1a6-e5a5575a43ea', now()-interval '1 h', 103,'Ahri',420,true ,5,0,5,200,1800,'MIDDLE',30,25000,12000),
    ('579851bf-b1af-4531-8800-e5df5c671ca5','SEED_2','euw1','35252895-c25d-4aba-b1a6-e5a5575a43ea', now()-interval '2 h', 103,'Ahri',420,true ,5,0,5,200,1800,'MIDDLE',30,25000,12000),
    ('579851bf-b1af-4531-8800-e5df5c671ca5','SEED_3','euw1','35252895-c25d-4aba-b1a6-e5a5575a43ea', now()-interval '3 h', 103,'Ahri',420,false,5,0,5,200,1800,'MIDDLE',30,25000,12000),
    ('579851bf-b1af-4531-8800-e5df5c671ca5','SEED_4','euw1','35252895-c25d-4aba-b1a6-e5a5575a43ea', now()-interval '4 h', 99 ,'Lux' ,420,true ,5,0,5,200,1800,'MIDDLE',30,25000,12000),
    ('579851bf-b1af-4531-8800-e5df5c671ca5','SEED_5','euw1','35252895-c25d-4aba-b1a6-e5a5575a43ea', now()-interval '5 h', 99 ,'Lux' ,420,false,5,0,5,200,1800,'MIDDLE',30,25000,12000),
    ('579851bf-b1af-4531-8800-e5df5c671ca5','SEED_6','euw1','35252895-c25d-4aba-b1a6-e5a5575a43ea', now()-interval '6 h', 238,'Zed' ,420,true ,5,0,5,200,1800,'MIDDLE',30,25000,12000);

  SET LOCAL ROLE authenticated;
  SELECT set_config('request.jwt.claims', json_build_object('sub','35252895-c25d-4aba-b1a6-e5a5575a43ea','role','authenticated')::text, true);

  SELECT 'min=6 (inclus)' AS cas, count(*) AS rows, max(games) AS games, max(winrate) AS winrate
    FROM public.prac_top_winrate(6)
   WHERE tracked_player_id='579851bf-b1af-4531-8800-e5df5c671ca5'
  UNION ALL
  SELECT 'min=7 (exclu)', count(*), max(games), max(winrate)
    FROM public.prac_top_winrate(7)
   WHERE tracked_player_id='579851bf-b1af-4531-8800-e5df5c671ca5';
ROLLBACK;

-- ════════════════════════════════════════════════════════════════════════════
-- T3 — Protection division par zéro (les 6 matchs ont deaths=0).
-- Attendu : games=6, avg_kda=60 (ΣK+ΣA=30+30, AUCUNE erreur de division),
--           avg_cs_per_min=6.67 (1200 cs / 10800 s * 60).
-- ════════════════════════════════════════════════════════════════════════════
BEGIN;
  INSERT INTO public.tracked_matches
    (tracked_player_id, match_id, region, added_by, game_creation,
     champion_id, champion_name, queue_id, win, kills, deaths, assists, cs, duration_s,
     position, vision_score, damage_dealt, gold_earned)
  VALUES
    ('579851bf-b1af-4531-8800-e5df5c671ca5','SEED_1','euw1','35252895-c25d-4aba-b1a6-e5a5575a43ea', now()-interval '1 h', 103,'Ahri',420,true ,5,0,5,200,1800,'MIDDLE',30,25000,12000),
    ('579851bf-b1af-4531-8800-e5df5c671ca5','SEED_2','euw1','35252895-c25d-4aba-b1a6-e5a5575a43ea', now()-interval '2 h', 103,'Ahri',420,true ,5,0,5,200,1800,'MIDDLE',30,25000,12000),
    ('579851bf-b1af-4531-8800-e5df5c671ca5','SEED_3','euw1','35252895-c25d-4aba-b1a6-e5a5575a43ea', now()-interval '3 h', 103,'Ahri',420,false,5,0,5,200,1800,'MIDDLE',30,25000,12000),
    ('579851bf-b1af-4531-8800-e5df5c671ca5','SEED_4','euw1','35252895-c25d-4aba-b1a6-e5a5575a43ea', now()-interval '4 h', 99 ,'Lux' ,420,true ,5,0,5,200,1800,'MIDDLE',30,25000,12000),
    ('579851bf-b1af-4531-8800-e5df5c671ca5','SEED_5','euw1','35252895-c25d-4aba-b1a6-e5a5575a43ea', now()-interval '5 h', 99 ,'Lux' ,420,false,5,0,5,200,1800,'MIDDLE',30,25000,12000),
    ('579851bf-b1af-4531-8800-e5df5c671ca5','SEED_6','euw1','35252895-c25d-4aba-b1a6-e5a5575a43ea', now()-interval '6 h', 238,'Zed' ,420,true ,5,0,5,200,1800,'MIDDLE',30,25000,12000);

  SET LOCAL ROLE authenticated;
  SELECT set_config('request.jwt.claims', json_build_object('sub','35252895-c25d-4aba-b1a6-e5a5575a43ea','role','authenticated')::text, true);

  SELECT games, avg_kda, avg_cs_per_min
    FROM public.prac_top_winrate(1)
   WHERE tracked_player_id='579851bf-b1af-4531-8800-e5df5c671ca5';
ROLLBACK;

-- ════════════════════════════════════════════════════════════════════════════
-- T4 — prac_player_stats (admin) : agrégats + top_champions jsonb (top 3 par games).
-- Attendu : username='Corentin Fautr', games=6, wins=4, losses=2, winrate=66.7,
--           top_champions = [ Ahri{games:3,wins:2,winrate:66.7},
--                             Lux {games:2,wins:1,winrate:50},
--                             Zed {games:1,wins:1,winrate:100} ]
-- ════════════════════════════════════════════════════════════════════════════
BEGIN;
  INSERT INTO public.tracked_matches
    (tracked_player_id, match_id, region, added_by, game_creation,
     champion_id, champion_name, queue_id, win, kills, deaths, assists, cs, duration_s,
     position, vision_score, damage_dealt, gold_earned)
  VALUES
    ('579851bf-b1af-4531-8800-e5df5c671ca5','SEED_1','euw1','35252895-c25d-4aba-b1a6-e5a5575a43ea', now()-interval '1 h', 103,'Ahri',420,true ,5,0,5,200,1800,'MIDDLE',30,25000,12000),
    ('579851bf-b1af-4531-8800-e5df5c671ca5','SEED_2','euw1','35252895-c25d-4aba-b1a6-e5a5575a43ea', now()-interval '2 h', 103,'Ahri',420,true ,5,0,5,200,1800,'MIDDLE',30,25000,12000),
    ('579851bf-b1af-4531-8800-e5df5c671ca5','SEED_3','euw1','35252895-c25d-4aba-b1a6-e5a5575a43ea', now()-interval '3 h', 103,'Ahri',420,false,5,0,5,200,1800,'MIDDLE',30,25000,12000),
    ('579851bf-b1af-4531-8800-e5df5c671ca5','SEED_4','euw1','35252895-c25d-4aba-b1a6-e5a5575a43ea', now()-interval '4 h', 99 ,'Lux' ,420,true ,5,0,5,200,1800,'MIDDLE',30,25000,12000),
    ('579851bf-b1af-4531-8800-e5df5c671ca5','SEED_5','euw1','35252895-c25d-4aba-b1a6-e5a5575a43ea', now()-interval '5 h', 99 ,'Lux' ,420,false,5,0,5,200,1800,'MIDDLE',30,25000,12000),
    ('579851bf-b1af-4531-8800-e5df5c671ca5','SEED_6','euw1','35252895-c25d-4aba-b1a6-e5a5575a43ea', now()-interval '6 h', 238,'Zed' ,420,true ,5,0,5,200,1800,'MIDDLE',30,25000,12000);

  SET LOCAL ROLE authenticated;
  SELECT set_config('request.jwt.claims', json_build_object('sub','35252895-c25d-4aba-b1a6-e5a5575a43ea','role','authenticated')::text, true);

  SELECT username, games, wins, losses, winrate, top_champions
    FROM public.prac_player_stats('579851bf-b1af-4531-8800-e5df5c671ca5');
ROLLBACK;

-- ════════════════════════════════════════════════════════════════════════════
-- T5 — Vue self : un non-admin voit SON propre dossier.
-- febe8fb5 = propriétaire du dossier 579851bf, NON admin prac.
-- Attendu : username='Corentin Fautr', games=2, wins=1, losses=1 (pas d'erreur).
-- ════════════════════════════════════════════════════════════════════════════
BEGIN;
  INSERT INTO public.tracked_matches
    (tracked_player_id, match_id, region, added_by, game_creation,
     champion_id, champion_name, queue_id, win, kills, deaths, assists, cs, duration_s,
     position, vision_score, damage_dealt, gold_earned)
  VALUES
    ('579851bf-b1af-4531-8800-e5df5c671ca5','SEED_1','euw1','35252895-c25d-4aba-b1a6-e5a5575a43ea', now()-interval '1 h', 103,'Ahri',420,true ,5,0,5,200,1800,'MIDDLE',30,25000,12000),
    ('579851bf-b1af-4531-8800-e5df5c671ca5','SEED_2','euw1','35252895-c25d-4aba-b1a6-e5a5575a43ea', now()-interval '2 h', 99 ,'Lux' ,420,false,5,0,5,200,1800,'MIDDLE',30,25000,12000);

  SET LOCAL ROLE authenticated;
  SELECT set_config('request.jwt.claims', json_build_object('sub','febe8fb5-e15b-4cd4-ac26-fd5eda221998','role','authenticated')::text, true);

  SELECT username, games, wins, losses
    FROM public.prac_player_stats('579851bf-b1af-4531-8800-e5df5c671ca5');
ROLLBACK;

-- ════════════════════════════════════════════════════════════════════════════
-- T6 — Anti-énumération : non-admin sur un dossier EXISTANT mais pas le sien.
-- 115c0a52 n'est ni admin ni propriétaire de 579851bf (qui EXISTE).
-- Attendu : ERROR  P0001: not_authorized   (et SURTOUT PAS not_found).
-- ════════════════════════════════════════════════════════════════════════════
BEGIN;
  SET LOCAL ROLE authenticated;
  SELECT set_config('request.jwt.claims', json_build_object('sub','115c0a52-cc2a-46b4-9163-7e30aa95e3a1','role','authenticated')::text, true);
  SELECT * FROM public.prac_player_stats('579851bf-b1af-4531-8800-e5df5c671ca5');
ROLLBACK;

-- ════════════════════════════════════════════════════════════════════════════
-- T7 — Anti-énumération (contraste avec T6) : admin sur un id INEXISTANT.
-- L'admin EST autorisé → on révèle honnêtement l'inexistence.
-- Attendu : ERROR  P0001: not_found.
-- ════════════════════════════════════════════════════════════════════════════
BEGIN;
  SET LOCAL ROLE authenticated;
  SELECT set_config('request.jwt.claims', json_build_object('sub','35252895-c25d-4aba-b1a6-e5a5575a43ea','role','authenticated')::text, true);
  SELECT * FROM public.prac_player_stats('00000000-0000-0000-0000-000000000000');
ROLLBACK;
