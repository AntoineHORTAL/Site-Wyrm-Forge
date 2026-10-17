-- Migration 20261015000001 : kill switch `overlay_game_window_follow_enabled`.
--
-- Ajoute au catalogue de feature flags (`app_settings`, étendu par 20260905000001)
-- le lot 2 du chantier « overlay en mode fenêtré » de l'app WPF
-- (Services/GameWindowFollow.cs, Services/DpiAwareness.cs) : l'app passe en
-- per-monitor v2 et l'overlay se cale sur la ZONE CLIENTE de la fenêtre du jeu
-- (fenêtré, sans bordure, écran secondaire) au lieu de couvrir l'écran principal.
--
-- Pourquoi un kill switch : le jeu sur écran secondaire et les écrans à DPI mixtes
-- ne sont pas vérifiables sur le poste de développement (un seul écran). Coupé,
-- l'app redevient EXACTEMENT celle d'avant le lot 2.
--
-- ── Choix des métadonnées ────────────────────────────────────────────────────
--   kind = 'kill'        → feature livrée avec l'app, ouverte. value 'true'.
--                          Côté app, une clé absente vaut déjà `true` (kill
--                          switch ⇒ fail-open) : cette ligne n'allume rien, elle
--                          rend la COUPURE possible.
--   surface = 'app'      → l'app WPF seule. Aucun pendant dans LAUNCH_FLAG_KEYS ni
--                          dans ColdStartClosed (ce n'est pas un flag de lancement).
--   parent_key = 'overlay_enabled'
--                        → couper le maître ne construit plus l'overlay du tout :
--                          le suivi n'a plus d'objet. Affiché dans la sous-section
--                          overlay d'AdminTab (partitionCatalogue lit parent_key).
--                          ⚠️ Ce n'est PAS un bloc : la parité 1:1 des 18 kill
--                          switches de blocs avec les `Show*` d'OverlayConfig est
--                          inchangée.
--   group_key = 'overlay'→ groupe du parent.
--   sort_order = 990     → après le dernier bloc (overlay_show_comeback_panel, 980) :
--                          c'est un réglage de fenêtre, pas un bloc.
--   off_behavior = 'degraded'
--                        → repli DÉJÀ ÉCRIT vers l'état antérieur (overlay sur
--                          l'écran principal, processus system aware) — le cas
--                          que la convention réserve à 'degraded'.
--   is_public = true     → règle de tenue du catalogue : tout flag est public.
--
-- ⚠️ Effet côté app : le suivi s'arrête EN DIRECT (rafraîchissement des flags :
-- début de partie, puis toutes les 5 min) ; la prise en compte du DPI au
-- DÉMARRAGE SUIVANT de l'app seulement (Windows la fige à la première fenêtre).
--
-- ON CONFLICT (key) DO UPDATE ne touche NI `value`, NI `reason`, NI les colonnes
-- d'audit : les métadonnées appartiennent au code, la VALEUR appartient à
-- l'admin. Rejouer la migration ne rallume ni n'éteint jamais rien
-- (convention 20260905000001 § 5). Clause identique à 20261013000001.
--
-- Additive : une ligne de plus. Les binaires déjà installés ne connaissent pas la
-- clé et l'ignorent ; le site l'affiche dans AdminTab sans changement de code.
--
-- Idempotent : INSERT ... ON CONFLICT, rejouable.
INSERT INTO public.app_settings
  (key, value, kind, surface, group_key, parent_key, off_behavior, is_public,
   sort_order, label_fr, label_en, desc_fr, desc_en)
VALUES
  ('overlay_game_window_follow_enabled', 'true', 'kill', 'app', 'overlay',
   'overlay_enabled', 'degraded', true, 990,
   'Overlay calé sur la fenêtre du jeu', 'Overlay follows the game window',
   'L''overlay suit la zone de jeu (fenêtré, écran secondaire, DPI par écran). Coupé : overlay sur l''écran principal, comme avant ; le DPI change au prochain démarrage de l''app.',
   'The overlay follows the game area (windowed, secondary screen, per-monitor DPI). Off: overlay on the primary screen, as before; DPI changes at the next app start.')
ON CONFLICT (key) DO UPDATE SET
  kind = EXCLUDED.kind, surface = EXCLUDED.surface, group_key = EXCLUDED.group_key,
  parent_key = EXCLUDED.parent_key, off_behavior = EXCLUDED.off_behavior,
  is_public = EXCLUDED.is_public, sort_order = EXCLUDED.sort_order,
  label_fr = EXCLUDED.label_fr, label_en = EXCLUDED.label_en,
  desc_fr = EXCLUDED.desc_fr, desc_en = EXCLUDED.desc_en;
