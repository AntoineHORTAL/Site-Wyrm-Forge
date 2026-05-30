-- Validate riot_rank values on the profiles table.
-- Only the 8 canonical LoL tier keys (or NULL) are accepted.
-- Matches exactly the LOL_RANKS array in src/app/profil/page.tsx.
ALTER TABLE profiles
  ADD CONSTRAINT chk_profiles_riot_rank
  CHECK (riot_rank IS NULL OR riot_rank IN (
    'iron', 'bronze', 'silver', 'gold',
    'platinum', 'emerald', 'diamond', 'master+'
  ));
