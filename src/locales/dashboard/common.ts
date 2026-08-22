/**
 * Chaînes TRANSVERSES de la zone connectée : libellés réutilisés par plusieurs
 * onglets (boutons génériques, états vides, erreurs, confirmations).
 *
 * Y mettre une chaîne n'a de sens que si elle est réellement partagée : un libellé
 * utilisé par un seul écran vit dans le module de cet écran, sinon ce fichier
 * redevient le fourre-tout que le découpage cherche à éviter.
 *
 * ⏳ Rempli au fil des lots — voir src/locales/dashboard/index.ts.
 */
export const commonFr = {}

export type CommonDict = typeof commonFr

export const commonEn: CommonDict = {}
