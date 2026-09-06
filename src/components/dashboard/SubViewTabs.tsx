'use client'

/**
 * Barre de sous-onglets en pastilles.
 *
 * EXTRACTION, pas restyle : ce composant reprend au pixel la barre qui vivait en
 * styles inline dans `EcaillesTab` (fond `rgba(255,255,255,0.03)`,
 * `borderRadius: 10`, pastille active en `accent`). Les deux consommateurs —
 * Écailles et le panneau admin — passent par ici, ce qui évite qu'un troisième
 * vocabulaire de navigation apparaisse : l'app en a déjà deux (sidebar verticale
 * du dashboard, et cette barre).
 *
 * Les couleurs arrivent en props plutôt que d'être recalculées ici : chaque
 * onglet a déjà son `accent` / `border` dérivés du thème `mythic`, et les
 * dupliquer les ferait diverger au premier changement de palette.
 */

export interface SubViewDef<T extends string> {
  /** Identifiant STRUCTUREL — état local, jamais traduit. */
  id: T
  /** Libellé déjà résolu dans la langue courante par l'appelant. */
  label: string
  /**
   * Compteur d'alerte affiché à droite du libellé. `null`, `undefined` ou `0`
   * → aucun badge. Adapté du vocabulaire de badges de la sidebar
   * (`SidebarBtn` / `d.nav.badges`), qui porte du TEXTE (`PRO`, `SOON`) là où
   * on a besoin d'un NOMBRE — d'où le rendu propre plutôt qu'un `badges.pro`
   * détourné.
   */
  badge?: number | null
}

interface Props<T extends string> {
  views: readonly SubViewDef<T>[]
  active: T
  onSelect: (id: T) => void
  /** Couleur du libellé actif. */
  accent: string
  /** Fond de la pastille active. */
  activeBg: string
  border: string
  /** Nommage du groupe pour les lecteurs d'écran. */
  ariaLabel: string
}

export default function SubViewTabs<T extends string>({
  views, active, onSelect, accent, activeBg, border, ariaLabel,
}: Props<T>) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      style={{
        display: 'flex', gap: 4, marginBottom: 28,
        background: 'rgba(255,255,255,0.03)', borderRadius: 10,
        padding: 4, border: `1px solid ${border}`,
        flexWrap: 'wrap',
      }}
    >
      {views.map(v => {
        const isActive = v.id === active
        // `> 0` et pas `!= null` : un compteur à zéro ne doit pas peindre une
        // pastille vide — « 0 coupure » se dit en n'affichant rien.
        const showBadge = typeof v.badge === 'number' && v.badge > 0

        return (
          <button
            key={v.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onSelect(v.id)}
            style={{
              flex: 1, minWidth: 110,
              padding: '7px 12px', borderRadius: 7, fontSize: 13,
              fontWeight: isActive ? 600 : 400,
              fontFamily: 'inherit', cursor: 'pointer', border: 'none',
              background: isActive ? activeBg : 'transparent',
              color: isActive ? accent : 'var(--text-muted)',
              transition: 'all 0.15s',
            }}
          >
            {v.label}
            {/* Badge rendu en INLINE dans le bouton : garder le flux par défaut
                (plutôt qu'un conteneur flex) préserve exactement le centrage
                d'origine pour les barres sans badge, Écailles comprise. */}
            {showBadge && (
              <span style={{
                marginLeft: 6, padding: '1px 6px', borderRadius: 999,
                background: '#E24B4A', color: '#FFFFFF',
                fontSize: 10, fontWeight: 700,
              }}>
                {v.badge}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
