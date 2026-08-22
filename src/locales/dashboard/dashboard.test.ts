import { describe, it, expect, vi } from 'vitest'
import { dashboardFr, dashboardEn, dashboardDicts } from './index'
import { NAV_TAB_IDS, subscriptionTierLabel } from './nav'

// Importer Dashboard tire toute l'arborescence des onglets, dont `ScenariosTab` qui
// appelle `createClient()` AU NIVEAU MODULE — sans variables d'env, @supabase/ssr lève
// à l'import. Même neutralisation que dans `src/components/dashboard/tabs.test.ts`.
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }))

import { tabGroups, dashTabs } from '@/components/dashboard/Dashboard'

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
const INVARIANTS = new Set<string>([
  // Termes identiques en anglais — noms de produit, anglicismes déjà anglais côté FR,
  // ou mots dont l'orthographe ne change pas.
  'Administration', 'Admin', 'Navigation', 'Workshop', 'Pro',
  'To-Do Lists', 'To-Do', 'Stats', 'Patch Notes', 'Champions',
  'Jungle Path', 'Jungle', 'Builder',
  'Workshop Builds', 'W. Builds', 'Workshop Jungle', 'W. Jungle',
  'Match Up', 'Post Game', 'Overlay Workshop',
  // Lot 2 — sigles d'esport, unités et formats de fichier.
  'Description', 'Champion', 'KDA', 'CS/min', 'CS / min', 'Image (PNG)', 'PDF',
])

interface Anomalies {
  vides: string[]
  longueurs: string[]
  identiques: string[]
  clés: string[]
  marqueurs: string[]
}

/** Marqueurs d'interpolation d'un gabarit : `{count}`, `{n}`, `{date}`, `{author}`… */
const marqueursDe = (s: string) => (s.match(/\{[a-z]+\}/gi) ?? []).sort().join(',')

function parcourir(fr: unknown, en: unknown, chemin: string, out: Anomalies): void {
  if (typeof fr === 'string' && typeof en === 'string') {
    if (!fr.trim()) out.vides.push(`fr.${chemin}`)
    if (!en.trim()) out.vides.push(`en.${chemin}`)
    if (fr === en && !INVARIANTS.has(fr)) out.identiques.push(`${chemin} = "${fr}"`)
    if (marqueursDe(fr) !== marqueursDe(en)) {
      out.marqueurs.push(`${chemin} (fr "${marqueursDe(fr)}" ≠ en "${marqueursDe(en)}")`)
    }
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

const anomalies: Anomalies = { vides: [], longueurs: [], identiques: [], clés: [], marqueurs: [] }
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

  it('conserve les mêmes marqueurs d\'interpolation dans les deux langues', () => {
    // Les composants font `.replace('{count}', …)` : un marqueur absent ou renommé
    // côté EN ne casse rien à la compilation, il fait juste disparaître le nombre.
    // Même garde que le `{price}` de la vitrine, appliquée à tout le dico.
    expect(anomalies.marqueurs).toEqual([])
  })
})

/**
 * Lot 1 — appariement STRUCTURE ↔ LIBELLÉS.
 *
 * `tabGroups` (Dashboard.tsx) ne porte plus que du technique ; les libellés sont dans
 * `nav.tabs`, retrouvés par `id`. Le risque introduit par ce découpage est qu'un onglet
 * existe sans libellé (ligne vide dans les deux barres) ou qu'un libellé survive à un
 * onglet supprimé (clé morte). `id: NavTabId` empêche déjà le premier cas À LA
 * COMPILATION ; ces tests vérifient l'appariement RÉEL avec la structure rendue.
 */
describe('dico dashboard — libellés d\'onglets appariés à la structure', () => {
  /* 'admin' n'est pas dans `tabGroups` : il est rendu à part, en tête des deux barres,
     et seulement pour les admins. Il a donc un libellé sans être dans la liste plate. */
  const idsStructure = [...new Set(['admin', ...dashTabs.map(t => t.id)])].sort()

  it('chaque onglet rendu a un libellé, et aucun libellé n\'est orphelin', () => {
    expect(Object.keys(dashboardFr.nav.tabs).sort()).toEqual(idsStructure)
    expect([...NAV_TAB_IDS].sort()).toEqual(idsStructure)
  })

  it('chaque libellé d\'onglet est non vide dans les deux langues', () => {
    // Doublon volontaire du parcours générique : ici l'échec NOMME l'onglet fautif,
    // ce qui est l'information utile quand une barre affiche une ligne vide.
    idsStructure.forEach(id => {
      const key = id as keyof typeof dashboardFr.nav.tabs
      expect(dashboardFr.nav.tabs[key].label.trim(), `libellé FR vide pour « ${id} »`).not.toBe('')
      expect(dashboardEn.nav.tabs[key].label.trim(), `libellé EN vide pour « ${id} »`).not.toBe('')
    })
  })

  it('chaque groupe de la structure a un intitulé dans le dico', () => {
    tabGroups
      .map(g => g.id)
      .filter((id): id is NonNullable<typeof id> => Boolean(id))
      .forEach(id => {
        expect(dashboardFr.nav.groups[id], `groupe « ${id} » sans intitulé FR`).toBeTruthy()
        expect(dashboardEn.nav.groups[id], `groupe « ${id} » sans intitulé EN`).toBeTruthy()
      })
  })

  it('n\'a pas d\'intitulé de groupe orphelin', () => {
    const idsGroupes = tabGroups.map(g => g.id).filter(Boolean).sort()
    expect(Object.keys(dashboardFr.nav.groups).sort()).toEqual(idsGroupes)
  })

  /**
   * Lot 2 — en-têtes de contenu. La couverture de `DashTab` est déjà prouvée à la
   * compilation par l'annotation `PageTitles` de Dashboard.tsx ; ce qu'on vérifie ici
   * est l'autre bout : chaque onglet ATTEIGNABLE depuis une barre a bien un en-tête.
   */
  it('chaque onglet de la navigation a un en-tête de page', () => {
    dashTabs
      // `champions` est une route externe (`href`) : elle a sa propre page et son
      // propre titre, pas d'en-tête de dashboard.
      .filter(tab => !tab.href)
      .forEach(tab => {
        const titre = dashboardFr.nav.pageTitles[tab.id as keyof typeof dashboardFr.nav.pageTitles]
        expect(titre, `aucun en-tête pour l'onglet « ${tab.id} »`).toBeTruthy()
        expect(titre.title.trim()).not.toBe('')
        expect(titre.subtitle.trim()).not.toBe('')
      })
  })
})

/**
 * `subscriptionTierLabel` traduit un tier d'ABONNEMENT pour l'affichage. La valeur
 * reçue est celle de `profiles.tier` — partagée avec l'app WPF, jamais modifiée ici.
 */
describe('libellé de tier d\'abonnement', () => {
  it('traduit les valeurs connues de profiles.tier', () => {
    expect(subscriptionTierLabel(dashboardFr.nav, 'apprenti')).toBe('Apprenti')
    expect(subscriptionTierLabel(dashboardEn.nav, 'apprenti')).toBe('Apprentice')
    expect(subscriptionTierLabel(dashboardEn.nav, 'architecte+')).toBe('Architect+')
  })

  it('normalise la casse — `page.tsx` peut passer la valeur de repli « Apprenti »', () => {
    expect(subscriptionTierLabel(dashboardEn.nav, 'Apprenti')).toBe('Apprentice')
  })

  it('renvoie une valeur inconnue TELLE QUELLE plutôt qu\'un vide', () => {
    // Un tier ajouté en base avant d'être déclaré ici doit rester lisible.
    expect(subscriptionTierLabel(dashboardEn.nav, 'demiurge')).toBe('demiurge')
  })

  it('retombe sur le tier de base si la valeur est absente', () => {
    expect(subscriptionTierLabel(dashboardFr.nav, undefined)).toBe('Apprenti')
    expect(subscriptionTierLabel(dashboardEn.nav, null)).toBe('Apprentice')
  })
})
