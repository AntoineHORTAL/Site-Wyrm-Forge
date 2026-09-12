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
 * ✅ CONFIRMÉ PAR HORTAL le 2026-09-12, sur le Dashboard Google AdSense. Aucune
 * valeur n'a changé : c'est celle que le dépôt portait déjà.
 *
 * Le doute venait d'un second identifiant qui circulait dans les documents du
 * projet (`ca-pub-2386151503865834`), et qui ne diffère que par quelques
 * chiffres du milieu — une faute de frappe dans la note, pas dans le code. La
 * levée du doute méritait d'être écrite ici plutôt que seulement classée :
 * sans elle, la question se reposerait au premier relecteur qui remarquerait
 * les deux valeurs.
 *
 * ⚠️ Ce qui reste vrai : un identifiant erroné fait échouer la vérification du
 * compte **en silence**, sans message d'erreur. Toute modification future se
 * fait ICI et nulle part ailleurs — la balise meta du layout et le `src=` du
 * script en dérivent tous les deux.
 */
export const ADSENSE_CLIENT_ID = 'ca-pub-2383615103865834'

/** URL du script de régie, dérivée de l'identifiant — jamais recopiée à la main. */
export const ADSENSE_SCRIPT_SRC =
  `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT_ID}`
