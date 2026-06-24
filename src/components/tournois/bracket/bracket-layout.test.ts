// Tests bracket — couvre les 3 tailles (4/8/16) :
//   1. validateTemplate : cohérence structurelle (single-source par slot, condition #1)
//   2. computeBracketLayout : placement sans superposition, flux gauche→droite,
//      connecteurs orthogonaux, comptes corrects — pour chaque taille.

import { describe, it, expect } from 'vitest'
import {
  computeBracketLayout, CARD_W, CARD_H, type BracketMatchInput,
} from './bracket-layout'
import {
  BRACKET_SIZES, BRACKET_TEMPLATES, validateTemplate, templateToLayoutInput,
  type BracketSize,
} from '../../../lib/tournois/bracket-template'

// ── 1. Validation des templates ──────────────────────────────────────────────
describe('validateTemplate — cohérence des 3 templates', () => {
  for (const size of BRACKET_SIZES) {
    it(`[${size}] structure valide + single-source par slot`, () => {
      expect(() => validateTemplate(size)).not.toThrow()
    })
    it(`[${size}] ${2 * size - 2} matchs (DE sans reset)`, () => {
      expect(BRACKET_TEMPLATES[size]).toHaveLength(2 * size - 2)
    })
  }

  // Garde explicite : un trou de câblage (slot sans source) est bien détecté
  it('détecte un slot sans source (trou de câblage)', () => {
    // On simule en retirant une source : impossible sur les templates figés,
    // donc on vérifie que la règle single-source est bien active sur chaque slot.
    for (const size of BRACKET_SIZES) {
      const tpl = BRACKET_TEMPLATES[size]
      const sources = new Map<string, number>()
      for (const t of tpl) {
        if (t.next && t.nextSlot) sources.set(`${t.next}:${t.nextSlot}`, (sources.get(`${t.next}:${t.nextSlot}`) ?? 0) + 1)
        if (t.loserNext && t.loserSlot) sources.set(`${t.loserNext}:${t.loserSlot}`, (sources.get(`${t.loserNext}:${t.loserSlot}`) ?? 0) + 1)
      }
      for (const t of tpl) {
        const isWbR1 = t.bracket === 'winner' && t.round === 1
        for (const slot of ['a', 'b'] as const) {
          const n = sources.get(`${t.code}:${slot}`) ?? 0
          expect(isWbR1 ? n === 0 : n === 1, `[${size}] ${t.code}.${slot} sources=${n}`).toBe(true)
        }
      }
    }
  })
})

// ── 2. Layout pour chaque taille ─────────────────────────────────────────────
function expectedFinalCol(size: BracketSize): number {
  const tpl = BRACKET_TEMPLATES[size]
  const maxWb = Math.max(...tpl.filter((t) => t.bracket === 'winner').map((t) => t.round))
  const maxLb = Math.max(...tpl.filter((t) => t.bracket === 'loser').map((t) => t.round))
  return Math.max(maxWb - 1, maxLb - 1) + 1
}

describe('computeBracketLayout — 3 tailles', () => {
  for (const size of BRACKET_SIZES) {
    const matches = templateToLayoutInput(size) as BracketMatchInput[]
    const layout = computeBracketLayout(matches)
    const finalCol = expectedFinalCol(size)

    it(`[${size}] place tous les matchs`, () => {
      expect(layout.cards).toHaveLength(2 * size - 2)
    })

    it(`[${size}] colonne/bande correctes`, () => {
      const byCode = new Map(layout.cards.map((c) => [c.match.code, c]))
      for (const t of BRACKET_TEMPLATES[size]) {
        const card = byCode.get(t.code)!
        const expBand = t.bracket === 'winner' ? 'wb' : t.bracket === 'loser' ? 'lb' : 'final'
        const expCol  = t.bracket === 'final' ? finalCol : t.round - 1
        expect({ code: t.code, band: card.band, col: card.col })
          .toEqual({ code: t.code, band: expBand, col: expCol })
      }
    })

    it(`[${size}] aucune superposition`, () => {
      const cards = layout.cards
      for (let i = 0; i < cards.length; i++) {
        for (let j = i + 1; j < cards.length; j++) {
          const a = cards[i], b = cards[j]
          const overlapX = a.x < b.x + CARD_W && b.x < a.x + CARD_W
          const overlapY = a.y < b.y + CARD_H && b.y < a.y + CARD_H
          expect(overlapX && overlapY, `[${size}] superposition ${a.match.code}/${b.match.code}`).toBe(false)
        }
      }
    })

    it(`[${size}] flux gauche → droite (cible à droite de la source)`, () => {
      const byId = new Map(layout.cards.map((c) => [c.match.id, c]))
      for (const conn of layout.connectors) {
        const from = byId.get(conn.fromId)!, to = byId.get(conn.toId)!
        expect(to.x, `[${size}] ${from.match.code}→${to.match.code}`).toBeGreaterThan(from.x)
      }
    })

    it(`[${size}] ${2 * size - 3} connecteurs gagnants (tous sauf la finale)`, () => {
      expect(layout.connectors).toHaveLength(2 * size - 3)
    })

    it(`[${size}] connecteurs strictement orthogonaux`, () => {
      for (const conn of layout.connectors) {
        for (let i = 1; i < conn.points.length; i++) {
          const p = conn.points[i - 1], q = conn.points[i]
          const ortho = Math.abs(p.y - q.y) < 0.001 || Math.abs(p.x - q.x) < 0.001
          expect(ortho, `[${size}] segment diagonal ${conn.fromId}→${conn.toId}`).toBe(true)
        }
      }
    })
  }
})

// ── 3. Régression 8 — la finale reste à cheval + chemin vainqueur ────────────
describe('computeBracketLayout — régression 8 équipes', () => {
  it('M14 à cheval entre M11 et M13', () => {
    const layout = computeBracketLayout(templateToLayoutInput(8) as BracketMatchInput[])
    const byCode = new Map(layout.cards.map((c) => [c.match.code, c]))
    const m11 = byCode.get('M11')!, m13 = byCode.get('M13')!, m14 = byCode.get('M14')!
    const center = (m11.y + CARD_H / 2 + m13.y + CARD_H / 2) / 2
    expect(m14.y + CARD_H / 2).toBeCloseTo(center, 5)
  })

  it('marque le chemin du vainqueur', () => {
    const matches = templateToLayoutInput(8) as BracketMatchInput[]
    const m1 = matches.find((m) => m.code === 'M1')!
    m1.winner_id = 'team-1'; m1.status = 'finished'
    const layout = computeBracketLayout(matches)
    expect(layout.connectors.find((c) => c.fromId === 'id-M1')!.isWinnerPath).toBe(true)
    expect(layout.connectors.find((c) => c.fromId === 'id-M2')!.isWinnerPath).toBe(false)
  })
})
