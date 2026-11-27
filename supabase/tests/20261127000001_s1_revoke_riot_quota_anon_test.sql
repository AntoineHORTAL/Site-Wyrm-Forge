-- Tests SQL — S1 : disjoncteur et limiteur Riot fermés aux rôles client
-- (migration 20261127000001_s1_revoke_riot_quota_anon.sql).
--
-- ════════════════════════════════════════════════════════════════════════════
--  COMMENT LANCER
-- ════════════════════════════════════════════════════════════════════════════
--   1. SQL Editor du projet **TEST** (gyjcdswpybrhesarompg), ou en CLI depuis un
--      dossier LIÉ À TEST : `supabase db query --linked --workdir <dossier> -f <ce fichier>`.
--      ⚠️ Le dépôt du site est lié à la PROD : ne jamais lancer `--linked` depuis lui.
--   2. Coller CE FICHIER EN ENTIER, exécuter, lire la colonne `r` : tout doit être ✅.
--   3. `ROLLBACK` final : les appels réels faits sous service_role (T10) sont annulés.
--
-- Rien n'est créé hors transaction ; aucune donnée applicative n'est lue ni écrite
-- à part `riot_daily_quota` / `riot_rate_limits` (annulé). Rejouable sur PROD en
-- lecture seule en retirant T10 — mais la règle reste : TEST d'abord.
--
-- ── T12 : le garde-fou qui aurait évité S1 ──────────────────────────────────
-- Il liste TOUTES les fonctions SECURITY DEFINER du schéma public exécutables par
-- `anon` et échoue dès qu'une fonction sort de la liste blanche ci-dessous. Une
-- nouvelle migration qui oublie `REVOKE … FROM anon` (le défaut récurrent : les
-- DEFAULT PRIVILEGES Supabase accordent EXECUTE nominativement à anon) fait donc
-- échouer ce test, au lieu de passer la relecture de code.
--   Liste blanche (2026-11-27) :
--   • get_rank_avg, get_equipped_cosmetics — publiques par conception ;
--   • is_admin — évaluée par des policies sans clause TO, donc aussi pour anon ;
--   • increment_saves, increment_jp_likes, increment_jp_saves — compteurs du
--     Workshop appelés par les clients ; à retirer de la liste quand leur
--     remplacement (patron de 20261021000001) sera livré.
-- Ajouter une fonction à la liste = décision explicite, à justifier ici.

BEGIN;

CREATE TEMP TABLE t_res (
  ordre    int,
  test     text,
  attendu  text,
  obtenu   text,
  ok       boolean
) ON COMMIT DROP;
GRANT INSERT ON t_res TO anon, authenticated;

-- Exécute une instruction et renvoie 'ok' ou son SQLSTATE : un refus doit être
-- OBSERVÉ, pas faire échouer le script.
CREATE FUNCTION pg_temp.try_sql(p_sql text) RETURNS text
LANGUAGE plpgsql AS $f$
BEGIN
  EXECUTE p_sql;
  RETURN 'ok';
EXCEPTION WHEN OTHERS THEN
  RETURN SQLSTATE;
END
$f$;

-- T1–T9 — privilèges réels, fonction par fonction et rôle par rôle
INSERT INTO t_res
SELECT row_number() OVER (ORDER BY f.ord, r.ord),
       format('T%s — %s : EXECUTE par %s', row_number() OVER (ORDER BY f.ord, r.ord), f.sig, r.rol),
       CASE WHEN r.rol = 'service_role' THEN 'oui' ELSE 'non' END,
       CASE WHEN has_function_privilege(r.rol, f.sig::regprocedure, 'EXECUTE') THEN 'oui' ELSE 'non' END,
       has_function_privilege(r.rol, f.sig::regprocedure, 'EXECUTE') = (r.rol = 'service_role')
  FROM (VALUES (1, 'public.fn_riot_quota_increment(integer,text)'),
               (2, 'public.fn_riot_quota_check()'),
               (3, 'public.fn_riot_rate_increment(text,text,timestamptz)')) AS f(ord, sig)
 CROSS JOIN (VALUES (1, 'anon'), (2, 'authenticated'), (3, 'service_role')) AS r(ord, rol);

DO $$
DECLARE
  v_before int;
  v_after  int;
  v_r1 text; v_r2 text; v_r3 text;
BEGIN
  SELECT coalesce(max(calls_made), 0) INTO v_before
    FROM public.riot_daily_quota WHERE date = current_date;

  -- T10 — scénario d'attaque S1, rejoué sous anon : refusé, compteur intact
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  EXECUTE 'SET LOCAL ROLE anon';
  v_r1 := pg_temp.try_sql('SELECT * FROM public.fn_riot_quota_increment(100000, ''riot-rank'')');
  v_r2 := pg_temp.try_sql('SELECT * FROM public.fn_riot_quota_check()');
  v_r3 := pg_temp.try_sql('SELECT public.fn_riot_rate_increment(''s1-test'', ''riot-rank'', now())');
  EXECUTE 'RESET ROLE';
  SELECT coalesce(max(calls_made), 0) INTO v_after
    FROM public.riot_daily_quota WHERE date = current_date;
  INSERT INTO t_res VALUES (10, 'T10 — anon : increment(100000) / check / rate refusés, compteur intact',
    format('42501 ×3, %s', v_before), format('%s / %s / %s, %s', v_r1, v_r2, v_r3, v_after),
    v_r1 = '42501' AND v_r2 = '42501' AND v_r3 = '42501' AND v_after = v_before);

  -- T11 — même chose sous authenticated (compte connecté quelconque)
  PERFORM set_config('request.jwt.claims',
    json_build_object('role', 'authenticated', 'sub', gen_random_uuid())::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  v_r1 := pg_temp.try_sql('SELECT * FROM public.fn_riot_quota_increment(100000, ''riot-rank'')');
  v_r2 := pg_temp.try_sql('SELECT * FROM public.fn_riot_quota_check()');
  v_r3 := pg_temp.try_sql('SELECT public.fn_riot_rate_increment(''s1-test'', ''riot-rank'', now())');
  EXECUTE 'RESET ROLE';
  INSERT INTO t_res VALUES (11, 'T11 — authenticated : les trois refusés',
    '42501 ×3', format('%s / %s / %s', v_r1, v_r2, v_r3),
    v_r1 = '42501' AND v_r2 = '42501' AND v_r3 = '42501');

  -- T13 — chemin des Edge Functions : service_role exécute les trois (annulé au ROLLBACK)
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  EXECUTE 'SET LOCAL ROLE service_role';
  v_r1 := pg_temp.try_sql('SELECT * FROM public.fn_riot_quota_increment(0, ''riot-rank'')');
  v_r2 := pg_temp.try_sql('SELECT * FROM public.fn_riot_quota_check()');
  v_r3 := pg_temp.try_sql('SELECT public.fn_riot_rate_increment(''s1-test'', ''riot-rank'', now())');
  EXECUTE 'RESET ROLE';
  INSERT INTO t_res VALUES (13, 'T13 — service_role : les trois s''exécutent (chemin des Edge Functions)',
    'ok ×3', format('%s / %s / %s', v_r1, v_r2, v_r3),
    v_r1 = 'ok' AND v_r2 = 'ok' AND v_r3 = 'ok');
END $$;

-- T12 — garde-fou global : aucune fonction SECURITY DEFINER de public n'est
-- exécutable par anon hors liste blanche (voir l'en-tête)
INSERT INTO t_res
SELECT 12, 'T12 — SECURITY DEFINER exécutables par anon ⊆ liste blanche',
       '(aucune hors liste)',
       coalesce(string_agg(p.oid::regprocedure::text, ', ' ORDER BY 1), '(aucune hors liste)'),
       count(*) = 0
  FROM pg_proc p
 WHERE p.pronamespace = 'public'::regnamespace
   AND p.prokind = 'f'
   AND p.prosecdef
   AND p.prorettype NOT IN ('trigger'::regtype, 'event_trigger'::regtype)
   AND has_function_privilege('anon', p.oid, 'EXECUTE')
   AND p.proname NOT IN (
     'get_rank_avg', 'get_equipped_cosmetics',              -- publiques par conception
     'is_admin',                                            -- policies sans clause TO
     'increment_saves', 'increment_jp_likes', 'increment_jp_saves'  -- compteurs Workshop (voir en-tête)
   );

SELECT ordre, CASE WHEN ok THEN '✅' ELSE '❌' END AS r, test, attendu, obtenu
  FROM t_res ORDER BY ordre;

ROLLBACK;
