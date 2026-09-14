/**
 * Interrupteur UNIQUE de la souscription aux paliers payants (Forgeron / Maître).
 *
 * `false` tant que la clé Riot Games de PRODUCTION n'est pas approuvée : vendre
 * un abonnement adossé à une clé personnelle serait vendre un service qu'on ne
 * peut pas garantir. Décision HORTAL du 2026-09-14.
 *
 * Module PUR (aucun import), lisible par les composants clients comme par les
 * tests. Passer à `true` réactive d'un coup tous les points d'entrée — il n'y a
 * aucun `disabled` dispersé à retrouver ailleurs :
 *   - `Pricing.tsx`               boutons « S'abonner » + reprise après connexion
 *   - `app/page.tsx`              bascule vers l'onglet `tarifs` sur intention en attente
 *   - `Dashboard.tsx`             bouton « Voir les plans » de `LockedScreen`
 *   - `HouseAdSlot.tsx`           CTA « Découvre le palier … » de la colonne pub
 *   - `SubscriptionReminder.tsx`  bouton « Renouveler »
 *   - `app/profil/page.tsx`       lien « Voir les tarifs » du bloc palier gratuit
 * Désactivés, ils affichent `SubscriptionSoonBadge` (« Bientôt » / « Soon »).
 *
 * ⚠️ Ce n'est PAS une barrière : c'est de la PRÉSENTATION. Les routes
 * `/api/stripe/checkout` et `/api/stripe/webhook` sont volontairement laissées
 * intactes pour que la réactivation soit un changement d'une ligne. Tout ce qui
 * n'est pas lié à une souscription reste ouvert — en particulier le portail
 * Stripe de `/profil` (résiliation, factures), qu'un abonné existant doit
 * toujours pouvoir atteindre (art. L215-1-1).
 */
export const SUBSCRIPTIONS_ENABLED: boolean = false
