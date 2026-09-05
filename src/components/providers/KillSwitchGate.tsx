/**
 * Garde de kill switch pour les routes PUBLIQUES rendues côté serveur
 * (`/matches`, `/summoner`, `/live`).
 *
 * ⚠️ COMPOSANT SERVEUR — pas de `'use client'`, pas de hook, et c'est le cœur du
 * dispositif. La décision est prise AVANT la génération du HTML, par le layout de
 * la route (`isPublicFlagEnabled`), et arrive ici déjà tranchée.
 *
 * ── Pourquoi pas la version cliente ──────────────────────────────────────────
 * Ce composant lisait `useFlag` + `isLoading`. Les deux comportements possibles
 * étaient mauvais, chacun à sa façon, et pour la même raison de fond : pendant le
 * rendu serveur, `useEffect` ne s'exécute pas, donc `isLoading` y vaut toujours
 * `true` et le catalogue est toujours inconnu.
 *   • rendre `children` pendant le chargement → contenu affiché puis RETIRÉ quand
 *     le flag s'avère coupé ;
 *   • attendre le chargement → le `<main>` servi ne contenait plus que
 *     « Chargement… », y compris quand le flag est actif. Mesuré : sur
 *     `/matches`, prérendue à la compilation, le `<h1>`, le paragraphe de
 *     description et la barre de recherche avaient quitté le DOM rendu.
 *
 * Lire le flag côté serveur supprime les deux : le HTML porte dès le premier
 * octet soit le contenu réel, soit l'encart — jamais un état transitoire, et rien
 * ne bouge après hydratation.
 *
 * Le provider CLIENT (`FeatureFlagsProvider`) reste inchangé et continue de servir
 * tout le reste de l'app (dashboard, Nav, onglets) : la lecture serveur ne
 * concerne que ces routes publiques, qui sont les seules à avoir un enjeu de HTML
 * initial.
 */
export default function KillSwitchGate({
  enabled,
  children,
}: {
  /** État du flag, déjà résolu côté serveur par le layout de la route. */
  enabled: boolean
  children: React.ReactNode
}) {
  if (enabled) return <>{children}</>

  return (
    <main style={{
      minHeight: 'calc(100vh - var(--nav-h))',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '80px clamp(12px, 4vw, 40px)',
    }}>
      <div style={{
        textAlign: 'center', padding: '48px 32px', borderRadius: 12,
        border: '1px solid #27272A', background: 'rgba(255,255,255,0.02)',
        maxWidth: 480,
      }}>
        <div style={{ fontSize: 32, marginBottom: 14 }}>🔧</div>
        <h1 style={{ fontSize: 18, fontWeight: 600, color: '#F5F2FA', margin: '0 0 6px' }}>
          Temporairement indisponible
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: 0 }}>
          Nous travaillons dessus. Cette fonctionnalité sera de retour sous peu.
        </p>
      </div>
    </main>
  )
}
