-- Migration 20261012000001 : flag de lancement `minimap_structure_detection_enabled`.
--
-- Ajoute au catalogue de feature flags (`app_settings`, étendu par 20260905000001)
-- la mesure AUTOMATIQUE des positions des structures sur la minimap (app WPF,
-- Services/StructurePositionService.cs) : en début de partie, quelques captures
-- du carré de la minimap, analysées sur le PC, pour placer les timers
-- d'inhibiteurs sur les vraies icônes au lieu de constantes saisies à la main.
-- Les pixels ne servent qu'à PLACER : l'état des structures vient toujours de
-- l'API Live Client.
--
-- ── Choix des métadonnées ────────────────────────────────────────────────────
--   kind = 'launch'      → codée mais PAS ouverte. value 'false' : aucune capture
--                          supplémentaire tant que HORTAL ne bascule pas. Le bouton
--                          « Lancer » d'AdminTab la fera passer en kill switch, en
--                          une écriture, comme les autres flags de lancement.
--   surface = 'app'      → la feature vit dans l'app WPF seule. La clé est donc
--                          dans `ColdStartClosed` de Services/FeatureFlagService.cs
--                          ET dans `LAUNCH_FLAG_KEYS` de src/lib/feature-flags.ts.
--   parent_key = 'minimap_detection_enabled'
--                        → couper la détection de la minimap coupe toute capture
--                          d'écran, celle-ci comprise. L'inverse non : un détecteur
--                          d'icônes défaillant se coupe seul, sans couper la
--                          géométrie de la minimap (chemin de jungle, timers).
--   group_key = 'app'    → groupe du parent.
--   sort_order = 735     → juste après minimap_detection_enabled (730).
--   off_behavior='hidden'→ coupée, l'app reste sur ses positions de repli, sans
--                          rien annoncer.
--   is_public = true     → règle de tenue du catalogue : tout flag est public.
--
-- ON CONFLICT (key) DO UPDATE ne touche NI `value`, NI `reason`, NI les colonnes
-- d'audit : les métadonnées appartiennent au code, la VALEUR appartient à
-- l'admin. Rejouer la migration ne rallume ni n'éteint jamais rien
-- (convention 20260905000001 § 5). Clause identique à 20260908000002.
--
-- Additive : une ligne de plus. Les binaires déjà installés ne connaissent pas la
-- clé et l'ignorent ; le site l'affiche dans AdminTab sans changement de code.
--
-- Idempotent : INSERT ... ON CONFLICT, rejouable.
INSERT INTO public.app_settings
  (key, value, kind, surface, group_key, parent_key, off_behavior, is_public,
   sort_order, label_fr, label_en, desc_fr, desc_en)
VALUES
  ('minimap_structure_detection_enabled', 'false', 'launch', 'app', 'app',
   'minimap_detection_enabled', 'hidden', true, 735,
   'Positions mesurées des structures', 'Measured structure positions',
   'Mesure en début de partie, par capture du carré de la minimap analysée sur le PC, de la position des inhibiteurs et des nexus, pour y placer les timers. Coupé : positions de repli.',
   'Measures, at the start of a game, the position of inhibitors and nexuses from a capture of the minimap square analysed on the PC, to place the timers there. When off: fallback positions.')
ON CONFLICT (key) DO UPDATE SET
  kind = EXCLUDED.kind, surface = EXCLUDED.surface, group_key = EXCLUDED.group_key,
  parent_key = EXCLUDED.parent_key, off_behavior = EXCLUDED.off_behavior,
  is_public = EXCLUDED.is_public, sort_order = EXCLUDED.sort_order,
  label_fr = EXCLUDED.label_fr, label_en = EXCLUDED.label_en,
  desc_fr = EXCLUDED.desc_fr, desc_en = EXCLUDED.desc_en;
