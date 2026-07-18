-- I1 (audit sécurité) — restreint raw_source/model de patch_notes à service_role.
--
-- CONTEXTE : ces deux colonnes étaient lisibles par anon/authenticated via l'API
-- REST (RLS = garde de LIGNE uniquement — `pn_select_published_anon` sur
-- status='published' — donc toutes les colonnes d'une ligne publiée sortaient).
--   • raw_source = dump brut du scrape de la page publique Riot (~25-36 KB/ligne,
--     boilerplate cookies inclus) — copie de données déjà publiques, mais payload
--     superflu + détail d'implémentation (on scrape la page).
--   • model = identifiant du modèle LLM (« claude-sonnet-4-6 ») — détail
--     d'implémentation (vendeur/modèle).
-- Aucune donnée sensible (ni clé, ni token, ni prompt système, ni coût) mais ce
-- sont des champs d'AUDIT/RÉGÉNÉRATION, jamais consommés en lecture par le front :
-- les 3 lecteurs (/patch-notes, PatchNotesTab, AdminTab) sélectionnent des listes
-- de colonnes explicites SANS raw_source/model ; le seul accès à raw_source dans
-- tout le repo est une ÉCRITURE service_role (patch-notes-generator, INSERT).
--
-- ⚠️ POURQUOI PAS UN SIMPLE `REVOKE SELECT (raw_source, model)` : anon et
-- authenticated détiennent un GRANT SELECT AU NIVEAU TABLE (vérifié :
-- information_schema.role_table_grants). Un REVOKE colonne est alors INEFFECTIF —
-- le SELECT table couvre déjà toutes les colonnes. Il faut retirer le SELECT table
-- puis re-accorder SELECT colonne par colonne sur tout SAUF raw_source/model.
--
-- service_role : INCHANGÉ (garde son SELECT table complet → patch-notes-generator
-- et toute régénération/audit côté Edge Function continuent de lire ces colonnes).
-- postgres : inchangé (propriétaire). RLS de ligne : inchangée.

REVOKE SELECT ON public.patch_notes FROM anon, authenticated;

GRANT SELECT (
  id, version, title, summary_jsonb, image_url, status,
  source_url, created_at, updated_at, published_at, published_by
) ON public.patch_notes TO anon, authenticated;

-- Rafraîchit le cache de schéma PostgREST pour que l'expansion de `select=*`
-- reflète immédiatement les privilèges colonne.
NOTIFY pgrst, 'reload schema';
