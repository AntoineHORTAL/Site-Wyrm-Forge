-- Tests SQL — table prac_notification_log (lot 5C, migration 20260630000001).
--
-- ⚠️ Pas de stack Supabase locale dans cette session → tests conçus pour le SQL
-- Editor DISTANT (ou `supabase db query --linked`), exécutés UN PAR UN. Modèle
-- identique aux tests 3A/4A : chaque bloc autonome BEGIN … ROLLBACK (rien ne
-- persiste), rôle client simulé par SET LOCAL ROLE authenticated +
-- set_config('request.jwt.claims', …).
--
-- UUID RÉELS (vérifiés en base le 2026-06-28, réutilisés des tests 4A) :
--   • admin prac      : 35252895-c25d-4aba-b1a6-e5a5575a43ea  (Antoine HORTAL)
--   • non-admin tiers : 115c0a52-cc2a-46b4-9163-7e30aa95e3a1  (test_pseudo)
--   • dossier tracké  : 579851bf-b1af-4531-8800-e5df5c671ca5  (= tracked_players.id, status=accepted)
--
-- NB : les seeds prac_notification_log se font AVANT le SET LOCAL ROLE (la table
-- n'accorde aucun privilège client → l'INSERT doit se faire sous le rôle postgres
-- du SQL Editor), puis ROLLBACK.

-- ════════════════════════════════════════════════════════════════════════════
-- T1 — Idempotence : deux lignes même (tracked_player_id, requested_at, channel)
--      → la 2e viole la contrainte unique.
-- Attendu : ERROR  23505  duplicate key value violates unique constraint "uq_prac_notif"
-- ════════════════════════════════════════════════════════════════════════════
BEGIN;
  INSERT INTO public.prac_notification_log (tracked_player_id, requested_at, channel, recipient, status)
  VALUES
    ('579851bf-b1af-4531-8800-e5df5c671ca5','2026-06-30 12:00:00+00','email','joueur@test.dev','pending'),
    ('579851bf-b1af-4531-8800-e5df5c671ca5','2026-06-30 12:00:00+00','email','joueur@test.dev','pending');
ROLLBACK;

-- ════════════════════════════════════════════════════════════════════════════
-- T1b — Contraste (la clé autorise bien la réouverture) : même joueur mais
--       requested_at distinct (réouverture) OU channel distinct → PAS de conflit.
-- Attendu : inserted = 3
-- ════════════════════════════════════════════════════════════════════════════
BEGIN;
  INSERT INTO public.prac_notification_log (tracked_player_id, requested_at, channel)
  VALUES
    ('579851bf-b1af-4531-8800-e5df5c671ca5','2026-06-30 12:00:00+00','email'),   -- demande A, email
    ('579851bf-b1af-4531-8800-e5df5c671ca5','2026-06-30 13:00:00+00','email'),   -- réouverture (requested_at neuf)
    ('579851bf-b1af-4531-8800-e5df5c671ca5','2026-06-30 12:00:00+00','push');    -- demande A, autre canal
  SELECT count(*) AS inserted
    FROM public.prac_notification_log
   WHERE tracked_player_id = '579851bf-b1af-4531-8800-e5df5c671ca5';
ROLLBACK;

-- ════════════════════════════════════════════════════════════════════════════
-- T2 — service_role only : un client authenticated (même admin prac) NE PEUT PAS
--      lire la table. Pas de GRANT SELECT → permission denied (plus strict que
--      « 0 ligne » d'un filtrage RLS). On seede 1 ligne sous postgres pour prouver
--      que le refus n'est pas un artefact de table vide.
-- Attendu : ERROR  42501  permission denied for table prac_notification_log
-- ════════════════════════════════════════════════════════════════════════════
BEGIN;
  INSERT INTO public.prac_notification_log (tracked_player_id, requested_at, channel)
  VALUES ('579851bf-b1af-4531-8800-e5df5c671ca5','2026-06-30 12:00:00+00','email');

  SET LOCAL ROLE authenticated;
  SELECT set_config('request.jwt.claims', json_build_object('sub','35252895-c25d-4aba-b1a6-e5a5575a43ea','role','authenticated')::text, true);
  SELECT * FROM public.prac_notification_log;
ROLLBACK;

-- ════════════════════════════════════════════════════════════════════════════
-- T3 — Cascade : DELETE du dossier tracked_players supprime ses lignes de log
--      (FK ON DELETE CASCADE — couvre remove_tracking).
-- Attendu : before_delete = 1, after_delete = 0
-- ════════════════════════════════════════════════════════════════════════════
BEGIN;
  INSERT INTO public.prac_notification_log (tracked_player_id, requested_at, channel)
  VALUES ('579851bf-b1af-4531-8800-e5df5c671ca5','2026-06-30 12:00:00+00','email');

  SELECT count(*) AS before_delete
    FROM public.prac_notification_log
   WHERE tracked_player_id = '579851bf-b1af-4531-8800-e5df5c671ca5';

  DELETE FROM public.tracked_players WHERE id = '579851bf-b1af-4531-8800-e5df5c671ca5';

  SELECT count(*) AS after_delete
    FROM public.prac_notification_log
   WHERE tracked_player_id = '579851bf-b1af-4531-8800-e5df5c671ca5';
ROLLBACK;

-- ════════════════════════════════════════════════════════════════════════════
-- T4 — Moindre privilège vérifié EXPLICITEMENT (pas par supposition) : ni anon ni
--      authenticated n'ont le moindre privilège table après REVOKE ALL sans GRANT.
--      Même requête que la vérification du Lot 3A.
-- Attendu : 0 ligne
-- ════════════════════════════════════════════════════════════════════════════
BEGIN;
  SELECT grantee, privilege_type
    FROM information_schema.role_table_grants
   WHERE table_schema = 'public'
     AND table_name   = 'prac_notification_log'
     AND grantee IN ('anon', 'authenticated')
   ORDER BY grantee, privilege_type;
ROLLBACK;
