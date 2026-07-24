import { createClient } from '@/lib/supabase/client'

// Mutations partagées sur `workshop_builds`, consommées par DEUX écrans :
//   • WorkshopBuildsTab (page communauté) — bouton « Retirer ».
//   • BuildsTab (builds perso) — toggle « Publier » / « Dépublier ».
// Centraliser ici évite de dupliquer la subtilité RLS du DELETE (voir plus bas)
// et le format d'items PascalCase attendu par la page Workshop.

type SB = ReturnType<typeof createClient>

// ── Item / bloc au format workshop_builds.items (PascalCase, cf. contrat DB) ──
// Miroir de ce que la page Workshop lit (bl.Title, i.Id number, i.Name…) et de
// ce que le WPF sérialise. L'inverse de la conversion « slim » d'item_builds.
export interface WorkshopItem {
  Id: number
  Name: string
  Gold: number
  Count: number
  IconUrl: string
}
export interface WorkshopBlock {
  Id: string
  Title: string
  Items: WorkshopItem[]
}

// ── Suppression (partagée « Retirer » ⇄ « Dépublier ») ────────────────────────
// On peut cibler la ligne par son `id` propre OU par `source_build_id` (le lien
// vers l'item_builds d'origine). Les deux chemins passent par la même garde RLS.
export type WorkshopBuildFilter = { column: 'id' | 'source_build_id'; value: string }

// `.select()` est INDISPENSABLE : un DELETE refusé par la RLS (wb_delete_owner :
// auth.uid() = creator_id) ne lève PAS d'erreur — il supprime simplement 0 ligne.
// On ne se fie donc qu'aux lignes que le serveur dit avoir supprimées.
// removed=true ⇔ au moins une ligne réellement retirée.
export async function removeWorkshopBuild(
  supabase: SB,
  filter: WorkshopBuildFilter,
): Promise<{ removed: boolean; error?: string }> {
  const { data, error } = await supabase
    .from('workshop_builds')
    .delete()
    .eq(filter.column, filter.value)
    .select('id')

  if (error) return { removed: false, error: error.message }
  return { removed: !!data && data.length > 0 }
}

// ── Publication d'un build perso vers le Workshop ─────────────────────────────
// `source_build_id` = id de l'item_builds d'origine → permet le toggle et le
// « Dépublier » ultérieur. La FK (ON DELETE SET NULL) exige que cette ligne
// item_builds existe : l'appelant publie depuis un build déjà persisté, donc OK.
// creator_id explicite = utilisateur courant ; la RLS (wb_insert_owner :
// WITH CHECK auth.uid() = creator_id) le revérifie côté serveur.
export interface WorkshopPublishFields {
  sourceBuildId: string
  creatorId: string
  creatorName: string
  titre: string
  champion: string
  patch: string
  items: WorkshopBlock[]
}

export async function publishWorkshopBuild(
  supabase: SB,
  f: WorkshopPublishFields,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const { data, error } = await supabase
    .from('workshop_builds')
    .insert({
      titre:           f.titre,
      description:     '',
      creator_id:      f.creatorId,
      creator_name:    f.creatorName,
      champion:        f.champion,
      role:            '',
      patch:           f.patch,
      source_build_id: f.sourceBuildId,
      items:           f.items,
      runes:           {},
    })
    .select('id')
    .single()

  if (error) return { ok: false, error: error.message }
  return { ok: true, id: data.id as string }
}
