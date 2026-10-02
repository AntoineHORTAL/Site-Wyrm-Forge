// ════════════════════════════════════════════════════════════════════════════
//  guide-release — la date et la version qu'affiche l'en-tête de `/guide`
// ════════════════════════════════════════════════════════════════════════════
// 🔴 CES DEUX VALEURS SONT POSÉES À LA MAIN, ET C'EST VOULU.
//
// Elles ne disent pas « quelle est la dernière release » mais « ce que le guide
// DÉCRIT ». Les lire dans le flux de release (GitHub, Velopack) les ferait mentir
// dès qu'une version sort sans que le guide ait été relu : l'en-tête annoncerait
// une v1.0.16 que le texte ne couvre pas.
//
// Procédure à chaque release de l'app (ou modification du guide) :
//   1. relire `src/locales/guide.ts` contre la nouvelle version ;
//   2. mettre `GUIDE_APP_VERSION` sur la version relue (sans le « v ») ;
//   3. mettre `GUIDE_UPDATED` sur la date de mise en ligne, au format AAAA-MM-JJ.
// `guide.test.ts` vérifie le format des deux valeurs, pas leur contenu.

/** Version de l'app de bureau décrite par le guide — sans le « v ». */
export const GUIDE_APP_VERSION = '1.0.15'

/** Date de dernière mise à jour du guide, ISO `AAAA-MM-JJ` (date LOCALE, pas UTC). */
export const GUIDE_UPDATED = '2026-10-02'
