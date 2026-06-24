# Économie « Écailles » — Wyrm Forge (doc de référence)

> Document de design économique v1. Chiffres provisoires et ajustables.
> Source de vérité avant tout développement.

---

## 1. Principes

- **Monnaie** : Écailles.
- **Non convertible** : aucun cash-out possible. C'est la protection légale clé (évite la régulation monnaie électronique).
- **Modèle** : achetables (voie principale) **+** gagnables (complément modeste, jamais « à perte »).
- **Porte-monnaie unifié** : un seul solde côté joueur ; achetées et gagnées mélangées. Le système, lui, **tague la source** de chaque crédit (voir §7).
- **Éviers déterministes uniquement** : prix fixes, **aucun aléatoire** (pas de loot boxes / gacha).
- **Abonnements ≠ Écailles** : deux produits séparés. Les abos vendent de l'accès aux features ; les Écailles vendent des cosmétiques. Pas de stipend, aucune feature débloquée par des Écailles.

---

## 2. Phasage (important)

L'économie se construit en deux temps :

- **Phase 1 — Gagner & dépenser (sans paiement, AUCUNE dépendance société/Stripe)** :
  solde + ledger + gain (quêtes journalières) + boutique (dépense en cosmétiques) + système
  cosmétiques (catalogue / inventaire / affichage). Boucle complète, **construisable et
  livrable dès la beta**. C'est le prochain chantier non bloqué.
- **Phase 2 — Acheter (différée, après Kbis + Stripe en live)** :
  ajout du flux d'**achat d'Écailles à l'argent réel**, qui se branche sur le solde/ledger
  existants.

> **Règle d'équilibre CRITIQUE** : régler les taux de gain de la Phase 1 **comme si le
> paiement existait déjà** (équilibre final, conservateur). Une Phase 1 généreuse qu'on
> doit ensuite **resserrer** au lancement du paiement = colère des joueurs. On ne reprend
> jamais ce qu'on a donné. Donc on tune à la valeur définitive dès le départ.

> **Légal** : la Phase 1 (aucun argent entrant ni sortant) est la zone la plus sûre.
> Renonciation au droit de rétractation, TVA, e-money ne concernent que la **Phase 2**.

---

## 3. Robinets (comment on gagne)

| Source | Détail |
|---|---|
| **Achat** (argent réel) | Voie principale. **Phase 2.** |
| **Quête journalière** | ~25 Écailles/jour, façon MMO. **Phase 1.** |
| **Tournois gratuits** | Plus tard. Récompenses de placement modestes, sous le rythme de la quête. |
| Autres voies intégrées | Extensible, toujours en **complément modeste**. |

**Quêtes journalières** : actions à faire **dans LoL** (vérifiables) **et dans le site/app**,
**reset quotidien** (horloge **serveur**), **léger bonus de streak**.

### Anti-abus des quêtes
Risque **modéré** car les Écailles sont **non convertibles** (on ne farme que des cosmétiques,
jamais de l'argent) → pas besoin de forteresse anti-Sybil, juste de la rigueur serveur :

- **Tout côté serveur** : complétion vérifiée et Écailles créditées par le serveur
  (edge function / service_role), **jamais** par le client (qui n'affiche que la progression).
- **Vérifier contre la donnée autoritative** : quête en jeu → vérifiée contre le **vrai
  historique Riot** (la partie doit exister) ; quête app → vérifiée contre des **events
  loggés serveur**, pas une déclaration client.
- **Idempotent, 1 réclamation par période** : clé de dédup `user + quête + jour` ; le
  **serveur détient l'horloge de reset** (pas la date du client).
- **Plafond par compte** + **lien compte Riot vérifié** → renchérit le multi-compte.
- **Éviter les quêtes trivialement scriptables** : privilégier des actions « coûteuses »
  (un fetch Riot rate-limité/caché borne le spam).

---

## 4. Éviers (ce qu'on achète)

Cosmétiques **uniquement**, **prix fixe**, **zéro impact gameplay** :

| Rareté | Exemple | Prix |
|---|---|---|
| Commun | Badge / PP simple | **300** (~3 €) |
| Rare | Contour de PP | **700** (~7 €) |
| Légendaire | PP animée / contour animé | **1500** (~15 €) |

- **Disponibilité** : **set permanent** + **items saisonniers limités** dans le temps
  (Noël, Pâques, anniversaire, nouvel an, nouvel an chinois…). → le schéma cosmétiques doit
  gérer des **fenêtres de disponibilité** (date début/fin) en plus du permanent.
- **PP** = sélection dans un **set fourni** (façon Riot, comme les icônes d'invocateur).
  **Pas d'upload** → zéro modération, zéro stockage d'image utilisateur.
- **Affichage** :
  - Overlay **en game** + écrans **post-game** → surtout **auto-facing** (toi seul les vois).
  - **Profil public** → la vraie surface **sociale** (les autres voient tes cosmétiques =
    valeur « flex »). **Infos perso limitées**, **style HLTV** pour les badges. C'est ici
    qu'il faut mettre le paquet.

---

## 5. Taux d'achat & bundles (Phase 2)

- **100 Écailles = 1 €**
- Bundles avec bonus croissant :

| Prix | Écailles | Bonus |
|---|---|---|
| 1 € | 100 | — |
| 5 € | 550 | +10 % |
| 10 € | 1200 | +20 % |
| 20 € | 2600 | +30 % |

---

## 6. Équilibre

- **Règle d'or** : le chemin gratuit est **toujours la voie lente**. Le gratuit nourrit
  l'engagement, l'achat finance.
- Repères au démarrage :
  - ~12 jours pour un commun en gratuit
  - ~1 mois pour un rare
  - légendaire clairement orienté achat
  - ~750 Écailles/mois max pour un joueur assidu
- **Manette de réglage** si trop généreux : baisser la quête journalière **ou** monter les prix.
- Voir aussi la règle critique du §2 (tuner Phase 1 à la valeur définitive).

---

## 7. Contraintes techniques (build)

### Feature flags (toutes phases)
- État des flags en base (**réutiliser `app_settings`**).
- Toggle = **auth admin SERVEUR** (pas un mot de passe lu dans le JS, contournable).
- **Les endpoints des features cachées vérifient eux-mêmes le flag** — cacher l'UI ne suffit
  jamais (piège « gating cosmétique côté front » de l'audit).

### Ledger (dès la Phase 1)
- **Append-only** : chaque crédit/débit horodaté **avec sa source** (achat / quête / tournoi).
  Solde dérivé du ledger, pas un compteur.
- Source tracée pour : **remboursements/chargebacks** (clawback de la part achetée),
  **fraude**, **compta** (achetées = revenu ; gratuites = coût promo).
- À construire **avec le tag source dès la Phase 1**, pour que la Phase 2 se branche proprement.

### Paiement (Phase 2)
- **Deux flux Stripe** : abonnements (récurrent) + achats d'Écailles (ponctuel).
- **Créditage côté serveur uniquement**, via **webhook Stripe vérifié** (signature) +
  **idempotence** (un retry ne crédite jamais deux fois).
- **Renonciation ACTIVE** au droit de rétractation : case à cocher explicite après validation
  du panier et avant l'achat (« je demande la livraison immédiate et renonce à mon droit de
  rétractation »), **enregistrée** (horodatage + texte). Livraison **immédiate** des Écailles.

### Cosmétiques
- Système **catalogue + inventaire + affichage profil** (app overlay + post-game + profil
  public web — données partagées).
- Fenêtres de disponibilité (saisonniers).

---

## 8. Garde-fous légaux (France / UE — *non juridique, à faire valider*)

- **Phase 1** (aucun argent entrant/sortant) : exposition légale **minimale**.
- **Phase 2** (paiement) :
  - **Non convertible** → protège de la régulation monnaie électronique.
  - **Pas d'aléatoire payant** (loot boxes / gacha) → évite la régulation jeu d'argent.
  - **Tournois gratuits** (sans mise), lots **non convertibles** → évite le terrain jeu d'argent.
  - **Protection des mineurs + transparence des prix** (public jeune).
  - **ToS Riot** : ne pas revendre la donnée/IP Riot, pas d'endorsement implicite.
  - **Avis avocat FR/UE requis** avant toute mécanique aléatoire ou compétitive à enjeu.

---

## 9. Statut & dépendances

- ✅ **Design économique** : posé (v1, ajustable).
- 🟢 **Phase 1** (gagner + boutique + cosmétiques) : **non bloquée** — prochain chantier
  construisable, aucune dépendance Stripe/société.
- ⛔ **Phase 2** (achat) : bloquée tant que **Kbis + Stripe en live** n'existent pas.
- 🔗 **Cosmétiques** : système commun avec l'easter egg Phase 2 (catalogue/inventaire/profil).

---

## 10. Mécanique marketing future — Paliers communautaires (post-lancement)

> Idée parquée. **À NE PAS construire avant le lancement** (ni abonnés, ni pipeline d'art).

- **Principe** : paliers basés sur le **nombre d'abonnés**. À chaque palier atteint, de
  nouveaux cosmétiques **sortent en boutique** (achetables en Écailles) — **jamais offerts**
  (protège l'économie ; le palier cale la *sortie*, pas le prix).
- **Pack groupé** : un bundle réunissant tous les nouveaux cosmétiques du palier,
  **5-10 % moins cher** que l'achat à l'unité. (Gérer le cas « possède déjà un item » —
  en pratique les items de palier sont tous neufs, donc risque quasi nul.)
- **Teaser** : à chaque palier atteint, révéler un **aperçu du prochain** — **thème/ambiance,
  pas les items exacts** — pour entretenir l'anticipation sans s'enfermer dans une promesse
  précise.
- **Seuils** : à **calibrer APRÈS le lancement** sur la vraie courbe de croissance (impossible
  de fixer des nombres pertinents en aveugle pré-lancement). Principe : premiers paliers
  **petits et atteignables** (élan), escalade progressive, **rythme calé sur la capacité de
  production d'art**.

---

## 11. Réglages différés (à l'activation de l'économie)

- **Bonus de streak plafonné** : la formule actuelle `current_streak × streak_bonus_pct`
  est NON plafonnée → à 10 %/jour elle explose (jour 30 = +300 %). Valeur laissée à
  **0 (désactivé)** au lancement. À l'activation : petit % AVEC plafond (ex. +2 %/jour,
  cap +20-30 %) → modif de formule dans quest-claim + valeur dans app_settings.

---

## 12. Comportement du plafond journalier (décision actée 2026-06-08)

Le plafond `cap_daily_scales` fonctionne en **rejet**, pas en troncature :
si `gagné_aujourd'hui + reward > cap`, le claim est refusé (`daily_cap_reached`,
mappé côté EF en `{ success:false, capped:true }`, sans erreur rouge côté client).

Pourquoi c'est acceptable (déviation assumée vs la troncature envisagée) :
- Aucune quête seule ne vaut ≥ cap → le **premier claim du jour réussit toujours**,
  donc le streak n'est jamais perdu à cause du plafond.
- Le front (QuestsPanel) affiche « X/12 » et désactive les boutons au plafond —
  le joueur ne rencontre quasiment jamais le rejet.
- Garde-fou de calibrage : maintenir `max(reward) < cap` lors de tout ajout de quête.

À réévaluer avec les données de beta ; si le rejet s'avère frustrant en pratique,
passer en troncature = découper `finalize_quest_claim` (créditer
`min(reward, cap - gagné)` + compter complétion/streak hors transaction de crédit).