-- Catalogue de feature flags — étend `app_settings` en source unique des flags
-- pilotables depuis le dashboard admin, pour le SITE et pour l'APP WPF.
--
-- ════════════════════════════════════════════════════════════════════════════
--  POURQUOI ÉTENDRE `app_settings` PLUTÔT QUE CRÉER UNE TABLE
-- ════════════════════════════════════════════════════════════════════════════
-- La table porte déjà 5 flags (`ecailles_enabled`, `shop_enabled`,
-- `quests_enabled`, `live_game_enabled`, `patch_auto_publish`) et possède DÉJÀ
-- quatre lecteurs en production :
--   • site     — SessionProvider.tsx, EcaillesTab.tsx, AdminTab.tsx
--   • EF       — supabase/functions/_shared/feature-flags.ts (isFeatureEnabled)
--   • app WPF  — Services/ForgeService.cs (GetAppFlagAsync)
-- Une table neuve imposerait de migrer ces lecteurs et d'ouvrir une fenêtre où
-- les deux systèmes coexistent — sur une base PARTAGÉE entre deux clients, ce
-- risque n'est pas payé par le gain. Toutes les colonnes ajoutées ici sont donc
-- NULLABLE ou pourvues d'un DEFAULT : `select value where key = …` continue de
-- fonctionner à l'identique, aucun lecteur existant n'est touché.
--
-- ════════════════════════════════════════════════════════════════════════════
--  LES TROIS `kind`
-- ════════════════════════════════════════════════════════════════════════════
--   'setting' — l'existant : réglage de comportement ou valeur de tuning.
--               N'apparaît PAS dans le catalogue de flags du panneau admin.
--   'launch'  — flag de LANCEMENT (catégorie 1) : la feature est codée et
--               déployée mais pas encore ouverte au public. Défaut 'false'.
--               Un flag de lancement échoue FERMÉ (voir plus bas).
--   'kill'    — KILL SWITCH (catégorie 2) : la feature est livrée et vivante ;
--               le flag existe pour la couper vite en cas d'incident.
--               Défaut 'true'. Un kill switch échoue OUVERT côté client.
--
-- ⚠️ L'asymétrie d'échec est délibérée et vit dans les CLIENTS, pas ici :
--    un flag de lancement introuvable ne doit jamais laisser fuir une feature
--    non lancée ; un kill switch introuvable ne doit jamais transformer une
--    coupure réseau en application vide. Côté serveur (Edge Functions),
--    `isFeatureEnabled()` reste fail-closed dans les DEUX cas — c'est lui qui
--    fait foi pour tout ce qui coûte ou risque.
--
-- ════════════════════════════════════════════════════════════════════════════
--  `is_public` ET LA LECTURE ANONYME — le vrai déblocage de cette migration
-- ════════════════════════════════════════════════════════════════════════════
-- La seule policy SELECT était `as_select_authenticated` (TO authenticated).
-- Or l'app WPF FONCTIONNE SANS COMPTE Wyrm Forge — c'est explicite dans
-- supabase/config.toml (`verify_jwt = false` sur les fonctions Riot « pour que
-- l'app desktop marche pour tout le monde ») — et le site sert des pages
-- publiques (/matches, /champions, /live). Sur ce chemin, `ForgeService.
-- GetAppFlagAsync` renvoie `false` faute de JWT : un kill switch bâti dessus
-- serait invisible pour exactement les utilisateurs qu'on ne peut pas prévenir
-- autrement.
--
-- D'où `as_select_anon`, restreinte aux lignes `is_public`. Règle de tenue :
--   • tout flag (kind 'launch' ou 'kill') → is_public = true  (leur EXISTENCE
--     est de toute façon visible dans l'UI des deux clients) ;
--   • toute valeur de tuning → is_public = false.
-- Cette migration réalise ainsi ce que visait la migration P2
-- 20260606000013_security_p2_app_settings_select.sql — masquer
-- `cap_daily_scales` / `streak_bonus_pct` aux non-admins — pour le rôle `anon`,
-- sans casser AdminTab (qui lit en `authenticated`, dont la policy est
-- inchangée). L'objectif complet (masquer aussi aux `authenticated`) reste
-- hors périmètre pour la même raison qu'alors.
--
-- ════════════════════════════════════════════════════════════════════════════
--  RÉTROCOMPATIBILITÉ
-- ════════════════════════════════════════════════════════════════════════════
-- Additive de bout en bout, et rejouable :
--   • ADD COLUMN IF NOT EXISTS sur les 12 colonnes ;
--   • contraintes posées via DO blocks (Postgres n'a pas ADD CONSTRAINT IF NOT
--     EXISTS) ;
--   • DROP POLICY / DROP TRIGGER IF EXISTS avant CREATE ;
--   • les INSERT utilisent ON CONFLICT (key) DO UPDATE en NE TOUCHANT JAMAIS
--     `value` : les métadonnées appartiennent au code (donc à cette migration),
--     la VALEUR appartient à l'admin (donc au dashboard). Rejouer la migration
--     ne rallume ni n'éteint jamais rien.
--
-- ⚠️ Aucune valeur existante n'est modifiée. `live_game_enabled` en
--    particulier reste à l'état où le remote l'a laissé — AGENTS.md rappelle
--    qu'il se pilote à la main et qu'un 403 sur /live est d'abord ce flag.

-- ════════════════════════════════════════════════════════════════════════════
--  1. COLONNES
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.app_settings
  -- Nature de la ligne : voir « LES TROIS kind » ci-dessus.
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'setting'
      CHECK (kind IN ('setting', 'launch', 'kill')),

  -- Quel(s) client(s) ce flag concerne. Purement informatif pour l'admin (le
  -- panneau l'affiche en pastille) — aucun client ne filtre dessus : l'app WPF
  -- ignore simplement les clés qu'elle ne connaît pas, et réciproquement.
  ADD COLUMN IF NOT EXISTS surface TEXT
      CHECK (surface IN ('web', 'app', 'shared')),

  -- Section du panneau admin (« ecailles », « overlay », « ia »…).
  ADD COLUMN IF NOT EXISTS group_key TEXT,

  -- Hiérarchie. Un flag n'est ACTIF que si tous ses ancêtres le sont — la
  -- résolution est faite une fois par les clients, jamais à chaque lecture.
  -- Formalise une hiérarchie qui existait déjà implicitement côté Écailles, et
  -- porte la granularité « overlay global → par option » demandée.
  ADD COLUMN IF NOT EXISTS parent_key TEXT,

  -- Ce que voit l'utilisateur quand le flag est à false — convention unique,
  -- pas de traitement au cas par cas. Affiché à l'admin AVANT qu'il bascule :
  --   'hidden'   → rien. Pas d'entrée de nav, pas de mention. Sur accès direct
  --                (deep-link), l'écran « bientôt » existant. L'admin, lui,
  --                voit toujours tout (mécanisme de recette avant lancement).
  --   'notice'   → l'entrée reste visible, le contenu est remplacé par un
  --                encart neutre « Temporairement indisponible ». Défaut des
  --                kill switches : la feature était là hier, la faire
  --                disparaître se lit comme une perte de données.
  --   'degraded' → repli explicite DÉJÀ ÉCRIT vers un état antérieur.
  --                Réservé aux cas où ce repli existe vraiment, sinon c'est du
  --                cas par cas déguisé.
  ADD COLUMN IF NOT EXISTS off_behavior TEXT
      CHECK (off_behavior IN ('hidden', 'notice', 'degraded')),

  -- Libellés PORTÉS PAR LA BASE, et non par le dico i18n du site.
  -- C'est ce qui rend « ajouter un flag » = un INSERT, sans aucun déploiement
  -- ni du site ni de l'app. Contrepartie assumée : ces libellés échappent au
  -- dico typé, un libellé manquant ne serait plus une erreur de compilation —
  -- d'où la contrainte app_settings_flag_metadata_complete en §6.
  ADD COLUMN IF NOT EXISTS label_fr TEXT,
  ADD COLUMN IF NOT EXISTS label_en TEXT,
  ADD COLUMN IF NOT EXISTS desc_fr  TEXT,
  ADD COLUMN IF NOT EXISTS desc_en  TEXT,

  -- Ordre d'affichage DANS un group_key. Les valeurs sont posées par blocs de
  -- 100 par groupe : un tri (group_key, sort_order) comme un tri (sort_order)
  -- seul donnent tous deux un résultat sensé.
  ADD COLUMN IF NOT EXISTS sort_order INT NOT NULL DEFAULT 0,

  -- Motif de coupure, saisi OBLIGATOIREMENT par l'admin quand il éteint un
  -- kill switch, remis à NULL à la réactivation. Un flag coupé à 2h du matin
  -- doit être explicable à 9h.
  ADD COLUMN IF NOT EXISTS reason TEXT,

  -- Lisible par le rôle `anon` — voir la policy en §3.
  ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT false;

-- ════════════════════════════════════════════════════════════════════════════
--  2. FK AUTO-RÉFÉRENTE + SON INDEX
-- ════════════════════════════════════════════════════════════════════════════
-- Postgres n'accepte pas ADD CONSTRAINT IF NOT EXISTS → DO block.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'app_settings_parent_key_fkey'
      AND conrelid = 'public.app_settings'::regclass
  ) THEN
    ALTER TABLE public.app_settings
      ADD CONSTRAINT app_settings_parent_key_fkey
      FOREIGN KEY (parent_key) REFERENCES public.app_settings (key);
  END IF;
END $$;

-- Un flag ne peut pas être son propre parent (le cycle à 2 nœuds reste
-- possible en théorie ; aucune contrainte déclarative ne l'attrape, et la
-- résolution côté client borne sa profondeur — voir §6).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'app_settings_parent_not_self'
      AND conrelid = 'public.app_settings'::regclass
  ) THEN
    ALTER TABLE public.app_settings
      ADD CONSTRAINT app_settings_parent_not_self
      CHECK (parent_key IS DISTINCT FROM key);
  END IF;
END $$;

-- Postgres n'indexe pas les colonnes de FK automatiquement. La table est
-- minuscule (~50 lignes, un seq scan la balaie), mais l'index est gratuit à
-- cette taille et évite au passage le lint « unindexed foreign key » de
-- l'advisor Supabase, que le projet suit (cf. les migrations security_pX).
CREATE INDEX IF NOT EXISTS idx_app_settings_parent_key
  ON public.app_settings (parent_key)
  WHERE parent_key IS NOT NULL;

-- ════════════════════════════════════════════════════════════════════════════
--  3. RLS — lecture anonyme des seules lignes publiques
-- ════════════════════════════════════════════════════════════════════════════
-- Les policies existantes sont INCHANGÉES :
--   as_select_authenticated  SELECT TO authenticated USING (true)
--   as_update_admin          UPDATE TO authenticated USING/WITH CHECK is_admin()
-- INSERT / DELETE restent sans policy → service_role et migrations seulement.
DROP POLICY IF EXISTS "as_select_anon" ON public.app_settings;
CREATE POLICY "as_select_anon"
  ON public.app_settings FOR SELECT TO anon
  USING (is_public);

-- ════════════════════════════════════════════════════════════════════════════
--  4. TRAÇABILITÉ — qui a coupé quoi, et quand
-- ════════════════════════════════════════════════════════════════════════════
-- `updated_by` existe depuis 20260530000009 mais n'a JAMAIS été écrit :
-- AdminTab.toggleSetting() ne pose que `value`. On le renseigne donc côté
-- base, ce qui a l'avantage de couvrir aussi toute écriture future (RPC, EF)
-- sans que chaque appelant ait à y penser.
--
-- COALESCE(auth.uid(), OLD.updated_by) : dans un contexte migration ou
-- service_role, auth.uid() est NULL. Sans le COALESCE, rejouer cette migration
-- effacerait l'auteur de la dernière coupure — précisément l'information que
-- le panneau doit afficher.
CREATE OR REPLACE FUNCTION public.fn_app_settings_stamp_actor()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY INVOKER
  SET search_path = ''
AS $$
BEGIN
  NEW.updated_by := COALESCE(auth.uid(), OLD.updated_by);
  RETURN NEW;
END;
$$;

-- ⚠️ CHANGEMENT DE COMPORTEMENT ASSUMÉ sur trg_app_settings_updated_at.
-- Les deux marqueurs (`updated_at`, `updated_by`) répondent à la question
-- « quand, et par qui, la VALEUR a-t-elle changé ? » — c'est ce que le panneau
-- admin affiche (« coupé par X il y a 12 min »). Sans la clause WHEN, une
-- migration qui ne touche que des MÉTADONNÉES (comme les §5 ci-dessous, et
-- comme toute future migration de catalogue) réécrirait `updated_at` et
-- afficherait « coupé il y a 0 min » sur un flag que personne n'a touché.
-- Aucun lecteur en production ne lit `app_settings.updated_at` aujourd'hui :
-- le resserrage est sans risque et se fait maintenant, avant qu'AdminTab ne
-- commence à l'afficher.
DROP TRIGGER IF EXISTS trg_app_settings_updated_at ON public.app_settings;
CREATE TRIGGER trg_app_settings_updated_at
  BEFORE UPDATE ON public.app_settings
  FOR EACH ROW
  WHEN (NEW.value IS DISTINCT FROM OLD.value)
  EXECUTE FUNCTION public.fn_set_updated_at();

DROP TRIGGER IF EXISTS trg_app_settings_actor ON public.app_settings;
CREATE TRIGGER trg_app_settings_actor
  BEFORE UPDATE ON public.app_settings
  FOR EACH ROW
  WHEN (NEW.value IS DISTINCT FROM OLD.value)
  EXECUTE FUNCTION public.fn_app_settings_stamp_actor();

-- ════════════════════════════════════════════════════════════════════════════
--  5. CATALOGUE
-- ════════════════════════════════════════════════════════════════════════════
-- Forme commune de tous les blocs ci-dessous :
--   ON CONFLICT (key) DO UPDATE SET <métadonnées> = EXCLUDED.<…>
-- `value`, `updated_at`, `updated_by` et `reason` sont VOLONTAIREMENT absents
-- du SET : ils appartiennent à l'admin, pas au code.

-- ── 5.a  Lignes existantes : métadonnées seulement ──────────────────────────
-- Aucun INSERT ici — ces 7 clés existent déjà, on ne fait que les décrire.

-- `patch_auto_publish` reste kind='setting' : ce n'est ni un lancement ni un
-- kill switch mais un réglage de comportement de la génération de patch notes.
-- Il garde donc son interrupteur dédié dans la carte Patch notes d'AdminTab et
-- n'entre pas dans les deux sections du catalogue. Ses libellés sont renseignés
-- quand même, pour qu'il puisse être rendu génériquement le jour où on le veut.
-- is_public = false : réglage interne, aucun client anonyme n'en a besoin.
UPDATE public.app_settings SET
  kind = 'setting', surface = 'web', group_key = 'patchnotes', sort_order = 0,
  is_public = false,
  label_fr = 'Publication automatique',
  label_en = 'Auto-publish',
  desc_fr  = 'Publie directement le patch généré sans passer par le statut brouillon.',
  desc_en  = 'Publishes the generated patch straight away, skipping the draft status.'
WHERE key = 'patch_auto_publish';

-- Les deux valeurs de TUNING : kind='setting', is_public=false. Ce sont les
-- deux lignes que la migration P2 20260606000013 voulait masquer — elles le
-- sont désormais pour `anon`.
UPDATE public.app_settings SET
  kind = 'setting', surface = 'shared', group_key = 'ecailles', sort_order = 190,
  is_public = false,
  label_fr = 'Plafond d''Écailles par jour',
  label_en = 'Daily Scales cap',
  desc_fr  = 'Nombre maximum d''Écailles gagnables par quêtes en une journée.',
  desc_en  = 'Maximum Scales earnable from quests in a single day.'
WHERE key = 'cap_daily_scales';

UPDATE public.app_settings SET
  kind = 'setting', surface = 'shared', group_key = 'ecailles', sort_order = 191,
  is_public = false,
  label_fr = 'Bonus de streak (%)',
  label_en = 'Streak bonus (%)',
  desc_fr  = 'Bonus en pourcentage par jour consécutif de streak. 0 = désactivé.',
  desc_en  = 'Percentage bonus per consecutive streak day. 0 = disabled.'
WHERE key = 'streak_bonus_pct';

-- Les 3 flags Écailles : catégorie 1 (lancement). `shop_enabled` et
-- `quests_enabled` deviennent enfants d'`ecailles_enabled` — la hiérarchie
-- existait déjà dans les faits, elle est simplement rendue explicite.
UPDATE public.app_settings SET
  kind = 'launch', surface = 'shared', group_key = 'ecailles', sort_order = 100,
  parent_key = NULL, off_behavior = 'hidden', is_public = true,
  label_fr = 'Écailles',
  label_en = 'Scales',
  desc_fr  = 'Monnaie virtuelle — gain, affichage du solde et transactions. Parent de la boutique, des quêtes et des cosmétiques.',
  desc_en  = 'Virtual currency — earning, balance display and transactions. Parent of the shop, quests and cosmetics.'
WHERE key = 'ecailles_enabled';

UPDATE public.app_settings SET
  kind = 'launch', surface = 'shared', group_key = 'ecailles', sort_order = 110,
  parent_key = 'ecailles_enabled', off_behavior = 'hidden', is_public = true,
  label_fr = 'Boutique',
  label_en = 'Shop',
  desc_fr  = 'Boutique cosmétique — permet de dépenser ses Écailles.',
  desc_en  = 'Cosmetic shop — lets users spend their Scales.'
WHERE key = 'shop_enabled';

UPDATE public.app_settings SET
  kind = 'launch', surface = 'shared', group_key = 'ecailles', sort_order = 120,
  parent_key = 'ecailles_enabled', off_behavior = 'hidden', is_public = true,
  label_fr = 'Quêtes journalières',
  label_en = 'Daily quests',
  desc_fr  = 'Quêtes quotidiennes récompensées en Écailles.',
  desc_en  = 'Daily quests rewarding Scales.'
WHERE key = 'quests_enabled';

-- `live_game_enabled` était déjà nommé « kill-switch » par sa migration
-- (20260728000001). Il prend simplement sa place dans le catalogue — SA VALEUR
-- N'EST PAS TOUCHÉE, elle se pilote à la main.
UPDATE public.app_settings SET
  kind = 'kill', surface = 'shared', group_key = 'riot', sort_order = 310,
  off_behavior = 'notice', is_public = true,
  label_fr = 'Partie en direct',
  label_en = 'Live game',
  desc_fr  = 'Composition de la partie en cours (spectator-v5) — onglet « Partie en direct » et page /live.',
  desc_en  = 'Live game composition (spectator-v5) — the Live game tab and the /live page.'
WHERE key = 'live_game_enabled';

-- ── 5.b  Nouveaux flags de LANCEMENT (catégorie 1) ──────────────────────────
-- value 'false' : rien n'est ouvert au public tant qu'HORTAL ne bascule pas.
INSERT INTO public.app_settings
  (key, value, kind, surface, group_key, parent_key, off_behavior, is_public,
   sort_order, label_fr, label_en, desc_fr, desc_en)
VALUES
  ('cosmetics_enabled', 'false', 'launch', 'shared', 'ecailles', 'ecailles_enabled',
   'hidden', true, 130,
   'Cosmétiques', 'Cosmetics',
   'Équipement et affichage des cosmétiques possédés (onglet Équipement).',
   'Equipping and displaying owned cosmetics (Equipment tab).'),

  ('scenarios_enabled', 'false', 'launch', 'shared', 'scenarios', NULL,
   'hidden', true, 200,
   'Scénarios', 'Scenarios',
   'Éditeur et lecture de scénarios tactiques, sur le site et dans l''app.',
   'Tactical scenario editor and viewer, on the site and in the app.')
ON CONFLICT (key) DO UPDATE SET
  kind = EXCLUDED.kind, surface = EXCLUDED.surface, group_key = EXCLUDED.group_key,
  parent_key = EXCLUDED.parent_key, off_behavior = EXCLUDED.off_behavior,
  is_public = EXCLUDED.is_public, sort_order = EXCLUDED.sort_order,
  label_fr = EXCLUDED.label_fr, label_en = EXCLUDED.label_en,
  desc_fr = EXCLUDED.desc_fr, desc_en = EXCLUDED.desc_en;

-- ── 5.c  Nouveaux KILL SWITCHES (catégorie 2), hors overlay ─────────────────
-- value 'true' : ces features SONT livrées et vivantes. Le flag n'existe que
-- pour pouvoir les couper.
INSERT INTO public.app_settings
  (key, value, kind, surface, group_key, parent_key, off_behavior, is_public,
   sort_order, label_fr, label_en, desc_fr, desc_en)
VALUES
  -- ·· Riot ··
  ('riot_history_enabled', 'true', 'kill', 'shared', 'riot', NULL, 'notice', true, 300,
   'Historique Riot', 'Riot history',
   'Proxy Riot : historique de parties, détail d''un match et rangs (EF riot-matches, riot-match-detail, riot-rank).',
   'Riot proxy: match history, match detail and ranks (riot-matches, riot-match-detail, riot-rank EFs).'),

  ('riot_link_enabled', 'true', 'kill', 'shared', 'riot', NULL, 'notice', true, 320,
   'Liaison de compte Riot', 'Riot account linking',
   'Parcours de liaison d''un compte Riot (EF riot-link-init et riot-link-verify).',
   'Riot account linking flow (riot-link-init and riot-link-verify EFs).'),

  -- ·· IA ··
  -- Le seul 'degraded' du lot, et il est mérité : le repli EXISTE déjà côté
  -- MatchUpTab (comparaison de stats + radar, qui ne dépendent d'aucune IA).
  ('matchup_ai_enabled', 'true', 'kill', 'shared', 'ia', NULL, 'degraded', true, 400,
   'Analyse IA de match-up', 'Match-up AI analysis',
   'Analyse IA du match-up (EF matchup-analyze). Coupé, la comparaison de stats et le radar restent disponibles.',
   'AI match-up analysis (matchup-analyze EF). When off, the stat comparison and radar remain available.'),

  ('postgame_ai_enabled', 'true', 'kill', 'shared', 'ia', NULL, 'notice', true, 410,
   'Analyse IA d''après-partie', 'Post-game AI analysis',
   'Bilan IA d''après-partie (EF postgame-analyze).',
   'AI post-game review (postgame-analyze EF).'),

  -- ·· Contenu ··
  ('patch_notes_enabled', 'true', 'kill', 'shared', 'contenu', NULL, 'notice', true, 500,
   'Patch notes', 'Patch notes',
   'Consultation des patch notes — onglet dédié, page /patch-notes et EF patch-notes.',
   'Patch notes browsing — the dedicated tab, the /patch-notes page and the patch-notes EF.'),

  ('workshop_builds_enabled', 'true', 'kill', 'shared', 'contenu', NULL, 'notice', true, 510,
   'Atelier — builds', 'Workshop — builds',
   'Partage communautaire de builds : consultation ET publication.',
   'Community build sharing: browsing AND publishing.'),

  ('workshop_jungle_enabled', 'true', 'kill', 'shared', 'contenu', NULL, 'notice', true, 520,
   'Atelier — parcours jungle', 'Workshop — jungle paths',
   'Partage communautaire de parcours jungle : consultation ET publication.',
   'Community jungle path sharing: browsing AND publishing.'),

  -- ·· Site ··
  ('ads_enabled', 'true', 'kill', 'web', 'site', NULL, 'hidden', true, 600,
   'Publicités', 'Advertising',
   'Emplacements publicitaires du site (AdSlot, rail du dashboard). Coupé, aucun emplacement n''est rendu.',
   'Site ad slots (AdSlot, dashboard rail). When off, no slot is rendered.'),

  ('player_search_enabled', 'true', 'kill', 'web', 'site', NULL, 'notice', true, 610,
   'Recherche de joueur', 'Player search',
   'Recherche publique de joueurs et pages /matches, /summoner, /live.',
   'Public player search and the /matches, /summoner and /live pages.'),

  ('prac_enabled', 'true', 'kill', 'web', 'site', NULL, 'notice', true, 620,
   'Outil prac', 'Prac tool',
   'Sous-domaine interne de suivi de joueurs (prac).',
   'Internal player-tracking subdomain (prac).'),

  -- ·· App WPF — hors overlay ··
  ('champ_select_advisor_enabled', 'true', 'kill', 'app', 'app', NULL, 'hidden', true, 700,
   'Conseiller de champion select', 'Champion select advisor',
   'Fenêtre de conseil affichée pendant le champion select.',
   'Advisory window shown during champion select.'),

  -- ⚠️ Les DEUX flags suivants gardent les seules features qui écrivent HORS
  -- du périmètre de l'app, dans les fichiers du client League. Ce sont les
  -- kill switches à plus forte valeur du lot.
  ('item_set_export_enabled', 'true', 'kill', 'app', 'app', NULL, 'hidden', true, 710,
   'Export des sets d''objets', 'Item set export',
   'ÉCRIT DANS LES FICHIERS DU CLIENT LEAGUE : exporte les builds actifs vers les sets d''objets natifs.',
   'WRITES INTO THE LEAGUE CLIENT FILES: exports active builds to the native item sets.'),

  ('rune_page_apply_enabled', 'true', 'kill', 'app', 'app', NULL, 'hidden', true, 720,
   'Application des pages de runes', 'Rune page apply',
   'MODIFIE LA PAGE DE RUNES DU JOUEUR via l''API LCU au moment du pick.',
   'MODIFIES THE PLAYER''S RUNE PAGE through the LCU API at pick time.'),

  ('minimap_detection_enabled', 'true', 'kill', 'app', 'app', NULL, 'hidden', true, 730,
   'Détection de minimap', 'Minimap detection',
   'Détection de la géométrie de minimap par capture d''écran.',
   'Minimap geometry detection through screen capture.'),

  -- ·· Overlay — le maître ··
  -- off_behavior='hidden' et non 'notice' : en jeu, personne ne lit un encart —
  -- il n'y a ni place ni attention disponibles, et un message flottant sur la
  -- map serait pire que le bug qu'on coupe. Un overlay coupé NE SE DESSINE PAS.
  -- L'explication vit dans l'onglet Overlay de l'app, où la case correspondante
  -- apparaît désactivée : c'est le seul endroit où l'utilisateur va chercher.
  ('overlay_enabled', 'true', 'kill', 'app', 'overlay', NULL, 'hidden', true, 800,
   'Overlay in-game (MAÎTRE)', 'In-game overlay (MASTER)',
   'Coupe TOUT l''overlay : la fenêtre n''est plus ouverte du tout en partie. Parent des 18 flags par option ci-dessous.',
   'Kills the WHOLE overlay: the window is no longer opened during a game. Parent of the 18 per-option flags below.')
ON CONFLICT (key) DO UPDATE SET
  kind = EXCLUDED.kind, surface = EXCLUDED.surface, group_key = EXCLUDED.group_key,
  parent_key = EXCLUDED.parent_key, off_behavior = EXCLUDED.off_behavior,
  is_public = EXCLUDED.is_public, sort_order = EXCLUDED.sort_order,
  label_fr = EXCLUDED.label_fr, label_en = EXCLUDED.label_en,
  desc_fr = EXCLUDED.desc_fr, desc_en = EXCLUDED.desc_en;

-- ── 5.d  Overlay : 18 flags, parité 1:1 avec Models/OverlayConfig.cs ────────
-- Un flag par propriété `Show*` de OverlayConfig, dans l'ordre du fichier. Les
-- clés reprennent LE NOM EXACT de la propriété en snake_case, redondance
-- « show » comprise : la correspondance flag ↔ propriété doit rester mécanique
-- et vérifiable à l'œil, c'est ce qui permettra au test de parité côté C#
-- d'être un simple parcours de la classe.
--
-- ⚠️ `OverlayConfig` porte 19 booléens. Le 19ᵉ, `UseTimelineView`, est ABSENT
-- ici volontairement : ce n'est pas un toggle de visibilité mais un choix de
-- MODE d'affichage exclusif (timers classiques ↔ frise). Le couper ne
-- masquerait rien, il forcerait l'utilisateur dans l'autre mode — ce que le
-- flag maître `overlay_show_objective_timers` fait déjà proprement s'il faut
-- neutraliser les objectifs. Si le besoin apparaît, c'est un INSERT de plus.
--
-- Tous enfants directs de `overlay_enabled` (hiérarchie plate, décidée) : la
-- hiérarchie interne (le maître local `ShowObjectiveTimers` au-dessus des 7
-- timers d'objectifs) reste une affaire de préférence utilisateur, côté app.
INSERT INTO public.app_settings
  (key, value, kind, surface, group_key, parent_key, off_behavior, is_public,
   sort_order, label_fr, label_en, desc_fr, desc_en)
VALUES
  ('overlay_show_objective_timers', 'true', 'kill', 'app', 'overlay', 'overlay_enabled', 'hidden', true, 810,
   'Timers d''objectifs (maître local)', 'Objective timers (local master)',
   'Bloc objectifs dans son ensemble — badges classiques ET frise chronologique.',
   'The objectives block as a whole — classic badges AND the timeline view.'),
  ('overlay_show_baron_timer', 'true', 'kill', 'app', 'overlay', 'overlay_enabled', 'hidden', true, 820,
   'Timer Baron', 'Baron timer',
   'Compte à rebours de réapparition du Baron Nashor.',
   'Baron Nashor respawn countdown.'),
  ('overlay_show_herald_timer', 'true', 'kill', 'app', 'overlay', 'overlay_enabled', 'hidden', true, 830,
   'Timer Héraut', 'Herald timer',
   'Compte à rebours de réapparition du Héraut de la Faille.',
   'Rift Herald respawn countdown.'),
  ('overlay_show_voidgrub_timer', 'true', 'kill', 'app', 'overlay', 'overlay_enabled', 'hidden', true, 840,
   'Timer Larves du Néant', 'Voidgrub timer',
   'Compte à rebours de réapparition des Larves du Néant.',
   'Voidgrub respawn countdown.'),
  ('overlay_show_drake_timer', 'true', 'kill', 'app', 'overlay', 'overlay_enabled', 'hidden', true, 850,
   'Timer Dragon', 'Drake timer',
   'Compte à rebours de réapparition du Dragon.',
   'Drake respawn countdown.'),
  ('overlay_show_drake_score', 'true', 'kill', 'app', 'overlay', 'overlay_enabled', 'hidden', true, 860,
   'Score de dragons', 'Drake score',
   'Décompte des dragons pris par chaque équipe.',
   'Count of drakes taken by each team.'),
  ('overlay_show_baron_buff', 'true', 'kill', 'app', 'overlay', 'overlay_enabled', 'hidden', true, 870,
   'Buff Baron', 'Baron buff',
   'Durée restante du buff Baron actif.',
   'Remaining duration of the active Baron buff.'),
  ('overlay_show_elder_buff', 'true', 'kill', 'app', 'overlay', 'overlay_enabled', 'hidden', true, 880,
   'Buff Dragon Ancestral', 'Elder buff',
   'Durée restante du buff Dragon Ancestral actif.',
   'Remaining duration of the active Elder Dragon buff.'),
  ('overlay_show_enemy_tracker', 'true', 'kill', 'app', 'overlay', 'overlay_enabled', 'hidden', true, 890,
   'Tracker de sorts ennemis', 'Enemy spell tracker',
   'Suivi des cooldowns de sorts d''invocateur ennemis.',
   'Tracking of enemy summoner spell cooldowns.'),
  ('overlay_show_gold_diff', 'true', 'kill', 'app', 'overlay', 'overlay_enabled', 'hidden', true, 900,
   'Différence d''or', 'Gold difference',
   'Écart d''or entre les deux équipes.',
   'Gold gap between the two teams.'),
  ('overlay_show_stats_panel', 'true', 'kill', 'app', 'overlay', 'overlay_enabled', 'hidden', true, 910,
   'Panneau de stats', 'Stats panel',
   'Panneau de statistiques du joueur en partie.',
   'In-game player statistics panel.'),
  ('overlay_show_todo_panel', 'true', 'kill', 'app', 'overlay', 'overlay_enabled', 'hidden', true, 920,
   'Panneau to-do', 'To-do panel',
   'Liste de rappels personnels affichée en partie.',
   'Personal reminder list shown during the game.'),
  ('overlay_show_spell_damage', 'true', 'kill', 'app', 'overlay', 'overlay_enabled', 'hidden', true, 930,
   'Dégâts des sorts', 'Spell damage',
   'Estimation des dégâts des sorts sur les cibles ennemies.',
   'Estimated spell damage against enemy targets.'),
  ('overlay_show_path_minimap', 'true', 'kill', 'app', 'overlay', 'overlay_enabled', 'hidden', true, 940,
   'Parcours jungle sur la minimap', 'Jungle path on minimap',
   'Tracé du parcours jungle actif superposé à la minimap.',
   'Active jungle path drawn over the minimap.'),
  ('overlay_show_path_list', 'true', 'kill', 'app', 'overlay', 'overlay_enabled', 'hidden', true, 950,
   'Parcours jungle en liste', 'Jungle path as a list',
   'Étapes du parcours jungle actif sous forme de liste.',
   'Steps of the active jungle path as a list.'),
  ('overlay_show_item_build', 'true', 'kill', 'app', 'overlay', 'overlay_enabled', 'hidden', true, 960,
   'Build d''objets actif', 'Active item build',
   'Panneau du build d''objets actif pour le champion joué.',
   'Active item build panel for the champion being played.'),
  ('overlay_show_inhib_timers', 'true', 'kill', 'app', 'overlay', 'overlay_enabled', 'hidden', true, 970,
   'Timers d''inhibiteurs', 'Inhibitor timers',
   'Compte à rebours de réapparition des inhibiteurs sur la minimap.',
   'Inhibitor respawn countdowns on the minimap.'),
  ('overlay_show_comeback_panel', 'true', 'kill', 'app', 'overlay', 'overlay_enabled', 'hidden', true, 980,
   'Indicateur de comeback', 'Comeback indicator',
   'Indicateur de potentiel de comeback (n''apparaît qu''à partir de 20:00 de jeu).',
   'Comeback potential indicator (only shows from 20:00 game time).')
ON CONFLICT (key) DO UPDATE SET
  kind = EXCLUDED.kind, surface = EXCLUDED.surface, group_key = EXCLUDED.group_key,
  parent_key = EXCLUDED.parent_key, off_behavior = EXCLUDED.off_behavior,
  is_public = EXCLUDED.is_public, sort_order = EXCLUDED.sort_order,
  label_fr = EXCLUDED.label_fr, label_en = EXCLUDED.label_en,
  desc_fr = EXCLUDED.desc_fr, desc_en = EXCLUDED.desc_en;

-- ════════════════════════════════════════════════════════════════════════════
--  6. GARDE-FOU — un flag est toujours COMPLET
-- ════════════════════════════════════════════════════════════════════════════
-- Posée APRÈS le backfill (une contrainte CHECK est validée sur les lignes
-- existantes au moment de l'ADD). C'est le filet qui remplace l'erreur de
-- compilation perdue en sortant les libellés du dico typé : un flag inséré
-- sans libellé, sans convention de coupure ou sans section serait un
-- interrupteur muet dans le panneau admin. Ici, c'est un échec d'INSERT.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'app_settings_flag_metadata_complete'
      AND conrelid = 'public.app_settings'::regclass
  ) THEN
    ALTER TABLE public.app_settings
      ADD CONSTRAINT app_settings_flag_metadata_complete
      CHECK (
        kind = 'setting'
        OR (
          label_fr     IS NOT NULL AND label_en IS NOT NULL
          AND desc_fr  IS NOT NULL AND desc_en  IS NOT NULL
          AND surface  IS NOT NULL
          AND group_key    IS NOT NULL
          AND off_behavior IS NOT NULL
        )
      );
  END IF;
END $$;
