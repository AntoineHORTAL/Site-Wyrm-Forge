-- Tests SQL — item_builds.updated_at (migration 20261020000001) : colonne, trigger, et
-- les deux chemins d'écriture réels (UPDATE partiel du site, UPSERT PostgREST de l'app).
--
-- ════════════════════════════════════════════════════════════════════════════
--  COMMENT LANCER
-- ════════════════════════════════════════════════════════════════════════════
--   1. SQL Editor sur le projet **TEST** (gyjcdswpybrhesarompg), « Wyrm Forge Test ».
--      ⚠️ PAS la prod tant que la migration n'y est pas validée.
--   2. Coller CE FICHIER EN ENTIER, exécuter, lire la colonne `r` : tout doit être `✅`.
--      `ROLLBACK` final → rien ne persiste (build semé, trigger désactivé, tout).
--   (En CLI : `supabase db query --linked -f <ce fichier>` depuis un dossier lié à TEST.)
--
-- ⚠️ Dans une transaction, now() est FIGÉ à son début : un UPDATE fait ici produit
-- exactement now(). C'est ce qui rend « le trigger a posé la date serveur » observable :
-- on part d'une date ancienne (posée trigger désactivé), et on vérifie qu'on obtient now().

BEGIN;

CREATE TEMP TABLE t_res (ordre int, test text, attendu text, obtenu text, ok boolean) ON COMMIT DROP;

-- T1 — colonne : timestamptz, NOT NULL, DEFAULT now()
INSERT INTO t_res
SELECT 1, 'T1 — colonne updated_at timestamptz NOT NULL DEFAULT now()',
       'timestamp with time zone / NO / now()',
       coalesce(max(format('%s / %s / %s', data_type, is_nullable, column_default)), '(absente)'),
       coalesce(bool_and(data_type = 'timestamp with time zone' AND is_nullable = 'NO'
                         AND column_default = 'now()'), false)
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'item_builds' AND column_name = 'updated_at';

-- T2 — trigger BEFORE UPDATE → fn_set_updated_at (la fonction partagée, pas une copie)
INSERT INTO t_res
SELECT 2, 'T2 — trg_item_builds_updated_at BEFORE UPDATE → fn_set_updated_at',
       'fn_set_updated_at / BEFORE UPDATE / ROW',
       coalesce(max(format('%s / %s', p.proname, pg_get_triggerdef(t.oid))), '(absent)'),
       coalesce(bool_and(p.proname = 'fn_set_updated_at'
         AND pg_get_triggerdef(t.oid) LIKE '%BEFORE UPDATE ON public.item_builds FOR EACH ROW%'), false)
  FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
 WHERE t.tgrelid = 'public.item_builds'::regclass AND t.tgname = 'trg_item_builds_updated_at';

-- T3 — les lignes existantes ont été remplies par la migration
INSERT INTO t_res
SELECT 3, 'T3 — aucune ligne existante sans updated_at', '0',
       count(*) FILTER (WHERE updated_at IS NULL)::text,
       count(*) FILTER (WHERE updated_at IS NULL) = 0
  FROM public.item_builds;

DO $t$
DECLARE
  v_user uuid;
  v_id   uuid := gen_random_uuid();
  v_ts   timestamptz;
BEGIN
  SELECT id INTO v_user FROM auth.users ORDER BY created_at LIMIT 1;

  -- T4 — INSERT sans updated_at (forme exacte du site) : le DEFAULT s'applique
  INSERT INTO public.item_builds (id, user_id, name) VALUES (v_id, v_user, '__test_updated_at');
  SELECT updated_at INTO v_ts FROM public.item_builds WHERE id = v_id;
  INSERT INTO t_res VALUES (4, 'T4 — INSERT sans la colonne : DEFAULT now()', 'now()', v_ts::text, v_ts = now());

  -- Date ancienne posée trigger DÉSACTIVÉ : seul moyen de partir d'une valeur ≠ now().
  ALTER TABLE public.item_builds DISABLE TRIGGER trg_item_builds_updated_at;
  UPDATE public.item_builds SET updated_at = '2000-01-01T00:00:00Z' WHERE id = v_id;
  ALTER TABLE public.item_builds ENABLE TRIGGER trg_item_builds_updated_at;

  -- T5 — UPDATE partiel sans updated_at (forme exacte du site `update(payload)`)
  UPDATE public.item_builds SET name = '__test_updated_at_2' WHERE id = v_id;
  SELECT updated_at INTO v_ts FROM public.item_builds WHERE id = v_id;
  INSERT INTO t_res VALUES (5, 'T5 — UPDATE partiel : le trigger pose la date serveur', 'now()', v_ts::text, v_ts = now());

  -- T6 — une date ENVOYÉE par un client est écrasée : la date reste celle du serveur
  ALTER TABLE public.item_builds DISABLE TRIGGER trg_item_builds_updated_at;
  UPDATE public.item_builds SET updated_at = '2000-01-01T00:00:00Z' WHERE id = v_id;
  ALTER TABLE public.item_builds ENABLE TRIGGER trg_item_builds_updated_at;
  UPDATE public.item_builds SET updated_at = '1999-01-01T00:00:00Z' WHERE id = v_id;
  SELECT updated_at INTO v_ts FROM public.item_builds WHERE id = v_id;
  INSERT INTO t_res VALUES (6, 'T6 — updated_at fourni par le client : écrasé', 'now()', v_ts::text, v_ts = now());

  -- T7 — UPSERT (forme de l'app, PostgREST resolution=merge-duplicates) déclenche le trigger
  ALTER TABLE public.item_builds DISABLE TRIGGER trg_item_builds_updated_at;
  UPDATE public.item_builds SET updated_at = '2000-01-01T00:00:00Z' WHERE id = v_id;
  ALTER TABLE public.item_builds ENABLE TRIGGER trg_item_builds_updated_at;
  INSERT INTO public.item_builds (id, user_id, name) VALUES (v_id, v_user, '__test_upsert')
    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;
  SELECT updated_at INTO v_ts FROM public.item_builds WHERE id = v_id;
  INSERT INTO t_res VALUES (7, 'T7 — UPSERT ON CONFLICT DO UPDATE : trigger déclenché', 'now()', v_ts::text, v_ts = now());
END
$t$;

-- T8 — la RLS n'a pas bougé (migration purement additive : une seule policy, inchangée)
INSERT INTO t_res
SELECT 8, 'T8 — policies inchangées', '1 policy « Users manage own builds »',
       count(*)::text || ' : ' || coalesce(string_agg(policyname, ', '), ''),
       count(*) = 1 AND bool_and(policyname = 'Users manage own builds')
  FROM pg_policies WHERE schemaname = 'public' AND tablename = 'item_builds';

SELECT ordre, CASE WHEN ok THEN '✅' ELSE '❌' END AS r, test, attendu, obtenu
  FROM t_res ORDER BY ordre;

ROLLBACK;
