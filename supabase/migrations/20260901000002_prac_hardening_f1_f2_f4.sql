-- ════════════════════════════════════════════════════════════════════════════
--  DURCISSEMENT DU MODULE PRAC — F1 + F2 + F4
-- ════════════════════════════════════════════════════════════════════════════
-- Trois constats d'un audit manuel du module prac, groupés ici parce qu'ils
-- partagent la même nature : aucun n'est un trou exploitable aujourd'hui, tous
-- les trois sont des écarts au moindre privilège qui ne demandent qu'un
-- changement de contexte pour le devenir.
--
-- ⚠️ NE CONFOND PAS avec les lots F* déjà présents dans le dépôt
-- (20260715000001_f2_search_path_increment_fns, 20260715000002_f4_restrict_
-- insert_certified, …) : ceux-là portent sur d'autres tables et sont appliqués
-- depuis juillet. La numérotation F1/F2/F4 ci-dessous est celle de l'audit prac.
--
-- ────────────────────────────────────────────────────────────────────────────
-- F1 — `REVOKE ... FROM PUBLIC` est un NO-OP sur les fonctions prac
-- ────────────────────────────────────────────────────────────────────────────
-- Les migrations du module font toutes `REVOKE EXECUTE ... FROM PUBLIC` puis
-- `GRANT EXECUTE ... TO authenticated`. Or Supabase applique des
-- ALTER DEFAULT PRIVILEGES qui accordent EXECUTE **nominativement** à `anon` et
-- `authenticated` sur toute nouvelle fonction de `public`. Un REVOKE FROM PUBLIC
-- ne retire que le grant du pseudo-rôle PUBLIC : le grant nominatif d'`anon`
-- survit intact. Confirmé par sonde SQL directe sur la base.
--
-- C'est exactement le motif déjà corrigé pour d'autres fonctions par
-- 20260731000002_revoke_definer_anon.sql — le module prac n'avait pas été inclus.
--
-- IMPACT FONCTIONNEL ATTENDU : AUCUN. On ne retire que le rôle `anon`,
-- `authenticated` conserve son EXECUTE. Vérifié avant écriture, chemin par
-- chemin :
--   • 5 de ces fonctions SONT appelées depuis le navigateur —
--     prac_player_stats, prac_search_profiles, prac_top_winrate,
--     request_tracking (pages /prac/*), respond_consent + prac_player_stats
--     (page /consent). Toutes derrière une garde de session :
--       – `src/app/prac/layout.tsx` est un server component qui `redirect()`
--         si `!user`, puis vérifie `prac_admins` ;
--       – `src/app/consent/page.tsx` fait `getUser()` et sort en retour
--         anticipé si `!user`.
--     Ces appels partent donc toujours sous JWT `authenticated`, jamais `anon`.
--   • is_prac_admin est appelée DANS les policies `tp_select` / `tm_select`.
--     L'expression d'une policy s'évalue avec les droits du rôle appelant :
--     lui retirer EXECUTE à `authenticated` casserait toute lecture de
--     tracked_players. On ne touche donc QUE `anon`, qui n'a de toute façon
--     aucun privilège sur ces tables (20260627000002 / 20260627000003) et
--     échoue au niveau table avant même d'évaluer la policy.
--   • prac_caller_puuid, prac_caller_in_match, prac_related_players,
--     prac_visible_match_ids, remove_tracking : aucun appel dans `src/` ni dans
--     `supabase/functions/` — elles ne sont atteintes que depuis d'autres
--     fonctions SQL, qui sont SECURITY DEFINER et ne dépendent donc pas des
--     grants de l'appelant.
--
-- ────────────────────────────────────────────────────────────────────────────
-- F2 — `prac_admins` est la seule table du module sans le patron REVOKE/GRANT
-- ────────────────────────────────────────────────────────────────────────────
-- Les 4 autres tables du module (tracked_players, tracked_matches,
-- tracked_match_participants, prac_notification_log) portent le patron de
-- 20260627000003 : `REVOKE ALL FROM anon, authenticated` puis GRANT minimal.
-- `prac_admins` ne l'a jamais reçu : elle garde le GRANT ALL par défaut de
-- Supabase pour `anon` ET `authenticated`.
--
-- Ce qui la protège aujourd'hui n'est PAS un privilège, c'est le prédicat
-- `auth.uid() = user_id` de `pa_select_self`, qui vaut NULL pour `anon` et donc
-- ne laisse passer aucune ligne. Exactement la même fragilité que `scenarios`
-- (cf. 20260901000003) : la protection tient à l'évaluation d'un prédicat, pas
-- au modèle de droits. Une policy ajoutée sans clause `TO`, ou un prédicat
-- réécrit sans y penser, suffirait à ouvrir la table.
--
-- `pa_select_self` n'a pas de clause `TO` — elle vise donc PUBLIC, `anon`
-- compris. On la recrée `TO authenticated`, comme les policies `scn_*` et
-- `tp_select`.
--
-- IMPACT FONCTIONNEL ATTENDU : AUCUN. Le seul lecteur client de `prac_admins`
-- est `src/app/prac/layout.tsx`, sous JWT utilisateur (`authenticated`) → le
-- GRANT SELECT ci-dessous le couvre. Les écritures passent par service_role,
-- non concerné par ces grants.
--
-- ────────────────────────────────────────────────────────────────────────────
-- F4 — le modèle de consentement n'est pas une contrainte de base
-- ────────────────────────────────────────────────────────────────────────────
-- Règle de cadrage du module : aucune donnée Riot d'un joueur n'est stockée
-- tant que son consentement n'est pas `accepted`. Aujourd'hui cette règle vit
-- UNIQUEMENT dans le corps de `prac_commit_tracked_matches`, qui fait
-- `SELECT status ... FOR SHARE` et lève `player_not_accepted`.
--
-- Pas de trou réel à ce jour : cette RPC est le seul chemin d'écriture vers
-- `tracked_matches` (vérifié sur `src/`, `supabase/functions/` et les
-- migrations ; la table n'a aucune policy INSERT, donc aucune écriture client
-- n'est possible). Mais rien de STRUCTUREL ne l'empêche : une future EF en
-- service_role, un backfill, un `INSERT` manuel en SQL Editor contournent tous
-- la règle sans rien violer.
--
-- On la descend donc au niveau de la table, là où elle ne peut plus être
-- contournée par un nouveau chemin d'écriture.
--
-- IMPACT FONCTIONNEL ATTENDU : AUCUN. Sur le chemin nominal, la RPC a déjà
-- levé `player_not_accepted` avant d'insérer — le trigger ne se déclenche
-- jamais. C'est de la défense en profondeur, pas un changement de comportement.
-- ════════════════════════════════════════════════════════════════════════════


-- ── F1. Retrait explicite du grant nominatif d'`anon` ───────────────────────
-- `FROM anon` et pas `FROM PUBLIC` : c'est tout l'objet du correctif.
-- `authenticated` n'est PAS touché (cf. en-tête : policies + appels client).
-- Signatures données par types seuls — sans ambiguïté et insensible aux
-- renommages de paramètres ou aux valeurs DEFAULT.

REVOKE ALL ON FUNCTION public.is_prac_admin(uuid)                 FROM anon;
REVOKE ALL ON FUNCTION public.prac_caller_puuid()                 FROM anon;
REVOKE ALL ON FUNCTION public.prac_caller_in_match(uuid)          FROM anon;
REVOKE ALL ON FUNCTION public.prac_player_stats(uuid)             FROM anon;
REVOKE ALL ON FUNCTION public.prac_related_players()              FROM anon;
REVOKE ALL ON FUNCTION public.prac_search_profiles(text, int)     FROM anon;
REVOKE ALL ON FUNCTION public.prac_top_winrate(int)               FROM anon;
REVOKE ALL ON FUNCTION public.prac_visible_match_ids(uuid, uuid)  FROM anon;
REVOKE ALL ON FUNCTION public.request_tracking(uuid)              FROM anon;
REVOKE ALL ON FUNCTION public.remove_tracking(uuid)               FROM anon;
REVOKE ALL ON FUNCTION public.respond_consent(text)               FROM anon;


-- ── F2. `prac_admins` alignée sur le patron des 4 autres tables ─────────────
-- Même forme que 20260627000003 (tracked_players), au verbe près.

REVOKE ALL ON public.prac_admins FROM anon, authenticated;
GRANT SELECT ON public.prac_admins TO authenticated;   -- anon : aucun privilège

-- Recréation de la policy avec la clause `TO` manquante. Le prédicat est
-- inchangé : on ne corrige ici QUE le rôle visé.
-- (Non fait volontairement : passer à `(SELECT auth.uid())` comme les policies
-- `scn_*` — c'est une optimisation d'initplan, sans rapport avec ce lot.)
DROP POLICY IF EXISTS pa_select_self ON public.prac_admins;
CREATE POLICY pa_select_self ON public.prac_admins
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);


-- ── F4. Le consentement devient une contrainte de table ─────────────────────
-- SECURITY DEFINER : la RLS `tp_select` de tracked_players ne laisse voir que
-- sa propre ligne (ou tout, pour un admin prac). Sans DEFINER, un contexte
-- appelant non-admin lirait NULL et l'on lèverait un `tracked_player_not_found`
-- trompeur au lieu d'un `player_not_accepted`.
--
-- FOR SHARE, et pas un SELECT nu : c'est ce qui rend la garantie réellement
-- structurelle. Le verrou entre en conflit avec le FOR UPDATE que
-- `respond_consent` prend sur la même ligne au revoke → un INSERT concurrent et
-- un revoke se sérialisent au lieu de se croiser. Même verrou que celui déjà
-- pris par `prac_commit_tracked_matches` : sur le chemin nominal les deux sont
-- dans la même transaction, donc aucun conflit ni risque d'interblocage.
--
-- Messages d'erreur repris À L'IDENTIQUE de `prac_commit_tracked_matches` :
-- l'EF `prac-track` mappe déjà `player_not_accepted` → 403 et
-- `tracked_player_not_found` → 404 sur le texte du message.
create or replace function public.fn_tracked_matches_require_consent()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $fn$
declare
  v_status text;
begin
  select status into v_status
    from public.tracked_players
   where id = new.tracked_player_id
     for share;

  if v_status is null then
    raise exception 'tracked_player_not_found';
  end if;

  if v_status <> 'accepted' then
    raise exception 'player_not_accepted';
  end if;

  return new;
end;
$fn$;

comment on function public.fn_tracked_matches_require_consent() is
  'Garde de consentement sur tracked_matches : refuse tout INSERT dont le tracked_player parent n est pas accepted. Defense en profondeur — le chemin nominal (prac_commit_tracked_matches) leve deja avant d inserer.';

-- Les ALTER DEFAULT PRIVILEGES du projet accordent EXECUTE nominativement à
-- anon et authenticated sur les fonctions de `public` : le REVOKE FROM PUBLIC
-- seul ne suffirait pas (même motif que F1 ci-dessus). Une fonction
-- `returns trigger` n'est pas appelable en RPC, mais on ne laisse pas un
-- SECURITY DEFINER avec un grant applicatif.
revoke all on function public.fn_tracked_matches_require_consent() from public;
revoke all on function public.fn_tracked_matches_require_consent() from anon;
revoke all on function public.fn_tracked_matches_require_consent() from authenticated;

drop trigger if exists trg_tracked_matches_require_consent on public.tracked_matches;

create trigger trg_tracked_matches_require_consent
before insert on public.tracked_matches
for each row execute function public.fn_tracked_matches_require_consent();


-- ── Vérification (à jouer après le push) ────────────────────────────────────
-- a) F1 — plus aucun EXECUTE pour `anon` sur les 11 fonctions :
--      select p.proname, r.rolname, a.privilege_type
--        from pg_proc p
--        join pg_namespace n on n.oid = p.pronamespace
--        cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
--        join pg_roles r on r.oid = a.grantee
--       where n.nspname = 'public'
--         and r.rolname = 'anon'
--         and p.proname in ('is_prac_admin','prac_caller_puuid','prac_caller_in_match',
--                           'prac_player_stats','prac_related_players','prac_search_profiles',
--                           'prac_top_winrate','prac_visible_match_ids','request_tracking',
--                           'remove_tracking','respond_consent');
--    → attendu : 0 ligne.
--
-- b) F2 — privilèges de table sur prac_admins :
--      select grantee, privilege_type
--        from information_schema.role_table_grants
--       where table_schema = 'public' and table_name = 'prac_admins'
--         and grantee in ('anon','authenticated');
--    → attendu : authenticated | SELECT, et RIEN pour anon.
--
--      select polname, polroles::regrole[] from pg_policy
--       where polrelid = 'public.prac_admins'::regclass;
--    → attendu : pa_select_self | {authenticated}  (et non {-} = PUBLIC)
--
-- c) F4 — le trigger est en place :
--      select tgname from pg_trigger
--       where tgrelid = 'public.tracked_matches'::regclass and not tgisinternal;
--    → attendu : trg_tracked_matches_require_consent
--
--    Contrôle négatif (sur un projet de test uniquement) : un INSERT direct
--    visant un tracked_player 'pending' doit lever `player_not_accepted`.
