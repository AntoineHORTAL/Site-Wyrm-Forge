import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { GUIDE_ENTRY_IDS, type GuideEntryId } from './guide'
import { guideShotAlt, guideShotIds, guideShots } from './guide-shots'
import { guideDicts } from '../locales/guide'
import { webpSize } from '../../scripts/webp-size.mjs'

const DIR = join(process.cwd(), 'public', 'guide')
const onDisk = existsSync(DIR) ? readdirSync(DIR).filter(f => f.endsWith('.webp')).sort() : []

describe('manifeste des captures (guide-shots.generated.json)', () => {
  it('🔴 correspond exactement aux fichiers de public/guide — sinon relancer `node scripts/guide-shots.mjs`', () => {
    const listed = guideShotIds().flatMap(id => guideShots(id as GuideEntryId).map(s => s.src)).sort()
    expect(listed).toEqual(onDisk.map(f => `/guide/${f}`))
  })

  it('les dimensions du manifeste sont celles des fichiers', () => {
    for (const id of guideShotIds()) {
      for (const s of guideShots(id as GuideEntryId)) {
        const real = webpSize(readFileSync(join(process.cwd(), 'public', s.src)), s.src)
        expect({ width: s.width, height: s.height }, s.src).toEqual(real)
      }
    }
  })

  it('chaque fichier désigne une sous-section existante', () => {
    for (const id of guideShotIds()) expect(GUIDE_ENTRY_IDS as readonly string[]).toContain(id)
  })

  it('ordre : <id>.webp d’abord, puis -1, -2… numériquement', () => {
    for (const id of guideShotIds()) {
      const order = guideShots(id as GuideEntryId).map(s => {
        const m = /-(\d+)\.webp$/.exec(s.src.slice(`/guide/${id}`.length))
        return m ? Number(m[1]) : 0
      })
      expect(order, id).toEqual([...order].sort((a, b) => a - b))
    }
  })

  it('aucune capture plus large que 1600 px', () => {
    for (const id of guideShotIds()) {
      for (const s of guideShots(id as GuideEntryId)) expect(s.width, s.src).toBeLessThanOrEqual(1600)
    }
  })
})

describe('texte alternatif', () => {
  it('shotAlts : même nombre en FR et en EN, aucun vide', () => {
    for (const id of GUIDE_ENTRY_IDS) {
      const fr = guideDicts.fr.entries[id].shotAlts ?? []
      const en = guideDicts.en.entries[id].shotAlts ?? []
      expect(en.length, id).toBe(fr.length)
      for (const a of [...fr, ...en]) expect(a.trim(), id).not.toBe('')
    }
  })

  it('chaque capture publiée a un texte alternatif non vide, dans les deux langues', () => {
    for (const id of guideShotIds() as GuideEntryId[]) {
      const n = guideShots(id).length
      for (const lang of ['fr', 'en'] as const) {
        for (let i = 0; i < n; i++) expect(guideShotAlt(guideDicts[lang].entries[id], i, n).trim()).not.toBe('')
      }
    }
  })

  it('repli : description seule, ou numérotée quand il y a plusieurs captures', () => {
    const t = { screenshot: 'Desc' }
    expect(guideShotAlt(t, 0, 1)).toBe('Desc')
    expect(guideShotAlt(t, 1, 2)).toBe('Desc (2/2)')
    expect(guideShotAlt({ ...t, shotAlts: ['Propre'] }, 0, 2)).toBe('Propre')
    expect(guideShotAlt({ ...t, shotAlts: ['Propre'] }, 1, 2)).toBe('Desc (2/2)')
  })
})
