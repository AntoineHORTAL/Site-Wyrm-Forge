-- Reversement de la dette « bootstrap §4 » : le prédicat d'index partiel manquant
-- dans finalize_quest_claim / purchase_cosmetic.
--
-- CE QUI EST RÉELLEMENT MANQUANT
-- ------------------------------
-- Ce n'est PAS l'index. `uq_ledger_ref` est bien créé, PARTIEL, par la migration
-- 20260606000002 (« CREATE UNIQUE INDEX ... ON scales_ledger (ref_id) WHERE ref_id
-- IS NOT NULL ») — il est donc présent aussi bien en prod que sur toute base
-- reconstruite depuis les migrations. Le recréer serait un no-op qui ne corrigerait
-- rien.
--
-- Ce qui manque, c'est le PRÉDICAT DANS LA CLAUSE ON CONFLICT des deux fonctions.
-- Les migrations 20260606000005 (l.96) et 20260606000006 (l.242) écrivent encore :
--
--     ON CONFLICT (ref_id) DO NOTHING
--
-- alors que la prod porte, depuis un correctif appliqué à la main jamais reversé :
--
--     ON CONFLICT (ref_id) WHERE ref_id IS NOT NULL DO NOTHING
--
-- POURQUOI L'OMISSION EST FATALE — l'inférence d'arbitre
-- ------------------------------------------------------
-- `ON CONFLICT (colonne)` ne nomme pas un index : PostgreSQL doit INFÉRER quel index
-- unique sert d'arbitre. Un index PARTIEL n'est candidat que si l'instruction fournit
-- elle-même un `WHERE index_predicate` qui IMPLIQUE le prédicat de l'index. Sans
-- prédicat, seuls les index unique TOTAUX sont candidats — or `uq_ledger_ref` est le
-- seul index unique sur `ref_id`, et il est partiel. Aucun candidat ⇒ 42P10
-- (« there is no unique or exclusion constraint matching the ON CONFLICT
-- specification »).
--
-- ⚠️ L'erreur est levée à la PLANIFICATION, pas sur une collision de données : elle
-- frappe DÈS LE PREMIER INSERT, quelle que soit la valeur de ref_id, y compris sur une
-- table vide. Ce n'est donc pas un cas limite « à partir de la 2e ligne à NULL » : là où
-- la faute est présente, TOUT achat de cosmétique et TOUTE réclamation de quête
-- échouent, à 100 %, dès le premier appel.
--
-- CE QUE CETTE MIGRATION PROTÈGE RÉELLEMENT — la régression au rejeu
-- -------------------------------------------------------------------
-- Elle est un NO-OP partout aujourd'hui : la prod comme le projet de test portent
-- déjà le bon prédicat (vérifié le 2026-08-15 sur les deux bases). Elle ne corrige
-- donc aucune panne en cours, et ce n'est pas non plus « le schéma reconstruit depuis
-- les migrations » qu'elle sauve — ce cas n'est pas atteignable : un push sur base
-- vierge meurt à la 2e migration (20260530000002 fait ALTER TABLE profiles sur une
-- table qu'aucune migration ne crée), tant que le pré-versionnage vit dans
-- bootstrap/00_pre_versioning_baseline.sql au lieu d'une migration.
--
-- Ce qu'elle achète est ailleurs : le correctif en place ne tient aujourd'hui QUE par
-- bootstrap/01_post_push_alignment.sql, un fichier hors-migration joué à la main UNE
-- FOIS sur chaque base. Or 20260606000005 et 20260606000006 font CREATE OR REPLACE sur
-- ces deux fonctions. Tout rejeu complet de l'historique — `supabase db reset`, une
-- branche Supabase, un environnement neuf — les réécrase donc dans leur version
-- CASSÉE et annule le rattrapage, en silence : rien ne le signalerait avant le premier
-- achat client. Horodatée après les deux fautives, cette migration s'applique toujours
-- en dernier et rend le correctif durable et ordonné.
--
-- COROLLAIRE — pourquoi un index partiel plutôt qu'un index simple
-- ----------------------------------------------------------------
-- Contrairement à ce qu'on suppose souvent, ce n'est PAS une nécessité de correction :
-- un UNIQUE total sur `ref_id` autoriserait lui aussi plusieurs lignes à ref_id NULL
-- (les NULL sont distincts entre eux en UNIQUE Postgres — c'est exactement le
-- raisonnement écrit dans 20260614000004 pour `uq_app_events_dedup`). Le choix du
-- partiel est un choix de PORTÉE et de TAILLE : la majorité des lignes du ledger n'ont
-- pas de ref_id (ajustements admin, récompenses de tournoi), l'index ne porte donc que
-- les lignes que la déduplication concerne réellement. Le prix de ce choix est
-- précisément l'obligation de répéter le prédicat à chaque ON CONFLICT.

-- ── 1. Garde : l'index arbitre doit exister ET être partiel ───────────────────
-- Sans lui, les deux fonctions ci-dessous lèveraient 42P10 à la première exécution.
-- On échoue ici, bruyamment et au déploiement, plutôt que sur le premier achat client.
-- Sur la prod comme sur tout schéma issu de 20260606000002, ce bloc passe sans effet.
DO $$
DECLARE
  v_def TEXT;
BEGIN
  SELECT pg_get_indexdef(i.indexrelid)
    INTO v_def
    FROM pg_index i
    JOIN pg_class c ON c.oid = i.indexrelid
   WHERE c.relname = 'uq_ledger_ref'
     AND i.indrelid = 'public.scales_ledger'::regclass;

  IF v_def IS NULL THEN
    RAISE EXCEPTION
      'uq_ledger_ref absent sur public.scales_ledger — voir migration 20260606000002';
  END IF;

  IF v_def NOT ILIKE '%WHERE%ref_id IS NOT NULL%' THEN
    RAISE EXCEPTION
      'uq_ledger_ref existe mais n''est PAS partiel (def: %) — le prédicat ON CONFLICT des fonctions ci-dessous ne pourrait pas l''inférer', v_def;
  END IF;
END $$;

-- ── 2. purchase_cosmetic — corps identique à 20260606000005, seule l'étape 5 change ──
CREATE OR REPLACE FUNCTION public.purchase_cosmetic(
  p_user_id    UUID,
  p_cosmetic_id BIGINT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_price   INT;
  v_type    TEXT;
  v_balance BIGINT;
BEGIN
  -- Étape 1 — Advisory lock par utilisateur (sérialise les achats concurrents).
  PERFORM pg_advisory_xact_lock(hashtext(p_user_id::text));

  -- Étape 2 — Lecture du cosmétique FOR SHARE (empêche une désactivation concurrente).
  SELECT price_scales, type
    INTO v_price, v_type
    FROM public.cosmetics
   WHERE id = p_cosmetic_id
     AND is_active = true
     AND (available_from  IS NULL OR available_from  <= now())
     AND (available_until IS NULL OR available_until >  now())
   FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'cosmetic_unavailable';
  END IF;

  -- Étape 3 — Vérification de possession (erreur explicite plutôt qu'un no-op muet).
  IF EXISTS (
    SELECT 1
      FROM public.user_cosmetics
     WHERE user_id     = p_user_id
       AND cosmetic_id = p_cosmetic_id
  ) THEN
    RAISE EXCEPTION 'already_owned';
  END IF;

  -- Étape 4 — Vérification du solde (même transaction que le verrou advisory).
  SELECT COALESCE(SUM(delta), 0)::BIGINT
    INTO v_balance
    FROM public.scales_ledger
   WHERE user_id = p_user_id;

  IF v_balance < v_price THEN
    RAISE EXCEPTION 'insufficient_balance';
  END IF;

  -- Étape 5 — Débit ledger (idempotent via l'index PARTIEL uq_ledger_ref).
  -- ⚠️ Le `WHERE ref_id IS NOT NULL` n'est pas un filtre de lignes : c'est
  -- l'index_predicate qui permet à Postgres d'inférer un index partiel comme
  -- arbitre. Le retirer relève 42P10 à chaque appel. Voir l'en-tête du fichier.
  INSERT INTO public.scales_ledger (user_id, delta, source, ref_id)
  VALUES (
    p_user_id,
    -v_price,
    'shop',
    'shop:' || p_user_id::text || ':' || p_cosmetic_id::text
  )
  ON CONFLICT (ref_id) WHERE ref_id IS NOT NULL DO NOTHING;

  -- Étape 6 — Inventaire (idempotent via uq_user_cosmetics, contrainte TOTALE :
  -- pas de prédicat ici, et il ne faut pas en ajouter).
  INSERT INTO public.user_cosmetics (user_id, cosmetic_id, cosmetic_type, is_equipped)
  VALUES (p_user_id, p_cosmetic_id, v_type, false)
  ON CONFLICT (user_id, cosmetic_id) DO NOTHING;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.purchase_cosmetic(UUID, BIGINT) FROM PUBLIC;

-- ── 3. finalize_quest_claim — corps identique à 20260606000006, seule l'étape 5 change ──
CREATE OR REPLACE FUNCTION public.finalize_quest_claim(
  p_user_id    UUID,
  p_quest_slug TEXT,
  p_day        DATE,
  p_reward     INT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today_sum  BIGINT;
  v_cap        INT;
  v_streak     INT;
  v_last_day   DATE;
  v_bonus_pct  INT;
  v_total      INT;
  v_ref_id     TEXT;
BEGIN
  -- Étape 1 — Advisory lock par utilisateur (xact-level).
  PERFORM pg_advisory_xact_lock(hashtext(p_user_id::text));

  -- Étape 2 — Dédup authoritative (sous le verrou → insensible à la concurrence).
  IF EXISTS (
    SELECT 1
      FROM public.quest_completions
     WHERE user_id    = p_user_id
       AND quest_slug = p_quest_slug
       AND day        = p_day
  ) THEN
    RAISE EXCEPTION 'already_claimed';
  END IF;

  -- Étape 3 — Vérification du plafond journalier.
  SELECT COALESCE(SUM(qd.reward), 0)::BIGINT
    INTO v_today_sum
    FROM public.quest_completions qc
    JOIN public.quest_definitions qd ON qd.slug = qc.quest_slug
   WHERE qc.user_id = p_user_id
     AND qc.day     = p_day;

  SELECT value::INT
    INTO v_cap
    FROM public.app_settings
   WHERE key = 'cap_daily_scales';
  v_cap := COALESCE(v_cap, 25);

  IF v_today_sum + p_reward > v_cap THEN
    RAISE EXCEPTION 'daily_cap_reached';
  END IF;

  -- Étape 4 — Streak + bonus.
  SELECT current_streak, last_day
    INTO v_streak, v_last_day
    FROM public.quest_streaks
   WHERE user_id = p_user_id;
  v_streak := COALESCE(v_streak, 0);

  SELECT value::INT
    INTO v_bonus_pct
    FROM public.app_settings
   WHERE key = 'streak_bonus_pct';
  v_bonus_pct := COALESCE(v_bonus_pct, 0);

  v_total := p_reward + (p_reward * v_streak * v_bonus_pct / 100);

  -- Étape 5 — Débit ledger (idempotent via l'index PARTIEL uq_ledger_ref).
  -- ⚠️ Même piège que dans purchase_cosmetic : le prédicat est OBLIGATOIRE pour
  -- que l'index partiel soit inférable comme arbitre. Voir l'en-tête du fichier.
  v_ref_id := 'quest:' || p_user_id::text || ':' || p_quest_slug || ':' || p_day::text;

  INSERT INTO public.scales_ledger (user_id, delta, source, ref_id)
  VALUES (p_user_id, v_total, 'quest', v_ref_id)
  ON CONFLICT (ref_id) WHERE ref_id IS NOT NULL DO NOTHING;

  -- Étape 6 — Complétion (idempotent via uq_completion, contrainte TOTALE).
  INSERT INTO public.quest_completions (user_id, quest_slug, day)
  VALUES (p_user_id, p_quest_slug, p_day)
  ON CONFLICT (user_id, quest_slug, day) DO NOTHING;

  -- Étape 7 — Mise à jour du streak.
  IF v_last_day IS NULL THEN
    INSERT INTO public.quest_streaks (user_id, current_streak, last_day)
    VALUES (p_user_id, 1, p_day)
    ON CONFLICT (user_id) DO UPDATE
      SET current_streak = 1,
          last_day       = EXCLUDED.last_day;

  ELSIF v_last_day = p_day - 1 THEN
    UPDATE public.quest_streaks
       SET current_streak = current_streak + 1,
           last_day       = p_day
     WHERE user_id = p_user_id;

  ELSIF v_last_day = p_day THEN
    NULL;  -- même jour, streak déjà compté au premier claim du jour

  ELSE
    UPDATE public.quest_streaks
       SET current_streak = 1,
           last_day       = p_day
     WHERE user_id = p_user_id;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.finalize_quest_claim(UUID, TEXT, DATE, INT) FROM PUBLIC;
