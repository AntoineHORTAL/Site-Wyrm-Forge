-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  ALIGNEMENT POST-PUSH — écarts entre la PROD et les 74 migrations        ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- À jouer APRÈS `supabase db push` sur un environnement neuf :
--   supabase db query --linked -f supabase/bootstrap/01_post_push_alignment.sql
--
-- POURQUOI CE FICHIER EXISTE
-- --------------------------
-- Rejouer les 74 migrations sur une base vierge ne reproduit PAS la prod. La
-- comparaison objet par objet des deux schémas (2026-08-11) fait apparaître
-- 5 familles d'écarts. Trois d'entre elles sont des correctifs appliqués À LA
-- MAIN sur la prod et jamais reversés dans une migration : la prod est en
-- avance sur le dépôt, et c'est la PROD qui fait foi ici.
--
-- ⚠️ Ce fichier n'est PAS une migration. Il documente une dette : chacune de
-- ses sections devrait à terme devenir une vraie migration horodatée
-- (idempotente, donc no-op sur la prod). Tant que ce n'est pas fait, tout
-- nouvel environnement doit le jouer à la main.

-- ── 1. RLS jamais activée par les migrations ─────────────────────────────────
--
-- 🔴 ÉCART DE SÉCURITÉ RÉEL, PAS COSMÉTIQUE.
-- 20260530000005 (« rls_workshop_harden ») crée les policies wb_* / wjp_* mais
-- n'exécute JAMAIS `ENABLE ROW LEVEL SECURITY`. Sur la prod, l'activation a
-- été faite à la main ; sur une base reconstruite depuis les migrations, les
-- policies existent mais sont INERTES → les deux tables Workshop sont en
-- lecture/écriture libre pour n'importe quel porteur de la clé anon.
--
-- C'est exactement la classe de bug déjà corrigée pour `profiles` par la
-- migration 20260606000009 (« P0 CRITIQUE »), qui n'a jamais été étendue aux
-- tables Workshop. C'est la section la plus importante de ce fichier.
ALTER TABLE public.workshop_builds      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workshop_junglepaths ENABLE ROW LEVEL SECURITY;

-- ── 2. Triggers updated_at ad-hoc ────────────────────────────────────────────
-- Attachés à `update_updated_at()` (fonction du fichier 00), jamais versionnés.
CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON public.workshop_builds
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE OR REPLACE TRIGGER "todos_updated_at" BEFORE UPDATE ON public.todos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ── 3. Index + policies `scenarios` ad-hoc ───────────────────────────────────
-- La table `scenarios` a été créée ad-hoc puis codifiée a posteriori par
-- 20260622000001, qui pose les policies scn_*. Les 4 policies d'origine (noms
-- en clair) et l'index user_id sont restés sur la prod SANS être repris par la
-- migration : la prod porte donc les DEUX jeux de policies, permissifs et de
-- portée identique. Reproduit tel quel — dédoublonner est une décision à part.
CREATE INDEX IF NOT EXISTS scenarios_user_idx ON public.scenarios USING btree (user_id);

DROP POLICY IF EXISTS "Users can view their own scenarios" ON public.scenarios;
CREATE POLICY "Users can view their own scenarios" ON public.scenarios
  FOR SELECT USING ((user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can create their own scenarios" ON public.scenarios;
CREATE POLICY "Users can create their own scenarios" ON public.scenarios
  FOR INSERT WITH CHECK ((user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can update their own scenarios" ON public.scenarios;
CREATE POLICY "Users can update their own scenarios" ON public.scenarios
  FOR UPDATE USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can delete their own scenarios" ON public.scenarios;
CREATE POLICY "Users can delete their own scenarios" ON public.scenarios
  FOR DELETE USING ((user_id = auth.uid()));

-- ── 4. Fonctions où la PROD est en avance sur les migrations ─────────────────
--
-- Définitions recopiées telles quelles depuis `supabase db dump` de la prod
-- (2026-08-11). Écarts de fond, pas de mise en forme :
--
--  • finalize_quest_claim / purchase_cosmetic : la prod porte le correctif
--    `ON CONFLICT (ref_id) WHERE ref_id IS NOT NULL DO NOTHING`. L'index
--    `uq_ledger_ref` étant PARTIEL, omettre le prédicat lève une erreur 42P10
--    À L'EXÉCUTION. Les migrations 20260606000005 / 20260606000006 contiennent
--    encore la version sans prédicat : sans cette section, tout achat de
--    cosmétique et toute réclamation de quête échouent sur l'environnement de
--    test. AGENTS.md documente ces deux correctifs comme « corrigés » — ils le
--    sont sur la prod uniquement.
--
--  • prac_player_stats : la prod porte une réécriture de la garde
--    anti-énumération postérieure à 20260628000001.
--
--  • prac_related_players / prac_visible_match_ids : n'existent dans AUCUNE
--    migration — créées directement sur la prod. Leurs droits d'exécution sont
--    laissés au défaut PostgreSQL (EXECUTE à PUBLIC), ce qui reproduit la prod,
--    où `anon` les voit. Les deux sont SECURITY DEFINER mais filtrent sur
--    `auth.uid()` en interne : un appelant anonyme n'obtient aucune ligne.

CREATE OR REPLACE FUNCTION "public"."finalize_quest_claim"("p_user_id" "uuid", "p_quest_slug" "text", "p_day" "date", "p_reward" integer) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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
  -- Étape 1 — Advisory lock par utilisateur (xact-level)
  PERFORM pg_advisory_xact_lock(hashtext(p_user_id::text));

  -- Étape 2 — Dédup (authoritative)
  IF EXISTS (
    SELECT 1
      FROM public.quest_completions
     WHERE user_id    = p_user_id
       AND quest_slug = p_quest_slug
       AND day        = p_day
  ) THEN
    RAISE EXCEPTION 'already_claimed';
  END IF;

  -- Étape 3 — Vérification du plafond journalier
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

  -- Étape 4 — Streak + bonus
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

  -- Étape 5 — Débit ledger (idempotent) — FIX : prédicat de l'index partiel
  v_ref_id := 'quest:' || p_user_id::text || ':' || p_quest_slug || ':' || p_day::text;

  INSERT INTO public.scales_ledger (user_id, delta, source, ref_id)
  VALUES (p_user_id, v_total, 'quest', v_ref_id)
  ON CONFLICT (ref_id) WHERE ref_id IS NOT NULL DO NOTHING;

  -- Étape 6 — Enregistrement de la complétion (idempotent)
  INSERT INTO public.quest_completions (user_id, quest_slug, day)
  VALUES (p_user_id, p_quest_slug, p_day)
  ON CONFLICT (user_id, quest_slug, day) DO NOTHING;

  -- Étape 7 — Mise à jour du streak
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


CREATE OR REPLACE FUNCTION "public"."purchase_cosmetic"("p_user_id" "uuid", "p_cosmetic_id" bigint) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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

  -- Étape 3 — Vérification de possession.
  IF EXISTS (
    SELECT 1
      FROM public.user_cosmetics
     WHERE user_id     = p_user_id
       AND cosmetic_id = p_cosmetic_id
  ) THEN
    RAISE EXCEPTION 'already_owned';
  END IF;

  -- Étape 4 — Vérification du solde (dans la même transaction que le verrou).
  SELECT COALESCE(SUM(delta), 0)::BIGINT
    INTO v_balance
    FROM public.scales_ledger
   WHERE user_id = p_user_id;

  IF v_balance < v_price THEN
    RAISE EXCEPTION 'insufficient_balance';
  END IF;

  -- Étape 5 — Débit ledger (idempotent via l'index partiel uq_ledger_ref).
  INSERT INTO public.scales_ledger (user_id, delta, source, ref_id)
  VALUES (
    p_user_id,
    -v_price,
    'shop',
    'shop:' || p_user_id::text || ':' || p_cosmetic_id::text
  )
  ON CONFLICT (ref_id) WHERE ref_id IS NOT NULL DO NOTHING;

  -- Étape 6 — Inventaire (idempotent).
  INSERT INTO public.user_cosmetics (user_id, cosmetic_id, cosmetic_type, is_equipped)
  VALUES (p_user_id, p_cosmetic_id, v_type, false)
  ON CONFLICT (user_id, cosmetic_id) DO NOTHING;
END;
$$;


CREATE OR REPLACE FUNCTION "public"."prac_player_stats"("p_tracked_player_id" "uuid") RETURNS TABLE("tracked_player_id" "uuid", "profile_id" "uuid", "username" "text", "games" bigint, "wins" bigint, "losses" bigint, "winrate" numeric, "avg_kda" numeric, "avg_kills" numeric, "avg_deaths" numeric, "avg_assists" numeric, "avg_cs_per_min" numeric, "avg_vision_score" numeric, "avg_damage_dealt" numeric, "avg_gold_earned" numeric, "top_champions" "jsonb")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_profile_id uuid;
  v_username   text;
  v_is_admin   boolean := public.is_prac_admin(auth.uid());
  v_is_self    boolean;
  v_visible    uuid[];
BEGIN
  -- Résolution de la cible — ORDRE anti-énumération (identique à 4A) :
  --   admin → révélation honnête not_found ; non-admin → not_authorized indistinct.
  SELECT tp.profile_id, pr.username
    INTO v_profile_id, v_username
    FROM public.tracked_players tp
    JOIN public.profiles pr ON pr.id = tp.profile_id
   WHERE tp.id = p_tracked_player_id;
  IF NOT FOUND THEN
    IF v_is_admin THEN
      RAISE EXCEPTION 'not_found';
    ELSE
      RAISE EXCEPTION 'not_authorized';
    END IF;
  END IF;

  v_is_self := (auth.uid() = v_profile_id);

  -- Ensemble des matchs visibles pour l'appelant — SOURCE UNIQUE de la portée.
  SELECT array_agg(mid) INTO v_visible
    FROM public.prac_visible_match_ids(auth.uid(), p_tracked_player_id) AS mid;
  v_visible := COALESCE(v_visible, ARRAY[]::uuid[]);

  -- Autorisation : admin/self toujours (agrégats possiblement vides) ; cat. 3
  -- seulement s'il partage ≥1 match ; sinon (aucune relation) not_authorized.
  IF NOT (v_is_admin OR v_is_self) AND cardinality(v_visible) = 0 THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  RETURN QUERY
  WITH m AS (
    -- Alias explicite (tmx) : évite la collision avec la colonne OUT homonyme
    -- tracked_player_id du RETURNS TABLE (piège 4A). Portée = matchs visibles.
    SELECT tmx.* FROM public.tracked_matches tmx
     WHERE tmx.id = ANY(v_visible)
  ),
  top3 AS (
    SELECT champion_name,
           count(*)                    AS c_games,
           count(*) FILTER (WHERE win) AS c_wins
      FROM m
     WHERE champion_name IS NOT NULL
     GROUP BY champion_name
     ORDER BY c_games DESC, c_wins DESC, champion_name
     LIMIT 3
  )
  SELECT
    p_tracked_player_id,
    v_profile_id,
    v_username,
    count(*)::bigint                                                  AS games,
    count(*) FILTER (WHERE m.win)::bigint                             AS wins,
    count(*) FILTER (WHERE m.win IS NOT NULL AND NOT m.win)::bigint   AS losses,
    COALESCE(ROUND(count(*) FILTER (WHERE m.win)::numeric
             / NULLIF(count(*), 0) * 100, 1), 0)                      AS winrate,
    COALESCE(
      ROUND((SUM(m.kills) + SUM(m.assists))::numeric
            / NULLIF(SUM(m.deaths), 0), 2),
      (SUM(m.kills) + SUM(m.assists))::numeric,
      0
    )                                                                AS avg_kda,
    COALESCE(ROUND(AVG(m.kills)::numeric, 1), 0)                     AS avg_kills,
    COALESCE(ROUND(AVG(m.deaths)::numeric, 1), 0)                    AS avg_deaths,
    COALESCE(ROUND(AVG(m.assists)::numeric, 1), 0)                   AS avg_assists,
    COALESCE(ROUND(SUM(m.cs)::numeric
             / NULLIF(SUM(m.duration_s), 0) * 60, 2), 0)             AS avg_cs_per_min,
    COALESCE(ROUND(AVG(m.vision_score)::numeric, 1), 0)             AS avg_vision_score,
    COALESCE(ROUND(AVG(m.damage_dealt)::numeric, 0), 0)             AS avg_damage_dealt,
    COALESCE(ROUND(AVG(m.gold_earned)::numeric, 0), 0)              AS avg_gold_earned,
    COALESCE(
      (SELECT jsonb_agg(jsonb_build_object(
                'champion', champion_name,
                'games',    c_games,
                'wins',     c_wins,
                'winrate',  ROUND(c_wins::numeric / NULLIF(c_games, 0) * 100, 1)
              ) ORDER BY c_games DESC, c_wins DESC, champion_name)
         FROM top3),
      '[]'::jsonb
    )                                                                AS top_champions
  FROM m;
END;
$$;


CREATE OR REPLACE FUNCTION "public"."prac_related_players"() RETURNS TABLE("tracked_player_id" "uuid", "profile_id" "uuid", "username" "text", "relation" "text", "games" bigint, "wins" bigint, "winrate" numeric, "avg_kda" numeric, "avg_cs_per_min" numeric)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_puuid  text;
BEGIN
  IF v_caller IS NULL THEN
    RETURN;  -- pas de session → rien
  END IF;

  SELECT pr.riot_puuid INTO v_puuid FROM public.profiles pr WHERE pr.id = v_caller;

  RETURN QUERY
  WITH related AS (
    -- self : le dossier du caller (0 ou 1 ligne).
    SELECT tp.id AS tracked_player_id, tp.profile_id, 'self'::text AS relation
      FROM public.tracked_players tp
     WHERE tp.profile_id = v_caller
    UNION
    -- co-joueurs : dossiers partageant ≥1 match avec le puuid du caller (hors self).
    SELECT DISTINCT tp.id, tp.profile_id, 'shared'::text
      FROM public.tracked_players tp
      JOIN public.tracked_matches tm             ON tm.tracked_player_id = tp.id
      JOIN public.tracked_match_participants tmp ON tmp.tracked_match_id = tm.id
     WHERE v_puuid IS NOT NULL
       AND tmp.puuid = v_puuid
       AND tp.profile_id <> v_caller
  ),
  scoped AS (
    -- Stats caller-scoped : jointure LATÉRALE sur les matchs visibles de chaque relation.
    -- LEFT JOIN → une relation self à 0 match visible apparaît quand même (games=0).
    SELECT r.tracked_player_id, r.profile_id, r.relation,
           mv.mid, mv.win, mv.kills, mv.deaths, mv.assists, mv.cs, mv.duration_s
      FROM related r
      LEFT JOIN LATERAL (
        SELECT tmx.id AS mid, tmx.win, tmx.kills, tmx.deaths,
               tmx.assists, tmx.cs, tmx.duration_s
          FROM public.tracked_matches tmx
         WHERE tmx.id IN (SELECT public.prac_visible_match_ids(v_caller, r.tracked_player_id))
      ) mv ON true
  )
  SELECT
    s.tracked_player_id,
    s.profile_id,
    pr.username,
    s.relation,
    count(s.mid)::bigint                                             AS games,
    count(*) FILTER (WHERE s.win)::bigint                            AS wins,
    COALESCE(ROUND(count(*) FILTER (WHERE s.win)::numeric
             / NULLIF(count(s.mid), 0) * 100, 1), 0)                 AS winrate,
    COALESCE(
      ROUND((SUM(s.kills) + SUM(s.assists))::numeric
            / NULLIF(SUM(s.deaths), 0), 2),
      (SUM(s.kills) + SUM(s.assists))::numeric,
      0
    )                                                                AS avg_kda,
    COALESCE(ROUND(SUM(s.cs)::numeric
             / NULLIF(SUM(s.duration_s), 0) * 60, 2), 0)             AS avg_cs_per_min
  FROM scoped s
  JOIN public.profiles pr ON pr.id = s.profile_id
  GROUP BY s.tracked_player_id, s.profile_id, pr.username, s.relation
  ORDER BY (s.relation = 'self') DESC, winrate DESC, games DESC, pr.username;
END;
$$;


CREATE OR REPLACE FUNCTION "public"."prac_visible_match_ids"("p_caller" "uuid", "p_tracked_player_id" "uuid") RETURNS SETOF "uuid"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_profile_id   uuid;
  v_caller_puuid text;
BEGIN
  -- Résout le joueur tracké ciblé.
  SELECT tp.profile_id INTO v_profile_id
    FROM public.tracked_players tp
   WHERE tp.id = p_tracked_player_id;
  IF NOT FOUND THEN
    RETURN;  -- dossier inexistant → aucun match visible
  END IF;

  -- Cat. 1 (admin) OU cat. 2 (self) → tous les matchs du joueur tracké.
  IF public.is_prac_admin(p_caller) OR p_caller = v_profile_id THEN
    RETURN QUERY
      SELECT tm.id FROM public.tracked_matches tm
       WHERE tm.tracked_player_id = p_tracked_player_id;
    RETURN;
  END IF;

  -- Cat. 3 → uniquement les matchs partagés (puuid du caller ∈ participants).
  SELECT pr.riot_puuid INTO v_caller_puuid
    FROM public.profiles pr WHERE pr.id = p_caller;
  IF v_caller_puuid IS NULL THEN
    RETURN;  -- pas de compte Riot lié → aucun accès cat. 3
  END IF;

  RETURN QUERY
    SELECT tm.id
      FROM public.tracked_matches tm
      JOIN public.tracked_match_participants tmp ON tmp.tracked_match_id = tm.id
     WHERE tm.tracked_player_id = p_tracked_player_id
       AND tmp.puuid = v_caller_puuid;
END;
$$;


