import Link from 'next/link'
import type { Metadata } from 'next'
import ChampionsExplorer from '@/components/champions/ChampionsExplorer'
import PublicAdSlot from '@/components/ads/PublicAdSlot'
import { fetchChampionCatalog, ALL_TAGS } from '@/lib/champions-catalog'

/* Explorateur de tous les champions League : /champions
 *
 * 🔴 SERVER COMPONENT depuis le chantier AdSense du 2026-09-12. La page était
 * `'use client'` et chargeait `champion.json` dans un `useEffect` : le HTML
 * servi ne contenait qu'une barre de filtres vide et le mot « Chargement… ».
 * Un visiteur sans JavaScript n'y voyait rien, et le robot d'examen AdSense —
 * qui juge sur le HTML brut — l'a classée « contenu à faible valeur
 * informative ». Les ~170 champions sont désormais dans la réponse.
 *
 * L'interactivité (recherche, classes, difficulté, tri) n'a pas bougé : elle
 * vit dans `ChampionsExplorer`, un îlot client monté PAR-DESSUS une liste déjà
 * rendue. Voir l'invariant en tête de ce composant.
 *
 * Données : DDragon (`champion.json`), publiques, sans authentification — d'où
 * l'ISR plutôt que le SSR à chaque requête. */

export const metadata: Metadata = {
  title: 'Tous les champions de League of Legends — Wyrm Forge',
  description:
    'La liste complète des champions de League of Legends : classe, difficulté, '
    + 'sorts et statistiques. Filtre par rôle ou par difficulté pour trouver le '
    + 'champion qui te correspond, puis ouvre sa fiche détaillée.',
}

/**
 * Régénération horaire.
 *
 * DDragon ne publie qu'à chaque patch — une fois toutes les deux semaines. Une
 * heure de décalage sur une liste de champions n'a aucune conséquence, et c'est
 * ce qui garde la page PRÉRENDUE (`○` dans la table des routes du build) au lieu
 * de la faire repartir chercher Riot à chaque visite.
 */
export const revalidate = 3600

export default async function ChampionsPage() {
  const { version, champions } = await fetchChampionCatalog()

  return (
    <main style={{
      minHeight: '100vh', padding: '24px clamp(12px, 4vw, 40px)',
      maxWidth: 1400, margin: '0 auto', color: '#F5F2FA',
    }}>
      {/* `<Link>` et non `router.back()` : un bouton qui dépend de l'historique
          du navigateur n'existe pas pour un robot, et ne mène nulle part quand
          la page est ouverte directement depuis un résultat de recherche. */}
      <Link href="/" style={{
        display: 'inline-block', color: 'var(--text-muted)', fontSize: 13,
        padding: '6px 0', marginBottom: 14, textDecoration: 'none',
      }}>← Accueil</Link>

      <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 10 }}>
        Tous les champions de League of Legends
      </h1>

      {/* ── Chapô éditorial ──────────────────────────────────────────────────
          Rendu par le serveur, donc présent dans le HTML servi. Il dit ce que la
          page contient et comment s'en servir : c'est la « valeur informative »
          qui manquait à une page composée uniquement de vignettes. */}
      <div style={{
        maxWidth: 780, marginBottom: 22,
        fontSize: 14, lineHeight: 1.7, color: 'var(--text-muted)',
      }}>
        <p style={{ margin: '0 0 10px' }}>
          Les <strong>{champions.length || 'quelque 170'} champions</strong> de League of Legends,
          avec pour chacun sa classe, sa note de difficulté officielle et un accès direct à sa
          fiche : sorts, passif, statistiques par niveau, skins et objets recommandés. Les données
          proviennent de <strong>Data Dragon</strong>, la source publique de Riot Games, et sont
          mises à jour à chaque patch.
        </p>
        <p style={{ margin: '0 0 10px' }}>
          Chaque champion appartient à une ou deux des six classes du jeu —{' '}
          {ALL_TAGS.length} au total : combattant, tank, mage, assassin, tireur et support. La
          classe indique le rôle qu&apos;il tient en partie plus que la voie où il se joue : un
          même champion peut être joué en solo, en jungle ou en duo selon la composition.
        </p>
        <p style={{ margin: 0 }}>
          La <strong>difficulté</strong> est la note que Riot attribue à chaque champion, de 1 à 10.
          Elle mesure l&apos;exigence mécanique — combos, précision des compétences, gestion des
          ressources — et non la puissance : un champion facile n&apos;est pas un champion faible.
          Si tu débutes sur une voie, les notes de 1 à 3 demandent le moins d&apos;apprentissage
          avant de pouvoir se concentrer sur le placement et les objectifs.
        </p>
      </div>

      {champions.length === 0 ? (
        <div style={{
          padding: 14, borderRadius: 6, marginBottom: 14,
          background: 'rgba(226,75,74,0.08)', border: '1px solid rgba(226,75,74,0.3)',
          color: '#E24B4A', fontSize: 13,
        }}>
          La liste des champions est momentanément indisponible (Data Dragon injoignable).
          Réessaie dans quelques minutes.
        </div>
      ) : (
        <ChampionsExplorer
          champions={champions}
          version={version}
          // UN emplacement, EN FIN de liste : la grille n'est jamais coupée en
          // deux, et rien ne s'intercale entre le chapô et le contenu.
          footer={
            <div style={{ marginTop: 32 }}>
              <PublicAdSlot name="champions-end" />
            </div>
          }
        />
      )}
    </main>
  )
}
