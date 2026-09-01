-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  BASELINE — état de la base AVANT le début du versionnage (2026-05-30)   ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- ⚠️⚠️ MIGRATION AU STATUT PARTICULIER — LIRE AVANT TOUT `db push` ⚠️⚠️
-- ---------------------------------------------------------------------------
-- Cette migration N'A JAMAIS ÉTÉ EXÉCUTÉE sur la prod ni sur le projet de test,
-- et ne doit JAMAIS l'être : tout ce qu'elle contient y existe déjà depuis
-- toujours. Elle y est marquée `applied` SANS exécution, par :
--
--     supabase migration repair --status applied 20260529000000
--
-- Tant que ce repair n'a pas été fait sur une base existante, un `supabase db
-- push` visant cette base considérera cette migration comme EN ATTENTE et
-- tentera de l'appliquer. Chaque instruction étant idempotente (IF NOT EXISTS /
-- OR REPLACE / DROP POLICY IF EXISTS puis CREATE), le résultat serait de toute
-- façon un no-op — mais on ne compte pas là-dessus : le repair est la procédure,
-- l'idempotence n'est que le filet.
--
-- Sur une base NEUVE, en revanche, elle s'applique normalement et en PREMIER
-- (horodatage 20260529000000 < 20260530000001, la plus ancienne des autres).
--
-- POURQUOI CE FICHIER EXISTE
-- --------------------------
-- Les 7 tables ci-dessous (+ 6 fonctions) ont été créées À LA MAIN dans le
-- dashboard Supabase AVANT que le projet ne versionne son schéma. Aucune des
-- migrations de `supabase/migrations/` ne les crée : la toute première migration
-- qui les touche est `20260530000002_profiles_riot_columns.sql`, qui fait
-- `ALTER TABLE profiles ADD COLUMN …` en supposant la table déjà présente.
--
-- Conséquence, avant l'existence de ce fichier : **`supabase db push` sur un
-- projet VIERGE échouait** (relation "profiles" does not exist), et échouait de
-- nouveau plus loin sur `admin_users` (20260530000003) puis sur les 4 fonctions
-- `increment_*` (20260715000001, qui fait `ALTER FUNCTION … SET search_path`).
-- C'est ce trou que cette migration comble.
--
-- HISTORIQUE — promotion depuis `supabase/bootstrap/00`
-- -----------------------------------------------------
-- Ce contenu vivait auparavant dans `supabase/bootstrap/00_pre_versioning_baseline.sql`,
-- un script HORS migration qu'il fallait jouer à la main (`supabase db query -f …`)
-- avant le premier `db push` de tout environnement neuf. Le promouvoir en
-- migration horodatée supprime cette étape manuelle : `db push` seul suffit
-- désormais à monter un environnement complet. Les migrations 20260815000001 à
-- 20260815000003 référencent encore « bootstrap/00 » dans leurs commentaires
-- d'en-tête — il s'agit de ce fichier-ci.
--
-- CE QUI EST VOLONTAIREMENT ABSENT
-- --------------------------------
-- Ce fichier reproduit l'état PRÉ-VERSIONNAGE, PAS l'état actuel de la prod :
-- tout ce que les migrations ajoutent ensuite en est délibérément EXCLU, sinon
-- ces migrations échoueraient sur des objets déjà présents (leurs `CREATE POLICY`
-- et `ADD CONSTRAINT` ne sont pas idempotents). Sont donc laissés aux migrations :
--   • profiles      : colonnes riot_* (20260530000002 / 20260606000004),
--                     chk_profiles_riot_rank (20260530000004),
--                     uq_profiles_riot_puuid + triggers (20260606000004…),
--                     policies restrict_insert_privileges / *_update_self_or_admin
--   • admin_users   : RLS + policies deny_anon / deny_authenticated (20260530000003)
--   • workshop_*    : policies wb_* / wjp_* (20260530000005, 20260716000001),
--                     RLS (20260815000002),
--                     workshop_builds.source_build_id (20260723000001)
--   • item_builds   : colonne priority (20260807000001)
--
-- Cette répartition a été vérifiée colonne par colonne, contrainte par contrainte
-- et policy par policy contre la prod le 2026-08-15 : aucun écart.

-- ── 0. Extensions ────────────────────────────────────────────────────────────
-- Présentes sur la prod, absentes d'un projet Supabase neuf. `pg_cron` est
-- exigée dès la migration suivante (20260530000001 planifie la purge de
-- `riot_cache` via `cron.schedule`) ; `pg_net` porte les Database Webhooks
-- (dont `prac-notify`). Les schémas cibles reproduisent ceux de la prod.
--
-- ⚠️ Ces deux CREATE EXTENSION sont les seules instructions de ce fichier qui
-- exigent des droits élevés. Elles passent sous le rôle `postgres` utilisé par
-- `supabase db push`. Si un jour elles échouaient sur un environnement neuf,
-- les activer depuis le dashboard (Database → Extensions) AVANT le push rend
-- ces deux lignes no-op grâce au IF NOT EXISTS — le reste du fichier n'a besoin
-- d'aucun privilège particulier.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net  WITH SCHEMA extensions;

-- ── 1. Fonctions antérieures au versionnage ──────────────────────────────────

-- Trigger générique de bump d'updated_at. Doublon historique de
-- `fn_set_updated_at` (créée, elle, par 20260530000008) : conservée à
-- l'identique de la prod, où elle porte les deux triggers ad-hoc réattachés par
-- 20260815000004. Ne pas « nettoyer » ici — ce fichier reproduit, il ne corrige pas.
CREATE OR REPLACE FUNCTION public.update_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

-- ── 2. Tables antérieures au versionnage ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.admin_users (
    user_id    uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT admin_users_pkey PRIMARY KEY (user_id),
    CONSTRAINT admin_users_user_id_fkey FOREIGN KEY (user_id)
      REFERENCES auth.users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.profiles (
    id              uuid NOT NULL,
    username        text NOT NULL,
    tier            text DEFAULT 'apprenti'::text NOT NULL,
    created_at      timestamp with time zone DEFAULT now(),
    role            text DEFAULT 'user'::text NOT NULL,
    tier_expires_at timestamp with time zone,
    email           text,
    certified       boolean DEFAULT false NOT NULL,
    CONSTRAINT profiles_pkey PRIMARY KEY (id),
    CONSTRAINT profiles_username_key UNIQUE (username),
    CONSTRAINT profiles_role_check CHECK ((role = ANY (ARRAY['user'::text, 'admin'::text]))),
    CONSTRAINT profiles_id_fkey FOREIGN KEY (id)
      REFERENCES auth.users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.todos (
    id          uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id     uuid NOT NULL,
    title       text NOT NULL,
    items       jsonb DEFAULT '[]'::jsonb,
    created_at  timestamp with time zone DEFAULT now(),
    updated_at  timestamp with time zone DEFAULT now(),
    description text DEFAULT ''::text NOT NULL,
    active      boolean DEFAULT false NOT NULL,
    CONSTRAINT todos_pkey PRIMARY KEY (id),
    CONSTRAINT todos_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);

CREATE TABLE IF NOT EXISTS public.item_builds (
    id          uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id     uuid NOT NULL,
    name        text NOT NULL,
    champ       jsonb,
    blocks      jsonb DEFAULT '[]'::jsonb NOT NULL,
    total_gold  integer DEFAULT 0 NOT NULL,
    created_at  timestamp with time zone DEFAULT now(),
    runes       jsonb,
    skill_order jsonb,
    components  text[] DEFAULT ARRAY['items'::text],
    CONSTRAINT item_builds_pkey PRIMARY KEY (id),
    CONSTRAINT item_builds_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);

CREATE TABLE IF NOT EXISTS public.deletion_requests (
    id           uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id      uuid NOT NULL,
    email        text NOT NULL,
    username     text,
    reason       text,
    requested_at timestamp with time zone DEFAULT now() NOT NULL,
    processed_at timestamp with time zone,
    status       text DEFAULT 'pending'::text NOT NULL,
    CONSTRAINT deletion_requests_pkey PRIMARY KEY (id),
    CONSTRAINT deletion_requests_status_check
      CHECK ((status = ANY (ARRAY['pending'::text, 'processed'::text, 'cancelled'::text]))),
    CONSTRAINT deletion_requests_user_id_fkey FOREIGN KEY (user_id)
      REFERENCES auth.users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.workshop_builds (
    id           uuid DEFAULT gen_random_uuid() NOT NULL,
    titre        text NOT NULL,
    description  text DEFAULT ''::text NOT NULL,
    creator_name text NOT NULL,
    creator_id   uuid DEFAULT auth.uid(),
    champion     text NOT NULL,
    role         text,
    patch        text DEFAULT ''::text NOT NULL,
    items        jsonb DEFAULT '[]'::jsonb NOT NULL,
    runes        jsonb DEFAULT '{}'::jsonb NOT NULL,
    likes        integer DEFAULT 0 NOT NULL,
    saves        integer DEFAULT 0 NOT NULL,
    created_at   timestamp with time zone DEFAULT now() NOT NULL,
    updated_at   timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT workshop_builds_pkey PRIMARY KEY (id),
    CONSTRAINT workshop_builds_role_check
      CHECK ((role = ANY (ARRAY['TOP'::text, 'JUNGLE'::text, 'MID'::text, 'ADC'::text, 'SUPPORT'::text, ''::text]))),
    CONSTRAINT workshop_builds_creator_id_fkey FOREIGN KEY (creator_id)
      REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.workshop_junglepaths (
    id           uuid DEFAULT gen_random_uuid() NOT NULL,
    titre        text NOT NULL,
    description  text DEFAULT ''::text NOT NULL,
    creator_name text NOT NULL,
    champion     text NOT NULL,
    side         text DEFAULT 'Blue'::text,
    patch        text DEFAULT ''::text NOT NULL,
    elements     jsonb DEFAULT '[]'::jsonb NOT NULL,
    strokes      jsonb DEFAULT '[]'::jsonb NOT NULL,
    likes        integer DEFAULT 0 NOT NULL,
    saves        integer DEFAULT 0 NOT NULL,
    created_at   timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT workshop_junglepaths_pkey PRIMARY KEY (id),
    CONSTRAINT workshop_junglepaths_side_check
      CHECK ((side = ANY (ARRAY['Blue'::text, 'Red'::text])))
);

-- is_admin() est recréée à l'identique par 20260530000007 (« is_admin_versioned »).
-- Déclarée APRÈS les tables, et pas en tête de fichier : elle est en LANGUAGE
-- sql, donc son corps est validé à la création — `admin_users` doit déjà
-- exister. Elle est nécessaire avant la section 5 (les policies ad-hoc de
-- deletion_requests et profiles l'appellent).
CREATE OR REPLACE FUNCTION public.is_admin() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid());
$$;

-- ── 3. Index antérieurs au versionnage ───────────────────────────────────────

CREATE INDEX IF NOT EXISTS deletion_requests_status_idx ON public.deletion_requests USING btree (status);
CREATE INDEX IF NOT EXISTS deletion_requests_user_idx   ON public.deletion_requests USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_workshop_champion        ON public.workshop_builds USING btree (champion);
CREATE INDEX IF NOT EXISTS idx_workshop_created         ON public.workshop_builds USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_workshop_likes           ON public.workshop_builds USING btree (likes DESC);
CREATE INDEX IF NOT EXISTS idx_workshop_role            ON public.workshop_builds USING btree (role);
CREATE INDEX IF NOT EXISTS idx_wjp_champion             ON public.workshop_junglepaths USING btree (champion);
CREATE INDEX IF NOT EXISTS idx_wjp_created              ON public.workshop_junglepaths USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wjp_likes                ON public.workshop_junglepaths USING btree (likes DESC);
CREATE INDEX IF NOT EXISTS idx_wjp_side                 ON public.workshop_junglepaths USING btree (side);

-- ── 4. Compteurs Workshop (SECURITY DEFINER) ─────────────────────────────────
-- 20260715000001 fait `ALTER FUNCTION … SET search_path = public` sur ces 4
-- fonctions : elles DOIVENT exister avant le push, sinon la migration échoue.
-- Le `SET search_path` est déjà posé ici (état actuel de la prod) ; l'ALTER de
-- la migration devient alors un no-op, ce qui est sans conséquence.
--
-- Elles sont aussi la raison pour laquelle 20260815000002 n'active PAS
-- `FORCE ROW LEVEL SECURITY` sur les tables Workshop : SECURITY DEFINER, elles
-- écrivent en tant que propriétaire de la table et n'ont aucune policy UPDATE
-- pour les rattraper.

CREATE OR REPLACE FUNCTION public.increment_likes(build_id uuid) RETURNS void
    LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
    AS $$ update workshop_builds set likes = likes + 1 where id = build_id; $$;

CREATE OR REPLACE FUNCTION public.increment_saves(build_id uuid) RETURNS void
    LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
    AS $$ update workshop_builds set saves = saves + 1 where id = build_id; $$;

CREATE OR REPLACE FUNCTION public.increment_jp_likes(path_id uuid) RETURNS void
    LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
    AS $$ update workshop_junglepaths set likes = likes + 1 where id = path_id; $$;

CREATE OR REPLACE FUNCTION public.increment_jp_saves(path_id uuid) RETURNS void
    LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
    AS $$ update workshop_junglepaths set saves = saves + 1 where id = path_id; $$;

-- ── 5. RLS + policies ad-hoc ─────────────────────────────────────────────────
-- Uniquement celles qu'AUCUNE migration ne (re)crée. `admin_users`, les
-- `workshop_*` et le garde INSERT de `profiles` sont laissés aux migrations.

ALTER TABLE public.deletion_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.item_builds       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.todos             ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can do anything" ON public.deletion_requests;
CREATE POLICY "Admins can do anything" ON public.deletion_requests
  USING (public.is_admin());

DROP POLICY IF EXISTS "Users can view their own deletion requests" ON public.deletion_requests;
CREATE POLICY "Users can view their own deletion requests" ON public.deletion_requests
  FOR SELECT USING ((user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can update their own deletion request (cancel)" ON public.deletion_requests;
CREATE POLICY "Users can update their own deletion request (cancel)" ON public.deletion_requests
  FOR UPDATE USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));

-- Recopiée telle quelle depuis la prod, y compris son sous-SELECT sur
-- admin_users qui compare `deletion_requests.id` (et non `user_id`) à
-- `auth.uid()` — comparaison qui ne peut jamais être vraie. Bizarrerie
-- d'origine CONSERVÉE : ce fichier doit reproduire la prod à l'identique,
-- pas la corriger. Un correctif éventuel est une migration à part entière.
DROP POLICY IF EXISTS "Users can create their own deletion request" ON public.deletion_requests;
CREATE POLICY "Users can create their own deletion request" ON public.deletion_requests
  FOR INSERT WITH CHECK (
    (user_id = auth.uid())
    AND (lower(COALESCE(email, ''::text)) !~~ '%@wyrm-forge.com'::text)
    AND (NOT (EXISTS ( SELECT 1
                         FROM public.admin_users
                        WHERE (deletion_requests.id = auth.uid()))))
  );

DROP POLICY IF EXISTS "Users manage own builds" ON public.item_builds;
CREATE POLICY "Users manage own builds" ON public.item_builds
  USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));

DROP POLICY IF EXISTS "own todos" ON public.todos;
CREATE POLICY "own todos" ON public.todos
  USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));

DROP POLICY IF EXISTS "View profiles" ON public.profiles;
CREATE POLICY "View profiles" ON public.profiles
  FOR SELECT USING (((auth.uid() = id) OR public.is_admin()));

DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;
CREATE POLICY "Users can read own profile" ON public.profiles
  FOR SELECT USING ((auth.uid() = id));

DROP POLICY IF EXISTS "Insert profiles" ON public.profiles;
CREATE POLICY "Insert profiles" ON public.profiles
  FOR INSERT WITH CHECK (((auth.uid() = id) OR public.is_admin()));
