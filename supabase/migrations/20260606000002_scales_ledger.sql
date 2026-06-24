-- Table scales_ledger : grand livre immuable des mouvements d'Écailles.
-- Chaque ligne est un crédit (delta > 0) ou un débit (delta < 0).
-- Le solde courant d'un utilisateur = SUM(delta) sur ses lignes.
--
-- Sources valides (colonne source) :
--   'quest'       : récompense de quête journalière
--   'shop'        : achat en boutique (débit)
--   'tournament'  : récompense de tournoi
--   'admin'       : ajustement manuel par un admin
--   'purchase'    : crédit suite à un achat Stripe
--
-- Déduplication : ref_id est une clé opaque optionnelle (ex : "quest:login:2026-06-06").
--   L'index unique partiel uq_ledger_ref garantit qu'un même ref_id ne peut être
--   inséré deux fois — INSERT ... ON CONFLICT (ref_id) DO NOTHING est la stratégie
--   recommandée côté Edge Functions.
--
-- Alimentation : Edge Functions uniquement, via service_role (bypass RLS).
--   → aucune policy INSERT/UPDATE/DELETE côté client.
-- Lecture : via la fonction SECURITY DEFINER get_balance() — aucun accès direct
--   aux lignes d'autres utilisateurs.
--
-- Suppression : aucune policy DELETE client — les lignes sont immuables par design.
--   Si une correction est nécessaire, insérer une ligne compensatrice (delta opposé).

CREATE TABLE IF NOT EXISTS public.scales_ledger (
  id         BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id    UUID        NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  delta      BIGINT      NOT NULL,
  source     TEXT        NOT NULL,
  ref_id     TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_ledger_source CHECK (source IN ('quest','shop','tournament','admin','purchase'))
);

-- Index unique partiel pour la déduplication par ref_id (non NULL uniquement)
CREATE UNIQUE INDEX IF NOT EXISTS uq_ledger_ref
  ON public.scales_ledger (ref_id)
  WHERE ref_id IS NOT NULL;

-- Index pour le calcul de solde et la pagination de l'historique par utilisateur
CREATE INDEX IF NOT EXISTS idx_ledger_user_time
  ON public.scales_ledger (user_id, created_at DESC);

-- RLS
ALTER TABLE public.scales_ledger ENABLE ROW LEVEL SECURITY;

-- SELECT : chaque utilisateur ne voit que ses propres lignes.
-- Pas de lecture croisée possible, même entre authenticated.
CREATE POLICY "sl_select_own"
  ON public.scales_ledger FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- INSERT / UPDATE / DELETE : aucune policy client.
-- Toutes les écritures passent par les Edge Functions (service_role, bypass RLS).

-- Fonction de consultation du solde courant.
-- SECURITY DEFINER : contourne les policies RLS pour lire la table,
--   mais le filtre WHERE user_id = auth.uid() garantit qu'on ne lit
--   que les lignes de l'appelant — impossible de passer un user_id externe.
-- Retourne 0 si aucune ligne n'existe encore pour l'utilisateur.
CREATE OR REPLACE FUNCTION public.get_balance()
RETURNS BIGINT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(delta), 0)::BIGINT
  FROM public.scales_ledger
  WHERE user_id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.get_balance() TO authenticated;
