import { describe, it, expect } from 'vitest'
import {
  GUIDE_ENTRY_IDS, GUIDE_GROUP_IDS, GUIDE_SECTION_IDS, GUIDE_STRUCTURE,
  guideFlagKeys, isEntryVisible, visibleGuide, type GuideEntryDef,
} from './guide'
import { GUIDE_APP_VERSION, GUIDE_UPDATED } from './guide-release'
import { guideLanguageAlternates, guideMetadata, guidePath } from './guide-seo'
import { LAUNCH_FLAG_KEYS } from './feature-flags'
import { langFromParam } from './lang-param'
import { guideDicts } from '../locales/guide'

/** Toutes les sous-sections déclarées, dans l'ordre de la page. */
function allEntries(): GuideEntryDef[] {
  return GUIDE_STRUCTURE.flatMap(s => [
    ...(s.intro ? [s.intro] : []),
    ...(s.groups ?? []).flatMap(g => g.entries),
    ...s.entries,
  ])
}

/** Ids visibles, à plat, pour une map de flags donnée. */
function visibleIds(flags: Record<string, boolean>): string[] {
  return visibleGuide(flags).flatMap(s => [
    ...(s.intro ? [s.intro.id] : []),
    ...s.groups.flatMap(g => g.entries.map(e => e.id)),
    ...s.entries.map(e => e.id),
  ])
}

const ALL_ON: Record<string, boolean> = Object.fromEntries(guideFlagKeys().map(k => [k, true]))

describe('structure du guide', () => {
  it('chaque sous-section apparaît exactement une fois', () => {
    const ids = allEntries().map(e => e.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect([...ids].sort()).toEqual([...GUIDE_ENTRY_IDS].sort())
  })

  it('les trois sections, dans l’ordre commun → site → app', () => {
    expect(GUIDE_STRUCTURE.map(s => s.id)).toEqual([...GUIDE_SECTION_IDS])
  })

  it('les ancres ne se marchent pas dessus (sections, groupes, sous-sections)', () => {
    const anchors = [...GUIDE_SECTION_IDS, ...GUIDE_GROUP_IDS, ...GUIDE_ENTRY_IDS]
    expect(new Set(anchors).size).toBe(anchors.length)
    anchors.forEach(a => expect(a).toMatch(/^[a-z0-9-]+$/))
  })

  it('🔴 aucun flag de LANCEMENT : le guide ne décrit que ce qui est en production', () => {
    // Un flag de lancement garde une feature pas encore ouverte (Écailles,
    // scénarios, kit…). En rattacher une sous-section reviendrait à documenter
    // une fonctionnalité qui n'existe pas pour les joueurs.
    for (const key of guideFlagKeys()) expect(LAUNCH_FLAG_KEYS.has(key)).toBe(false)
  })

  it('aucune trace des fonctionnalités exclues ou retirées', () => {
    // Comparaison par MOT (`workshop` n'est pas `shop`).
    const excluded = new Set([
      'ecailles', 'shop', 'quests', 'cosmetics', 'scenarios', 'kit', 'tournois', 'tournaments', 'prac',
    ])
    for (const id of [...GUIDE_ENTRY_IDS, ...guideFlagKeys()]) {
      for (const w of id.toLowerCase().split(/[-_]/)) expect(excluded.has(w), id).toBe(false)
    }
  })
})

describe('masquage par les feature flags', () => {
  it('tout est visible quand tous les flags sont actifs', () => {
    expect([...visibleIds(ALL_ON)].sort()).toEqual([...GUIDE_ENTRY_IDS].sort())
  })

  it('catalogue indisponible ⇒ repli des kill switches : tout reste visible', () => {
    // Map vide = première lecture échouée. Les flags du guide sont tous des kill
    // switches, dont le repli est OUVERT : une panne ne vide pas la page.
    expect([...visibleIds({})].sort()).toEqual([...GUIDE_ENTRY_IDS].sort())
  })

  it('un kill switch coupé retire SA sous-section et elle seule', () => {
    const ids = visibleIds({ ...ALL_ON, workshop_builds_enabled: false })
    expect(ids).not.toContain('workshop-builds')
    expect(ids).toHaveLength(GUIDE_ENTRY_IDS.length - 1)
  })

  it('`all` : il suffit qu’un des flags soit coupé', () => {
    expect(visibleIds({ ...ALL_ON, riot_history_enabled: false })).not.toContain('recherche-joueur')
    expect(visibleIds({ ...ALL_ON, player_search_enabled: false })).not.toContain('recherche-joueur')
  })

  it('`any` : le parcours jungle reste tant qu’un des deux affichages est permis', () => {
    expect(visibleIds({ ...ALL_ON, overlay_show_path_minimap: false })).toContain('parcours-jungle')
    expect(visibleIds({
      ...ALL_ON, overlay_show_path_minimap: false, overlay_show_path_list: false,
    })).not.toContain('parcours-jungle')
  })

  it('un groupe vidé disparaît avec ses sous-sections', () => {
    const sections = visibleGuide({
      ...ALL_ON, overlay_show_objective_timers: false, overlay_show_inhib_timers: false,
    })
    const app = sections.find(s => s.id === 'app')!
    expect(app.groups.map(g => g.id)).not.toContain('objectifs')
  })

  it('overlay coupé (map résolue, enfants éteints) : intro et blocs disparaissent, le reste de l’app non', () => {
    // `resolveFlags` éteint les 18 enfants quand le maître est coupé : c'est la
    // map que la page reçoit réellement.
    const resolved = { ...ALL_ON }
    for (const k of Object.keys(resolved)) if (k.startsWith('overlay_')) resolved[k] = false
    const app = visibleGuide(resolved).find(s => s.id === 'app')!
    expect(app.intro).toBeUndefined()
    expect(app.groups.map(g => g.id)).toEqual(['jungle', 'avant-partie'])
    expect(app.groups.find(g => g.id === 'jungle')!.entries.map(e => e.id)).toEqual(['calibrage-minimap'])
    expect(app.entries.map(e => e.id)).toEqual(['comparaison-rang', 'mises-a-jour'])
  })

  it('le flag IA du Match Up ne masque pas la sous-section, seulement sa partie IA', () => {
    const on = visibleGuide(ALL_ON).flatMap(s => s.entries).find(e => e.id === 'match-up')!
    const off = visibleGuide({ ...ALL_ON, matchup_ai_enabled: false })
      .flatMap(s => s.entries).find(e => e.id === 'match-up')!
    expect(on.showAi).toBe(true)
    expect(off).toBeDefined()
    expect(off.showAi).toBe(false)
  })

  it('isEntryVisible : une entrée sans flag est toujours visible', () => {
    expect(isEntryVisible({ id: 'champions' }, {})).toBe(true)
  })
})

describe('🔴 dictionnaire FR / EN — chaque clé dans les deux langues', () => {
  const required = ['name', 'purpose', 'where', 'screenshot'] as const

  it.each(['fr', 'en'] as const)('%s — chaque sous-section a son texte complet', (lang) => {
    const d = guideDicts[lang]
    for (const id of GUIDE_ENTRY_IDS) {
      const t = d.entries[id]
      expect(t, `${lang}:${id}`).toBeDefined()
      for (const f of required) expect(t[f].trim(), `${lang}:${id}.${f}`).not.toBe('')
      expect(t.steps.length, `${lang}:${id}.steps`).toBeGreaterThan(0)
      t.steps.forEach(s => expect(s.trim()).not.toBe(''))
    }
    for (const id of GUIDE_SECTION_IDS) {
      expect(d.sections[id].title.trim()).not.toBe('')
      expect(d.sections[id].blurb.trim()).not.toBe('')
    }
    for (const id of GUIDE_GROUP_IDS) expect(d.groups[id].trim()).not.toBe('')
  })

  it('mêmes clés et mêmes champs optionnels des deux côtés', () => {
    expect(Object.keys(guideDicts.en.entries).sort()).toEqual(Object.keys(guideDicts.fr.entries).sort())
    for (const id of GUIDE_ENTRY_IDS) {
      const fr = guideDicts.fr.entries[id]
      const en = guideDicts.en.entries[id]
      for (const f of ['tier', 'aiTier', 'inGame'] as const) {
        expect(en[f] === undefined, `${id}.${f}`).toBe(fr[f] === undefined)
      }
      expect(en.steps.length, `${id}.steps`).toBe(fr.steps.length)
      expect(en.aiSteps?.length, `${id}.aiSteps`).toBe(fr.aiSteps?.length)
    }
  })

  it('aucun texte anglais resté en français (noms des sous-sections)', () => {
    // Les noms propres identiques dans les deux langues sont déclarés ici.
    const sameByDesign = new Set(['champions', 'patch-notes', 'match-up', 'workshop-builds', 'workshop-jungle'])
    for (const id of GUIDE_ENTRY_IDS) {
      if (sameByDesign.has(id)) continue
      expect(guideDicts.en.entries[id].name, id).not.toBe(guideDicts.fr.entries[id].name)
    }
  })

  it('le texte ne dépasse pas ce qui est en prod : aucune promesse', () => {
    const promise = /bientôt|prochainement|à venir|coming soon|will be available|not yet available|pas encore disponible/i
    for (const lang of ['fr', 'en'] as const) {
      for (const id of GUIDE_ENTRY_IDS) {
        const t = guideDicts[lang].entries[id]
        const body = [t.purpose, t.where, ...t.steps, ...(t.aiSteps ?? []), t.inGame ?? '', t.note ?? ''].join(' ')
        expect(body, `${lang}:${id}`).not.toMatch(promise)
      }
    }
  })

  it('les patch notes signalent en anglais qu’elles sont en français uniquement', () => {
    expect(guideDicts.en.entries['patch-notes'].note).toMatch(/French only/)
  })

  it('les mises en garde demandées sont présentes dans les deux langues', () => {
    for (const lang of ['fr', 'en'] as const) {
      const e = guideDicts[lang].entries
      expect(e['todo-site'].note, lang).toBeTruthy()
      expect(e['todo-en-jeu'].note, lang).toBeTruthy()
      expect(e['liaison-riot'].note, lang).toBeTruthy()
    }
  })
})

describe('date et version de l’en-tête', () => {
  it('format attendu', () => {
    expect(GUIDE_APP_VERSION).toMatch(/^\d+\.\d+\.\d+$/)
    expect(GUIDE_UPDATED).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    const [y, m, d] = GUIDE_UPDATED.split('-').map(Number)
    const date = new Date(y, m - 1, d)
    expect(date.getMonth()).toBe(m - 1) // rejette un 2026-02-31
  })
})

describe('SEO — une URL par langue, rendue par le serveur', () => {
  it('le français est l’URL nue, l’anglais porte `?lang=en`', () => {
    expect(guidePath('fr')).toBe('/guide')
    expect(guidePath('en')).toBe('/guide?lang=en')
  })

  it('lecture stricte du paramètre (règle de lang-param)', () => {
    expect(langFromParam('en')).toBe('en')
    expect(langFromParam('EN')).toBe('en')
    expect(langFromParam(['en', 'fr'])).toBe('en')
    expect(langFromParam('de')).toBeNull()
    expect(langFromParam(undefined)).toBeNull()
  })

  it.each(['fr', 'en'] as const)('%s — metadata dans la langue, canonique sur elle-même', (lang) => {
    const meta = guideMetadata(lang)
    expect(meta.title).toBe(guideDicts[lang].meta.title)
    expect(meta.description).toBe(guideDicts[lang].meta.description)
    expect(meta.alternates?.canonical).toBe(`https://wyrm-forge.com${guidePath(lang)}`)
    expect(meta.alternates?.languages).toEqual(guideLanguageAlternates())
    // Indexable : aucune directive robots posée par la page.
    expect(meta.robots).toBeUndefined()
  })

  it('hreflang fr / en / x-default, en URL absolues', () => {
    expect(guideLanguageAlternates()).toEqual({
      fr: 'https://wyrm-forge.com/guide',
      en: 'https://wyrm-forge.com/guide?lang=en',
      'x-default': 'https://wyrm-forge.com/guide',
    })
  })

  it('les deux metadata sont réellement traduites', () => {
    expect(guideMetadata('en').title).not.toBe(guideMetadata('fr').title)
    expect(guideMetadata('en').description).not.toBe(guideMetadata('fr').description)
  })
})
