import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import KillSwitchModal, { type KillSwitchModalLabels } from './KillSwitchModal'
import { offBehaviorKey, flagLabel, type FlagCatalogueRow } from '@/lib/admin-flags'

/**
 * Modale de confirmation d'une coupure.
 *
 * Ces cas ont remplacé ceux de la confirmation INLINE. La couverture logique du
 * motif obligatoire, elle, n'a pas bougé de place : elle vit dans
 * `lib/admin-flags.test.ts` (`canSubmitCut`), indépendamment de tout composant —
 * c'est ce qui garantit qu'elle survivrait à un troisième changement d'habillage.
 * Ce fichier prouve la marche suivante : que la modale CONSOMME bien cette règle
 * au lieu d'en réimplémenter une à sa façon.
 *
 * Rendu en HTML statique, sans jsdom — patron de `SettingToggle.test.tsx`.
 */

const LABELS: KillSwitchModalLabels = {
  cutTitle:             'Couper « {label} » ?',
  cutReasonLabel:       'Motif (obligatoire)',
  cutReasonHint:        'Sera relu lors du retour à la normale',
  cutReasonPlaceholder: 'ex. : 502 en boucle',
  cutConfirm:           'Couper',
  cutCancel:            'Annuler',
  impactLabel:          'Ce que voit l\'utilisateur :',
  impactText:           'un encart « Temporairement indisponible »',
}

function render(reason: string, opts: { saving?: boolean; label?: string; impact?: string } = {}) {
  return renderToStaticMarkup(
    <KillSwitchModal
      flagLabel={opts.label ?? 'Publicités'}
      labels={opts.impact ? { ...LABELS, impactText: opts.impact } : LABELS}
      reason={reason}
      saving={opts.saving ?? false}
      onReasonChange={() => {}}
      onConfirm={() => {}}
      onCancel={() => {}}
    />,
  )
}

describe('contenu de la modale', () => {
  it('nomme le flag visé dans son titre', () => {
    // Sans le nom, une modale de confirmation ne confirme rien : l'admin ne sait
    // pas lequel des 34 interrupteurs il vient de viser.
    expect(render('')).toContain('Couper « Publicités » ?')
  })

  it('rappelle ce que la coupure va casser', () => {
    // Dernier moment où l'admin peut reculer — la phrase vient d'`off_behavior`,
    // la même que celle déjà affichée sur la carte.
    const html = render('')
    expect(html).toContain('Ce que voit l&#x27;utilisateur')
    expect(html).toContain('Temporairement indisponible')
  })

  it('affiche l\'impact propre à chaque off_behavior', () => {
    const row = (b: 'hidden' | 'notice' | 'degraded'): FlagCatalogueRow => ({
      key: 'k', value: 'true', kind: 'kill', surface: 'web', group_key: 'g',
      parent_key: null, off_behavior: b, label_fr: 'Flag', label_en: 'Flag',
      desc_fr: '', desc_en: '', sort_order: 0, reason: null,
      updated_at: null, updated_by: null,
    })
    const impacts = { hidden: 'disparaît de la navigation', notice: 'un encart', degraded: 'repli partiel' }

    for (const b of ['hidden', 'notice', 'degraded'] as const) {
      const text = impacts[offBehaviorKey(row(b))]
      expect(render('', { impact: text, label: flagLabel(row(b), 'fr') })).toContain(text)
    }
  })

  it('propose le champ motif et le bouton Annuler', () => {
    const html = render('')
    expect(html).toContain('Motif (obligatoire)')
    expect(html).toContain('ex. : 502 en boucle')
    expect(html).toContain('Annuler')
    expect(html).toContain('aria-required="true"')
  })
})

describe('le motif reste obligatoire', () => {
  it('Confirmer est DÉSACTIVÉ tant que le motif est vide', () => {
    // La propriété centrale de cet écran, réexprimée sur le nouvel habillage.
    expect(render('')).toContain('disabled=""')
  })

  it('Confirmer reste désactivé sur un motif fait d\'espaces', () => {
    // Le composant délègue à `canSubmitCut`, qui trim — pas à un `length > 0` naïf.
    expect(render('   ')).toContain('disabled=""')
    expect(render('\n\t ')).toContain('disabled=""')
  })

  it('Confirmer s\'active dès qu\'un motif est saisi', () => {
    const html = render('502 en boucle sur l\'EF')
    expect(html).not.toContain('disabled=""')
    expect(html).toContain('#E24B4A')          // bouton rouge plein, actif
  })

  it('Confirmer est désactivé pendant l\'écriture, motif ou pas', () => {
    // Évite la double soumission : deux clics rapides écriraient deux fois.
    const html = render('un motif valide', { saving: true })
    expect(html).toContain('disabled=""')
    expect(html).toContain('…')
  })
})

describe('conformité au patron de modale du dépôt', () => {
  it('réutilise les classes .pn-modal existantes, sans en inventer', () => {
    // `globals.css` porte déjà ce patron (prévisualisation de patch note,
    // PatchNotesTab). Un second jeu de classes aurait fait diverger l'apparence
    // des modales du site.
    const html = render('')
    expect(html).toContain('class="pn-modal"')
    expect(html).toContain('class="pn-modal-inner"')
    expect(html).toContain('class="pn-modal-close"')
  })

  it('est annoncée comme un dialogue modal', () => {
    const html = render('')
    expect(html).toContain('role="dialog"')
    expect(html).toContain('aria-modal="true"')
    expect(html).toContain('aria-label="Publicités"')
  })

  it('resserre la largeur sans toucher à la classe partagée', () => {
    // `.pn-modal-inner` est calibrée à 920 px pour une prévisualisation de patch
    // note ; la classe est partagée (et reprise par les règles d'impression),
    // donc l'ajustement est inline.
    expect(render('')).toContain('max-width:480px')
  })
})
