-- ════════════════════════════════════════════════════════════════════════════
--  Chaleur de la Forge — solde unique en crédits par (utilisateur, semaine)
-- ════════════════════════════════════════════════════════════════════════════
-- Remplace le modèle « N analyses par feature » par un POT DE CRÉDITS FONGIBLE
-- partagé par TOUS les appels IA, présents et futurs (MatchUp, PostGame, …).
-- Premier arrivé premier servi, aucune réservation par feature.
--   1 crédit = 0,001 $ de coût Anthropic estimé.
--
-- ── AUCUNE MIGRATION DE SCHÉMA — c'est délibéré ─────────────────────────────
-- Le pot n'est plus par feature, mais la colonne `feature` est CONSERVÉE et
-- figée à la valeur générique 'ai_credits'. La PK (user_id, feature,
-- period_start) donne alors exactement UNE ligne par (utilisateur, semaine),
-- ce que demande le nouveau modèle — sans toucher à la table.
-- La supprimer du schéma aurait imposé un DROP/recreate de la PK sur une table
-- vivante, donc une fenêtre où des compteurs en cours pouvaient être perdus.
-- Le bénéfice était nul : une colonne constante coûte quelques octets et laisse
-- la porte ouverte à un futur cloisonnement partiel si le besoin réapparaît.
--
-- ⚠️ CONSÉQUENCE DE BASCULE À CONNAÎTRE : les lignes existantes
-- feature='matchup_analyze' (compteur en NOMBRE d'analyses) ne sont ni migrées
-- ni supprimées — elles deviennent inertes. Un utilisateur ayant déjà consommé
-- des analyses la semaine du déploiement repart donc à 0 sur le pot crédits :
-- rien n'est perdu, mais il y a un sur-octroi ponctuel sur cette seule semaine.
-- Les deux sémantiques de `count` (nombre d'analyses vs crédits) ne doivent
-- JAMAIS être mélangées sur une même valeur de feature.
--
-- ── Pourquoi un nom distinct de consume_ai_quota ────────────────────────────
-- consume_ai_quota(uuid, text, int) existe déjà. Une surcharge
-- consume_ai_credits(uuid, int, int) porterait le même nom avec une arité
-- identique et des types positionnels différents : PostgREST résout les RPC par
-- nom + clés du corps JSON et lèverait une ambiguïté (PGRST203) au premier
-- appel. Nom distinct = pas de surcharge, pas d'ambiguïté.
-- consume_ai_quota / refund_ai_quota sont LAISSÉES EN PLACE (aucun DROP) :
-- elles restent le chemin de tout consommateur non encore migré.
-- ════════════════════════════════════════════════════════════════════════════

-- ── consume_ai_credits : débit atomique d'un coût variable ───────────────────
-- Débite p_cost crédits sur la semaine courante SI le solde le permet.
-- Retourne le nouveau total consommé ; NULL = solde insuffisant (AUCUNE
-- écriture, donc aucun appel payant à déclencher côté EF).
-- Une seule instruction porte la décision (prédicat WHERE sur le DO UPDATE) →
-- pas de fenêtre TOCTOU entre lecture et écriture, comme consume_ai_quota.
CREATE OR REPLACE FUNCTION public.consume_ai_credits(
  p_user_id uuid,
  p_cost    int,
  p_limit   int
) RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period date := (date_trunc('week', now() AT TIME ZONE 'UTC'))::date;
  v_used   int;
BEGIN
  -- Coût nul ou négatif = erreur de programmation côté appelant, pas un refus
  -- métier : on lève plutôt que de créditer silencieusement l'utilisateur.
  IF p_cost IS NULL OR p_cost <= 0 THEN
    RAISE EXCEPTION 'invalid_cost';
  END IF;

  -- Un appel plus cher que le budget TOTAL du tier n'est jamais finançable.
  -- Ce garde-fou doit précéder l'INSERT : la branche INSERT du ON CONFLICT ne
  -- porte pas le prédicat du DO UPDATE, elle écrirait donc count = p_cost même
  -- au-delà de p_limit lors de la toute première consommation de la semaine.
  IF p_cost > p_limit THEN
    RETURN NULL;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_user_id::text || ':ai_credits'));

  INSERT INTO public.usage_counters AS uc (user_id, feature, period_start, count)
       VALUES (p_user_id, 'ai_credits', v_period, p_cost)
  ON CONFLICT (user_id, feature, period_start) DO UPDATE
       SET count = uc.count + p_cost, updated_at = now()
       WHERE uc.count + p_cost <= p_limit
  RETURNING uc.count INTO v_used;

  RETURN v_used;   -- NULL = conflit non éligible → solde insuffisant
END;
$$;

REVOKE ALL ON FUNCTION public.consume_ai_credits(uuid, int, int) FROM PUBLIC;
-- Aucun GRANT → réservée service_role (Edge Functions).

-- ── refund_ai_credits : rendre les crédits sur échec fournisseur ─────────────
-- Appelée UNIQUEMENT si l'appel payant échoue après un débit réussi : une panne
-- Anthropic ne doit jamais coûter de crédits à l'utilisateur.
CREATE OR REPLACE FUNCTION public.refund_ai_credits(
  p_user_id uuid,
  p_cost    int
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period date := (date_trunc('week', now() AT TIME ZONE 'UTC'))::date;
BEGIN
  IF p_cost IS NULL OR p_cost <= 0 THEN
    RAISE EXCEPTION 'invalid_cost';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_user_id::text || ':ai_credits'));

  -- greatest(...,0) : le CHECK usage_counters_count_nonneg interdit un solde
  -- négatif ; un double remboursement est absorbé plutôt que de faire échouer
  -- la transaction sur une contrainte.
  UPDATE public.usage_counters
     SET count = greatest(count - p_cost, 0), updated_at = now()
   WHERE user_id      = p_user_id
     AND feature      = 'ai_credits'
     AND period_start = v_period;
END;
$$;

REVOKE ALL ON FUNCTION public.refund_ai_credits(uuid, int) FROM PUBLIC;
-- Aucun GRANT → réservée service_role.
