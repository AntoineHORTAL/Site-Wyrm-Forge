import { describe, it, expect } from 'vitest'
import { dashboardFr, dashboardEn, dashboardDicts } from './index'

/**
 * Mêmes invariants que `landing.test.ts`, mais écrits de façon GÉNÉRIQUE : la suite
 * parcourt les deux dictionnaires en parallèle au lieu d'énumérer des clés. C'est
 * volontaire — la zone connectée compte ~550 chaînes livrées lot par lot, et une
 * suite qui liste les clés à la main devrait être rouverte à chaque lot (et serait
 * donc oubliée). Ici, tout ce qui entre dans le dico est couvert d'office.
 *
 * `DashboardDict = typeof dashboardFr` force déjà les mêmes CLÉS à la compilation.
 * Ce que le type ne couvre PAS, et que ces tests vérifient :
 *  - la longueur des tableaux (un tableau EN plus court affiche `undefined`) ;
 *  - les chaînes vides (compilent parfaitement, ne s'affichent pas) ;
 *  - les chaînes restées en français côté EN (oubli de traduction silencieux).
 *
 * ⏳ Lot 0 : les modules sont encore vides, la suite ne parcourt donc rien. Elle est
 * en place pour que chaque lot suivant soit couvert sans rien avoir à écrire ici.
 */

/**
 * Chaînes identiques dans les deux langues PAR DESIGN — noms propres, marques et
 * termes de LoL qui ne se traduisent pas (« Discord », « Match Up », « ARAM »…).
 * À alimenter au fil des lots, avec la valeur exacte : c'est une liste d'exceptions
 * justifiées, pas un tapis sous lequel glisser les traductions oubliées.
 */
const INVARIANTS = new Set<string>([])

interface Anomalies {
  vides: string[]
  longueurs: string[]
  identiques: string[]
  clés: string[]
}

function parcourir(fr: unknown, en: unknown, chemin: string, out: Anomalies): void {
  if (typeof fr === 'string' && typeof en === 'string') {
    if (!fr.trim()) out.vides.push(`fr.${chemin}`)
    if (!en.trim()) out.vides.push(`en.${chemin}`)
    if (fr === en && !INVARIANTS.has(fr)) out.identiques.push(`${chemin} = "${fr}"`)
    return
  }

  if (Array.isArray(fr) || Array.isArray(en)) {
    if (!Array.isArray(fr) || !Array.isArray(en)) {
      out.clés.push(`${chemin} (tableau d'un seul côté)`)
      return
    }
    if (fr.length !== en.length) {
      out.longueurs.push(`${chemin} (fr ${fr.length} ≠ en ${en.length})`)
      return
    }
    fr.forEach((v, i) => parcourir(v, en[i], `${chemin}[${i}]`, out))
    return
  }

  if (fr && en && typeof fr === 'object' && typeof en === 'object') {
    const clésFr = Object.keys(fr as object)
    const clésEn = Object.keys(en as object)
    clésEn
      .filter(k => !clésFr.includes(k))
      .forEach(k => out.clés.push(`${chemin ? `${chemin}.` : ''}${k} (en EN seulement)`))

    clésFr.forEach(k => {
      const sous = chemin ? `${chemin}.${k}` : k
      if (!clésEn.includes(k)) { out.clés.push(`${sous} (en FR seulement)`); return }
      parcourir((fr as Record<string, unknown>)[k], (en as Record<string, unknown>)[k], sous, out)
    })
  }
}

const anomalies: Anomalies = { vides: [], longueurs: [], identiques: [], clés: [] }
parcourir(dashboardFr, dashboardEn, '', anomalies)

describe('dico dashboard — parité FR / EN', () => {
  it('expose exactement les deux langues', () => {
    expect(Object.keys(dashboardDicts).sort()).toEqual(['en', 'fr'])
  })

  it('assemble tous les modules de dico', () => {
    // Une zone oubliée dans index.ts n'existerait nulle part à l'exécution, alors que
    // son module compilerait très bien tout seul.
    expect(Object.keys(dashboardFr).sort()).toEqual([
      'accueil', 'admin', 'analyse', 'builds', 'common', 'ecailles', 'nav', 'profil', 'workshop',
    ])
  })

  it('a les mêmes clés des deux côtés, à tous les niveaux', () => {
    expect(anomalies.clés).toEqual([])
  })

  it('a les mêmes longueurs de tableaux dans les deux langues', () => {
    expect(anomalies.longueurs).toEqual([])
  })

  it('ne laisse aucune chaîne vide', () => {
    expect(anomalies.vides).toEqual([])
  })

  it('ne laisse aucune chaîne identique entre FR et EN (hors invariants)', () => {
    expect(anomalies.identiques).toEqual([])
  })
})
