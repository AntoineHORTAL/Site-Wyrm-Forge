-- Étend la contrainte CHECK de riot_cache pour inclure les limiteurs de débit par
-- IP (fenêtre glissante) qui détournent riot_cache comme KV :
--   • 'public-search'  → checkIpRateLimit / riotCacheBackend        (F3 Lot 1, recherche)
--   • 'detail-quota'   → peek/commitDetailRateLimit / riotCacheDetailBackend (F3 Lot 2, détail)
--
-- BUG corrigé : ces deux fonctions écrivent dans riot_cache avec un function_name
-- absent de la liste autorisée (dernière définition : 20260530000010). L'upsert
-- levait 23514 (check_violation) à CHAQUE écriture ; les backends `set()` avalent
-- l'erreur (fail-open documenté dans ip-rate-limit.ts) → AUCUN compteur n'était
-- jamais persisté → rate limiting recherche ET quota détail totalement inopérants
-- (le quota détail restait affiché « 10/10 » en permanence, peek relisant toujours
-- une clé absente). Même classe de bug que 20260530000010 pour patch-notes.
--
-- riot_rate_limits N'est PAS concernée : le limiteur atomique isRateLimited y écrit
-- sous le vrai nom d'EF ('riot-matches'/'riot-match-detail'), déjà autorisé. Seul
-- riot_cache (le KV détourné) doit voir sa liste étendue.

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
      'patch-notes-generator',
      'public-search',
      'detail-quota'
    ));
