import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { isValidElement, type ReactElement, type ReactNode } from 'react'
import SettingToggle from './SettingToggle'
import SubViewTabs from './SubViewTabs'
import {
  partitionCatalogue, groupKillBySurface, cutKillSwitches,
  SURFACE_ORDER, DEFAULT_KILL_SURFACE,
  flagLabel, flagDescription, isOn, OVERLAY_MASTER_KEY,
  type FlagCatalogueRow, type SurfaceKey,
} from '@/lib/admin-flags'

/**
 * Sous-onglets Site / App / Site + App de la section « Kill switches ».
 *
 * Le regroupement visuel (trois intertitres empilés) a été remplacé par une
 * vraie sous-navigation : ces tests vérifient donc un FILTRAGE — ce qui est
 * affiché, et surtout ce qui ne l'est plus — là où ils vérifiaient auparavant
 * un simple ordre d'intertitres.
 *
 * Reproduit la composition d'AdminTab sans monter le panneau, qui tirerait
 * Supabase et `createPortal` pour ne rien prouver de plus.
 */

const TITRES: Record<SurfaceKey, string> = { web: 'Site', app: 'App', shared: 'Site + App' }

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

function row(key: string, over: Partial<FlagCatalogueRow> = {}): FlagCatalogueRow {
  return {
    key, value: 'true', kind: 'kill',
    surface: 'shared', group_key: 'g', parent_key: null,
    off_behavior: 'notice',
    label_fr: `Libellé ${key}`, label_en: `Label ${key}`,
    desc_fr: 'd', desc_en: 'd',
    sort_order: 0, reason: null, updated_at: null, updated_by: null,
    ...over,
  }
}

function card(r: FlagCatalogueRow, indented = false) {
  return (
    <SettingToggle
      key={r.key}
      label={flagLabel(r, 'fr')}
      description={flagDescription(r, 'fr')}
      settingKey={r.key}
      value={isOn(r)}
      saving={false}
      loading={false}
      onToggle={() => {}}
      border="#27272A"
      bg="#18181B"
      variant="kill"
      stateLabel={isOn(r) ? 'actif' : '⚠ COUPÉ'}
      indented={indented}
    />
  )
}

/** Les pastilles de surface, exactement comme AdminTab les construit. */
function tabs(catalogue: FlagCatalogueRow[], active: SurfaceKey, onSelect: (s: SurfaceKey) => void = () => {}) {
  const cutsBySurface = groupKillBySurface(cutKillSwitches(catalogue))
  return (
    <SubViewTabs
      views={SURFACE_ORDER.map(s => ({ id: s, label: TITRES[s], badge: cutsBySurface[s].length }))}
      active={active}
      onSelect={onSelect}
      accent="#EF9F27"
      activeBg="rgba(186,117,23,0.2)"
      border="#27272A"
      ariaLabel="Surfaces des kill switches"
    />
  )
}

/** La section entière rendue pour une surface active. */
function section(catalogue: FlagCatalogueRow[], active: SurfaceKey) {
  const { kill, overlayMaster, overlayChildren } = partitionCatalogue(catalogue)
  const rows = groupKillBySurface(kill)[active]
  const showOverlay = active === 'app' && overlayMaster !== null

  return renderToStaticMarkup(
    <div>
      {tabs(catalogue, active)}
      {rows.map(r => card(r))}
      {rows.length === 0 && !showOverlay && <div>Aucun kill switch sur cette surface.</div>}
      {showOverlay && overlayMaster && (
        <div>
          <div>Overlay in-game</div>
          {card(overlayMaster)}
          {overlayChildren.map(r => card(r, true))}
        </div>
      )}
    </div>,
  )
}

const CATALOGUE = [
  row('ads_enabled', { surface: 'web', group_key: 'site' }),
  row('player_search_enabled', { surface: 'web', group_key: 'site', value: 'false' }),
  row('item_set_export_enabled', { surface: 'app', group_key: 'app' }),
  row('riot_history_enabled', { surface: 'shared', group_key: 'riot' }),
  row('live_game_enabled', { surface: 'shared', group_key: 'riot', value: 'false' }),
  row(OVERLAY_MASTER_KEY, { surface: 'app', group_key: 'overlay', sort_order: 800 }),
  row('overlay_show_baron_timer', { surface: 'app', group_key: 'overlay', sort_order: 820, parent_key: OVERLAY_MASTER_KEY, value: 'false' }),
]

describe('les trois pastilles', () => {
  it('propose Site, App et Site + App', () => {
    const html = renderToStaticMarkup(tabs(CATALOGUE, 'web'))

    expect(html).toContain('Site')
    expect(html).toContain('App')
    expect(html).toContain('Site + App')
    expect(html.match(/role="tab"/g)).toHaveLength(3)
  })

  it('n’en marque qu’une active', () => {
    const html = renderToStaticMarkup(tabs(CATALOGUE, 'app'))

    expect(html.match(/aria-selected="true"/g)).toHaveLength(1)
    expect(html.match(/aria-selected="false"/g)).toHaveLength(2)
  })

  it('ouvre sur Site par défaut', () => {
    expect(DEFAULT_KILL_SURFACE).toBe('web')
  })

  it('bascule de surface au clic', () => {
    const onSelect = vi.fn()
    const found = clickables(render(tabs(CATALOGUE, 'web', onSelect)))
    ;(found[1].props as { onClick: () => void }).onClick()

    expect(onSelect).toHaveBeenCalledExactlyOnceWith('app')
  })
})

describe('filtrage — une seule surface à la fois', () => {
  it('n’affiche que les flags de la surface active', () => {
    const html = section(CATALOGUE, 'web')

    expect(html).toContain('Libellé ads_enabled')
    expect(html).toContain('Libellé player_search_enabled')
    expect(html).not.toContain('Libellé item_set_export_enabled')
    expect(html).not.toContain('Libellé riot_history_enabled')
  })

  it('masque les flags Site quand App est active', () => {
    const html = section(CATALOGUE, 'app')

    expect(html).toContain('Libellé item_set_export_enabled')
    expect(html).not.toContain('Libellé ads_enabled')
    expect(html).not.toContain('Libellé riot_history_enabled')
  })

  it('isole les flags shared dans leur propre pastille', () => {
    // Ils n'apparaissent NI dans Site NI dans App : un flag rendu deux fois
    // donnerait deux interrupteurs pour une seule ligne en base.
    for (const surface of ['web', 'app'] as const) {
      const html = section(CATALOGUE, surface)
      expect(html, surface).not.toContain('Libellé riot_history_enabled')
      expect(html, surface).not.toContain('Libellé live_game_enabled')
    }

    const shared = section(CATALOGUE, 'shared')
    expect(shared).toContain('Libellé riot_history_enabled')
    expect(shared).toContain('Libellé live_game_enabled')
  })

  it('rend chaque flag une seule fois, toutes surfaces cumulées', () => {
    const vues = SURFACE_ORDER.map(s => section(CATALOGUE, s))

    for (const r of CATALOGUE) {
      const carte = `aria-label="Libellé ${r.key}"`
      const total = vues.reduce((n, html) => n + html.split(carte).length - 1, 0)
      expect(total, r.key).toBe(1)
    }
  })

  it('affiche un état vide plutôt qu’une liste muette', () => {
    const html = section([row('ads_enabled', { surface: 'web' })], 'shared')

    expect(html).toContain('Aucun kill switch sur cette surface.')
  })
})

describe('la sous-section overlay vit sous la pastille App', () => {
  it('apparaît quand App est active', () => {
    const html = section(CATALOGUE, 'app')

    expect(html).toContain('Overlay in-game')
    expect(html).toContain(`Libellé ${OVERLAY_MASTER_KEY}`)
    expect(html).toContain('Libellé overlay_show_baron_timer')
    expect(html).toContain('margin-left:24px')
  })

  it('disparaît sur les deux autres pastilles', () => {
    for (const surface of ['web', 'shared'] as const) {
      const html = section(CATALOGUE, surface)
      expect(html, surface).not.toContain('Overlay in-game')
      expect(html, surface).not.toContain(`Libellé ${OVERLAY_MASTER_KEY}`)
    }
  })

  it('empêche l’état vide de s’afficher si seul l’overlay peuple App', () => {
    const html = section([
      row(OVERLAY_MASTER_KEY, { surface: 'app', group_key: 'overlay' }),
      row('overlay_show_baron_timer', { surface: 'app', group_key: 'overlay', parent_key: OVERLAY_MASTER_KEY }),
    ], 'app')

    expect(html).toContain('Overlay in-game')
    expect(html).not.toContain('Aucun kill switch sur cette surface.')
  })
})

describe('compteurs de coupures par pastille', () => {
  // C'est ce qui compense le masquage : la liste ne montre plus qu'une surface,
  // une coupure ailleurs doit rester repérable sans changer d'onglet.
  it('compte les coupures de chaque surface', () => {
    const parSurface = groupKillBySurface(cutKillSwitches(CATALOGUE))

    expect(parSurface.web.map(r => r.key)).toEqual(['player_search_enabled'])
    expect(parSurface.app.map(r => r.key)).toEqual(['overlay_show_baron_timer'])
    expect(parSurface.shared.map(r => r.key)).toEqual(['live_game_enabled'])
  })

  it('compte l’overlay dans App', () => {
    // Un bloc d'overlay coupé et oublié est exactement ce que le compteur doit
    // faire remonter — il ne doit pas échapper au décompte parce qu'il vit dans
    // une sous-section.
    const parSurface = groupKillBySurface(cutKillSwitches(CATALOGUE))

    expect(parSurface.app.map(r => r.key)).toContain('overlay_show_baron_timer')
  })

  it('affiche le compteur sur la pastille, quelle que soit la surface active', () => {
    for (const active of SURFACE_ORDER) {
      const html = renderToStaticMarkup(tabs(CATALOGUE, active))
      // 3 coupures dans ce catalogue, une par surface → trois badges à 1.
      expect(html.match(/#E24B4A/g), active).toHaveLength(3)
    }
  })

  it('n’affiche aucun badge quand rien n’est coupé', () => {
    const sain = CATALOGUE.map(r => ({ ...r, value: 'true' }))
    const html = renderToStaticMarkup(tabs(sain, 'web'))

    expect(html).not.toContain('#E24B4A')
  })

  it('le total des compteurs égale le décompte global du bandeau', () => {
    // Le bandeau reste GLOBAL : la somme des pastilles doit lui correspondre
    // exactement, sinon l'une des deux vues ment.
    const global = cutKillSwitches(CATALOGUE).length
    const parSurface = groupKillBySurface(cutKillSwitches(CATALOGUE))
    const somme = SURFACE_ORDER.reduce((n, s) => n + parSurface[s].length, 0)

    expect(somme).toBe(global)
    expect(global).toBe(3)
  })
})
