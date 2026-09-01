/**
 * Paliers d'abonnement — source unique de vérité pour « qui a payé ? ».
 *
 * Ce module ne connaît RIEN de l'UI : pas de React, pas de libellés, pas de
 * couleurs. Il ne répond qu'à une question, et cette question ne doit être
 * répondue qu'ici.
 *
 * ⚠️ Ne pas confondre avec `lib/lol-tiers.ts`, qui traite des rangs LoL
 * (IRON → CHALLENGER). Aucun rapport : autre domaine, autres valeurs.
 *
 * Les valeurs sont celles de la colonne `profiles.tier`, partagée avec l'app de
 * bureau WPF. Cette colonne est un `text` SANS contrainte CHECK
 * (cf. `20260529000000_baseline_pre_versioning.sql`) : la liste ci-dessous est
 * une convention de code, pas une garantie de la base. C'est précisément
 * pourquoi `isPaidTier` ne s'appuie PAS dessus (voir plus bas).
 *
 * Historique — `architecte` et `architecte+` ont été RETIRÉS de l'offre
 * (migration `20260901000004_retire_tier_architecte.sql`, qui a basculé les
 * comptes concernés sur `maître`). La colonne n'ayant pas de CHECK, ces valeurs
 * restent techniquement écrivables : `isPaidTier` continue donc de les traiter
 * comme payantes, exactement comme n'importe quel palier inconnu.
 */

/**
 * Palier GRATUIT — le seul.
 *
 * Aligné sur `profiles.tier`. Consommé aussi par `lib/ads.ts` : le palier qui
 * voit des publicités et le palier qui n'a pas accès aux fonctionnalités
 * payantes sont le même, et doivent le rester.
 */
export const FREE_TIER = 'apprenti'

/**
 * Liste ordonnée canonique des paliers, du plus bas au plus haut.
 *
 * C'est la liste des paliers PROPOSABLES : ce que le panneau admin sait
 * assigner, et ce dont l'interface sait compter les comptes. Ce n'est PAS la
 * liste exhaustive de ce qui peut exister en base — un palier retiré de l'offre
 * sort d'ici sans que sa valeur disparaisse de la colonne pour autant.
 *
 * ⚠️ `isPaidTier` NE L'UTILISE PAS, volontairement — c'est le cœur de la
 * décision, pas un oubli (voir la doc de la fonction). Cette constante reste
 * exportée comme référence pour tout ce qui a réellement besoin d'un ORDRE
 * (affichage, comparaison de niveaux), et pour qu'il n'existe plus qu'une seule
 * copie de cette liste.
 *
 * `AdminTab.tsx` en réexporte un alias sous le nom `TIERS` — c'est la même
 * référence, pas une copie.
 */
export const TIER_ORDER: string[] = [
  'apprenti',
  'forgeron',
  'maître',
  'légion',
]

/**
 * L'utilisateur est-il sur un palier PAYANT ?
 *
 * Formulé en NÉGATIF — « tout ce qui n'est pas le palier gratuit » — et non par
 * une liste blanche des paliers payants. Même raisonnement que `shouldShowAds`
 * dans `lib/ads.ts`, et pour la même raison : la liste des paliers payants a
 * déjà bougé et bougera encore. Avec une liste blanche, un palier ajouté demain
 * perdrait l'accès aux fonctionnalités payantes **en silence**, pour des gens
 * qui paient. Avec cette formulation, il l'obtient par défaut.
 *
 * Effet de bord voulu : la question « Légion / Monarque sont-ils des paliers ou
 * des add-ons ? » devient sans objet ici. Quoi qu'ils soient, ils ne sont pas
 * `apprenti`, donc ils passent — ce qu'ils font déjà aujourd'hui.
 *
 * ⚠️ NE PAS écrire `!shouldShowAds(tier)` pour obtenir ce résultat. Les deux
 * fonctions ont des défauts OPPOSÉS sur les cas inconnus, et c'est correct dans
 * les deux sens : pour une publicité, dans le doute on n'affiche rien (on
 * préfère rater une impression que d'en imposer une à un abonné) ; pour un
 * verrou, dans le doute on refuse. `shouldShowAds(null)` vaut `false`, donc
 * `!shouldShowAds(null)` vaudrait `true` — un profil non chargé ouvrirait
 * l'accès. D'où cette fonction dédiée plutôt qu'une négation.
 *
 * @param tier valeur brute de `profiles.tier`. Peut être `null`/`undefined` si
 *             le profil n'est pas encore chargé, ou capitalisée : `page.tsx`
 *             utilise un repli `'Apprenti'` pour l'affichage. La base ne
 *             contient aujourd'hui que des minuscules (vérifié le 2026-09-01) —
 *             on normalise quand même, la colonne n'ayant aucune contrainte.
 */
export function isPaidTier(tier: string | null | undefined): boolean {
  // Palier inconnu (profil non chargé, valeur vide) => refus. Un verrou se
  // ferme dans le doute.
  if (!tier) return false
  return tier.trim().toLowerCase() !== FREE_TIER
}
