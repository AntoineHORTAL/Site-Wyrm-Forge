// Résolution d'un flag à travers sa chaîne `parent_key` — module PUR, sans import.
//
// Importé par `feature-flags.ts` (Deno, extension `.ts` obligatoire) ET par les tests
// vitest du dépôt : il ne doit dépendre d'aucune API Deno ni d'aucun `https://` pour
// rester exécutable des deux côtés.
//
// Même règle que `resolveFlags` côté clients (`src/lib/feature-flags.ts`) et que la
// fonction SQL `launch_flag_on` (migration 20261017000002) : un flag n'est actif que
// si lui ET tous ses ancêtres valent 'true'. Avant, les Edge Functions ne lisaient que
// la ligne demandée — `shop_enabled` ouvert sous `ecailles_enabled` fermé laissait
// passer un achat que les deux clients, eux, cachaient.

export interface FlagChainRow {
  key: string
  value: string | null
  parent_key: string | null
}

/** Profondeur maximale de la chaîne — garde-fou anti-cycle, aligné sur les clients. */
export const MAX_FLAG_DEPTH = 8

/**
 * `key` est-il actif d'après `rows` (le catalogue `app_settings`) ?
 * Fail-closed : clé absente, parent absent, valeur ≠ 'true' ou chaîne trop longue
 * (cycle) ⇒ `false`.
 */
export function flagChainOpen(rows: readonly FlagChainRow[], key: string): boolean {
  const byKey = new Map(rows.map(r => [r.key, r]))
  let current: string | null = key
  for (let depth = 0; depth < MAX_FLAG_DEPTH && current; depth++) {
    const row = byKey.get(current)
    if (!row || row.value !== 'true') return false
    if (!row.parent_key) return true
    current = row.parent_key
  }
  return false
}
