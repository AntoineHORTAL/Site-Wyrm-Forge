-- Table jungle_paths : jungle paths PERSONNELS, partagés entre le site et l'app WPF.
--
-- CONTEXTE
-- L'app de bureau garde ses paths dans %APPDATA%\Logiciel-Assistant-LOL\junglepaths.json,
-- et l'éditeur du site (onglet « Jungle Path ») n'était qu'une maquette sans persistance.
-- Cette table est le point de rencontre des deux : un joueur retrouve dans l'un les paths
-- créés dans l'autre. Synchronisation sur le patron d'`item_builds` (app : hors ligne
-- d'abord, merge additif par id ; site : CRUD direct sous RLS).
--
-- ⚠️ NE PAS confondre avec `workshop_junglepaths` : paths PUBLIÉS, sans propriétaire
-- identifiable (dette F5). Ici, chaque ligne appartient à un compte.
--
-- ── Contrat JSONB (partagé site ↔ app — noms FIGÉS, au caractère près) ───────────
-- C'est la sérialisation System.Text.Json par défaut de `Models/JunglePath.cs` (app),
-- MESURÉE le 2026-10-18 et non supposée : clés en PascalCase, enum en ENTIER.
--
--   elements : [ { "Type": 0-6, "Label": "Gromp_Blue", "X": 0-1, "Y": 0-1,
--                  "Order": -1|1..n, "HasSmite": false } ]
--              Type : 0 Camp · 1 Smite · 2 Ward · 3 Invade · 4 Gank · 5 Stroke · 6 Spell
--              Label : clé de camp `{Camp}_{Blue|Red}` (Camp), nom du type (Smite…),
--                      ou `Spell:{nom}:{urlImage}` (Spell).
--              Order : numérotation des CAMPS seulement ; -1 = non ordonné (placements).
--   strokes  : [ { "Points": [ { "X": 0-1, "Y": 0-1 } ], "Color": "#RRGGBB", "Thickness": 3 } ]
--
--   Coordonnées NORMALISÉES 0–1 du fond `map11` 16.20.1 (même image, même cadrage côté
--   site et côté app — vérifié au SHA-256). Le site dessine en 0–100 % et convertit.
--
-- ── 🔴 Pourquoi les contraintes de FORME sont en base ─────────────────────────────
-- L'app lit son fichier local en UN SEUL `Deserialize<List<JunglePath>>`. Mesuré :
-- un seul `"Type": "Ward"` (chaîne au lieu d'entier) lève une JsonException sur la
-- liste ENTIÈRE, et le `catch` de `JunglePathService.Load()` repart alors d'une liste
-- vide. Une ligne distante mal formée, fusionnée puis sauvegardée par la synchro,
-- empoisonnerait donc le fichier et ferait disparaître TOUS les paths locaux au
-- démarrage suivant. Même effet pour un booléen en chaîne, un Label numérique, un
-- `null` sur un champ non nullable, un entier hors de la plage d'Int32, ou une
-- couleur que `ColorConverter` refuse (exception au dessin).
-- La base refuse donc toute ligne que l'app ne saurait pas relire. L'app filtre
-- AUSSI à la lecture (défense en profondeur) : aucune des deux barrières ne suffit
-- seule — un client futur peut contourner l'une, une ligne antérieure l'autre.
--
-- Bornes volontairement LÂCHES sur X/Y ([-1, 2], pas [0, 1]) : l'éditeur de l'app
-- capture la souris pendant un tracé, un point glissé hors du canvas sort légèrement
-- de [0, 1]. Le refuser bloquerait la synchro de ce path à vie, sans message.
--
-- ── RLS — calquée sur `scenarios`, PAS sur `item_builds` ──────────────────────────
-- `item_builds` porte en PROD une policy `TO public` et laisse à `anon` tous les
-- privilèges, TRUNCATE compris (relevé du 2026-10-18, dette § Dettes d'AGENTS.md).
-- Ici : 4 policies `TO authenticated`, prédicat de propriété, `WITH CHECK` sur INSERT
-- et UPDATE (pas de réassignation de user_id), REVOKE avant GRANT.
--
-- ⚠️ AUCUN flag dans la RLS, délibérément. `jungle_path_web_enabled` ne cache que
-- l'onglet du SITE : l'éditeur de l'app est livré et ouvert à tous, et sa synchro
-- doit fonctionner flag fermé. Conséquence assumée (décision HORTAL, 2026-10-18) :
-- tout compte connecté peut faire le CRUD de SES PROPRES paths via l'API, flag fermé.
--
-- Règle d'or (base partagée) : changement ADDITIF, aucune table existante touchée.
-- Aucune fonction créée → la règle des trois instructions ne s'applique pas.
-- Idempotent : IF NOT EXISTS + DROP/CREATE, rejouable.

CREATE TABLE IF NOT EXISTS public.jungle_paths (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),  -- en pratique fourni par le client (Guid de l'app)
  user_id          uuid        NOT NULL DEFAULT auth.uid()
                               REFERENCES auth.users ON DELETE CASCADE,
  name             text        NOT NULL,
  champion         text        NOT NULL DEFAULT '',
  side             text        NOT NULL DEFAULT 'Blue',
  elements         jsonb       NOT NULL DEFAULT '[]'::jsonb,
  strokes          jsonb       NOT NULL DEFAULT '[]'::jsonb,
  creator          text        NOT NULL DEFAULT '',     -- JunglePath.Creator (paths importés du Workshop)
  is_from_workshop boolean     NOT NULL DEFAULT false,  -- JunglePath.IsFromWorkshop
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT jungle_paths_name_len     CHECK (char_length(name) BETWEEN 1 AND 100),
  CONSTRAINT jungle_paths_champion_len CHECK (char_length(champion) <= 50),
  CONSTRAINT jungle_paths_creator_len  CHECK (char_length(creator) <= 100),
  -- Valeurs de l'app, casse comprise (`JunglePath.Side`).
  CONSTRAINT jungle_paths_side         CHECK (side IN ('Blue', 'Red')),

  CONSTRAINT jungle_paths_elements_size CHECK (
    jsonb_typeof(elements) = 'array' AND octet_length(elements::text) <= 65536),
  CONSTRAINT jungle_paths_strokes_size  CHECK (
    jsonb_typeof(strokes) = 'array' AND octet_length(strokes::text) <= 524288),

  -- Un élément est rejeté s'il n'est pas un objet, si Type/X/Y manquent ou ne sont
  -- pas des nombres, ou si un champ optionnel présent n'a pas le type que l'app
  -- attend. Type : entier, plage large (0–255) pour qu'un futur type d'élément ne
  -- demande pas de migration — l'app ignore les types qu'elle ne connaît pas.
  CONSTRAINT jungle_paths_elements_shape CHECK (NOT jsonb_path_exists(elements,
    '$[*] ? (@.type() != "object"
      || !(exists(@.Type)) || @.Type.type() != "number" || @.Type != @.Type.floor()
      || @.Type < 0 || @.Type > 255
      || !(exists(@.X)) || @.X.type() != "number" || @.X < -1 || @.X > 2
      || !(exists(@.Y)) || @.Y.type() != "number" || @.Y < -1 || @.Y > 2
      || (exists(@.Label) && @.Label.type() != "string")
      || (exists(@.Order) && (@.Order.type() != "number" || @.Order != @.Order.floor()
                              || @.Order < -1 || @.Order > 1000))
      || (exists(@.HasSmite) && @.HasSmite.type() != "boolean"))')),

  CONSTRAINT jungle_paths_strokes_shape CHECK (
    NOT jsonb_path_exists(strokes,
      '$[*] ? (@.type() != "object"
        || !(exists(@.Points)) || @.Points.type() != "array"
        || (exists(@.Color) && (@.Color.type() != "string"
                                || !(@.Color like_regex "^#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$")))
        || (exists(@.Thickness) && (@.Thickness.type() != "number"
                                    || @.Thickness < 0 || @.Thickness > 100)))')
    AND NOT jsonb_path_exists(strokes,
      '$[*].Points[*] ? (@.type() != "object"
        || !(exists(@.X)) || @.X.type() != "number" || @.X < -1 || @.X > 2
        || !(exists(@.Y)) || @.Y.type() != "number" || @.Y < -1 || @.Y > 2)'))
);

COMMENT ON TABLE public.jungle_paths IS
  'Jungle paths personnels, partagés site ↔ app WPF. Contrat JSONB = sérialisation '
  'System.Text.Json de Models/JunglePath.cs (PascalCase, Type entier, coordonnées 0–1). '
  'IsActive (clé JSON "IsFavorite") reste LOCAL à l''app : pas de colonne.';

-- « Mes paths » (site) et FetchAll (app) : SELECT des siens, plus récents d'abord.
CREATE INDEX IF NOT EXISTS idx_jungle_paths_user_time
  ON public.jungle_paths (user_id, created_at DESC);

-- ── updated_at (fonction partagée du repo) ──────────────────────────────────────
DROP TRIGGER IF EXISTS trg_jungle_paths_updated_at ON public.jungle_paths;
CREATE TRIGGER trg_jungle_paths_updated_at
  BEFORE UPDATE ON public.jungle_paths
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

-- ── Privilèges : REVOKE avant GRANT ─────────────────────────────────────────────
-- Sans le REVOKE, les DEFAULT PRIVILEGES de Supabase laisseraient à `anon` tous les
-- droits, et le refus ne tiendrait qu'au prédicat `auth.uid() = user_id` s'évaluant
-- à NULL — l'état exact d'`item_builds` aujourd'hui.
REVOKE ALL ON public.jungle_paths FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.jungle_paths TO authenticated;

ALTER TABLE public.jungle_paths ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "jp_select_own" ON public.jungle_paths;
CREATE POLICY "jp_select_own"
  ON public.jungle_paths FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- INSERT : un path ne se crée que pour soi-même.
DROP POLICY IF EXISTS "jp_insert_own" ON public.jungle_paths;
CREATE POLICY "jp_insert_own"
  ON public.jungle_paths FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

-- UPDATE : USING (la ligne doit m'appartenir) + WITH CHECK (pas de réassignation).
-- Couvre aussi l'upsert de l'app (`resolution=merge-duplicates`) : un id appartenant
-- à un autre compte part en ON CONFLICT DO UPDATE, que USING refuse → 42501.
DROP POLICY IF EXISTS "jp_update_own" ON public.jungle_paths;
CREATE POLICY "jp_update_own"
  ON public.jungle_paths FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "jp_delete_own" ON public.jungle_paths;
CREATE POLICY "jp_delete_own"
  ON public.jungle_paths FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- ── Kill switch de la synchro de l'app : `jungle_path_sync_enabled` ──────────────
-- Coupe, côté app WPF, TOUTE la synchro des jungle paths (envoi, lecture, fusion,
-- suppression, mise à jour) sans release. Le travail local continue : les
-- modifications restent `IsSynced=false` et partent à la réouverture.
--   kind = 'kill', value 'true' → la synchro est livrée ouverte ; côté app, une clé
--                          absente vaut déjà `true` (repli fail-open d'un kill switch) :
--                          cette ligne rend la COUPURE possible, elle n'allume rien.
--   surface = 'shared'    → porte sur une donnée des deux clients ; seule l'app la lit.
--                          L'onglet du site, lui, reste gardé par `jungle_path_web_enabled`.
--   group_key = 'app', sort_order = 740 → après la détection minimap (730/735).
--   off_behavior = 'degraded' → repli DÉJÀ ÉCRIT : l'app d'avant la synchro (paths locaux).
--   is_public = true      → tout flag est public (lisible par l'app sans compte).
-- ON CONFLICT ne touche NI `value` NI `reason` : la valeur appartient à l'admin, rejouer
-- la migration ne rallume ni n'éteint rien (convention 20260905000001 § 5).
INSERT INTO public.app_settings
  (key, value, kind, surface, group_key, parent_key, off_behavior, is_public,
   sort_order, label_fr, label_en, desc_fr, desc_en)
VALUES
  ('jungle_path_sync_enabled', 'true', 'kill', 'shared', 'app', NULL, 'degraded', true, 740,
   'Synchro des jungle paths (app ↔ site)', 'Jungle path sync (app ↔ site)',
   'L''app envoie et reçoit les jungle paths du compte (table jungle_paths). Coupé : les jungle paths restent locaux dans l''app, sans synchro ; les modifications partent à la réouverture.',
   'The app sends and receives the account''s jungle paths (jungle_paths table). Off: jungle paths stay local in the app, with no sync; changes are sent when it is turned back on.')
ON CONFLICT (key) DO UPDATE SET
  kind = EXCLUDED.kind, surface = EXCLUDED.surface, group_key = EXCLUDED.group_key,
  parent_key = EXCLUDED.parent_key, off_behavior = EXCLUDED.off_behavior,
  is_public = EXCLUDED.is_public, sort_order = EXCLUDED.sort_order,
  label_fr = EXCLUDED.label_fr, label_en = EXCLUDED.label_en,
  desc_fr = EXCLUDED.desc_fr, desc_en = EXCLUDED.desc_en;

-- ── Auto-vérification : fait échouer l'application si l'état visé n'est pas atteint ──
-- Les privilèges RÉELS sont interrogés (un REVOKE qui ne révoque rien passe la
-- relecture de code — 20260909000002), dans les deux sens.
DO $$
DECLARE
  v_t  regclass := 'public.jungle_paths'::regclass;
  v_p  text;
  v_n  int;
BEGIN
  FOREACH v_p IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] LOOP
    IF has_table_privilege('anon', v_t, v_p) THEN
      RAISE EXCEPTION 'jungle_paths : anon a encore %', v_p;
    END IF;
  END LOOP;
  FOREACH v_p IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE'] LOOP
    IF NOT has_table_privilege('authenticated', v_t, v_p) THEN
      RAISE EXCEPTION 'jungle_paths : authenticated n''a pas %', v_p;
    END IF;
  END LOOP;
  FOREACH v_p IN ARRAY ARRAY['TRUNCATE','REFERENCES','TRIGGER'] LOOP
    IF has_table_privilege('authenticated', v_t, v_p) THEN
      RAISE EXCEPTION 'jungle_paths : authenticated a encore %', v_p;
    END IF;
  END LOOP;

  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = v_t) THEN
    RAISE EXCEPTION 'jungle_paths : RLS désactivée';
  END IF;

  -- Exactement 4 policies, toutes TO authenticated : une 5ᵉ policy permissive
  -- (ou une policy TO public) rouvrirait la table.
  SELECT count(*) INTO v_n FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'jungle_paths';
  IF v_n <> 4 THEN
    RAISE EXCEPTION 'jungle_paths : % policies au lieu de 4', v_n;
  END IF;
  SELECT count(*) INTO v_n FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'jungle_paths'
     AND roles = ARRAY['authenticated']::name[];
  IF v_n <> 4 THEN
    RAISE EXCEPTION 'jungle_paths : % policies sur 4 sont TO authenticated', v_n;
  END IF;

  SELECT count(*) INTO v_n FROM pg_constraint
   WHERE conrelid = v_t AND conname IN ('jungle_paths_elements_shape', 'jungle_paths_strokes_shape',
                                        'jungle_paths_elements_size', 'jungle_paths_strokes_size');
  IF v_n <> 4 THEN
    RAISE EXCEPTION 'jungle_paths : % contraintes de forme/taille sur 4', v_n;
  END IF;

  -- Le kill switch existe, est un kill switch, et est lisible sans compte.
  PERFORM 1 FROM public.app_settings
   WHERE key = 'jungle_path_sync_enabled' AND kind = 'kill' AND is_public;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'jungle_path_sync_enabled absent, ou pas un kill switch public';
  END IF;
END
$$;
