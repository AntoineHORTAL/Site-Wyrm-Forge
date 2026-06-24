// bracket-template — SOURCE UNIQUE de vérité du câblage des brackets DE.
// Trois templates explicites (4, 8, 16). Le SQL seed_bracket() reproduit EXACTEMENT
// ces tables ; le script de concordance TS↔SQL (QA) le vérifie.
//
// Convention (validée) : double élimination SANS bracket reset — grande finale en
// match unique pour 4/8/16 (l'équipe issue du LB peut être sacrée en un match).
//
// Garantie de no-rematch : STANDARD / STRUCTURELLE uniquement (cf. arbitrage chantier 1).
// Le croisement LB évite les rematches IMMÉDIATS à l'entrée des perdants WB, mais un
// rematch d'un match précoce reste possible en LB profond — exactement comme le bracket
// 8 déjà déployé (ex. M9 = P(M7) vs W(M5) peut rejouer M1). Ce n'est donc PAS une
// propriété no-rematch absolue ; validateTemplate() vérifie la correction STRUCTURELLE.

export type BracketSize = 4 | 8 | 16

export interface TemplateMatch {
  code:      string
  bracket:   'winner' | 'loser' | 'final'
  round:     number
  position:  number
  seedA:     number | null   // seed (1..N) du slot a — uniquement pour WB round 1
  seedB:     number | null
  next:      string | null   // destination du GAGNANT (code) — null pour la finale
  nextSlot:  'a' | 'b' | null
  loserNext: string | null   // destination du PERDANT (code) — null si éliminé
  loserSlot: 'a' | 'b' | null
}

// Fabrique compacte
function m(
  code: string, bracket: TemplateMatch['bracket'], round: number, position: number,
  seedA: number | null, seedB: number | null,
  next: string | null, nextSlot: 'a' | 'b' | null,
  loserNext: string | null, loserSlot: 'a' | 'b' | null,
): TemplateMatch {
  return { code, bracket, round, position, seedA, seedB, next, nextSlot, loserNext, loserSlot }
}

// ── 4 équipes (6 matchs) — seeds 1v4 / 2v3 ────────────────────────────────────
const TEMPLATE_4: TemplateMatch[] = [
  m('M1', 'winner', 1, 1, 1, 4, 'M3', 'a', 'M4', 'a'),
  m('M2', 'winner', 1, 2, 2, 3, 'M3', 'b', 'M4', 'b'),
  m('M3', 'winner', 2, 1, null, null, 'M6', 'a', 'M5', 'a'),  // finale WB
  m('M4', 'loser',  1, 1, null, null, 'M5', 'b', null, null),
  m('M5', 'loser',  2, 1, null, null, 'M6', 'b', null, null), // finale LB
  m('M6', 'final',  1, 1, null, null, null, null, null, null),
]

// ── 8 équipes (14 matchs) — IDENTIQUE à seed_bracket migration 20260611000002 ──
const TEMPLATE_8: TemplateMatch[] = [
  m('M1',  'winner', 1, 1, 1, 8, 'M7',  'a', 'M5',  'a'),
  m('M2',  'winner', 1, 2, 4, 5, 'M7',  'b', 'M5',  'b'),
  m('M3',  'winner', 1, 3, 3, 6, 'M8',  'a', 'M6',  'a'),
  m('M4',  'winner', 1, 4, 2, 7, 'M8',  'b', 'M6',  'b'),
  m('M5',  'loser',  1, 1, null, null, 'M9',  'b', null, null),
  m('M6',  'loser',  1, 2, null, null, 'M10', 'b', null, null),
  m('M7',  'winner', 2, 1, null, null, 'M11', 'a', 'M9',  'a'),
  m('M8',  'winner', 2, 2, null, null, 'M11', 'b', 'M10', 'a'),
  m('M9',  'loser',  2, 1, null, null, 'M12', 'a', null, null),
  m('M10', 'loser',  2, 2, null, null, 'M12', 'b', null, null),
  m('M11', 'winner', 3, 1, null, null, 'M14', 'a', 'M13', 'a'),
  m('M12', 'loser',  3, 1, null, null, 'M13', 'b', null, null),
  m('M13', 'loser',  4, 1, null, null, 'M14', 'b', null, null),
  m('M14', 'final',  1, 1, null, null, null, null, null, null),
]

// ── 16 équipes (30 matchs) — seeds bracket standard, croisement LB ────────────
//
// ╔══ ARTEFACT DE VÉRIFICATION (à relire) — wiring 16 ══════════════════════════╗
// Seeds WB R1 (ordre bracket standard) :
//   M1 1v16 · M2 8v9 · M3 5v12 · M4 4v13 · M5 3v14 · M6 6v11 · M7 7v10 · M8 2v15
//   ⇒ les têtes 1 et 2 ne peuvent se croiser qu'en finale WB (M15).
//
// Rounds de CHUTE des perdants WB (correction structurelle) :
//   WB R1 (M1..M8)  → LB R1 (M16..M19)   [8 perdants → 4 matchs]
//   WB R2 (M9..M12) → LB R2 (M20..M23)   [4 perdants, croisés avec survivants LB R1]
//   WB R3 (M13,M14) → LB R4 (M26,M27)    [2 perdants, croisés avec survivants LB R3]
//   WB R4 / finale WB (M15) → LB R6 / finale LB (M29.a)
//
// CROISEMENT LB (origines = match WB R1 d'où vient l'équipe) :
//   LB R2 : M20=P(M9){M1,M2} × G(M18){M5,M6}   ┐ chaque match LB R2 = un perdant
//           M21=P(M10){M3,M4} × G(M19){M7,M8}  │ WB-R2 d'une moitié × un survivant
//           M22=P(M11){M5,M6} × G(M16){M1,M2}  │ LB de l'AUTRE moitié → aucun
//           M23=P(M12){M7,M8} × G(M17){M3,M4}  ┘ rematch IMMÉDIAT (origines disjointes)
//   LB R4 : M26=P(M13){haut} × G(M25)  ┐ perdant de demi WB × survivant LB
//           M27=P(M14){bas}  × G(M24)  ┘ (entrées disjointes au moment du match)
//
// CAVEAT (assumé, cf. arbitrage) : comme pour le bracket 8, un rematch d'un match
// PRÉCOCE peut survenir en LB profond (ex. l'adversaire WB-R1 battu peut remonter
// le LB et recroiser). La garantie offerte est : bon round de chute + une seule
// source par slot + chemin du champion correct (validateTemplate). PAS de no-rematch
// absolu (cela exigerait le loser bracket « plié » canonique, hors périmètre validé).
// ╚════════════════════════════════════════════════════════════════════════════╝
const TEMPLATE_16: TemplateMatch[] = [
  // WB R1 — 8 matchs
  m('M1', 'winner', 1, 1, 1, 16, 'M9',  'a', 'M16', 'a'),
  m('M2', 'winner', 1, 2, 8, 9,  'M9',  'b', 'M16', 'b'),
  m('M3', 'winner', 1, 3, 5, 12, 'M10', 'a', 'M17', 'a'),
  m('M4', 'winner', 1, 4, 4, 13, 'M10', 'b', 'M17', 'b'),
  m('M5', 'winner', 1, 5, 3, 14, 'M11', 'a', 'M18', 'a'),
  m('M6', 'winner', 1, 6, 6, 11, 'M11', 'b', 'M18', 'b'),
  m('M7', 'winner', 1, 7, 7, 10, 'M12', 'a', 'M19', 'a'),
  m('M8', 'winner', 1, 8, 2, 15, 'M12', 'b', 'M19', 'b'),
  // WB R2 — quarts (4)
  m('M9',  'winner', 2, 1, null, null, 'M13', 'a', 'M20', 'a'),
  m('M10', 'winner', 2, 2, null, null, 'M13', 'b', 'M21', 'a'),
  m('M11', 'winner', 2, 3, null, null, 'M14', 'a', 'M22', 'a'),
  m('M12', 'winner', 2, 4, null, null, 'M14', 'b', 'M23', 'a'),
  // WB R3 — demies (2)
  m('M13', 'winner', 3, 1, null, null, 'M15', 'a', 'M26', 'a'),
  m('M14', 'winner', 3, 2, null, null, 'M15', 'b', 'M27', 'a'),
  // WB R4 — finale WB (1)
  m('M15', 'winner', 4, 1, null, null, 'M30', 'a', 'M29', 'a'),
  // LB R1 — 4 matchs (perdants WB R1)
  m('M16', 'loser', 1, 1, null, null, 'M22', 'b', null, null),
  m('M17', 'loser', 1, 2, null, null, 'M23', 'b', null, null),
  m('M18', 'loser', 1, 3, null, null, 'M20', 'b', null, null),
  m('M19', 'loser', 1, 4, null, null, 'M21', 'b', null, null),
  // LB R2 — 4 matchs (perdants WB R2 croisés)
  m('M20', 'loser', 2, 1, null, null, 'M24', 'a', null, null),
  m('M21', 'loser', 2, 2, null, null, 'M24', 'b', null, null),
  m('M22', 'loser', 2, 3, null, null, 'M25', 'a', null, null),
  m('M23', 'loser', 2, 4, null, null, 'M25', 'b', null, null),
  // LB R3 — 2 matchs
  m('M24', 'loser', 3, 1, null, null, 'M27', 'b', null, null),
  m('M25', 'loser', 3, 2, null, null, 'M26', 'b', null, null),
  // LB R4 — 2 matchs (perdants WB R3 croisés)
  m('M26', 'loser', 4, 1, null, null, 'M28', 'a', null, null),
  m('M27', 'loser', 4, 2, null, null, 'M28', 'b', null, null),
  // LB R5 — 1 match
  m('M28', 'loser', 5, 1, null, null, 'M29', 'b', null, null),
  // LB R6 — finale LB (1)
  m('M29', 'loser', 6, 1, null, null, 'M30', 'b', null, null),
  // Grande finale
  m('M30', 'final', 1, 1, null, null, null, null, null, null),
]

export const BRACKET_TEMPLATES: Record<BracketSize, TemplateMatch[]> = {
  4:  TEMPLATE_4,
  8:  TEMPLATE_8,
  16: TEMPLATE_16,
}

export const BRACKET_SIZES: BracketSize[] = [4, 8, 16]

// Convertit un template en entrée du calcul de layout (ids synthétiques).
export function templateToLayoutInput(size: BracketSize) {
  const tpl = BRACKET_TEMPLATES[size]
  const id = (code: string) => `id-${code}`
  return tpl.map((t) => ({
    id: id(t.code),
    code: t.code,
    bracket: t.bracket,
    round: t.round,
    position: t.position,
    team_a: null,
    team_b: null,
    winner_id: null,
    next_match_id: t.next ? id(t.next) : null,
    next_match_slot: t.nextSlot,
    status: 'pending' as const,
  }))
}

// ── Validation structurelle (utilisée par les tests) ─────────────────────────
// Lève une Error au premier problème. Vérifie notamment (condition #1) que CHAQUE
// slot a/b de CHAQUE match non-(WB round 1) a EXACTEMENT UNE source (ni 0 ni 2).
export function validateTemplate(size: BracketSize): true {
  const tpl = BRACKET_TEMPLATES[size]
  const byCode = new Map(tpl.map((t) => [t.code, t]))

  // Codes uniques
  if (byCode.size !== tpl.length) throw new Error(`[${size}] codes dupliqués`)

  // Nombre total de matchs attendu = 2*N - 2 (DE sans reset)
  if (tpl.length !== 2 * size - 2) {
    throw new Error(`[${size}] attendu ${2 * size - 2} matchs, trouvé ${tpl.length}`)
  }

  // Exactement une finale
  const finals = tpl.filter((t) => t.bracket === 'final')
  if (finals.length !== 1) throw new Error(`[${size}] doit avoir 1 finale, trouvé ${finals.length}`)
  if (finals[0].next !== null) throw new Error(`[${size}] la finale ne doit pas avoir de next`)

  // Compte des sources par (code, slot)
  const sources = new Map<string, number>()   // clé "CODE:a" / "CODE:b"
  const bump = (code: string | null, slot: 'a' | 'b' | null) => {
    if (!code || !slot) return
    if (!byCode.has(code)) throw new Error(`[${size}] destination inconnue ${code}`)
    sources.set(`${code}:${slot}`, (sources.get(`${code}:${slot}`) ?? 0) + 1)
  }
  for (const t of tpl) {
    if (t.next && (t.nextSlot !== 'a' && t.nextSlot !== 'b')) throw new Error(`[${size}] ${t.code} nextSlot invalide`)
    if (t.loserNext && (t.loserSlot !== 'a' && t.loserSlot !== 'b')) throw new Error(`[${size}] ${t.code} loserSlot invalide`)
    bump(t.next, t.nextSlot)
    bump(t.loserNext, t.loserSlot)
  }

  // Condition #1 : single-source par slot pour tout match non-(WB round 1)
  for (const t of tpl) {
    const isWbR1 = t.bracket === 'winner' && t.round === 1
    for (const slot of ['a', 'b'] as const) {
      const incoming = sources.get(`${t.code}:${slot}`) ?? 0
      if (isWbR1) {
        const seed = slot === 'a' ? t.seedA : t.seedB
        if (seed === null) throw new Error(`[${size}] ${t.code}.${slot} (WB R1) sans seed`)
        if (incoming !== 0) throw new Error(`[${size}] ${t.code}.${slot} (WB R1) reçoit ${incoming} source(s), attendu 0`)
      } else {
        if (incoming !== 1) {
          throw new Error(`[${size}] ${t.code}.${slot} a ${incoming} source(s), attendu EXACTEMENT 1 (trou/double câblage)`)
        }
      }
    }
  }

  // Seeds WB R1 = exactement 1..N une seule fois
  const seeds = tpl
    .filter((t) => t.bracket === 'winner' && t.round === 1)
    .flatMap((t) => [t.seedA, t.seedB])
    .filter((s): s is number => s !== null)
    .sort((a, b) => a - b)
  const expected = Array.from({ length: size }, (_, i) => i + 1)
  if (seeds.length !== size || seeds.some((s, i) => s !== expected[i])) {
    throw new Error(`[${size}] seeds WB R1 doivent être 1..${size} sans doublon`)
  }

  // Chute des perdants WB au bon round LB (correction structurelle)
  for (const t of tpl) {
    if (t.bracket === 'winner' && t.loserNext) {
      const dest = byCode.get(t.loserNext)!
      if (dest.bracket !== 'loser') throw new Error(`[${size}] ${t.code} : perdant ne tombe pas en LB`)
    }
  }

  return true
}
