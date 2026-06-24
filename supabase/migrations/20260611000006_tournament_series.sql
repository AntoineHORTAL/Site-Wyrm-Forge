-- Migration 20260611000006 : Colonne series + slugs réservés pour le module Tournois.
--
-- 1. Ajoute `series TEXT NULL` sur la table tournaments.
--    Permet de regrouper plusieurs éditions sous une même bannière (ex: 'XV2').
--    NULL = tournoi ponctuel non rattaché à une série.
--
-- 2. Index (series, starts_at DESC) pour les requêtes de listing par série
--    (page vitrine, palmarès, édition en cours).
--
-- 3. Contrainte CHECK chk_slug_not_reserved : bloque les slugs qui correspondent
--    à une route applicative ou un nom de série connu.
--    Slugs réservés (comparaison lower()) :
--      'xv2'             — nom de série, route /XV2
--      'amis'            — route /amis (tournois entre amis, feature prévue)
--      'quotidiens'      — route /quotidiens (tournois quotidiens)
--      'hebdo'           — route /hebdo (tournois hebdomadaires)
--      'road-to-worlds'  — route /road-to-worlds (série saison)
--      'admin'           — panneau d'administration global /admin
--    Extension future : ajouter un slug ici avant de créer la route correspondante.
--
-- 4. Backfill : un SELECT de prévisualisation est affiché avant l'UPDATE.
--    Le DBA voit les lignes candidates dans les logs de migration AVANT modification.
--    series = 'XV2' est appliqué sur les tournois dont le slug ou le nom contient
--    'xv2' (insensible à la casse) et qui n'ont pas encore de valeur series.

-- ── 1. Colonne series ─────────────────────────────────────────────────────────

ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS series TEXT;

COMMENT ON COLUMN public.tournaments.series IS
  'Nom de la série dont ce tournoi fait partie (ex : ''XV2''). NULL = édition ponctuelle.';

-- ── 2. Index (series, starts_at DESC) ────────────────────────────────────────
-- Partiel sur series IS NOT NULL : les tournois sans série sont exclus de l'index,
-- ce qui le garde petit et pertinent pour les requêtes de vitrine.

CREATE INDEX IF NOT EXISTS idx_tournaments_series_date
  ON public.tournaments (series, starts_at DESC)
  WHERE series IS NOT NULL;

-- ── 3. Contrainte de slugs réservés (liste consolidée) ───────────────────────
-- Erreur SQL levée sur violation : check_violation (code 23514).
-- Mappable en HTTP 400 côté Edge Function (tournament-admin / tournament-register).

ALTER TABLE public.tournaments
  ADD CONSTRAINT chk_slug_not_reserved
  CHECK (
    lower(slug) NOT IN (
      'xv2',            -- série XV2
      'amis',           -- tournois entre amis
      'quotidiens',     -- tournois quotidiens
      'hebdo',          -- tournois hebdomadaires
      'road-to-worlds', -- série saison Worlds
      'admin'           -- panneau d'administration
    )
  );

-- ── 4. Prévisualisation du backfill (AVANT l'UPDATE) ─────────────────────────
-- Affiche les lignes qui SERAIENT touchées par le backfill.
-- Le DBA peut interrompre ici si le résultat est inattendu.

DO $$
DECLARE
  r RECORD;
  v_count INT := 0;
BEGIN
  RAISE NOTICE '── Prévisualisation backfill XV2 ───────────────────────────────';
  RAISE NOTICE '   Colonnes : id | slug | name | series_actuel';

  FOR r IN
    SELECT id, slug, name, series
      FROM public.tournaments
     WHERE series IS NULL
       AND (lower(slug) LIKE '%xv2%' OR lower(name) LIKE '%xv2%')
     ORDER BY created_at
  LOOP
    RAISE NOTICE '   %  |  %  |  %  |  %', r.id, r.slug, r.name, COALESCE(r.series, 'NULL');
    v_count := v_count + 1;
  END LOOP;

  IF v_count = 0 THEN
    RAISE NOTICE '   (aucune ligne candidate — backfill sera un no-op)';
  ELSE
    RAISE NOTICE '   → % ligne(s) seront mise(s) à jour avec series = ''XV2''.', v_count;
  END IF;

  RAISE NOTICE '────────────────────────────────────────────────────────────────';
END;
$$;

-- ── 5. Backfill ───────────────────────────────────────────────────────────────
-- Appliqué APRÈS la prévisualisation ci-dessus.
-- Idempotent : ne touche que les lignes où series IS NULL.

UPDATE public.tournaments
   SET series = 'XV2'
 WHERE series IS NULL
   AND (lower(slug) LIKE '%xv2%' OR lower(name) LIKE '%xv2%');

-- Confirmation post-UPDATE :
DO $$
DECLARE
  v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count
    FROM public.tournaments
   WHERE series = 'XV2';

  RAISE NOTICE 'Backfill terminé : % tournoi(s) portent désormais series=''XV2''.', v_count;
END;
$$;
