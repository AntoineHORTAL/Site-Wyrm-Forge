-- Migration 20261013000001 : flag de lancement `overlay_show_nexus_turret_timers`.
--
-- Ajoute au catalogue de feature flags (`app_settings`, étendu par 20260905000001)
-- les timers de réapparition des tourelles du nexus sur la minimap de l'overlay
-- (app WPF, Views/Overlay.xaml.cs, DrawNexusTurretTimers) : un compte à rebours de
-- 3:00 par tourelle du nexus détruite, des deux équipes, calculé depuis les
-- événements TurretKilled de l'API Live Client (aucun événement de réapparition
-- n'existe : seul le délai ferme le timer).
--
-- ── Choix des métadonnées ────────────────────────────────────────────────────
--   kind = 'launch'      → codée mais PAS ouverte. value 'false' : rien ne
--                          s'affiche, et la case de l'onglet Overlay reste CACHÉE,
--                          tant que HORTAL ne bascule pas. Le bouton « Lancer »
--                          d'AdminTab la fera passer en kill switch, en une
--                          écriture, comme les autres flags de lancement.
--   surface = 'app'      → la feature vit dans l'app WPF seule. La clé est donc
--                          dans `ColdStartClosed` de Services/FeatureFlagService.cs
--                          ET dans `LAUNCH_FLAG_KEYS` de src/lib/feature-flags.ts.
--   parent_key = 'overlay_enabled'
--                        → comme les 18 autres blocs de l'overlay : couper le
--                          maître coupe tout l'overlay, celle-ci comprise. Le maître
--                          a donc désormais 19 enfants.
--   group_key = 'overlay'→ groupe du parent.
--   sort_order = 975     → juste après overlay_show_inhib_timers (970), dont elle
--                          partage le calque, avant overlay_show_comeback_panel (980).
--   off_behavior='hidden'→ coupée, rien n'est dessiné et rien n'est annoncé.
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
  ('overlay_show_nexus_turret_timers', 'false', 'launch', 'app', 'overlay',
   'overlay_enabled', 'hidden', true, 975,
   'Timers des tourelles du nexus', 'Nexus turret timers',
   'Compte à rebours de réapparition (3 min) des tourelles du nexus détruites, sur la minimap.',
   'Respawn countdowns (3 min) of destroyed nexus turrets on the minimap.')
ON CONFLICT (key) DO UPDATE SET
  kind = EXCLUDED.kind, surface = EXCLUDED.surface, group_key = EXCLUDED.group_key,
  parent_key = EXCLUDED.parent_key, off_behavior = EXCLUDED.off_behavior,
  is_public = EXCLUDED.is_public, sort_order = EXCLUDED.sort_order,
  label_fr = EXCLUDED.label_fr, label_en = EXCLUDED.label_en,
  desc_fr = EXCLUDED.desc_fr, desc_en = EXCLUDED.desc_en;
