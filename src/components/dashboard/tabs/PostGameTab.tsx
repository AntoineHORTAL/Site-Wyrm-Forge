'use client'

// ════════════════════════════════════════════════════════════════════════════
//  PostGameTab — bilan IA d'une partie (9 combinaisons)
// ════════════════════════════════════════════════════════════════════════════
// 3 profondeurs (Simple/Médium/Avancée) × 3 modes (Moi/Adversaire/Les deux).
// Chaque combinaison a son PROPRE tarif mesuré (6 → 31 crédits) : le coût
// affiché sur les pills change donc avec la sélection, et la finançabilité se
// décide combinaison par combinaison, jamais par un booléen global.
//
// Le solde affiché est celui du pot « Chaleur de la Forge », PARTAGÉ avec
// MatchUp : lancer un bilan ici réduit aussi ce qui reste pour un match up.

import { useCallback, useEffect, useState } from 'react'
import { useTheme } from '@/components/providers/ThemeProvider'
import type { UserProfile } from '@/lib/session-types'
import {
  analyzePostGame, getPostGameQuota, canAffordPostGame, costOfCombo, hasLaneOpponent,
  postGameErrorText, comboLabel,
  POSTGAME_DEPTHS, POSTGAME_MODES,
  type PostGameQuota, type PostGameResult, type PostGameDepth, type PostGameMode,
} from '@/lib/postgame/api'
import { useDashboard, useLang } from '@/locales/dashboard'
import { formatDate, formatTime } from '@/lib/intl'
import { queueLabel } from '@/locales/dashboard/common'
import { balanceLabel, needLabel } from '@/locales/dashboard/analyse'

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPA_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Forme « slim » renvoyée par riot-matches — on ne lit que ce qu'il faut pour
// présenter un choix. Le détail complet est refetché SERVEUR par l'EF : le
// client n'a rien à en savoir, et surtout rien à lui transmettre.
interface SlimMatch {
  matchId: string
  championName?: string
  win?: boolean
  kills?: number
  deaths?: number
  assists?: number
  gameCreation?: number
  /** ⚠️ `riot-matches` renvoie `duration` (secondes), PAS `gameDuration` — le
   *  nom Riot d'origine est aplati par l'EF. Lire `gameDuration` ici donnait
   *  toujours `undefined`, donc une durée jamais affichée. */
  duration?: number
  queueId?: number
  /** Libellé de file résolu par l'EF, en FRANÇAIS uniquement (`QUEUES[queueId] ??
   *  'Partie'`). Plus affiché depuis le Lot 8 : le libellé est résolu côté client
   *  depuis `queueId`, ce qui le rend traduisible sans toucher à l'Edge Function.
   *  Le champ reste ici parce qu'il fait partie du contrat de la réponse. */
  queueName?: string
  /** `teamPosition || individualPosition` — vide sur ARAM/Arena. */
  position?: string
}

// Vocabulaire Riot → abréviation d'affichage. Deux copies de cette table
// existent déjà (`/summoner`, `/matches`) ; on n'en extrait pas un module
// partagé ici pour ne pas toucher deux pages committées hors périmètre.
// Ces abréviations sont identiques dans les deux langues et la clé vient de Riot :
// elles ne passent donc pas par le dico.
const ROLE_LABEL: Record<string, string> = {
  TOP: 'TOP', JUNGLE: 'JGL', MIDDLE: 'MID', BOTTOM: 'ADC', UTILITY: 'SUP',
}

/** Rangée de pills de sélection, avec le coût en crédits de chaque option. */
function PillRow({ label, options, value, onChange, c }: {
  label: string
  options: Array<{ id: string; label: string; cost: number; disabled: boolean }>
  value: string
  onChange: (id: string) => void
  c: boolean
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-dim)', minWidth: 78 }}>
        {label}
      </span>
      {options.map(o => {
        const on = o.id === value
        return (
          <button
            key={o.id}
            onClick={() => !o.disabled && onChange(o.id)}
            disabled={o.disabled}
            style={{
              padding: '6px 12px', borderRadius: 999, fontSize: 12, fontWeight: 600,
              cursor: o.disabled ? 'not-allowed' : 'pointer',
              opacity: o.disabled ? 0.4 : 1,
              background: on ? (c ? 'rgba(186,117,23,0.18)' : 'rgba(127,119,221,0.18)') : 'transparent',
              border: `1px solid ${on ? (c ? '#BA7517' : '#7F77DD') : 'var(--border)'}`,
              color: on ? 'var(--text)' : 'var(--text-muted)',
              fontFamily: 'inherit',
            }}
          >
            {o.label}
            {/* Le coût suit la combinaison courante : bouger la profondeur
                change le prix affiché sur chaque mode, et réciproquement. */}
            {o.cost > 0 && (
              <span style={{ marginLeft: 6, opacity: 0.7, fontWeight: 400 }}>{o.cost}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`
const FMT_DAY: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }
/** Heure de début, pour distinguer deux parties du même jour sur le même champion. */
const FMT_TIME: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' }

/**
 * Échec du chargement de l'historique. Comme les erreurs d'analyse, on mémorise un
 * CODE et non un message : l'effet ne tourne qu'au montage, un message capturé là
 * resterait figé dans la langue d'alors. `server` porte le texte de l'Edge Function,
 * qui n'est pas traduisible côté client.
 */
type HistoryError = { kind: 'unavailable' | 'network' } | { kind: 'server'; text: string }

export default function PostGameTab({ profile }: { profile?: UserProfile | null }) {
  const { theme } = useTheme()
  const dico = useDashboard()
  const A = dico.analyse
  const lang = useLang()
  const P = A.postgame
  const c = theme === 'mythic'

  const puuid    = profile?.riot_puuid
  const platform = profile?.riot_platform ?? 'euw1'

  const [matches, setMatches] = useState<SlimMatch[] | null>(null)
  const [loadErr, setLoadErr] = useState<HistoryError | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [quota, setQuota]   = useState<PostGameQuota | null>(null)
  const [busy, setBusy]     = useState(false)
  const [result, setResult] = useState<PostGameResult | null>(null)
  const [depth, setDepth]   = useState<PostGameDepth>('simple')
  const [modeChoice, setMode] = useState<PostGameMode>('perso')

  // Historique récent du joueur (riot-matches est public, la clé Riot reste
  // côté serveur). Sans compte Riot lié, il n'y a rien à proposer.
  useEffect(() => {
    if (!puuid) return
    let alive = true
    ;(async () => {
      try {
        const qs = new URLSearchParams({ puuid, platform, count: '10' })
        const res = await fetch(`${SUPA_URL}/functions/v1/riot-matches?${qs}`, {
          headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` },
        })
        const body = await res.json().catch(() => null)
        if (!alive) return
        if (!res.ok) {
          // ⚠️ `body.error` vient de l'Edge Function : affiché tel quel, non traduisible.
          setLoadErr(typeof body?.error === 'string' && body.error.trim()
            ? { kind: 'server', text: body.error }
            : { kind: 'unavailable' })
          return
        }
        const list: SlimMatch[] = body?.matches ?? (Array.isArray(body) ? body : [])
        setMatches(list)
        if (list.length) setSelected(list[0].matchId)
      } catch {
        if (alive) setLoadErr({ kind: 'network' })
      }
    })()
    return () => { alive = false }
  }, [puuid, platform])

  useEffect(() => { getPostGameQuota().then(q => setQuota(q)) }, [])

  const selectedMatch = matches?.find(m => m.matchId === selected) ?? null
  // Une partie sans voies (ARAM, Arena…) n'a pas d'adversaire de voie : on
  // grise les modes concernés AVANT tout appel. Le serveur reste l'autorité —
  // la Faille aussi peut ne pas exposer les rôles, et il renvoie alors
  // `opponent_unavailable`, que le composant traite comme un état normal.
  const laneOk = hasLaneOpponent(selectedMatch?.queueId)
  // Repli DÉRIVÉ, pas synchronisé par un effet : si l'utilisateur sélectionne
  // une partie sans voies alors qu'il avait choisi un mode adverse, le mode
  // effectif retombe sur « Moi ». Son choix initial est conservé et redevient
  // actif dès qu'il resélectionne une partie de Faille — un `setMode` dans un
  // effet l'aurait écrasé définitivement (en plus de cascader un rendu).
  const mode = laneOk ? modeChoice : 'perso'

  const run = useCallback(async () => {
    if (!selected || !puuid || busy) return
    // Le solde insuffisant est déjà couvert par le `disabled` du bouton ; on le
    // re-teste ici pour que « pas d'appel réseau voué au 429 » soit une propriété
    // du callback, pas un effet de bord de l'attribut HTML.
    if (!canAffordPostGame(quota, depth, mode)) return
    setBusy(true)
    const r = await analyzePostGame(selected, puuid, platform, depth, mode)
    setResult(r)
    // La réponse porte l'état de solde (succès comme 429) — on s'en sert plutôt
    // que de refaire un GET, sauf sur erreur réseau/serveur où il est inconnu.
    if (r.success || r.overQuota) {
      setQuota({ used: r.used, limit: r.limit, remaining: r.remaining, model: r.model, resetsAt: r.resetsAt, costs: r.costs })
    }
    // Le serveur a tranché : cette partie n'a pas d'adversaire identifiable.
    if (r.opponentUnavailable) setMode('perso')
    setBusy(false)
  }, [selected, puuid, platform, busy, quota, depth, mode])

  const cost       = costOfCombo(quota, depth, mode)
  const affordable = canAffordPostGame(quota, depth, mode)
  const canRun     = !!selected && !!puuid && !busy && affordable

  if (!puuid) {
    return (
      <div style={{ padding: 24 }}>
        <p style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.7 }}>
          {P.noRiotAccount}
        </p>
      </div>
    )
  }

  return (
    <div>
      {/* En-tête : solde partagé + coût de l'action */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{P.title}</div>
        {quota && (
          <span style={{ fontSize: 12, color: affordable ? 'var(--text-muted)' : '#E5484D' }}>
            {A.quota.potName} — {balanceLabel(A, quota.remaining, quota.limit)}
            {cost > 0 ? ` · ${P.costHint.replace('{cost}', String(cost))}` : ''}
          </span>
        )}
      </div>

      {loadErr && (
        <p style={{ fontSize: 13, color: '#E5484D', marginBottom: 12 }}>
          {loadErr.kind === 'server' ? loadErr.text
            : loadErr.kind === 'network' ? P.historyNetwork
            : P.historyUnavailable}
        </p>
      )}

      {/* Sélecteur de match */}
      {matches === null && !loadErr && (
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>{P.historyLoading}</p>
      )}
      {matches?.length === 0 && (
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>{P.historyEmpty}</p>
      )}

      {!!matches?.length && (
        <div style={{ display: 'grid', gap: 6, marginBottom: 16 }}>
          {matches.map(m => {
            const on = m.matchId === selected
            return (
              <button
                key={m.matchId}
                onClick={() => setSelected(m.matchId)}
                style={{
                  // `wrap` : la ligne porte désormais résultat + champion + rôle
                  // + KDA + file/durée/date — sur mobile elle doit se replier
                  // plutôt que déborder horizontalement.
                  display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left',
                  flexWrap: 'wrap',
                  padding: '10px 14px', borderRadius: 8, cursor: 'pointer',
                  background: on ? (c ? 'rgba(186,117,23,0.12)' : 'rgba(127,119,221,0.12)') : 'var(--card)',
                  border: `1px solid ${on ? (c ? '#BA7517' : '#7F77DD') : 'var(--border)'}`,
                  color: 'var(--text)', fontSize: 13,
                }}
              >
                {/* Résultat : la pastille seule se lit mal en un coup d'œil sur
                    10 lignes — on la double d'un V/D explicite, qui reste lisible
                    pour un daltonien rouge/vert. */}
                <span style={{
                  flexShrink: 0, width: 20, height: 20, borderRadius: 4,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 700,
                  background: m.win ? 'rgba(93,202,165,0.16)' : 'rgba(229,72,77,0.16)',
                  color: m.win ? '#5DCAA5' : '#E5484D',
                }}>
                  {m.win ? P.win : P.loss}
                </span>
                {/* Nom de champion : donnée DDragon, non traduite (Lot 8). */}
                <span style={{ fontWeight: 600, minWidth: 90 }}>{m.championName ?? P.unknownChampion}</span>
                {/* Rôle : absent sur ARAM/Arena — on n'affiche rien plutôt qu'un tiret. */}
                {m.position && ROLE_LABEL[m.position] && (
                  <span style={{
                    flexShrink: 0, fontSize: 10, fontWeight: 700, letterSpacing: 0.5,
                    padding: '2px 6px', borderRadius: 4,
                    border: '1px solid var(--border)', color: 'var(--text-dim)',
                  }}>
                    {ROLE_LABEL[m.position]}
                  </span>
                )}
                <span style={{ color: 'var(--text-muted)' }}>
                  {m.kills ?? 0}/{m.deaths ?? 0}/{m.assists ?? 0}
                </span>
                <span style={{
                  color: 'var(--text-dim)', marginLeft: 'auto', fontSize: 12,
                  textAlign: 'right', flexShrink: 0,
                }}>
                  {[
                    queueLabel(dico.common, m.queueId),
                    m.duration ? mmss(m.duration) : null,
                    m.gameCreation
                      ? `${formatDate(m.gameCreation, lang, FMT_DAY)} ${formatTime(m.gameCreation, lang, FMT_TIME)}`
                      : null,
                  ].filter(Boolean).join(' · ')}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {/* Profondeur × mode — 9 combinaisons, chacune avec son propre tarif */}
      {!!matches?.length && (
        <div style={{ display: 'grid', gap: 10, marginBottom: 14 }}>
          <PillRow
            label={P.depthLabel}
            options={POSTGAME_DEPTHS.map(d => ({
              id: d, label: P.depths[d],
              cost: costOfCombo(quota, d, mode),
              disabled: false,
            }))}
            value={depth} onChange={(v) => setDepth(v as PostGameDepth)} c={c}
          />
          <PillRow
            label={P.modeLabel}
            options={POSTGAME_MODES.map(m => ({
              id: m, label: P.modes[m],
              cost: costOfCombo(quota, depth, m),
              // Grisé sur les parties sans voies — jamais cliquable pour rien.
              disabled: m !== 'perso' && !laneOk,
            }))}
            value={mode} onChange={(v) => setMode(v as PostGameMode)} c={c}
          />
        </div>
      )}

      {!laneOk && !!matches?.length && (
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12, lineHeight: 1.6 }}>
          {P.noLaneOpponent}
        </p>
      )}

      <button
        onClick={run}
        disabled={!canRun}
        style={{
          padding: '9px 18px', borderRadius: 8, fontSize: 13, fontWeight: 700,
          cursor: canRun ? 'pointer' : 'not-allowed',
          opacity: canRun ? 1 : 0.5,
          background: c ? 'rgba(186,117,23,0.18)' : 'rgba(127,119,221,0.18)',
          border: `1px solid ${c ? '#BA7517' : '#7F77DD'}`,
          color: 'var(--text)',
        }}
      >
        {busy ? P.running : P.run}{cost > 0 ? ` · ${cost}` : ''}
      </button>

      {/* Solde insuffisant : message explicite, sinon le bouton grisé n'explique rien */}
      {quota && !affordable && (
        <p style={{ fontSize: 12, color: '#E5484D', marginTop: 8 }}>
          {/* Même gabarit que le 429 de la couche réseau : la phrase ne doit pas
              diverger selon d'où vient le refus. La combinaison n'est plus mise en
              minuscules — un `toLowerCase()` sur un libellé traduit dépend de la
              langue, et la lisibilité n'y gagnait rien. */}
          {needLabel(A, quota.remaining, cost, comboLabel(A, depth, mode))}
          {/* Suggestion actionnable : une combinaison moins chère est peut-être
              encore finançable — ne pas laisser l'utilisateur dans l'impasse. */}
          {canAffordPostGame(quota, 'simple', 'perso') && !(depth === 'simple' && mode === 'perso') && (
            <> {P.fallbackHint.replace('{cost}', String(costOfCombo(quota, 'simple', 'perso')))}</>
          )}
        </p>
      )}

      {result && (
        <div style={{
          marginTop: 16, padding: '14px 18px', borderRadius: 10,
          background: 'var(--card)',
          border: `1px solid ${result.success ? 'var(--border)' : '#E5484D'}`,
        }}>
          {result.success && result.champion && (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8, fontWeight: 600 }}>
              {result.opponent
                ? P.resultVs.replace('{champion}', result.champion).replace('{opponent}', result.opponent)
                : result.champion}
              {' · '}{comboLabel(A, result.depth ?? depth, result.mode ?? mode)}
            </div>
          )}
          {result.truncated && (
            <div style={{ fontSize: 12, color: '#EF9F27', marginBottom: 8 }}>
              {P.truncated}
            </div>
          )}
          {/* Succès : le texte vient d'Anthropic (non traduisible ici). Échec : le
              message est composé MAINTENANT depuis le code mémorisé, donc il suit
              une bascule de langue. */}
          <div style={{
            fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap',
            color: result.success ? 'var(--text)' : '#E5484D',
          }}>
            {result.success ? result.text : postGameErrorText(A, result)}
          </div>
        </div>
      )}
    </div>
  )
}
