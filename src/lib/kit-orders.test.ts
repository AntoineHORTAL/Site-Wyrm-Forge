import { describe, it, expect } from 'vitest'
import {
  KIT_STATUS_CHAIN, KIT_STATUSES, KIT_OPEN_STATUSES, KIT_TERMINAL_STATUSES,
  isKitStatus, isTerminalKitStatus, isActiveKit, kitStatusIndex, kitProgress,
  nextKitStatus, prevKitStatus, canCancelKit, kitActions, isValidKitTransition,
  formatKitPrice, kitInstalments,
  type KitStatus,
} from './kit-orders'

/**
 * Machine d'états du kit sur mesure — logique PURE.
 *
 * ⚠️ Ce fichier verrouille le MIROIR client de la fonction SQL `kit_set_status`
 * (migration 20260908000001). Il ne prouve rien sur la base : c'est
 * `supabase/tests/20260908000001_kit_orders_test.sql` qui vérifie que la base
 * refuse ce qu'il faut. Les deux doivent dire la même chose — le test
 * d'exhaustivité ci-dessous est ce qui rend une divergence visible.
 */

describe('forme de la chaîne', () => {
  it('porte les 7 états du parcours, dans l\'ordre, `annule` exclu', () => {
    expect([...KIT_STATUS_CHAIN]).toEqual([
      'demande', 'acompte_paye', 'decouverte_faite', 'kit_trouve',
      'solde_paye', 'session_faite', 'termine',
    ])
    expect(KIT_STATUS_CHAIN).not.toContain('annule')
  })

  it('les 8 valeurs sont exactement celles de la contrainte CHECK', () => {
    expect([...KIT_STATUSES].sort()).toEqual([
      'acompte_paye', 'annule', 'decouverte_faite', 'demande',
      'kit_trouve', 'session_faite', 'solde_paye', 'termine',
    ])
  })

  it('n\'accepte pas une valeur inconnue', () => {
    expect(isKitStatus('livre')).toBe(false)
    expect(isKitStatus('')).toBe(false)
    expect(isKitStatus(null)).toBe(false)
    for (const s of KIT_STATUSES) expect(isKitStatus(s), s).toBe(true)
  })

  it('n\'ouvre un dossier qu\'aux deux points d\'entrée', () => {
    // Ouvrir directement en `solde_paye` court-circuiterait le journal et sa
    // chronologie — la base le refuse (garde de kit_open_order), l'UI ne doit
    // même pas le proposer.
    expect([...KIT_OPEN_STATUSES].sort()).toEqual(['acompte_paye', 'demande'])
  })
})

describe('états terminaux', () => {
  it('`termine` et `annule`, et eux seuls', () => {
    expect([...KIT_TERMINAL_STATUSES].sort()).toEqual(['annule', 'termine'])
    for (const s of KIT_STATUSES) {
      expect(isTerminalKitStatus(s), s).toBe(s === 'termine' || s === 'annule')
      // `isActiveKit` est le prédicat de l'index partiel uq_kit_orders_active.
      expect(isActiveKit(s), s).toBe(!isTerminalKitStatus(s))
    }
  })

  it('un dossier terminal n\'offre plus AUCUNE action', () => {
    for (const s of KIT_TERMINAL_STATUSES) {
      expect(kitActions(s), s).toEqual({ advance: null, rollback: null, cancel: false })
    }
  })
})

describe('avancée et retour d\'un cran', () => {
  it('chaque état de la chaîne avance vers le suivant', () => {
    for (let i = 0; i < KIT_STATUS_CHAIN.length - 1; i++) {
      expect(nextKitStatus(KIT_STATUS_CHAIN[i])).toBe(KIT_STATUS_CHAIN[i + 1])
    }
  })

  it('chaque état de la chaîne recule vers le précédent', () => {
    for (let i = 1; i < KIT_STATUS_CHAIN.length - 1; i++) {
      expect(prevKitStatus(KIT_STATUS_CHAIN[i])).toBe(KIT_STATUS_CHAIN[i - 1])
    }
  })

  it('`demande` n\'a pas de précédent — c\'est le début du parcours', () => {
    expect(prevKitStatus('demande')).toBeNull()
  })

  it('🔴 `termine` ne se dé-clôture PAS, alors qu\'il a un précédent', () => {
    // La seule asymétrie de cette machine, et elle est délibérée : un kit livré
    // ne se dé-livre pas, sans quoi la liste des « preneurs du pack » cesserait
    // d'être stable. À ne pas « corriger » en généralisant le retour d'un cran.
    expect(kitStatusIndex('termine')).toBe(6)      // il A un précédent…
    expect(prevKitStatus('termine')).toBeNull()    // …et il reste inaccessible
    expect(isValidKitTransition('termine', 'session_faite')).toBe(false)
  })

  it('`annule` est hors chaîne, donc sans voisin', () => {
    expect(kitStatusIndex('annule')).toBeNull()
    expect(nextKitStatus('annule')).toBeNull()
    expect(prevKitStatus('annule')).toBeNull()
  })
})

describe('annulation', () => {
  it('possible depuis les six états non terminaux, et seulement eux', () => {
    for (const s of KIT_STATUSES) {
      expect(canCancelKit(s), s).toBe(!isTerminalKitStatus(s))
      expect(isValidKitTransition(s, 'annule'), s).toBe(!isTerminalKitStatus(s))
    }
  })
})

describe('🔴 exhaustivité de la table de transitions', () => {
  /**
   * Le test qui compte : on balaie les 8 × 8 = 64 couples possibles et on
   * vérifie que le compte des valides tombe sur 17 — 6 avancées, 5 retours,
   * 6 annulations. Un oubli dans `isValidKitTransition` (ou une transition
   * ajoutée en douce) change ce nombre, quel que soit le côté par lequel
   * l'erreur arrive.
   *
   * ⚠️ Ces 17 couples DOIVENT être exactement ceux du commentaire de table de
   * transitions en tête de `kit_set_status` (migration 20260908000001, § 4).
   */
  const valid: [KitStatus, KitStatus][] = []
  for (const from of KIT_STATUSES) {
    for (const to of KIT_STATUSES) {
      if (isValidKitTransition(from, to)) valid.push([from, to])
    }
  }

  it('exactement 17 transitions valides sur 64 couples', () => {
    expect(valid).toHaveLength(17)
  })

  it('les 17 sont nommément celles de la migration', () => {
    expect(valid.map(([a, b]) => `${a}→${b}`).sort()).toEqual([
      // 6 avancées
      'demande→acompte_paye',
      'acompte_paye→decouverte_faite',
      'decouverte_faite→kit_trouve',
      'kit_trouve→solde_paye',
      'solde_paye→session_faite',
      'session_faite→termine',
      // 5 retours d'un cran
      'acompte_paye→demande',
      'decouverte_faite→acompte_paye',
      'kit_trouve→decouverte_faite',
      'solde_paye→kit_trouve',
      'session_faite→solde_paye',
      // 6 annulations
      'demande→annule',
      'acompte_paye→annule',
      'decouverte_faite→annule',
      'kit_trouve→annule',
      'solde_paye→annule',
      'session_faite→annule',
    ].sort())
  })

  it('aucun état ne transite vers lui-même (le double-clic est refusé)', () => {
    // Refus VOULU : sans lui, un double-clic écrirait deux lignes d'audit pour
    // un seul événement. Côté base, le second appel lève `invalid_transition`.
    for (const s of KIT_STATUSES) {
      expect(isValidKitTransition(s, s), s).toBe(false)
    }
  })

  it('aucun saut de plus d\'un cran', () => {
    expect(isValidKitTransition('demande', 'kit_trouve')).toBe(false)
    expect(isValidKitTransition('acompte_paye', 'termine')).toBe(false)
    expect(isValidKitTransition('termine', 'demande')).toBe(false)
  })

  it('`kitActions` est cohérent avec la table, état par état', () => {
    // La sécurité de l'UI : un bouton rendu doit toujours correspondre à une
    // transition que la base acceptera. L'inverse (une transition valide sans
    // bouton) est acceptable ; celui-ci ne l'est pas — il produirait une erreur
    // au clic.
    for (const s of KIT_STATUSES) {
      const a = kitActions(s)
      if (a.advance)  expect(isValidKitTransition(s, a.advance), `${s}→${a.advance}`).toBe(true)
      if (a.rollback) expect(isValidKitTransition(s, a.rollback), `${s}→${a.rollback}`).toBe(true)
      expect(a.cancel, s).toBe(isValidKitTransition(s, 'annule'))
    }
  })
})

describe('progression affichée', () => {
  it('va de 0 à 1 le long de la chaîne', () => {
    expect(kitProgress('demande')).toBe(0)
    expect(kitProgress('termine')).toBe(1)
    expect(kitProgress('kit_trouve')).toBeCloseTo(3 / 6)
  })

  it('un dossier ANNULÉ n\'a pas de progression, et surtout pas zéro', () => {
    // `0` peindrait une barre vide, qui se lit « rien n'a été fait » — faux d'un
    // dossier abandonné après l'appel découverte. L'appelant omet la barre.
    expect(kitProgress('annule')).toBeNull()
  })
})

describe('montants', () => {
  it('n\'affiche rien tant que le prix n\'est pas renseigné', () => {
    // `price_total_cents` est nullable : l'admin peut ouvrir un dossier avant
    // d'avoir arrêté le montant.
    expect(formatKitPrice(null, 'fr')).toBeNull()
    expect(formatKitPrice(undefined, 'fr')).toBeNull()
    expect(formatKitPrice(Number.NaN, 'fr')).toBeNull()
  })

  it('formate les centimes dans la langue courante', () => {
    // Espaces insécables et position du symbole varient selon la locale : on
    // teste les chiffres, pas la typographie exacte du runtime.
    expect(formatKitPrice(9900, 'fr')).toContain('99,00')
    expect(formatKitPrice(9900, 'en')).toContain('99.00')
  })

  it('acompte + solde retombent TOUJOURS sur le total', () => {
    // Le point de la soustraction plutôt que d'un second arrondi : deux arrondis
    // indépendants peuvent perdre ou inventer un centime. On balaie des montants
    // volontairement retors (impairs, non divisibles par 5).
    for (const total of [1, 3, 7, 99, 4999, 9900, 12345, 999999]) {
      const { deposit, balance } = kitInstalments(total)
      expect(deposit + balance, `total ${total}`).toBe(total)
      expect(deposit).toBeGreaterThanOrEqual(0)
      expect(balance).toBeGreaterThanOrEqual(0)
    }
  })

  it('respecte la répartition 40 / 60', () => {
    expect(kitInstalments(10000)).toEqual({ deposit: 4000, balance: 6000 })
  })
})
