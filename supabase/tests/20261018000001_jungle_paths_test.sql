-- Tests SQL — table `jungle_paths` (migration 20261018000001) : RLS propriétaire,
-- privilèges, et contraintes de FORME qui protègent le fichier local de l'app.
--
-- ════════════════════════════════════════════════════════════════════════════
--  COMMENT LANCER
-- ════════════════════════════════════════════════════════════════════════════
--   1. Ouvrir le SQL Editor sur le projet **TEST** (gyjcdswpybrhesarompg).
--      ⚠️ PAS la prod (cuscgmgqakxnfwnsrhhv) tant que la migration n'y est pas
--      validée. Vérifier le nom du projet en haut à gauche : « Wyrm Forge Test ».
--   2. Coller CE FICHIER EN ENTIER dans un onglet vide, puis exécuter.
--   3. Lire la table de résultats : une ligne par test, colonne `r`.
--      Tout doit être `✅`. `ROLLBACK` final → rien ne persiste.
--   (En CLI : `supabase db query --linked -f <ce fichier>` depuis un dossier lié
--   au projet de TEST.)
--
-- Mêmes conventions que les tests de `scenarios` (20261017000002) : aucune
-- méta-commande psql, identités résolues par le script, un seul BEGIN … ROLLBACK.
-- `request.jwt.claims` décide QUI on est (`auth.uid()`), `SET LOCAL ROLE` sous quel
-- RÔLE. Sous le rôle du SQL Editor (superuser), la RLS ne s'appliquerait pas.

BEGIN;

CREATE TEMP TABLE t_res (
  ordre    int,
  test     text,
  attendu  text,
  obtenu   text,
  ok       boolean
) ON COMMIT DROP;
-- Les résultats s'écrivent aussi sous les rôles client : ce droit-là, aucun autre.
GRANT INSERT ON t_res TO anon, authenticated;

-- Exécute une instruction et renvoie 'ok' ou son SQLSTATE : une écriture refusée
-- doit être OBSERVÉE, pas faire échouer le script.
CREATE FUNCTION pg_temp.try_sql(p_sql text) RETURNS text
LANGUAGE plpgsql AS $f$
BEGIN
  EXECUTE p_sql;
  RETURN 'ok';
EXCEPTION WHEN OTHERS THEN
  RETURN SQLSTATE;
END
$f$;

-- Un INSERT de A dont seul `elements` (ou `strokes`) varie : les tests de forme
-- n'ont alors qu'une chose à dire, le JSON fautif.
CREATE FUNCTION pg_temp.try_elements(p_elements text) RETURNS text
LANGUAGE sql AS $f$
  SELECT pg_temp.try_sql(format(
    'INSERT INTO public.jungle_paths (name, elements) VALUES (''__test_jp_shape'', %L::jsonb)', p_elements))
$f$;
CREATE FUNCTION pg_temp.try_strokes(p_strokes text) RETURNS text
LANGUAGE sql AS $f$
  SELECT pg_temp.try_sql(format(
    'INSERT INTO public.jungle_paths (name, strokes) VALUES (''__test_jp_shape'', %L::jsonb)', p_strokes))
$f$;

DO $t$
DECLARE
  v_a      uuid;   -- joueur A (celui qui agit)
  v_b      uuid;   -- joueur B (la cible)
  v_row_b  uuid := gen_random_uuid();   -- path de B, semé en superuser
  v_row_a  uuid := gen_random_uuid();   -- path complet de A, id fourni comme le fait l'app
  v_min    uuid;   -- path minimal de A, id et user_id laissés aux défauts
  v_owner  uuid;
  v_cnt    int;
  v_cnt2   int;
  v_r      text;
  v_r2     text;
  v_r3     text;
  -- Un vrai path de l'app : extrait de junglepaths.json (2026-08-06, Bel'Veth),
  -- complété d'un sort et d'un tracé tels que l'éditeur les écrit — y compris un
  -- point glissé hors du canvas (souris capturée), légèrement hors de [0, 1].
  v_elems  jsonb := '[
    {"Type":0,"Label":"BlueBuff_Blue","X":0.25,"Y":0.46,"Order":1,"HasSmite":false},
    {"Type":0,"Label":"Gromp_Blue","X":0.15,"Y":0.43,"Order":2,"HasSmite":true},
    {"Type":0,"Label":"Scuttler_Red","X":0.72,"Y":0.65,"Order":8,"HasSmite":false},
    {"Type":1,"Label":"Smite","X":0.23284418005585164,"Y":0.47319971223244195,"Order":-1,"HasSmite":false},
    {"Type":6,"Label":"Spell:Flash:https://ddragon.leagueoflegends.com/cdn/16.20.1/img/spell/SummonerFlash.png","X":0.4,"Y":0.5,"Order":-1,"HasSmite":false}
  ]';
  v_strk   jsonb := '[{"Points":[{"X":0.1,"Y":0.2},{"X":0.15,"Y":0.25},{"X":-0.01,"Y":1.02}],"Color":"#FF0000","Thickness":3}]';
BEGIN
  -- ══════════════════════════════════════════════════════════════════════
  -- T0 — identités et cobaye
  -- ══════════════════════════════════════════════════════════════════════
  IF to_regclass('public.jungle_paths') IS NULL THEN
    RAISE EXCEPTION 'jungle_paths est absente — appliquer la migration 20261018000001 avant ces tests.';
  END IF;
  SELECT id INTO v_a FROM public.profiles ORDER BY created_at, id LIMIT 1;
  SELECT id INTO v_b FROM public.profiles WHERE id <> v_a ORDER BY created_at, id LIMIT 1;
  IF v_a IS NULL OR v_b IS NULL THEN
    RAISE EXCEPTION 'Il faut au moins deux profils sur cette base.';
  END IF;

  INSERT INTO public.jungle_paths (id, user_id, name, champion)
    VALUES (v_row_b, v_b, '__test_jp_b', 'Vi');

  INSERT INTO t_res VALUES (0, 'T0 — deux profils, un path semé pour B',
    'A + B', format('A=%s B=%s', left(v_a::text, 8), left(v_b::text, 8)), true);

  -- ══════════════════════════════════════════════════════════════════════
  -- Joueur A connecté
  -- ══════════════════════════════════════════════════════════════════════
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  -- T1 — création minimale : id et user_id viennent des défauts
  INSERT INTO public.jungle_paths (name) VALUES ('__test_jp_min')
    RETURNING id, user_id INTO v_min, v_owner;
  INSERT INTO t_res VALUES (1, 'T1 — INSERT sans user_id : défaut auth.uid()',
    'user_id = A', CASE WHEN v_owner = v_a THEN 'user_id = A' ELSE coalesce(v_owner::text, 'NULL') END,
    v_owner = v_a);

  -- T2 — le format réel de l'app passe tel quel
  v_r := pg_temp.try_sql(format(
    'INSERT INTO public.jungle_paths (id, user_id, name, champion, side, elements, strokes, creator, is_from_workshop)
     VALUES (%L, %L, %L, %L, %L, %L::jsonb, %L::jsonb, %L, true)',
    v_row_a, v_a, ' belveth', 'Bel''Veth', 'Red', v_elems, v_strk, 'Ewen'));
  INSERT INTO t_res VALUES (2, 'T2 — path réel de l''app (camps, smite, sort, tracé hors cadre)',
    'ok', v_r, v_r = 'ok');

  -- T3 — lecture : les siens, jamais ceux de B
  SELECT count(*) INTO v_cnt  FROM public.jungle_paths WHERE id IN (v_row_a, v_min);
  SELECT count(*) INTO v_cnt2 FROM public.jungle_paths WHERE id = v_row_b;
  INSERT INTO t_res VALUES (3, 'T3 — A lit ses 2 paths, pas celui de B',
    '2 / 0', format('%s / %s', v_cnt, v_cnt2), v_cnt = 2 AND v_cnt2 = 0);

  -- T4 — modification de son path, contenu JSONB compris
  UPDATE public.jungle_paths
     SET name = '__test_jp_renamed',
         elements = elements || '[{"Type":2,"Label":"Ward","X":0.5,"Y":0.5,"Order":-1,"HasSmite":false}]'::jsonb
   WHERE id = v_row_a;
  GET DIAGNOSTICS v_cnt = ROW_COUNT;
  SELECT jsonb_array_length(elements) INTO v_cnt2 FROM public.jungle_paths WHERE id = v_row_a;
  INSERT INTO t_res VALUES (4, 'T4 — A modifie son path (nom + ajout d''une ward)',
    '1 ligne, 6 éléments', format('%s ligne, %s éléments', v_cnt, v_cnt2), v_cnt = 1 AND v_cnt2 = 6);

  -- T5 — réassignation de son path à B
  v_r := pg_temp.try_sql(format('UPDATE public.jungle_paths SET user_id = %L WHERE id = %L', v_b, v_row_a));
  INSERT INTO t_res VALUES (5, 'T5 — A ne peut pas donner son path à B (WITH CHECK)',
    '42501', v_r, v_r = '42501');

  -- T6 — création au nom de B
  v_r := pg_temp.try_sql(format('INSERT INTO public.jungle_paths (user_id, name) VALUES (%L, ''pirate'')', v_b));
  INSERT INTO t_res VALUES (6, 'T6 — A ne peut pas créer un path au nom de B',
    '42501', v_r, v_r = '42501');

  -- T7 — modification / suppression du path de B : 0 ligne, sans erreur
  -- (c'est ce silence que le site doit détecter par `.select()` après écriture)
  UPDATE public.jungle_paths SET name = 'pirate' WHERE id = v_row_b;
  GET DIAGNOSTICS v_cnt = ROW_COUNT;
  DELETE FROM public.jungle_paths WHERE id = v_row_b;
  GET DIAGNOSTICS v_cnt2 = ROW_COUNT;
  INSERT INTO t_res VALUES (7, 'T7 — A ne modifie ni ne supprime le path de B',
    'update 0 · delete 0', format('update %s · delete %s', v_cnt, v_cnt2), v_cnt = 0 AND v_cnt2 = 0);

  -- T8 — l'upsert de l'app (ON CONFLICT DO UPDATE) sur l'id d'un path de B
  v_r := pg_temp.try_sql(format(
    'INSERT INTO public.jungle_paths (id, user_id, name) VALUES (%L, %L, ''pirate'')
     ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name', v_row_b, v_a));
  INSERT INTO t_res VALUES (8, 'T8 — upsert sur l''id d''un path de B : refusé',
    '42501', v_r, v_r = '42501');

  -- T9 — l'upsert de l'app sur SON path : met à jour
  v_r := pg_temp.try_sql(format(
    'INSERT INTO public.jungle_paths (id, user_id, name) VALUES (%L, %L, ''__test_jp_upsert'')
     ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name', v_row_a, v_a));
  SELECT count(*) INTO v_cnt FROM public.jungle_paths WHERE id = v_row_a AND name = '__test_jp_upsert';
  INSERT INTO t_res VALUES (9, 'T9 — upsert de A sur son propre path : mis à jour',
    'ok, 1 ligne', format('%s, %s ligne', v_r, v_cnt), v_r = 'ok' AND v_cnt = 1);

  -- ── Contraintes de forme : tout ce que l'app ne saurait pas relire ──────────
  -- 23514 = check_violation. Chaque cas est un INSERT de A, refusé en entier.

  -- T10 — Type en chaîne : LE cas qui viderait le fichier local de l'app
  v_r := pg_temp.try_elements('[{"Type":"Ward","Label":"Ward","X":0.5,"Y":0.5}]');
  INSERT INTO t_res VALUES (10, 'T10 — "Type":"Ward" (chaîne) refusé',
    '23514', v_r, v_r = '23514');

  -- T11 — un seul élément fautif au milieu d'éléments valides
  v_r := pg_temp.try_elements('[{"Type":0,"X":0.1,"Y":0.1},{"Type":0,"X":"0.2","Y":0.2},{"Type":1,"X":0.3,"Y":0.3}]');
  INSERT INTO t_res VALUES (11, 'T11 — X en chaîne au milieu d''éléments valides refusé',
    '23514', v_r, v_r = '23514');

  -- T12 — types des champs optionnels
  v_r  := pg_temp.try_elements('[{"Type":0,"X":0.1,"Y":0.1,"HasSmite":"true"}]');
  v_r2 := pg_temp.try_elements('[{"Type":0,"X":0.1,"Y":0.1,"Label":null}]');
  v_r3 := pg_temp.try_elements('[{"Type":0,"X":0.1,"Y":0.1,"Label":3}]');
  INSERT INTO t_res VALUES (12, 'T12 — HasSmite chaîne / Label null / Label nombre refusés',
    '23514 ×3', format('%s / %s / %s', v_r, v_r2, v_r3),
    v_r = '23514' AND v_r2 = '23514' AND v_r3 = '23514');

  -- T13 — Type absent, décimal, hors plage d'entier
  v_r  := pg_temp.try_elements('[{"X":0.1,"Y":0.1}]');
  v_r2 := pg_temp.try_elements('[{"Type":2.5,"X":0.1,"Y":0.1}]');
  v_r3 := pg_temp.try_elements('[{"Type":99999999999,"X":0.1,"Y":0.1}]');
  INSERT INTO t_res VALUES (13, 'T13 — Type absent / décimal / hors Int32 refusés',
    '23514 ×3', format('%s / %s / %s', v_r, v_r2, v_r3),
    v_r = '23514' AND v_r2 = '23514' AND v_r3 = '23514');

  -- T14 — Order hors bornes, élément qui n'est pas un objet, `elements` non tableau
  v_r  := pg_temp.try_elements('[{"Type":0,"X":0.1,"Y":0.1,"Order":99999999999}]');
  v_r2 := pg_temp.try_elements('[3]');
  v_r3 := pg_temp.try_elements('{"Type":0,"X":0.1,"Y":0.1}');
  INSERT INTO t_res VALUES (14, 'T14 — Order hors bornes / élément non objet / objet au lieu de tableau',
    '23514 ×3', format('%s / %s / %s', v_r, v_r2, v_r3),
    v_r = '23514' AND v_r2 = '23514' AND v_r3 = '23514');

  -- T15 — un type d'élément INCONNU de l'app mais bien formé passe : c'est l'app
  -- qui le filtre à la lecture (plage large pour ne pas exiger de migration).
  v_r := pg_temp.try_elements('[{"Type":7,"Label":"Futur","X":0.5,"Y":0.5}]');
  INSERT INTO t_res VALUES (15, 'T15 — Type 7 bien formé accepté (filtré côté app)',
    'ok', v_r, v_r = 'ok');

  -- T16 — tracés : couleur que WPF refuse, Points null, point sans Y
  v_r  := pg_temp.try_strokes('[{"Points":[{"X":0.1,"Y":0.1}],"Color":"red","Thickness":3}]');
  v_r2 := pg_temp.try_strokes('[{"Points":null,"Color":"#FF0000","Thickness":3}]');
  v_r3 := pg_temp.try_strokes('[{"Points":[{"X":0.1}],"Color":"#FF0000","Thickness":3}]');
  INSERT INTO t_res VALUES (16, 'T16 — Color "red" / Points null / point sans Y refusés',
    '23514 ×3', format('%s / %s / %s', v_r, v_r2, v_r3),
    v_r = '23514' AND v_r2 = '23514' AND v_r3 = '23514');

  -- T17 — bornes : point très hors carte, elements > 64 Ko, côté en minuscules
  v_r  := pg_temp.try_strokes('[{"Points":[{"X":5,"Y":0.1}]}]');
  v_r2 := pg_temp.try_sql(format(
    'INSERT INTO public.jungle_paths (name, elements) VALUES (''x'', %L::jsonb)',
    (SELECT jsonb_agg(jsonb_build_object('Type', 0, 'Label', repeat('L', 400), 'X', 0.5, 'Y', 0.5))
       FROM generate_series(1, 200))));
  v_r3 := pg_temp.try_sql($$INSERT INTO public.jungle_paths (name, side) VALUES ('x', 'blue')$$);
  INSERT INTO t_res VALUES (17, 'T17 — point X=5 / elements > 64 Ko / side "blue" refusés',
    '23514 ×3', format('%s / %s / %s', v_r, v_r2, v_r3),
    v_r = '23514' AND v_r2 = '23514' AND v_r3 = '23514');

  -- T18 — suppression de son propre path
  DELETE FROM public.jungle_paths WHERE id = v_min;
  GET DIAGNOSTICS v_cnt = ROW_COUNT;
  INSERT INTO t_res VALUES (18, 'T18 — A supprime son path',
    '1 ligne', format('%s ligne', v_cnt), v_cnt = 1);

  EXECUTE 'RESET ROLE';

  -- ══════════════════════════════════════════════════════════════════════
  -- Visiteur anonyme
  -- ══════════════════════════════════════════════════════════════════════
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  EXECUTE 'SET LOCAL ROLE anon';
  v_r  := pg_temp.try_sql('SELECT count(*) FROM public.jungle_paths');
  v_r2 := pg_temp.try_sql($$INSERT INTO public.jungle_paths (name) VALUES ('anon')$$);
  v_r3 := pg_temp.try_sql('DELETE FROM public.jungle_paths');
  INSERT INTO t_res VALUES (19, 'T19 — anon : lecture / écriture / suppression refusées',
    '42501 ×3', format('%s / %s / %s', v_r, v_r2, v_r3),
    v_r = '42501' AND v_r2 = '42501' AND v_r3 = '42501');
  EXECUTE 'RESET ROLE';

  -- T20 — la ligne de B a survécu à tout ce qui précède, intacte
  SELECT count(*) INTO v_cnt FROM public.jungle_paths
   WHERE id = v_row_b AND user_id = v_b AND name = '__test_jp_b';
  INSERT INTO t_res VALUES (20, 'T20 — le path de B est intact',
    '1 ligne', format('%s ligne', v_cnt), v_cnt = 1);
END
$t$;

-- T21 — privilèges réels (pas seulement la relecture du GRANT)
INSERT INTO t_res
SELECT 21, 'T21 — anon : aucun privilège · authenticated : S/I/U/D seulement',
       'anon 0/7 · auth 4/4 + 0/3',
       format('anon %s/7 · auth %s/4 + %s/3',
         (SELECT count(*) FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p
           WHERE has_table_privilege('anon', 'public.jungle_paths', p)),
         (SELECT count(*) FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE']) p
           WHERE has_table_privilege('authenticated', 'public.jungle_paths', p)),
         (SELECT count(*) FROM unnest(ARRAY['TRUNCATE','REFERENCES','TRIGGER']) p
           WHERE has_table_privilege('authenticated', 'public.jungle_paths', p))),
       (SELECT count(*) FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p
         WHERE has_table_privilege('anon', 'public.jungle_paths', p)) = 0
   AND (SELECT count(*) FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE']) p
         WHERE has_table_privilege('authenticated', 'public.jungle_paths', p)) = 4
   AND (SELECT count(*) FROM unnest(ARRAY['TRUNCATE','REFERENCES','TRIGGER']) p
         WHERE has_table_privilege('authenticated', 'public.jungle_paths', p)) = 0;

-- T22 — exactement 4 policies, toutes TO authenticated, aucune ne lit un flag
INSERT INTO t_res
SELECT 22, 'T22 — 4 policies jp_*, toutes TO authenticated, sans flag',
       '4 / 4 / 0', format('%s / %s / %s', count(*),
         count(*) FILTER (WHERE roles = ARRAY['authenticated']::name[]),
         count(*) FILTER (WHERE coalesce(qual,'') || coalesce(with_check,'') LIKE '%launch_flag_on%')),
       count(*) = 4
       AND count(*) FILTER (WHERE roles = ARRAY['authenticated']::name[]) = 4
       AND count(*) FILTER (WHERE coalesce(qual,'') || coalesce(with_check,'') LIKE '%launch_flag_on%') = 0
  FROM pg_policies WHERE schemaname = 'public' AND tablename = 'jungle_paths';

-- T23 — suppression du compte ⇒ suppression de ses paths (ON DELETE CASCADE)
INSERT INTO t_res
SELECT 23, 'T23 — FK user_id → auth.users ON DELETE CASCADE',
       'c', coalesce(max(confdeltype::text), '(aucune FK)'), coalesce(max(confdeltype::text), '') = 'c'
  FROM pg_constraint
 WHERE conrelid = 'public.jungle_paths'::regclass AND contype = 'f'
   AND confrelid = 'auth.users'::regclass;

SELECT ordre, CASE WHEN ok THEN '✅' ELSE '❌' END AS r, test, attendu, obtenu
  FROM t_res ORDER BY ordre;

-- Rien ne persiste : paths semés et créés, fonctions temporaires.
ROLLBACK;
