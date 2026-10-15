// ════════════════════════════════════════════════════════════════════════════
//  Manifeste des captures du guide — `public/guide/*.webp` → JSON
// ════════════════════════════════════════════════════════════════════════════
// Lancé par `predev` et `prebuild` : ajouter une capture = DÉPOSER le fichier
// dans `public/guide/`, rien d'autre. Le build suivant la découvre.
//
// Convention de nommage (ancre = id de sous-section, `GUIDE_ENTRY_IDS`) :
//   <id>.webp            capture unique (affichée en premier si des -N existent)
//   <id>-1.webp, -2 …    captures multiples, dans l'ordre de N
//
// Pourquoi un manifeste plutôt qu'un `readdir` dans la page : `/guide` est rendue
// par une fonction serveur, et sur Vercel les fichiers de `public/` ne sont pas
// garantis dans son système de fichiers. Les DIMENSIONS sont aussi lues ici —
// `width`/`height` sur `<img>` réservent la place avant le chargement (pas de CLS).
//
// Le JSON est COMMITÉ : les tests et `tsc` le lisent sans lancer ce script.
// `guide-shots.test.ts` échoue s'il ne correspond plus au dossier.
//
// Usage : node scripts/guide-shots.mjs

import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { webpSize } from './webp-size.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dir = join(root, 'public', 'guide')
const out = join(root, 'src', 'lib', 'guide-shots.generated.json')

const NAME = /^([a-z0-9]+(?:-[a-z0-9]+)*?)(?:-(\d+))?\.webp$/

const files = existsSync(dir) ? readdirSync(dir).filter(f => f.endsWith('.webp')).sort() : []
const byId = {}

for (const file of files) {
  const m = NAME.exec(file)
  if (!m) {
    console.warn(`guide-shots : nom ignoré (attendu <id>.webp ou <id>-N.webp) : ${file}`)
    continue
  }
  const [, id, n] = m
  const { width, height } = webpSize(readFileSync(join(dir, file)), file)
  ;(byId[id] ??= []).push({ src: `/guide/${file}`, width, height, order: n ? Number(n) : 0 })
}

const manifest = {}
for (const id of Object.keys(byId).sort()) {
  manifest[id] = byId[id]
    .sort((a, b) => a.order - b.order)
    .map(({ src, width, height }) => ({ src, width, height }))
}

writeFileSync(out, JSON.stringify(manifest, null, 2) + '\n')
console.log(`guide-shots : ${files.length} capture(s), ${Object.keys(manifest).length} sous-section(s)`)
