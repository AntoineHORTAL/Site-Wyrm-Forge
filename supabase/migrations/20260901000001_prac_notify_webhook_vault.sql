-- ════════════════════════════════════════════════════════════════════════════
--  SÉCURITÉ — sortie du secret du webhook `prac-notify` du catalogue Postgres
-- ════════════════════════════════════════════════════════════════════════════
-- ÉTAT AVANT CETTE MIGRATION
-- --------------------------
-- Le déclencheur de l'EF `prac-notify` est un Database Webhook créé À LA MAIN
-- dans le Dashboard (Lot 5E) : un trigger AFTER INSERT OR UPDATE sur
-- `public.tracked_players` qui appelle `supabase_functions.http_request()`. Les
-- arguments de cet appel — URL, méthode, ET l'en-tête
-- `X-Internal-Token: <PRAC_WEBHOOK_SECRET>` — sont stockés EN CLAIR dans
-- `pg_trigger.tgargs`.
--
-- Ce secret n'est pas dans Git, mais :
--   • il est lisible par quiconque peut lire `pg_trigger` sur la prod ;
--   • `prac-notify` tourne en `verify_jwt = false` → ce header est sa SEULE
--     barrière. Le lire, c'est pouvoir déclencher des e-mails à volonté
--     (open relay) et brûler les créneaux d'idempotence de `prac_notify_claim`.
--
-- Effet de bord de ce trigger non versionné : son NOM diffère selon la base
-- (`prac-notify-tracked-players` en prod, `prac-notify-consent` en test) — piège
-- de diagnostic déjà consigné dans AGENTS.md §5E.
--
-- CE QUE FAIT CETTE MIGRATION
-- ---------------------------
-- 1. Supprime tout trigger de `tracked_players` passant par
--    `supabase_functions.http_request` — repéré PAR SA DÉFINITION, pas par son
--    nom, les noms n'étant pas alignés entre les environnements.
-- 2. Le remplace par un trigger versionné dont la fonction lit le secret ET
--    l'URL dans Vault À CHAQUE APPEL, et construit l'en-tête en mémoire. Le
--    catalogue ne contient plus rien de sensible.
--
-- ⚠️ PRÉ-REQUIS MANUEL — À FAIRE AVANT `db push`, SUR CHAQUE ENVIRONNEMENT
-- ------------------------------------------------------------------------
-- Les deux valeurs sont propres à l'environnement et n'entrent donc PAS dans
-- Git. À créer dans Vault (Dashboard → Settings → Vault, ou SQL Editor) :
--
--   select vault.create_secret(
--     '<valeur exacte du secret Edge Function PRAC_WEBHOOK_SECRET>',
--     'prac_webhook_secret',
--     'En-tete X-Internal-Token du webhook prac-notify');
--
--   select vault.create_secret(
--     'https://<project-ref>.supabase.co/functions/v1/prac-notify',
--     'prac_notify_url',
--     'URL de l EF prac-notify appelee par le trigger tracked_players');
--
-- La valeur du token à reprendre est celle du secret Edge Function
-- `PRAC_WEBHOOK_SECRET` (Dashboard → Edge Functions → Secrets) : c'est elle qui
-- fait foi côté EF. Inutile d'aller la relire dans `pg_trigger`.
--
-- COMPORTEMENT SI VAULT N'EST PAS RENSEIGNÉ
-- -----------------------------------------
-- `RAISE WARNING` dans les logs Postgres + AUCUN appel HTTP, et surtout : le
-- INSERT/UPDATE sur `tracked_players` PASSE QUAND MÊME. Choix délibéré — une
-- config de notification manquante ne doit pas casser l'ouverture d'une demande
-- de suivi. Contrepartie assumée : l'e-mail est perdu silencieusement pour
-- l'admin (visible seulement dans les logs Postgres). C'est aussi ce qui rend la
-- migration rejouable sur un environnement vierge sans risque : sans secret
-- Vault, le trigger existe mais ne poste NULLE PART — en particulier jamais vers
-- la prod, ce qu'une URL en dur dans la migration aurait provoqué.
--
-- MESURES FAITES SUR LA PROD AVANT D'ÉCRIRE CETTE MIGRATION (2026-09-01)
-- ----------------------------------------------------------------------
-- • `http_post` vit dans le schéma `net`, PAS dans `extensions` — bien que la
--   baseline porte `CREATE EXTENSION pg_net WITH SCHEMA extensions`. `pg_net`
--   crée son propre schéma `net` indépendamment du schéma déclaré à
--   l'installation. L'appel est donc qualifié en dur `net.http_post`, et le
--   `search_path` réduit à `pg_catalog, net`. Ne pas « corriger » en
--   `extensions.http_post` en se fiant au CREATE EXTENSION de la baseline.
-- • `vault.decrypted_secrets` est bien lisible par `postgres` : la vue répond
--   sans erreur de permission (0 ligne, aucun secret n'existant encore).
--
-- CE QUE CETTE MIGRATION NE FAIT PAS
-- ----------------------------------
-- • Elle ne TOURNE PAS le secret. Le token a été exposé en clair dans le
--   catalogue, donc la rotation reste à faire, séparément. Procédure, dans cet
--   ordre : (1) `vault.update_secret` avec la nouvelle valeur, (2) mise à jour
--   du secret Edge Function `PRAC_WEBHOOK_SECRET`, (3) redéploiement de l'EF.
--   Entre (1) et (3) les appels partent avec le nouveau token contre une EF qui
--   attend l'ancien → 401, et `pg_net` NE REJOUE PAS : les notifications de
--   cette fenêtre sont perdues, pas retardées. À faire à une heure creuse, ou
--   en faisant accepter deux secrets à l'EF le temps du basculement.
-- • Elle ne change pas le filtrage : le trigger fire toujours sur TOUT
--   INSERT/UPDATE, et c'est l'EF qui filtre (`relevantTransition`). La
--   sélectivité reste dans l'EF, comme décidé au Lot 5E. Maintenant que le
--   trigger nous appartient, une clause WHEN devient possible — hors périmètre.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Fonction de trigger ──────────────────────────────────────────────────
-- SECURITY DEFINER : `vault.decrypted_secrets` n'est lisible que par `postgres`,
-- alors que le trigger fire sous le rôle qui écrit dans `tracked_players`
-- (`service_role` via l'EF prac-track, ou `authenticated`).
--
-- search_path fixe, réduit au strict nécessaire et sans schéma applicatif :
-- `pg_catalog` pour les fonctions natives, `net` pour `http_post` (vérifié sur
-- la prod, cf. en-tête). L'appel est de toute façon qualifié en dur — le
-- `search_path` ne fait que verrouiller la résolution du reste.
create or replace function public.prac_notify_webhook()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, net
as $fn$
declare
  v_secret text;
  v_url    text;
begin
  -- Une seule lecture de Vault pour les deux valeurs.
  select max(case when name = 'prac_webhook_secret' then decrypted_secret end),
         max(case when name = 'prac_notify_url'     then decrypted_secret end)
    into v_secret, v_url
    from vault.decrypted_secrets
   where name in ('prac_webhook_secret', 'prac_notify_url');

  if v_secret is null or v_url is null then
    -- Jamais le contenu du secret dans un message de log : on ne journalise que
    -- la présence de chaque valeur.
    raise warning 'prac_notify_webhook: config Vault incomplete (secret=%, url=%) - aucune notification pour tracked_players.id=%',
      (v_secret is not null), (v_url is not null), new.id;
    return null;
  end if;

  -- Payload identique à celui de supabase_functions.http_request : l'EF lit
  -- { type, table, schema, record, old_record } — ne pas en changer la forme.
  perform net.http_post(
    url     => v_url,
    body    => jsonb_build_object(
                 'type',       tg_op,
                 'table',      tg_table_name,
                 'schema',     tg_table_schema,
                 'record',     to_jsonb(new),
                 'old_record', case when tg_op = 'UPDATE' then to_jsonb(old) else null end
               ),
    params  => '{}'::jsonb,
    headers => jsonb_build_object(
                 'Content-Type',     'application/json',
                 'X-Internal-Token', v_secret
               ),
    timeout_milliseconds => 5000
  );

  return null;  -- trigger AFTER : la valeur de retour est ignorée.
end;
$fn$;

comment on function public.prac_notify_webhook() is
  'Trigger du webhook prac-notify. Lit le token et l URL dans Vault a chaque appel : rien de sensible dans pg_trigger. Sans config Vault : warning + aucun POST, l ecriture passe quand meme.';

-- Les ALTER DEFAULT PRIVILEGES du projet accordent EXECUTE NOMINATIVEMENT à
-- anon et authenticated sur les fonctions de `public` : un REVOKE FROM PUBLIC
-- seul ne suffirait pas (cf. 20260731000002_revoke_definer_anon.sql). Une
-- fonction `returns trigger` n'est de toute façon pas appelable en RPC, mais on
-- ne laisse pas un SECURITY DEFINER qui lit Vault avec un grant applicatif.
revoke all on function public.prac_notify_webhook() from public;
revoke all on function public.prac_notify_webhook() from anon;
revoke all on function public.prac_notify_webhook() from authenticated;

-- ── 2. Retrait des webhooks Dashboard (secret en clair) ─────────────────────
-- Repérage par la définition (fonction appelée), pas par le nom : la prod porte
-- `prac-notify-tracked-players`, le projet de test `prac-notify-consent`.
do $drop$
declare
  r record;
begin
  for r in
    select t.tgname
      from pg_trigger t
      join pg_class     c  on c.oid  = t.tgrelid
      join pg_namespace n  on n.oid  = c.relnamespace
      join pg_proc      p  on p.oid  = t.tgfoid
      join pg_namespace pn on pn.oid = p.pronamespace
     where n.nspname   = 'public'
       and c.relname   = 'tracked_players'
       and pn.nspname  = 'supabase_functions'
       and p.proname   = 'http_request'
       and not t.tgisinternal
  loop
    raise notice 'prac-notify: suppression du webhook Dashboard "%" (secret en clair dans tgargs)', r.tgname;
    execute format('drop trigger %I on public.tracked_players', r.tgname);
  end loop;
end
$drop$;

-- ── 3. Trigger versionné ────────────────────────────────────────────────────
-- Nom identique partout désormais : la divergence prod/test disparaît.
drop trigger if exists prac_notify_tracked_players on public.tracked_players;

create trigger prac_notify_tracked_players
after insert or update on public.tracked_players
for each row execute function public.prac_notify_webhook();

-- ── 4. Vérification (à jouer après le push) ─────────────────────────────────
-- a) plus aucun trigger Dashboard, un seul trigger applicatif :
--      select t.tgname, p.proname
--        from pg_trigger t
--        join pg_class c on c.oid = t.tgrelid
--        join pg_proc  p on p.oid = t.tgfoid
--       where c.relname = 'tracked_players' and not t.tgisinternal;
--    → attendu : prac_notify_tracked_players | prac_notify_webhook
--
-- b) plus aucun token en clair dans le catalogue :
--      select count(*) from pg_trigger t
--        join pg_class c on c.oid = t.tgrelid
--       where c.relname = 'tracked_players'
--         and pg_get_triggerdef(t.oid) ilike '%X-Internal-Token%';
--    → attendu : 0
