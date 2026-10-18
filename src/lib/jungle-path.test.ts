import { describe, expect, it } from 'vitest'
import {
  CAMP_BASES, CAMP_POSITIONS, ELEMENT_TYPE, PLACEMENT_TYPES,
  addPlacement, addStroke, campBaseOf, campKey, clearEditable, draftFingerprint, draftToWrite,
  emptyDraft, eraseAt, isBlankDraft, isDisplayable, nextCampOrder, parseElements, parseStrokes,
  removeCamp, renumberCamps, round4, rowToDraft, spellName, toNormalized, toPercent, toggleCamp,
  writeErrorKey,
  type JunglePathRow, type PathElement,
} from './jungle-path'

/**
 * Extrait RÉEL de %AppData%\Logiciel-Assistant-LOL\junglepaths.json (path Bel'Veth du
 * 2026-08-06), recopié tel quel — doubles à 17 chiffres compris. C'est la forme exacte
 * qu'écrit System.Text.Json côté app.
 */
const BELVETH_ELEMENTS = [
  { Type: 0, Label: 'BlueBuff_Blue', X: 0.25, Y: 0.46, Order: 1, HasSmite: false },
  { Type: 0, Label: 'Gromp_Blue', X: 0.15, Y: 0.43, Order: 2, HasSmite: false },
  { Type: 0, Label: 'Wolves_Blue', X: 0.25, Y: 0.56, Order: 3, HasSmite: false },
  { Type: 0, Label: 'Raptors_Blue', X: 0.47, Y: 0.64, Order: 4, HasSmite: false },
  { Type: 0, Label: 'RedBuff_Blue', X: 0.52, Y: 0.73, Order: 5, HasSmite: false },
  { Type: 0, Label: 'Krugs_Blue', X: 0.57, Y: 0.83, Order: 6, HasSmite: false },
  { Type: 0, Label: 'Scuttler_Blue', X: 0.3, Y: 0.35, Order: 7, HasSmite: false },
  { Type: 0, Label: 'Scuttler_Red', X: 0.72, Y: 0.65, Order: 8, HasSmite: false },
  { Type: 1, Label: 'Smite', X: 0.23284418005585164, Y: 0.47319971223244195, Order: -1, HasSmite: false },
  { Type: 1, Label: 'Smite', X: 0.7140039142576448, Y: 0.6696861631765826, Order: -1, HasSmite: false },
]

/** Ce que le site ne sait ni afficher ni éditer, tel qu'un path de l'app peut le porter. */
const APP_ONLY_ELEMENTS = [
  { Type: 6, Label: 'Spell:Flash:https://ddragon.leagueoflegends.com/cdn/16.20.1/img/spell/SummonerFlash.png',
    X: 0.4, Y: 0.5, Order: -1, HasSmite: false },
  { Type: 5, Label: 'Stroke', X: 0.1, Y: 0.1, Order: -1, HasSmite: false },
  { Type: 42, Label: 'TypeFutur', X: 1.37, Y: -0.2, Order: -1, HasSmite: false, Nouveau: { a: 1 } },
]

const APP_STROKES = [
  { Points: [{ X: 0.12345678901234, Y: 0.2 }, { X: -0.01, Y: 1.02 }], Color: '#FF0000', Thickness: 3.5 },
]

function belvethRow(extra: Partial<JunglePathRow> = {}): JunglePathRow {
  return {
    id: '0e4b0c9c-3e33-4c0f-b779-b5cdbb9a8902',
    user_id: 'b1484df6-0000-0000-0000-000000000000',
    name: ' belveth',
    champion: "Bel'Veth",
    side: 'Blue',
    // Copie profonde : le test doit prouver que la SORTIE égale l'entrée d'origine.
    elements: JSON.parse(JSON.stringify([...BELVETH_ELEMENTS, ...APP_ONLY_ELEMENTS])),
    strokes: JSON.parse(JSON.stringify(APP_STROKES)),
    creator: 'Ewen',
    is_from_workshop: true,
    created_at: '2026-08-06T13:59:58.314388+00:00',
    updated_at: '2026-08-06T13:59:58.314388+00:00',
    ...extra,
  }
}

describe('aller-retour sans perte — path créé dans l\'app, rouvert puis resauvegardé', () => {
  it('relit puis réécrit EXACTEMENT les mêmes éléments et tracés (path réel Bel\'Veth)', () => {
    const write = draftToWrite(rowToDraft(belvethRow()))
    expect(write.elements).toEqual([...BELVETH_ELEMENTS, ...APP_ONLY_ELEMENTS])
    expect(write.strokes).toEqual(APP_STROKES)
    // Ordre des clés compris : c'est ce que voit l'app et ce que compare la base.
    expect(JSON.stringify(write.elements)).toBe(JSON.stringify([...BELVETH_ELEMENTS, ...APP_ONLY_ELEMENTS]))
    expect(JSON.stringify(write.strokes)).toBe(JSON.stringify(APP_STROKES))
  })

  it('conserve creator et is_from_workshop, et n\'envoie ni user_id ni created_at', () => {
    const write = draftToWrite(rowToDraft(belvethRow()))
    expect(write.creator).toBe('Ewen')
    expect(write.is_from_workshop).toBe(true)
    expect(write).not.toHaveProperty('user_id')
    expect(write).not.toHaveProperty('created_at')
    expect(rowToDraft(belvethRow()).createdAt).toBe('2026-08-06T13:59:58.314388+00:00')
  })

  it('ne borne ni n\'arrondit les coordonnées relues (point de l\'app hors cadre)', () => {
    const d = rowToDraft(belvethRow())
    expect(d.strokes[0].Points[1]).toEqual({ X: -0.01, Y: 1.02 })
    expect(d.strokes[0].Points[0].X).toBe(0.12345678901234)
    expect(d.elements.find(e => e.Type === 42)).toMatchObject({ X: 1.37, Y: -0.2, Nouveau: { a: 1 } })
  })

  it('garde intacts sorts et inconnus après une vraie édition (ajout d\'un camp, d\'un tracé)', () => {
    const d = rowToDraft(belvethRow())
    const elements = toggleCamp(d.elements, 'Gromp_Red')
    const strokes = addStroke(d.strokes, [{ x: 10, y: 10 }, { x: 20, y: 20 }], '#00ff00', 3)
    const write = draftToWrite({ ...d, elements, strokes })
    for (const keep of APP_ONLY_ELEMENTS) expect(write.elements).toContainEqual(keep)
    expect(write.strokes[0]).toEqual(APP_STROKES[0])
    expect(write.elements.slice(0, BELVETH_ELEMENTS.length)).toEqual(BELVETH_ELEMENTS)
  })

  it('n\'invente pas de champ absent : un élément sans Order ni HasSmite reste sans', () => {
    const minimal = { Type: 2, X: 0.5, Y: 0.5 }
    expect(draftToWrite(rowToDraft(belvethRow({ elements: [minimal], strokes: [] }))).elements)
      .toEqual([minimal])
  })

  it('l\'empreinte d\'un path rouvert ne change pas tant qu\'on n\'édite rien', () => {
    const a = rowToDraft(belvethRow())
    const b = rowToDraft(belvethRow())
    expect(draftFingerprint(a)).toBe(draftFingerprint(b))
    expect(draftFingerprint({ ...a, name: 'autre' })).not.toBe(draftFingerprint(b))
  })
})

describe('lecture défensive — le JSONB arrive simplement casté', () => {
  it('écarte ce que l\'app ne saurait pas relire, garde le reste', () => {
    const raw = [
      { Type: 0, X: 0.1, Y: 0.1 },
      { Type: 'Ward', X: 0.5, Y: 0.5 },
      { Type: 1, X: '0.2', Y: 0.2 },
      { Type: 2.5, X: 0.1, Y: 0.1 },
      { Type: 2, X: 0.1, Y: 0.1, Label: null },
      { Type: 2, X: 0.1, Y: 0.1, HasSmite: 'true' },
      3, null, [],
      { Type: 7, X: 0.1, Y: 0.1 },
    ]
    expect(parseElements(raw)).toEqual([{ Type: 0, X: 0.1, Y: 0.1 }, { Type: 7, X: 0.1, Y: 0.1 }])
  })

  it('renvoie une liste vide pour autre chose qu\'un tableau', () => {
    expect(parseElements(null)).toEqual([])
    expect(parseElements({ Type: 0 })).toEqual([])
    expect(parseStrokes('[]')).toEqual([])
  })

  it('écarte un tracé sans Points ou avec un point mal formé', () => {
    expect(parseStrokes([
      { Points: [{ X: 0.1, Y: 0.1 }], Color: '#FF0000', Thickness: 3 },
      { Points: null },
      { Points: [{ X: 0.1 }] },
      { Points: [], Color: 3 },
    ])).toEqual([{ Points: [{ X: 0.1, Y: 0.1 }], Color: '#FF0000', Thickness: 3 }])
  })

  it('ramène un côté inconnu à Blue, valeur de l\'app par défaut', () => {
    expect(rowToDraft(belvethRow({ side: 'blue' })).side).toBe('Blue')
    expect(rowToDraft(belvethRow({ side: 'Red' })).side).toBe('Red')
  })

  it('n\'affiche pas les éléments Stroke ni les types inconnus, mais affiche les sorts', () => {
    const d = rowToDraft(belvethRow())
    expect(d.elements.filter(isDisplayable).map(e => e.Type)).not.toContain(5)
    expect(d.elements.filter(isDisplayable).map(e => e.Type)).not.toContain(42)
    expect(d.elements.filter(isDisplayable).map(e => e.Type)).toContain(6)
    expect(spellName(APP_ONLY_ELEMENTS[0].Label)).toBe('Flash')
    expect(spellName(undefined)).toBe('?')
  })
})

describe('positions des camps — copie figée de CampPositionService.EditorPositions', () => {
  /* Recopié de Logiciel-Assistant-LOL/Services/CampPositionService.cs le 2026-10-18.
     Si ce test casse, l'app et le site ne posent plus les camps au même endroit. */
  const APP: Record<string, [number, number, string]> = {
    BlueBuff_Blue: [0.25, 0.46, '#4FC3F7'], Gromp_Blue: [0.15, 0.43, '#81C784'],
    Wolves_Blue: [0.25, 0.56, '#90A4AE'], Raptors_Blue: [0.47, 0.64, '#FFB74D'],
    RedBuff_Blue: [0.52, 0.73, '#EF5350'], Krugs_Blue: [0.57, 0.83, '#A1887F'],
    Scuttler_Blue: [0.30, 0.35, '#4DD0E1'],
    BlueBuff_Red: [0.75, 0.54, '#4FC3F7'], Gromp_Red: [0.85, 0.57, '#81C784'],
    Wolves_Red: [0.74, 0.43, '#90A4AE'], Raptors_Red: [0.52, 0.35, '#FFB74D'],
    RedBuff_Red: [0.48, 0.26, '#EF5350'], Krugs_Red: [0.44, 0.17, '#A1887F'],
    Scuttler_Red: [0.72, 0.65, '#4DD0E1'],
  }

  it('a exactement les 14 camps de l\'app, aux mêmes positions et couleurs', () => {
    expect(Object.keys(CAMP_POSITIONS).sort()).toEqual(Object.keys(APP).sort())
    for (const [key, [x, y, color]] of Object.entries(APP)) {
      expect(CAMP_POSITIONS[key]).toEqual({ x, y, color })
    }
  })

  it('n\'a ni Dragon ni Baron (aucune position côté app)', () => {
    expect(Object.keys(CAMP_POSITIONS).some(k => /dragon|baron/i.test(k))).toBe(false)
  })

  it('dérive chaque clé de camp d\'une base × une équipe', () => {
    const keys = CAMP_BASES.flatMap(b => [campKey(b, 'Blue'), campKey(b, 'Red')])
    expect(keys.sort()).toEqual(Object.keys(CAMP_POSITIONS).sort())
    expect(campBaseOf('Gromp_Red')).toBe('Gromp')
    expect(campBaseOf('Gromp')).toBeNull()
    expect(campBaseOf('Dragon_Blue')).toBeNull()
  })
})

describe('conversion 0–100 % ↔ 0–1', () => {
  it('borne à [0, 1] et arrondit à 4 décimales ce que produit le site', () => {
    expect(toNormalized(50)).toBe(0.5)
    expect(toNormalized(12.345678)).toBe(0.1235)
    expect(toNormalized(-3)).toBe(0)
    expect(toNormalized(104)).toBe(1)
    expect(toNormalized(Number.NaN)).toBe(0)
    expect(round4(0.123449)).toBe(0.1234)
  })

  it('n\'applique aucune borne à l\'affichage', () => {
    expect(toPercent(1.02)).toBeCloseTo(102)
  })
})

describe('édition', () => {
  it('numérote les camps dans l\'ordre des clics, à partir de 1', () => {
    let els: PathElement[] = []
    els = toggleCamp(els, 'RedBuff_Blue')
    els = toggleCamp(els, 'Krugs_Blue')
    expect(els.map(e => [e.Label, e.Order])).toEqual([['RedBuff_Blue', 1], ['Krugs_Blue', 2]])
    expect(els[0]).toEqual({ Type: 0, Label: 'RedBuff_Blue', X: 0.52, Y: 0.73, Order: 1, HasSmite: false })
  })

  it('re-cliquer un camp bascule « à smiter » sans le dupliquer (comportement de l\'app)', () => {
    let els = toggleCamp([], 'Gromp_Blue')
    els = toggleCamp(els, 'Gromp_Blue')
    expect(els).toHaveLength(1)
    expect(els[0].HasSmite).toBe(true)
    expect(toggleCamp(els, 'Gromp_Blue')[0].HasSmite).toBe(false)
  })

  it('les placements restent à Order -1 et ne décalent pas la numérotation des camps', () => {
    let els = toggleCamp([], 'Gromp_Blue')
    els = addPlacement(els, 'Ward', 40, 60)
    els = toggleCamp(els, 'Wolves_Blue')
    expect(els[1]).toEqual({ Type: ELEMENT_TYPE.Ward, Label: 'Ward', X: 0.4, Y: 0.6, Order: -1, HasSmite: false })
    expect(els[2].Order).toBe(2)
  })

  it('pose un Type ENTIER pour chaque placement, jamais une chaîne', () => {
    for (const t of PLACEMENT_TYPES) {
      const [el] = addPlacement([], t, 10, 10)
      expect(el.Type).toBe(ELEMENT_TYPE[t])
      expect(typeof el.Type).toBe('number')
    }
  })

  it('retirer un camp renumérote les autres, sans toucher au reste', () => {
    const els = toggleCamp(toggleCamp(addPlacement(toggleCamp([], 'Gromp_Blue'), 'Smite', 5, 5), 'Wolves_Blue'), 'Krugs_Blue')
    const after = removeCamp(els, 'Gromp_Blue')
    expect(after.filter(e => e.Type === 0).map(e => [e.Label, e.Order])).toEqual([['Wolves_Blue', 1], ['Krugs_Blue', 2]])
    expect(after.find(e => e.Type === 1)).toEqual(els.find(e => e.Type === 1))
  })

  it('reprend la numérotation après le plus grand numéro (path de l\'app)', () => {
    expect(nextCampOrder(BELVETH_ELEMENTS)).toBe(9)
  })

  it('renuméroter un path déjà en ordre ne change aucun objet', () => {
    const els = parseElements(JSON.parse(JSON.stringify(BELVETH_ELEMENTS)))
    const after = renumberCamps(els)
    after.forEach((el, i) => expect(el).toBe(els[i]))
  })

  it('un tracé est borné, arrondi, en #RRGGBB et d\'épaisseur bornée', () => {
    const [s] = addStroke([], [{ x: -5, y: 33.333333 }, { x: 110, y: 50 }], '#e24b4a', 3)
    expect(s).toEqual({ Points: [{ X: 0, Y: 0.3333 }, { X: 1, Y: 0.5 }], Color: '#E24B4A', Thickness: 3 })
    expect(addStroke([], [{ x: 1, y: 1 }, { x: 2, y: 2 }], 'red', 0)[0]).toMatchObject({ Color: '#FF0000', Thickness: 1 })
    expect(addStroke([], [{ x: 1, y: 1 }], '#FF0000', 3)).toEqual([])
  })

  it('« Tout effacer » garde les sorts et les éléments inconnus de l\'app', () => {
    const els = parseElements(JSON.parse(JSON.stringify([...BELVETH_ELEMENTS, ...APP_ONLY_ELEMENTS])))
    expect(clearEditable(els)).toEqual(APP_ONLY_ELEMENTS)
  })

  it('la gomme retire l\'élément éditable le plus proche, puis renumérote', () => {
    const els = parseElements(JSON.parse(JSON.stringify(BELVETH_ELEMENTS)))
    const { elements } = eraseAt(els, [], 15, 43) // sur Gromp_Blue
    expect(elements.some(e => e.Label === 'Gromp_Blue')).toBe(false)
    expect(elements.filter(e => e.Type === 0).map(e => e.Order)).toEqual([1, 2, 3, 4, 5, 6, 7])
  })

  it('la gomme ne retire jamais un sort, et retombe sur le tracé le plus proche', () => {
    const els = parseElements(JSON.parse(JSON.stringify(APP_ONLY_ELEMENTS)))
    const strokes = [{ Points: [{ X: 0.4, Y: 0.5 }, { X: 0.41, Y: 0.5 }], Color: '#FF0000', Thickness: 3 }]
    const r = eraseAt(els, strokes, 40, 50)
    expect(r.elements).toEqual(APP_ONLY_ELEMENTS)
    expect(r.strokes).toEqual([])
  })

  it('la gomme loin de tout ne retire rien', () => {
    const r = eraseAt(BELVETH_ELEMENTS, APP_STROKES, 99, 1)
    expect(r.elements).toEqual(BELVETH_ELEMENTS)
    expect(r.strokes).toEqual(APP_STROKES)
  })

  it('un path neuf est vierge, jusqu\'à la première saisie', () => {
    const d = emptyDraft('id')
    expect(isBlankDraft(d)).toBe(true)
    expect(isBlankDraft({ ...d, elements: toggleCamp([], 'Gromp_Blue') })).toBe(false)
    expect(isBlankDraft({ ...d, name: '  ' })).toBe(true)
  })
})

describe('écritures vérifiées — rien n\'est silencieux', () => {
  it('0 ligne renvoyée sans erreur = échec (RLS ou ligne disparue)', () => {
    expect(writeErrorKey(null, 0, 'save')).toBe('notSaved')
    expect(writeErrorKey(null, 0, 'delete')).toBe('notDeleted')
    expect(writeErrorKey(null, 1, 'save')).toBeNull()
  })

  it('traduit les codes Postgres attendus', () => {
    expect(writeErrorKey({ code: '42501' }, 0, 'save')).toBe('forbidden')
    expect(writeErrorKey({ code: '23514' }, 0, 'save')).toBe('invalid')
    expect(writeErrorKey({ code: '23505' }, 0, 'save')).toBe('conflict')
    expect(writeErrorKey({ code: 'PGRST301' }, 0, 'save')).toBe('generic')
    expect(writeErrorKey({ code: '', message: 'TypeError: Failed to fetch' }, 0, 'save')).toBe('network')
  })
})
