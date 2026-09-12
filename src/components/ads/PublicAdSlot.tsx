'use client'

import AdSlot from './AdSlot'
import { shouldShowPublicAds, type AdFormat } from '@/lib/ads'
import { useSession } from '@/components/providers/SessionProvider'
import { useFlag } from '@/components/providers/FeatureFlagsProvider'

/**
 * Emplacement publicitaire d'une page PUBLIQUE (/patch-notes, /champions).
 *
 * Pendant de `DashboardAdRail` pour les pages sans dashboard : il ne fait
 * qu'appliquer les verrous côté APPELANT — c'est la convention d'`AdSlot`, qui
 * ne connaît, lui, que le verrou légal (`hasAdConsent()`, alimenté par la Google
 * CMP depuis le 2026-09-12).
 *
 * La différence avec le rail tient en une ligne : ici, un visiteur ANONYME doit
 * voir des emplacements (il est sur l'offre gratuite), alors que le rail ne
 * s'adresse qu'à des gens connectés. La règle est dans `shouldShowPublicAds`,
 * avec son raisonnement.
 *
 * ⚠️ Ces pages étant des Server Components, ce composant est monté comme un îlot
 * client : il ne peut pas être rendu par le serveur, donc il ne fait PAS partie
 * du HTML servi. C'est volontaire et sans conséquence — une régie ne s'exécute
 * de toute façon que dans un navigateur, et le robot d'examen doit voir du
 * CONTENU, pas des emplacements.
 *
 * ⚠️ Ne rend rien du tout tant que la session n'est pas résolue : réserver
 * 250 px de hauteur pour les retirer une seconde plus tard provoquerait
 * exactement le décalage de contenu (CLS) qu'`AdSlot` existe pour éviter.
 *
 * ════════════════════════════════════════════════════════════════════════════
 *  🔴 TROIS VERROUS, ET LE KILL SWITCH EST LE TROISIÈME
 * ════════════════════════════════════════════════════════════════════════════
 *   1. `ads_enabled`          — kill switch d'exploitation (`app_settings`) ;
 *   2. `shouldShowPublicAds`  — verrou COMMERCIAL (palier) ;
 *   3. `hasAdConsent()`       — verrou LÉGAL, appliqué dans `AdSlot`.
 *
 * Le premier manquait ici jusqu'au 2026-09-12, alors que `Dashboard.tsx`
 * l'appliquait déjà : couper `ads_enabled` depuis l'admin éteignait la colonne
 * du dashboard et laissait les cinq emplacements des pages publiques en place.
 * Le flag est rangé dans la catégorie `site`, donc censé être global — et c'est
 * le seul moyen d'éteindre la publicité en urgence maintenant que la CMP peut
 * ouvrir le verrou de consentement. Un kill switch qui ne couvre que la moitié
 * du site n'est pas un kill switch.
 *
 * ⚠️ Le repli de `useFlag` pour un KILL SWITCH est `true` (clé absente, flags
 * pas encore chargés) : la publicité ne disparaît donc pas le temps du premier
 * chargement. C'est exactement la sémantique qu'a déjà `Dashboard.tsx:234`, et
 * les deux doivent rester alignées.
 */
export default function PublicAdSlot({
  format = 'rectangle-300', name,
}: {
  format?: AdFormat
  /** Nom fonctionnel de l'emplacement — voir `AdSlot`. */
  name: string
}) {
  const { user, profile, loading, isAdmin } = useSession()
  const adsEnabled = useFlag('ads_enabled')

  // Les trois verrous doivent être ouverts. Celui-ci vit ICI et pas dans
  // `shouldShowPublicAds` : `lib/ads.ts` est un module PUR, testé comme tel, et
  // y injecter un état React lui ferait perdre la propriété qui le rend
  // vérifiable. Même découpage que `Dashboard.tsx`.
  if (!adsEnabled) return null
  if (!shouldShowPublicAds({ loading, signedIn: !!user, tier: profile?.tier, isAdmin })) return null

  return (
    <div
      // `aside` : ce n'est pas le contenu principal de la page, et les lecteurs
      // d'écran comme les extracteurs de contenu doivent pouvoir le sauter.
      role="complementary"
      aria-label="Publicité"
      style={{ display: 'flex', justifyContent: 'center', margin: '8px 0' }}
    >
      <AdSlot format={format} name={name} />
    </div>
  )
}
