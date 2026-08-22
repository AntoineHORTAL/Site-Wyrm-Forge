/**
 * Chaînes TRANSVERSES de la zone connectée : libellés réutilisés par plusieurs
 * onglets (boutons génériques, états vides, erreurs, confirmations).
 *
 * Y mettre une chaîne n'a de sens que si elle est réellement partagée : un libellé
 * utilisé par un seul écran vit dans le module de cet écran, sinon ce fichier
 * redevient le fourre-tout que le découpage cherche à éviter.
 *
 * ⚠️ Ne PAS y placer les variantes spécialisées : « Chargement des statistiques… »
 * ou « Chargement des patch notes… » ne sont pas le `loading` générique, elles
 * appartiennent à leur écran.
 */
export const commonFr = {
  loading: 'Chargement…',
  delete: 'Supprimer',
  cancel: 'Annuler',
  /* Résultat d'une partie — affiché par Accueil, Stats et Historique. */
  win: 'Victoire',
  loss: 'Défaite',
  /* Initiales du même résultat, pour les cases compactes de la timeline Stats. */
  winInitial: 'V',
  lossInitial: 'D',
}

export type CommonDict = typeof commonFr

export const commonEn: CommonDict = {
  loading: 'Loading…',
  delete: 'Delete',
  cancel: 'Cancel',
  win: 'Victory',
  loss: 'Defeat',
  winInitial: 'W',
  lossInitial: 'L',
}
