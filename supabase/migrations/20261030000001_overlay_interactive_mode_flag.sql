-- Migration 20261030000001 : flag de lancement `overlay_interactive_mode_enabled`.
--
-- Ajoute au catalogue de feature flags (`app_settings`, étendu par 20260905000001)
-- le mode interactif de l'overlay de l'app WPF : une touche choisie par le joueur
-- rend les blocs de l'overlay cliquables en jeu ; hors du mode, ils laissent passer
-- les clics vers le jeu. Réglages et choix de la touche livrés par la PR app #70
-- (« PR b »), branchement en jeu par les PR c1/c2. L'app lit déjà la clé
-- (`OverlayFlagKeys.InteractiveMode`, Services/OverlayConfigService.cs).
--
-- ── Choix des métadonnées ────────────────────────────────────────────────────
--   kind = 'launch'      → codée mais PAS ouverte. value 'false' : la section
--                          « Mode interactif » de l'onglet Overlay reste CACHÉE et
--                          rien ne lit la touche en jeu, tant que HORTAL ne bascule
--                          pas. Le bouton « Lancer » d'AdminTab la fera passer en
--                          kill switch, en une écriture.
--   surface = 'app'      → la feature vit dans l'app WPF seule. La clé est donc
--                          dans `ColdStartClosed` de Services/FeatureFlagService.cs
--                          ET dans `LAUNCH_FLAG_KEYS` de src/lib/feature-flags.ts.
--   parent_key = 'overlay_enabled'
--                        → couper le maître ne construit plus l'overlay : le mode
--                          n'a plus d'objet. ⚠️ Ce n'est PAS un bloc : la parité 1:1
--                          des kill switches de blocs avec les `Show*` d'OverlayConfig
--                          est inchangée (comme overlay_game_window_follow_enabled).
--   group_key = 'overlay'→ groupe du parent.
--   sort_order = 995     → après overlay_game_window_follow_enabled (990) : réglage
--                          de comportement de l'overlay, pas un bloc.
--   off_behavior='hidden'→ fermé, la section de l'onglet est cachée et l'overlay
--                          garde son comportement actuel (blocs cliquables).
--   is_public = true     → règle de tenue du catalogue : tout flag est public.
--
-- ON CONFLICT (key) DO UPDATE ne touche NI `value`, NI `reason`, NI les colonnes
-- d'audit : les métadonnées appartiennent au code, la VALEUR appartient à
-- l'admin. Rejouer la migration ne rallume ni n'éteint jamais rien
-- (convention 20260905000001 § 5). Clause identique à 20261015000001.
--
-- Additive : une ligne de plus. Les binaires déjà installés ne connaissent pas la
-- clé et l'ignorent ; ceux qui la connaissent la ferment déjà quand elle manque
-- (`ColdStartClosed`). Le site l'affiche dans AdminTab sans changement de code.
--
-- Idempotent : INSERT ... ON CONFLICT, rejouable.
INSERT INTO public.app_settings
  (key, value, kind, surface, group_key, parent_key, off_behavior, is_public,
   sort_order, label_fr, label_en, desc_fr, desc_en)
VALUES
  ('overlay_interactive_mode_enabled', 'false', 'launch', 'app', 'overlay',
   'overlay_enabled', 'hidden', true, 995,
   'Mode interactif de l''overlay', 'Overlay interactive mode',
   'Une touche choisie par le joueur rend les blocs de l''overlay cliquables en jeu ; hors du mode, les clics passent au jeu.',
   'A player-chosen key makes the overlay blocks clickable in game; outside the mode, clicks go through to the game.')
ON CONFLICT (key) DO UPDATE SET
  kind = EXCLUDED.kind, surface = EXCLUDED.surface, group_key = EXCLUDED.group_key,
  parent_key = EXCLUDED.parent_key, off_behavior = EXCLUDED.off_behavior,
  is_public = EXCLUDED.is_public, sort_order = EXCLUDED.sort_order,
  label_fr = EXCLUDED.label_fr, label_en = EXCLUDED.label_en,
  desc_fr = EXCLUDED.desc_fr, desc_en = EXCLUDED.desc_en;
