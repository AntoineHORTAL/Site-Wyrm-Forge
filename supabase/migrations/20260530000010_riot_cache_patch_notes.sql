-- Étend les contraintes CHECK de riot_cache et riot_rate_limits pour inclure
-- les fonctions patch-notes et patch-notes-generator qui utilisent le même cache
-- et le même rate-limiter.
--
-- Sans cet ajout :
--   • cacheSet depuis patch-notes/patch-notes-generator → violation 23514
--     (cache inopérant, la donnée n'est jamais écrite).
--   • isRateLimited depuis patch-notes → violation 23514 silencieuse
--     (fail open dans le helper, donc pas de crash, mais pas de rate limiting non plus).

-- ── riot_cache ────────────────────────────────────────────────────────────────
ALTER TABLE riot_cache
  DROP CONSTRAINT IF EXISTS riot_cache_function_name_check;

ALTER TABLE riot_cache
  ADD CONSTRAINT riot_cache_function_name_check
    CHECK (function_name IN (
      'riot-rank',
      'riot-matches',
      'riot-match-detail',
      'riot-rotation',
      'patch-notes',
      'patch-notes-generator'
    ));

-- ── riot_rate_limits ──────────────────────────────────────────────────────────
ALTER TABLE riot_rate_limits
  DROP CONSTRAINT IF EXISTS riot_rate_limits_function_name_check;

ALTER TABLE riot_rate_limits
  ADD CONSTRAINT riot_rate_limits_function_name_check
    CHECK (function_name IN (
      'riot-rank',
      'riot-matches',
      'riot-match-detail',
      'riot-rotation',
      'patch-notes',
      'patch-notes-generator'
    ));
