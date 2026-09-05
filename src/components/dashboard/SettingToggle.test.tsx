import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import SettingToggle from './SettingToggle'
import {
  partitionCatalogue, flagLabel, flagDescription, isOn, OVERLAY_MASTER_KEY,
  type FlagCatalogueRow,
} from '@/lib/admin-flags'

/**
 * RENDU des sections de flags du panneau admin, à partir d'un catalogue SIMULÉ.
 *
 * Rendu en HTML statique via `react-dom/server` — ni jsdom ni testing-library,
 * comme `LiveComposition.test.tsx`. Ce que ces tests prouvent que les tests purs
 * de `lib/admin-flags.test.ts` ne prouvent pas : que le composant CONSOMME bien
 * les décisions du module (pastille d'état, grisage, indentation, bouton
 * désactivé) au lieu de les recalculer à sa façon.
 *
 * `SettingToggle` est rendu directement plutôt qu'`AdminTab` : monter le panneau
 * entier tirerait Supabase, `createPortal` et les icônes, pour ne rien prouver de
 * plus sur les propriétés visées.
 */

function row(key: string, value: boolean, kind: 'launch' | 'kill', extra: Partial<FlagCatalogueRow> = {}): FlagCatalogueRow {
  return {
    key, value: value ? 'true' : 'false', kind,
    surface: 'shared', group_key: 'g', parent_key: null,
    off_behavior: kind === 'launch' ? 'hidden' : 'notice',
    label_fr: `Libellé ${key}`, label_en: `Label ${key}`,
    desc_fr: `Description ${key}`, desc_en: `Description ${key}`,
    sort_order: 0, reason: null, updated_at: null, updated_by: null,
    ...extra,
  }
}

/** Rend une carte comme le fait AdminTab, sans monter AdminTab. */
function card(r: FlagCatalogueRow, opts: { locked?: boolean; indented?: boolean; state?: string } = {}) {
  return renderToStaticMarkup(
    <SettingToggle
      label={flagLabel(r, 'fr')}
      description={flagDescription(r, 'fr')}
      settingKey={r.key}
      value={isOn(r)}
      saving={false}
      loading={false}
      onToggle={() => {}}
      border="#27272A"
      bg="#18181B"
      variant={r.kind}
      stateLabel={opts.state}
      locked={opts.locked}
      lockedHint="Indisponible — l'overlay est coupé"
      indented={opts.indented}
    />,
  )
}

describe('rendu de la section Lancements', () => {
  it('affiche le libellé, la description et la pastille d\'état', () => {
    const html = card(row('scenarios_enabled', false, 'launch'), { state: 'pas encore lancé' })

    expect(html).toContain('Libellé scenarios_enabled')
    expect(html).toContain('Description scenarios_enabled')
    expect(html).toContain('pas encore lancé')
  })

  it('porte l\'accent OR de la variante lancement quand il est actif', () => {
    // #EF9F27 = l'or du panneau admin, imposé par la décision de cadrage.
    const html = card(row('scenarios_enabled', true, 'launch'), { state: 'en ligne' })

    expect(html).toContain('#EF9F27')
    expect(html).toContain('aria-pressed="true"')
  })

  it('un lancement éteint n\'est PAS mis en alarme', () => {
    // Une feature pas encore ouverte est un état normal : elle ne doit pas
    // s'afficher comme une coupure, sinon le rouge ne veut plus rien dire.
    const html = card(row('scenarios_enabled', false, 'launch'), { state: 'pas encore lancé' })

    expect(html).not.toContain('rgba(226,75,74,0.45)')
    expect(html).toContain('aria-pressed="false"')
  })
})

describe('rendu de la section Kill switches', () => {
  it('un kill switch actif reste discret', () => {
    const html = card(row('ads_enabled', true, 'kill'), { state: 'actif' })

    expect(html).toContain('actif')
    expect(html).not.toContain('rgba(226,75,74,0.45)')   // pas de bordure d'alarme
  })

  it('un kill switch COUPÉ saute aux yeux', () => {
    // Le seul état du panneau qui doit s'imposer visuellement : c'est une anomalie
    // en cours, pas un réglage.
    const html = card(row('ads_enabled', false, 'kill'), { state: '⚠ COUPÉ' })

    expect(html).toContain('⚠ COUPÉ')
    expect(html).toContain('rgba(226,75,74,0.45)')       // bordure rouge
    expect(html).toContain('#E24B4A')                    // pastille rouge pleine
  })
})

describe('rendu de la sous-section Overlay', () => {
  const catalogue = (masterOn: boolean): FlagCatalogueRow[] => [
    row(OVERLAY_MASTER_KEY, masterOn, 'kill', { group_key: 'overlay', sort_order: 800 }),
    row('overlay_show_baron_timer', true, 'kill', { group_key: 'overlay', sort_order: 820, parent_key: OVERLAY_MASTER_KEY }),
    row('overlay_show_gold_diff', true, 'kill', { group_key: 'overlay', sort_order: 900, parent_key: OVERLAY_MASTER_KEY }),
  ]

  it('les enfants sont indentés sous le maître', () => {
    const { overlayChildren } = partitionCatalogue(catalogue(true))
    const html = card(overlayChildren[0], { indented: true })

    expect(html).toContain('margin-left:24px')
  })

  it('maître ACTIF → les enfants sont pilotables', () => {
    const { overlayChildren } = partitionCatalogue(catalogue(true))
    const html = card(overlayChildren[0], { indented: true, locked: false })

    expect(html).not.toContain('disabled=""')
    expect(html).not.toContain('opacity:0.45')
    expect(html).not.toContain('overlay est coupé')
  })

  it('maître COUPÉ → les 18 enfants sont grisés, non cliquables, et le disent', () => {
    // La grammaire visuelle reprise de l'onglet Overlay de l'app WPF : décocher le
    // maître grise tout le bloc qu'il commande. L'admin et l'utilisateur final
    // voient la même chose.
    const { overlayChildren } = partitionCatalogue(catalogue(false))

    for (const child of overlayChildren) {
      const html = card(child, { indented: true, locked: true })
      expect(html, child.key).toContain('opacity:0.45')          // grisé
      expect(html, child.key).toContain('disabled=""')           // non cliquable
      expect(html, child.key).toContain('overlay est coupé')    // et la raison
    }
  })

  it('un enfant verrouillé garde sa VALEUR affichée à true', () => {
    // Le grisage est visuel : rien n'est écrit en base, et l'enfant retrouve son
    // état dès la réactivation du maître.
    const { overlayChildren } = partitionCatalogue(catalogue(false))
    const html = card(overlayChildren[0], { indented: true, locked: true })

    expect(html).toContain('aria-pressed="true"')
  })
})

describe('accessibilité et état de sauvegarde', () => {
  it('expose le libellé et l\'état au lecteur d\'écran', () => {
    const html = card(row('ads_enabled', true, 'kill'), { state: 'actif' })

    expect(html).toContain('aria-label="Libellé ads_enabled"')
    expect(html).toContain('aria-pressed="true"')
  })

  it('désactive l\'interrupteur pendant l\'écriture', () => {
    const html = renderToStaticMarkup(
      <SettingToggle
        label="x" description="y" settingKey="k" value={true}
        saving={true} loading={false} onToggle={() => {}}
        border="#27272A" bg="#18181B" variant="kill"
      />,
    )

    expect(html).toContain('disabled=""')
    expect(html).toContain('…')     // le témoin d'écriture en cours
  })
})
