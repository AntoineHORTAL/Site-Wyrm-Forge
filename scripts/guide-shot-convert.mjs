// ════════════════════════════════════════════════════════════════════════════
//  Conversion d'une capture du guide — PNG source → public/guide/<nom>.webp
// ════════════════════════════════════════════════════════════════════════════
// WebP qualité 85, largeur max 1600 px, jamais d'agrandissement. La source n'est
// ni modifiée ni déplacée. Recadrage optionnel AVANT redimensionnement, en pixels
// de la source : --crop=gauche,haut,largeur,hauteur.
//
// Usage :
//   node scripts/guide-shot-convert.mjs "<source.png>" <id>-<N> [--crop=x,y,w,h]
// puis `node scripts/guide-shots.mjs` (ou simplement `npm run dev` / `build`).

import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const [src, name, ...opts] = process.argv.slice(2)
if (!src || !name || !/^[a-z0-9-]+$/.test(name)) {
  console.error('Usage : node scripts/guide-shot-convert.mjs "<source.png>" <id>-<N> [--crop=x,y,w,h]')
  process.exit(1)
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dest = join(root, 'public', 'guide', `${name}.webp`)

let img = sharp(src)
const crop = opts.find(o => o.startsWith('--crop='))
if (crop) {
  const [left, top, width, height] = crop.slice(7).split(',').map(Number)
  img = img.extract({ left, top, width, height })
}

const info = await img
  .resize({ width: 1600, withoutEnlargement: true })
  .webp({ quality: 85 })
  .toFile(dest)

console.log(`${name}.webp : ${info.width}×${info.height}, ${(info.size / 1024).toFixed(0)} Ko`)
