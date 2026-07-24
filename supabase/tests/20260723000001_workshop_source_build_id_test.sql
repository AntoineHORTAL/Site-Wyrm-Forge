-- Test de la migration 20260723000001 (lien item_builds ↔ workshop_builds).
--
-- Pas de stack locale sur ce projet → bloc BEGIN/ROLLBACK unique, exécutable tel
-- quel contre le REMOTE (SQL Editor ou `supabase db query --linked -f`). Rien
-- n'est persisté : le ROLLBACK final annule le seed ET le DELETE destructif du T6.
--
-- Le fichier rejoue lui-même la DDL (idempotente) au début de la transaction :
-- il tourne donc AVANT comme APRÈS le push de la migration, et dans les deux cas
-- le ROLLBACK laisse la base intacte.
--
-- ⚠️ La DDL et le backfill ci-dessous sont des COPIES de la migration, pour
-- pouvoir les rejouer sur les données synthétiques. À resynchroniser si la clé
-- de rapprochement change dans la migration.
--
-- Couverture : S1 rapprochement positif · S2/S3 non-rapprochements · T4 unicité
-- · T5 idempotence · T6 ON DELETE SET NULL.

BEGIN;

CREATE TEMP TABLE res(ordre int, test text, detail text) ON COMMIT DROP;

-- ── DDL (copie idempotente de la migration) ──────────────────────────────────
ALTER TABLE public.workshop_builds ADD COLUMN IF NOT EXISTS source_build_id UUID;

DO $ddl$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE  conname  = 'fk_workshop_builds_source_build'
      AND  conrelid = 'public.workshop_builds'::regclass
  ) THEN
    ALTER TABLE public.workshop_builds
      ADD CONSTRAINT fk_workshop_builds_source_build
      FOREIGN KEY (source_build_id) REFERENCES public.item_builds(id)
      ON DELETE SET NULL;
  END IF;
END;
$ddl$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_workshop_builds_source
  ON public.workshop_builds (source_build_id)
  WHERE source_build_id IS NOT NULL;

-- ── SEED ─────────────────────────────────────────────────────────────────────
-- Utilise un user_id réel existant (contrainte FK vers auth.users).
-- Les deux tables portent le MÊME build dans DEUX formats différents :
--   item_builds.blocks     → camelCase, itemId string, format « slim »
--   workshop_builds.items  → PascalCase, Id number, modèle C# BuildBlock brut
-- C'est précisément ce que l'empreinte normalisée doit réconcilier.
DO $seed$
DECLARE v_u UUID;
BEGIN
  SELECT user_id INTO v_u FROM public.item_builds LIMIT 1;

  INSERT INTO public.item_builds (id, user_id, name, champ, blocks, total_gold)
  VALUES ('11111111-1111-1111-1111-111111111111', v_u, 'Ahri poke',
          '{"id":"Ahri","name":"Ahri","image":"Ahri.png"}'::jsonb,
          '[{"id":"b1","name":"Core","items":[
              {"itemId":"3157","name":"Zhonya","image":"i.png","gold":2900,"count":1},
              {"itemId":"3020","name":"Bottes","image":"b.png","gold":1100,"count":2}]}]'::jsonb,
          4000);

  -- S1 — correspondance parfaite (propriétaire + champion + contenu)
  INSERT INTO public.workshop_builds (titre, creator_name, creator_id, champion, items, runes)
  VALUES ('Ahri poke', 'Tester', v_u, 'Ahri',
          '[{"Id":"g1","Title":"Core","Items":[
              {"Id":3157,"Name":"Zhonya","IconUrl":"i.png","Gold":2900,"Count":1,"Tags":[],"Stats":{},"Description":"d","From":[],"Into":[]},
              {"Id":3020,"Name":"Bottes","IconUrl":"b.png","Gold":1100,"Count":2,"Tags":[],"Stats":{},"Description":"d","From":[],"Into":[]}]}]'::jsonb,
          '{"Primary":"Sorcery"}'::jsonb);

  -- S2 — contenu identique, CHAMPION différent
  INSERT INTO public.workshop_builds (titre, creator_name, creator_id, champion, items, runes)
  VALUES ('Ahri poke', 'Tester', v_u, 'Lux',
          '[{"Id":"g2","Title":"Core","Items":[
              {"Id":3157,"Name":"Zhonya","IconUrl":"i.png","Gold":2900,"Count":1,"Tags":[],"Stats":{},"Description":"d","From":[],"Into":[]},
              {"Id":3020,"Name":"Bottes","IconUrl":"b.png","Gold":1100,"Count":2,"Tags":[],"Stats":{},"Description":"d","From":[],"Into":[]}]}]'::jsonb,
          '{}'::jsonb);

  -- S3 — bon champion, CONTENU différent (quantité 9 au lieu de 2)
  INSERT INTO public.workshop_builds (titre, creator_name, creator_id, champion, items, runes)
  VALUES ('Ahri autre', 'Tester', v_u, 'Ahri',
          '[{"Id":"g3","Title":"Core","Items":[
              {"Id":3157,"Name":"Zhonya","IconUrl":"i.png","Gold":2900,"Count":1,"Tags":[],"Stats":{},"Description":"d","From":[],"Into":[]},
              {"Id":3020,"Name":"Bottes","IconUrl":"b.png","Gold":1100,"Count":9,"Tags":[],"Stats":{},"Description":"d","From":[],"Into":[]}]}]'::jsonb,
          '{}'::jsonb);
END;
$seed$;

-- ── BACKFILL (copie de la migration) ─────────────────────────────────────────
DO $$
DECLARE
  v_linked INT := 0;
BEGIN
  WITH ws AS (
    SELECT wb.id, wb.creator_id, wb.champion,
           (SELECT array_agg(format('%s:%s', i.elem->>'Id',
                                    COALESCE(i.elem->>'Count', '1'))
                             ORDER BY b.ord, i.ord)
              FROM jsonb_array_elements(wb.items) WITH ORDINALITY AS b(blk, ord)
              CROSS JOIN LATERAL
                   jsonb_array_elements(b.blk->'Items') WITH ORDINALITY AS i(elem, ord)
             WHERE jsonb_typeof(b.blk->'Items') = 'array') AS fp
      FROM public.workshop_builds wb
     WHERE wb.source_build_id IS NULL
       AND wb.creator_id IS NOT NULL
       AND jsonb_typeof(wb.items) = 'array'
  ),
  ib AS (
    SELECT src.id, src.user_id, src.champ->>'name' AS champion,
           (SELECT array_agg(format('%s:%s', i.elem->>'itemId',
                                    COALESCE(i.elem->>'count', '1'))
                             ORDER BY b.ord, i.ord)
              FROM jsonb_array_elements(src.blocks) WITH ORDINALITY AS b(blk, ord)
              CROSS JOIN LATERAL
                   jsonb_array_elements(b.blk->'items') WITH ORDINALITY AS i(elem, ord)
             WHERE jsonb_typeof(b.blk->'items') = 'array') AS fp
      FROM public.item_builds src
     WHERE jsonb_typeof(src.blocks) = 'array'
       AND NOT EXISTS (SELECT 1 FROM public.workshop_builds w2
                        WHERE w2.source_build_id = src.id)
  ),
  paires AS (
    SELECT ws.id AS ws_id, ib.id AS ib_id
      FROM ws JOIN ib
        ON ib.user_id = ws.creator_id AND ib.champion = ws.champion AND ib.fp = ws.fp
     WHERE ws.fp IS NOT NULL
  ),
  non_ambigues AS (
    SELECT ws_id, ib_id FROM paires p
     WHERE (SELECT count(*) FROM paires x WHERE x.ws_id = p.ws_id) = 1
       AND (SELECT count(*) FROM paires x WHERE x.ib_id = p.ib_id) = 1
  ),
  maj AS (
    UPDATE public.workshop_builds wb SET source_build_id = na.ib_id
      FROM non_ambigues na
     WHERE wb.id = na.ws_id AND wb.source_build_id IS NULL
    RETURNING wb.id
  )
  SELECT count(*) INTO v_linked FROM maj;
  RAISE NOTICE 'backfill : % lien(s) posé(s)', v_linked;
END;
$$;

-- ── ASSERTIONS ───────────────────────────────────────────────────────────────

INSERT INTO res SELECT 1,'S1_match_parfait',
  CASE WHEN source_build_id = '11111111-1111-1111-1111-111111111111'
       THEN 'OK : lié au bon build source'
       ELSE 'ECHEC : lien=' || COALESCE(source_build_id::text,'NULL') END
  FROM public.workshop_builds WHERE champion='Ahri' AND titre='Ahri poke';

INSERT INTO res SELECT 2,'S2_champion_different',
  CASE WHEN source_build_id IS NULL THEN 'OK : non lié' ELSE 'ECHEC : lié à tort' END
  FROM public.workshop_builds WHERE champion='Lux';

INSERT INTO res SELECT 3,'S3_contenu_different',
  CASE WHEN source_build_id IS NULL THEN 'OK : non lié' ELSE 'ECHEC : lié à tort' END
  FROM public.workshop_builds WHERE titre='Ahri autre';

-- T4 — l'index unique partiel refuse deux publications sur le même build source
INSERT INTO res VALUES (4,'T4_unicite_index','(non déclenché)');
DO $t4$
BEGIN
  UPDATE public.workshop_builds
     SET source_build_id='11111111-1111-1111-1111-111111111111'
   WHERE champion='Lux';
  UPDATE res SET detail='ECHEC : doublon de lien accepté' WHERE test='T4_unicite_index';
EXCEPTION WHEN unique_violation THEN
  UPDATE res SET detail='OK : unique_violation levée' WHERE test='T4_unicite_index';
END;
$t4$;

-- T5 — idempotence : le backfill ne pose pas de lien en double s'il est rejoué
INSERT INTO res SELECT 5,'T5_idempotence',
  format('%s lien(s) au total (attendu 1)', count(source_build_id))
  FROM public.workshop_builds;

-- T6 — ON DELETE SET NULL : la publication SURVIT à la suppression du build source
DO $t6$
DECLARE v_apres INT; v_null INT;
BEGIN
  DELETE FROM public.item_builds WHERE id='11111111-1111-1111-1111-111111111111';
  SELECT count(*), count(*)-count(source_build_id) INTO v_apres, v_null
    FROM public.workshop_builds;
  INSERT INTO res VALUES (6,'T6_on_delete_set_null',
    format('publications survivantes=%s dont lien passé à NULL=%s', v_apres, v_null));
END;
$t6$;

SELECT test, detail FROM res ORDER BY ordre;

ROLLBACK;
