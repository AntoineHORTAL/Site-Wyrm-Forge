-- Table scenarios : éditeur de macro stratégique 5v5 (onglet "Scénarios").
--
-- Codification d'une table créée AD-HOC sur le remote (sans migration d'origine).
-- Cette migration est IDEMPOTENTE (CREATE TABLE IF NOT EXISTS + DROP/CREATE POLICY)
-- afin d'être rejouable sans risque contre la table déjà existante en production.
--
-- Contenu (un scénario = une ligne) :
--   - allies   : sélection des 5 champions alliés (un par rôle) — jsonb structuré
--   - drawings : tracés posés sur la map (wards, flèches, zones, pings, lanes) — jsonb structuré
--
-- ⚠️ Contrat JSONB partagé entre le site (ScenariosTab.tsx) et l'app WPF (modèles miroir).
--    Les noms de champs sont en camelCase et NE DOIVENT PAS changer sans synchroniser
--    les deux clients (interopérabilité bidirectionnelle exigée).
--
--   allies   : [ { "role": "TOP|JUNGLE|MID|ADC|SUPPORT",
--                  "champ": { "id": "Ahri", "name": "Ahri", "image": "Ahri.png" } | null } ]
--              (5 entrées, une par rôle ; objet champion COMPLET, pas juste un id)
--
--   drawings : [ { "id": "<opaque>",
--                  "type": "ward|arrow|zone|ping|lane",
--                  "points": [ { "x": 0-100, "y": 0-100 } ],   -- POURCENTAGES du viewBox (responsive)
--                  "wardType": "yellow|control|blue",          -- si type=ward
--                  "pingType": "danger|help|fight",            -- si type=ping
--                  "laneId":   "TOP|MID|BOT",                  -- si type=lane (points=[])
--                  "color":    "#RRGGBB",
--                  "phase":    "early|mid|late|all",
--                  "label":    "note libre" } ]
--   ward/ping/zone = 1 point ; arrow = 2 points ; lane = aucun point (laneId seul).
--   Les ennemis ne sont PAS stockés (rangée décorative fixe côté UI).
--
-- CRUD : client Supabase direct (pas d'Edge Function), RLS owner-based.
-- Confidentialité : strictement privé à l'utilisateur (aucun partage / lien public).

CREATE TABLE IF NOT EXISTS public.scenarios (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  name       TEXT        NOT NULL,
  allies     JSONB       NOT NULL DEFAULT '[]'::jsonb,
  drawings   JSONB       NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Liste "Mes scénarios" : SELECT par user_id, tri créé décroissant.
CREATE INDEX IF NOT EXISTS idx_scenarios_user_time
  ON public.scenarios (user_id, created_at DESC);

-- Accès Data API : la table est privée (owner-only), accessible au rôle authenticated.
-- anon n'a aucun accès (aucune lecture publique).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scenarios TO authenticated;

-- RLS
ALTER TABLE public.scenarios ENABLE ROW LEVEL SECURITY;

-- SELECT : chaque utilisateur ne voit que ses propres scénarios.
DROP POLICY IF EXISTS "scn_select_own" ON public.scenarios;
CREATE POLICY "scn_select_own"
  ON public.scenarios FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- INSERT : on ne peut créer un scénario que pour soi-même
-- (WITH CHECK empêche de poser un user_id d'autrui).
DROP POLICY IF EXISTS "scn_insert_own" ON public.scenarios;
CREATE POLICY "scn_insert_own"
  ON public.scenarios FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

-- UPDATE : USING (la ligne doit m'appartenir pour être lue/modifiée)
--          + WITH CHECK (empêche de réassigner user_id à un autre compte).
DROP POLICY IF EXISTS "scn_update_own" ON public.scenarios;
CREATE POLICY "scn_update_own"
  ON public.scenarios FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

-- DELETE : chaque utilisateur ne peut supprimer que ses propres scénarios.
DROP POLICY IF EXISTS "scn_delete_own" ON public.scenarios;
CREATE POLICY "scn_delete_own"
  ON public.scenarios FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);
