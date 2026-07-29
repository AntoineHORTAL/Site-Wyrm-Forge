'use client'

/**
 * Lot D3 — composition des deux équipes d'une partie en cours.
 *
 * ⚠️ STOP D3 — la séparation des camps se fait EXCLUSIVEMENT sur `team_id`
 * (via `splitTeams`), jamais sur le champion. En partie MIROIR (même champion
 * des deux côtés — courant en ARAM, possible en Draft), tout regroupement par
 * champion serait ambigu. Même raison pour les clés React : `puuid`, jamais
 * `champion_id` qui n'est pas unique dans ce cas.
 *
 * Les rangs ne sont PAS affichés ici : `riot-live-game` renvoie toujours
 * `ranks: null` en V1, ils viendront de 10 appels séparés à `riot-rank` au
 * Lot D4 (avec dégradation par joueur — un rang manquant affiche « — » sans
 * casser les 9 autres lignes).
 */
import {
  splitTeams,
  type LiveGameInfo, type LiveParticipant,
} from '@/lib/live-game'
import {
  champImg, spellImg, runeImg, profileIconImg,
  type DDragonMaps,
} from '@/lib/ddragon'

const SIDE_STYLE = {
  order: { label: 'Équipe bleue', color: '#4A90D9', bg: 'rgba(74,144,217,0.06)', border: 'rgba(74,144,217,0.25)' },
  chaos: { label: 'Équipe rouge', color: '#E24B4A', bg: 'rgba(226,75,74,0.06)', border: 'rgba(226,75,74,0.25)' },
} as const

export default function LiveComposition({
  game, participants, requestedPuuid, dd,
}: {
  game: LiveGameInfo
  participants: LiveParticipant[]
  requestedPuuid: string
  dd: DDragonMaps | null
}) {
  const teams = splitTeams(participants)
  const bans = splitTeams(game.banned_champions)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <TeamPanel
        side="order" players={teams.order} bans={bans.order}
        requestedPuuid={requestedPuuid} dd={dd}
      />
      <TeamPanel
        side="chaos" players={teams.chaos} bans={bans.chaos}
        requestedPuuid={requestedPuuid} dd={dd}
      />

      {/* Un team_id inattendu ne doit pas faire disparaître un joueur de
          l'écran sans laisser de trace — on le montre à part plutôt que de
          l'affecter arbitrairement à un camp. */}
      {teams.unknown.length > 0 && (
        <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
          {teams.unknown.length} participant(s) au camp non reconnu.
        </div>
      )}
    </div>
  )
}

function TeamPanel({
  side, players, bans, requestedPuuid, dd,
}: {
  side: 'order' | 'chaos'
  players: LiveParticipant[]
  bans: { champion_id: number; team_id: number; pick_turn: number }[]
  requestedPuuid: string
  dd: DDragonMaps | null
}) {
  const s = SIDE_STYLE[side]
  return (
    <section style={{
      borderRadius: 12, padding: '14px 16px',
      background: s.bg, border: `1px solid ${s.border}`,
    }}>
      <header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 12, marginBottom: 10, flexWrap: 'wrap',
      }}>
        <h2 style={{ fontSize: 13, fontWeight: 700, color: s.color, letterSpacing: 0.3 }}>
          {s.label}
        </h2>
        {/* §C : bloc « Bans » MASQUÉ entièrement si aucun ban (aveugle, ARAM…),
            jamais un cadre vide. */}
        {bans.length > 0 && dd && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 10, color: 'var(--text-dim)', marginRight: 2 }}>Bans</span>
            {bans.map((b, i) => {
              const champ = dd.champs[b.champion_id]
              return (
                // Clé : pick_turn + index. `champion_id` peut valoir -1 (ban
                // passé) plusieurs fois dans la même équipe.
                <span key={`${b.pick_turn}-${i}`} title={champ?.name ?? 'Aucun ban'}>
                  {champ ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={champImg(dd.version, champ.image)} alt={champ.name}
                      width={20} height={20}
                      style={{ borderRadius: 4, display: 'block', filter: 'grayscale(1)', opacity: 0.75 }}
                    />
                  ) : (
                    <span style={{
                      display: 'block', width: 20, height: 20, borderRadius: 4,
                      background: 'rgba(255,255,255,0.06)',
                    }} />
                  )}
                </span>
              )
            })}
          </div>
        )}
      </header>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {players.map(p => (
          // ⚠️ Clé = puuid. JAMAIS champion_id : en partie miroir il apparaît
          // des deux côtés, et deux joueurs de la même équipe peuvent même
          // partager un champion dans certains modes.
          <PlayerRow
            key={p.puuid}
            p={p}
            dd={dd}
            highlight={p.puuid === requestedPuuid}
            accent={SIDE_STYLE[side].color}
          />
        ))}
      </div>
    </section>
  )
}

function PlayerRow({
  p, dd, highlight, accent,
}: {
  p: LiveParticipant
  dd: DDragonMaps | null
  highlight: boolean
  accent: string
}) {
  const champ = dd?.champs[p.champion_id]
  const spell1 = dd?.spells[p.spell1_id]
  const spell2 = dd?.spells[p.spell2_id]
  // perkIds[0] = pierre de fondation (keystone) ; perkSubStyle = arbre secondaire.
  const keystone = dd?.runes[p.perks.perk_ids[0]]
  const subStyle = dd?.runes[p.perks.perk_sub_style]

  // §C : `riot_id` peut être '' → repli sur le nom du champion, jamais une
  // ligne vide. Le nom du champion n'identifie pas le joueur, mais il situe.
  const name = p.riot_id || champ?.name || 'Joueur inconnu'
  const [gameName, tagLine] = name.includes('#') ? name.split('#') : [name, '']

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '6px 8px', borderRadius: 8,
      background: highlight ? 'rgba(255,255,255,0.05)' : 'transparent',
      border: highlight ? `1px solid ${accent}55` : '1px solid transparent',
    }}>
      {/* Champion */}
      <div style={{ position: 'relative', flexShrink: 0 }}>
        {champ && dd ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={champImg(dd.version, champ.image)} alt={champ.name} title={champ.name}
            width={36} height={36} style={{ borderRadius: 6, display: 'block' }}
          />
        ) : (
          <div style={{ width: 36, height: 36, borderRadius: 6, background: 'rgba(255,255,255,0.06)' }} />
        )}
      </div>

      {/* Sorts d'invocateur */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flexShrink: 0 }}>
        {[spell1, spell2].map((sp, i) => (
          sp && dd ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={i} src={spellImg(dd.version, sp.image)} alt={sp.name} title={sp.name}
              width={17} height={17} style={{ borderRadius: 3, display: 'block' }}
            />
          ) : (
            <div key={i} style={{ width: 17, height: 17, borderRadius: 3, background: 'rgba(255,255,255,0.06)' }} />
          )
        ))}
      </div>

      {/* Runes */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flexShrink: 0 }}>
        {[keystone, subStyle].map((r, i) => (
          r ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={i} src={runeImg(r.icon)} alt={r.name} title={r.name}
              width={17} height={17} style={{ borderRadius: 3, display: 'block' }}
            />
          ) : (
            <div key={i} style={{ width: 17, height: 17, borderRadius: 3, background: 'rgba(255,255,255,0.06)' }} />
          )
        ))}
      </div>

      {/* Identité */}
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{
          fontSize: 13, fontWeight: 600, color: '#F5F2FA',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {gameName}
          {tagLine && <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}>#{tagLine}</span>}
          {/* §C : un bot n'a pas de rang réel — l'étiqueter explicitement
              évite qu'on lui en cherche un au Lot D4. */}
          {p.bot && (
            <span style={{
              marginLeft: 6, fontSize: 9, padding: '1px 5px', borderRadius: 4,
              background: 'rgba(255,255,255,0.08)', color: 'var(--text-dim)',
              verticalAlign: 'middle',
            }}>IA</span>
          )}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
          {champ?.name ?? `Champion #${p.champion_id}`}
        </div>
      </div>

      {/* Rang — emplacement réservé D4. `ranks` vaut toujours null en V1 :
          afficher « — » plutôt que de laisser un vide inexpliqué. */}
      <div style={{
        flexShrink: 0, fontSize: 11, color: 'var(--text-dim)',
        minWidth: 52, textAlign: 'right',
      }}>
        —
      </div>

      {/* Icône de profil, en bout de ligne (donnée déjà présente dans la
          réponse spectator-v5 — jamais besoin de la redemander à riot-rank). */}
      {dd && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={profileIconImg(dd.version, p.profile_icon_id)} alt=""
          width={22} height={22}
          style={{ borderRadius: '50%', display: 'block', flexShrink: 0, opacity: 0.7 }}
        />
      )}
    </div>
  )
}
