-- Reversement de la dette « bootstrap §1 » — LE seul écart des cinq qui soit un
-- trou de sécurité réel.
--
-- 20260530000005 (« rls_workshop_harden ») crée les policies wb_* et wjp_* mais
-- n'exécute JAMAIS `ENABLE ROW LEVEL SECURITY`. Des policies sur une table dont la
-- RLS est désactivée sont INERTES : elles ne filtrent rien. Or les DEFAULT PRIVILEGES
-- Supabase accordent ALL à anon et authenticated sur toute table du schéma public
-- (constat déjà fait et corrigé pour d'autres tables par 20260627000003). Résultat sur
-- toute base où l'activation n'a pas été faite à la main : `workshop_builds` et
-- `workshop_junglepaths` sont en lecture ET ÉCRITURE libres pour n'importe quel
-- porteur de la clé anon — n'importe qui peut modifier ou supprimer les publications
-- de n'importe qui.
--
-- Même classe de bug que celle corrigée pour `profiles` par 20260606000009 (« P0
-- CRITIQUE »), jamais étendue aux tables Workshop.
--
-- L'activation a été faite à la main sur la prod et sur le projet de test, via
-- bootstrap/01_post_push_alignment.sql. Comme pour 20260815000001, cette migration
-- est donc un NO-OP sur les bases vivantes : ce qu'elle achète est la résistance au
-- rejeu (db reset, branche Supabase, environnement neuf), où l'état actuel dépend
-- d'un fichier hors-migration joué une seule fois.
--
-- ⚠️ PAS de FORCE ROW LEVEL SECURITY — délibérément.
-- `increment_likes` / `increment_saves` / `increment_jp_likes` / `increment_jp_saves`
-- sont SECURITY DEFINER (définies dans bootstrap/00, search_path figé par
-- 20260715000001) et font un UPDATE sur ces deux tables. Elles ne fonctionnent que
-- parce que le propriétaire de la table échappe à la RLS. FORCE supprimerait cette
-- exemption et casserait les compteurs likes/saves des deux clients, sans qu'aucune
-- policy UPDATE n'existe pour les rattraper.
--
-- MODÈLES D'AUTORISATION — les deux tables ne suivent PAS le même patron :
--
--   workshop_builds       → owner-scopé. `creator_id` + DEFAULT auth.uid().
--     SELECT public / INSERT-UPDATE-DELETE réservés au propriétaire de la ligne.
--
--   workshop_junglepaths  → rôle-scopé. Pas de colonne propriétaire (`creator_name`
--     est du texte libre, décoratif, et n'apparaît dans AUCUNE policy).
--     SELECT public / INSERT tout authentifié / DELETE admin seul (20260716000001) /
--     UPDATE refusé à tous (aucune policy).
--     L'absence de propriétaire coûte de la FONCTIONNALITÉ (un auteur ne peut ni
--     éditer ni retirer son propre path), pas de la sécurité : une fois la RLS
--     active, la surface est strictement plus petite qu'aujourd'hui. F5 (ajout d'un
--     creator_id) reste non tranché et n'est PAS un prérequis à cette migration.
--
-- Chemins clients vérifiés avant activation — aucun ne casse :
--   • WPF `JungleWorkshopService` : lecture clé anon (SELECT public), publication
--     sous JWT user (satisfait wjp_insert_authenticated), likes/saves par RPC.
--     Aucun UPDATE ni DELETE direct.
--   • WPF `WorkshopService` : publication sous JWT AVEC `creator_id = userId` posé
--     explicitement, dépublication via wb_delete_owner.
--   • Site `WorkshopJungleTab` : SELECT + rpc('increment_jp_likes'). Rien d'autre.
--   • Site `workshop-builds.ts` : insert avec creator_id, delete filtré.

-- ── Garde : les policies attendues doivent exister AVANT d'activer ────────────
-- Activer la RLS sur une table sans policy la rend totalement inaccessible aux rôles
-- client. Si un futur réordonnancement faisait passer cette migration avant
-- 20260530000005 / 20260716000001, on veut échouer ici plutôt que de couper le
-- Workshop en silence.
DO $$
DECLARE
  v_missing TEXT;
BEGIN
  SELECT string_agg(expected.polname, ', ' ORDER BY expected.polname)
    INTO v_missing
    FROM (VALUES
      ('workshop_builds',      'wb_select_public'),
      ('workshop_builds',      'wb_insert_owner'),
      ('workshop_builds',      'wb_update_owner'),
      ('workshop_builds',      'wb_delete_owner'),
      ('workshop_junglepaths', 'wjp_select_public'),
      ('workshop_junglepaths', 'wjp_insert_authenticated'),
      ('workshop_junglepaths', 'wjp_delete_admin')
    ) AS expected(tblname, polname)
   WHERE NOT EXISTS (
     SELECT 1 FROM pg_policies p
      WHERE p.schemaname = 'public'
        AND p.tablename  = expected.tblname
        AND p.policyname = expected.polname
   );

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION
      'Policies Workshop manquantes (%) — activer la RLS maintenant rendrait les tables inaccessibles. Voir 20260530000005 et 20260716000001.', v_missing;
  END IF;
END $$;

-- ── Activation ───────────────────────────────────────────────────────────────
-- Idempotent : sans effet sur une table où la RLS est déjà active.
ALTER TABLE public.workshop_builds      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workshop_junglepaths ENABLE ROW LEVEL SECURITY;
