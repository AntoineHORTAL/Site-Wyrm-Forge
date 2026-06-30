-- Migration 20260630000001 : table prac_notification_log (chantier 5, lot 5C).
--
-- Journal d'envois de notifications du module prac : une ligne = une tentative de
-- notification (e-mail) pour UNE instance de demande de suivi. Sert UNIQUEMENT
-- l'idempotence de l'EF prac-notify (lot 5D) : éviter de re-notifier sur un
-- double-fire / retry du Database Webhook, tout en autorisant une nouvelle
-- notification à chaque RÉOUVERTURE d'une demande.
--
-- Clé d'idempotence = (tracked_player_id, requested_at, channel) :
--   • Retry/double-livraison du webhook pour la MÊME demande → même requested_at
--     → conflit → skip (at-most-once par demande).
--   • Réouverture via request_tracking (declined/revoked → pending) remet
--     requested_at = now() → clé neuve → nouvelle notification autorisée.
--   • tracked_player_id (= tracked_players.id) est STABLE à travers les
--     réouvertures (request_tracking fait un UPDATE de la même ligne), donc c'est
--     le bon ancrage + il porte la cascade FK.
--
-- Frontière de sécurité = service_role UNIQUEMENT (modèle app_events, PAS
-- tracked_matches) : le joueur ne lit JAMAIS ce journal (audit interne pur).
-- Donc RLS activée + AUCUNE policy + REVOKE ALL FROM anon, authenticated SANS
-- aucun GRANT de relecture → un client authenticated obtient « permission denied »
-- (42501), garantie plus forte qu'un simple filtrage RLS à 0 ligne. service_role
-- (writes EF prac-notify) conserve ses privilèges par défaut Supabase (non révoqués).
--
-- Conservation sur révocation : à la différence de tracked_matches (purgé sur
-- revoke car donnée Riot sensible), ce journal est CONSERVÉ quand le dossier passe
-- en 'revoked' — c'est un log d'envoi (audit), pas de la donnée joueur. Il n'est
-- supprimé QUE si le dossier tracked_players lui-même est supprimé (remove_tracking
-- → FK ON DELETE CASCADE).
--
-- ⚠️ DETTE CONNUE V1 — pas de reclaim time-based : l'EF 5D ne re-tente un envoi que
-- sur une ligne 'failed'. Une ligne restée 'pending' (crash de l'EF entre le claim
-- et l'UPDATE de statut) ne se débloque JAMAIS automatiquement → le joueur
-- concerné pourrait ne jamais recevoir sa notification, sans alerte. Accepté pour
-- la V1 (cas rare : fenêtre crash de quelques ms). À traiter plus tard si besoin
-- (ex. reclaim des 'pending' plus vieux que N minutes, ou job de supervision).
--
-- Dépend de : tracked_players (20260626000002), fn_set_updated_at() (20260530000008/000012).
--
-- Idempotent : CREATE ... IF NOT EXISTS + DROP/CREATE TRIGGER + REVOKE rejouables.

-- ── 1. Table ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.prac_notification_log (
  id                   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tracked_player_id    uuid NOT NULL REFERENCES public.tracked_players(id) ON DELETE CASCADE,
  requested_at         timestamptz NOT NULL,                 -- l'instance de demande notifiée (= record.requested_at)
  channel              text NOT NULL DEFAULT 'email',        -- extensible (futurs canaux)
  recipient            text,                                 -- email au moment de l'envoi (audit)
  status               text NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending', 'sent', 'failed')),
  provider_message_id  text,                                 -- id Resend (nullable)
  error                text,                                 -- message d'échec (nullable)
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_prac_notif UNIQUE (tracked_player_id, requested_at, channel)
);
-- La contrainte uq_prac_notif crée déjà l'index btree utilisé par le claim
-- (INSERT ... ON CONFLICT). Aucun index supplémentaire nécessaire.

-- ── 2. Trigger updated_at (réutilise la fonction partagée du repo) ─────────────
DROP TRIGGER IF EXISTS trg_prac_notification_log_updated_at ON public.prac_notification_log;
CREATE TRIGGER trg_prac_notification_log_updated_at
  BEFORE UPDATE ON public.prac_notification_log
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

-- ── 3. RLS + moindre privilège (service_role only, modèle app_events) ─────────
ALTER TABLE public.prac_notification_log ENABLE ROW LEVEL SECURITY;

-- AUCUNE policy : RLS activée + absence de policy = deny total des rôles client
-- (défense en profondeur, même si aucun GRANT n'est accordé ci-dessous).
--
-- Privilèges table — moindre privilège EXPLICITE. Supabase applique des DEFAULT
-- PRIVILEGES accordant ALL à anon ET authenticated sur toute nouvelle table → on
-- révoque. Contrairement à tracked_matches/tracked_players, on NE ré-accorde PAS
-- SELECT : ce journal est purement interne (service_role), jamais lu par un client.
-- Conséquence : un SELECT client → « permission denied » (42501), plus strict
-- qu'un filtrage RLS à 0 ligne. service_role n'est pas touché (writes EF 5D).
REVOKE ALL ON public.prac_notification_log FROM anon, authenticated;
