-- item_builds.updated_at — date SERVEUR de dernière modification d'un build
--
-- CONTEXTE
-- L'app de bureau ne réimportait jamais un build qu'elle connaissait déjà : son merge raisonne
-- sur la seule présence de l'id. Des runes ajoutées sur le site à un build déjà présent dans
-- l'app n'y arrivaient donc jamais (diagnostic du 2026-10-20, bug « runes du build absentes du
-- client »). Pour savoir qu'un build a changé côté site, l'app compare la date serveur qu'elle a
-- enregistrée à sa dernière synchro avec celle-ci. Comparaison SERVEUR ↔ SERVEUR uniquement :
-- l'horloge du PC n'entre jamais dans la décision.
--
-- ÉTAT MESURÉ AVANT ÉCRITURE (PROD cuscgmgqakxnfwnsrhhv, 2026-10-20)
--   • item_builds : id, user_id, name, champ, blocks, total_gold, created_at, runes,
--     skill_order, components, priority — pas d'updated_at, aucun trigger ;
--   • public.fn_set_updated_at() existe (search_path fixé par 20260606000012) → réutilisée,
--     même patron que jungle_paths (20261018000001).
--
-- RÈGLE D'OR DU PROJET — IMPACT SUR L'AUTRE CLIENT (site React) : AUCUN.
--   • Changement purement ADDITIF : NOT NULL avec DEFAULT now(), les lignes existantes sont
--     remplies par la migration elle-même, aucun INSERT existant ne casse.
--   • Le site fait `select('*')` → il reçoit la colonne en plus et l'ignore.
--   • Le site fait `update(payload)` et `insert(...)` sans updated_at → le trigger et le DEFAULT
--     la renseignent. Une valeur envoyée par un client serait de toute façon écrasée par le
--     trigger à l'UPDATE : la date reste celle du serveur.
--   • L'app (ItemBuildSyncService) fait un UPSERT PostgREST : ON CONFLICT DO UPDATE déclenche
--     bien le trigger BEFORE UPDATE.
--
-- CONSÉQUENCE VOULUE : toutes les lignes existantes reçoivent la même date (celle de la
-- migration). L'app n'a encore enregistré aucune date serveur pour ses builds : à la première
-- synchro, elle pousse ses modifications locales en attente, PUIS remplace sa copie par celle
-- du site (en gardant l'activation locale). Règle validée le 2026-10-20.
--
-- RLS : inchangée — la policy ALL TO authenticated USING/WITH CHECK (user_id = auth.uid())
--       porte sur la ligne, elle couvre la nouvelle colonne.
-- PAS D'INDEX : l'app lit tous les builds de l'utilisateur et compare en mémoire.

ALTER TABLE public.item_builds
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

COMMENT ON COLUMN public.item_builds.updated_at IS
  'Date serveur de dernière modification (trigger trg_item_builds_updated_at). Lue par l''app '
  'de bureau pour réimporter un build modifié sur le site ; jamais comparée à une horloge client.';

DROP TRIGGER IF EXISTS trg_item_builds_updated_at ON public.item_builds;
CREATE TRIGGER trg_item_builds_updated_at
  BEFORE UPDATE ON public.item_builds
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();
