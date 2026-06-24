-- M1 — Riot account linkage via icon challenge (2026-06-06).
--
-- Goal: allow the site to verify that a Wyrm Forge user owns a Riot account
-- by asking them to equip a specific profile icon for a short window.
-- The Edge Function (service_role) writes the result; the client never touches
-- riot_* columns directly.
--
-- Changes:
--   1. UNIQUE constraint on riot_puuid — one Riot account per Wyrm Forge profile.
--   2. Two new nullable columns: riot_link_pending (JSONB), riot_link_expires_at.
--   3. BEFORE UPDATE trigger fn_protect_riot_columns — blocks any direct write
--      to riot_* columns from authenticated (client) role.
--   4. SECURITY DEFINER function clear_riot_link() — lets authenticated users
--      unlink their own Riot account cleanly, bypassing the trigger.
--
-- RLS impact:
--   • No new RLS policy is added — the trigger acts as an additional hard guard
--     on top of the existing UPDATE policy on profiles.
--   • service_role (Edge Functions) and postgres (SECURITY DEFINER) are NOT
--     affected by the trigger (current_user check is role-specific).
--
-- Client contract:
--   • Site React   : READ riot_link_pending / riot_link_expires_at to display
--                    challenge state; CALL clear_riot_link() to unlink.
--   • App WPF      : reads riot_puuid / riot_gamename / riot_tagline /
--                    riot_platform (unchanged); unaware of the pending columns.
--   • Edge Function: writes all riot_* columns via service_role — bypass RLS
--                    and bypass this trigger.

-- ── 1. UNIQUE constraint on riot_puuid ───────────────────────────────────────

-- NULLs are not considered equal in Postgres UNIQUE — multiple unlinked
-- profiles (riot_puuid = NULL) are allowed without conflict.
ALTER TABLE public.profiles
  ADD CONSTRAINT uq_profiles_riot_puuid UNIQUE (riot_puuid);

-- ── 2. New columns ────────────────────────────────────────────────────────────

-- riot_link_pending: transient JSONB written by the Edge Function when the
-- user initiates the icon-challenge flow.
-- Expected shape:
--   {
--     "target_icon":     <int>,    -- icon id the user must equip
--     "candidate_puuid": "<str>",  -- PUUID to be confirmed
--     "platform":        "<str>",  -- e.g. "euw1"
--     "game_name":       "<str>",
--     "tag_line":        "<str>"
--   }
-- Set to NULL once the challenge is confirmed or expired.
--
-- riot_link_expires_at: UTC timestamp after which the pending challenge is void.
-- The Edge Function rejects verification attempts past this deadline.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS riot_link_pending     JSONB,
  ADD COLUMN IF NOT EXISTS riot_link_expires_at  TIMESTAMPTZ;

-- ── 3. Trigger: protect riot_* columns from direct client writes ──────────────

-- Any UPDATE arriving as current_user = 'authenticated' (i.e., a direct Supabase
-- client call with a user JWT) that attempts to change a riot_* column is
-- rejected with SQLSTATE 42501 (insufficient_privilege).
--
-- Roles that are NOT blocked:
--   • service_role  — Edge Functions (riot-link verifier, riot-matches, etc.)
--   • postgres      — SECURITY DEFINER functions such as clear_riot_link()
CREATE OR REPLACE FUNCTION public.fn_protect_riot_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user = 'authenticated' AND (
    NEW.riot_puuid           IS DISTINCT FROM OLD.riot_puuid           OR
    NEW.riot_gamename        IS DISTINCT FROM OLD.riot_gamename        OR
    NEW.riot_tagline         IS DISTINCT FROM OLD.riot_tagline         OR
    NEW.riot_platform        IS DISTINCT FROM OLD.riot_platform        OR
    NEW.riot_link_pending    IS DISTINCT FROM OLD.riot_link_pending    OR
    NEW.riot_link_expires_at IS DISTINCT FROM OLD.riot_link_expires_at
  ) THEN
    RAISE EXCEPTION 'direct modification of riot columns not allowed'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

-- Drop before re-create to keep the migration idempotent on re-runs.
DROP TRIGGER IF EXISTS trg_protect_riot_columns ON public.profiles;

CREATE TRIGGER trg_protect_riot_columns
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_protect_riot_columns();

-- ── 4. Function clear_riot_link() ────────────────────────────────────────────

-- Lets an authenticated user unlink their Riot account from the site UI.
-- SECURITY DEFINER → runs as postgres → bypasses the trigger above.
-- SET search_path = public → prevents search_path injection.
--
-- Clears: riot_puuid, riot_gamename, riot_tagline, riot_platform,
--         riot_link_pending, riot_link_expires_at.
-- Preserves: riot_rank (independent user preference, unrelated to account link).
--
-- Only affects the row matching auth.uid() — impossible to clear another user's
-- Riot link even if the caller knows their profile id.
CREATE OR REPLACE FUNCTION public.clear_riot_link()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
  SET
    riot_puuid           = NULL,
    riot_gamename        = NULL,
    riot_tagline         = NULL,
    riot_platform        = NULL,
    riot_link_pending    = NULL,
    riot_link_expires_at = NULL
  WHERE id = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION public.clear_riot_link() TO authenticated;
