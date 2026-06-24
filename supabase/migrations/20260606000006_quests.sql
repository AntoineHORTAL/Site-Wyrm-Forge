-- M5 : Système de quêtes journalières avec streak et plafond d'Écailles.
--
-- Tables créées :
--   quest_definitions  — catalogue data-driven des quêtes disponibles
--   quest_completions  — dédup journalier par (user_id, quest_slug, day)
--   quest_streaks      — suivi du streak de jours consécutifs par compte
--   app_events         — empreintes serveur pour les quêtes de type 'app'
--
-- Fonction SECURITY DEFINER :
--   finalize_quest_claim(p_user_id, p_quest_slug, p_day, p_reward)
--     Appelée par l'Edge Function quests-claim via le client service_role.
--     N'est PAS exposée en RPC direct au client — REVOKE FROM PUBLIC en fin.
--
-- Protection contre les doubles récompenses :
--   1. Advisory lock par user_id (pg_advisory_xact_lock) — sérialise les claims
--      simultanés d'un même utilisateur sur la durée de la transaction.
--   2. Dédup idempotent via ON CONFLICT (user_id, quest_slug, day) DO NOTHING.
--   3. Débit ledger idempotent via ON CONFLICT (ref_id) DO NOTHING.
--   4. Plafond journalier lu depuis app_settings (clé 'cap_daily_scales').
--
-- Erreurs levées (RAISE EXCEPTION) :
--   'already_claimed'    — quête déjà complétée ce jour
--   'daily_cap_reached'  — plafond d'Écailles journalier atteint
--
-- Alimentation de app_events : Edge Functions uniquement, via service_role.
--   → aucune policy INSERT/UPDATE/DELETE côté client sur cette table.

-- -----------------------------------------------------------------------
-- 1. Table quest_definitions
-- -----------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.quest_definitions (
  slug        TEXT    NOT NULL PRIMARY KEY,
  name        TEXT    NOT NULL,
  category    TEXT    NOT NULL,  -- 'lol' | 'app'
  reward      INT     NOT NULL,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT chk_qd_category CHECK (category IN ('lol', 'app')),
  CONSTRAINT chk_qd_reward   CHECK (reward > 0)
);

ALTER TABLE public.quest_definitions ENABLE ROW LEVEL SECURITY;

-- SELECT : public (catalogue visible sans login)
CREATE POLICY "qd_select_public"
  ON public.quest_definitions FOR SELECT
  TO anon, authenticated
  USING (true);

-- INSERT / UPDATE / DELETE : aucune policy client — service_role uniquement.

-- -----------------------------------------------------------------------
-- 2. Table quest_completions
-- -----------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.quest_completions (
  id         BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id    UUID        NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  quest_slug TEXT        NOT NULL REFERENCES public.quest_definitions(slug),
  day        DATE        NOT NULL,  -- date UTC serveur, jamais la date client
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_completion UNIQUE (user_id, quest_slug, day)
);

-- Index pour la lecture des complétion du jour (plafond + affichage)
CREATE INDEX IF NOT EXISTS idx_qc_user_day
  ON public.quest_completions (user_id, day DESC);

ALTER TABLE public.quest_completions ENABLE ROW LEVEL SECURITY;

-- SELECT : chaque utilisateur ne voit que ses propres lignes.
CREATE POLICY "qc_select_own"
  ON public.quest_completions FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- INSERT / UPDATE / DELETE : aucune policy client — service_role uniquement.

-- -----------------------------------------------------------------------
-- 3. Table quest_streaks
-- -----------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.quest_streaks (
  user_id        UUID NOT NULL PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  current_streak INT  NOT NULL DEFAULT 0,
  last_day       DATE
);

ALTER TABLE public.quest_streaks ENABLE ROW LEVEL SECURITY;

-- SELECT : chaque utilisateur ne voit que sa propre ligne.
CREATE POLICY "qs_select_own"
  ON public.quest_streaks FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- INSERT / UPDATE / DELETE : aucune policy client — service_role uniquement.

-- -----------------------------------------------------------------------
-- 4. Table app_events
-- -----------------------------------------------------------------------
-- Empreintes serveur pour les quêtes de type 'app'.
-- Aucune policy client : les lignes sont insérées exclusivement par les
-- Edge Functions via service_role. Le client ne lit jamais cette table
-- directement — les informations utiles remontent via quest_completions.

CREATE TABLE IF NOT EXISTS public.app_events (
  id         BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id    UUID        NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  event_type TEXT        NOT NULL,
  ref_id     TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index pour la vérification de quête : sélection par (user, type) récents
CREATE INDEX IF NOT EXISTS idx_app_events_lookup
  ON public.app_events (user_id, event_type, created_at DESC);

ALTER TABLE public.app_events ENABLE ROW LEVEL SECURITY;

-- Aucune policy client — SELECT / INSERT / UPDATE / DELETE via service_role uniquement.

-- -----------------------------------------------------------------------
-- 5. Données initiales quest_definitions
-- -----------------------------------------------------------------------

INSERT INTO public.quest_definitions (slug, name, category, reward) VALUES
  ('lol_play_game',  'Joue une partie classée',          'lol', 10),
  ('lol_win_game',   'Gagne une partie classée',          'lol', 15),
  ('app_view_match', 'Consulte le détail d''une partie',  'app',  5)
ON CONFLICT (slug) DO NOTHING;

-- -----------------------------------------------------------------------
-- 6. Valeurs initiales app_settings pour le système de quêtes
-- -----------------------------------------------------------------------
-- cap_daily_scales  : plafond d'Écailles gagnables par quêtes en un jour
-- streak_bonus_pct  : bonus streak en % par jour de streak (ex : 10 = +10 %/jour)

INSERT INTO public.app_settings (key, value) VALUES
  ('cap_daily_scales', '25'),
  ('streak_bonus_pct',  '0')
ON CONFLICT (key) DO NOTHING;

-- -----------------------------------------------------------------------
-- 7. Fonction finalize_quest_claim
-- -----------------------------------------------------------------------
-- Appelée par l'Edge Function quests-claim (service_role).
-- Non exposée en RPC direct au client (REVOKE FROM PUBLIC en fin de fichier).
--
-- Paramètres :
--   p_user_id    : UUID de l'utilisateur
--   p_quest_slug : slug de la quête (FK quest_definitions)
--   p_day        : date UTC du claim (fournie par le serveur, pas le client)
--   p_reward     : récompense de base en Écailles (vérifiée côté Edge Function)
--
-- Résultat : VOID. En cas d'erreur métier, RAISE EXCEPTION avec un code texte.

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
  -- Étape 1 — Advisory lock par utilisateur (xact-level)
  -- Sérialise tous les claims simultanés d'un même utilisateur.
  -- Sans ce verrou, deux claims concurrents pourraient tous deux passer le
  -- check de plafond avant qu'un débit soit écrit → risque de double-crédit.
  -- Le verrou est libéré automatiquement à la fin de la transaction.
  PERFORM pg_advisory_xact_lock(hashtext(p_user_id::text));

  -- Étape 2 — Dédup (authoritative)
  -- Même si l'Edge Function vérifie en amont, ce contrôle in-transaction est
  -- la source de vérité : il s'exécute sous le verrou advisory et est donc
  -- insensible à la concurrence.
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
  -- Somme des récompenses des quêtes déjà complétées aujourd'hui.
  -- Le plafond est lu depuis app_settings ; défaut = 25 si la clé est absente.
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

  -- Étape 4 — Lecture du streak courant et calcul du bonus
  -- streak_bonus_pct = 0 désactive le bonus (comportement par défaut).
  -- Formule : total = reward + reward * streak * bonus_pct / 100 (arrondi entier).
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

  -- Étape 5 — Débit ledger (idempotent)
  -- ref_id unique par (user, quête, jour) : garantit qu'un double appel
  -- sur la même quête le même jour est un no-op silencieux grâce à
  -- l'index uq_ledger_ref (migration 20260606000002).
  v_ref_id := 'quest:' || p_user_id::text || ':' || p_quest_slug || ':' || p_day::text;

  INSERT INTO public.scales_ledger (user_id, delta, source, ref_id)
  VALUES (p_user_id, v_total, 'quest', v_ref_id)
  ON CONFLICT (ref_id) DO NOTHING;

  -- Étape 6 — Enregistrement de la complétion (idempotent)
  INSERT INTO public.quest_completions (user_id, quest_slug, day)
  VALUES (p_user_id, p_quest_slug, p_day)
  ON CONFLICT (user_id, quest_slug, day) DO NOTHING;

  -- Étape 7 — Mise à jour du streak
  -- Cas couverts :
  --   last_day IS NULL      : premier claim de l'historique → streak = 1
  --   last_day = p_day - 1  : jour consécutif → streak + 1
  --   last_day = p_day      : déjà une quête ce jour → streak inchangé
  --                           (déjà compté lors du premier claim du jour)
  --   last_day < p_day - 1  : jour(s) manqué(s) → reset à 1
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
    NULL;  -- même jour, streak déjà mis à jour lors du premier claim aujourd'hui

  ELSE
    -- Jour(s) manqué(s) : remise à zéro du streak
    UPDATE public.quest_streaks
       SET current_streak = 1,
           last_day       = p_day
     WHERE user_id = p_user_id;
  END IF;
END;
$$;

-- La fonction n'est pas exposée en RPC direct au client.
-- L'accès se fait exclusivement via l'Edge Function quests-claim (service_role).
REVOKE EXECUTE ON FUNCTION public.finalize_quest_claim(UUID, TEXT, DATE, INT) FROM PUBLIC;
