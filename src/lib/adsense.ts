/**
 * Identité du compte AdSense — UNE seule constante, deux consommateurs.
 *
 * Elle vit ici et NON dans `lib/ads.ts`, qui est délibérément agnostique de la
 * régie (« aucun identifiant, aucune URL de script, aucun nom de fournisseur »).
 * `ads.ts` décide SI une publicité a le droit d'exister ; ce fichier dit QUI la
 * sert. Mélanger les deux rendrait `ads.ts` dépendant du fournisseur du jour.
 *
 * ⚠️ Les deux consommateurs — la balise `<meta name="google-adsense-account">`
 * du layout racine et le `src=` du script de régie — doivent porter le MÊME
 * identifiant. C'était un invariant tenu par un commentaire dans `layout.tsx` ;
 * il est désormais tenu par le typage.
 */

/**
 * Identifiant éditeur AdSense.
 *
 * ⚠️ À COMPLÉTER PAR HORTAL — un second identifiant circule dans les documents
 * du projet : `ca-pub-2386151503865834`. Celui retenu ici est celui qui était
 * déjà déployé dans `layout.tsx` (balise meta ET script), et c'est le seul que
 * le dépôt ait jamais porté. Les deux ne diffèrent que par quelques chiffres du
 * milieu, ce qui ressemble à une faute de frappe dans l'un des deux — mais un
 * identifiant erroné fait échouer la vérification du compte en silence, sans
 * message d'erreur. Confirmer lequel est le bon sur le Dashboard AdSense, puis
 * corriger ICI : c'est le seul endroit à changer.
 */
export const ADSENSE_CLIENT_ID = 'ca-pub-2383615103865834'

/** URL du script de régie, dérivée de l'identifiant — jamais recopiée à la main. */
export const ADSENSE_SCRIPT_SRC =
  `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT_ID}`
