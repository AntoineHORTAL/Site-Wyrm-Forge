-- Additive columns for Riot account linkage on the shared `profiles` table.
-- All columns are nullable: they are populated progressively as the user links
-- their Riot account (site) or as the desktop app syncs rank snapshots.
-- No existing column is modified. No RLS policy is touched.

-- ── 1. New columns ────────────────────────────────────────────────────────────

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS riot_puuid     TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS riot_gamename  TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS riot_tagline   TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS riot_platform  TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS riot_rank      TEXT;

-- ── 2. Index ──────────────────────────────────────────────────────────────────

-- Edge Functions and the desktop app look up profiles by PUUID frequently.
-- Partial index: only rows where riot_puuid is set, keeping it small.
CREATE INDEX IF NOT EXISTS idx_profiles_riot_puuid
  ON profiles (riot_puuid)
  WHERE riot_puuid IS NOT NULL;
