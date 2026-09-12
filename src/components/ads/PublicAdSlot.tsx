'use client'

import AdSlot from './AdSlot'
import { shouldShowPublicAds, type AdFormat } from '@/lib/ads'
import { useSession } from '@/components/providers/SessionProvider'

/**
 * Emplacement publicitaire d'une page PUBLIQUE (/patch-notes, /champions).
 *
 * Pendant de `DashboardAdRail` pour les pages sans dashboard : il ne fait
 * qu'appliquer le verrou COMMERCIAL côté appelant — c'est la convention
 * d'`AdSlot`, qui ne connaît que le verrou légal (`hasAdConsent()`, toujours
 * `false` tant qu'aucune CMP n'existe).
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
 */
export default function PublicAdSlot({
  format = 'rectangle-300', name,
}: {
  format?: AdFormat
  /** Nom fonctionnel de l'emplacement — voir `AdSlot`. */
  name: string
}) {
  const { user, profile, loading, isAdmin } = useSession()

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
