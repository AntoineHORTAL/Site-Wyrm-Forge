import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import {
  RIFT_MAP_LOCAL, RIFT_MAP_DDRAGON_VERSION, RIFT_MAP_FALLBACK, applyRiftMapFallback,
} from './rift-map'

/**
 * Fond de carte de la Faille — source unique du site.
 *
 * Ce que ces tests protègent : trois composants recopiaient chacun leur URL et leurs
 * replis (DDragon 14.24.1, puis une URL sans version qui répondait 403), et la doc
 * affirmait que l'image locale était absente alors qu'elle était servie depuis mai.
 */

const SRC = join(process.cwd(), 'src')

function allSourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) return allSourceFiles(p)
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [p] : []
  })
}

describe('rift-map', () => {
  it('le repli DDragon est figé sur une version précise', () => {
    expect(RIFT_MAP_DDRAGON_VERSION).toBe('16.20.1')
    expect(RIFT_MAP_FALLBACK).toBe('https://ddragon.leagueoflegends.com/cdn/16.20.1/img/map/map11.png')
  })

  it("l'image locale existe et fait 512×512 (DDragon map11 16.20.1)", () => {
    const png = readFileSync(join(process.cwd(), 'public', RIFT_MAP_LOCAL))
    // En-tête PNG : signature (8 octets), puis bloc IHDR — largeur et hauteur en big-endian.
    expect(png.subarray(1, 4).toString('ascii')).toBe('PNG')
    expect(png.readUInt32BE(16)).toBe(512)
    expect(png.readUInt32BE(20)).toBe(512)
  })

  it("aucun autre fichier ne définit d'URL de carte : une seule source", () => {
    const fautifs = allSourceFiles(SRC)
      .filter(f => !f.endsWith(join('lib', 'rift-map.ts')))
      .filter(f => /img\/map\/map11|summoners_rift\.png/.test(readFileSync(f, 'utf8')))
    expect(fautifs).toEqual([])
  })

  it("bascule une seule fois de l'image locale vers DDragon, sans boucle", () => {
    const img = { src: `https://wyrm-forge.com${RIFT_MAP_LOCAL}` } as HTMLImageElement
    applyRiftMapFallback(img)
    expect(img.src).toBe(RIFT_MAP_FALLBACK)
    applyRiftMapFallback(img)  // le repli échoue à son tour : on n'y touche plus
    expect(img.src).toBe(RIFT_MAP_FALLBACK)
  })
})
