import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { loadDDragon, clearDDragonCache } from './ddragon'

// Fixtures minimales au format DDragon réel.
const VERSIONS = ['14.24.1', '14.23.1']
const CHAMPS = {
  data: {
    Ahri:  { id: 'Ahri',  name: 'Ahri',  image: { full: 'Ahri.png' },  stats: { hp: 590, hpperlevel: 96, attackdamage: 53 } },
    Aatrox:{ id: 'Aatrox',name: 'Aatrox',image: { full: 'Aatrox.png' },stats: { hp: 650, hpperlevel: 114 } },
  },
}
const ITEMS = {
  data: {
    '1001': { name: 'Bottes',      image: { full: '1001.png' }, gold: { total: 300, purchasable: true },  tags: ['Boots'],  maps: { '11': true },  stats: { FlatMovementSpeedMod: 25 } },
    '3006': { name: 'Guerriers',   image: { full: '3006.png' }, gold: { total: 1100, purchasable: true }, tags: ['Boots'],  maps: { '11': true },  stats: {} },
    '9999': { name: 'ARAM only',   image: { full: '9999.png' }, gold: { total: 500, purchasable: true },  tags: [],         maps: { '12': true },  stats: {} }, // hors Faille → exclu
    '0000': { name: 'Non vendable',image: { full: '0000.png' }, gold: { total: 0, purchasable: false },   tags: [],         maps: { '11': true },  stats: {} }, // non achetable → exclu
  },
}

function mockFetch() {
  return vi.fn((url: string) => {
    const body = url.includes('versions.json') ? VERSIONS
      : url.includes('champion.json') ? CHAMPS
      : url.includes('item.json') ? ITEMS
      : {}
    return Promise.resolve({ json: () => Promise.resolve(body) } as Response)
  })
}

beforeEach(() => { clearDDragonCache(); globalThis.fetch = mockFetch() as unknown as typeof fetch })
afterEach(()  => { clearDDragonCache(); vi.restoreAllMocks() })

describe('loadDDragon', () => {
  it('prend la version la plus récente (versions[0])', async () => {
    const d = await loadDDragon()
    expect(d.version).toBe('14.24.1')
  })

  it('mappe les champions avec leurs stats (base + perlevel), triés par nom', async () => {
    const d = await loadDDragon()
    expect(d.champs.map(c => c.id)).toEqual(['Aatrox', 'Ahri'])   // tri alpha
    const ahri = d.champs.find(c => c.id === 'Ahri')!
    expect(ahri.image).toBe('Ahri.png')
    expect(ahri.stats.hp).toBe(590)
    expect(ahri.stats.hpperlevel).toBe(96)
  })

  it('ne garde que les items Faille (map 11) achetables', async () => {
    const d = await loadDDragon()
    const ids = d.items.map(i => i.id)
    expect(ids).toContain('1001')
    expect(ids).toContain('3006')
    expect(ids).not.toContain('9999')  // ARAM only
    expect(ids).not.toContain('0000')  // non achetable
  })

  it('mémoïse (2e appel = aucun fetch supplémentaire)', async () => {
    await loadDDragon()
    const callsAfterFirst = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length
    await loadDDragon()
    expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callsAfterFirst)
  })
})
