import { describe, it, expect } from 'vitest'
import {
  partitionCatalogue, cutKillSwitches, canSubmitCut, isChildLocked,
  offBehaviorKey, relativeTime, flagLabel, flagDescription, isOn,
  byGroupThenOrder, OVERLAY_MASTER_KEY,
  type FlagCatalogueRow,
} from './admin-flags'

/**
 * Panneau admin des feature flags.
 *
 * Le catalogue est SIMULÉ ici : aucune table, aucun appel Supabase. C'est
 * possible parce que toute la décision du panneau vit dans des fonctions pures —
 * `AdminTab` ne fait que rendre leur résultat. Même partage que
 * `lib/feature-flags.test.ts`, et la même raison : ce dépôt teste sans jsdom.
 */

/** Fabrique de ligne de catalogue, au format exact de `select *`. */
function row(
  key: string,
  value: boolean,
  kind: 'setting' | 'launch' | 'kill',
  extra: Partial<FlagCatalogueRow> = {},
): FlagCatalogueRow {
  return {
    key,
    value: value ? 'true' : 'false',
    kind,
    surface: 'shared',
    group_key: 'divers',
    parent_key: null,
    off_behavior: kind === 'launch' ? 'hidden' : 'notice',
    label_fr: `FR ${key}`,
    label_en: `EN ${key}`,
    desc_fr: `desc fr ${key}`,
    desc_en: `desc en ${key}`,
    sort_order: 0,
    reason: null,
    updated_at: null,
    updated_by: null,
    ...extra,
  }
}

/** Catalogue réduit mais fidèle : 2 lancements, 2 kill, le maître + 3 enfants. */
function catalogue(): FlagCatalogueRow[] {
  return [
    row('ecailles_enabled', false, 'launch', { group_key: 'ecailles', sort_order: 100 }),
    row('shop_enabled', false, 'launch', { group_key: 'ecailles', sort_order: 110, parent_key: 'ecailles_enabled' }),
    row('ads_enabled', true, 'kill', { group_key: 'site', sort_order: 600 }),
    row('patch_notes_enabled', true, 'kill', { group_key: 'contenu', sort_order: 500 }),
    row(OVERLAY_MASTER_KEY, true, 'kill', { group_key: 'overlay', sort_order: 800, off_behavior: 'hidden' }),
    row('overlay_show_baron_timer', true, 'kill', { group_key: 'overlay', sort_order: 820, parent_key: OVERLAY_MASTER_KEY, off_behavior: 'hidden' }),
    row('overlay_show_gold_diff', true, 'kill', { group_key: 'overlay', sort_order: 900, parent_key: OVERLAY_MASTER_KEY, off_behavior: 'hidden' }),
    row('overlay_show_item_build', false, 'kill', { group_key: 'overlay', sort_order: 960, parent_key: OVERLAY_MASTER_KEY, off_behavior: 'hidden' }),
    // Réglage de tuning : ne doit apparaître dans AUCUNE des deux sections.
    row('cap_daily_scales', true, 'setting', { group_key: 'ecailles', sort_order: 190 }),
  ]
}

describe('partition du catalogue en sections', () => {
  it('sépare lancements, kill switches et overlay', () => {
    const p = partitionCatalogue(catalogue())

    expect(p.launch.map(r => r.key)).toEqual(['ecailles_enabled', 'shop_enabled'])
    expect(p.kill.map(r => r.key)).toEqual(['patch_notes_enabled', 'ads_enabled'])
    expect(p.overlayMaster?.key).toBe(OVERLAY_MASTER_KEY)
    expect(p.overlayChildren.map(r => r.key)).toEqual([
      'overlay_show_baron_timer', 'overlay_show_gold_diff', 'overlay_show_item_build',
    ])
  })

  it('n\'affiche AUCUN réglage de tuning', () => {
    // `cap_daily_scales` et `patch_auto_publish` ne sont pas des flags : ils ont
    // leur propre interrupteur ailleurs et n'ont rien à faire dans ces sections.
    const p = partitionCatalogue(catalogue())
    const all = [...p.launch, ...p.kill, ...p.overlayChildren, p.overlayMaster].filter(Boolean)

    expect(all.some(r => r!.key === 'cap_daily_scales')).toBe(false)
    expect(all.every(r => r!.kind !== 'setting')).toBe(true)
  })

  it('les enfants d\'overlay ne sont PAS aussi dans la section kill', () => {
    // Sinon ils apparaîtraient deux fois : une dans la liste plate, une indentée.
    const p = partitionCatalogue(catalogue())
    expect(p.kill.some(r => r.parent_key === OVERLAY_MASTER_KEY)).toBe(false)
    expect(p.kill.some(r => r.key === OVERLAY_MASTER_KEY)).toBe(false)
  })

  it('reconnaît un enfant par parent_key, jamais par préfixe de clé', () => {
    // ⚠️ La régression guettée : un test de préfixe (`startsWith('overlay_')`)
    // marcherait sur le catalogue actuel et se romprait au premier enfant nommé
    // autrement. C'est `parent_key` qui PORTE la relation.
    const rows = [
      row(OVERLAY_MASTER_KEY, true, 'kill'),
      row('hud_truc_machin', true, 'kill', { parent_key: OVERLAY_MASTER_KEY }),
    ]
    const p = partitionCatalogue(rows)

    expect(p.overlayChildren.map(r => r.key)).toEqual(['hud_truc_machin'])
    expect(p.kill).toHaveLength(0)
  })

  it('un 19e enfant ajouté en base apparaît sans changer le code', () => {
    // La propriété qui justifie tout le chantier : un INSERT suffit.
    const rows = [...catalogue(), row('overlay_nouveau_bloc', true, 'kill', {
      group_key: 'overlay', sort_order: 990, parent_key: OVERLAY_MASTER_KEY,
    })]

    expect(partitionCatalogue(rows).overlayChildren.map(r => r.key))
      .toContain('overlay_nouveau_bloc')
  })

  it('trie par group_key puis sort_order', () => {
    const rows = [
      row('c', true, 'kill', { group_key: 'zeta', sort_order: 1 }),
      row('a', true, 'kill', { group_key: 'alpha', sort_order: 20 }),
      row('b', true, 'kill', { group_key: 'alpha', sort_order: 10 }),
    ]
    expect([...rows].sort(byGroupThenOrder).map(r => r.key)).toEqual(['b', 'a', 'c'])
  })

  it('survit à un catalogue vide et à un overlay absent', () => {
    const p = partitionCatalogue([])
    expect(p.launch).toEqual([])
    expect(p.kill).toEqual([])
    expect(p.overlayMaster).toBeNull()
    expect(p.overlayChildren).toEqual([])
  })
})

describe('bandeau d\'alerte', () => {
  it('n\'apparaît pas quand tous les kill switches sont actifs', () => {
    const rows = catalogue().map(r =>
      r.kind === 'kill' ? { ...r, value: 'true' } : r)

    expect(cutKillSwitches(rows)).toHaveLength(0)
  })

  it('liste chaque kill switch coupé, overlay compris', () => {
    // Le catalogue de référence a `overlay_show_item_build` à false.
    expect(cutKillSwitches(catalogue()).map(r => r.key)).toEqual(['overlay_show_item_build'])
  })

  it('compte les coupures multiples', () => {
    const rows = catalogue().map(r =>
      r.key === 'ads_enabled' ? { ...r, value: 'false' } : r)

    expect(cutKillSwitches(rows).map(r => r.key).sort())
      .toEqual(['ads_enabled', 'overlay_show_item_build'])
  })

  it('IGNORE les flags de lancement à false', () => {
    // ⚠️ Un flag de lancement éteint est l'état NORMAL d'une feature pas encore
    // ouverte. L'inclure noierait les vraies coupures sous des lignes permanentes,
    // et le bandeau ne serait plus lu au bout d'une semaine.
    const rows = catalogue().filter(r => r.kind !== 'kill')
    expect(rows.some(r => !isOn(r))).toBe(true)      // il y a bien des lancements éteints
    expect(cutKillSwitches(rows)).toHaveLength(0)    // et pourtant : aucun bandeau
  })

  it('disparaît dès la réactivation', () => {
    const rows = catalogue().map(r =>
      r.key === 'overlay_show_item_build' ? { ...r, value: 'true' } : r)

    expect(cutKillSwitches(rows)).toHaveLength(0)
  })
})

describe('coupure : le motif est obligatoire', () => {
  it('refuse un motif vide ou fait d\'espaces', () => {
    // C'est la garde de « une coupure de 2h du matin doit s'expliquer à 9h ».
    // Elle est en fonction pure ET rappelée avant l'update : un bouton réactivé
    // par les outils de développement ne suffit pas à écrire sans motif.
    expect(canSubmitCut('')).toBe(false)
    expect(canSubmitCut('   ')).toBe(false)
    expect(canSubmitCut('\n\t ')).toBe(false)
  })

  it('accepte un motif renseigné', () => {
    expect(canSubmitCut('502 en boucle sur l\'EF')).toBe(true)
    expect(canSubmitCut(' x ')).toBe(true)
  })
})

describe('verrouillage des enfants d\'overlay', () => {
  it('maître COUPÉ → les enfants sont verrouillés', () => {
    const master = row(OVERLAY_MASTER_KEY, false, 'kill')
    expect(isChildLocked(master)).toBe(true)
  })

  it('maître ACTIF → les enfants restent pilotables un par un', () => {
    const master = row(OVERLAY_MASTER_KEY, true, 'kill')
    expect(isChildLocked(master)).toBe(false)
  })

  it('maître absent du catalogue → rien n\'est verrouillé', () => {
    // On ne bloque pas l'admin sur une donnée manquante.
    expect(isChildLocked(null)).toBe(false)
  })

  it('le verrouillage n\'ÉCRIT rien : la valeur de l\'enfant est intacte', () => {
    // Le grisage est purement visuel. Un enfant à `true` sous un maître coupé
    // reste à `true` en base et retrouve son état dès la réactivation du maître —
    // même principe que l'overlay WPF, qui n'écrit jamais l'état distant dans les
    // préférences utilisateur.
    const p = partitionCatalogue(catalogue().map(r =>
      r.key === OVERLAY_MASTER_KEY ? { ...r, value: 'false' } : r))

    expect(isChildLocked(p.overlayMaster)).toBe(true)
    expect(isOn(p.overlayChildren.find(r => r.key === 'overlay_show_baron_timer')!)).toBe(true)
  })
})

describe('libellés et impact', () => {
  it('suit la langue courante', () => {
    const r = row('ads_enabled', true, 'kill')
    expect(flagLabel(r, 'fr')).toBe('FR ads_enabled')
    expect(flagLabel(r, 'en')).toBe('EN ads_enabled')
    expect(flagDescription(r, 'fr')).toBe('desc fr ads_enabled')
  })

  it('rend la CLÉ lisible plutôt qu\'un vide si le libellé manque', () => {
    // La contrainte `app_settings_flag_metadata_complete` rend le cas très
    // improbable ; s'il survient, un interrupteur muet serait pire qu'une clé brute.
    const r = row('mystere', true, 'kill', { label_fr: null, label_en: '  ' })
    expect(flagLabel(r, 'fr')).toBe('mystere')
    expect(flagLabel(r, 'en')).toBe('mystere')
    expect(flagDescription(r, 'fr')).toBe('desc fr mystere')
  })

  it('dérive l\'impact utilisateur d\'off_behavior', () => {
    expect(offBehaviorKey(row('a', true, 'launch', { off_behavior: 'hidden' }))).toBe('hidden')
    expect(offBehaviorKey(row('b', true, 'kill', { off_behavior: 'degraded' }))).toBe('degraded')
  })

  it('retombe sur « notice » quand off_behavior est absent', () => {
    // Le repli le plus sûr à AFFICHER : il décrit le comportement le moins
    // destructeur, donc ne sous-estime jamais ce que l'admin s'apprête à casser.
    expect(offBehaviorKey(row('c', true, 'kill', { off_behavior: null }))).toBe('notice')
  })
})

describe('durée relative d\'une coupure', () => {
  const now = new Date('2026-09-05T12:00:00Z')

  it('rend une durée lisible dans les deux langues', () => {
    const twelveMinAgo = new Date('2026-09-05T11:48:00Z').toISOString()
    expect(relativeTime(twelveMinAgo, 'fr', now)).toContain('12')
    expect(relativeTime(twelveMinAgo, 'en', now)).toContain('12')
  })

  it('choisit l\'unité selon l\'ancienneté', () => {
    expect(relativeTime(new Date('2026-09-05T11:59:30Z').toISOString(), 'en', now)).toMatch(/second/)
    expect(relativeTime(new Date('2026-09-05T09:00:00Z').toISOString(), 'en', now)).toMatch(/hour/)
    expect(relativeTime(new Date('2026-09-01T12:00:00Z').toISOString(), 'en', now)).toMatch(/day/)
  })

  it('renvoie null sur une date absente ou illisible', () => {
    // L'appelant omet alors la mention — jamais « il y a NaN ».
    expect(relativeTime(null, 'fr', now)).toBeNull()
    expect(relativeTime('pas une date', 'fr', now)).toBeNull()
  })
})
