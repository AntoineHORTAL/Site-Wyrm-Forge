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
/**
 * Libellés de file, indexés par le `queueId` de l'API Riot — Lot 8.
 *
 * La clé EST la valeur du contrat Riot, jamais un libellé : elle sert aussi de clé de
 * regroupement dans la répartition par mode de `StatsTab`.
 *
 * ⚠️ Cette table remplace DEUX copies divergentes :
 *  - `QUEUE_LABELS_LIVE` (`lib/live-game.ts`), la liste normative des 12 `queue_id`
 *    d'AGENTS.md §D — reprise ici à l'identique côté français ;
 *  - `QUEUES` de l'Edge Function `riot-matches`, qui résout `queueName` côté SERVEUR
 *    et ne connaît donc qu'une seule langue.
 * Le client reçoit `queueId` en plus de `queueName` dans chaque match : il peut donc
 * afficher un libellé traduit SANS aucun changement d'API. `queueName` reste dans les
 * réponses, il n'est simplement plus affiché.
 *
 * ⚠️ `lib/prac.ts` garde sa propre table : `/prac/*` est hors périmètre du chantier.
 */
const queuesFr = {
  0:    'Personnalisée',
  400:  'Normale Draft',
  420:  'Classée Solo/Duo',
  430:  'Normale Aveugle',
  440:  'Classée Flex',
  450:  'ARAM',
  700:  'Clash',
  900:  'URF',
  1020: 'Légendes Uniques',
  1400: 'Ultime Spellbook',
  1700: 'Arena',
  1900: 'URF (pick)',
}

export type QueueId = keyof typeof queuesFr

const queuesEn: Record<QueueId, string> = {
  0:    'Custom',
  400:  'Normal Draft',
  420:  'Ranked Solo/Duo',
  430:  'Normal Blind',
  440:  'Ranked Flex',
  450:  'ARAM',
  700:  'Clash',
  900:  'URF',
  1020: 'One for All',
  1400: 'Ultimate Spellbook',
  1700: 'Arena',
  1900: 'URF (pick)',
}

export const commonFr = {
  loading: 'Chargement…',
  delete: 'Supprimer',
  cancel: 'Annuler',
  /* Résultat d'une partie — affiché par Accueil et Stats. */
  win: 'Victoire',
  loss: 'Défaite',
  /* Initiales du même résultat, pour les cases compactes de la timeline Stats. */
  winInitial: 'V',
  lossInitial: 'D',
  /* Indexé par `queueId` (API Riot) — voir `queueLabel`. */
  queues: queuesFr,
  /* Repli pour un `queueId` absent de la table : l'id reste affiché, c'est la seule
     information dont on dispose et elle vaut mieux qu'un « Inconnu » muet. */
  queueUnknown: 'File #{id}',
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
  queues: queuesEn,
  queueUnknown: 'Queue #{id}',
}

/**
 * Libellé d'affichage d'une file, à partir du `queueId` renvoyé par l'API Riot.
 *
 * Une file inconnue rend `File #1234` plutôt qu'un vide ou un `undefined` — c'est le
 * comportement historique de `lib/live-game.ts`, conservé et désormais traduit.
 */
export function queueLabel(dict: CommonDict, queueId?: number | null): string {
  if (queueId == null) return dict.queueUnknown.replace('{id}', '?')
  return dict.queues[queueId as QueueId] ?? dict.queueUnknown.replace('{id}', String(queueId))
}
