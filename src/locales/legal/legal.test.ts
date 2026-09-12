import { describe, it, expect } from 'vitest'
import { isValidElement, type ReactNode } from 'react'
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { legalFr, legalEn, LEGAL_DOCUMENTS, type LegalDocument } from './index'
import { legalShellFr, legalShellEn } from './shell'
import { subscriptionFr, subscriptionEn } from './subscription'
import { Todo } from '@/components/legal/LegalBlocks'

/**
 * Traduction EN du dossier légal — ce que le typage ne peut PAS garantir.
 *
 * `typeof legalFr` force déjà `legalEn` à porter les mêmes clés : une section
 * oubliée ne compile pas. Restent trois façons de livrer une traduction fausse
 * qui compile parfaitement, et ce sont elles qui sont vérifiées ici :
 *
 *  1. une section EN laissée en français (copier-coller de la source) ;
 *  2. un trou `<Todo>` signalé en français mais pas en anglais — le lecteur
 *     anglophone croirait le document complet (art. 6 Rome I : il doit avoir eu
 *     accès aux MÊMES conditions, pas à une version plus flatteuse) ;
 *  3. deux dates de mise à jour différentes selon la langue, alors qu'une seule
 *     version est enregistrée avec la preuve de consentement.
 *
 * S'y ajoute la condition d'usage : le sélecteur de langue doit être ATTEIGNABLE
 * depuis ces pages, sinon un visiteur arrivé en anglais ne peut pas en sortir.
 */

/* ════════════════════════════════════════════════════════════════════════════
   Outils — parcours d'un arbre React sans jsdom
   ════════════════════════════════════════════════════════════════════════════ */

/** Compte les badges `<Todo>` d'un arbre de nœuds, fragments compris. */
function countTodos(node: ReactNode): number {
  if (Array.isArray(node)) return node.reduce<number>((n, c) => n + countTodos(c), 0)
  if (!isValidElement(node)) return 0
  const self = node.type === Todo ? 1 : 0
  const props = node.props as { children?: ReactNode }
  return self + countTodos(props.children)
}

/** Chemins de toutes les feuilles d'un objet de dictionnaire (`a.b.c`). */
function leafPaths(value: unknown, prefix = '', out: string[] = []): string[] {
  const isPlainObject =
    typeof value === 'object' && value !== null
    && !Array.isArray(value) && !isValidElement(value)
  if (!isPlainObject) {
    out.push(prefix)
    return out
  }
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    leafPaths(v, prefix ? `${prefix}.${k}` : k, out)
  }
  return out
}

const documents = LEGAL_DOCUMENTS.map(name => ({
  name,
  fr: legalFr[name],
  en: legalEn[name],
}))

/* ════════════════════════════════════════════════════════════════════════════
   Parité de structure
   ════════════════════════════════════════════════════════════════════════════ */

describe('dossier légal — parité FR / EN', () => {
  it('expose exactement les mêmes clés dans les deux langues', () => {
    // Le typage le garantit à la compilation ; ce test attrape le cas où
    // quelqu'un contourne le type (`as`, `any`) pour livrer plus vite.
    expect(leafPaths(legalEn).sort()).toEqual(leafPaths(legalFr).sort())
  })

  it('couvre les quatre documents du dossier', () => {
    expect(LEGAL_DOCUMENTS).toEqual(['mentions', 'confidentialite', 'cgu', 'cgv'])
  })

  it.each(documents)('$name — même date de mise à jour, au format ISO', ({ fr, en }) => {
    // ISO et non « 11 septembre 2026 » : c'est `LegalPage` qui la formate dans
    // la langue lue. Deux chaînes rédigées finiraient par diverger.
    expect(fr.updated).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(en.updated).toBe(fr.updated)
  })

  it.each(documents)('$name — aucune section vide, dans aucune des deux langues', ({ fr, en }) => {
    const sections = Object.keys(fr.sections) as (keyof typeof fr.sections)[]
    expect(sections.length).toBeGreaterThan(0)
    for (const key of sections) {
      for (const [lang, dict] of [['fr', fr], ['en', en]] as const) {
        const section = (dict.sections as Record<string, { title: string; body: ReactNode }>)[key]
        expect(section, `${lang}.${String(key)}`).toBeDefined()
        expect(section.title.trim(), `${lang}.${String(key)}.title`).not.toBe('')
        expect(section.body, `${lang}.${String(key)}.body`).toBeTruthy()
      }
    }
  })
})

/* ════════════════════════════════════════════════════════════════════════════
   Le contenu EN est bien traduit
   ════════════════════════════════════════════════════════════════════════════ */

describe('dossier légal — le contenu anglais est traduit', () => {
  it.each(documents)('$name — aucun titre de section identique au français', ({ name, fr, en }) => {
    // Le symptôme d'un copier-coller non traduit. Si un titre devait un jour
    // être légitimement identique dans les deux langues, l'exception se déclare
    // ici explicitement plutôt que de désarmer le test.
    const sections = Object.keys(fr.sections) as (keyof typeof fr.sections)[]
    for (const key of sections) {
      const frTitle = (fr.sections as Record<string, { title: string }>)[key].title
      const enTitle = (en.sections as Record<string, { title: string }>)[key].title
      expect(enTitle, `${name}.${String(key)} — titre resté en français`).not.toBe(frTitle)
    }
  })

  it.each(documents)('$name — titre et chapô traduits', ({ fr, en }) => {
    expect(en.title).not.toBe(fr.title)
    expect(en.intro).not.toBe(fr.intro)
  })
})

/* ════════════════════════════════════════════════════════════════════════════
   Les trous restent visibles dans LES DEUX langues
   ════════════════════════════════════════════════════════════════════════════ */

describe('dossier légal — informations manquantes signalées dans les deux langues', () => {
  it.each(documents)('$name — autant de badges « à compléter » en EN qu’en FR', ({ fr, en }) => {
    const sections = Object.keys(fr.sections) as (keyof typeof fr.sections)[]
    for (const key of sections) {
      const frBody = (fr.sections as Record<string, { body: ReactNode }>)[key].body
      const enBody = (en.sections as Record<string, { body: ReactNode }>)[key].body
      expect(countTodos(enBody), `${String(key)} — trous manquants côté EN`)
        .toBe(countTodos(frBody))
    }
  })

  it('clauses d’abonnement partagées — mêmes trous dans les deux langues', () => {
    // `PaymentTerms` porte deux `<Todo>` (régime de TVA, reçus Stripe) : ils
    // doivent être visibles pour l'abonné anglophone comme pour le français.
    const keys = Object.keys(subscriptionFr) as (keyof typeof subscriptionFr)[]
    for (const key of keys) {
      const fr = subscriptionFr[key]
      const en = subscriptionEn[key]
      // Les clauses à montant sont des fonctions : on les évalue avec des prix
      // factices pour atteindre leur arbre.
      const frNode = typeof fr === 'function' ? fr('3 €', '30 €') : (fr as ReactNode)
      const enNode = typeof en === 'function' ? en('€3', '€30') : (en as ReactNode)
      expect(countTodos(enNode), `subscription.${String(key)}`).toBe(countTodos(frNode))
    }
  })

  it('le préfixe des badges garde le nom propre, dans les deux langues', () => {
    // `grep -rn HORTAL src` doit lister tout ce qui reste à renseigner, quelle
    // que soit la langue du badge.
    expect(legalShellFr.todoPrefix).toContain('HORTAL')
    expect(legalShellEn.todoPrefix).toContain('HORTAL')
    expect(legalShellEn.todoPrefix).not.toBe(legalShellFr.todoPrefix)
  })
})

/* ════════════════════════════════════════════════════════════════════════════
   Coquille partagée
   ════════════════════════════════════════════════════════════════════════════ */

describe('coquille des pages légales', () => {
  it('porte un libellé de navigation par document', () => {
    expect(legalShellFr.navLabels).toHaveLength(LEGAL_DOCUMENTS.length)
    expect(legalShellEn.navLabels).toHaveLength(LEGAL_DOCUMENTS.length)
    expect(legalShellEn.navLabels).not.toEqual(legalShellFr.navLabels)
  })

  it('n’affiche la note de traduction qu’en anglais', () => {
    // Le lecteur anglophone doit savoir qu'il lit la traduction d'un document
    // rédigé en français. En français, la note n'aurait aucun sens.
    expect(legalShellFr.translationNotice).toBe('')
    expect(legalShellEn.translationNotice.length).toBeGreaterThan(0)
  })
})

/* ════════════════════════════════════════════════════════════════════════════
   Le sélecteur de langue est atteignable depuis ces pages
   ════════════════════════════════════════════════════════════════════════════ */

describe('accès au sélecteur de langue depuis les pages légales', () => {
  const HEADER = readFileSync(
    path.resolve(__dirname, '../../components/nav/SiteHeader.tsx'), 'utf8',
  )

  it('le header de site n’est masqué sur aucune route légale', () => {
    // Les pages légales n'ont pas de bascule FR/EN à elles : elle vit dans
    // `Nav`, monté par `SiteHeader`. Ajouter une route légale à
    // `HEADERLESS_PREFIXES` enfermerait un visiteur arrivé en anglais dans un
    // document qu'il ne peut plus changer de langue.
    const declaration = HEADER.match(/HEADERLESS_PREFIXES[^=]*=\s*\[([^\]]*)\]/)
    expect(declaration, 'HEADERLESS_PREFIXES introuvable dans SiteHeader.tsx').not.toBeNull()
    const routes: Record<LegalDocument, string> = {
      mentions: '/mentions-legales',
      confidentialite: '/confidentialite',
      cgu: '/cgu',
      cgv: '/cgv',
    }
    for (const route of Object.values(routes)) {
      expect(declaration![1]).not.toContain(route)
    }
  })

  it('SiteHeader rend bien la barre qui porte la bascule', () => {
    expect(HEADER).toContain('<Nav')
  })
})
