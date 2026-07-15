-- Migration 20260705000002 : primitive prac_caller_puuid() + wrapper d'accès
-- prac_caller_in_match() + extension RLS tm_select
-- (chantier « accès lecture 3 niveaux », Lot B).
--
-- Construit le 3e niveau d'accès en lecture aux matchs trackés (catégorie 3) :
-- un co-joueur ayant un compte Riot lié (profiles.riot_puuid) présent dans les
-- participants d'un match tracké peut lire CE match précis — sans être ni admin
-- prac ni le joueur tracké lui-même.
--
-- Deux niveaux existants (lot 3A, migration 20260627000002) sont conservés intacts :
--   cat. 1 : admin prac (is_prac_admin) → voit tout.
--   cat. 2 : self (tracked_players.profile_id = auth.uid()) → voit ses propres matchs.
-- Ce lot AJOUTE :
--   cat. 3 : co-joueur lié (puuid ∈ tracked_match_participants du match).
--
-- ⚠️ POURQUOI UN WRAPPER SECURITY DEFINER ET PAS UN « EXISTS » DIRECT DANS LA POLICY.
-- tracked_match_participants est deny-all client (migration 20260705000001 :
-- REVOKE ALL FROM authenticated, aucune policy). Or les expressions d'une RLS
-- policy s'exécutent AVEC LES PRIVILÈGES DE L'APPELANT : un `EXISTS (SELECT 1 FROM
-- tracked_match_participants …)` écrit directement dans tm_select ferait échouer
-- TOUTE lecture de tracked_matches par un authenticated avec « permission denied
-- for table tracked_match_participants » (42501) — la table n'étant pas GRANTée.
-- Le contrat Lot A l'anticipe explicitement : « lecture réservée aux fonctions
-- SECURITY DEFINER (Lots B/C) ». On passe donc par prac_caller_in_match() (owner
-- postgres → bypass RLS + REVOKE de la table), qui n'expose JAMAIS les puuids :
-- elle ne renvoie qu'un booléen.
--
-- Dépend de : tracked_matches + tm_select (20260627000002),
--             tracked_match_participants (20260705000001),
--             profiles.riot_puuid, is_prac_admin(uuid).
-- Idempotent : CREATE OR REPLACE + DROP/CREATE POLICY.

-- ── 1. Primitive prac_caller_puuid() ─────────────────────────────────────────
-- Résout le riot_puuid de l'appelant (auth.uid()). SECURITY DEFINER car la RLS de
-- profiles n'autorise un user qu'à lire SON profil — ici on ne lit QUE la ligne de
-- l'appelant lui-même (WHERE id = auth.uid()), donc aucune élévation réelle : la
-- fonction ne peut jamais retourner le puuid d'autrui.
--
-- Retourne NULL si l'appelant n'a pas de compte Riot lié (riot_puuid IS NULL) OU
-- s'il n'existe pas de profil (auth.uid() NULL / anon) — JAMAIS d'erreur : un
-- utilisateur sans compte lié ne plante pas, il n'obtient simplement aucun accès
-- cat. 3 (le NULL rend `puuid = prac_caller_puuid()` non-vrai → 0 ligne).
CREATE OR REPLACE FUNCTION public.prac_caller_puuid()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT riot_puuid FROM public.profiles WHERE id = auth.uid();
$$;

REVOKE EXECUTE ON FUNCTION public.prac_caller_puuid() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.prac_caller_puuid() TO authenticated;

-- ── 2. Wrapper d'accès prac_caller_in_match() ────────────────────────────────
-- Booléen : « le puuid de l'appelant figure-t-il dans les participants de ce match
-- tracké ? ». SECURITY DEFINER (owner postgres) → lit tracked_match_participants en
-- bypass du REVOKE ALL + RLS de la table, SANS jamais exposer les puuids (ne renvoie
-- qu'un boolean). prac_caller_puuid() NULL → EXISTS false → pas d'accès. C'est ce
-- wrapper (et non un accès direct à la table) qui est référencé par tm_select.
CREATE OR REPLACE FUNCTION public.prac_caller_in_match(p_tracked_match_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.tracked_match_participants tmp
     WHERE tmp.tracked_match_id = p_tracked_match_id
       AND tmp.puuid = public.prac_caller_puuid()
  );
$$;

REVOKE EXECUTE ON FUNCTION public.prac_caller_in_match(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.prac_caller_in_match(uuid) TO authenticated;

-- ── 3. Extension de la policy tm_select ──────────────────────────────────────
-- Ajoute la 3e branche (co-joueur lié). Les deux branches existantes (admin prac,
-- self) sont RECOPIÉES À L'IDENTIQUE — DROP/CREATE remplace la policy entière.
DROP POLICY IF EXISTS tm_select ON public.tracked_matches;

CREATE POLICY tm_select ON public.tracked_matches
  FOR SELECT
  USING (
    public.is_prac_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.tracked_players tp
       WHERE tp.id = tracked_matches.tracked_player_id
         AND tp.profile_id = auth.uid()
    )
    -- cat. 3 : le puuid de l'appelant figure dans les participants de CE match.
    -- Via wrapper SECURITY DEFINER (accès direct à la table deny-all impossible).
    OR public.prac_caller_in_match(tracked_matches.id)
  );
