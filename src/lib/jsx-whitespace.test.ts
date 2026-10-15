import { describe, it, expect, beforeAll } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import ts from 'typescript'

/**
 * Espaces JSX supprimés par SWC (constaté sur Next 16.2.4, le 2026-10-15).
 *
 * Un texte JSX qui s'étend sur plusieurs lignes ET contient une entité HTML
 * (`&apos;`, `&quot;`…) perd son espace de TÊTE à la compilation SWC :
 *   `La <strong>difficulté</strong> est … l&apos;exigence\n…`  →  « La difficultéest »
 * Babel, esbuild et la règle JSX gardent cet espace : le défaut n'existe QUE dans
 * le build Next. 49 phrases étaient touchées (/champions, CGU, CGV,
 * confidentialité, /match), corrigées en remplaçant `&apos;` par ’ et `&quot;`
 * par “ ”.
 *
 * ⚠️ Pourquoi ce test compile avec le SWC de Next au lieu de rendre les pages :
 * vitest transforme le JSX avec esbuild, qui n'a pas le défaut — un test de
 * rendu passerait même si le bug revenait.
 */

const ROOT = process.cwd()
const ENTITY = /&(#x[0-9a-f]+|#\d+|[a-z]+);/i

type Swc = {
  loadBindings: () => Promise<unknown>
  transform: (src: string, opts: object) => Promise<{ code: string }>
}
let swc: Swc

beforeAll(async () => {
  swc = (await import('next/dist/build/swc')) as unknown as Swc
  await swc.loadBindings()
}, 60_000)

async function compile(src: string, filename = 'x.tsx'): Promise<string> {
  const out = await swc.transform(src, {
    filename,
    jsc: { parser: { syntax: 'typescript', tsx: true }, target: 'es2022', transform: { react: { runtime: 'automatic' } } },
  })
  return out.code
}

/** Valeurs de toutes les chaînes littérales d'un code compilé. */
function literals(code: string): string[] {
  const sf = ts.createSourceFile('o.js', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
  const vals: string[] = []
  const visit = (n: ts.Node) => {
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) vals.push(n.text)
    ts.forEachChild(n, visit)
  }
  visit(sf)
  return vals
}

describe('phrases connues, compilées par le SWC de Next', () => {
  // [fichier, début attendu d'un texte JSX — l'espace de tête EST le sujet du test]
  const KNOWN: [string, string][] = [
    ['src/app/champions/page.tsx', ' au total : combattant'],             // « 6 au total »
    ['src/app/champions/page.tsx', ' est la note que Riot attribue'],     // « La difficulté est »
    ['src/locales/legal/confidentialite.tsx', ' — hébergement de la base de données'], // « Supabase — hébergement »
    ['src/locales/legal/confidentialite.tsx', ' — your rights of access'],
    ['src/locales/legal/subscription.tsx', ' pour Maître.'],              // « 135 pour Maître »
    ['src/locales/legal/cgu.tsx', ' Les points ci-dessus'],               // « payant. Les points »
  ]

  it.each(KNOWN)('%s garde l’espace de « %s »', async (file, start) => {
    const lits = literals(await compile(readFileSync(join(ROOT, file), 'utf8'), file))
    const core = start.trimStart()
    const found = lits.filter(l => l.trimStart().startsWith(core))
    expect(found.length, `texte introuvable : ${core}`).toBeGreaterThan(0)
    expect(found.every(l => l.startsWith(start)), `espace de tête perdu : ${JSON.stringify(found[0]?.slice(0, 40))}`).toBe(true)
  })
})

describe('garde statique — aucun texte JSX exposé au défaut', () => {
  function tsxFiles(dir: string, out: string[] = []): string[] {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name)
      if (e.isDirectory()) tsxFiles(p, out)
      else if (e.name.endsWith('.tsx') && !e.name.endsWith('.test.tsx')) out.push(p)
    }
    return out
  }

  it('pas de texte JSX multi-lignes, avec entité HTML, qui commence par un espace', () => {
    const bad: string[] = []
    for (const file of tsxFiles(join(ROOT, 'src'))) {
      const src = readFileSync(file, 'utf8')
      if (!ENTITY.test(src)) continue
      const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
      const visit = (n: ts.Node) => {
        if (n.kind === ts.SyntaxKind.JsxText) {
          const raw = src.slice(n.pos, n.end)
          const firstLine = raw.split(/\r?\n/)[0]
          // Espace de tête significatif = première ligne qui commence par un
          // espace ET porte du texte (une ligne vide est retirée par la règle JSX).
          if (ENTITY.test(raw) && /\n/.test(raw) && /^[ \t]+\S/.test(firstLine)) {
            bad.push(`${relative(ROOT, file)}:${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1}`)
          }
        }
        ts.forEachChild(n, visit)
      }
      visit(sf)
    }
    // Correction : remplacer l'entité par le caractère (’, “ ”, «…), ou poser un {' '}.
    expect(bad).toEqual([])
  })
})

describe('témoin du compilateur', () => {
  it('SWC supprime encore l’espace de tête d’un texte multi-lignes avec entité', async () => {
    // Si ce test ÉCHOUE, c'est que Next/SWC a corrigé le défaut : la garde statique
    // ci-dessus peut alors être assouplie. Le témoin sans entité doit, lui, toujours
    // garder l'espace.
    const withEntity = literals(await compile('const a = <p>La <b>x</b> est l&apos;a\n  suite</p>'))
    const withoutEntity = literals(await compile('const a = <p>La <b>x</b> est l’a\n  suite</p>'))
    expect(withoutEntity).toContain(' est l’a suite')
    expect(withEntity).toContain("est l'a suite")
  })
})
