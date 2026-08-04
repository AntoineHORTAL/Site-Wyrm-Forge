import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  buildPostGamePrompt, comboKey, wordBudget, MAX_TOKENS, DEPTHS, MODES,
  type PlayerFacts, type MatchFacts,
} from '../../../supabase/functions/_shared/postgame-prompt'

// Le module de prompt vit dans `supabase/functions/_shared/` (importé par l'EF
// Deno ET par le script de mesure Node). Import relatif volontaire : l'alias
// `@/` ne couvre que `src/`.

const base: PlayerFacts = {
  champion: 'Ahri', position: 'MIDDLE', win: true, durationS: 1834,
  kills: 8, deaths: 3, assists: 11,
  cs: 214, csPerMin: '7.0',
  damageDealt: 28450, damageTaken: 19320,
  visionScore: 31, wardsPlaced: 12, wardsKilled: 4, controlWards: 3,
  build: ['Écho de Luden', 'Chaussures de sorcier', 'Chapeau mortel de Rabadon'],
  trinket: 'Totem de surveillance',
  purchases: ['1:02 Anneau de Doran', '8:14 Écho de Luden', '14:30 Chaussures de sorcier'],
  deathList: ['12:03 — voie du bas, moitié adverse', '21:47 — milieu/rivière, moitié alliée'],
}

const medium: PlayerFacts = {
  ...base,
  level: 16,
  summoners: ['Flash', 'Embrasement'],
  runes: ['Comète arcanique', 'Bande de mana', 'Transcendance', 'Absolu scintillant', 'Second souffle', 'Approche prudente'],
  skillOrder: ['Q', 'W', 'E', 'Q', 'Q', 'R'],
  curve: ['10min 4.2k or / 5.1k XP / 68 CS', '20min 8.9k or / 11.3k XP / 152 CS'],
}

const advanced: PlayerFacts = {
  ...medium,
  multikills: '1 triple, 2 doubles',
  totalHeal: 4210, healOnTeammates: 0,
  timeCcOthers: 42, longestLife: 612, goldEarned: 14320,
}

const match: MatchFacts = {
  objectiveLog: ['14:02 Héraut (bleue)', '22:10 Drake infernal (rouge)', '31:44 Baron (bleue)'],
  teamObjectives: ['bleue : 9 tours, 2 drakes, 1 baron', 'rouge : 3 tours, 2 drakes, 0 baron'],
  bans: ['Yasuo', 'Zed', 'Kassadin', 'Leblanc', 'Syndra'],
}

// ════════════════════════════════════════════════════════════════════════════
//  INVARIANT CRITIQUE
// ════════════════════════════════════════════════════════════════════════════
// `simple` × `perso` est DÉJÀ en production et déjà tarifé (6 crédits Haiku /
// 17 Sonnet, mesurés sur 26 appels réels). Toute dérive du prompt — même d'un
// espace — invaliderait ce tarif et le rendrait faux pour les utilisateurs qui
// le paient. La généralisation aux 9 combinaisons ne doit donc RIEN changer à
// ce chemin : ce test compare au littéral exact d'avant refonte.
const PROD_SIMPLE_PERSO = `Tu es un coach League of Legends. Fais le bilan de la partie d'un joueur.

Ahri (MIDDLE) — Victoire en 30:34
KDA 8/3/11 · 214 CS (7.0/min)
Dégâts infligés aux champions 28450 · dégâts subis 19320
Vision 31 · 12 balises posées, 4 détruites, 3 balises de contrôle
Build final : Écho de Luden, Chaussures de sorcier, Chapeau mortel de Rabadon · Totem de surveillance
Ordre d'achat : 1:02 Anneau de Doran → 8:14 Écho de Luden → 14:30 Chaussures de sorcier
Morts : 12:03 — voie du bas, moitié adverse · 21:47 — milieu/rivière, moitié alliée

Réponds en 300 mots maximum, en français, avec exactement ces 4 sections :

1. Ce qui a marché — 2 puces maximum, 15 mots par puce.
2. Ce qui a coûté la partie — 2 puces maximum, 15 mots par puce. Appuie-toi sur le timing des morts et sur l'ordre d'achat.
3. La priorité pour la prochaine partie — une seule action concrète, 2 phrases maximum.
4. Note de performance — /10 suivi d'une seule phrase de justification.

Va droit au but : aucune introduction, aucune conclusion. Les chiffres ci-dessus te servent à juger, ne les recopie pas dans ta réponse.`

describe('simple × perso — identité byte-à-byte avec la production', () => {
  it('produit exactement le prompt déjà tarifé', () => {
    expect(buildPostGamePrompt({ self: base, depth: 'simple', mode: 'perso' }))
      .toBe(PROD_SIMPLE_PERSO)
  })

  it('reste identique même si un adversaire est fourni (mode perso l\'ignore)', () => {
    expect(buildPostGamePrompt({ self: base, opponent: advanced, depth: 'simple', mode: 'perso' }))
      .toBe(PROD_SIMPLE_PERSO)
  })
})

describe('Structure — les 9 combinaisons', () => {
  it('les 9 clés sont bien formées et distinctes', () => {
    const keys = DEPTHS.flatMap(d => MODES.map(m => comboKey(d, m)))
    expect(keys).toHaveLength(9)
    expect(new Set(keys).size).toBe(9)
    expect(keys).toContain('simple_perso')
    expect(keys).toContain('advanced_les_deux')
  })

  it('chaque combinaison a un budget de mots explicite et croissant', () => {
    for (const m of MODES) {
      expect(wordBudget('simple', m)).toBeLessThan(wordBudget('medium', m))
      expect(wordBudget('medium', m)).toBeLessThan(wordBudget('advanced', m))
    }
    // « les_deux » traite deux joueurs → budget supérieur à profondeur égale.
    for (const d of DEPTHS) {
      expect(wordBudget(d, 'les_deux')).toBeGreaterThan(wordBudget(d, 'perso'))
    }
  })

  it('le nombre de sections annoncé correspond au nombre réellement listé', () => {
    for (const d of DEPTHS) for (const m of MODES) {
      const p = buildPostGamePrompt({ self: advanced, opponent: advanced, match, depth: d, mode: m })
      const annonce = Number(/avec exactement ces (\d+) sections/.exec(p)![1])
      const listees = (p.match(/^\d+\. /gm) ?? []).length
      expect(listees, `${comboKey(d, m)}`).toBe(annonce)
    }
  })

  it('la profondeur ajoute des sections sans jamais en retirer', () => {
    const count = (d: 'simple' | 'medium' | 'advanced') =>
      (buildPostGamePrompt({ self: advanced, opponent: advanced, match, depth: d, mode: 'perso' })
        .match(/^\d+\. /gm) ?? []).length
    expect(count('simple')).toBe(4)
    expect(count('medium')).toBe(5)
    expect(count('advanced')).toBe(6)
  })

  it('« les_deux » = « perso » + exactement une section de comparaison', () => {
    for (const d of DEPTHS) {
      const n = (m: 'perso' | 'les_deux') =>
        (buildPostGamePrompt({ self: advanced, opponent: advanced, match, depth: d, mode: m })
          .match(/^\d+\. /gm) ?? []).length
      expect(n('les_deux')).toBe(n('perso') + 1)
    }
    expect(buildPostGamePrompt({ self: advanced, opponent: advanced, match, depth: 'simple', mode: 'les_deux' }))
      .toContain('Face à face')
  })
})

describe('Contenu par palier', () => {
  it('simple n\'expose ni runes ni courbes ni objectifs', () => {
    const p = buildPostGamePrompt({ self: advanced, opponent: advanced, match, depth: 'simple', mode: 'perso' })
    expect(p).not.toContain('Runes :')
    expect(p).not.toContain('Courbe par minute')
    expect(p).not.toContain('Objectifs dans l\'ordre')
  })

  it('medium ajoute runes, sorts, ordre des compétences et courbes — pas les objectifs', () => {
    const p = buildPostGamePrompt({ self: advanced, opponent: advanced, match, depth: 'medium', mode: 'perso' })
    expect(p).toContain('Runes :')
    expect(p).toContain('sorts d\'invocateur')
    expect(p).toContain('Ordre des compétences :')
    expect(p).toContain('Courbe par minute :')
    expect(p).not.toContain('Objectifs dans l\'ordre')
  })

  it('advanced ajoute faits d\'armes, objectifs et bans', () => {
    const p = buildPostGamePrompt({ self: advanced, opponent: advanced, match, depth: 'advanced', mode: 'perso' })
    expect(p).toContain('Faits d\'armes :')
    expect(p).toContain('Objectifs dans l\'ordre :')
    expect(p).toContain('Bans :')
  })

  it('mode adversaire ne parle QUE de l\'adversaire (pas de double bloc)', () => {
    const opp: PlayerFacts = { ...advanced, champion: 'Zed' }
    const p = buildPostGamePrompt({ self: base, opponent: opp, depth: 'simple', mode: 'adversaire' })
    expect(p).toContain('Zed')
    expect(p).not.toContain('Ahri')
    expect(p).toContain('failles exploitables')
  })

  it('mode les_deux présente les deux joueurs', () => {
    const opp: PlayerFacts = { ...advanced, champion: 'Zed' }
    const p = buildPostGamePrompt({ self: base, opponent: opp, depth: 'simple', mode: 'les_deux' })
    expect(p).toContain('Ahri')
    expect(p).toContain('Zed')
    expect(p).toContain('Adversaire de voie :')
  })
})

// ════════════════════════════════════════════════════════════════════════════
//  Garde anti-dérive de la grille de coûts
// ════════════════════════════════════════════════════════════════════════════
// La grille vit dans l'EF (source de vérité, servie au client via `costs`).
// Ce test lit le fichier de l'EF : si une valeur y change sans re-mesure, il
// échoue et force à re-justifier le tarif au lieu de le laisser glisser.
describe('Grille de coûts de l\'EF — mesure du 2026-08-01', () => {
  const src = readFileSync(
    resolve(__dirname, '../../../supabase/functions/postgame-analyze/index.ts'), 'utf-8')

  const grid = (marker: 'SONNET' | 'HAIKU'): Record<string, number> => {
    const block = new RegExp(`\\[${marker}\\]: \\{([^}]*)\\}`, 's').exec(src)
    if (!block) throw new Error(`bloc ${marker} introuvable dans l'EF`)
    const out: Record<string, number> = {}
    for (const [, k, v] of block[1].matchAll(/(\w+):\s*(\d+)/g)) out[k] = Number(v)
    return out
  }

  const SONNET = { simple_perso: 17, simple_adversaire: 17, simple_les_deux: 20,
    medium_perso: 22, medium_adversaire: 22, medium_les_deux: 25,
    advanced_perso: 27, advanced_adversaire: 27, advanced_les_deux: 31 }
  const HAIKU = { simple_perso: 6, simple_adversaire: 6, simple_les_deux: 7,
    medium_perso: 7, medium_adversaire: 7, medium_les_deux: 8,
    advanced_perso: 9, advanced_adversaire: 9, advanced_les_deux: 10 }

  it('les 9 clés Sonnet correspondent à la mesure', () => {
    expect(grid('SONNET')).toEqual(SONNET)
  })

  it('les 9 clés Haiku correspondent à la mesure', () => {
    expect(grid('HAIKU')).toEqual(HAIKU)
  })

  it('aucune combinaison n\'est laissée à 0 (tarif non mesuré)', () => {
    for (const marker of ['SONNET', 'HAIKU'] as const) {
      const g = grid(marker)
      expect(Object.keys(g), marker).toHaveLength(9)
      for (const [k, v] of Object.entries(g)) expect(v, `${marker}.${k}`).toBeGreaterThan(0)
    }
  })

  // Le tarif « pire cas » est proportionnel au plafond de sortie : les deux
  // doivent bouger ensemble, sinon la grille devient fausse en silence.
  it('les plafonds de sortie mesurés sont ceux du module partagé', () => {
    expect(MAX_TOKENS).toEqual({ simple: 900, medium: 1100, advanced: 1300 })
  })
})

describe('Robustesse — champs medium/advanced absents', () => {
  it('ne produit ni "undefined" ni "NaN" quand les données enrichies manquent', () => {
    // `base` n'a aucun champ medium/advanced : le prompt doit dégrader en
    // « inconnues »/« indisponible », jamais laisser fuiter un undefined.
    for (const d of DEPTHS) for (const m of MODES) {
      const p = buildPostGamePrompt({ self: base, opponent: base, match: null, depth: d, mode: m })
      expect(p, comboKey(d, m)).not.toContain('undefined')
      expect(p, comboKey(d, m)).not.toContain('NaN')
    }
  })

  it('advanced sans MatchFacts omet le bloc au lieu de planter', () => {
    const p = buildPostGamePrompt({ self: advanced, opponent: advanced, match: null, depth: 'advanced', mode: 'perso' })
    expect(p).not.toContain('Objectifs dans l\'ordre')
    expect(p).toContain('Déroulé et objectifs')   // la section reste demandée
  })
})
