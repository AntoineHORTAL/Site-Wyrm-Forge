/**
 * STOP D3 — vérification de RENDU sur une partie MIROIR.
 *
 * Les tests unitaires de `splitTeams` (src/lib/live-game.test.ts) prouvent que
 * la répartition pure est correcte. Ce fichier prouve la marche suivante : que
 * le COMPOSANT s'appuie bien dessus et n'introduit pas de regroupement par
 * champion au moment du rendu.
 *
 * Rendu en HTML statique via `react-dom/server` — pas de jsdom ni de
 * testing-library nécessaires (le composant est purement présentationnel).
 */
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import LiveComposition from './LiveComposition'
import type { LiveGameInfo, LiveParticipant, RanksByPuuid } from '@/lib/live-game'
import type { DDragonMaps } from '@/lib/ddragon'

// Cartes DDragon minimales — Yasuo est le champion MIROIR.
const DD: DDragonMaps = {
  version: '15.1.1',
  champs: {
    157: { id: 'Yasuo', name: 'Yasuo', image: 'Yasuo.png' },
    99: { id: 'Lux', name: 'Lux', image: 'Lux.png' },
    64: { id: 'LeeSin', name: 'Lee Sin', image: 'LeeSin.png' },
    238: { id: 'Zed', name: 'Zed', image: 'Zed.png' },
    17: { id: 'Teemo', name: 'Teemo', image: 'Teemo.png' },
    22: { id: 'Ashe', name: 'Ashe', image: 'Ashe.png' },
    412: { id: 'Thresh', name: 'Thresh', image: 'Thresh.png' },
    86: { id: 'Garen', name: 'Garen', image: 'Garen.png' },
  },
  spells: {
    4: { id: 'SummonerFlash', name: 'Saut éclair', image: 'SummonerFlash.png' },
    12: { id: 'SummonerTeleport', name: 'Téléportation', image: 'SummonerTeleport.png' },
  },
  runes: {
    8100: { id: 8100, name: 'Domination', icon: 'perk-images/Styles/7200_Domination.png' },
    8112: { id: 8112, name: 'Électrocution', icon: 'perk-images/Styles/Domination/Electrocute.png' },
  },
}

const mk = (over: Partial<LiveParticipant> & { puuid: string; team_id: number; champion_id: number }): LiveParticipant => ({
  riot_id: '', spell1_id: 4, spell2_id: 12, profile_icon_id: 29,
  perks: { perk_ids: [8112], perk_style: 8100, perk_sub_style: 8100 },
  bot: false,
  ...over,
})

// Composition 5v5 avec Yasuo (157) joué DES DEUX CÔTÉS.
const PARTICIPANTS: LiveParticipant[] = [
  mk({ puuid: 'p-blue-yasuo', team_id: 100, champion_id: 157, riot_id: 'BlueYasuo#EUW' }),
  mk({ puuid: 'p-blue-lux', team_id: 100, champion_id: 99, riot_id: 'BlueLux#EUW' }),
  mk({ puuid: 'p-blue-lee', team_id: 100, champion_id: 64, riot_id: 'BlueLee#EUW' }),
  mk({ puuid: 'p-blue-ashe', team_id: 100, champion_id: 22, riot_id: 'BlueAshe#EUW' }),
  mk({ puuid: 'p-blue-thresh', team_id: 100, champion_id: 412, riot_id: 'BlueThresh#EUW' }),
  mk({ puuid: 'p-red-yasuo', team_id: 200, champion_id: 157, riot_id: 'RedYasuo#EUW' }),
  mk({ puuid: 'p-red-zed', team_id: 200, champion_id: 238, riot_id: 'RedZed#EUW' }),
  mk({ puuid: 'p-red-teemo', team_id: 200, champion_id: 17, riot_id: 'RedTeemo#EUW' }),
  mk({ puuid: 'p-red-garen', team_id: 200, champion_id: 86, riot_id: 'RedGaren#EUW' }),
  mk({ puuid: 'p-red-bot', team_id: 200, champion_id: 22, riot_id: '', bot: true }),
]

const GAME: LiveGameInfo = {
  game_id: 7331, platform_id: 'EUW1', queue_id: 420, map_id: 11,
  game_mode: 'CLASSIC', game_type: 'MATCHED_GAME',
  game_start_time: 1_700_000_000_000, game_length_s: 137,
  banned_champions: [
    { champion_id: 157, team_id: 100, pick_turn: 1 },
    { champion_id: 157, team_id: 200, pick_turn: 2 },
  ],
}

const render = (over: Partial<Parameters<typeof LiveComposition>[0]> = {}) =>
  renderToStaticMarkup(
    <LiveComposition
      game={GAME} participants={PARTICIPANTS}
      requestedPuuid="p-blue-yasuo" dd={DD}
      ranks={{}} ranksLoading={false}
      {...over}
    />,
  )

/** Découpe le markup en deux moitiés : équipe bleue puis équipe rouge. */
function sections(html: string) {
  const redIdx = html.indexOf('Équipe rouge')
  expect(redIdx).toBeGreaterThan(-1)
  return { blue: html.slice(0, redIdx), red: html.slice(redIdx) }
}

describe('LiveComposition — STOP D3 : partie miroir', () => {
  it('les deux équipes sont rendues', () => {
    const html = render()
    expect(html).toContain('Équipe bleue')
    expect(html).toContain('Équipe rouge')
  })

  it('chaque joueur est dans le camp de SON team_id, pas de son champion', () => {
    const { blue, red } = sections(render())

    // Les 5 joueurs bleus sont dans la section bleue, et absents de la rouge.
    for (const n of ['BlueYasuo', 'BlueLux', 'BlueLee', 'BlueAshe', 'BlueThresh']) {
      expect(blue).toContain(n)
      expect(red).not.toContain(n)
    }
    // Idem côté rouge.
    for (const n of ['RedYasuo', 'RedZed', 'RedTeemo', 'RedGaren']) {
      expect(red).toContain(n)
      expect(blue).not.toContain(n)
    }
  })

  it('le champion MIROIR apparaît des deux côtés, une fois chacun', () => {
    const { blue, red } = sections(render())
    // Yasuo joué par un allié ET un ennemi : les deux occurrences survivent.
    expect(blue).toContain('BlueYasuo')
    expect(red).toContain('RedYasuo')
    // Le nom du champion apparaît dans les deux sections — c'est justement
    // ce qui rendrait tout regroupement par nom ambigu.
    expect(blue).toContain('Yasuo')
    expect(red).toContain('Yasuo')
  })

  it('5 joueurs par camp, aucun perdu ni dupliqué', () => {
    const { blue, red } = sections(render())
    const countRows = (s: string) => (s.match(/#EUW/g) ?? []).length
    expect(countRows(blue)).toBe(5)
    // Côté rouge : 4 riot_id + 1 bot sans riot_id.
    expect(countRows(red)).toBe(4)
    expect(red).toContain('>IA<')
  })

  it('riot_id vide → repli sur le nom du champion, jamais une ligne vide', () => {
    // Le bot rouge n'a pas de riot_id : il doit afficher « Ashe ».
    const { red } = sections(render())
    expect(red).toContain('Ashe')
  })

  it('le joueur demandé est mis en évidence, et lui seul', () => {
    const html = render()
    // Le surlignage est un fond + une bordure ; on vérifie qu'il n'apparaît
    // qu'une fois (sinon deux joueurs seraient marqués « c'est toi »).
    const highlights = (html.match(/rgba\(255,255,255,0\.05\)/g) ?? []).length
    expect(highlights).toBe(1)
  })

  it('bans miroir : un ban par équipe, chacun de son côté', () => {
    const { blue, red } = sections(render())
    expect(blue).toContain('Bans')
    expect(red).toContain('Bans')
  })

  it('aucun ban → bloc Bans entièrement masqué, jamais un cadre vide', () => {
    const html = render({ game: { ...GAME, banned_champions: [] } })
    expect(html).not.toContain('Bans')
  })

  it('team_id inattendu → signalé, jamais rattaché à un camp', () => {
    const html = render({
      participants: [...PARTICIPANTS, mk({ puuid: 'p-ghost', team_id: 300, champion_id: 17, riot_id: 'Ghost#EUW' })],
    })
    expect(html).toContain('camp non reconnu')
  })

  it('DDragon indisponible → composition rendue quand même (icônes dégradées)', () => {
    const html = render({ dd: null })
    expect(html).toContain('Équipe bleue')
    expect(html).toContain('BlueYasuo')
    expect(html).toContain('RedYasuo')
    // Sans DDragon, le repli d'un riot_id vide est l'id numérique du champion.
    expect(html).toContain('Champion #22')
  })

  it('aucune image DDragon n’est demandée sans version chargée', () => {
    const html = render({ dd: null })
    expect(html).not.toContain('ddragon.leagueoflegends.com')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// STOP D4 — dégradation PAR JOUEUR
// ─────────────────────────────────────────────────────────────────────────────
describe('LiveComposition — rangs (Lot D4)', () => {
  const entry = (tier: string, rank: string, lp: number, wins: number, losses: number) => ({
    queueType: 'RANKED_SOLO_5x5', tier, rank, lp, wins, losses,
  })

  /** 9 joueurs classés, 1 (RedZed) en échec — le cas central du STOP D4. */
  const RANKS_WITH_ONE_FAILURE: RanksByPuuid = {
    'p-blue-yasuo': { status: 'ranked', entry: entry('GOLD', 'II', 42, 60, 40), winrate: 60, games: 100 },
    'p-blue-lux': { status: 'ranked', entry: entry('PLATINUM', 'IV', 12, 30, 30), winrate: 50, games: 60 },
    'p-blue-lee': { status: 'ranked', entry: entry('DIAMOND', 'I', 88, 55, 45), winrate: 55, games: 100 },
    'p-blue-ashe': { status: 'ranked', entry: entry('MASTER', 'I', 300, 120, 100), winrate: 55, games: 220 },
    'p-blue-thresh': { status: 'unranked' },
    'p-red-yasuo': { status: 'ranked', entry: entry('SILVER', 'III', 5, 10, 20), winrate: 33, games: 30 },
    'p-red-zed': { status: 'unavailable' },              // ⟵ le rang qui a échoué
    'p-red-teemo': { status: 'ranked', entry: entry('IRON', 'IV', 0, 1, 9), winrate: 10, games: 10 },
    'p-red-garen': { status: 'ranked', entry: entry('EMERALD', 'II', 55, 40, 35), winrate: 53, games: 75 },
    'p-red-bot': { status: 'bot' },
  }

  it('un rang en échec ne dégrade QUE sa ligne — les 9 autres restent intactes', () => {
    const html = render({ ranks: RANKS_WITH_ONE_FAILURE })
    // Les rangs résolus sont bien tous affichés.
    for (const t of ['Or II', 'Platine IV', 'Diamant I', 'Argent III', 'Fer IV', 'Émeraude II']) {
      expect(html).toContain(t)
    }
    expect(html).toContain('Non classé')          // p-blue-thresh, réponse valide
    expect(html).toContain('Rang indisponible')   // p-red-zed, title du « — »
    // Un SEUL joueur est en échec : un seul title « Rang indisponible ».
    expect((html.match(/Rang indisponible/g) ?? []).length).toBe(1)
  })

  it('« Non classé » n’est PAS traité comme un échec', () => {
    const html = render({ ranks: { 'p-blue-thresh': { status: 'unranked' } } })
    expect(html).toContain('Non classé')
    expect(html).not.toContain('Rang indisponible')
  })

  it('Maître/GM/Challenger sans division (l’API renvoie pourtant rank:"I")', () => {
    const html = render({ ranks: RANKS_WITH_ONE_FAILURE })
    expect(html).toContain('Maître')
    expect(html).not.toContain('Maître I')
  })

  it('LP et winrate affichés pour un joueur classé', () => {
    const html = render({ ranks: RANKS_WITH_ONE_FAILURE })
    expect(html).toContain('42 LP')
    expect(html).toContain('60%')
    expect(html).toContain('(100)')
  })

  it('un bot n’affiche jamais de rang', () => {
    const html = render({ ranks: { 'p-red-bot': { status: 'bot' } } })
    expect(html).not.toContain('Non classé')
  })

  it('rangs non encore résolus → « … » pendant le chargement, « — » ensuite', () => {
    expect(render({ ranks: {}, ranksLoading: true })).toContain('…')
    const done = render({ ranks: {}, ranksLoading: false })
    expect(done).not.toContain('…')
    expect(done).toContain('—')
  })

  it('TOUS les rangs en échec → la composition reste entièrement lisible', () => {
    const allFailed: RanksByPuuid = Object.fromEntries(
      PARTICIPANTS.map(p => [p.puuid, { status: 'unavailable' as const }]),
    )
    const html = render({ ranks: allFailed })
    // Aucun rang, mais les 10 joueurs et les deux équipes sont toujours là.
    expect(html).toContain('Équipe bleue')
    expect(html).toContain('Équipe rouge')
    for (const n of ['BlueYasuo', 'RedYasuo', 'RedGaren']) expect(html).toContain(n)
  })
})
