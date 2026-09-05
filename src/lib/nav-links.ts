/**
 * Liens du header de la vitrine — structure seule.
 *
 * Module PUR (aucun import React/Next) pour deux raisons : `landing.test.ts` doit
 * pouvoir vérifier que le dictionnaire a exactement autant de libellés que la
 * barre a de liens, et ce fichier de tests tourne sans jsdom — importer `Nav.tsx`
 * y tirerait `next/image`, `next/navigation` et tout le dashboard.
 */

/**
 * Ancres des sections de la home, dans l'ordre de la page.
 *
 * ⚠️ L'ORDRE fait foi : `nav.links` de `src/locales/landing.ts` est indexé
 * position par position sur ce tableau (`NAV_SECTION_IDS[i]` ↔ `t.nav.links[i]`).
 * Seuls les libellés sont traduits ; les `id` sont structurels et doivent matcher
 * les `id` des `<section>` correspondantes.
 *
 * Toutes les entrées sont des ancres : elles scrollent sur `/`, et deviennent une
 * ancre cross-page (`/#features`) ailleurs. C'est aussi exactement la liste que
 * balaie le scroll-spy — d'où l'absence de tout autre type d'entrée ici.
 */
export const NAV_SECTION_IDS = [
  'accueil',
  'features',
  'communaute',
  'tarifs',
  'telecharger',
  'faq',
] as const

/**
 * Destination de la recherche de joueur.
 *
 * ⚠️ Ce lien ne vit PAS dans `NAV_SECTION_IDS`, et c'est le cœur du choix.
 *
 * Il y a été un temps : un 7ᵉ lien au milieu des ancres, avec un champ `kind`
 * pour distinguer « scrolle » de « navigue ». Rien à l'écran ne portait cette
 * distinction — le lien avait l'apparence exacte de ses six voisins tout en
 * faisant autre chose. Il a donc rejoint le bloc de droite, où il côtoie la
 * bascule de langue, la connexion et le téléchargement : dans ce voisinage,
 * « ça mène ailleurs » va de soi sans qu'aucun ornement ait à le dire.
 *
 * Consommé à deux endroits, qui doivent rester d'accord : le lien compact du
 * header (`Nav.tsx`, bloc `.nav-desktop`) et l'entrée du drawer mobile. Le
 * libellé, lui, vient de `nav.players` du dictionnaire.
 */
export const PLAYER_SEARCH_HREF = '/matches'
