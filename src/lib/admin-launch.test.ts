import { describe, it, expect } from 'vitest'
import {
  partitionCatalogue, groupKillBySurface, surfaceOf, SURFACE_ORDER,
  isPendingLaunch, launchPatch, applyLaunch, cutKillSwitches, isOn,
  OVERLAY_MASTER_KEY, type FlagCatalogueRow,
} from './admin-flags'

/**
 * Regroupement par surface, et transition launch → kill.
 *
 * Logique PURE : c'est ici que vivent les deux propriétés qui coûteraient cher
 * si elles se rompaient sans bruit — un kill switch qui disparaît du panneau
 * (donc qu'on ne peut plus couper), et une transition de lancement écrite en
 * deux temps (donc un état intermédiaire incohérent en base).
 */

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

describe('surface d’un flag', () => {
  it('lit les trois valeurs du schéma', () => {
    expect(surfaceOf(row('a', { surface: 'web' }))).toBe('web')
    expect(surfaceOf(row('b', { surface: 'app' }))).toBe('app')
    expect(surfaceOf(row('c', { surface: 'shared' }))).toBe('shared')
  })

  it('range une surface absente dans « Site + App » plutôt que de la perdre', () => {
    // La contrainte `app_settings_flag_metadata_complete` rend ce cas
    // inatteignable ; s'il survenait, un flag sans groupe DISPARAÎTRAIT du
    // panneau — donc un kill switch qu'on ne pourrait plus couper.
    expect(surfaceOf(row('x', { surface: null }))).toBe('shared')
  })
})

describe('regroupement des kill switches par surface', () => {
  const kill = [
    row('ads_enabled', { surface: 'web' }),
    row('player_search_enabled', { surface: 'web' }),
    row('item_set_export_enabled', { surface: 'app' }),
    row('riot_history_enabled', { surface: 'shared' }),
    row('orphelin', { surface: null }),
  ]

  it('répartit chaque flag dans son groupe', () => {
    const g = groupKillBySurface(kill)

    expect(g.web.map(r => r.key)).toEqual(['ads_enabled', 'player_search_enabled'])
    expect(g.app.map(r => r.key)).toEqual(['item_set_export_enabled'])
    expect(g.shared.map(r => r.key)).toEqual(['riot_history_enabled', 'orphelin'])
  })

  it('produit des groupes DISJOINTS — aucune clé rendue deux fois', () => {
    // « shared » est un troisième groupe, pas une duplication dans les deux
    // autres : deux interrupteurs pour une seule ligne en base seraient deux
    // contrôles d'apparence indépendante pour une valeur unique.
    const g = groupKillBySurface(kill)
    const toutes = [...g.web, ...g.app, ...g.shared].map(r => r.key)

    expect(new Set(toutes).size).toBe(toutes.length)
  })

  it('ne perd aucun flag en route', () => {
    const g = groupKillBySurface(kill)
    const total = g.web.length + g.app.length + g.shared.length

    expect(total).toBe(kill.length)
  })

  it('conserve l’ordre reçu à l’intérieur d’un groupe', () => {
    // `partitionCatalogue` a déjà trié par (group_key, sort_order) : le
    // regroupement ne doit pas re-trier par-dessus.
    const g = groupKillBySurface([
      row('z', { surface: 'web', sort_order: 900 }),
      row('a', { surface: 'web', sort_order: 100 }),
    ])

    expect(g.web.map(r => r.key)).toEqual(['z', 'a'])
  })

  it('rend un groupe vide plutôt qu’absent', () => {
    const g = groupKillBySurface([row('seul', { surface: 'web' })])

    expect(g.app).toEqual([])
    expect(g.shared).toEqual([])
  })

  it('couvre exactement les trois groupes de l’ordre d’affichage', () => {
    expect([...SURFACE_ORDER]).toEqual(['web', 'app', 'shared'])
    const g = groupKillBySurface([])
    expect(Object.keys(g).sort()).toEqual([...SURFACE_ORDER].sort())
  })
})

describe('l’overlay reste hors des groupes, pour le groupe App', () => {
  it('n’entre pas dans le regroupement — il a sa sous-section', () => {
    // `partitionCatalogue` sort déjà le maître et ses enfants de `kill` ; le
    // regroupement ne voit donc que les kill switches « plats ».
    const catalogue = [
      row(OVERLAY_MASTER_KEY, { surface: 'app', group_key: 'overlay' }),
      row('overlay_show_baron_timer', { surface: 'app', group_key: 'overlay', parent_key: OVERLAY_MASTER_KEY }),
      row('item_set_export_enabled', { surface: 'app', group_key: 'app' }),
    ]
    const { kill, overlayMaster, overlayChildren } = partitionCatalogue(catalogue)
    const g = groupKillBySurface(kill)

    expect(g.app.map(r => r.key)).toEqual(['item_set_export_enabled'])
    expect(overlayMaster?.key).toBe(OVERLAY_MASTER_KEY)
    expect(overlayChildren.map(r => r.key)).toEqual(['overlay_show_baron_timer'])
  })
})

describe('flag en attente de lancement', () => {
  it('reconnaît un kind=launch', () => {
    expect(isPendingLaunch(row('scenarios_enabled', { kind: 'launch', value: 'false' }))).toBe(true)
  })

  it('ne reconnaît jamais un kill switch', () => {
    // Le bouton « Lancer » ne doit apparaître que sur un lancement ; un kill
    // switch garde son interrupteur réversible.
    expect(isPendingLaunch(row('ads_enabled', { kind: 'kill', value: 'true' }))).toBe(false)
    expect(isPendingLaunch(row('ads_enabled', { kind: 'kill', value: 'false' }))).toBe(false)
  })

  it('garde son bouton même si la valeur est déjà à true', () => {
    // État hérité de l'ancien interrupteur réversible. Le masquer laisserait ce
    // flag bloqué à mi-chemin : ouvert au public, encore catalogué « lancement »,
    // donc absent de la section qui permet de le couper.
    expect(isPendingLaunch(row('shop_enabled', { kind: 'launch', value: 'true' }))).toBe(true)
  })
})

describe('transition launch → kill', () => {
  it('écrit kind ET value dans le MÊME patch', () => {
    // La propriété centrale : une seule écriture. En deux UPDATE, l'état
    // intermédiaire serait soit une feature ouverte au public encore cataloguée
    // « lancement », soit un kill switch fantôme encore fermé.
    const patch = launchPatch()

    expect(patch).toEqual({ value: 'true', kind: 'kill', reason: null })
    expect(Object.keys(patch).sort()).toEqual(['kind', 'reason', 'value'])
  })

  it('ouvre la feature et la catalogue en kill switch', () => {
    const lance = applyLaunch(row('scenarios_enabled', { kind: 'launch', value: 'false' }))

    expect(lance.kind).toBe('kill')
    expect(isOn(lance)).toBe(true)
  })

  it('n’écrit aucun motif — `reason` est le motif de COUPURE', () => {
    // Y laisser une note de lancement afficherait « Motif : … » avec le texte
    // d'une mise en ligne le jour d'un vrai incident.
    expect(launchPatch().reason).toBeNull()
    expect(applyLaunch(row('shop_enabled', { kind: 'launch', reason: 'vieux motif' })).reason).toBeNull()
  })

  it('ne touche PAS off_behavior', () => {
    // Le flag garde la convention de coupure déjà posée en base. Les 5 flags de
    // lancement portent tous `hidden` (vérifié en base) — la contrainte de
    // métadonnées complètes reste satisfaite après transition.
    const avant = row('ecailles_enabled', { kind: 'launch', value: 'false', off_behavior: 'hidden' })

    expect(applyLaunch(avant).off_behavior).toBe('hidden')
  })

  it('préserve les métadonnées de catalogue', () => {
    const avant = row('shop_enabled', {
      kind: 'launch', value: 'false', surface: 'shared',
      group_key: 'ecailles', parent_key: 'ecailles_enabled', sort_order: 110,
    })
    const apres = applyLaunch(avant)

    expect(apres.surface).toBe('shared')
    expect(apres.group_key).toBe('ecailles')
    expect(apres.parent_key).toBe('ecailles_enabled')
    expect(apres.sort_order).toBe(110)
    expect(apres.label_fr).toBe(avant.label_fr)
  })
})

describe('après transition, au prochain rendu du catalogue', () => {
  const catalogue = [
    row('scenarios_enabled', { kind: 'launch', value: 'false', surface: 'shared', group_key: 'scenarios' }),
    row('ecailles_enabled', { kind: 'launch', value: 'false', surface: 'shared', group_key: 'ecailles' }),
    row('ads_enabled', { kind: 'kill', value: 'true', surface: 'web', group_key: 'site' }),
  ]

  /** Ce que renverra `loadCatalogue()` après l'UPDATE. */
  const apres = catalogue.map(r => (r.key === 'scenarios_enabled' ? applyLaunch(r) : r))

  it('le flag quitte la section Lancements', () => {
    expect(partitionCatalogue(catalogue).launch.map(r => r.key)).toContain('scenarios_enabled')
    expect(partitionCatalogue(apres).launch.map(r => r.key)).not.toContain('scenarios_enabled')
  })

  it('il apparaît dans les kill switches, dans le bon groupe de surface', () => {
    const g = groupKillBySurface(partitionCatalogue(apres).kill)

    expect(g.shared.map(r => r.key)).toContain('scenarios_enabled')
    expect(g.web.map(r => r.key)).not.toContain('scenarios_enabled')
    expect(g.app.map(r => r.key)).not.toContain('scenarios_enabled')
  })

  it('les autres lancements ne bougent pas', () => {
    expect(partitionCatalogue(apres).launch.map(r => r.key)).toEqual(['ecailles_enabled'])
  })

  it('n’alimente pas le bandeau de coupures — il vient d’être ouvert', () => {
    // Le flag est à `true` : c'est un kill switch actif, pas une coupure.
    expect(cutKillSwitches(apres).map(r => r.key)).not.toContain('scenarios_enabled')
  })

  it('devient coupable par le mécanisme standard', () => {
    // Une fois en kill switch, le recouper passe par le toggle + motif, jamais
    // par un retour à l'état « lancement ».
    const coupe = apres.map(r => (r.key === 'scenarios_enabled' ? { ...r, value: 'false', reason: '502 en boucle' } : r))

    expect(cutKillSwitches(coupe).map(r => r.key)).toContain('scenarios_enabled')
    expect(partitionCatalogue(coupe).launch.map(r => r.key)).not.toContain('scenarios_enabled')
  })
})
