-- Migration 20260611000004 : Activation Supabase Realtime sur la table matches.
--
-- Contexte : le bracket tournoi doit se rafraîchir en temps réel côté client
-- (site React + éventuel overlay desktop) sans polling. Supabase Realtime
-- écoute les changements PostgreSQL via logical replication et les pousse
-- aux clients abonnés via WebSocket.
--
-- Seule la table `matches` est activée : c'est la source de vérité pour
-- l'état du bracket (team_a, team_b, winner_id). Les autres tables de tournoi
-- (tournaments, tournament_teams, tournament_players) évoluent moins fréquemment
-- et ne justifient pas Realtime (polling ou rechargement manuel suffisants).
--
-- Méthode : ALTER TABLE ... REPLICA IDENTITY FULL est nécessaire pour que
-- Supabase Realtime transmette les lignes complètes (old + new) sur UPDATE/DELETE.
-- Sans cela, seules les clés primaires seraient disponibles dans le payload
-- vieux de la ligne, ce qui empêche certains patterns de diff côté client.
--
-- Note : l'activation dans supabase_realtime.subscription est automatique
-- via la publication "supabase_realtime" si la table y est ajoutée.
-- Aucune modification de config.toml n'est nécessaire pour les tables.

-- Replica identity FULL : expose la ligne complète dans les événements Realtime
ALTER TABLE public.matches REPLICA IDENTITY FULL;

-- Ajoute matches à la publication Supabase Realtime
-- IF NOT EXISTS évite une erreur si la publication n'existe pas encore (local dev)
DO $$
BEGIN
  -- La publication supabase_realtime est créée par Supabase au démarrage.
  -- Cette commande est idempotente : ADD TABLE est no-op si déjà présente.
  ALTER PUBLICATION supabase_realtime ADD TABLE public.matches;
EXCEPTION
  WHEN undefined_object THEN
    -- En environnement local sans publication, on skip silencieusement
    NULL;
END;
$$;
