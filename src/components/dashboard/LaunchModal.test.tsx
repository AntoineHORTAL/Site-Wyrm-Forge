import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { isValidElement, type ReactElement, type ReactNode } from 'react'
import LaunchModal from './LaunchModal'
import SettingToggle from './SettingToggle'
import {
  launchPatch, isPendingLaunch, flagLabel, flagDescription, isOn,
  type FlagCatalogueRow,
} from '@/lib/admin-flags'

/**
 * Le lancement d'une feature : bouton d'action, confirmation, écriture unique.
 *
 * Rendu statique via `react-dom/server`, et exécution directe des composants
 * (sans hook) pour atteindre les gestionnaires — même approche que
 * `SubViewTabs.test.tsx`, sans jsdom ni testing-library.
 */

function render(el: ReactElement): ReactNode {
  const run = el.type as (props: unknown) => ReactNode
  return run(el.props)
}

function clickables(node: ReactNode, out: ReactElement[] = []): ReactElement[] {
  if (Array.isArray(node)) { node.forEach(n => clickables(n, out)); return out }
  if (!isValidElement(node)) return out
  const props = node.props as { onClick?: unknown; children?: ReactNode }
  if (typeof props.onClick === 'function') out.push(node)
  clickables(props.children, out)
  return out
}

const LABELS = {
  launchTitle:        'Lancer « {label} » ?',
  launchImpactLabel:  'Après lancement :',
  launchImpactText:   'la fonctionnalité devient visible pour tous les utilisateurs.',
  launchIrreversible: 'Ce flag deviendra un kill switch.',
  launchConfirm:      'Lancer',
  launchCancel:       'Annuler',
}

function row(key: string, over: Partial<FlagCatalogueRow> = {}): FlagCatalogueRow {
  return {
    key, value: 'false', kind: 'launch',
    surface: 'shared', group_key: 'ecailles', parent_key: null,
    off_behavior: 'hidden',
    label_fr: `Libellé ${key}`, label_en: `Label ${key}`,
    desc_fr: `Description ${key}`, desc_en: `Description ${key}`,
    sort_order: 0, reason: null, updated_at: null, updated_by: null,
    ...over,
  }
}

/** Rend une carte comme le fait AdminTab pour la section Lancements. */
function launchCard(r: FlagCatalogueRow, onToggle: (k: string) => void = () => {}) {
  return (
    <SettingToggle
      label={flagLabel(r, 'fr')}
      description={flagDescription(r, 'fr')}
      settingKey={r.key}
      value={isOn(r)}
      saving={false}
      loading={false}
      onToggle={onToggle}
      border="#27272A"
      bg="#18181B"
      variant="launch"
      stateLabel="pas encore lancé"
      actionLabel={isPendingLaunch(r) ? 'Lancer' : undefined}
    />
  )
}

describe('carte d’un flag de lancement', () => {
  it('porte un bouton « Lancer », pas un interrupteur', () => {
    // Lancer est un geste à SENS UNIQUE. Un interrupteur promettrait qu'on peut
    // le rebasculer, donc qu'on peut « délancer » — ce qui n'existe pas.
    const html = renderToStaticMarkup(launchCard(row('scenarios_enabled')))

    expect(html).toContain('Lancer')
    expect(html).not.toContain('aria-pressed')
  })

  it('nomme la feature visée pour les lecteurs d’écran', () => {
    const html = renderToStaticMarkup(launchCard(row('scenarios_enabled')))

    expect(html).toContain('aria-label="Lancer — Libellé scenarios_enabled"')
  })

  it('reste un bouton de type button', () => {
    const html = renderToStaticMarkup(launchCard(row('shop_enabled')))

    expect(html).toContain('type="button"')
  })

  it('garde le reste de la carte identique', () => {
    // Seul le CONTRÔLE change : même chrome, même pastille d'état, même
    // description — c'est la même liste.
    const html = renderToStaticMarkup(launchCard(row('scenarios_enabled')))

    expect(html).toContain('Libellé scenarios_enabled')
    expect(html).toContain('Description scenarios_enabled')
    expect(html).toContain('pas encore lancé')
  })

  it('remonte la clé du flag au clic', () => {
    const onToggle = vi.fn()
    const found = clickables(render(launchCard(row('scenarios_enabled'), onToggle)))

    expect(found).toHaveLength(1)
    ;(found[0].props as { onClick: () => void }).onClick()
    expect(onToggle).toHaveBeenCalledExactlyOnceWith('scenarios_enabled')
  })
})

describe('un kill switch garde son interrupteur', () => {
  it('aucun bouton « Lancer » sur un kind=kill', () => {
    // Contraste explicite : `actionLabel` n'est posé que pour un lancement.
    const html = renderToStaticMarkup(launchCard(row('ads_enabled', { kind: 'kill', value: 'true' })))

    expect(html).not.toContain('Lancer')
    expect(html).toContain('aria-pressed="true"')
  })

  it('l’interrupteur historique est intact sans actionLabel', () => {
    const html = renderToStaticMarkup(
      <SettingToggle
        label="Réglage" description="d" settingKey="k" value={false}
        saving={false} loading={false} onToggle={() => {}}
        border="#27272A" bg="#18181B"
      />,
    )

    expect(html).toContain('aria-pressed="false"')
    expect(html).not.toContain('Lancer')
  })
})

describe('modale de confirmation du lancement', () => {
  it('nomme la feature dans son titre', () => {
    const html = renderToStaticMarkup(
      <LaunchModal flagLabel="Scénarios" labels={LABELS} saving={false} onConfirm={() => {}} onCancel={() => {}} />,
    )

    expect(html).toContain('Lancer « Scénarios » ?')
    expect(html).not.toContain('{label}')
  })

  it('dit ce que le lancement rend visible', () => {
    const html = renderToStaticMarkup(
      <LaunchModal flagLabel="Scénarios" labels={LABELS} saving={false} onConfirm={() => {}} onCancel={() => {}} />,
    )

    expect(html).toContain('Après lancement :')
    expect(html).toContain('la fonctionnalité devient visible pour tous les utilisateurs.')
  })

  it('annonce le sens unique AVANT le clic', () => {
    const html = renderToStaticMarkup(
      <LaunchModal flagLabel="Scénarios" labels={LABELS} saving={false} onConfirm={() => {}} onCancel={() => {}} />,
    )

    expect(html).toContain('Ce flag deviendra un kill switch.')
  })

  it('ne demande AUCUN motif', () => {
    // `reason` est le motif de COUPURE : y écrire une note de lancement
    // afficherait « Motif : … » avec ce texte le jour d'un vrai incident.
    const html = renderToStaticMarkup(
      <LaunchModal flagLabel="Scénarios" labels={LABELS} saving={false} onConfirm={() => {}} onCancel={() => {}} />,
    )

    expect(html).not.toContain('<input')
    expect(html).not.toContain('Motif')
  })

  it('propose confirmer et annuler, sans blocage', () => {
    // Contrairement à une coupure, rien ne conditionne le bouton : une
    // confirmation simple suffit.
    const html = renderToStaticMarkup(
      <LaunchModal flagLabel="Scénarios" labels={LABELS} saving={false} onConfirm={() => {}} onCancel={() => {}} />,
    )

    expect(html).toContain('Lancer')
    expect(html).toContain('Annuler')
    expect(html).not.toContain('disabled=""')
  })

  it('se verrouille pendant l’écriture', () => {
    const html = renderToStaticMarkup(
      <LaunchModal flagLabel="Scénarios" labels={LABELS} saving={true} onConfirm={() => {}} onCancel={() => {}} />,
    )

    expect(html).toContain('disabled=""')
    expect(html).toContain('…')
  })

  it('confirme, et confirme une seule fois', () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    const found = clickables(render(
      <LaunchModal flagLabel="Scénarios" labels={LABELS} saving={false} onConfirm={onConfirm} onCancel={onCancel} />,
    ))
    // Le bouton « Lancer » est le dernier cliquable (fond, croix, annuler, lancer).
    const confirmer = found[found.length - 1]
    ;(confirmer.props as { onClick: () => void }).onClick()

    expect(onConfirm).toHaveBeenCalledOnce()
    expect(onCancel).not.toHaveBeenCalled()
  })
})

describe('ce qui part réellement en base', () => {
  it('un seul UPDATE, portant kind ET value', () => {
    // Le composant ne fabrique pas le patch : il vient de `launchPatch()`, ce
    // qui garantit que le rendu et l'écriture ne peuvent pas diverger.
    expect(launchPatch()).toEqual({ value: 'true', kind: 'kill', reason: null })
  })
})
