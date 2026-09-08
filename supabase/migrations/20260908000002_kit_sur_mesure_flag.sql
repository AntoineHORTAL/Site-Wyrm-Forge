-- Migration 20260908000002 : flag de lancement `kit_sur_mesure_enabled`.
--
-- Ajoute le service « Kit sur mesure » au catalogue de feature flags
-- (`app_settings`, étendu par 20260905000001). Séparée de la migration de schéma
-- 20260908000001 à dessein : l'une crée des tables, l'autre remplit un catalogue.
-- Rejouer celle-ci ne touche pas au schéma, et inversement.
--
-- ── Choix des métadonnées ────────────────────────────────────────────────────
--   kind = 'launch'      → la feature est codée et déployée mais PAS ouverte.
--                          value 'false' : rien ne sort tant qu'HORTAL ne bascule
--                          pas. Le bouton « Lancer » d'AdminTab (launchPatch())
--                          le fera passer en kill switch le jour venu, en UNE
--                          écriture — aucun code supplémentaire à écrire.
--   surface = 'web'      → aucune brique de ce service ne vit dans l'app WPF.
--                          Corollaire assumé : la clé n'est PAS ajoutée à
--                          `ColdStartClosed` de Services/FeatureFlagService.cs.
--                          C'est conforme à la règle posée par
--                          `src/lib/feature-flags.ts` : « un flag de lancement
--                          absent d'ici ne crée pas de fuite : si le bundle ne
--                          connaît pas la clé, c'est qu'il n'embarque pas la
--                          feature qu'elle garde ».
--   group_key = 'site'   → groupe existant, avec ads / player_search / prac.
--                          Pas de nouveau groupe pour une seule clé : le panneau
--                          afficherait une section à une ligne.
--   sort_order = 630     → juste après prac_enabled (620), dans le bloc du groupe.
--   off_behavior='hidden'→ un service qui n'est pas lancé ne s'annonce pas. Un
--                          encart « temporairement indisponible » ('notice')
--                          promettrait quelque chose qui n'a jamais existé ; il
--                          deviendra pertinent APRÈS le lancement, mais
--                          off_behavior n'est volontairement pas modifié par
--                          `launchPatch()` (cf. applyLaunch dans lib/admin-flags.ts)
--                          — à réviser par une migration le jour du lancement si
--                          on veut basculer sur 'notice'.
--   is_public = true     → règle de tenue du catalogue : tout flag est public,
--                          toute valeur de tuning reste privée.
--
-- ON CONFLICT (key) DO UPDATE ne touche NI `value`, NI `reason`, NI les colonnes
-- d'audit : les métadonnées appartiennent au code, la VALEUR appartient à
-- l'admin. Rejouer la migration ne rallume ni n'éteint jamais rien
-- (convention 20260905000001 § 5).
--
-- Idempotent : INSERT ... ON CONFLICT, rejouable.

INSERT INTO public.app_settings
  (key, value, kind, surface, group_key, parent_key, off_behavior, is_public,
   sort_order, label_fr, label_en, desc_fr, desc_en)
VALUES
  ('kit_sur_mesure_enabled', 'false', 'launch', 'web', 'site', NULL,
   'hidden', true, 630,
   'Kit sur mesure', 'Custom kit',
   'Service payant d''accompagnement personnalisé : ouverture de dossier, suivi du parcours et tableau des preneurs. Coupé, rien n''est visible côté client.',
   'Paid personalised coaching service: order intake, progress tracking and the buyers table. When off, nothing is visible to clients.')
ON CONFLICT (key) DO UPDATE SET
  kind = EXCLUDED.kind, surface = EXCLUDED.surface, group_key = EXCLUDED.group_key,
  parent_key = EXCLUDED.parent_key, off_behavior = EXCLUDED.off_behavior,
  is_public = EXCLUDED.is_public, sort_order = EXCLUDED.sort_order,
  label_fr = EXCLUDED.label_fr, label_en = EXCLUDED.label_en,
  desc_fr = EXCLUDED.desc_fr, desc_en = EXCLUDED.desc_en;
