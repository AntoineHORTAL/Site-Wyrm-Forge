-- Lot 1 — Lien item_builds ↔ workshop_builds (toggle Publier / Dépublier)
--
-- Contexte : publier un build crée une COPIE indépendante dans workshop_builds,
-- sans référence à la ligne item_builds d'origine. Impossible de savoir si un
-- build personnel donné est déjà publié → aucun toggle possible côté site.
--
-- Sens du lien (FK portée par workshop_builds, pas l'inverse) :
--   1. workshop_builds est en lecture publique (wb_select_public USING true)
--      alors que item_builds est owner-scopé (user_id = auth.uid()). Le lien doit
--      rester lisible depuis la page Workshop → il vit du côté public.
--   2. ON DELETE SET NULL exprime la règle métier voulue : supprimer son build
--      personnel ne retire PAS la publication de la communauté (elle porte des
--      ♥/↓ et a pu être importée par d'autres). La publication survit, orpheline,
--      et reste retirable depuis la page Workshop via creator_id.
--
-- ⚠️ ON DELETE SET NULL se déclenche à la suppression de la ligne ITEM_BUILDS.
-- Le bouton « Retirer » (page Workshop) fait un DELETE sur WORKSHOP_BUILDS : la
-- ligne entière disparaît, la contrainte n'intervient jamais dans ce sens. Aucun
-- code applicatif supplémentaire n'est requis — mais ce n'est pas la contrainte
-- qui l'assure, c'est la disparition de la ligne porteuse.
--
-- Migration idempotente (IF NOT EXISTS + backfill borné aux NULL) : rejouable.

-- ── 1. Colonne ───────────────────────────────────────────────────────────────

ALTER TABLE public.workshop_builds
  ADD COLUMN IF NOT EXISTS source_build_id UUID;

COMMENT ON COLUMN public.workshop_builds.source_build_id IS
  'Build item_builds d''origine de cette publication. NULL = lien inconnu '
  '(publication antérieure au lien, publiée hors ligne, ou build source supprimé).';

-- ── 2. Contrainte FK ─────────────────────────────────────────────────────────
-- ADD CONSTRAINT n'a pas de IF NOT EXISTS en Postgres → garde explicite.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE  conname  = 'fk_workshop_builds_source_build'
      AND  conrelid = 'public.workshop_builds'::regclass
  ) THEN
    ALTER TABLE public.workshop_builds
      ADD CONSTRAINT fk_workshop_builds_source_build
      FOREIGN KEY (source_build_id)
      REFERENCES  public.item_builds(id)
      ON DELETE SET NULL;
  END IF;
END;
$$;

-- ── 3. Unicité — une publication vivante au plus par build source ────────────
-- Rend « Dépublier » déterministe : sans ça, deux publications liées au même
-- build personnel rendraient l'action ambiguë (laquelle retirer ?).
-- Index partiel : les NULL (lien inconnu) ne se gênent pas entre eux.

CREATE UNIQUE INDEX IF NOT EXISTS uq_workshop_builds_source
  ON public.workshop_builds (source_build_id)
  WHERE source_build_id IS NOT NULL;

-- ── 4. Backfill best-effort des publications existantes ──────────────────────
--
-- Clé de rapprochement : propriétaire + champion + empreinte de contenu.
--
-- ⚠️ Les RUNES sont VOLONTAIREMENT EXCLUES de la clé, contrairement au cadrage
-- initial (champion + items + runes). Raison factuelle, vérifiée sur le remote :
-- ItemBuildSyncService.ModelToRow (WPF) n'envoie AUCUN champ runes vers
-- item_builds (SupabaseBuildRow n'a pas de propriété runes) → item_builds.runes
-- est NULL sur 100 % des builds synchronisés depuis l'app, qui sont précisément
-- ceux susceptibles d'avoir été publiés. Inclure les runes ferait échouer tous
-- les rapprochements sans exception.
--
-- ⚠️ Les deux JSON ne sont PAS comparables directement (vérifié sur le remote) :
--   workshop_builds.items : [{ Id, Title, Items:[{ Id(number), Name, IconUrl,
--                              Gold, Count, Tags, Stats, Description, From, Into }] }]
--                           → PascalCase, modèle C# BuildBlock brut (PublishAsync
--                             sérialise sans PropertyNamingPolicy).
--   item_builds.blocks    : [{ id, name, items:[{ itemId(string), name, image,
--                              gold, count }] }]
--                           → camelCase, format « slim » partagé site ↔ WPF.
-- D'où l'empreinte NORMALISÉE ci-dessous (séquence ordonnée « idItem:quantité »),
-- seule forme extractible des deux côtés. Une égalité jsonb brute ne matcherait
-- jamais rien.
--
-- Garde d'ambiguïté : on ne lie QUE les paires 1↔1 (exactement un candidat de
-- chaque côté). Un rapprochement multiple est laissé NULL — mieux vaut un lien
-- absent (l'utilisateur revoit « Publier ») qu'un lien faux (le toggle piloterait
-- la publication de quelqu'un d'autre).
--
-- N'écrase jamais un lien existant (WHERE source_build_id IS NULL) → rejouable.
-- N'échoue jamais : aucun RAISE EXCEPTION, seulement des RAISE NOTICE.

DO $$
DECLARE
  v_linked     INT := 0;
  v_remaining  INT := 0;
  r            RECORD;
BEGIN
  WITH ws AS (
    SELECT wb.id,
           wb.creator_id,
           wb.champion,
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
    SELECT src.id,
           src.user_id,
           src.champ->>'name' AS champion,
           (SELECT array_agg(format('%s:%s', i.elem->>'itemId',
                                    COALESCE(i.elem->>'count', '1'))
                             ORDER BY b.ord, i.ord)
              FROM jsonb_array_elements(src.blocks) WITH ORDINALITY AS b(blk, ord)
              CROSS JOIN LATERAL
                   jsonb_array_elements(b.blk->'items') WITH ORDINALITY AS i(elem, ord)
             WHERE jsonb_typeof(b.blk->'items') = 'array') AS fp
      FROM public.item_builds src
     WHERE jsonb_typeof(src.blocks) = 'array'
       -- Un build déjà lié à une autre publication n'est plus candidat
       -- (l'index unique le refuserait de toute façon).
       AND NOT EXISTS (SELECT 1 FROM public.workshop_builds w2
                        WHERE w2.source_build_id = src.id)
  ),
  paires AS (
    SELECT ws.id AS ws_id, ib.id AS ib_id
      FROM ws
      JOIN ib
        ON ib.user_id  = ws.creator_id
       AND ib.champion = ws.champion
       AND ib.fp       = ws.fp
     WHERE ws.fp IS NOT NULL          -- un build vide ne prouve rien
  ),
  -- Paires strictement 1↔1 : un seul candidat de chaque côté.
  non_ambigues AS (
    SELECT ws_id, ib_id
      FROM paires p
     WHERE (SELECT count(*) FROM paires x WHERE x.ws_id = p.ws_id) = 1
       AND (SELECT count(*) FROM paires x WHERE x.ib_id = p.ib_id) = 1
  ),
  maj AS (
    UPDATE public.workshop_builds wb
       SET source_build_id = na.ib_id
      FROM non_ambigues na
     WHERE wb.id = na.ws_id
       AND wb.source_build_id IS NULL
    RETURNING wb.id
  )
  SELECT count(*) INTO v_linked FROM maj;

  SELECT count(*) INTO v_remaining
    FROM public.workshop_builds
   WHERE source_build_id IS NULL;

  RAISE NOTICE 'Backfill workshop→item_builds : % publication(s) liée(s), % sans lien.',
               v_linked, v_remaining;

  -- Journalisation des cas non résolus (audit, sans échec de migration).
  FOR r IN
    SELECT id, titre, champion, creator_id
      FROM public.workshop_builds
     WHERE source_build_id IS NULL
     ORDER BY created_at
  LOOP
    RAISE NOTICE '  non résolu : id=% titre=% champion=% creator=%',
                 r.id, r.titre, r.champion, r.creator_id;
  END LOOP;
END;
$$;
