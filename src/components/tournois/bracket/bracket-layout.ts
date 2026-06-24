// bracket-layout — calcul PUR de la géométrie du bracket DE 8 équipes.
// Aucune dépendance React : testable unitairement (bracket-layout.test.ts).
//
// Référence structurelle : bracket Liquipedia classique, flux gauche → droite strict.
//
// Grille en 5 colonnes (x-slots 0..4) :
//   Bande WB (haut) :  col 0 QUARTS (M1-M4) | col 1 DEMI-FINALES (M7,M8)
//                      col 2 FINALE WB (M11) | col 4 GRANDE FINALE (M14)
//   Bande LB (bas)  :  col 0 LB ROUND 1 (M5,M6) | col 1 LB ROUND 2 (M9,M10)
//                      col 2 DEMIE LB (M12) | col 3 FINALE LB (M13)
//   M14 est verticalement "à cheval" entre les deux bandes (centré entre M11 et M13).
//
// Placement vertical GÉNÉRÉ depuis les données :
//   - round 1 de chaque bande : empilé par `position`
//   - tout autre match : centré sur la moyenne des centres de ses feeders
//     (matchs dont next_match_id pointe vers lui). Les chutes loser
//     (loser_next_match_id) ne sont PAS dessinées ni utilisées pour le
//     centrage — elles traverseraient les bandes.
//
// Connecteurs : coudes ORTHOGONAUX uniquement (H → V → H), jamais de diagonale.

import type { TournamentMatch } from '@/lib/tournois'

// Sous-ensemble de TournamentMatch nécessaire au layout (facilite les fixtures de test)
export type BracketMatchInput = Pick<
  TournamentMatch,
  'id' | 'code' | 'bracket' | 'round' | 'position'
  | 'team_a' | 'team_b' | 'winner_id'
  | 'next_match_id' | 'next_match_slot' | 'status'
>

export type Band = 'wb' | 'lb' | 'final'

export interface PlacedMatch {
  match: BracketMatchInput
  band:  Band
  col:   number      // x-slot 0..4
  x:     number
  y:     number
}

export interface ConnectorPoint { x: number; y: number }

export interface Connector {
  fromId:       string
  toId:         string
  slot:         'a' | 'b'
  points:       ConnectorPoint[]   // polyligne orthogonale (H → V → H)
  isWinnerPath: boolean            // le match source a un vainqueur → chemin emprunté
}

export interface ColumnHeader {
  label: string
  band:  Band
  col:   number
  x:     number
  y:     number
}

export interface BracketLayout {
  width:      number
  height:     number
  cardW:      number
  cardH:      number
  lbTop:      number    // y du haut de la bande LB (placement du titre LOSER'S BRACKET)
  cards:      PlacedMatch[]
  connectors: Connector[]
  headers:    ColumnHeader[]
}

// ── Constantes géométriques ──────────────────────────────────────────────────

export const CARD_W   = 230
export const CARD_H   = 78
export const COL_GAP  = 80    // espace entre colonnes — accueille les connecteurs
export const V_GAP    = 26    // espace vertical entre cartes empilées
export const HEAD_H   = 56    // hauteur réservée aux cartouches d'en-tête de colonne
export const BAND_GAP = 120   // espace entre bande WB et bande LB (titre + cartouches)

const COL_X = (col: number) => col * (CARD_W + COL_GAP)

// Labels d'en-tête par distance à la finale (préserve l'existant 8 ; s'étend à 4/16)
function wbLabel(round: number, maxWb: number): string {
  const d = maxWb - round
  if (d === 0) return 'FINALE WB'
  if (d === 1) return 'DEMI-FINALES'
  if (d === 2) return 'QUARTS'
  if (d === 3) return 'HUITIÈMES'
  return `WB TOUR ${round}`
}
function lbLabel(round: number, maxLb: number): string {
  const d = maxLb - round
  if (d === 0) return 'FINALE LB'
  if (d === 1) return 'DEMIE LB'
  return `LB ROUND ${round}`
}

// ── Layout principal ─────────────────────────────────────────────────────────
// Géométrie PARAMÉTRÉE par le nombre de rounds présents (4 / 8 / 16 équipes) :
// colonne = round-1 dans chaque bande ; finale après la dernière colonne WB et LB.

export function computeBracketLayout(matches: BracketMatchInput[]): BracketLayout {
  // Rounds présents par bande
  const wbRounds = matches.filter((m) => m.bracket === 'winner').map((m) => m.round)
  const lbRounds = matches.filter((m) => m.bracket === 'loser').map((m) => m.round)
  const maxWb = wbRounds.length ? Math.max(...wbRounds) : 0
  const maxLb = lbRounds.length ? Math.max(...lbRounds) : 0
  const finalCol = Math.max(maxWb - 1, maxLb - 1, 0) + 1
  // Nombre de cartes WB round 1 (détermine la hauteur de la bande WB)
  const wbR1Count = matches.filter((m) => m.bracket === 'winner' && m.round === 1).length || 1

  const bandOf = (bracket: string): Band =>
    bracket === 'winner' ? 'wb' : bracket === 'loser' ? 'lb' : 'final'
  const colOf = (m: BracketMatchInput): number =>
    m.bracket === 'final' ? finalCol : m.round - 1

  const wbTop = HEAD_H
  const wbBottom = wbTop + wbR1Count * CARD_H + (wbR1Count - 1) * V_GAP
  const lbTop    = wbBottom + BAND_GAP

  const placed = new Map<string, PlacedMatch>()

  // Tri par colonne croissante : les feeders d'un match sont toujours placés avant lui
  const sorted = [...matches]
    .map((m) => ({ m, band: bandOf(m.bracket), col: colOf(m) }))
    .sort((a, b) => a.col - b.col || a.m.position - b.m.position)

  for (const { m, band, col } of sorted) {
    const x = COL_X(col)
    let y: number

    // Feeders = matchs dont le GAGNANT arrive ici (les chutes loser sont ignorées)
    const feeders = sorted.filter((s) => s.m.next_match_id === m.id && placed.has(s.m.id))

    if (feeders.length > 0) {
      // Centré sur la moyenne des centres verticaux des feeders
      const centers = feeders.map((f) => {
        const p = placed.get(f.m.id)!
        return p.y + CARD_H / 2
      })
      const avg = centers.reduce((s, c) => s + c, 0) / centers.length
      y = avg - CARD_H / 2
    } else {
      // Round 1 (aucun feeder) : empilé par position dans sa bande
      const top = band === 'wb' ? wbTop : lbTop
      y = top + (m.position - 1) * (CARD_H + V_GAP)
    }

    placed.set(m.id, { match: m, band, col, x, y })
  }

  // ── Connecteurs gagnants (orthogonaux H → V → H) ───────────────────────────
  const connectors: Connector[] = []

  for (const card of placed.values()) {
    const m = card.match
    if (!m.next_match_id || !placed.has(m.next_match_id)) continue

    const target = placed.get(m.next_match_id)!
    const slot   = m.next_match_slot === 'b' ? 'b' : 'a'

    const exitX  = card.x + CARD_W
    const exitY  = card.y + CARD_H / 2
    // Entrée alignée sur la ligne d'équipe visée (a = ligne haute, b = ligne basse)
    const entryX = target.x
    const entryY = target.y + (slot === 'a' ? CARD_H * 0.3 : CARD_H * 0.72)

    let points: ConnectorPoint[]
    if (Math.abs(exitY - entryY) < 1) {
      // Même hauteur : segment horizontal unique
      points = [{ x: exitX, y: exitY }, { x: entryX, y: entryY }]
    } else {
      // Coude orthogonal : sortie H → segment V au milieu de l'inter-colonne → entrée H
      const midX = entryX - COL_GAP / 2
      points = [
        { x: exitX, y: exitY },
        { x: midX,  y: exitY },
        { x: midX,  y: entryY },
        { x: entryX, y: entryY },
      ]
    }

    connectors.push({
      fromId:       m.id,
      toId:         target.match.id,
      slot,
      points,
      isWinnerPath: m.winner_id !== null,
    })
  }

  // ── Cartouches d'en-tête (générées depuis les rounds présents) ────────────
  const wbRoundSet = [...new Set(wbRounds)].sort((a, b) => a - b)
  const lbRoundSet = [...new Set(lbRounds)].sort((a, b) => a - b)
  const headers: ColumnHeader[] = [
    ...wbRoundSet.map((r) => ({ label: wbLabel(r, maxWb), band: 'wb' as Band,
      col: r - 1, x: COL_X(r - 1), y: 0 })),
    ...lbRoundSet.map((r) => ({ label: lbLabel(r, maxLb), band: 'lb' as Band,
      col: r - 1, x: COL_X(r - 1), y: lbTop - HEAD_H + 8 })),
    { label: 'GRANDE FINALE', band: 'final' as Band, col: finalCol, x: COL_X(finalCol), y: 0 },
  ]

  const width  = COL_X(finalCol) + CARD_W
  const maxY   = Math.max(...[...placed.values()].map((p) => p.y + CARD_H), lbTop + CARD_H)
  const height = maxY + 24

  return {
    width,
    height,
    cardW: CARD_W,
    cardH: CARD_H,
    lbTop,
    cards: [...placed.values()],
    connectors,
    headers,
  }
}
