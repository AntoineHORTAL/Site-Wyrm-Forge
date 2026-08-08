-- Lot 1 « builds items actifs en jeu » — ordre de priorité des builds PAR CHAMPION
--
-- CONTEXTE
-- L'app de bureau affiche désormais, au champion détecté en partie, le build ACTIF de plus
-- haute priorité pour ce champion, avec un menu déroulant vers les autres. Il faut donc un
-- ordre stable entre plusieurs builds d'un même champion.
--
-- POURQUOI CETTE COLONNE EST SYNCHRONISÉE (alors que « actif » ne l'est pas)
--   • « ce build est actif » = un choix LOCAL à la machine (quels panneaux j'affiche sur CE PC)
--     → reste dans %APPDATA%\Logiciel-Assistant-LOL\itembuilds.json, aucune colonne ici.
--   • « je préfère ce build à celui-là sur Lee Sin » = un choix qui appartient au COMPTE
--     → doit suivre l'utilisateur d'une machine à l'autre, donc en base.
--
-- CONVENTION : ORDRE CROISSANT, LE PLUS PETIT GAGNE.
--   0 = build affiché par défaut en jeu, 1 = deuxième entrée du menu, etc.
--   Les égalités sont normales (toutes les lignes existantes valent 0 après cette migration) ;
--   le client les départage de façon déterministe par created_at puis id. Les valeurs ne sont
--   réindexées 0..n-1 que lorsque l'utilisateur réordonne explicitement son groupe.
--
-- RÈGLE D'OR DU PROJET — IMPACT SUR L'AUTRE CLIENT (site React) : AUCUN.
--   • Changement purement ADDITIF : colonne nouvelle, NOT NULL avec DEFAULT 0, donc les lignes
--     existantes sont remplies sans réécriture applicative et aucun INSERT existant ne casse.
--   • Le site fait `select('*')` → il reçoit la colonne en plus et l'ignore.
--   • Le site fait `update(payload)` SANS `priority` → un UPDATE partiel ne touche pas les
--     colonnes absentes du payload : éditer un build depuis le site ne remet PAS sa priorité à 0.
--   • Le site fait `insert({...payload, user_id})` SANS `priority` → le DEFAULT 0 s'applique,
--     le build créé depuis le site arrive en tête de son champion. Comportement voulu.
--
-- RLS : inchangée. item_builds porte une policy ALL TO authenticated
--       USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid()) — cf. migration
--       20260530000005. Une policy porte sur la LIGNE, pas sur la liste des colonnes : la
--       nouvelle colonne est donc couverte par la policy existante, rien à ajouter.
--
-- PAS D'INDEX : le tri se fait côté client sur les quelques builds d'un même utilisateur,
--       déjà tous chargés en mémoire. Un index sur priority ne servirait aucune requête.

ALTER TABLE public.item_builds
  ADD COLUMN IF NOT EXISTS priority integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.item_builds.priority IS
  'Rang d''affichage du build dans son groupe de champion (jamais global). Ordre CROISSANT : '
  '0 = build proposé par défaut dans l''overlay in-game, 1 = suivant, etc. Les égalités sont '
  'départagées côté client par created_at puis id. Écrite par l''app de bureau ; le site ne '
  'renseigne pas cette colonne et laisse jouer le DEFAULT.';
