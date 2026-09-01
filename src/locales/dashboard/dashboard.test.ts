import { describe, it, expect, vi } from 'vitest'
import { dashboardFr, dashboardEn, dashboardDicts } from './index'
import { NAV_TAB_IDS, subscriptionTierLabel } from './nav'

// Importer Dashboard tire toute l'arborescence des onglets, dont `ScenariosTab` qui
// appelle `createClient()` AU NIVEAU MODULE — sans variables d'env, @supabase/ssr lève
// à l'import. Même neutralisation que dans `src/components/dashboard/tabs.test.ts`.
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }))

import { tabGroups, dashTabs } from '@/components/dashboard/Dashboard'
import { RADAR_AXES } from '@/lib/matchup/stats-compare'
import {
  POSTGAME_DEPTHS, POSTGAME_MODES, comboKey, comboLabel, postGameErrorText,
  type PostGameError, type PostGameResult,
} from '@/lib/postgame/api'
import { balanceLabel, needLabel } from './analyse'
import { profileRoleLabel, patchStatusLabel, patchGenReasonLabel } from './admin'
import { queueLabel } from './common'
import {
  riotRankLabel, supabaseAuthError, consentRpcError, consentOkMessage, gamesLabel,
} from './profil'
import { LOL_RANKS } from '@/app/profil/page'
import { CONSENT_STATUSES, CONSENT_RPC_ERRORS } from '@/app/consent/page'
import {
  TIERS, PROFILE_ROLES, PATCH_STATUSES, PATCH_GEN_REASONS, ADMIN_SETTING_KEYS, QUICK_DATES,
} from '@/components/dashboard/tabs/AdminTab'

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
  'Match Up', 'Post Game',
  // Lot 2 — sigles d'esport, unités et formats de fichier.
  'Description', 'Champion', 'KDA', 'CS/min', 'CS / min', 'Image (PNG)', 'PDF',
  // La Forge — raretés et types de cosmétiques dont l'orthographe ne change pas.
  'Rare', 'Badge', 'Badges', 'Avatar', 'Avatars',
  // Lot 3 — vocabulaire de build : sigles LoL et termes anglais déjà employés tels
  // quels en français (« Keystone », « Stat shards », les 3 lignes de shards Riot).
  'AD', 'AP', 'Crit', 'Omnivamp', 'Mana',
  'Items', 'Runes', 'Skills',
  'Keystone', 'Stat shards', 'Offense', 'Flex', 'Defense', 'Slot {n}',
  'Champion ▾', '✕ Reset',
  // « items » est employé tel quel en français dans tout le Builder.
  '{count} items',
  // Lot 4 — noms propres de la Faille (camps, monstres) et vocabulaire de jungle
  // employé tel quel en français.
  'Gromp', 'Rift Scuttler', 'Dragon', 'Krug', 'Raptor', 'Baron',
  'Smite', 'Ward', 'Invade', 'Gank',
  // Exemples de champions dans un placeholder — noms propres Riot.
  'Vi, Hecarim...',
  // Rôles LoL : mêmes sigles des deux côtés (« Jungle » est déjà plus haut).
  'Top', 'Mid', 'ADC', 'Support',
  // Phases de game et outils de l'éditeur de scénarios — anglicismes déjà employés
  // tels quels en français.
  'Early', 'Mid', 'Late',
  'Rotation', 'Zone', 'Lane prio.', 'Ping',
  // Types de ping : seul « help » se traduit (AIDE), les deux autres sont identiques.
  'DANGER', 'FIGHT',
  // Gabarits de la liste des dessins — le seul mot traduisible y est interpolé.
  'Ward {type}', 'Ping {type}', 'Lane {lane}',
  // Numéro de patch : le mot « patch » est identique dans les deux langues.
  'patch {patch}',
  // Lot 5 — sigles, unités et gabarits sans mot traduisible.
  'VS', 'g', 'Simple', '—',
  '{name} — {gold} g', '{count} item', '{champion} vs {opponent}',
  // Infobulle d'un item du Workshop : nom + quantité, aucun mot à traduire.
  '{name} (×{count})',
  // Lot 6 — en-têtes de colonnes et libellés du panneau admin dont l'orthographe est
  // la même dans les deux langues (« Admin » et « Patch Notes » sont déjà plus haut).
  'Tier', 'Expiration', 'Actions', '📅 Date', '✕', 'https://...',
  // Lot 7 — rangs LoL et libellés de /profil, /consent et AuthModal identiques dans
  // les deux langues.
  'Bronze', 'KDA', 'Vision',
  // Résultat d'une partie : W/L dans les DEUX langues, aussi bien pour le bilan
  // chiffré (/profil, /consent) que pour les pastilles d'une lettre (timeline Stats,
  // liste /consent, ligne Post Game). Les MOTS « Victoire » / « Défaite » restent
  // traduits, eux — un test dédié verrouille la distinction.
  '{wins}W {losses}L', ' · {wins}W {losses}L', 'W', 'L',
  // Gabarits sans mot traduisible.
  '{rate}% WR', 'Champ #{id}',
  // Message natif de Supabase : côté EN, la valeur EST la clé. C'est précisément le
  // point du remappage — ne jamais « traduire » le texte français vers l'anglais.
  'Invalid login credentials',
  // Mots identiques dans les deux langues (« To-do lists » avec cette casse-ci est le
  // libellé de /profil ; « To-Do Lists » plus haut est celui de l'onglet).
  'Winrate', 'To-do lists', 'Email',
  // Fragment de fin d'une phrase coupée par un lien mailto : il ne porte QUE la
  // ponctuation, dans les deux langues. Verrouillé par un test dédié plus bas.
  '.',
  // Lot 8 — noms de files que Riot n'a jamais traduits en français : ce sont les
  // libellés officiels tels quels dans les deux clients du jeu.
  'ARAM', 'Clash', 'URF', 'Arena', 'URF (pick)',
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
      'accueil', 'admin', 'analyse', 'builds', 'common', 'ecailles', 'nav', 'profil',
      'strategie', 'workshop',
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
 * Lot 3 — le Builder indexe ses libellés par des clés STABLES, jamais par le texte
 * affiché : clé de filtre interne, clé de stat DDragon, id de shard Riot. Ces tests
 * verrouillent l'appariement avec les tables de structure de `BuildsTab` et
 * `RunesEditor`, qui vivent dans les composants et ne peuvent pas être typées depuis
 * le dico sans créer un cycle d'import.
 */
describe('dico builder — libellés appariés aux tables de structure', () => {
  /* Recopié depuis `FILTERS` (BuildsTab.tsx) — même ordre, mêmes clés. */
  const CLÉS_FILTRES = [
    'ad', 'ap', 'armor', 'magicResist', 'health', 'lethality', 'magicPen',
    'attackSpeed', 'crit', 'lifeSteal', 'omnivamp', 'moveSpeed', 'mana',
    'healthRegen', 'manaRegen', 'heal', 'tenacity', 'adaptive',
  ]

  /* Recopié depuis `STATS` (BuildsTab.tsx) — ce sont les clés DDragon. */
  const CLÉS_STATS = [
    'FlatPhysicalDamageMod', 'FlatMagicDamageMod', 'FlatCritChanceMod',
    'PercentAttackSpeedMod', 'PercentLifeStealMod', 'FlatArmorPenetrationMod',
    'FlatMagicPenetrationMod', 'FlatHPPoolMod', 'FlatArmorMod', 'FlatSpellBlockMod',
    'FlatHPRegenMod', 'FlatMPPoolMod', 'FlatMovementSpeedMod', 'PercentMovementSpeedMod',
  ]

  /* Ids de shards Riot présents dans les 3 lignes de `SHARDS` (RunesEditor.tsx),
     dédupliqués : un même shard apparaît sur deux lignes. */
  const IDS_SHARDS = ['5001', '5005', '5007', '5008', '5010', '5011', '5013']

  it('a un libellé pour chaque filtre, et aucun libellé orphelin', () => {
    expect(Object.keys(dashboardFr.builds.filters).sort()).toEqual([...CLÉS_FILTRES].sort())
  })

  it('a un libellé pour chaque stat DDragon affichée', () => {
    expect(Object.keys(dashboardFr.builds.stats).sort()).toEqual([...CLÉS_STATS].sort())
  })

  it('a un nom et une description pour chaque shard', () => {
    expect(Object.keys(dashboardFr.builds.shards).sort()).toEqual(IDS_SHARDS)
    IDS_SHARDS.forEach(id => {
      const key = Number(id) as keyof typeof dashboardFr.builds.shards
      expect(dashboardFr.builds.shards[key].name.trim(), `nom FR vide pour le shard ${id}`).not.toBe('')
      expect(dashboardEn.builds.shards[key].desc.trim(), `desc EN vide pour le shard ${id}`).not.toBe('')
    })
  })

  /**
   * `defaults` est le seul endroit du dico dont la valeur atterrit en base (noms de
   * blocs, nom de build, pseudo de publication). Ce test ne verrouille pas leur
   * contenu — il documente qu'ils existent dans les deux langues et ne sont jamais
   * vides : un défaut vide créerait un bloc sans nom en base.
   */
  it('a des valeurs par défaut non vides dans les deux langues', () => {
    Object.entries(dashboardFr.builds.defaults).forEach(([clé, valeur]) => {
      expect(valeur.trim(), `défaut FR vide : ${clé}`).not.toBe('')
      const en = dashboardEn.builds.defaults[clé as keyof typeof dashboardEn.builds.defaults]
      expect(en.trim(), `défaut EN vide : ${clé}`).not.toBe('')
    })
  })
})

/**
 * Lot 4 — Jungle Path et Scénarios (`strategie`). Mêmes règles qu'au Lot 3 : tout ce
 * qui est listé côté composant l'est par une CLÉ stable, jamais par le libellé
 * affiché. Ces tests verrouillent l'appariement avec les tables de structure, qui
 * vivent dans les composants et ne peuvent pas être typées depuis le dico sans créer
 * un cycle d'import.
 */
describe('dico stratégie — libellés appariés aux tables de structure', () => {
  /* Union de `campsBlu` et `campsRed` (JunglePathTab.tsx) — `scuttler` est dans les
     deux colonnes et n'a donc qu'une seule entrée de dico. */
  const CLÉS_CAMPS = [
    'baron', 'blueSentinel', 'dragon', 'gromp', 'krug',
    'raptors', 'redBrambleback', 'scuttler', 'wolves',
  ]

  /* Recopié depuis `placements` (JunglePathTab.tsx). */
  const CLÉS_PLACEMENTS = ['smite', 'ward', 'invade', 'gank']

  it('a un nom pour chaque camp affiché, et aucun nom orphelin', () => {
    expect(Object.keys(dashboardFr.strategie.jungle.camps).sort()).toEqual([...CLÉS_CAMPS].sort())
  })

  it('a un libellé pour chaque marqueur posable', () => {
    expect(Object.keys(dashboardFr.strategie.jungle.placements).sort())
      .toEqual([...CLÉS_PLACEMENTS].sort())
  })

  /**
   * `savedPaths` (JunglePathTab.tsx) est une liste de DÉMONSTRATION en dur, rendue par
   * index : `demoPathNames[i]`. Un tableau plus court côté dico afficherait une carte
   * vide, sans erreur. Le parcours générique garantit déjà FR ↔ EN de même longueur ;
   * ici on verrouille l'accord avec le nombre de cartes réellement rendues.
   */
  it('a autant de noms de démonstration que de paths de démonstration', () => {
    expect(dashboardFr.strategie.jungle.demoPathNames).toHaveLength(2)
  })

  /**
   * ⚠️ Les clés ci-dessous sont le CONTRAT JSONB de `scenarios.drawings`, partagé avec
   * l'app WPF (`Models/Scenario.cs`) : elles sont écrites en base et comparées dans les
   * deux clients. Le dico les indexe telles quelles — les renommer casserait l'interop,
   * pas seulement l'affichage.
   */
  const CLÉS_PHASES = ['all', 'early', 'mid', 'late']
  const CLÉS_WARD   = ['yellow', 'control', 'blue']
  const CLÉS_PING   = ['danger', 'help', 'fight']
  /* Recopié depuis le type `Tool` (ScenariosTab.tsx) — état `activeTool`, non stocké. */
  const CLÉS_OUTILS = ['select', 'ward', 'arrow', 'zone', 'ping', 'lane', 'erase']

  it('indexe les phases par la clé du contrat jsonb', () => {
    expect(Object.keys(dashboardFr.strategie.scenarios.phases).sort()).toEqual([...CLÉS_PHASES].sort())
  })

  it('indexe les types de ward et de ping par la clé du contrat jsonb', () => {
    expect(Object.keys(dashboardFr.strategie.scenarios.wardTypes).sort()).toEqual([...CLÉS_WARD].sort())
    expect(Object.keys(dashboardFr.strategie.scenarios.pingTypes).sort()).toEqual([...CLÉS_PING].sort())
  })

  it('a un libellé pour chaque outil de dessin, et aucun orphelin', () => {
    expect(Object.keys(dashboardFr.strategie.scenarios.tools).sort()).toEqual([...CLÉS_OUTILS].sort())
  })

  /**
   * Les gabarits de la colonne de droite composent un libellé traduit à partir d'un
   * autre libellé traduit (`Ward {type}` ← `wardTypes`). Le parcours générique ne
   * vérifie que la PARITÉ des marqueurs entre FR et EN : si le marqueur disparaissait
   * des DEUX côtés, la ligne afficherait « Ward » sans son type, sans rien casser.
   */
  it('conserve les marqueurs des gabarits de la liste des dessins', () => {
    const el = dashboardFr.strategie.scenarios.elements
    expect(el.ward).toContain('{type}')
    expect(el.ping).toContain('{type}')
    expect(el.lane).toContain('{lane}')
    expect(el.title).toContain('{count}')
    expect(dashboardEn.strategie.scenarios.picker.title).toContain('{role}')
  })

  /**
   * `defaults.unnamedScenario` est le seul libellé de ce module dont la valeur atterrit
   * EN BASE (`scenarios.name` quand l'utilisateur sauvegarde sans nommer). Même garde
   * que `builds.defaults` : un défaut vide créerait une ligne sans nom.
   */
  it('a un nom de scénario par défaut non vide dans les deux langues', () => {
    expect(dashboardFr.strategie.scenarios.defaults.unnamedScenario.trim()).not.toBe('')
    expect(dashboardEn.strategie.scenarios.defaults.unnamedScenario.trim()).not.toBe('')
  })
})

/**
 * Lot 4 — Workshop. Les deux vitrines filtrent sur une valeur EN BASE (`role`, `side`)
 * mais affichent un libellé traduit : les filtres sont donc indexés par une clé interne,
 * la valeur comparée restant en dur dans le composant. Ces tests verrouillent le jeu de
 * clés — l'appariement clé ↔ valeur, lui, est prouvé à la compilation par le type
 * `WorkshopRoleKey` / `WorkshopSideKey` porté par les tables des composants.
 */
describe('dico workshop — filtres appariés aux tables de structure', () => {
  /* Recopié depuis `ROLES` (WorkshopBuildsTab.tsx) et `SIDES` (WorkshopJungleTab.tsx). */
  const CLÉS_ROLES = ['all', 'top', 'jungle', 'mid', 'adc', 'support']
  const CLÉS_SIDES = ['all', 'blue', 'red']

  it('a un libellé pour chaque filtre de rôle', () => {
    expect(Object.keys(dashboardFr.workshop.builds.roles).sort()).toEqual([...CLÉS_ROLES].sort())
  })

  it('a un libellé pour chaque filtre de côté', () => {
    expect(Object.keys(dashboardFr.workshop.jungle.sides).sort()).toEqual([...CLÉS_SIDES].sort())
  })

  /**
   * Les deux vitrines partagent `by` et `patchBadge`. Ce test ne verrouille pas leur
   * contenu — il documente qu'ils sont bien MUTUALISÉS, pour qu'un futur lot ne
   * réintroduise pas une copie par onglet qui divergerait en silence.
   */
  it('mutualise l\'auteur et le badge de patch entre les deux vitrines', () => {
    expect(Object.keys(dashboardFr.workshop.shared).sort()).toEqual(['by', 'patchBadge'])
    expect(dashboardFr.workshop.shared.patchBadge).toContain('{patch}')
  })

  it('conserve le marqueur du nom dans les confirmations de retrait', () => {
    // `removeConfirm` nomme le build supprimé : sans `{name}`, la boîte de dialogue
    // demanderait de confirmer une suppression sans dire laquelle.
    expect(dashboardFr.workshop.builds.removeConfirm).toContain('{name}')
    expect(dashboardEn.workshop.builds.removeConfirm).toContain('{name}')
  })

  it('conserve les deux marqueurs de l\'infobulle d\'item', () => {
    expect(dashboardFr.workshop.builds.itemTitle).toContain('{name}')
    expect(dashboardFr.workshop.builds.itemTitle).toContain('{count}')
  })
})

/**
 * Lot 4 — `LockedScreen` (Dashboard.tsx) affiche `Scénarios` en mode verrouillé. Son
 * titre et son sous-titre viennent de `nav.pageTitles.scenarios` : rien à tester de plus
 * que la couverture déjà prouvée plus haut. Ce qui est propre à cet écran, en revanche,
 * est une CONCATÉNATION — `{subtitle}{upgrade}` — dont la ponctuation ne peut pas être
 * vérifiée par le type.
 */
describe('écran verrouillé — phrase d\'incitation', () => {
  it('commence par le point qui clôt le sous-titre', () => {
    // Le sous-titre est rendu sans ponctuation finale : c'est `upgrade` qui la porte.
    // Une traduction qui l'oublierait produirait « … zones de fight Passe à un plan… ».
    expect(dashboardFr.nav.locked.upgrade.startsWith('.')).toBe(true)
    expect(dashboardEn.nav.locked.upgrade.startsWith('.')).toBe(true)
  })

  it('n\'a pas de sous-titre déjà ponctué à traiter', () => {
    expect(dashboardFr.nav.pageTitles.scenarios.subtitle.endsWith('.')).toBe(false)
    expect(dashboardEn.nav.pageTitles.scenarios.subtitle.endsWith('.')).toBe(false)
  })

  it('a un bouton non vide dans les deux langues', () => {
    expect(dashboardFr.nav.locked.cta.trim()).not.toBe('')
    expect(dashboardEn.nav.locked.cta.trim()).not.toBe('')
  })
})

/**
 * Lot 5 — les deux onglets d'analyse IA. Comme aux lots précédents, tout ce qui est
 * listé côté code l'est par une CLÉ stable ; ici ces clés sont en plus des valeurs
 * de contrat (clé de stat DDragon, `depth`/`mode` envoyés à l'Edge Function), donc
 * l'appariement se vérifie contre les tables RÉELLES, importées et non recopiées.
 */
describe('dico analyse — libellés appariés aux tables de structure', () => {
  it('a un libellé pour chaque axe du radar, et aucun orphelin', () => {
    // `RADAR_AXES` ne porte plus de `label` depuis ce lot : si une clé n'était pas
    // dans le dico, l'axe s'afficherait `undefined` sur le graphe.
    expect(Object.keys(dashboardFr.analyse.radarAxes).sort())
      .toEqual(RADAR_AXES.map(a => a.key).sort())
  })

  it('a un libellé pour chaque profondeur et chaque sujet de Post Game', () => {
    expect(Object.keys(dashboardFr.analyse.postgame.depths).sort()).toEqual([...POSTGAME_DEPTHS].sort())
    expect(Object.keys(dashboardFr.analyse.postgame.modes).sort()).toEqual([...POSTGAME_MODES].sort())
  })

  /**
   * ⚠️ FRONTIÈRE MÉTIER : ces clés sont la valeur envoyée à l'EF ET la moitié de
   * `comboKey`, qui indexe la grille de coûts renvoyée par le serveur. Traduire le
   * libellé ne doit jamais les toucher — une clé traduite ferait lire un coût
   * `undefined`, donc « gratuit », sur les 9 combinaisons.
   */
  it('les clés de combinaison restent les valeurs du contrat serveur', () => {
    const clés = POSTGAME_DEPTHS.flatMap(d => POSTGAME_MODES.map(m => comboKey(d, m)))
    expect(clés).toHaveLength(9)
    expect(clés).toContain('simple_perso')
    expect(clés).toContain('advanced_les_deux')
    // Aucune clé ne doit contenir un libellé traduit.
    clés.forEach(k => expect(k).toMatch(/^[a-z_]+$/))
  })

  it('compose un libellé de combinaison pour les 9 cas, dans les deux langues', () => {
    POSTGAME_DEPTHS.forEach(d => POSTGAME_MODES.forEach(m => {
      expect(comboLabel(dashboardFr.analyse, d, m)).not.toContain('undefined')
      expect(comboLabel(dashboardEn.analyse, d, m)).not.toContain('undefined')
    }))
  })
})

/**
 * Lot 5 — les deux couches réseau mémorisent un CODE d'erreur et non un message
 * (patron acté au Lot 2 pour `StatsTab`). Le risque introduit est qu'un code
 * n'ait pas d'entrée de dico : l'écran afficherait `undefined` à la place du
 * message, sans que rien n'échoue à la compilation.
 */
describe('dico analyse — messages d\'erreur résolus depuis un code', () => {
  const base: PostGameResult = {
    success: false, text: '', error: null, needed: 0, truncated: false, overQuota: false,
    champion: '', win: null, opponent: null, opponentUnavailable: false,
    depth: 'simple', mode: 'perso',
    used: 0, limit: 0, remaining: 0, model: '', resetsAt: null, costs: {},
  }

  /* Tous les `kind` que `analyzePostGame` peut produire, hors `server` (dont le
     texte vient de l'Edge Function) et `overQuota` (composé, testé plus bas). */
  const CODES = [
    'signedOut', 'network', 'service', 'riot', 'unexpected', 'empty',
    'badRequest', 'matchNotFound', 'opponentUnavailable',
  ] as const

  it.each(CODES)('résout le code « %s » dans les deux langues', kind => {
    const r = { ...base, error: { kind } as PostGameError }
    expect(postGameErrorText(dashboardFr.analyse, r)).toBe(dashboardFr.analyse.errors[kind])
    expect(postGameErrorText(dashboardEn.analyse, r).trim()).not.toBe('')
    expect(postGameErrorText(dashboardEn.analyse, r)).not.toContain('undefined')
  })

  it('affiche TEL QUEL le message écrit par l\'Edge Function', () => {
    // Un message serveur n'est pas traduisible côté client : il ne doit surtout pas
    // être remplacé par un libellé générique, ni disparaître.
    const r = { ...base, error: { kind: 'server', text: 'Quota Riot dépassé.' } as PostGameError }
    expect(postGameErrorText(dashboardFr.analyse, r)).toBe('Quota Riot dépassé.')
    expect(postGameErrorText(dashboardEn.analyse, r)).toBe('Quota Riot dépassé.')
  })

  it('compose le message de solde insuffisant avec la combinaison demandée', () => {
    const r: PostGameResult = {
      ...base, error: { kind: 'overQuota' }, overQuota: true,
      needed: 25, remaining: 8, used: 127, limit: 135,
      depth: 'medium', mode: 'les_deux',
    }
    const fr = postGameErrorText(dashboardFr.analyse, r)
    expect(fr).toContain('25')
    expect(fr).toContain(comboLabel(dashboardFr.analyse, 'medium', 'les_deux'))
    expect(postGameErrorText(dashboardEn.analyse, r)).toContain('Medium · Both')
  })

  it('retombe sur « épuisée » quand il ne reste plus rien', () => {
    const r: PostGameResult = {
      ...base, error: { kind: 'overQuota' }, overQuota: true,
      needed: 6, remaining: 0, used: 135, limit: 135,
    }
    expect(postGameErrorText(dashboardFr.analyse, r)).toContain('135/135')
    expect(postGameErrorText(dashboardEn.analyse, r)).toContain('135/135')
  })

  it('ne rend aucun message pour un résultat sans erreur', () => {
    expect(postGameErrorText(dashboardFr.analyse, { ...base, success: true, text: 'ok' })).toBe('')
  })
})

/**
 * Lot 5 — le solde du pot « Chaleur de la Forge » est composé par deux helpers
 * PARTAGÉS entre les deux onglets ET la couche réseau. Ils vivent dans le dico
 * (même patron que `subscriptionTierLabel`) précisément pour que la phrase ne
 * diverge pas selon l'endroit qui l'affiche.
 */
describe('libellés de solde — pluriel et interpolation', () => {
  it('accorde le singulier et le pluriel dans les deux langues', () => {
    expect(balanceLabel(dashboardFr.analyse, 1, 135)).toBe('1 braise sur 135')
    expect(balanceLabel(dashboardFr.analyse, 20, 135)).toBe('20 braises sur 135')
    expect(balanceLabel(dashboardEn.analyse, 1, 135)).toBe('1 ember out of 135')
    expect(balanceLabel(dashboardEn.analyse, 20, 135)).toBe('20 embers out of 135')
  })

  it('ne laisse aucun marqueur non substitué', () => {
    const tousLesCas = [
      balanceLabel(dashboardFr.analyse, 1, 135),
      balanceLabel(dashboardEn.analyse, 20, 135),
      needLabel(dashboardFr.analyse, 1, 17, dashboardFr.analyse.matchup.actionQuick),
      needLabel(dashboardEn.analyse, 20, 33, dashboardEn.analyse.matchup.actionDetailed),
    ]
    tousLesCas.forEach(t => expect(t).not.toMatch(/\{[a-z]+\}/i))
  })

  it('nomme l\'action dans le message de solde insuffisant', () => {
    // Sans `{action}`, la phrase dirait « il en faut 33 » sans dire pour quoi —
    // c'est précisément ce que le pot fongible rend ambigu.
    expect(needLabel(dashboardFr.analyse, 20, 33, dashboardFr.analyse.matchup.actionDetailed))
      .toContain('une analyse détaillée')
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
    expect(subscriptionTierLabel(dashboardEn.nav, 'légion')).toBe('Legion')
  })

  it('traduit le marqueur de rôle `admin`, qui n\'est pas un palier', () => {
    // Posé par `effectiveTier` (page.tsx) et rendu par Nav.tsx. Hors TIER_ORDER :
    // il ne doit jamais être proposé à l'assignation ni écrit en base.
    expect(subscriptionTierLabel(dashboardFr.nav, 'admin')).toBe('Admin')
    expect(subscriptionTierLabel(dashboardEn.nav, 'admin')).toBe('Admin')
    expect(TIERS).not.toContain('admin')
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

/**
 * Lot 6 — panneau Admin. C'est l'onglet qui affiche le PLUS de valeurs métier brutes :
 * `profiles.role`, `profiles.tier`, `patch_notes.status`, le `reason` de l'Edge
 * Function et les clés `app_settings`. Chacune a une table d'affichage indexée par la
 * VALEUR, jamais par un libellé.
 *
 * Ces tests couvrent ce que ni le type ni le parcours générique ne voient : que la
 * table est complète pour TOUTES les valeurs possibles — pas seulement celles qui
 * apparaissent dans les données du moment. Les jeux de valeurs sont donc importés
 * depuis `AdminTab`, où ils sont recopiés du schéma (contraintes CHECK, DEFAULT).
 */
describe('dico admin — tables d\'affichage des valeurs métier', () => {
  it('a un libellé pour chaque valeur de profiles.role, et aucun orphelin', () => {
    expect(Object.keys(dashboardFr.admin.roles).sort()).toEqual([...PROFILE_ROLES].sort())
    expect(Object.keys(dashboardEn.admin.roles).sort()).toEqual([...PROFILE_ROLES].sort())
  })

  it('a un libellé pour chaque valeur de patch_notes.status, et aucun orphelin', () => {
    // Le CHECK en base n'accepte que ces deux valeurs : un statut ajouté côté SQL sans
    // entrée ici s'afficherait brut dans le badge, ce test le signale d'abord.
    expect(Object.keys(dashboardFr.admin.patches.statuses).sort()).toEqual([...PATCH_STATUSES].sort())
  })

  it('a un libellé pour chaque motif renvoyé par patch-notes-generator', () => {
    expect(Object.keys(dashboardFr.admin.patches.reasons).sort()).toEqual([...PATCH_GEN_REASONS].sort())
  })

  /**
   * ⚠️ FRONTIÈRE MÉTIER : `TIERS` pilote à la fois les boutons de l'éditeur, le
   * comptage par tier et la valeur ÉCRITE dans `profiles.tier`. Le panneau admin rend
   * la liste ENTIÈRE, y compris les tiers que personne n'a encore — un tier sans
   * libellé y serait donc visible tout de suite, contrairement aux autres écrans.
   */
  it('traduit chacun des tiers proposés par l\'éditeur', () => {
    TIERS.forEach(tier => {
      expect(subscriptionTierLabel(dashboardFr.nav, tier), `tier FR manquant : ${tier}`).not.toBe(tier)
      expect(subscriptionTierLabel(dashboardEn.nav, tier), `tier EN manquant : ${tier}`).not.toBe(tier)
    })
  })

  it('a un libellé et une description pour chaque feature flag géré', () => {
    // `ADMIN_SETTING_KEYS` pilote AUSSI le `.in()` de chargement : une clé chargée sans
    // entrée de dico afficherait un interrupteur sans texte.
    expect(Object.keys(dashboardFr.admin.settings).sort()).toEqual([...ADMIN_SETTING_KEYS].sort())
    ADMIN_SETTING_KEYS.forEach(key => {
      expect(dashboardFr.admin.settings[key].label.trim(), `libellé FR vide : ${key}`).not.toBe('')
      expect(dashboardFr.admin.settings[key].description.trim(), `desc FR vide : ${key}`).not.toBe('')
      expect(dashboardEn.admin.settings[key].label.trim(), `libellé EN vide : ${key}`).not.toBe('')
      expect(dashboardEn.admin.settings[key].description.trim(), `desc EN vide : ${key}`).not.toBe('')
    })
  })

  it('a un libellé pour chaque raccourci de date, et aucun orphelin', () => {
    // La clé est interne (`m1`…), la durée en jours reste dans AdminTab : un libellé
    // traduit ne doit jamais servir de clé de rendu.
    expect(Object.keys(dashboardFr.admin.quickDates).sort())
      .toEqual(QUICK_DATES.map(q => q.key).sort())
  })
})

/**
 * Lot 6 — les trois tables du panneau sont lues par un helper, jamais indexées à la
 * main. Le contrat est celui de `subscriptionTierLabel` : une valeur inconnue reste
 * LISIBLE (affichée brute) plutôt que de laisser un vide dans le tableau.
 */
describe('dico admin — replis des tables d\'affichage', () => {
  it('traduit les valeurs connues de profiles.role', () => {
    expect(profileRoleLabel(dashboardFr.admin, 'admin')).toBe('Admin')
    expect(profileRoleLabel(dashboardFr.admin, 'user')).toBe('Utilisateur')
    expect(profileRoleLabel(dashboardEn.admin, 'user')).toBe('User')
  })

  it('renvoie un rôle inconnu TEL QUEL, et retombe sur « user » s\'il est absent', () => {
    expect(profileRoleLabel(dashboardEn.admin, 'moderator')).toBe('moderator')
    expect(profileRoleLabel(dashboardFr.admin, null)).toBe('Utilisateur')
    expect(profileRoleLabel(dashboardEn.admin, undefined)).toBe('User')
  })

  it('traduit les deux statuts de patch, et rend brut un statut inconnu', () => {
    expect(patchStatusLabel(dashboardFr.admin, 'draft')).toBe('Brouillon')
    expect(patchStatusLabel(dashboardEn.admin, 'published')).toBe('Published')
    expect(patchStatusLabel(dashboardEn.admin, 'archived')).toBe('archived')
  })

  it('traduit les motifs de non-génération connus', () => {
    // Avant ce lot, le code brut « already_generated » s'affichait dans la phrase.
    expect(patchGenReasonLabel(dashboardFr.admin, 'already_generated')).toBe('déjà généré')
    expect(patchGenReasonLabel(dashboardEn.admin, 'race_condition')).toBe('concurrent generation')
  })

  it('conserve le comportement d\'avant le lot quand le motif est absent', () => {
    // L'ancien repli en dur était « déjà généré » : un `skipped` sans `reason` doit
    // toujours produire cette phrase, et un motif INCONNU rester lisible.
    expect(patchGenReasonLabel(dashboardFr.admin, undefined)).toBe('déjà généré')
    expect(patchGenReasonLabel(dashboardEn.admin, 'quota_exceeded')).toBe('quota_exceeded')
  })
})

/**
 * Lot 6 — gabarits du panneau. Le parcours générique vérifie la PARITÉ des marqueurs
 * entre FR et EN ; si un marqueur disparaissait des DEUX côtés, la phrase resterait
 * grammaticale mais perdrait son information (le pseudo à certifier, la version créée).
 */
describe('dico admin — marqueurs des gabarits', () => {
  it('nomme le compte visé par les deux confirmations de certification', () => {
    expect(dashboardFr.admin.actions.confirmCertify).toContain('{name}')
    expect(dashboardFr.admin.actions.confirmUncertify).toContain('{name}')
    expect(dashboardEn.admin.actions.confirmCertify).toContain('{name}')
    expect(dashboardEn.admin.actions.confirmUncertify).toContain('{name}')
  })

  it('conserve les marqueurs des messages de la section Patch Notes', () => {
    expect(dashboardFr.admin.patches.genCreated).toContain('{version}')
    expect(dashboardFr.admin.patches.genSkipped).toContain('{reason}')
    expect(dashboardFr.admin.patches.errorPrefix).toContain('{message}')
  })

  it('ne laisse aucun marqueur non substitué dans une phrase composée', () => {
    const composées = [
      dashboardFr.admin.actions.confirmCertify.replace('{name}', 'Faker'),
      dashboardEn.admin.patches.genCreated.replace('{version}', '15.10.1'),
      dashboardEn.admin.patches.genSkipped.replace(
        '{reason}', patchGenReasonLabel(dashboardEn.admin, 'already_generated'),
      ),
      dashboardFr.admin.patches.errorPrefix.replace('{message}', 'permission denied'),
    ]
    composées.forEach(t => expect(t).not.toMatch(/\{[a-z]+\}/i))
  })
})

/**
 * Lot 7 — `/profil`, `/consent` et `AuthModal`. Trois tables indexées par une valeur
 * métier, comme aux lots précédents ; les jeux de valeurs sont importés des pages, où
 * ils sont recopiés du schéma (CHECK `chk_profiles_riot_rank`, CHECK sur
 * `tracked_players.status`, `RAISE EXCEPTION` de `respond_consent`).
 */
describe('dico profil — tables d\'affichage des valeurs métier', () => {
  it('a un libellé pour chaque rang proposé par le sélecteur, et aucun orphelin', () => {
    // La migration 20260530000004 dit explicitement « Matches exactly the LOL_RANKS
    // array » : le CHECK en base et cette liste sont le même jeu de 8 valeurs.
    expect(Object.keys(dashboardFr.profil.riotRanks).sort())
      .toEqual(LOL_RANKS.map(r => r.key).sort())
    expect(Object.keys(dashboardEn.profil.riotRanks).sort())
      .toEqual(LOL_RANKS.map(r => r.key).sort())
  })

  /**
   * ⚠️ `pending` est ABSENT de `pills` volontairement : cet état affiche les boutons
   * Accepter / Refuser, pas de pastille. Le test le formalise pour qu'un futur lot ne
   * « complète » pas la table avec une entrée que rien ne rendrait.
   */
  it('a une pastille pour chaque statut qui en affiche une, et seulement ceux-là', () => {
    const avecPastille = CONSENT_STATUSES.filter(s => s !== 'pending')
    expect(Object.keys(dashboardFr.profil.consent.pills).sort()).toEqual([...avecPastille].sort())
    expect(CONSENT_STATUSES).toContain('pending')
  })

  it('a un message pour chaque code levé par respond_consent', () => {
    expect(Object.keys(dashboardFr.profil.consent.rpcErrors).sort())
      .toEqual([...CONSENT_RPC_ERRORS].sort())
  })
})

/**
 * Lot 7 — LE point de vigilance du lot. `supabaseErrors` n'est PAS une table de
 * traduction : sa clé est le message brut de Supabase, sa valeur FR est le message
 * produit, et sa valeur EN doit être le message NATIF de Supabase — donc la clé
 * elle-même. Traduire le français vers l'anglais y produirait un texte qui ne
 * correspond à rien de ce que Supabase renvoie.
 */
describe('dico auth — remappage des erreurs Supabase', () => {
  it('remplace le message natif par le texte produit en français', () => {
    expect(supabaseAuthError(dashboardFr.profil, 'Invalid login credentials'))
      .toBe('Email ou mot de passe incorrect.')
  })

  it('REDONNE le message natif de Supabase en anglais, jamais une traduction du FR', () => {
    const en = dashboardEn.profil.auth.supabaseErrors
    Object.entries(en).forEach(([natif, valeur]) => {
      expect(valeur, `« ${natif} » a été traduit au lieu d'être redonné tel quel`).toBe(natif)
    })
    expect(supabaseAuthError(dashboardEn.profil, 'Invalid login credentials'))
      .toBe('Invalid login credentials')
  })

  it('a exactement les mêmes clés des deux côtés — la clé est le contrat Supabase', () => {
    expect(Object.keys(dashboardEn.profil.auth.supabaseErrors))
      .toEqual(Object.keys(dashboardFr.profil.auth.supabaseErrors))
  })

  it('laisse passer TEL QUEL un message serveur non listé', () => {
    // On n'invente pas de traduction pour un message qu'on n'a pas vérifié : mieux
    // vaut le texte anglais de Supabase qu'un contresens en français.
    const inconnu = 'Email rate limit exceeded'
    expect(supabaseAuthError(dashboardFr.profil, inconnu)).toBe(inconnu)
    expect(supabaseAuthError(dashboardEn.profil, inconnu)).toBe(inconnu)
  })
})

/**
 * Lot 7 — replis des helpers. Même contrat qu'aux lots 2, 5 et 6 : une valeur métier
 * inconnue reste LISIBLE plutôt que de laisser un vide à l'écran.
 */
describe('dico profil — replis des helpers', () => {
  it('traduit les rangs connus et rend brut un rang inconnu', () => {
    expect(riotRankLabel(dashboardFr.profil, 'emerald')).toBe('Émeraude')
    expect(riotRankLabel(dashboardEn.profil, 'master+')).toBe('Master +')
    expect(riotRankLabel(dashboardEn.profil, 'challenger')).toBe('challenger')
  })

  it('affiche « Non renseigné » quand aucun rang n\'est enregistré', () => {
    expect(riotRankLabel(dashboardFr.profil, null)).toBe('Non renseigné')
    expect(riotRankLabel(dashboardEn.profil, undefined)).toBe('Not set')
    // Chaîne vide = colonne jamais remplie : même cas que NULL, pas un rang inconnu.
    expect(riotRankLabel(dashboardEn.profil, '')).toBe('Not set')
  })

  it('résout les trois codes de respond_consent, y compris enrobés par PostgREST', () => {
    // La recherche est un `includes` : PostgREST enrobe le code levé par
    // `RAISE EXCEPTION` dans un message plus large.
    CONSENT_RPC_ERRORS.forEach(code => {
      const brut = `invalid input: ${code} (SQLSTATE P0001)`
      expect(consentRpcError(dashboardFr.profil, brut)).toBe(dashboardFr.profil.consent.rpcErrors[code])
      expect(consentRpcError(dashboardEn.profil, brut)).not.toBe(dashboardEn.profil.consent.rpcFallback)
    })
  })

  it('retombe sur le message générique pour une erreur sans code connu', () => {
    // Erreur réseau ou permission : aucun code métier dedans.
    expect(consentRpcError(dashboardFr.profil, 'TypeError: Failed to fetch'))
      .toBe(dashboardFr.profil.consent.rpcFallback)
  })

  it('confirme chaque statut renvoyé par respond_consent', () => {
    // La fonction ne renvoie jamais `pending` (aucune transition n'y mène) : les trois
    // autres doivent avoir leur propre confirmation, distincte du repli.
    CONSENT_STATUSES.filter(s => s !== 'pending').forEach(status => {
      expect(consentOkMessage(dashboardFr.profil, status)).not.toBe(dashboardFr.profil.consent.okFallback)
      expect(consentOkMessage(dashboardEn.profil, status)).not.toBe(dashboardEn.profil.consent.okFallback)
    })
    expect(consentOkMessage(dashboardFr.profil, null)).toBe(dashboardFr.profil.consent.okFallback)
  })

  it('accorde le singulier et le pluriel des parties', () => {
    expect(gamesLabel(dashboardFr.profil, 1)).toBe('1 partie')
    expect(gamesLabel(dashboardFr.profil, 12)).toBe('12 parties')
    expect(gamesLabel(dashboardEn.profil, 1)).toBe('1 game')
    expect(gamesLabel(dashboardEn.profil, 12)).toBe('12 games')
    // 0 partie n'atteint pas ce libellé (`selfEmpty` prend la main), mais s'il y
    // arrivait un jour, il ne doit pas afficher « 0 parties ».
    expect(gamesLabel(dashboardFr.profil, 0)).toBe('0 partie')
  })
})

/**
 * Lot 7 — phrases COUPÉES autour d'un élément riche (un `<strong>`, un lien mailto).
 * Le fragment de fin porte la ponctuation ; une traduction qui la déplacerait
 * produirait une phrase sans point, ou une espace avant la ponctuation. Rien dans le
 * type ne le voit.
 */
describe('phrases coupées — ponctuation portée par le bon fragment', () => {
  it('clôt la phrase du compte protégé après le lien mailto', () => {
    // Le lien est suivi du fragment SANS espace intercalaire (JSX supprime le saut de
    // ligne) : un fragment EN commençant par un mot collerait « …com » et ce mot.
    expect(dashboardFr.profil.deletion.protectedAfter).toBe('.')
    expect(dashboardEn.profil.deletion.protectedAfter).toBe('.')
  })

  it('ne laisse aucun fragment coupé vide ni bordé d\'une espace', () => {
    const fragments = [
      dashboardFr.profil.deletion.introBefore,   dashboardEn.profil.deletion.introBefore,
      dashboardFr.profil.deletion.introAfter,    dashboardEn.profil.deletion.introAfter,
      dashboardFr.profil.deletion.confirmBefore, dashboardEn.profil.deletion.confirmBefore,
      dashboardFr.profil.deletion.confirmAfter,  dashboardEn.profil.deletion.confirmAfter,
      dashboardFr.profil.consent.pendingBefore,  dashboardEn.profil.consent.pendingBefore,
      dashboardFr.profil.consent.pendingAfter,   dashboardEn.profil.consent.pendingAfter,
    ]
    // L'espace est déjà dans le JSX, entre les deux expressions : la porter AUSSI dans
    // le dico produirait une double espace, invisible en relecture.
    fragments.forEach(f => {
      expect(f.trim(), 'fragment vide').not.toBe('')
      expect(f, `« ${f} » commence ou finit par une espace`).toBe(f.trim())
    })
  })

  it('compose la phrase de la vue self sans marqueur résiduel', () => {
    const C = dashboardEn.profil.consent
    const record = C.record.replace('{wins}', '8').replace('{losses}', '4')
    const phrase = C.selfIntroOther.replace('{count}', '12').replace('{record}', record)
    expect(phrase).toBe('Here is the data recorded about your performance (12 games · 8W 4L).')
    // Même bilan côté FR : W/L, pas V/D.
    const fr = dashboardFr.profil.consent
    expect(fr.selfIntroOther
      .replace('{count}', '12')
      .replace('{record}', fr.record.replace('{wins}', '8').replace('{losses}', '4')))
      .toBe('Voici les données enregistrées sur tes performances (12 parties · 8W 4L).')
    // Sans agrégats, `{record}` est remplacé par du vide : la parenthèse doit rester.
    expect(C.selfIntroOne.replace('{count}', '1').replace('{record}', ''))
      .toBe('Here is the data recorded about your performance (1 game).')
  })
})

/**
 * Deux notions distinctes, désormais alignées sur la MÊME convention :
 *  - le BILAN chiffré (« 8W 4L »), sur /profil comme sur /consent ;
 *  - la PASTILLE d'une partie (« W » / « L »), une seule lettre dans un rond de 20 px,
 *    servie par `common` (timeline de Stats, liste de /consent) et redéclarée dans
 *    `analyse.postgame` pour la ligne de match Post Game.
 * Décision produit de clôture du chantier : W/L PARTOUT, y compris en français. Ces
 * tests verrouillent l'absence de V/D résiduel, et le fait que les quatre pastilles
 * tiennent toujours sur un seul caractère.
 */
describe("initiales de résultat — W/L partout, dans les deux langues", () => {
  it('écrit le bilan en W/L dans les deux langues', () => {
    expect(dashboardFr.profil.page.winLoss).toBe('{wins}W {losses}L')
    expect(dashboardEn.profil.page.winLoss).toBe('{wins}W {losses}L')
    expect(dashboardFr.profil.consent.record).toBe(dashboardEn.profil.consent.record)
    expect(dashboardFr.profil.consent.record).not.toContain('V')
    expect(dashboardFr.profil.consent.record).not.toContain('D')
  })

  it('écrit les pastilles en W/L dans les deux langues', () => {
    expect(dashboardFr.common.winInitial).toBe('W')
    expect(dashboardFr.common.lossInitial).toBe('L')
    expect(dashboardEn.common.winInitial).toBe('W')
    expect(dashboardEn.common.lossInitial).toBe('L')
    expect(dashboardFr.analyse.postgame.win).toBe('W')
    expect(dashboardFr.analyse.postgame.loss).toBe('L')
    expect(dashboardEn.analyse.postgame.win).toBe('W')
    expect(dashboardEn.analyse.postgame.loss).toBe('L')
  })

  it('ne laisse aucun V/D résiduel sur les pastilles', () => {
    // La garde qui compte : c'est précisément l'incohérence relevée au Lot 7, puis
    // corrigée en deux temps — bilan chiffré, puis pastilles.
    const pastillesFr = [
      dashboardFr.common.winInitial, dashboardFr.common.lossInitial,
      dashboardFr.analyse.postgame.win, dashboardFr.analyse.postgame.loss,
    ]
    pastillesFr.forEach(p => expect(['V', 'D']).not.toContain(p))
  })

  it('garde les MOTS de résultat traduits — autre notion', () => {
    // « Victoire » / « Défaite » sont des libellés pleins (infobulle de la timeline,
    // liste des matchs d'Accueil) : eux se traduisent, contrairement aux pastilles.
    expect(dashboardFr.common.win).toBe('Victoire')
    expect(dashboardEn.common.win).toBe('Victory')
    expect(dashboardFr.common.loss).not.toBe(dashboardEn.common.loss)
  })

  it('tient les quatre pastilles sur un seul caractère', () => {
    const pastilles = [
      dashboardFr.common.winInitial, dashboardFr.common.lossInitial,
      dashboardEn.common.winInitial, dashboardEn.common.lossInitial,
      dashboardFr.analyse.postgame.win, dashboardFr.analyse.postgame.loss,
      dashboardEn.analyse.postgame.win, dashboardEn.analyse.postgame.loss,
    ]
    pastilles.forEach(p => expect(p, `« ${p} » dépasse un caractère`).toHaveLength(1))
  })
})

/**
 * Lot 8 — libellés de file. La table remplace DEUX copies divergentes :
 * `QUEUE_LABELS_LIVE` (`lib/live-game.ts`, la liste normative d'AGENTS.md §D) et le
 * `QUEUES` de l'Edge Function `riot-matches`, qui ne connaît qu'une langue.
 *
 * Le client reçoit `queueId` À CÔTÉ de `queueName` dans chaque match : c'est ce qui
 * permet d'afficher un libellé traduit SANS aucun changement d'API serveur.
 */
describe('dico common — libellés de file', () => {
  /* Les 12 `queue_id` normatifs, recopiés depuis AGENTS.md §D. */
  const QUEUE_IDS = [0, 400, 420, 430, 440, 450, 700, 900, 1020, 1400, 1700, 1900]

  it('couvre les 12 queue_id normatifs, sans orphelin', () => {
    expect(Object.keys(dashboardFr.common.queues).map(Number).sort((a, b) => a - b))
      .toEqual(QUEUE_IDS)
    expect(Object.keys(dashboardEn.common.queues).map(Number).sort((a, b) => a - b))
      .toEqual(QUEUE_IDS)
  })

  it('garde les libellés FR de la liste normative, à l\'identique', () => {
    // Le Lot 8 déplace la table, il ne réécrit pas le français : ces valeurs sont
    // celles qui vivaient dans `QUEUE_LABELS_LIVE`.
    expect(dashboardFr.common.queues[420]).toBe('Classée Solo/Duo')
    expect(dashboardFr.common.queues[1020]).toBe('Légendes Uniques')
    expect(dashboardFr.common.queues[0]).toBe('Personnalisée')
  })

  it('traduit les files dont le nom Riot diffère', () => {
    expect(dashboardEn.common.queues[420]).toBe('Ranked Solo/Duo')
    expect(dashboardEn.common.queues[1020]).toBe('One for All')
    expect(dashboardEn.common.queues[1400]).toBe('Ultimate Spellbook')
  })

  it('résout un id connu dans les deux langues', () => {
    expect(queueLabel(dashboardFr.common, 450)).toBe('ARAM')
    expect(queueLabel(dashboardEn.common, 440)).toBe('Ranked Flex')
  })

  it('garde l\'id visible pour une file inconnue', () => {
    // Comportement historique de `lib/live-game.ts`, conservé et désormais traduit :
    // l'id est la seule information disponible, elle vaut mieux qu'un « Inconnu ».
    expect(queueLabel(dashboardFr.common, 1234)).toBe('File #1234')
    expect(queueLabel(dashboardEn.common, 1234)).toBe('Queue #1234')
  })

  it('ne rend jamais « undefined » ni un vide', () => {
    const cas = [0, 420, 490, 1234, undefined, null]
    cas.forEach(id => {
      ;[dashboardFr.common, dashboardEn.common].forEach(dict => {
        const libelle = queueLabel(dict, id)
        expect(libelle).not.toContain('undefined')
        expect(libelle.trim()).not.toBe('')
      })
    })
  })

  it('conserve le marqueur d\'id dans le repli des deux langues', () => {
    // Sans `{id}`, le repli dirait « File # » — la substitution serait silencieuse.
    expect(dashboardFr.common.queueUnknown).toContain('{id}')
    expect(dashboardEn.common.queueUnknown).toContain('{id}')
  })
})

/**
 * Lot 8 — le gabarit de la date de réinitialisation du pot IA. Le JOUR est produit
 * par `Intl`, mais la façon de le joindre à l'heure est une convention de langue
 * (« à 14h05 » / « at 14:05 ») : elle vit donc dans le dico, pas dans `formatReset`.
 */
describe('dico analyse — gabarit de la date de réinitialisation', () => {
  it('porte les trois marqueurs dans les deux langues', () => {
    ;[dashboardFr.analyse.quota.resetFormat, dashboardEn.analyse.quota.resetFormat]
      .forEach(gabarit => {
        expect(gabarit).toContain('{date}')
        expect(gabarit).toContain('{hh}')
        expect(gabarit).toContain('{mm}')
      })
  })

  it('joint le jour et l\'heure différemment selon la langue', () => {
    // C'est tout l'intérêt de sortir le gabarit du code : « à 14h05 » n'a aucun sens
    // en anglais, et une locale Intl seule n'aurait pas suffi à le corriger.
    expect(dashboardFr.analyse.quota.resetFormat).not.toBe(dashboardEn.analyse.quota.resetFormat)
  })
})
