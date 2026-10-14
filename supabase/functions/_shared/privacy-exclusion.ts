// Liste d'exclusion des joueurs opposés (migration 20261014000003).
//
// Décision PURE, sans import, testable sous vitest : la lecture de la table est
// injectée. Échec FERMÉ : si la liste ne peut pas être lue, on considère le
// joueur comme exclu. Perdre une entrée d'autocomplétion est sans gravité ;
// écrire au nom de quelqu'un qui s'y est opposé ne l'est pas.

/** Vrai si le PUUID figure dans la liste d'exclusion. Lève en cas d'erreur de lecture. */
export type ExclusionLookup = (puuid: string) => Promise<boolean>

/** Peut-on écrire une donnée au nom de ce joueur ? */
export async function mayRecordPlayer(puuid: string | null | undefined, lookup: ExclusionLookup): Promise<boolean> {
  if (!puuid) return false
  try {
    return !(await lookup(puuid))
  } catch {
    return false
  }
}
