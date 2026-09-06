import { describe, it, expect } from 'vitest'
import {
  ADMIN_SUBTAB_IDS, DEFAULT_ADMIN_SUBTAB, CUT_BANNER_TARGET,
  isAdminSubTab, parseAdminSubTab, subTabFromSearch, adminPanelLayout,
  type AdminSubTab,
} from './admin-subtabs'

/**
 * Découpage du panneau admin en sous-onglets — logique PURE.
 *
 * Ce que ces tests protègent, et que les tests de rendu ne peuvent pas
 * protéger : la garde du deep-link (une valeur inconnue ne doit jamais
 * installer un sous-onglet inexistant) et surtout l'invariant du bandeau de
 * coupures, qui est la seule raison pour laquelle ce découpage ne dégrade pas
 * la visibilité d'un incident.
 */

describe('garde du deep-link ?subtab=', () => {
  it('accepte les trois identifiants du panneau', () => {
    for (const id of ADMIN_SUBTAB_IDS) {
      expect(parseAdminSubTab(id), id).toBe(id)
      expect(isAdminSubTab(id), id).toBe(true)
    }
  })

  it('retombe sur le défaut pour une valeur inconnue', () => {
    // Même parti pris que `DEEP_LINKABLE_TABS` pour `?tab=` : on ignore plutôt
    // que d'installer un sous-onglet que le panneau ne saurait pas rendre.
    for (const bad of ['kill-switches', 'users', 'FLAGS', 'flags ', '', '../flags']) {
      expect(parseAdminSubTab(bad), bad).toBe(DEFAULT_ADMIN_SUBTAB)
      expect(isAdminSubTab(bad), bad).toBe(false)
    }
  })

  it('retombe sur le défaut quand le paramètre est absent', () => {
    expect(parseAdminSubTab(null)).toBe(DEFAULT_ADMIN_SUBTAB)
    expect(parseAdminSubTab(undefined)).toBe(DEFAULT_ADMIN_SUBTAB)
  })

  it('ne se laisse pas berner par un type inattendu', () => {
    // `isAdminSubTab` reçoit `unknown` : la query string est de la donnée
    // extérieure, elle ne doit jamais faire lever la lecture au montage.
    for (const bad of [42, null, undefined, {}, ['flags']]) {
      expect(isAdminSubTab(bad)).toBe(false)
    }
  })

  it('lit ?tab=admin&subtab=flags — le cas d\'usage qui justifie le deep-link', () => {
    // Coller ce lien dans un canal d'incident doit ouvrir directement les
    // kill switches, sans avoir à expliquer où cliquer.
    expect(subTabFromSearch('?tab=admin&subtab=flags')).toBe('flags')
    expect(subTabFromSearch('?subtab=patch-notes')).toBe('patch-notes')
    expect(subTabFromSearch('subtab=flags')).toBe('flags')
  })

  it('retombe sur le défaut sans paramètre subtab', () => {
    expect(subTabFromSearch('?tab=admin')).toBe(DEFAULT_ADMIN_SUBTAB)
    expect(subTabFromSearch('')).toBe(DEFAULT_ADMIN_SUBTAB)
    expect(subTabFromSearch('?subtab=')).toBe(DEFAULT_ADMIN_SUBTAB)
  })

  it('ouvre sur Utilisateurs par défaut', () => {
    // C'est ce que l'admin voyait en haut du panneau avant le découpage.
    expect(DEFAULT_ADMIN_SUBTAB).toBe('utilisateurs')
  })
})

describe('composition du panneau', () => {
  it('affiche exactement une section à la fois', () => {
    for (const sub of ADMIN_SUBTAB_IDS) {
      const l = adminPanelLayout(sub, 0)
      const shown = [l.showUsers, l.showPatchNotes, l.showFlags].filter(Boolean)
      expect(shown, sub).toHaveLength(1)
    }
  })

  it('associe chaque sous-onglet à sa section', () => {
    expect(adminPanelLayout('utilisateurs', 0).showUsers).toBe(true)
    expect(adminPanelLayout('patch-notes', 0).showPatchNotes).toBe(true)
    expect(adminPanelLayout('flags', 0).showFlags).toBe(true)
  })
})

describe('bandeau de coupures — invariant central du découpage', () => {
  it('reste visible sur TOUS les sous-onglets', () => {
    // Le cœur du chantier. Enfermer le bandeau dans « flags » supposerait qu'un
    // admin pense à cliquer dessus en pleine crise — l'hypothèse à ne pas faire.
    for (const sub of ADMIN_SUBTAB_IDS) {
      expect(adminPanelLayout(sub, 3).showBanner, sub).toBe(true)
    }
  })

  it('porte le même compteur quel que soit le sous-onglet actif', () => {
    for (const sub of ADMIN_SUBTAB_IDS) {
      expect(adminPanelLayout(sub, 7).bannerCount, sub).toBe(7)
    }
  })

  it('disparaît quand plus rien n\'est coupé', () => {
    for (const sub of ADMIN_SUBTAB_IDS) {
      expect(adminPanelLayout(sub, 0).showBanner, sub).toBe(false)
    }
  })

  it('ne dépend QUE du nombre de coupures, jamais du sous-onglet', () => {
    // Formulation structurelle de l'invariant : à `cutCount` égal, les deux
    // champs du bandeau sont identiques sur les trois sous-onglets. Un futur
    // refactor qui remettrait le bandeau dans une section casserait ici.
    for (const count of [0, 1, 2, 18]) {
      const banners = ADMIN_SUBTAB_IDS.map(sub => {
        const l = adminPanelLayout(sub, count)
        return `${l.showBanner}:${l.bannerCount}`
      })
      expect(new Set(banners).size, `cutCount=${count}`).toBe(1)
    }
  })

  it('saute vers la section des flags, et cette cible existe', () => {
    expect(CUT_BANNER_TARGET).toBe('flags')
    expect(isAdminSubTab(CUT_BANNER_TARGET satisfies AdminSubTab)).toBe(true)
  })
})
