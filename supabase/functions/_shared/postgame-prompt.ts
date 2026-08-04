// ════════════════════════════════════════════════════════════════════════════
//  postgame-prompt — construction des prompts des 9 combinaisons PostGame
// ════════════════════════════════════════════════════════════════════════════
// 3 profondeurs (simple / medium / advanced) × 3 modes (perso / adversaire /
// les_deux). Module PUR : aucun import, aucune API Deno, aucun accès réseau.
//
// ⚠️ C'est ce qui permet au script de mesure (`scripts/postgame-measure.ts`,
// lancé sous Node/tsx) d'importer EXACTEMENT le prompt de production au lieu
// d'en recopier une version qui dériverait en silence. La grille de coûts perd
// toute valeur si le prompt mesuré n'est pas le prompt servi.
//
// ── Leçon du Lot 1 (budget IA), appliquée à chaque palier ──────────────────
// C'est le TEMPLATE DE RÉPONSE qui pilote le coût, pas le volume de données en
// entrée. D'où, pour chaque combinaison : un budget de mots explicite, des
// sections numérotées avec un plafond par section, et l'interdiction de
// recopier les chiffres fournis. Ne pas rallonger ces consignes sans
// re-mesurer — c'est l'erreur du prompt V1 de MatchUp, corrigée après coup.
//
// ⚠️ INVARIANT : la combinaison `simple` × `perso` doit produire un prompt
// BYTE-IDENTIQUE à celui déjà en production (mesuré à 6 crédits Haiku /
// 17 Sonnet). Changer ce prompt invaliderait un tarif déjà facturé aux
// utilisateurs. Un test verrouille cette identité (`postgame-prompt.test.ts`).

export type PostGameDepth = 'simple' | 'medium' | 'advanced'
export type PostGameMode  = 'perso' | 'adversaire' | 'les_deux'

export const DEPTHS: readonly PostGameDepth[] = ['simple', 'medium', 'advanced']
export const MODES:  readonly PostGameMode[]  = ['perso', 'adversaire', 'les_deux']

/** Clé de combinaison, utilisée partout : coûts, contrat client, mesures. */
export const comboKey = (d: PostGameDepth, m: PostGameMode): string => `${d}_${m}`

export interface PlayerFacts {
  champion: string; position: string; win: boolean; durationS: number
  kills: number; deaths: number; assists: number
  cs: number; csPerMin: string
  damageDealt: number; damageTaken: number
  visionScore: number; wardsPlaced: number; wardsKilled: number; controlWards: number
  build: string[]; trinket: string
  purchases: string[]     // « 8:14 Écho de Luden »
  deathList: string[]     // « 12:03 — voie du bas, moitié adverse »
  // ── medium+ ──────────────────────────────────────────────────────────────
  level?: number
  summoners?: string[]    // « Flash », « Embrasement »
  runes?: string[]        // « Conquérant », « Triomphe », … (6 + fragments)
  skillOrder?: string[]   // « Q », « W », « Q », … (ordre de montée)
  curve?: string[]        // « 10min 4.2k or / 5.1k XP / 68 CS »
  // ── advanced ─────────────────────────────────────────────────────────────
  multikills?: string     // « 1 triple, 2 doubles »
  totalHeal?: number; healOnTeammates?: number
  timeCcOthers?: number; longestLife?: number; goldEarned?: number
}

export interface MatchFacts {
  /** Déroulé chronologique des objectifs — « 14:02 Héraut (bleue) ». */
  objectiveLog: string[]
  /** Bilan par équipe — « bleue : 9 tours, 3 drakes, 1 baron ». */
  teamObjectives: string[]
  /** Champions bannis, tous camps confondus. */
  bans: string[]
}

const mmss = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

// Budget de mots par combinaison. Croît avec la profondeur (plus de matière à
// couvrir) et avec le mode « les_deux » (deux joueurs à traiter).
const WORD_BUDGET: Record<string, number> = {
  simple_perso:       300, simple_adversaire:       300, simple_les_deux:       400,
  medium_perso:       450, medium_adversaire:       450, medium_les_deux:       550,
  advanced_perso:     600, advanced_adversaire:     600, advanced_les_deux:     750,
}

export const wordBudget = (d: PostGameDepth, m: PostGameMode): number =>
  WORD_BUDGET[comboKey(d, m)] ?? 300

/**
 * Plafond de sortie par profondeur — SOURCE UNIQUE, lue par l'EF *et* par le
 * script de mesure. Les garder séparés serait le meilleur moyen de tarifer une
 * configuration qui n'est pas celle déployée.
 *
 * Calibrage (mesure du 2026-08-01, sorties max observées) :
 *   simple   460 / 900  → 49 % de marge — valeur de PRODUCTION, non touchée
 *   medium   618 / 1100 → 44 % de marge
 *   advanced 738 / 1300 → 43 % de marge
 *
 * ⚠️ Le tarif « pire cas » est DIRECTEMENT proportionnel à ce plafond
 * (coût = entrée max × prix_in + MAX_TOKENS × prix_out). Le surdimensionner
 * fait payer aux utilisateurs une sortie qu'ils n'obtiennent jamais ; le
 * réduire trop fait tronquer. Toute modification impose de re-mesurer.
 */
export const MAX_TOKENS: Record<PostGameDepth, number> = {
  simple: 900, medium: 1100, advanced: 1300,
}

/**
 * Bloc de faits d'un joueur. Les 7 premières lignes sont FIGÉES (identité
 * byte-à-byte du prompt `simple` déjà en production) ; les paliers medium et
 * advanced n'ajoutent que des lignes SUPPLÉMENTAIRES, jamais de réécriture.
 */
function playerBlock(f: PlayerFacts, depth: PostGameDepth): string {
  const res = f.win ? 'Victoire' : 'Défaite'
  const dur = mmss(f.durationS * 1000)
  const lines = [
    `${f.champion}${f.position ? ` (${f.position})` : ''} — ${res} en ${dur}`,
    `KDA ${f.kills}/${f.deaths}/${f.assists} · ${f.cs} CS (${f.csPerMin}/min)`,
    `Dégâts infligés aux champions ${f.damageDealt} · dégâts subis ${f.damageTaken}`,
    `Vision ${f.visionScore} · ${f.wardsPlaced} balises posées, ${f.wardsKilled} détruites, ${f.controlWards} balises de contrôle`,
    `Build final : ${f.build.join(', ') || 'aucun objet'}${f.trinket ? ` · ${f.trinket}` : ''}`,
    `Ordre d'achat : ${f.purchases.join(' → ') || 'aucun achat enregistré'}`,
    `Morts : ${f.deathList.length ? f.deathList.join(' · ') : 'aucune'}`,
  ]

  if (depth !== 'simple') {
    lines.push(
      `Niveau final ${f.level ?? '?'} · sorts d'invocateur ${f.summoners?.join(', ') || 'inconnus'}`,
      `Runes : ${f.runes?.join(', ') || 'inconnues'}`,
      `Ordre des compétences : ${f.skillOrder?.join('') || 'inconnu'}`,
      `Courbe par minute : ${f.curve?.join(' · ') || 'indisponible'}`,
    )
  }

  if (depth === 'advanced') {
    lines.push(
      `Faits d'armes : ${f.multikills || 'aucun multikill'} · soin ${f.totalHeal ?? 0} (dont ${f.healOnTeammates ?? 0} sur alliés) · CC infligé ${f.timeCcOthers ?? 0}s · plus longue vie ${mmss((f.longestLife ?? 0) * 1000)} · or total ${f.goldEarned ?? 0}`,
    )
  }

  return lines.join('\n')
}

function matchBlock(m: MatchFacts): string {
  return [
    `Objectifs dans l'ordre : ${m.objectiveLog.join(' · ') || 'aucun objectif enregistré'}`,
    `Bilan par équipe : ${m.teamObjectives.join(' / ') || 'indisponible'}`,
    `Bans : ${m.bans.join(', ') || 'aucun ban'}`,
  ].join('\n')
}

/**
 * Sections de réponse, dans l'ordre. `les_deux` est construit comme une
 * EXTENSION de `perso` (une section de comparaison en plus), et non comme un
 * template séparé — c'est ce qui empêche la prolifération de 9 gabarits
 * indépendants à maintenir.
 */
function sections(depth: PostGameDepth, mode: PostGameMode): string[] {
  const adv = mode === 'adversaire'
  const out: string[] = []

  out.push(adv
    ? 'Les forces de l\'adversaire — 2 puces maximum, 15 mots par puce.'
    : 'Ce qui a marché — 2 puces maximum, 15 mots par puce.')

  out.push(adv
    ? 'Ses failles exploitables — 2 puces maximum, 15 mots par puce. Appuie-toi sur le timing de ses morts et sur son ordre d\'achat.'
    : 'Ce qui a coûté la partie — 2 puces maximum, 15 mots par puce. Appuie-toi sur le timing des morts et sur l\'ordre d\'achat.')

  if (depth !== 'simple') {
    out.push('Construction et courbes — 2 puces maximum : pertinence des runes, des sorts d\'invocateur et de l\'ordre des compétences, et rythme d\'or et d\'XP.')
  }

  if (depth === 'advanced') {
    out.push('Déroulé et objectifs — 2 puces maximum : impact sur les objectifs et moments de bascule de la partie.')
  }

  if (mode === 'les_deux') {
    out.push('Face à face — 2 puces maximum comparant les deux joueurs sur le même terrain : farm, vision, morts, construction.')
  }

  out.push(adv
    ? 'Le plan pour le contrer — une seule action concrète, 2 phrases maximum.'
    : 'La priorité pour la prochaine partie — une seule action concrète, 2 phrases maximum.')

  out.push(adv
    ? 'Note de sa performance — /10 suivi d\'une seule phrase de justification.'
    : 'Note de performance — /10 suivi d\'une seule phrase de justification.')

  return out
}

function intro(mode: PostGameMode): string {
  switch (mode) {
    case 'adversaire':
      return 'Tu es un coach League of Legends. Analyse l\'adversaire de voie d\'un joueur pour l\'aider à le contrer.'
    case 'les_deux':
      return 'Tu es un coach League of Legends. Fais le bilan de la partie d\'un joueur et compare-le à son adversaire de voie.'
    default:
      return 'Tu es un coach League of Legends. Fais le bilan de la partie d\'un joueur.'
  }
}

export interface PromptInput {
  self: PlayerFacts
  /** Requis dès que `mode !== 'perso'`. */
  opponent?: PlayerFacts | null
  /** Requis pour `depth === 'advanced'`. */
  match?: MatchFacts | null
  depth: PostGameDepth
  mode: PostGameMode
}

export function buildPostGamePrompt({ self, opponent, match, depth, mode }: PromptInput): string {
  const parts: string[] = [intro(mode)]

  // Mode `adversaire` : seul le bloc adverse est fourni — inutile de payer en
  // tokens d'entrée des stats dont aucune section ne parle.
  if (mode === 'adversaire') {
    if (opponent) parts.push(playerBlock(opponent, depth))
  } else {
    parts.push(playerBlock(self, depth))
    if (mode === 'les_deux' && opponent) {
      parts.push(`Adversaire de voie :\n${playerBlock(opponent, depth)}`)
    }
  }

  if (depth === 'advanced' && match) parts.push(matchBlock(match))

  const secs = sections(depth, mode)
  const numbered = secs.map((s, i) => `${i + 1}. ${s}`).join('\n')

  parts.push(
    `Réponds en ${wordBudget(depth, mode)} mots maximum, en français, avec exactement ces ${secs.length} sections :\n\n${numbered}`,
    'Va droit au but : aucune introduction, aucune conclusion. Les chiffres ci-dessus te servent à juger, ne les recopie pas dans ta réponse.',
  )

  return parts.join('\n\n')
}
