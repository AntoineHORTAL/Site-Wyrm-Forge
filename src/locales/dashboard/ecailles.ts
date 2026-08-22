/**
 * La Forge — onglet Écailles (`tabs/EcaillesTab.tsx`).
 *
 * ⚠️ PÉRIMÈTRE : seul le CHÂSSIS de l'onglet est traduit (sélecteur de sous-vue,
 * écran « bientôt »). Les quatre panneaux qu'il monte — `components/ecailles/`
 * (BalanceHistory, QuestsPanel, ShopPanel, EquipmentPanel) — restent en français :
 * ils ne font pas partie du Lot 2.
 *
 * ⚠️ Les noms de quêtes et de cosmétiques viennent de la BASE
 * (`quest_definitions.name`, `cosmetics.name`) et ne passeront JAMAIS par ce dico :
 * les traduire supposerait une colonne de traduction côté Supabase, donc un
 * changement de schéma partagé avec l'app WPF.
 *
 * Décision produit actée : « Écailles » → « Scales », « La Forge » → « The Forge ».
 */
export const ecaillesFr = {
  /* Sous-vues — les `id` (`balance`/`quetes`/`boutique`/`equipement`) sont
     structurels et pilotent l'état local : seuls ces libellés changent. */
  viewBalance: 'Solde & Historique',
  viewQuests: 'Quêtes',
  viewShop: 'Boutique',
  viewEquipment: 'Mon Équipement',

  /* Écran affiché aux non-admins quand le flag `ecailles_enabled` est à false. */
  soonTitle: 'La Forge arrive bientôt',
  soonText: "Le système d'Écailles, les quêtes journalières et la boutique de cosmétiques seront disponibles prochainement.",
}

export type EcaillesDict = typeof ecaillesFr

export const ecaillesEn: EcaillesDict = {
  viewBalance: 'Balance & History',
  viewQuests: 'Quests',
  viewShop: 'Shop',
  viewEquipment: 'My Equipment',

  soonTitle: 'The Forge is coming soon',
  soonText: 'Scales, daily quests and the cosmetics shop will be available soon.',
}
