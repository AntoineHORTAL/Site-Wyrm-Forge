-- Passe les badges de 1 équipé max à 5 équipés max.
-- Avatar, avatar_frame, avatar_anim restent limités à 1 (uq_equipped_type conservé pour eux).
--
-- Changements :
--   1. uq_equipped_type : recréé avec filtre cosmetic_type <> 'badge'
--   2. equip_cosmetic   : logique badge-specific (count + badge_limit_reached)
--
-- get_equipped_cosmetics n'a pas besoin de modification : elle retourne déjà
-- toutes les lignes is_equipped = true sans DISTINCT ON ni LIMIT.

-- ---------------------------------------------------------------------------
-- Étape 1 — Remplacer l'index unique partiel
-- ---------------------------------------------------------------------------

DROP INDEX IF EXISTS uq_equipped_type;

-- Nouveau : unicité préservée pour avatar / avatar_frame / avatar_anim,
-- mais PAS pour badge (jusqu'à 5 badges équipés simultanément).
CREATE UNIQUE INDEX IF NOT EXISTS uq_equipped_type
  ON public.user_cosmetics (user_id, cosmetic_type)
  WHERE is_equipped = true AND cosmetic_type <> 'badge';

-- ---------------------------------------------------------------------------
-- Étape 2 — Remplacer equip_cosmetic
-- Badges : compter les badges déjà équipés → RAISE badge_limit_reached si >= 5.
-- Autres types : comportement inchangé (déséquipe l'actuel avant d'équiper).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.equip_cosmetic(p_cosmetic_id BIGINT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_type        TEXT;
  v_badge_count INT;
BEGIN
  -- Vérifie la possession et récupère le type en une seule requête
  SELECT c.type INTO v_type
  FROM public.user_cosmetics uc
  JOIN public.cosmetics c ON c.id = uc.cosmetic_id
  WHERE uc.user_id    = auth.uid()
    AND uc.cosmetic_id = p_cosmetic_id;

  IF v_type IS NULL THEN
    RAISE EXCEPTION 'cosmetic_not_owned';
  END IF;

  IF v_type = 'badge' THEN
    -- Badges : pas de déséquipement automatique — multi-sélection jusqu'à 5
    SELECT COUNT(*)::INT INTO v_badge_count
    FROM public.user_cosmetics
    WHERE user_id      = auth.uid()
      AND cosmetic_type = 'badge'
      AND is_equipped   = true;

    IF v_badge_count >= 5 THEN
      RAISE EXCEPTION 'badge_limit_reached';
    END IF;
    -- Pas de UPDATE de déséquipement — les autres badges restent équipés
  ELSE
    -- Autres types : déséquipe l'éventuel cosmétique du même type (1 par type)
    UPDATE public.user_cosmetics
      SET is_equipped = false
    WHERE user_id      = auth.uid()
      AND cosmetic_type = v_type
      AND is_equipped   = true;
  END IF;

  -- Équipe le cosmétique demandé
  UPDATE public.user_cosmetics
    SET is_equipped = true
  WHERE user_id     = auth.uid()
    AND cosmetic_id = p_cosmetic_id;
END;
$$;

-- GRANT EXECUTE TO authenticated est conservé par CREATE OR REPLACE.
