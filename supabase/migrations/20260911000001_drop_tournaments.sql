-- ============================================================================
-- Retrait complet du module Tournois — décision HORTAL, 2026-09-11
-- ============================================================================
--
-- CONTEXTE
-- La route /tournois a été supprimée du site le 2026-09-03 (suppression nette,
-- 404, cf. src/proxy.ts). Mais rien n'avait été retiré EN DESSOUS : les deux
-- Edge Functions `tournament-register` et `tournament-admin` sont restées
-- déployées et appelables huit jours durant, et `tournament-register` acceptait
-- des inscriptions ANONYMES (verify_jwt = false) qui écrivaient des pseudos
-- Discord en base via service_role. L'audit légal du 2026-09-10 a relevé le
-- décalage : un traitement de données personnelles vivant et joignable, dont la
-- déclaration venait d'être retirée de la politique de confidentialité.
--
-- Les Edge Functions ont été supprimées du dépôt ET du projet Supabase. Cette
-- migration retire ce qu'elles adressaient.
--
-- VÉRIFICATIONS FAITES AVANT ÉCRITURE
--   • Site       : aucune référence à ces tables hors module tournois.
--   • App WPF    : aucun accès données. Le dépôt Logiciel-Assistant-LOL ne porte
--                  qu'un bouton de navigation DÉSACTIVÉ (IsEnabled="False") et
--                  des libellés i18n. La règle d'or « la base est partagée »
--                  est donc respectée : rien ne casse côté bureau.
--   • Contenu    : tables vides au moment du drop — 0 tournoi, 0 équipe,
--                  0 match, 0 joueur (compté via PostgREST sous la clé anon,
--                  dont les policies SELECT sont `USING (true)` sur
--                  tournament_teams et matches). Seule `tournament_series`
--                  portait 1 ligne de configuration, sans donnée personnelle.
--   • Écailles   : `chk_ledger_source` autorise la valeur 'tournament'. Elle est
--                  VOLONTAIREMENT CONSERVÉE : des lignes de ledger historiques
--                  peuvent la porter, et retirer une valeur d'un CHECK casserait
--                  la table au premier INSERT rejouant l'historique. Le libellé
--                  correspondant reste dans les dictionnaires du site.
--
-- PARTI PRIS : `IF EXISTS` partout (la migration est rejouable), mais JAMAIS
-- `CASCADE`. Une dépendance oubliée doit faire ÉCHOUER cette migration, pas
-- disparaître en silence avec l'objet qui la portait. L'ordre ci-dessous est
-- donc l'ordre des dépendances, du plus dépendant au plus dépendu.
-- ============================================================================

-- ── 1. Policies Storage ─────────────────────────────────────────────────────
-- EN PREMIER, et ce n'est pas cosmétique : ces trois policies appellent
-- `public.is_tournament_admin(...)`. Tant qu'elles existent, le DROP FUNCTION
-- de l'étape 7 échoue. C'est d'ailleurs le seul endroit où une dépendance
-- tournois sortait du schéma `public`.

DROP POLICY IF EXISTS tournament_heroes_read   ON storage.objects;
DROP POLICY IF EXISTS tournament_heroes_insert ON storage.objects;
DROP POLICY IF EXISTS tournament_heroes_update ON storage.objects;
DROP POLICY IF EXISTS tournament_heroes_delete ON storage.objects;

-- ── 2. Bucket Storage `tournament-heroes` — PAS ICI ─────────────────────────
--
-- Le bucket lui-même n'est PAS supprimé par cette migration, et ce n'est pas un
-- oubli : Supabase interdit désormais la suppression directe en SQL et renvoie
--
--     ERROR: Direct deletion from storage tables is not allowed.
--            Use the Storage API instead. (SQLSTATE 42501)
--
-- La première version de cette migration faisait `DELETE FROM storage.objects`
-- puis `DELETE FROM storage.buckets` ; elle a échoué à l'application et a été
-- intégralement annulée (les migrations tournent dans une transaction).
--
-- Le bucket est donc retiré HORS SQL, par l'API Storage :
--     POST   /storage/v1/object/list/tournament-heroes   (inventaire)
--     DELETE /storage/v1/object/tournament-heroes/<nom>  (purge)
--     DELETE /storage/v1/bucket/tournament-heroes        (suppression)
-- le tout sous clé service_role. Fait le 2026-09-11.
--
-- ⚠️ Le bucket N'ÉTAIT PAS vide : il contenait une affiche PNG de 2,3 Mo déposée
-- le 2026-06-13. Un inventaire mené sous la clé ANON avait pourtant renvoyé
-- « 0 objet » — il ne faut donc pas conclure d'un listing anon qu'un bucket est
-- vide, seule la clé service_role donne l'inventaire réel. Aucune donnée
-- personnelle dans ce fichier (visuel de tournoi), mais la leçon vaut pour les
-- prochains retraits de module.
--
-- Ce qui reste du ressort du SQL, c'est l'étape 1 ci-dessus : les policies sont
-- des objets de base de données ordinaires, leur DROP passe sans restriction.

-- ── 3. Publication Realtime ─────────────────────────────────────────────────
-- `public.matches` avait été ajoutée à `supabase_realtime` (migration
-- 20260611000004) pour que le bracket se mette à jour en direct. Postgres
-- retirerait la table de la publication tout seul au DROP TABLE, mais on le
-- fait explicitement : `ALTER PUBLICATION … DROP TABLE` lève si la table n'en
-- est pas membre, d'où le garde plutôt qu'un appel sec.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename  = 'matches'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.matches;
  END IF;
END $$;

-- ── 4. Vues ─────────────────────────────────────────────────────────────────
-- Avant les tables qu'elles lisent.

DROP VIEW IF EXISTS public.tournament_standings;
DROP VIEW IF EXISTS public.tournament_players_public;

-- ── 5. Fonctions métier ─────────────────────────────────────────────────────
-- Avant les tables : leur corps référence les tables, et une fonction orpheline
-- qui survivrait au drop échouerait à l'exécution au lieu de ne pas exister.
-- Signatures explicites (Postgres l'exige dès qu'un nom peut être surchargé).

DROP FUNCTION IF EXISTS public.seed_bracket(uuid);
DROP FUNCTION IF EXISTS public.report_match_result(uuid, uuid);
DROP FUNCTION IF EXISTS public.undo_match_result(uuid);
DROP FUNCTION IF EXISTS public.start_match(uuid);

-- ── 6. Tables ───────────────────────────────────────────────────────────────
-- Ordre des clés étrangères, de l'enfant vers le parent :
--   matches            → tournaments, tournament_teams (+ auto-référence)
--   tournament_players → tournament_teams
--   tournament_teams   → tournaments
--   tournaments        → tournament_series
-- `tournament_admins` est isolée (table de rôles, aucune FK entrante).
-- Le trigger `trg_match_auto_status` disparaît avec `matches` : un trigger
-- n'existe pas indépendamment de sa table.

DROP TABLE IF EXISTS public.matches;
DROP TABLE IF EXISTS public.tournament_players;
DROP TABLE IF EXISTS public.tournament_teams;
DROP TABLE IF EXISTS public.tournaments;
DROP TABLE IF EXISTS public.tournament_series;
DROP TABLE IF EXISTS public.tournament_admins;

-- ── 7. Fonctions restantes ──────────────────────────────────────────────────
-- EN DERNIER : `is_tournament_admin` et `is_series_admin` étaient appelées par
-- les policies RLS des tables ci-dessus (disparues avec elles) et par les
-- policies Storage de l'étape 1. `fn_match_auto_status` portait le trigger de
-- `matches`. Aucune des trois n'est référencée ailleurs dans le dépôt.

DROP FUNCTION IF EXISTS public.fn_match_auto_status();
DROP FUNCTION IF EXISTS public.is_tournament_admin(uuid, uuid);
DROP FUNCTION IF EXISTS public.is_series_admin(uuid, uuid);
