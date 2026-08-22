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
  // Infobulle d'un item du Workshop : nom + quantité, aucun mot à traduire.
  '{name} (×{count})',
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
