-- Migration 20260611000005 : Seed de démonstration du module Tournois.
--
-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  À USAGE DE DEV / QA UNIQUEMENT — NE PAS APPLIQUER EN PRODUCTION       ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- Ce script crée un tournoi de démonstration complet avec 8 équipes,
-- 14 matchs générés par seed_bracket(), et tous les résultats reportés
-- pour simuler un bracket DE terminé.
--
-- ► SCÉNARIO ALIGNÉ SUR LES IMAGES DE RÉFÉRENCE QA (docs/references/tournois/bracket.png).
--   Le champion remonte le LOSER'S BRACKET : HWEINUH perd en WB round 2 (M7),
--   puis enchaîne M9 → M12 → M13 → M14 pour être sacré champion en battant
--   SERENITY (vainqueur du winner's bracket) en grande finale.
--
-- Attribution des seeds (ordre d'insertion par created_at) — choisie pour que
-- le câblage seed_bracket (M1=s1vsS8, M2=s4vsS5, M3=s3vsS6, M4=s2vsS7)
-- reproduise EXACTEMENT les matchups de l'image de référence :
--   seed 1 = TEEMOLEGOAT       seed 2 = STEVE-O BACKSHOTS
--   seed 3 = LES SANTAS        seed 4 = TVR
--   seed 5 = HWEINUH           seed 6 = YAMETEKUDASAI
--   seed 7 = SERENITY          seed 8 = FIEN ET FAT
--
-- Matchups générés par seed_bracket :
--   M1  WB r1 : TEEMOLEGOAT(s1)      vs FIEN ET FAT(s8)       → TEEMOLEGOAT     gagne
--   M2  WB r1 : TVR(s4)              vs HWEINUH(s5)           → HWEINUH         gagne
--   M3  WB r1 : LES SANTAS(s3)       vs YAMETEKUDASAI(s6)     → LES SANTAS      gagne
--   M4  WB r1 : STEVE-O BACKSHOTS(s2) vs SERENITY(s7)         → SERENITY        gagne
--   M5  LB r1 : FIEN ET FAT          vs TVR                   → FIEN ET FAT     gagne  (éliminé: TVR)
--   M6  LB r1 : YAMETEKUDASAI        vs STEVE-O BACKSHOTS     → STEVE-O BACKSHOTS gagne (éliminé: YAMETEKUDASAI)
--   M7  WB r2 : TEEMOLEGOAT          vs HWEINUH               → TEEMOLEGOAT     gagne  (HWEINUH chute en LB → M9.a)
--   M8  WB r2 : LES SANTAS           vs SERENITY              → SERENITY        gagne
--   M9  LB r2 : HWEINUH              vs FIEN ET FAT           → HWEINUH         gagne  (éliminé: FIEN ET FAT)
--   M10 LB r2 : LES SANTAS           vs STEVE-O BACKSHOTS     → STEVE-O BACKSHOTS gagne (éliminé: LES SANTAS)
--   M11 WB r3 : TEEMOLEGOAT          vs SERENITY              → SERENITY        gagne  (TEEMOLEGOAT chute en LB → M13.a)
--   M12 LB r3 : HWEINUH              vs STEVE-O BACKSHOTS     → HWEINUH         gagne  (éliminé: STEVE-O BACKSHOTS)
--   M13 LB r4 : TEEMOLEGOAT          vs HWEINUH               → HWEINUH         gagne  (éliminé: TEEMOLEGOAT)
--   M14 Finale: SERENITY             vs HWEINUH               → HWEINUH         CHAMPION
--
-- Bilan W/L (points = wins × 2) :
--   HWEINUH         5W 1L 10pts (seed 5) → CHAMPION (remontée du loser's bracket)
--   SERENITY        3W 1L  6pts (seed 7) → finaliste (vainqueur WB)
--   TEEMOLEGOAT     2W 2L  4pts (seed 1)
--   STEVE-O BACKSHOTS 2W 2L 4pts (seed 2)
--   LES SANTAS      1W 2L  2pts (seed 3)
--   FIEN ET FAT     1W 2L  2pts (seed 8)
--   TVR             0W 2L  0pts (seed 4)
--   YAMETEKUDASAI   0W 2L  0pts (seed 6)

DO $$
DECLARE
  v_admin_id    UUID;
  v_tid         UUID;  -- tournament_id

  -- UUIDs des équipes (dans l'ordre d'inscription = ordre des seeds)
  v_teemo       UUID;   -- seed 1 : TEEMOLEGOAT
  v_steveo      UUID;   -- seed 2 : STEVE-O BACKSHOTS
  v_santas      UUID;   -- seed 3 : LES SANTAS
  v_tvr         UUID;   -- seed 4 : TVR
  v_hweinuh     UUID;   -- seed 5 : HWEINUH
  v_yamete      UUID;   -- seed 6 : YAMETEKUDASAI
  v_serenity    UUID;   -- seed 7 : SERENITY
  v_fien        UUID;   -- seed 8 : FIEN ET FAT

  -- UUIDs des matchs (récupérés après seed_bracket)
  v_m1  UUID; v_m2  UUID; v_m3  UUID; v_m4  UUID;
  v_m5  UUID; v_m6  UUID; v_m7  UUID; v_m8  UUID;
  v_m9  UUID; v_m10 UUID; v_m11 UUID; v_m12 UUID;
  v_m13 UUID; v_m14 UUID;
BEGIN

  -- ── Récupération du compte admin pour created_by ─────────────────────────
  SELECT id INTO v_admin_id
    FROM auth.users
   WHERE email = 'admin@wyrm-forge.com'
   LIMIT 1;

  IF v_admin_id IS NULL THEN
    SELECT id INTO v_admin_id FROM auth.users LIMIT 1;
  END IF;

  IF v_admin_id IS NULL THEN
    RAISE NOTICE 'Aucun utilisateur trouvé — seed de démo ignoré.';
    RETURN;
  END IF;

  -- ── Création du tournoi de démo ──────────────────────────────────────────
  INSERT INTO public.tournaments (
    slug, name, format, map, status,
    starts_at, max_teams,
    cashprize_label, cashprize_bonus,
    caster_name, twitch_url,
    hero_image_url, rules, created_by
  )
  VALUES (
    'demo-noel-2024',
    'Tournoi Noël 2024',
    '2V2',
    'ARAM',
    'registration',
    '2024-12-21 14:00:00+00',
    8,
    '60€',
    '+ ARÈNE PASS XV2',
    'WyrmCaster',
    'https://twitch.tv/wyrmforge',
    NULL,
    '["Format Double Élimination 8 équipes","Matchs Best-of-1","Grande Finale Best-of-3","Règles ARAM standards"]'::jsonb,
    v_admin_id
  )
  ON CONFLICT (slug) DO NOTHING;

  SELECT id INTO v_tid
    FROM public.tournaments
   WHERE slug = 'demo-noel-2024';

  IF v_tid IS NULL THEN
    RAISE NOTICE 'Tournoi demo-noel-2024 introuvable après insertion — seed ignoré.';
    RETURN;
  END IF;

  -- ── Création des 8 équipes validées ─────────────────────────────────────
  -- L'ordre d'insertion (created_at) détermine les seeds dans seed_bracket().
  -- Timestamps espacés d'une minute pour garantir l'ordre déterministe.
  INSERT INTO public.tournament_teams (tournament_id, name, status, created_at) VALUES
    (v_tid, 'TEEMOLEGOAT',       'validated', '2024-12-01 10:00:00+00'),  -- seed 1
    (v_tid, 'STEVE-O BACKSHOTS', 'validated', '2024-12-01 10:01:00+00'),  -- seed 2
    (v_tid, 'LES SANTAS',        'validated', '2024-12-01 10:02:00+00'),  -- seed 3
    (v_tid, 'TVR',               'validated', '2024-12-01 10:03:00+00'),  -- seed 4
    (v_tid, 'HWEINUH',           'validated', '2024-12-01 10:04:00+00'),  -- seed 5
    (v_tid, 'YAMETEKUDASAI',     'validated', '2024-12-01 10:05:00+00'),  -- seed 6
    (v_tid, 'SERENITY',          'validated', '2024-12-01 10:06:00+00'),  -- seed 7
    (v_tid, 'FIEN ET FAT',       'validated', '2024-12-01 10:07:00+00')   -- seed 8
  ON CONFLICT (tournament_id, name) DO NOTHING;

  -- ── Récupération des UUIDs d'équipes ────────────────────────────────────
  SELECT id INTO v_teemo    FROM public.tournament_teams WHERE tournament_id = v_tid AND name = 'TEEMOLEGOAT';
  SELECT id INTO v_steveo   FROM public.tournament_teams WHERE tournament_id = v_tid AND name = 'STEVE-O BACKSHOTS';
  SELECT id INTO v_santas   FROM public.tournament_teams WHERE tournament_id = v_tid AND name = 'LES SANTAS';
  SELECT id INTO v_tvr      FROM public.tournament_teams WHERE tournament_id = v_tid AND name = 'TVR';
  SELECT id INTO v_hweinuh  FROM public.tournament_teams WHERE tournament_id = v_tid AND name = 'HWEINUH';
  SELECT id INTO v_yamete   FROM public.tournament_teams WHERE tournament_id = v_tid AND name = 'YAMETEKUDASAI';
  SELECT id INTO v_serenity FROM public.tournament_teams WHERE tournament_id = v_tid AND name = 'SERENITY';
  SELECT id INTO v_fien     FROM public.tournament_teams WHERE tournament_id = v_tid AND name = 'FIEN ET FAT';

  -- ── Ajout de joueurs fictifs (2 par équipe, format 2V2) ──────────────────
  INSERT INTO public.tournament_players (team_id, riot_pseudo, discord_pseudo) VALUES
    (v_teemo,    'TeemoLegend#EUW',  'teemolegend'),
    (v_teemo,    'GoatFarmer#EUW',   'goatfarmer'),
    (v_steveo,   'SteveO#EUW',       'steveo'),
    (v_steveo,   'BackshotKing#EUW', 'backshotking'),
    (v_santas,   'SantaTop#EUW',     'santatop'),
    (v_santas,   'SantaBot#EUW',     'santabot'),
    (v_tvr,      'TVR_One#EUW',      'tvrone'),
    (v_tvr,      'TVR_Two#EUW',      'tvrtwo'),
    (v_hweinuh,  'Hweinuh#EUW',      'hweinuh'),
    (v_hweinuh,  'SupportHW#EUW',    'supporthw'),
    (v_yamete,   'Yamete#EUW',       'yamete'),
    (v_yamete,   'Kudasai#EUW',      'kudasai'),
    (v_serenity, 'SerenADC#EUW',     'serenadce'),
    (v_serenity, 'SerenJG#EUW',      'serenjg'),
    (v_fien,     'FienTop#EUW',      'fientop'),
    (v_fien,     'FatBot#EUW',       'fatbot')
  ON CONFLICT DO NOTHING;

  -- ── Garde idempotence : bracket déjà seedé ? ────────────────────────────
  IF EXISTS (SELECT 1 FROM public.matches WHERE tournament_id = v_tid LIMIT 1) THEN
    RAISE NOTICE 'Bracket déjà seedé pour demo-noel-2024 — résultats ignorés.';
    RETURN;
  END IF;

  -- ── Génération du bracket via seed_bracket ───────────────────────────────
  -- seed_bracket() est SECURITY DEFINER avec garde created_by/is_admin().
  -- En migration (rôle postgres), auth.uid() retourne NULL → la garde échouerait.
  -- On simule un contexte admin via set_config (même mécanique que Supabase en prod).
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_admin_id::text)::text,
    true  -- local = vrai pour la durée de la transaction uniquement
  );

  PERFORM public.seed_bracket(v_tid);

  -- ── Récupération des IDs de matchs générés ───────────────────────────────
  SELECT id INTO v_m1  FROM public.matches WHERE tournament_id = v_tid AND code = 'M1';
  SELECT id INTO v_m2  FROM public.matches WHERE tournament_id = v_tid AND code = 'M2';
  SELECT id INTO v_m3  FROM public.matches WHERE tournament_id = v_tid AND code = 'M3';
  SELECT id INTO v_m4  FROM public.matches WHERE tournament_id = v_tid AND code = 'M4';
  SELECT id INTO v_m5  FROM public.matches WHERE tournament_id = v_tid AND code = 'M5';
  SELECT id INTO v_m6  FROM public.matches WHERE tournament_id = v_tid AND code = 'M6';
  SELECT id INTO v_m7  FROM public.matches WHERE tournament_id = v_tid AND code = 'M7';
  SELECT id INTO v_m8  FROM public.matches WHERE tournament_id = v_tid AND code = 'M8';
  SELECT id INTO v_m9  FROM public.matches WHERE tournament_id = v_tid AND code = 'M9';
  SELECT id INTO v_m10 FROM public.matches WHERE tournament_id = v_tid AND code = 'M10';
  SELECT id INTO v_m11 FROM public.matches WHERE tournament_id = v_tid AND code = 'M11';
  SELECT id INTO v_m12 FROM public.matches WHERE tournament_id = v_tid AND code = 'M12';
  SELECT id INTO v_m13 FROM public.matches WHERE tournament_id = v_tid AND code = 'M13';
  SELECT id INTO v_m14 FROM public.matches WHERE tournament_id = v_tid AND code = 'M14';

  -- ── Report des 14 résultats dans l'ordre logique (parents avant enfants) ─
  --
  -- Matchups réels issus du seeding (M1=s1vsS8, M2=s4vsS5, M3=s3vsS6, M4=s2vsS7) :
  --   M1 = TEEMOLEGOAT(s1, team_a)       vs FIEN ET FAT(s8, team_b)
  --   M2 = TVR(s4, team_a)               vs HWEINUH(s5, team_b)
  --   M3 = LES SANTAS(s3, team_a)        vs YAMETEKUDASAI(s6, team_b)
  --   M4 = STEVE-O BACKSHOTS(s2, team_a) vs SERENITY(s7, team_b)

  -- WB round 1
  PERFORM public.report_match_result(v_m1, v_teemo);     -- TEEMOLEGOAT bat FIEN ET FAT
  PERFORM public.report_match_result(v_m2, v_hweinuh);   -- HWEINUH bat TVR
  PERFORM public.report_match_result(v_m3, v_santas);    -- LES SANTAS bat YAMETEKUDASAI
  PERFORM public.report_match_result(v_m4, v_serenity);  -- SERENITY bat STEVE-O BACKSHOTS

  -- Propagation après WB r1 :
  --   M7.a=TEEMOLEGOAT, M7.b=HWEINUH    (WB r2)
  --   M8.a=LES SANTAS,  M8.b=SERENITY   (WB r2)
  --   M5.a=FIEN ET FAT, M5.b=TVR        (LB r1)
  --   M6.a=YAMETEKUDASAI, M6.b=STEVE-O BACKSHOTS  (LB r1)

  -- LB round 1
  PERFORM public.report_match_result(v_m5, v_fien);      -- FIEN ET FAT bat TVR (éliminé: TVR)
  PERFORM public.report_match_result(v_m6, v_steveo);    -- STEVE-O BACKSHOTS bat YAMETEKUDASAI (éliminé: YAMETEKUDASAI)

  -- Propagation après LB r1 :
  --   M9.b=FIEN ET FAT, M10.b=STEVE-O BACKSHOTS

  -- WB round 2
  PERFORM public.report_match_result(v_m7, v_teemo);     -- TEEMOLEGOAT bat HWEINUH (HWEINUH → M9.a)
  PERFORM public.report_match_result(v_m8, v_serenity);  -- SERENITY bat LES SANTAS (LES SANTAS → M10.a)

  -- Propagation après WB r2 :
  --   M11.a=TEEMOLEGOAT, M11.b=SERENITY  (WB finale)
  --   M9.a=HWEINUH,      M10.a=LES SANTAS (LB r2)

  -- LB round 2
  PERFORM public.report_match_result(v_m9, v_hweinuh);   -- HWEINUH bat FIEN ET FAT (éliminé: FIEN ET FAT)
  PERFORM public.report_match_result(v_m10, v_steveo);   -- STEVE-O BACKSHOTS bat LES SANTAS (éliminé: LES SANTAS)

  -- Propagation après LB r2 :
  --   M12.a=HWEINUH, M12.b=STEVE-O BACKSHOTS

  -- WB round 3 (finale WB)
  PERFORM public.report_match_result(v_m11, v_serenity); -- SERENITY bat TEEMOLEGOAT (TEEMOLEGOAT → M13.a)

  -- Propagation après M11 :
  --   M14.a=SERENITY, M13.a=TEEMOLEGOAT (LB finale)

  -- LB round 3
  PERFORM public.report_match_result(v_m12, v_hweinuh);  -- HWEINUH bat STEVE-O BACKSHOTS (éliminé: STEVE-O BACKSHOTS)

  -- Propagation après M12 :
  --   M13.b=HWEINUH

  -- LB round 4 (finale LB)
  PERFORM public.report_match_result(v_m13, v_hweinuh);  -- HWEINUH bat TEEMOLEGOAT (éliminé: TEEMOLEGOAT)

  -- Propagation après M13 :
  --   M14.b=HWEINUH

  -- Grande Finale
  PERFORM public.report_match_result(v_m14, v_hweinuh);  -- HWEINUH bat SERENITY → CHAMPION
  -- Déclenche aussi : UPDATE tournaments SET status = 'finished'

  RAISE NOTICE 'Seed de démo demo-noel-2024 terminé avec succès. Champion : HWEINUH (remontée loser bracket).';

END;
$$;

-- ── Vérification finale ──────────────────────────────────────────────────────
-- Affiche le classement du tournoi de démo (résultat visible dans les logs de migration).
-- Attendu : HWEINUH 1er (5W 1L 10pts), SERENITY 2e (3W 1L 6pts), etc.

SELECT
  ts.team_name,
  ts.seed,
  ts.wins,
  ts.losses,
  ts.points,
  array_to_string(ts.riot_pseudos, ', ') AS joueurs
FROM public.tournament_standings ts
JOIN public.tournaments t ON t.id = ts.tournament_id
WHERE t.slug = 'demo-noel-2024'
ORDER BY ts.points DESC, (ts.wins - ts.losses) DESC, ts.seed ASC NULLS LAST;
