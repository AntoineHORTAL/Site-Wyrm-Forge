-- ════════════════════════════════════════════════════════════════════════════
--  usage_counters — compteur d'usage freemium par (utilisateur, feature, semaine)
-- ════════════════════════════════════════════════════════════════════════════
-- Infra de quota générique (AGENTS.md §freemium — "usage_counters" prévu).
-- Premier consommateur : Edge Function `matchup-analyze` (analyse IA de matchup,
--   feature = 'matchup_analyze'). Réutilisable pour tout futur quota par tier.
--
-- Fenêtre = CALENDAIRE, lundi 00:00 UTC (pas glissante) : lisible pour l'utilisateur
--   ("reset lundi"), prévisible, cohérent avec le modèle "Match Up (semaine)".
--   period_start = date_trunc('week', now() AT TIME ZONE 'UTC')::date  (lundi ISO).
--
-- Frontière de sécurité :
--   • RLS activée, SELECT self-only (affichage du quota côté client).
--   • AUCUNE policy write client → l'écriture passe EXCLUSIVEMENT par les fonctions
--     SECURITY DEFINER ci-dessous (appelées par l'EF via service_role).
--   • Le mapping tier → limite + modèle vit dans l'EF, PAS ici : les fonctions ne
--     connaissent pas les tiers, elles reçoivent juste p_limit calculé côté serveur.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.usage_counters (
  user_id      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  feature      text        NOT NULL,
  period_start date        NOT NULL,   -- lundi UTC de la semaine
  count        int         NOT NULL DEFAULT 0,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT usage_counters_pkey PRIMARY KEY (user_id, feature, period_start),
  CONSTRAINT usage_counters_count_nonneg CHECK (count >= 0)
);

-- Index de purge temporelle (semaines anciennes).
CREATE INDEX IF NOT EXISTS idx_usage_counters_period
  ON public.usage_counters (period_start);

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE public.usage_counters ENABLE ROW LEVEL SECURITY;

-- Moindre privilège explicite : les DEFAULT PRIVILEGES Supabase accordent ALL à
-- anon/authenticated sur toute nouvelle table → on révoque puis on ré-accorde le
-- strict nécessaire (lecture self pour authenticated ; anon aucun accès).
REVOKE ALL ON public.usage_counters FROM anon, authenticated;
GRANT SELECT ON public.usage_counters TO authenticated;

DROP POLICY IF EXISTS uc_select_self ON public.usage_counters;
CREATE POLICY uc_select_self ON public.usage_counters
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));
-- Pas de policy INSERT/UPDATE/DELETE → deny total client (RLS + absence de policy).
-- service_role bypass RLS (écriture via les fonctions ci-dessous).

-- ── consume_ai_quota : réservation atomique d'un slot ────────────────────────
-- Réserve 1 unité dans la fenêtre semaine courante SI count < p_limit.
-- Retourne le nouveau count si réservé ; NULL si plafond atteint (aucune écriture).
-- Le prédicat WHERE sur le DO UPDATE fait tout le tri (une seule instruction →
-- pas de fenêtre TOCTOU entre lecture et écriture). Advisory lock pour sérialiser
-- les appels concurrents du même (user, feature).
CREATE OR REPLACE FUNCTION public.consume_ai_quota(
  p_user_id uuid,
  p_feature text,
  p_limit   int
) RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period date := (date_trunc('week', now() AT TIME ZONE 'UTC'))::date;
  v_count  int;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_user_id::text || ':' || p_feature));

  INSERT INTO public.usage_counters AS uc (user_id, feature, period_start, count)
       VALUES (p_user_id, p_feature, v_period, 1)
  ON CONFLICT (user_id, feature, period_start) DO UPDATE
       SET count = uc.count + 1, updated_at = now()
       WHERE uc.count < p_limit
  RETURNING uc.count INTO v_count;

  RETURN v_count;   -- NULL = conflit non éligible (count >= p_limit) → plafond atteint
END;
$$;

REVOKE ALL ON FUNCTION public.consume_ai_quota(uuid, text, int) FROM PUBLIC;
-- Aucun GRANT → réservée service_role (Edge Function matchup-analyze).

-- ── refund_ai_quota : rendre un slot sur échec Anthropic ─────────────────────
-- Décrémente le compteur de la semaine courante (jamais < 0). Appelée par l'EF
-- uniquement si l'appel Anthropic échoue APRÈS une réservation réussie, pour ne
-- pas consumer un slot sur une erreur serveur.
CREATE OR REPLACE FUNCTION public.refund_ai_quota(
  p_user_id uuid,
  p_feature text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period date := (date_trunc('week', now() AT TIME ZONE 'UTC'))::date;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_user_id::text || ':' || p_feature));

  UPDATE public.usage_counters
     SET count = greatest(count - 1, 0), updated_at = now()
   WHERE user_id = p_user_id
     AND feature = p_feature
     AND period_start = v_period;
END;
$$;

REVOKE ALL ON FUNCTION public.refund_ai_quota(uuid, text) FROM PUBLIC;
-- Aucun GRANT → réservée service_role.

-- Purge recommandée (compteurs anciens) :
--   DELETE FROM public.usage_counters WHERE period_start < (CURRENT_DATE - INTERVAL '90 days');
