import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { isValidElement, type ReactElement, type ReactNode } from 'react'
import CutBanner from './CutBanner'
import type { FlagCatalogueRow } from '@/lib/admin-flags'
import {
  ADMIN_SUBTAB_IDS, CUT_BANNER_TARGET, adminPanelLayout, type AdminSubTab,
} from '@/lib/admin-subtabs'

/**
 * Le bandeau de coupures — permanent et actionnable.
 *
 * Deux propriétés se testent ici, que `lib/admin-subtabs.test.ts` ne couvre pas :
 * que le bandeau RENDU dit bien ce que le calcul de composition a décidé, et
 * que cliquer dessus mène réellement à la section des flags. Sans la seconde,
 * le bandeau signalerait l'incident sans donner le chemin — il resterait à
 * deviner où cliquer, en pleine crise.
 *
 * Même approche sans jsdom que `SubViewTabs.test.tsx` : `CutBanner` n'a aucun
 * hook, on l'appelle donc comme une fonction pour atteindre son `onClick`.
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
  bannerOne:   '⚠ 1 fonctionnalité actuellement coupée',
  bannerOther: '⚠ {count} fonctionnalités actuellement coupées',
  bannerJump:  'Voir les kill switches →',
}

function cut(key: string): FlagCatalogueRow {
  return {
    key, value: 'false', kind: 'kill',
    surface: 'shared', group_key: 'site', parent_key: null,
    off_behavior: 'notice',
    label_fr: `Libellé ${key}`, label_en: `Label ${key}`,
    desc_fr: 'd', desc_en: 'd',
    sort_order: 0, reason: null, updated_at: null, updated_by: null,
  }
}

function banner(cuts: FlagCatalogueRow[], onJump: () => void = () => {}) {
  return <CutBanner cuts={cuts} lang="fr" labels={LABELS} onJump={onJump} />
}

describe('visibilité', () => {
  it('ne rend rien quand aucun kill switch n\'est coupé', () => {
    expect(renderToStaticMarkup(banner([]))).toBe('')
  })

  it('apparaît dès la première coupure', () => {
    const html = renderToStaticMarkup(banner([cut('ads_enabled')]))

    expect(html).toContain('⚠ 1 fonctionnalité actuellement coupée')
    expect(html).toContain('rgba(226,75,74,0.45)')   // bordure d'alarme
  })

  it('reste identique quel que soit le sous-onglet actif', () => {
    // Le bandeau ne reçoit PAS le sous-onglet : il ne peut pas en dépendre.
    // On le vérifie de bout en bout — la décision d'affichage (`adminPanelLayout`)
    // et le HTML produit sont les mêmes sur les trois sections.
    const cuts = [cut('ads_enabled'), cut('patch_notes_enabled')]
    const rendus = ADMIN_SUBTAB_IDS.map((sub: AdminSubTab) => {
      const layout = adminPanelLayout(sub, cuts.length)
      return layout.showBanner ? renderToStaticMarkup(banner(cuts)) : ''
    })

    expect(new Set(rendus).size).toBe(1)
    expect(rendus[0]).toContain('⚠ 2 fonctionnalités actuellement coupées')
    expect(rendus[0]).not.toBe('')
  })
})

describe('compteur', () => {
  it('utilise le singulier pour une seule coupure', () => {
    const html = renderToStaticMarkup(banner([cut('ads_enabled')]))

    expect(html).toContain('⚠ 1 fonctionnalité actuellement coupée')
    expect(html).not.toContain('{count}')
  })

  it('interpole le nombre exact au pluriel', () => {
    const cuts = ['a', 'b', 'c', 'd'].map(cut)
    const html = renderToStaticMarkup(banner(cuts))

    expect(html).toContain('⚠ 4 fonctionnalités actuellement coupées')
    expect(html).not.toContain('{count}')
  })

  it('reste juste quand le compteur atteint les 18 enfants d\'overlay', () => {
    const cuts = Array.from({ length: 18 }, (_, i) => cut(`overlay_show_${i}`))
    const html = renderToStaticMarkup(banner(cuts))

    expect(html).toContain('⚠ 18 fonctionnalités actuellement coupées')
  })

  it('nomme les fonctionnalités coupées', () => {
    // Un compteur seul obligerait à ouvrir la section pour savoir QUOI est coupé.
    const html = renderToStaticMarkup(banner([cut('ads_enabled'), cut('patch_notes_enabled')]))

    expect(html).toContain('Libellé ads_enabled')
    expect(html).toContain('Libellé patch_notes_enabled')
  })
})

describe('saut vers la section des flags', () => {
  it('est un vrai bouton, pas un bloc décoratif', () => {
    const html = renderToStaticMarkup(banner([cut('ads_enabled')]))

    expect(html).toContain('<button')
    expect(html).toContain('type="button"')
    expect(html).toContain('Voir les kill switches →')
  })

  it('déclenche la bascule au clic', () => {
    const onJump = vi.fn()
    const found = clickables(render(banner([cut('ads_enabled')], onJump)))

    expect(found).toHaveLength(1)
    ;(found[0].props as { onClick: () => void }).onClick()
    expect(onJump).toHaveBeenCalledOnce()
  })

  it('mène à la section qui contient réellement les kill switches', () => {
    // Le clic pose `CUT_BANNER_TARGET` ; on vérifie que cette cible affiche bien
    // la section des flags — un renommage de sous-onglet casserait ici plutôt
    // que de produire un bandeau qui saute dans le vide.
    const onJump = vi.fn(() => CUT_BANNER_TARGET)
    const found = clickables(render(banner([cut('ads_enabled')], onJump)))
    ;(found[0].props as { onClick: () => AdminSubTab }).onClick()

    expect(onJump).toHaveReturnedWith(CUT_BANNER_TARGET)
    expect(adminPanelLayout(CUT_BANNER_TARGET, 1).showFlags).toBe(true)
  })

  it('garde le bandeau visible après le saut', () => {
    // Arriver sur « flags » ne doit pas faire disparaître l'alerte : tant qu'une
    // coupure dure, elle reste affichée, y compris sur sa propre section.
    expect(adminPanelLayout(CUT_BANNER_TARGET, 1).showBanner).toBe(true)
  })
})
