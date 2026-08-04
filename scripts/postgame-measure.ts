/**
 * ════════════════════════════════════════════════════════════════════════════
 *  postgame-measure — grille de coûts réelle des 9 combinaisons PostGame
 * ════════════════════════════════════════════════════════════════════════════
 * Appels Anthropic RÉELS, non mockés. Mesure `usage.input_tokens` /
 * `usage.output_tokens` / `stop_reason` renvoyés par l'API.
 *
 * ⚠️ Importe `buildPostGamePrompt` depuis `_shared/postgame-prompt.ts` — le
 * MÊME module que l'Edge Function. Le prompt mesuré est donc byte-identique au
 * prompt servi ; une grille mesurée sur une copie dériverait en silence.
 *
 * Méthodologie (identique à celle de `simple_perso`, cf. AGENTS.md § Lot 1) :
 *  - cas « pire » : tous les plafonds structurels de l'EF atteints
 *    (25 achats, 15 morts, 18 skills, 8 points de courbe, 25 objectifs,
 *    10 bans, et DEUX joueurs complets en mode `les_deux`)
 *  - cas « typique » : partie moyenne, pour vérifier que le coût ne dépend
 *    pas du volume d'entrée (leçon du Lot 1)
 *  - 2 runs sur le pire cas (variance de sortie) + 1 sur le typique
 *  - AUCUNE extrapolation entre combinaisons : chacune est mesurée à part
 *
 * L'ordre de passage attaque `advanced × les_deux` EN PREMIER : c'est le pire
 * cas de toute la matrice, une troncature doit se découvrir tout de suite.
 *
 * Usage :  ANTHROPIC_API_KEY=... npx tsx scripts/postgame-measure.ts [--quick]
 *          --quick  → 1 seul run par combinaison/modèle (dégrossir sans payer)
 */
import {
  buildPostGamePrompt, comboKey, MAX_TOKENS,
  type PostGameDepth, type PostGameMode, type PlayerFacts, type MatchFacts,
} from '../supabase/functions/_shared/postgame-prompt'

const KEY = process.env.ANTHROPIC_API_KEY
if (!KEY) { console.error('ANTHROPIC_API_KEY manquante.'); process.exit(1) }

const QUICK = process.argv.includes('--quick')

// ── Tarifs, $ par million de tokens. 1 crédit = 0,001 $. ────────────────────
// Sonnet 5 au tarif STANDARD (3/15), pas au tarif d'introduction (2/10) qui
// expire le 31/08/2026 : budgéter sur l'intro, c'est être court de 50 % après.
const MODELS = {
  'claude-sonnet-5':  { in: 3, out: 15 },
  'claude-haiku-4-5': { in: 1, out:  5 },
} as const
type ModelId = keyof typeof MODELS

// MAX_TOKENS vient du module partagé — même valeur que celle déployée. Mesurer
// à un plafond qu'on ne déploie pas ne testerait pas la config de production
// (leçon du Lot 1 MatchUp : la troncature réapparaît précisément au plafond réel).

// ── Jeux de faits synthétiques ──────────────────────────────────────────────
const ITEMS_LONGS = [
  'Lame du roi déchu', 'Chapeau mortel de Rabadon', 'Écho de Luden',
  'Gardien immortel', 'Danseur fantôme', 'Souffle du dragon',
  'Cuirasse du soleil levant', 'Coiffe de Rylai', 'Sablier de Zhonya',
  'Bâton du néant abyssal', 'Larme de la déesse', 'Lame d\'infini',
  'Rancune de Serylda', 'Masque abyssal', 'Gantelet de glace',
  'Étreinte du Titan', 'Trinité', 'Fléau des Immortels',
  'Faucheuse de l\'Aube', 'Voile de la Banshee', 'Anathème des mages',
  'Malédiction du Mort-vivant', 'Baume de vie', 'Botte de mobilité',
  'Chaussures de sorcier',
]

const RUNES_COMPLETES = [
  'Conquérant', 'Triomphe', 'Légende : alacrité', 'Coup de grâce',
  'Second souffle', 'Approche prudente', 'Force adaptative', 'Vitesse d\'attaque', 'PV',
]

const worstPlayer = (champion: string, position: string, win: boolean): PlayerFacts => ({
  champion, position, win, durationS: 2410,
  kills: 14, deaths: 15, assists: 21,
  cs: 312, csPerMin: '7.8',
  damageDealt: 48620, damageTaken: 41250,
  visionScore: 64, wardsPlaced: 28, wardsKilled: 13, controlWards: 9,
  build: ITEMS_LONGS.slice(0, 6),
  trinket: 'Totem de surveillance',
  // 25 achats — plafond CAP_PURCHASES
  purchases: Array.from({ length: 25 }, (_, i) =>
    `${Math.floor(i * 1.6) + 1}:${String((i * 17) % 60).padStart(2, '0')} ${ITEMS_LONGS[i % ITEMS_LONGS.length]}`),
  // 15 morts — plafond CAP_DEATHS
  deathList: Array.from({ length: 15 }, (_, i) =>
    `${8 + i * 2}:${String((i * 13) % 60).padStart(2, '0')} — ${['voie du bas', 'milieu/rivière', 'voie du haut'][i % 3]}, ${i % 2 ? 'moitié adverse' : 'moitié alliée'}`),
  level: 18,
  summoners: ['Flash', 'Téléportation'],
  runes: RUNES_COMPLETES,
  // 18 montées — plafond CAP_SKILLS
  skillOrder: Array.from({ length: 18 }, (_, i) => ['Q', 'W', 'E', 'R'][i % 4]),
  // 8 points — plafond CAP_CURVE
  curve: Array.from({ length: 8 }, (_, i) =>
    `${(i + 1) * 5}min ${(2.1 * (i + 1)).toFixed(1)}k or / ${(2.8 * (i + 1)).toFixed(1)}k XP / ${34 * (i + 1)} CS`),
  multikills: '1 penta, 2 quadras, 3 triples, 5 doubles',
  totalHeal: 18450, healOnTeammates: 6210,
  timeCcOthers: 128, longestLife: 842, goldEarned: 21340,
})

const typicalPlayer = (champion: string, position: string, win: boolean): PlayerFacts => ({
  champion, position, win, durationS: 1610,
  kills: 6, deaths: 4, assists: 9,
  cs: 178, csPerMin: '6.6',
  damageDealt: 21300, damageTaken: 16800,
  visionScore: 24, wardsPlaced: 9, wardsKilled: 3, controlWards: 2,
  build: ITEMS_LONGS.slice(0, 3), trinket: 'Totem de surveillance',
  purchases: Array.from({ length: 8 }, (_, i) => `${i * 3 + 2}:10 ${ITEMS_LONGS[i]}`),
  deathList: Array.from({ length: 4 }, (_, i) => `${10 + i * 5}:20 — voie du bas, moitié adverse`),
  level: 15,
  summoners: ['Flash', 'Embrasement'],
  runes: RUNES_COMPLETES.slice(0, 6),
  skillOrder: ['Q', 'W', 'Q', 'E', 'Q', 'R', 'Q', 'W'],
  curve: Array.from({ length: 3 }, (_, i) => `${(i + 1) * 5}min ${(2 * (i + 1)).toFixed(1)}k or / ${(2.6 * (i + 1)).toFixed(1)}k XP / ${32 * (i + 1)} CS`),
  multikills: '1 double',
  totalHeal: 3200, healOnTeammates: 0,
  timeCcOthers: 31, longestLife: 460, goldEarned: 11200,
})

const worstMatch: MatchFacts = {
  // 25 objectifs — plafond CAP_OBJECTIVES
  objectiveLog: Array.from({ length: 25 }, (_, i) =>
    `${6 + i}:${String((i * 7) % 60).padStart(2, '0')} ${['Tour outer mid', 'Drake infernal', 'Héraut', 'Baron', 'Inhibiteur bot', 'Larve du Néant'][i % 6]} (${i % 2 ? 'bleue' : 'rouge'})`),
  teamObjectives: [
    'bleue : 9 tours, 3 drakes, 2 baron, 1 héraut',
    'rouge : 4 tours, 2 drakes, 0 baron, 1 héraut',
  ],
  bans: ['Yasuo', 'Zed', 'Kassadin', 'Leblanc', 'Syndra', 'Akali', 'Camille', 'Aatrox', 'Renekton', 'Irelia'],
}

const typicalMatch: MatchFacts = {
  objectiveLog: Array.from({ length: 9 }, (_, i) => `${8 + i * 3}:00 ${['Tour outer mid', 'Drake', 'Héraut'][i % 3]} (${i % 2 ? 'bleue' : 'rouge'})`),
  teamObjectives: ['bleue : 6 tours, 2 drakes, 1 baron, 0 héraut', 'rouge : 3 tours, 1 drake, 0 baron, 1 héraut'],
  bans: ['Yasuo', 'Zed', 'Kassadin', 'Leblanc', 'Syndra'],
}

interface Case { label: 'pire' | 'typique'; self: PlayerFacts; opp: PlayerFacts; match: MatchFacts }
const CASES: Case[] = [
  { label: 'pire',    self: worstPlayer('Aurelion Sol', 'MIDDLE', false), opp: worstPlayer('Kassadin', 'MIDDLE', true),  match: worstMatch },
  { label: 'typique', self: typicalPlayer('Ahri', 'MIDDLE', true),        opp: typicalPlayer('Zed', 'MIDDLE', false),    match: typicalMatch },
]

// ── Appel Anthropic ─────────────────────────────────────────────────────────
interface Run {
  combo: string; model: ModelId; caseLabel: string
  inTok: number; outTok: number; stop: string; credits: number
}

async function callOnce(model: ModelId, depth: PostGameDepth, mode: PostGameMode, c: Case): Promise<Run> {
  const prompt = buildPostGamePrompt({
    self: c.self, opponent: c.opp, match: c.match, depth, mode,
  })
  const payload: Record<string, unknown> = {
    model, max_tokens: MAX_TOKENS[depth],
    messages: [{ role: 'user', content: prompt }],
  }
  if (model.startsWith('claude-sonnet')) payload.thinking = { type: 'disabled' }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': KEY!, 'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
  const doc = await res.json()
  if (!res.ok || doc.error) {
    throw new Error(`${model} ${comboKey(depth, mode)} → ${res.status} ${JSON.stringify(doc.error ?? doc).slice(0, 200)}`)
  }
  const inTok  = doc.usage.input_tokens
  const outTok = doc.usage.output_tokens
  const price  = MODELS[model]
  // Tarif RÉEL de ce run (pas le pire cas) — le pire cas est calculé après.
  const credits = (inTok * price.in + outTok * price.out) / 1000
  return { combo: comboKey(depth, mode), model, caseLabel: c.label, inTok, outTok, stop: doc.stop_reason, credits }
}

// ── Ordre de passage : le pire cas de la matrice EN PREMIER ─────────────────
const ORDER: Array<[PostGameDepth, PostGameMode]> = [
  ['advanced', 'les_deux'],      // ← pire cas absolu, mesuré en premier
  ['advanced', 'perso'], ['advanced', 'adversaire'],
  ['medium', 'les_deux'], ['medium', 'perso'], ['medium', 'adversaire'],
  ['simple', 'les_deux'], ['simple', 'perso'], ['simple', 'adversaire'],
]

async function main() {
  const runs: Run[] = []
  const failures: string[] = []

  for (const [depth, mode] of ORDER) {
    for (const model of Object.keys(MODELS) as ModelId[]) {
      const plan: Case[] = QUICK
        ? [CASES[0]]
        : [CASES[0], CASES[0], CASES[1]]   // 2× pire (variance) + 1× typique
      for (const c of plan) {
        try {
          const r = await callOnce(model, depth, mode, c)
          runs.push(r)
          const flag = r.stop === 'max_tokens' ? '  ⚠ TRONQUÉ' : ''
          console.log(
            `${r.combo.padEnd(22)} ${model.padEnd(18)} ${c.label.padEnd(8)} ` +
            `in=${String(r.inTok).padStart(5)} out=${String(r.outTok).padStart(5)} ` +
            `stop=${r.stop.padEnd(11)} ${r.credits.toFixed(1)} cr${flag}`)
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e)
          failures.push(msg)
          console.error('ÉCHEC', msg)
        }
      }
    }
  }

  // ── Grille finale ─────────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(78))
  console.log('GRILLE DE COÛTS — tarif PIRE CAS (entrée max mesurée × prix in + MAX_TOKENS × prix out)')
  console.log('═'.repeat(78))

  const table: Record<string, Record<string, number>> = {}
  for (const model of Object.keys(MODELS) as ModelId[]) {
    table[model] = {}
    console.log(`\n### ${model}`)
    console.log('combinaison            | in max | out max | plafond | tronq. | CRÉDITS')
    console.log('-'.repeat(72))
    for (const [depth, mode] of [...ORDER].reverse()) {
      const key = comboKey(depth, mode)
      const rs = runs.filter(r => r.combo === key && r.model === model)
      if (!rs.length) { console.log(`${key.padEnd(22)} | AUCUNE MESURE`); continue }
      const inMax  = Math.max(...rs.map(r => r.inTok))
      const outMax = Math.max(...rs.map(r => r.outTok))
      const trunc  = rs.filter(r => r.stop === 'max_tokens').length
      const cap    = MAX_TOKENS[depth]
      const price  = MODELS[model]
      const credits = Math.ceil((inMax * price.in + cap * price.out) / 1000)
      table[model][key] = credits
      console.log(
        `${key.padEnd(22)} | ${String(inMax).padStart(6)} | ${String(outMax).padStart(7)} | ` +
        `${String(cap).padStart(7)} | ${String(trunc).padStart(2)}/${rs.length}   | ${String(credits).padStart(4)}` +
        (trunc ? '  ⚠ TRONCATURE' : ''))
    }
  }

  console.log('\n// ── À recopier dans COST_CREDITS de postgame-analyze ──')
  for (const model of Object.keys(MODELS) as ModelId[]) {
    console.log(`  [${model === 'claude-sonnet-5' ? 'SONNET' : 'HAIKU'}]: ${JSON.stringify(table[model], null, 0)},`)
  }

  const truncated = runs.filter(r => r.stop === 'max_tokens')
  console.log(`\n${runs.length} runs · ${truncated.length} troncature(s) · ${failures.length} échec(s)`)
  if (truncated.length) {
    console.log('⚠ TRONCATURES — relever MAX_TOKENS puis re-mesurer :')
    for (const t of truncated) console.log(`   ${t.combo} / ${t.model} / ${t.caseLabel}`)
  }
  // Marge de sortie : la métrique qui dit si le plafond est bien calibré.
  for (const [depth] of ORDER) {
    const rs = runs.filter(r => r.combo.startsWith(depth))
    if (!rs.length) continue
    const outMax = Math.max(...rs.map(r => r.outTok))
    const cap = MAX_TOKENS[depth]
    console.log(`marge ${depth.padEnd(9)} : sortie max ${outMax} / ${cap} → ${Math.round((1 - outMax / cap) * 100)} % de marge`)
  }
  if (failures.length) process.exitCode = 1
}

main().catch(e => { console.error(e); process.exit(1) })
