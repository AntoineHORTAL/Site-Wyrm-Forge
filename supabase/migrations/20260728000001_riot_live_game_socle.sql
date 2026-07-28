-- Socle DB pour la future Edge Function `riot-live-game` (spectator-v5,
-- composition d'une partie en cours). Ce lot pose UNIQUEMENT la base de
-- données (contraintes CHECK + feature flag) — l'EF elle-même, sa config
-- (config.toml) et son code arrivent au Lot B.
--
-- Décisions produit déjà tranchées : kill-switch via feature flag
-- (`live_game_enabled`), TTL cache positif 5 min (posé côté EF au Lot B),
-- le WPF affichera composition + rangs des deux équipes.

-- ── riot_rate_limits ──────────────────────────────────────────────────────────
-- Étend la contrainte CHECK de riot_rate_limits pour inclure les fonctions
-- qui appellent (ou pourraient appeler) isRateLimited (_shared/rate-limit.ts).
--
-- POURQUOI : isRateLimited() appelle fn_riot_rate_increment (SECURITY DEFINER),
-- qui fait un INSERT ... ON CONFLICT sur riot_rate_limits avec le paramètre
-- p_function_name. Si ce nom n'est pas dans la liste autorisée par le CHECK,
-- l'INSERT lève 23514 (check_violation) — et isRateLimited() a un
-- `if (error) return false` (rate-limit.ts) : la violation est avalée en
-- silence, la fonction répond "pas limité", et le rate limiting est
-- TOTALEMENT INOPÉRANT sans aucun signal d'erreur visible. Même classe de
-- bug que celui déjà corrigé sur riot_cache (20260719000001).
--
-- ⚠️ CORRECTIF D'UNE AFFIRMATION PÉRIMÉE : le commentaire de la migration
-- 20260719000001 (lignes 14-16) affirme "riot_rate_limits N'est PAS
-- concernée". C'était vrai à l'époque pour public-search/detail-quota, qui
-- sont des limiteurs KV maison écrivant directement dans riot_cache (pas
-- dans riot_rate_limits, et n'appelant pas isRateLimited). Mais cette
-- affirmation ne généralise PAS : toute EF FUTURE qui appelle isRateLimited()
-- sous un nouveau nom (comme `riot-live-game` le fera) DOIT être ajoutée ici.
-- Ne pas se fier à l'ancien commentaire pour une nouvelle fonction.
--
-- Nouvelle liste = les 6 valeurs existantes (dernière définition :
-- 20260530000010) + 2 ajouts PRÉVENTIFS (rattrapage de dette, voir note
-- ci-dessous) + riot-live-game (usage réel prévu au Lot B) :
--   'public-search' et 'detail-quota' sont dans riot_cache depuis
--   20260719000001 (elles y écrivent leur propre KV de rate limiting) mais
--   n'avaient JAMAIS été ajoutées ici, dans riot_rate_limits. Elles
--   n'appellent PAS isRateLimited() aujourd'hui — cet ajout est donc
--   PRÉVENTIF (aligner les deux contraintes, pas parce qu'un appel existant
--   échouerait) : un futur lecteur ne doit pas croire à tort qu'elles sont
--   des consommatrices actives de riot_rate_limits.
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
      'patch-notes-generator',
      'public-search',
      'detail-quota',
      'riot-live-game'
    ));

-- ── riot_cache ────────────────────────────────────────────────────────────────
-- Étend la contrainte CHECK de riot_cache (dernière définition :
-- 20260719000001, 8 valeurs) pour inclure riot-live-game — l'EF va écrire son
-- cache positif dedans (TTL 5 min, décision produit actée) comme les autres
-- proxys Riot.
--
-- Les deux contraintes (riot_cache et riot_rate_limits) convergent
-- désormais sur la MÊME liste de 9 valeurs. C'est volontaire : elles avaient
-- divergé par le passé (public-search/detail-quota ajoutées à riot_cache
-- mais oubliées ici), c'est précisément ce qui a produit le bug documenté
-- plus haut. Garder les deux listes synchronisées à chaque ajout futur.
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
      'detail-quota',
      'riot-live-game'
    ));

-- ── app_settings — feature flag live_game_enabled ─────────────────────────────
-- Kill-switch pour la future EF riot-live-game, sur le même modèle que les
-- flags M0 (20260606000001) : désactivé par défaut ('false'), lu via
-- isFeatureEnabled() (_shared/feature-flags.ts) qui est déjà générique
-- (prend n'importe quelle clé en paramètre) — aucune modification du helper
-- n'est nécessaire pour ce nouveau flag.
--
-- RLS héritée de app_settings (20260530000009) :
--   SELECT  → authenticated
--   UPDATE  → is_admin() uniquement
--   INSERT / DELETE → aucune policy client (service_role only, comme ici)
INSERT INTO public.app_settings (key, value) VALUES
  ('live_game_enabled', 'false')
ON CONFLICT (key) DO NOTHING;

-- Migration additive et rétrocompatible : élargir un CHECK IN (...) n'affecte
-- aucune ligne existante (les valeurs déjà présentes restent valides) et ne
-- casse ni le site ni l'app WPF (règle d'or du projet : base partagée). Le
-- flag app_settings est un nouvel INSERT idempotent (ON CONFLICT DO NOTHING),
-- sans impact sur les clés existantes.
