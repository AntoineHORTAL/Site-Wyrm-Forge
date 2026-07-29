import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  parseChampions, parseSummonerSpells, parseRunes,
  champImg, itemImg, spellImg, runeImg, profileIconImg,
  loadDDragonMaps, clearDDragonMapsCache,
} from './ddragon'

// Extraits réels, réduits, des fichiers DDragon fr_FR.
const CHAMPION_JSON = {
  type: 'champion',
  data: {
    Ahri: { key: '103', id: 'Ahri', name: 'Ahri', image: { full: 'Ahri.png' } },
    Zed: { key: '238', id: 'Zed', name: 'Zed', image: { full: 'Zed.png' } },
  },
}
const SUMMONER_JSON = {
  data: {
    SummonerFlash: { key: '4', id: 'SummonerFlash', name: 'Saut éclair', image: { full: 'SummonerFlash.png' } },
    SummonerTeleport: { key: '12', id: 'SummonerTeleport', name: 'Téléportation', image: { full: 'SummonerTeleport.png' } },
  },
}
const RUNES_JSON = [
  {
    id: 8100, name: 'Domination', icon: 'perk-images/Styles/7200_Domination.png',
    slots: [{ runes: [{ id: 8112, name: 'Électrocution', icon: 'perk-images/Styles/Domination/Electrocute/Electrocute.png' }] }],
  },
  {
    id: 8300, name: 'Inspiration', icon: 'perk-images/Styles/7203_Whimsy.png',
    slots: [{ runes: [{ id: 8351, name: 'Rupture glaciale', icon: 'perk-images/Styles/Inspiration/GlacialAugment/GlacialAugment.png' }] }],
  },
]

describe('parseChampions', () => {
  it('indexe par `key` numérique, pas par `id` texte', () => {
    const m = parseChampions(CHAMPION_JSON)
    // Piège classique : `id` vaut "Ahri", `key` vaut 103 — c'est `key` que
    // l'API Riot renvoie dans championId.
    expect(m[103]).toEqual({ id: 'Ahri', name: 'Ahri', image: 'Ahri.png' })
    expect(m[238].name).toBe('Zed')
    expect(Object.keys(m)).toHaveLength(2)
  })
  it('tolère une entrée vide / malformée sans throw', () => {
    expect(parseChampions(null)).toEqual({})
    expect(parseChampions({})).toEqual({})
    expect(parseChampions({ data: { X: { key: 'nope', id: 'X' } } })).toEqual({})
  })
  it('image manquante → chaîne vide, pas undefined', () => {
    const m = parseChampions({ data: { X: { key: '1', id: 'X', name: 'X' } } })
    expect(m[1].image).toBe('')
  })
})

describe('parseSummonerSpells', () => {
  it('indexe par id de sort', () => {
    const m = parseSummonerSpells(SUMMONER_JSON)
    expect(m[4].name).toBe('Saut éclair')
    expect(m[12].image).toBe('SummonerTeleport.png')
  })
  it('tolère une entrée malformée', () => {
    expect(parseSummonerSpells(undefined)).toEqual({})
  })
})

describe('parseRunes', () => {
  it('aplatit arbres ET runes dans le même index', () => {
    const m = parseRunes(RUNES_JSON)
    // perkSubStyle désigne un arbre (8300), perkIds[0] une rune (8112) :
    // les deux doivent être résolubles depuis la même carte.
    expect(m[8100].name).toBe('Domination')
    expect(m[8300].name).toBe('Inspiration')
    expect(m[8112].name).toBe('Électrocution')
    expect(m[8351].name).toBe('Rupture glaciale')
  })
  it('tolère slots/runes absents et entrée non-tableau', () => {
    expect(parseRunes({})).toEqual({})
    expect(parseRunes([{ id: 1, name: 'T', icon: 'i.png' }])).toEqual({
      1: { id: 1, name: 'T', icon: 'i.png' },
    })
  })
})

describe('URLs d’images', () => {
  it('construisent les chemins DDragon attendus', () => {
    const B = 'https://ddragon.leagueoflegends.com'
    expect(champImg('15.1.1', 'Ahri.png')).toBe(`${B}/cdn/15.1.1/img/champion/Ahri.png`)
    expect(itemImg('15.1.1', 3153)).toBe(`${B}/cdn/15.1.1/img/item/3153.png`)
    expect(spellImg('15.1.1', 'SummonerFlash.png')).toBe(`${B}/cdn/15.1.1/img/spell/SummonerFlash.png`)
    // Les runes n'ont PAS de segment de version — chemin déjà complet.
    expect(runeImg('perk-images/Styles/7200_Domination.png'))
      .toBe(`${B}/cdn/img/perk-images/Styles/7200_Domination.png`)
    expect(profileIconImg('15.1.1', 29)).toBe(`${B}/cdn/15.1.1/img/profileicon/29.png`)
  })
})

describe('loadDDragonMaps — mémoïsation', () => {
  afterEach(() => { clearDDragonMapsCache(); vi.unstubAllGlobals() })

  const stubDD = () => {
    const calls = { n: 0 }
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      calls.n++
      const body =
        url.includes('versions.json') ? ['15.1.1', '15.0.1'] :
        url.includes('champion.json') ? CHAMPION_JSON :
        url.includes('summoner.json') ? SUMMONER_JSON :
        RUNES_JSON
      return new Response(JSON.stringify(body), { status: 200 })
    }))
    return calls
  }

  it('charge version + les trois cartes', async () => {
    stubDD()
    const m = await loadDDragonMaps()
    expect(m.version).toBe('15.1.1')     // toujours versions[0]
    expect(m.champs[103].name).toBe('Ahri')
    expect(m.spells[4].name).toBe('Saut éclair')
    expect(m.runes[8112].name).toBe('Électrocution')
  })

  it('un seul aller-retour réseau, même sur plusieurs appels', async () => {
    const calls = stubDD()
    await loadDDragonMaps()
    const after1 = calls.n
    await loadDDragonMaps()
    await loadDDragonMaps()
    expect(calls.n).toBe(after1)   // servi depuis le cache module
    expect(after1).toBe(4)         // versions + champion + summoner + runes
  })

  it('déduplique les appels CONCURRENTS (une seule salve)', async () => {
    const calls = stubDD()
    const [a, b] = await Promise.all([loadDDragonMaps(), loadDDragonMaps()])
    expect(calls.n).toBe(4)
    expect(a).toBe(b)   // même objet, pas deux chargements parallèles
  })

  it('un échec ne fige pas une promesse rejetée pour la session', async () => {
    let fail = true
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (fail) throw new TypeError('offline')
      const body =
        url.includes('versions.json') ? ['15.1.1'] :
        url.includes('champion.json') ? CHAMPION_JSON :
        url.includes('summoner.json') ? SUMMONER_JSON :
        RUNES_JSON
      return new Response(JSON.stringify(body), { status: 200 })
    }))

    await expect(loadDDragonMaps()).rejects.toThrow()
    fail = false
    // Le retry doit repartir, pas resservir l'échec mémorisé.
    await expect(loadDDragonMaps()).resolves.toMatchObject({ version: '15.1.1' })
  })
})
