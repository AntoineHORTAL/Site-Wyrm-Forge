-- Fonction purchase_cosmetic : achat atomique d'un cosmétique avec des Écailles.
-- M4 du système Écailles.
--
-- Appelée par l'Edge Function shop-purchase via le client service_role.
-- N'est PAS exposée en RPC direct au client — REVOKE FROM PUBLIC en fin de fichier.
--
-- Protection contre la double-dépense :
--   1. Advisory lock par user_id (pg_advisory_xact_lock) — sérialise les achats
--      concurrents d'un même utilisateur sur la durée de la transaction.
--   2. Débit ledger idempotent via ON CONFLICT (ref_id) DO NOTHING — si le ref_id
--      'shop:{user_id}:{cosmetic_id}' existe déjà, l'achat est un no-op silencieux.
--   3. Inventaire idempotent via ON CONFLICT (user_id, cosmetic_id) DO NOTHING.
--
-- Erreurs levées (RAISE EXCEPTION) :
--   'cosmetic_unavailable'  — cosmétique inexistant, inactif ou hors période
--   'already_owned'         — l'utilisateur possède déjà ce cosmétique
--   'insufficient_balance'  — solde Écailles insuffisant
--
-- Aucun accès direct aux lignes brutes de scales_ledger ou user_cosmetics
-- depuis le client n'est nécessaire pour ce flux : la fonction SECURITY DEFINER
-- agit pour le compte du service_role appelant.

CREATE OR REPLACE FUNCTION public.purchase_cosmetic(
  p_user_id    UUID,
  p_cosmetic_id BIGINT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_price   INT;
  v_type    TEXT;
  v_balance BIGINT;
BEGIN
  -- Étape 1 — Advisory lock par utilisateur
  -- Sérialise les achats simultanés d'un même utilisateur.
  -- Sans ce verrou, deux requêtes concurrentes pourraient lire le même solde
  -- avant qu'un débit soit écrit → risque de double-dépense.
  -- Le verrou est libéré automatiquement à la fin de la transaction.
  PERFORM pg_advisory_xact_lock(hashtext(p_user_id::text));

  -- Étape 2 — Lecture du cosmétique FOR SHARE
  -- FOR SHARE : empêche une mise à jour concurrente du cosmétique (ex. désactivation)
  -- pendant la validation de l'achat.
  SELECT price_scales, type
    INTO v_price, v_type
    FROM public.cosmetics
   WHERE id = p_cosmetic_id
     AND is_active = true
     AND (available_from  IS NULL OR available_from  <= now())
     AND (available_until IS NULL OR available_until >  now())
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'cosmetic_unavailable';
  END IF;

  -- Étape 3 — Vérification de possession
  -- Si l'utilisateur possède déjà ce cosmétique, on lève une exception
  -- plutôt que de laisser silencieusement l'INSERT être un no-op,
  -- afin que l'Edge Function puisse retourner une erreur explicite au client.
  IF EXISTS (
    SELECT 1
      FROM public.user_cosmetics
     WHERE user_id     = p_user_id
       AND cosmetic_id = p_cosmetic_id
  ) THEN
    RAISE EXCEPTION 'already_owned';
  END IF;

  -- Étape 4 — Vérification du solde
  -- Le SUM s'exécute dans la même transaction que le verrou advisory :
  -- le solde lu est cohérent avec le verrou, pas de fenêtre de concurrence.
  SELECT COALESCE(SUM(delta), 0)::BIGINT
    INTO v_balance
    FROM public.scales_ledger
   WHERE user_id = p_user_id;

  IF v_balance < v_price THEN
    RAISE EXCEPTION 'insufficient_balance';
  END IF;

  -- Étape 5 — Débit ledger (idempotent)
  -- ON CONFLICT (ref_id) DO NOTHING : si le ref_id 'shop:{user_id}:{cosmetic_id}'
  -- existe déjà dans scales_ledger (index uq_ledger_ref), l'achat a déjà été
  -- traité → l'ensemble de la fonction devient un no-op silencieux.
  INSERT INTO public.scales_ledger (user_id, delta, source, ref_id)
  VALUES (
    p_user_id,
    -v_price,
    'shop',
    'shop:' || p_user_id::text || ':' || p_cosmetic_id::text
  )
  ON CONFLICT (ref_id) DO NOTHING;

  -- Étape 6 — Inventaire (idempotent)
  -- cosmetic_type est dénormalisé depuis cosmetics.type à l'INSERT,
  -- requis par le schéma M3 pour l'index unique partiel uq_equipped_type.
  INSERT INTO public.user_cosmetics (user_id, cosmetic_id, cosmetic_type, is_equipped)
  VALUES (p_user_id, p_cosmetic_id, v_type, false)
  ON CONFLICT (user_id, cosmetic_id) DO NOTHING;
END;
$$;

-- La fonction n'est pas exposée en RPC direct au client.
-- L'accès se fait exclusivement via l'Edge Function shop-purchase (service_role).
REVOKE EXECUTE ON FUNCTION public.purchase_cosmetic(UUID, BIGINT) FROM PUBLIC;
