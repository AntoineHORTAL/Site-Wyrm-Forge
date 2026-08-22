/**
 * La Forge — onglet Écailles (`tabs/EcaillesTab.tsx`) et ses panneaux
 * (`components/ecailles/` : quêtes, boutique, équipement, historique de solde).
 *
 * ⚠️ Les noms de quêtes et de cosmétiques viennent de la BASE (`quest_definitions.name`,
 * `cosmetics.name`) et ne passent pas par ce dico : les traduire supposerait une
 * colonne de traduction côté Supabase, donc un changement de schéma partagé avec
 * l'app WPF. Hors périmètre de ce chantier.
 *
 * ⏳ Rempli au Lot 2 bis (avec les onglets légers) ou séparément.
 */
export const ecaillesFr = {}

export type EcaillesDict = typeof ecaillesFr

export const ecaillesEn: EcaillesDict = {}
