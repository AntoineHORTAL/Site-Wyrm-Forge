'use client'

import type { Lang } from '@/locales/landing'
import { flagLabel, type FlagCatalogueRow } from '@/lib/admin-flags'

/**
 * Bandeau « ⚠ N fonctionnalités actuellement coupées ».
 *
 * ⚠️ Rendu par `AdminTab` AU-DESSUS de la barre de sous-onglets, jamais à
 * l'intérieur d'un sous-onglet. C'est la seule chose qui empêche un admin venu
 * pour tout autre chose de rater une coupure en cours — le bandeau ne peut donc
 * pas dépendre du sous-onglet actif (invariant verrouillé par
 * `adminPanelLayout`, cf. `lib/admin-subtabs.ts`).
 *
 * Il est CLIQUABLE et saute sur le sous-onglet des flags : rendre la coupure
 * visible sans donner le chemin pour y aller laisserait encore à deviner où
 * cliquer, ce que personne ne fait bien en pleine crise.
 *
 * Composant purement présentationnel et SANS hook — c'est ce qui permet aux
 * tests de l'appeler comme une simple fonction pour récupérer son arbre
 * d'éléments et déclencher son `onClick` sans jsdom.
 */

interface Props {
  /** Kill switches actuellement coupés — déjà filtrés par `cutKillSwitches`. */
  cuts: readonly FlagCatalogueRow[]
  lang: Lang
  labels: {
    /** Sans `{count}` : la forme au singulier se lit mieux écrite en entier. */
    bannerOne: string
    /** `{count}` = nombre de coupures. */
    bannerOther: string
    bannerJump: string
  }
  onJump: () => void
}

export default function CutBanner({ cuts, lang, labels, onJump }: Props) {
  if (cuts.length === 0) return null

  const title = cuts.length === 1
    ? labels.bannerOne
    : labels.bannerOther.replace('{count}', String(cuts.length))

  return (
    <button
      type="button"
      onClick={onJump}
      aria-label={title}
      style={{
        display: 'block', width: '100%', textAlign: 'left',
        marginBottom: 20, padding: '12px 16px', borderRadius: 8,
        background: 'rgba(226,75,74,0.1)', border: '1px solid rgba(226,75,74,0.45)',
        cursor: 'pointer', fontFamily: 'inherit',
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 700, color: '#E24B4A', marginBottom: 4 }}>
        {title}
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
        {cuts.map(r => flagLabel(r, lang)).join(' · ')}
      </div>
      <div style={{ fontSize: 11, color: '#E24B4A', marginTop: 6, fontWeight: 600 }}>
        {labels.bannerJump}
      </div>
    </button>
  )
}
