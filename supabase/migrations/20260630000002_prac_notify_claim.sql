-- Migration 20260630000002 : fonction prac_notify_claim (chantier 5, lot 5D).
--
-- Claim atomique d'un slot de notification (étape 1 du « claim-then-send » de l'EF
-- prac-notify). Appelée EXCLUSIVEMENT par prac-notify via service_role
-- (REVOKE FROM PUBLIC ; service_role bypasse le REVOKE, comme prac_commit_tracked_matches).
--
-- Pourquoi une fonction et pas un upsert PostgREST : le claim doit, EN UNE SEULE
-- instruction (donc sans fenêtre TOCTOU entre livraisons concurrentes du webhook) :
--   • INSÉRER une ligne 'pending' si la demande n'a jamais été notifiée, OU
--   • RE-CLAIMER (repasser 'pending') une ligne précédemment 'failed' (retry après
--     échec Resend), OU
--   • NE RIEN faire si la ligne est déjà 'sent' ou 'pending' in-flight → retourne NULL.
-- Le prédicat `WHERE ... status = 'failed'` sur le DO UPDATE réalise exactement ce
-- tri ; RETURNING ne renvoie d'id QUE si une ligne a été insérée ou re-claimée.
--
-- ⚠️ DETTE CONNUE V1 (rappel, voir migration 20260630000001) : seules les lignes
-- 'failed' sont re-claimables. Une ligne restée 'pending' (crash de l'EF entre ce
-- claim et l'UPDATE final de statut) n'est JAMAIS re-claimée → notification perdue
-- silencieusement. Accepté pour la V1 (fenêtre de crash de quelques ms).
--
-- Dépend de : prac_notification_log (migration 20260630000001).
--
-- Idempotent : CREATE OR REPLACE.

CREATE OR REPLACE FUNCTION public.prac_notify_claim(
  p_tracked_player_id uuid,
  p_requested_at      timestamptz,
  p_channel           text,
  p_recipient         text
)
RETURNS bigint        -- id de la ligne si le claim est acquis (insert OU re-claim d'un 'failed') ; NULL sinon
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id bigint;
BEGIN
  INSERT INTO public.prac_notification_log
    (tracked_player_id, requested_at, channel, recipient, status)
  VALUES
    (p_tracked_player_id, p_requested_at, p_channel, p_recipient, 'pending')
  ON CONFLICT (tracked_player_id, requested_at, channel)
    DO UPDATE SET status     = 'pending',
                  recipient  = EXCLUDED.recipient,
                  error      = NULL,
                  updated_at = now()
    WHERE prac_notification_log.status = 'failed'   -- re-claim uniquement un échec
  RETURNING id INTO v_id;

  RETURN v_id;   -- NULL = conflit non éligible (déjà 'sent' ou 'pending' in-flight)
END;
$$;

-- Réservée à l'EF prac-notify (service_role bypasse le REVOKE).
REVOKE EXECUTE ON FUNCTION public.prac_notify_claim(uuid, timestamptz, text, text) FROM PUBLIC;
