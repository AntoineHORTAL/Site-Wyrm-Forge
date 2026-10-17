-- Migration 20261017000001 : flag de lancement `jungle_path_web_enabled`.
--
-- L'onglet « Jungle Path » du SITE (src/components/dashboard/tabs/JunglePathTab.tsx)
-- est une MAQUETTE : liste de parcours écrite en dur (Hecarim, Vi), dessin gardé en
-- mémoire et perdu au rechargement, bouton « Sauvegarder » sans action. Il était
-- pourtant visible de tout compte connecté, par la barre latérale comme par
-- `/?tab=jungle`. Ce flag le cache tant qu'il n'est pas fini — sans retirer le code,
-- qui servira de base le jour où l'éditeur web sera branché sur une vraie table.
--
-- ⚠️ À NE PAS CONFONDRE :
--   • l'éditeur Jungle Path de l'APP WPF — le vrai, livré, qui ne lit pas ce flag ;
--   • le Workshop Jungle (`workshop_jungle_enabled`, kill switch) — consultation des
--     parcours partagés, livrée elle aussi, sur le site comme dans l'app.
--
-- ── Choix des métadonnées (patron de `kit_sur_mesure_enabled`, 20260908000002) ──
--   kind = 'launch'       → maquette déployée mais PAS ouverte ; value 'false'.
--                           Le bouton « Lancer » d'AdminTab la fera passer en kill
--                           switch le jour venu, en une écriture.
--   surface = 'web'       → aucune brique de cette maquette ne vit dans l'app.
--                           Corollaire : la clé est dans `LAUNCH_FLAG_KEYS` du site
--                           et PAS dans `ColdStartClosed` de l'app — même règle que
--                           le kit (`src/lib/feature-flags.ts`).
--   group_key = 'site'    → groupe existant (ads, player_search, kit).
--   sort_order = 640      → juste après kit_sur_mesure_enabled (630).
--   off_behavior='hidden' → une maquette ne s'annonce pas. Fermé : ni entrée de
--                           navigation, ni écran « bientôt » ; l'URL directe rend
--                           l'Accueil (`resolveDashTab`, src/lib/launch-tabs.ts).
--   is_public = true      → tout flag est public, toute valeur de tuning privée.
--
-- Pas de barrière serveur à poser : la maquette ne lit ni n'écrit aucune table.
-- Le flag est ici, pour une fois, TOUTE la protection — et il n'y a rien derrière.
--
-- ON CONFLICT (key) DO UPDATE ne touche NI `value`, NI `reason`, NI l'audit : les
-- métadonnées appartiennent au code, la VALEUR à l'admin (convention 20260905000001
-- § 5). Rejouer la migration ne rallume ni n'éteint jamais rien.
--
-- Idempotent : INSERT ... ON CONFLICT, rejouable.

INSERT INTO public.app_settings
  (key, value, kind, surface, group_key, parent_key, off_behavior, is_public,
   sort_order, label_fr, label_en, desc_fr, desc_en)
VALUES
  ('jungle_path_web_enabled', 'false', 'launch', 'web', 'site', NULL,
   'hidden', true, 640,
   'Éditeur Jungle Path (site)', 'Jungle Path editor (website)',
   'Onglet « Jungle Path » du tableau de bord du site — encore une maquette : parcours de démonstration, rien n''est sauvegardé. Coupé, l''onglet est invisible et son URL renvoie à l''accueil. N''affecte ni l''éditeur de l''app ni le Workshop Jungle.',
   'The “Jungle Path” tab of the website dashboard — still a mock-up: demo paths, nothing is saved. When off, the tab is hidden and its URL leads back to the home tab. Does not affect the app editor or the Jungle Workshop.')
ON CONFLICT (key) DO UPDATE SET
  kind = EXCLUDED.kind, surface = EXCLUDED.surface, group_key = EXCLUDED.group_key,
  parent_key = EXCLUDED.parent_key, off_behavior = EXCLUDED.off_behavior,
  is_public = EXCLUDED.is_public, sort_order = EXCLUDED.sort_order,
  label_fr = EXCLUDED.label_fr, label_en = EXCLUDED.label_en,
  desc_fr = EXCLUDED.desc_fr, desc_en = EXCLUDED.desc_en;
