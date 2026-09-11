-- ============================================================================
-- Retrait complet du module PRAC — décision HORTAL, 2026-09-11
-- ============================================================================
--
-- CONTEXTE
-- PRAC (prac.wyrm-forge.com) est l'outil interne de suivi de performances de
-- joueurs : un administrateur demande à suivre un joueur, le joueur reçoit un
-- e-mail, et RIEN n'est enregistré tant qu'il n'a pas accepté. Cinq lots livrés,
-- module fonctionnel. Il n'est pas utilisé et ne le sera pas en l'état.
--
-- ⚠️ CONTRAIREMENT AUX TOURNOIS, CETTE MIGRATION DÉTRUIT DES DONNÉES RÉELLES.
-- Le module a servi exactement une fois, le 2026-07-01 :
--   • `tracked_players`            1 ligne — un joueur TIERS (compte externe,
--                                  role = user) dont le consentement est
--                                  `accepted` (demandé 17:52, accepté 18:51) ;
--   • `prac_notification_log`      1 ligne — son adresse e-mail EN CLAIR
--                                  (colonne `recipient`) et l'id du message Resend ;
--   • `prac_admins`                2 lignes — les comptes administrateurs ;
--   • `tracked_matches`            0 ligne — aucune partie n'a jamais été suivie ;
--   • `tracked_match_participants` 0 ligne.
--
-- Les lignes concernées ont été EXPORTÉES avant purge, hors du dépôt Git, à la
-- demande de HORTAL qui souhaite prévenir la personne et garder une trace :
--     C:\Users\revan\source\repos\prac-export-avant-purge-2026-09-11.json
-- Ce fichier contient des données personnelles : il ne doit être ni commité,
-- ni partagé, et devra être détruit une fois la personne prévenue.
--
-- VÉRIFICATIONS FAITES AVANT ÉCRITURE
--   • App WPF   : aucune dépendance. Une seule occurrence dans le dépôt bureau,
--                 un commentaire de `TargetPriority.cs` citant une convention de
--                 calcul de KDA. La règle d'or « la base est partagée » tient.
--   • `is_prac_admin` : appelée UNIQUEMENT par d'autres fonctions PRAC, toutes
--                 droppées ici. Aucune policy d'une table non-PRAC ne s'y adosse.
--   • Storage   : le module n'a AUCUN bucket. Rien à faire côté API Storage,
--                 contrairement au retrait des tournois.
--
-- PARTI PRIS : identique à `20260911000001_drop_tournaments` — `IF EXISTS`
-- partout (rejouable), JAMAIS `CASCADE` (une dépendance oubliée doit faire
-- échouer la migration, pas disparaître avec l'objet qui la portait), et l'ordre
-- ci-dessous est celui des dépendances.
-- ============================================================================

-- ── 1. Triggers ─────────────────────────────────────────────────────────────
-- Explicitement, avant leurs tables. Un trigger ne survit pas à sa table, mais
-- les nommer ici documente le périmètre et fait échouer la migration si l'un
-- d'eux a été renommé entre-temps sans que ce fichier suive.
--
-- `prac_notify_tracked_players` est le webhook : c'est LUI qui appelait l'Edge
-- Function `prac-notify` à chaque demande de suivi.

DROP TRIGGER IF EXISTS trg_tracked_players_updated_at       ON public.tracked_players;
DROP TRIGGER IF EXISTS trg_tracked_players_purge_on_revoke  ON public.tracked_players;
DROP TRIGGER IF EXISTS prac_notify_tracked_players          ON public.tracked_players;
DROP TRIGGER IF EXISTS trg_prac_notification_log_updated_at ON public.prac_notification_log;

-- ── 2. Tables ───────────────────────────────────────────────────────────────
-- Ordre des clés étrangères, de l'enfant vers le parent :
--   tracked_match_participants → tracked_matches
--   tracked_matches            → tracked_players
--   prac_notification_log      → tracked_players
--   tracked_players            → profiles (conservée, évidemment)
--   prac_admins                → aucune FK entrante
--
-- Les trois policies du module (`tp_select`, `tm_select`, `pa_select_self`)
-- disparaissent avec leurs tables : une policy n'existe pas indépendamment de
-- la table qu'elle protège, il n'y a donc rien à dropper pour elles.

DROP TABLE IF EXISTS public.tracked_match_participants;
DROP TABLE IF EXISTS public.tracked_matches;
DROP TABLE IF EXISTS public.prac_notification_log;
DROP TABLE IF EXISTS public.tracked_players;
DROP TABLE IF EXISTS public.prac_admins;

-- ── 3. Fonctions ────────────────────────────────────────────────────────────
-- Après les tables : leurs corps référencent les tables, et plusieurs servaient
-- de garde aux policies qui viennent de disparaître.
--
-- Signatures explicites — obligatoire dès qu'un nom peut être surchargé, et
-- c'est ici le piège principal : une signature erronée ferait de `IF EXISTS` un
-- silence au lieu d'une suppression. Elles ont été relevées sur les définitions
-- les plus récentes (`20260815000003_versioning_prac_functions` pour celles qui
-- ont été re-versionnées).

DROP FUNCTION IF EXISTS public.prac_commit_tracked_matches(uuid, uuid, jsonb);
DROP FUNCTION IF EXISTS public.prac_notify_claim(uuid, timestamptz, text, text);
DROP FUNCTION IF EXISTS public.prac_visible_match_ids(uuid, uuid);
DROP FUNCTION IF EXISTS public.prac_search_profiles(text, int);
DROP FUNCTION IF EXISTS public.prac_player_stats(uuid);
DROP FUNCTION IF EXISTS public.prac_top_winrate(int);
DROP FUNCTION IF EXISTS public.prac_caller_in_match(uuid);
DROP FUNCTION IF EXISTS public.prac_caller_puuid();
DROP FUNCTION IF EXISTS public.prac_related_players();
DROP FUNCTION IF EXISTS public.respond_consent(text);
DROP FUNCTION IF EXISTS public.request_tracking(uuid);
DROP FUNCTION IF EXISTS public.remove_tracking(uuid);
DROP FUNCTION IF EXISTS public.fn_purge_tracked_matches_on_revoke();

-- La fonction du webhook, séparée des précédentes parce qu'elle n'appartient pas
-- à la même couche : elle lisait le secret dans Vault et appelait l'Edge
-- Function `prac-notify` par `net.http_post`.
DROP FUNCTION IF EXISTS public.prac_notify_webhook();

-- EN DERNIER : toutes les fonctions ci-dessus l'appelaient.
DROP FUNCTION IF EXISTS public.is_prac_admin(uuid);

-- ── 4. Secret Vault ─────────────────────────────────────────────────────────
-- `prac_webhook_secret` portait l'en-tête `X-Internal-Token` du webhook.
--
-- ⚠️ Encapsulé dans un bloc d'exception, et c'est le SEUL endroit de cette
-- migration qui l'est. Raison : `vault.secrets` appartient à un rôle Supabase,
-- pas à `postgres`. Le retrait des tournois a appris la leçon à nos dépens —
-- un `DELETE` refusé sur un schéma géré par la plateforme (là, `storage`) fait
-- échouer et annuler TOUTE la migration. Faire tomber la suppression de cinq
-- tables sur un secret de webhook serait un mauvais échange.
--
-- Ce n'est pas un échec silencieux pour autant : le refus est remonté en
-- WARNING dans la sortie de `supabase db push`, avec la marche à suivre.

DO $$
BEGIN
  DELETE FROM vault.secrets WHERE name = 'prac_webhook_secret';
EXCEPTION
  WHEN insufficient_privilege OR undefined_table THEN
    RAISE WARNING 'Secret Vault « prac_webhook_secret » NON supprimé (%). '
                  'À retirer à la main : Dashboard → Project Settings → Vault.',
                  SQLERRM;
END $$;

-- ── 5. Kill switch ──────────────────────────────────────────────────────────
-- La ligne du catalogue de feature flags. Elle pilotait l'accès à /prac ; sans
-- le module, elle n'affiche plus qu'un interrupteur sans câble dans le panneau
-- d'administration.

DELETE FROM public.app_settings WHERE key = 'prac_enabled';

-- ============================================================================
-- CE QUE CETTE MIGRATION NE FAIT PAS — à traiter hors SQL
-- ============================================================================
--   • Edge Functions `prac-track` et `prac-notify` : supprimées du projet par
--     `supabase functions delete`. Retirer les dossiers du dépôt ne les
--     désinstalle PAS — le workflow de déploiement ne sait que déployer.
--   • Sous-domaine `prac.wyrm-forge.com` : enregistrement DNS (Cloudflare),
--     domaine côté Vercel, et variable d'environnement `NEXT_PUBLIC_PRAC_HOST`.
--   • Secret `PRAC_WEBHOOK_SECRET` dans les variables des Edge Functions.
--   • Compte Resend : `prac-notify` en était le seul consommateur côté code.
-- ============================================================================
