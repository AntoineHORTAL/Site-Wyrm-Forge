-- Tables cosmetics + user_cosmetics : catalogue et inventaire des cosmétiques.
-- M3 du système Écailles.
--
-- cosmetics      : catalogue administré — liste des cosmétiques disponibles à l'achat.
-- user_cosmetics : inventaire personnel — association (user, cosmétique) après achat.
--
-- Types de cosmétiques : 'badge' | 'avatar' | 'avatar_frame' | 'avatar_anim'
-- Raretés            : 'common' | 'rare' | 'legendary'
--
-- Règle d'équipement : un seul cosmétique par type peut être équipé simultanément
--   par utilisateur. Garantie double : l'index unique partiel uq_equipped_type
--   au niveau DB + la fonction equip_cosmetic() qui déséquipe d'abord.
--
-- Alimentation user_cosmetics : Edge Functions (achats Stripe / boutique Écailles),
--   via service_role (bypass RLS). Aucune policy INSERT côté client.
-- Lecture catalogue (cosmetics) : publique — anon + authenticated.
-- Lecture inventaire (user_cosmetics) : authenticated, propres lignes uniquement.
-- Équipement / déséquipement : fonctions SECURITY DEFINER equip_cosmetic() /
--   unequip_cosmetic(), accessibles aux authenticated.
-- Cosmétiques équipés d'un joueur public : get_equipped_cosmetics(p_puuid),
--   accessible à anon + authenticated — ne retourne jamais d'UUID Wyrm Forge.

-- ---------------------------------------------------------------------------
-- Table cosmetics — catalogue
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.cosmetics (
  id              BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slug            TEXT        NOT NULL,
  type            TEXT        NOT NULL,
  name            TEXT        NOT NULL,
  description     TEXT,
  rarity          TEXT        NOT NULL,
  price_scales    INT         NOT NULL,
  image_url       TEXT,
  available_from  TIMESTAMPTZ,
  available_until TIMESTAMPTZ,
  is_active       BOOLEAN     NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_cosmetics_slug   UNIQUE (slug),
  CONSTRAINT chk_cosmetics_type   CHECK (type   IN ('badge','avatar','avatar_frame','avatar_anim')),
  CONSTRAINT chk_cosmetics_rarity CHECK (rarity IN ('common','rare','legendary')),
  CONSTRAINT chk_cosmetics_price  CHECK (price_scales > 0)
);

-- RLS cosmetics
ALTER TABLE public.cosmetics ENABLE ROW LEVEL SECURITY;

-- Catalogue public : tout le monde peut consulter (SEO, page boutique non connectée)
CREATE POLICY "cos_select_public"
  ON public.cosmetics FOR SELECT TO anon, authenticated
  USING (true);

-- INSERT / UPDATE / DELETE : aucune policy client (service_role only).

-- ---------------------------------------------------------------------------
-- Table user_cosmetics — inventaire
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.user_cosmetics (
  id             BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id        UUID        NOT NULL REFERENCES auth.users   ON DELETE CASCADE,
  cosmetic_id    BIGINT      NOT NULL REFERENCES public.cosmetics(id) ON DELETE RESTRICT,
  cosmetic_type  TEXT        NOT NULL,
  is_equipped    BOOLEAN     NOT NULL DEFAULT false,
  purchased_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_user_cosmetics UNIQUE (user_id, cosmetic_id)
);

-- Index unique partiel : un seul cosmétique équipé par type par utilisateur.
-- Une tentative d'équiper un deuxième badge/avatar/etc. viole cet index.
CREATE UNIQUE INDEX IF NOT EXISTS uq_equipped_type
  ON public.user_cosmetics (user_id, cosmetic_type)
  WHERE is_equipped = true;

-- RLS user_cosmetics
ALTER TABLE public.user_cosmetics ENABLE ROW LEVEL SECURITY;

-- Inventaire personnel : un utilisateur ne voit que ses propres cosmétiques.
CREATE POLICY "uc_select_own"
  ON public.user_cosmetics FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- INSERT / UPDATE / DELETE : aucune policy client.
-- Les achats sont enregistrés par les Edge Functions (service_role).
-- L'équipement passe exclusivement par equip_cosmetic() / unequip_cosmetic().

-- ---------------------------------------------------------------------------
-- Fonction equip_cosmetic(p_cosmetic_id)
-- Équipe un cosmétique appartenant à l'appelant.
-- Déséquipe d'abord l'éventuel cosmétique du même type pour respecter
-- l'index unique partiel uq_equipped_type sans fenêtre d'incohérence.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.equip_cosmetic(p_cosmetic_id BIGINT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_type TEXT;
BEGIN
  -- Vérifie la possession et récupère le type en une seule requête
  SELECT c.type INTO v_type
  FROM public.user_cosmetics uc
  JOIN public.cosmetics c ON c.id = uc.cosmetic_id
  WHERE uc.user_id = auth.uid()
    AND uc.cosmetic_id = p_cosmetic_id;

  IF v_type IS NULL THEN
    RAISE EXCEPTION 'cosmetic_not_owned';
  END IF;

  -- Déséquipe l'éventuel cosmétique du même type (respect uq_equipped_type)
  UPDATE public.user_cosmetics
    SET is_equipped = false
  WHERE user_id     = auth.uid()
    AND cosmetic_type = v_type
    AND is_equipped = true;

  -- Équipe le cosmétique demandé
  UPDATE public.user_cosmetics
    SET is_equipped = true
  WHERE user_id     = auth.uid()
    AND cosmetic_id = p_cosmetic_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.equip_cosmetic(BIGINT) TO authenticated;

-- ---------------------------------------------------------------------------
-- Fonction unequip_cosmetic(p_cosmetic_id)
-- Déséquipe un cosmétique appartenant à l'appelant.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.unequip_cosmetic(p_cosmetic_id BIGINT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Vérifie la possession
  IF NOT EXISTS (
    SELECT 1 FROM public.user_cosmetics
    WHERE user_id    = auth.uid()
      AND cosmetic_id = p_cosmetic_id
  ) THEN
    RAISE EXCEPTION 'cosmetic_not_owned';
  END IF;

  UPDATE public.user_cosmetics
    SET is_equipped = false
  WHERE user_id    = auth.uid()
    AND cosmetic_id = p_cosmetic_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.unequip_cosmetic(BIGINT) TO authenticated;

-- ---------------------------------------------------------------------------
-- Fonction get_equipped_cosmetics(p_puuid)
-- Retourne les cosmétiques équipés d'un joueur identifié par son PUUID Riot.
-- Accessible publiquement (anon + authenticated) pour l'affichage sur les
-- pages joueur publiques (/summoner/...).
-- Ne retourne JAMAIS user_id ni aucun UUID Wyrm Forge — sécurité by design.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_equipped_cosmetics(p_puuid TEXT)
RETURNS TABLE (type TEXT, slug TEXT, name TEXT, image_url TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.type, c.slug, c.name, c.image_url
  FROM public.user_cosmetics uc
  JOIN public.cosmetics c ON c.id  = uc.cosmetic_id
  JOIN public.profiles  p ON p.id  = uc.user_id
  WHERE p.riot_puuid  = p_puuid
    AND uc.is_equipped = true;
$$;

GRANT EXECUTE ON FUNCTION public.get_equipped_cosmetics(TEXT) TO anon, authenticated;
