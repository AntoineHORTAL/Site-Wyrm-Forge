'use client'

import { useState, useEffect, useMemo, type CSSProperties } from 'react'
import { useTheme } from '@/components/providers/ThemeProvider'
import { createClient } from '@/lib/supabase/client'
import { loadDDragon, champImgUrl, itemImgUrl, type DDragonData, type DDChampFull, type DDItemFull } from '@/lib/matchup/ddragon'
import { listScenarios, saveScenario } from '@/lib/matchup/storage'
import {
  createScenario, resizeToMode, setChampion, setLevel, setBuild, setRole, maxLevelForRole,
  MIN_LEVEL, MATCHUP_ROLES,
  type MatchUpScenario, type MatchUpMode, type MatchUpChampion, type MatchUpRole, type Side, type BuildRef,
} from '@/lib/matchup/types'
import type { SavedBuildLite, ItemStatsIndex } from '@/lib/matchup/build-resolve'
import { computeRadar } from '@/lib/matchup/stats-compare'
import { analyzeMatchup, getQuota, formatReset, canAfford, analysisErrorText, type BuildNameContext, type MatchUpAnalysisResult, type QuotaState } from '@/lib/matchup/api'
import { formatNumber, ddragonLocale } from '@/lib/intl'
import { useDashboard, useLang } from '@/locales/dashboard'
import { balanceLabel, needLabel, type AnalyseDict } from '@/locales/dashboard/analyse'
import ModeSelector from '@/components/dashboard/matchup/ModeSelector'
import ChampionPicker from '@/components/dashboard/matchup/ChampionPicker'
import BuildPicker, { type SavedBuildDisplay } from '@/components/dashboard/matchup/BuildPicker'
import StatRadar from '@/components/dashboard/matchup/StatRadar'

// ════════════════════════════════════════════════════════════════════════════
//  MatchUpTab — éditeur de scénario MatchUp (portage web du builder WPF)
// ════════════════════════════════════════════════════════════════════════════
// Lot 2.1 : socle (mode, slots vides, autosave localStorage).
// Lot 2.2 : sélection de champion + niveau simulé 1..18.
// Lot 2.3 : build d'items par slot — build sauvegardé (item_builds) OU build
// temporaire (snapshot inline), via l'overlay BuildPicker. La comparaison de
// stats agrégées (resolveBuildStats) arrive en 2.4.

type PickerTarget = { side: Side; index: number }

// Vocabulaire de rôle repris de l'éditeur Scénarios (mêmes libellés, mêmes couleurs)
// pour que les deux outils se lisent pareil. Le rôle est OPTIONNEL sur un slot
// MatchUp (contrairement aux Scénarios où les 5 rôles sont fixes) : re-cliquer le
// rôle actif le retire.
const ROLES = MATCHUP_ROLES   // source unique (types.ts), partagée avec le payload
// Abréviations d'affichage : identiques dans les deux langues, et la clé qu'elles
// indexent part telle quelle dans le payload de l'EF — elles restent donc ici.
const ROLE_SHORT: Record<MatchUpRole, string> = {
  TOP: 'TOP', JUNGLE: 'JGL', MID: 'MID', ADC: 'ADC', SUPPORT: 'SUP',
}
const ROLE_COLORS: Record<MatchUpRole, string> = {
  TOP: '#E24B4A', JUNGLE: '#5DCAA5', MID: '#EF9F27', ADC: '#7F77DD', SUPPORT: '#3A8AC9',
}

// Build sauvegardé chargé depuis item_builds : affichage (picker + chip) + blocs
// slim pour la future résolution de stats (2.4).
interface SavedBuildFull extends SavedBuildDisplay {
  blocks: SavedBuildLite['blocks']
}

// Résumé d'un build pour l'affichage d'un slot occupé.
interface BuildSummary {
  label: string
  itemImages: string[]
  gold: number
}

export default function MatchUpTab() {
  const { theme } = useTheme()
  const A = useDashboard().analyse
  const lang = useLang()
  const M = A.matchup
  const c = theme === 'mythic'
  const supabase = useMemo(() => createClient(), [])

  const [dd, setDd]             = useState<DDragonData | null>(null)
  const [ddError, setDdError]   = useState(false)
  const [scenario, setScenario] = useState<MatchUpScenario | null>(null)
  const [saved, setSaved]       = useState<SavedBuildFull[]>([])
  const [champTarget, setChampTarget] = useState<PickerTarget | null>(null)
  const [buildTarget, setBuildTarget] = useState<PickerTarget | null>(null)
  // Analyse IA (Lot 3)
  const [quota, setQuota]         = useState<QuotaState | null>(null)
  const [analysis, setAnalysis]   = useState<MatchUpAnalysisResult | null>(null)
  const [analyzing, setAnalyzing] = useState<false | 'quick' | 'detailed'>(false)

  /**
   * Chargement DDragon — effet SÉPARÉ, avec `lang` en dépendance.
   *
   * ⚠️ Il vivait dans l'effet d'initialisation ci-dessous jusqu'au Lot 8. L'y laisser
   * en ajoutant `lang` aux dépendances aurait rejoué `setScenario(...)` à chaque
   * bascule de langue, donc REMPLACÉ le scénario en cours d'édition par celui du
   * localStorage. Les deux chargements n'ont pas le même cycle de vie.
   */
  useEffect(() => {
    let alive = true
    loadDDragon(ddragonLocale(lang))
      .then(d => { if (alive) setDd(d) })
      .catch(() => { if (alive) setDdError(true) })
    return () => { alive = false }
  }, [lang])

  // Builds sauvegardés + restauration/création du scénario.
  useEffect(() => {
    let alive = true
    const existing = listScenarios()
    setScenario(existing[0] ?? createScenario('1v1'))

    // Builds sauvegardés (item_builds) — seulement si connecté ; RLS filtre au user.
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase.from('item_builds').select('*').order('created_at', { ascending: false })
      if (!alive || !data) return
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const mapped: SavedBuildFull[] = (data as any[]).map(row => {
        const rawBlocks: any[] = row.blocks ?? []
        return {
          id:         row.id,
          name:       row.name,
          champName:  row.champ?.name ?? null,
          itemImages: rawBlocks.flatMap(b => (b.items ?? []).map((si: any) => si.image)).filter(Boolean),
          totalGold:  row.total_gold ?? 0,
          blocks:     rawBlocks.map(b => ({ items: (b.items ?? []).map((si: any) => ({ itemId: si.itemId, count: si.count ?? 1 })) })),
        }
      })
      /* eslint-enable @typescript-eslint/no-explicit-any */
      setSaved(mapped)
    })()

    return () => { alive = false }
  }, [supabase])

  // Autosave debounced : toute mutation du scénario est persistée en localStorage.
  useEffect(() => {
    if (!scenario) return
    const t = setTimeout(() => saveScenario(scenario), 400)
    return () => clearTimeout(t)
  }, [scenario])

  // État du quota hebdo (GET, ne consomme rien). null si non connecté → compteur masqué.
  useEffect(() => {
    let alive = true
    getQuota().then(q => { if (alive) setQuota(q) })
    return () => { alive = false }
  }, [])

  // Index DDragon dérivés (item id → item complet) pour l'aperçu des builds temp.
  const itemsById = useMemo<Record<string, DDItemFull>>(() => {
    const out: Record<string, DDItemFull> = {}
    for (const it of dd?.items ?? []) out[it.id] = it
    return out
  }, [dd])

  const savedById = useMemo<Record<string, SavedBuildFull>>(() => {
    const out: Record<string, SavedBuildFull> = {}
    for (const b of saved) out[b.id] = b
    return out
  }, [saved])

  // Index DDragon item id → stats (résolution des builds sauvegardés pour le radar).
  const itemStatsIndex = useMemo<ItemStatsIndex>(() => {
    const out: ItemStatsIndex = {}
    for (const it of dd?.items ?? []) out[it.id] = it.stats
    return out
  }, [dd])

  // Contexte de résolution des noms d'items pour le payload d'analyse (Lot 3).
  const nameCtx = useMemo<BuildNameContext>(() => {
    const itemNameById: Record<string, string> = {}
    for (const it of dd?.items ?? []) itemNameById[it.id] = it.name
    return { itemNameById, savedById }
  }, [dd, savedById])

  function changeMode(mode: MatchUpMode) {
    setScenario(s => (s ? resizeToMode(s, mode) : s))
  }

  function pickChampion(ch: DDChampFull) {
    if (!champTarget) return
    setScenario(s => (s ? setChampion(s, champTarget.side, champTarget.index, { id: ch.id, name: ch.name, image: ch.image }, ch.stats) : s))
    setChampTarget(null)
  }

  function clearSlot(side: Side, index: number) {
    setScenario(s => (s ? setChampion(s, side, index, null) : s))
  }

  function changeLevel(side: Side, index: number, level: number) {
    setScenario(s => (s ? setLevel(s, side, index, level) : s))
  }

  // Toggle : re-cliquer le rôle déjà actif le retire (retour à « aucun rôle »).
  // `setRole` re-clampe le niveau, donc quitter Top rabaisse 19/20 → 18.
  function toggleRole(side: Side, index: number, role: MatchUpRole) {
    setScenario(s => {
      if (!s) return s
      const current = s[side][index]?.role
      return setRole(s, side, index, current === role ? null : role)
    })
  }

  function applyBuild(build: BuildRef) {
    if (!buildTarget) return
    setScenario(s => (s ? setBuild(s, buildTarget.side, buildTarget.index, build) : s))
    setBuildTarget(null)
  }

  // Analyse IA (POST matchup-analyze). Met à jour le quota depuis la réponse quand
  // elle porte l'état (succès ou plafond 429) — pas sur une erreur réseau/serveur.
  async function runAnalysis(advanced: boolean) {
    if (analyzing || !scenario) return
    setAnalyzing(advanced ? 'detailed' : 'quick')
    const res = await analyzeMatchup(scenario, advanced, nameCtx)
    setAnalysis(res)
    if (res.success || res.overQuota) {
      setQuota({
        used: res.used, limit: res.limit, remaining: res.remaining,
        model: res.model, resetsAt: res.resetsAt, costs: res.costs,
      })
    }
    setAnalyzing(false)
  }

  // Résumé d'affichage d'un build attaché à un slot (null si aucun).
  function describeBuild(build: BuildRef): BuildSummary | null {
    if (build.kind === 'none') return null
    if (build.kind === 'saved') {
      const sd = savedById[build.buildId]
      if (!sd) return { label: M.buildDeleted, itemImages: [], gold: 0 }
      return { label: sd.name, itemImages: sd.itemImages, gold: sd.totalGold }
    }
    // temp
    const items = build.blocks.flatMap(b => b.items)
    const gold = items.reduce((s, it) => s + (itemsById[it.id]?.gold ?? 0) * it.count, 0)
    return { label: M.buildTemp, itemImages: items.map(it => it.image), gold }
  }

  if (ddError) {
    return <p style={{ color: '#E5484D', fontSize: 14 }}>{M.loadError}</p>
  }
  if (!dd || !scenario) {
    return <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>{M.loading}</p>
  }

  const buildSlot = buildTarget ? scenario[buildTarget.side][buildTarget.index] : null

  const hasAlly  = scenario.allies.some(ch => ch.champ)
  const hasEnemy = scenario.enemies.some(ch => ch.champ)
  const radar = computeRadar(scenario.allies, scenario.enemies, savedById, itemStatsIndex)

  // Analyse IA : besoin d'un champion de chaque côté, et de braises SUFFISANTES
  // POUR L'ACTION VISÉE. Le booléen unique `remaining <= 0` de l'ancien modèle
  // « N analyses » ne convient plus : avec un pot fongible et des coûts
  // différenciés, il peut rester de quoi financer une rapide (17) sans pouvoir
  // s'offrir une détaillée (33) — un seul drapeau désactiverait les deux boutons.
  const ready       = hasAlly && hasEnemy && !analyzing
  const canQuick    = ready && canAfford(quota, false)
  const canDetailed = ready && canAfford(quota, true)
  // « Épuisé » au sens strict : plus rien de finançable, même la moins chère.
  const quotaExhausted = quota != null && !canAfford(quota, false)

  const columnProps = (side: Side, champions: MatchUpChampion[]) => ({
    side, champions, version: dd.version, c, m: M,
    describeBuild,
    onAdd:   (i: number) => setChampTarget({ side, index: i }),
    onClear: (i: number) => clearSlot(side, i),
    onLevel: (i: number, lvl: number) => changeLevel(side, i, lvl),
    onRole:  (i: number, role: MatchUpRole) => toggleRole(side, i, role),
    onBuild: (i: number) => setBuildTarget({ side, index: i }),
  })

  return (
    <div>
      <ModeSelector mode={scenario.mode} onChange={changeMode} c={c} />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 16, alignItems: 'start' }}>
        <SlotColumn label={M.allies} color="#5DCAA5" {...columnProps('allies', scenario.allies)} />
        <div style={{ alignSelf: 'center', color: 'var(--text-muted)', fontWeight: 700, fontSize: 18 }}>{M.versus}</div>
        <SlotColumn label={M.enemies} color="#E5484D" {...columnProps('enemies', scenario.enemies)} />
      </div>

      {/* Comparaison de stats — radar seul (parité AddStatsComparison WPF). */}
      <div style={{ marginTop: 24 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 12 }}>
          {M.radarTitle}
        </div>
        {hasAlly && hasEnemy ? (
          <StatRadar axes={radar} c={c} labels={A.radarAxes} alt={M.radarAlt} />
        ) : (
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            {M.radarEmpty}
          </p>
        )}
      </div>

      {/* Analyse IA (matchup-analyze) */}
      <div style={{ marginTop: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{M.analysisTitle}</div>
          {quota && (
            <span style={{ fontSize: 12, color: quotaExhausted ? '#E5484D' : 'var(--text-muted)' }}>
              {A.quota.potName} — {balanceLabel(A, quota.remaining, quota.limit)}
              {quota.resetsAt && quotaExhausted
                ? ` · ${A.quota.resetShort.replace('{date}', formatReset(quota.resetsAt, A, lang))}`
                : ''}
            </span>
          )}
        </div>

        {/* Chaque bouton est gardé par SON coût — voir canQuick / canDetailed. */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button
            onClick={() => runAnalysis(false)}
            disabled={!canQuick}
            style={analyzeBtnStyle(c, analyzing === 'quick', !canQuick)}
          >
            {analyzing === 'quick' ? M.running : M.quick}
            {quota && quota.costs.quick > 0 ? ` · ${quota.costs.quick}` : ''}
          </button>
          <button
            onClick={() => runAnalysis(true)}
            disabled={!canDetailed}
            style={analyzeBtnStyle(c, analyzing === 'detailed', !canDetailed)}
          >
            {analyzing === 'detailed' ? M.running : M.detailed}
            {quota && quota.costs.detailed > 0 ? ` · ${quota.costs.detailed}` : ''}
          </button>
        </div>

        {!hasAlly || !hasEnemy ? (
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
            {M.needChampions}
          </p>
        ) : quotaExhausted ? (
          <p style={{ fontSize: 12, color: '#E5484D', marginTop: 8 }}>
            {A.quota.exhausted}
          </p>
        ) : quota && !canDetailed ? (
          // Cas propre au pot fongible : assez pour une rapide, pas pour une
          // détaillée. Sans ce message, le bouton détaillée serait grisé sans
          // aucune explication visible. Même gabarit que le 429 de la couche
          // réseau — la phrase ne doit pas diverger selon d'où vient le refus.
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
            {needLabel(A, quota.remaining, quota.costs.detailed, M.actionDetailed)}
          </p>
        ) : null}

        {analysis && (
          <div
            style={{
              marginTop: 14, padding: 14, borderRadius: 8,
              background: c ? 'rgba(255,255,255,0.03)' : '#18181B',
              border: `1px solid ${analysis.success ? (c ? 'rgba(186,117,23,0.25)' : '#27272A') : '#E5484D'}`,
            }}
          >
            {analysis.truncated && (
              <div style={{ fontSize: 12, color: c ? '#FAC775' : '#EF9F27', marginBottom: 8 }}>
                {M.truncated}
              </div>
            )}
            {/* Succès : le texte vient d'Anthropic (non traduisible ici). Échec :
                le message est composé MAINTENANT depuis le code mémorisé, donc il
                suit une bascule de langue. */}
            <div style={{ fontSize: 13, lineHeight: 1.55, color: analysis.success ? 'var(--text)' : '#E5484D', whiteSpace: 'pre-wrap' }}>
              {analysis.success ? analysis.text : analysisErrorText(A, analysis, lang)}
            </div>
          </div>
        )}
      </div>

      {champTarget && (
        <ChampionPicker
          champs={dd.champs} version={dd.version} c={c}
          searchPlaceholder={M.searchChampion} emptyLabel={M.noChampionFound}
          onPick={pickChampion} onClose={() => setChampTarget(null)}
        />
      )}

      {buildTarget && buildSlot && (
        <BuildPicker
          items={dd.items} version={dd.version} c={c}
          labels={M.picker}
          savedBuilds={saved}
          initial={buildSlot.build}
          onApply={applyBuild} onClose={() => setBuildTarget(null)}
        />
      )}
    </div>
  )
}

// Style d'un bouton d'analyse (actif / en cours / désactivé).
function analyzeBtnStyle(c: boolean, loading: boolean, disabled: boolean): CSSProperties {
  const accent = c ? '#BA7517' : '#7F77DD'
  return {
    padding: '9px 18px', borderRadius: 8, fontSize: 13, fontWeight: 700,
    cursor: disabled ? 'default' : 'pointer',
    color: disabled ? 'var(--text-muted)' : '#fff',
    background: disabled ? (c ? 'rgba(255,255,255,0.04)' : '#18181B') : accent,
    border: `1px solid ${disabled ? (c ? 'rgba(186,117,23,0.2)' : '#27272A') : accent}`,
    opacity: loading ? 0.75 : 1,
  }
}

// Colonne de slots d'un camp.
function SlotColumn({
  label, color, side, champions, version, c, m, describeBuild, onAdd, onClear, onLevel, onRole, onBuild,
}: {
  label: string
  color: string
  side: Side
  champions: MatchUpChampion[]
  version: string
  c: boolean
  m: AnalyseDict['matchup']
  describeBuild: (build: BuildRef) => BuildSummary | null
  onAdd: (index: number) => void
  onClear: (index: number) => void
  onLevel: (index: number, level: number) => void
  onRole: (index: number, role: MatchUpRole) => void
  onBuild: (index: number) => void
}) {
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 700, color, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>
        {label}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {champions.map((ch, i) =>
          ch.champ ? (
            <FilledSlot
              key={`${side}-${i}`}
              champ={ch} version={version} c={c} m={m}
              build={describeBuild(ch.build)}
              onClear={() => onClear(i)}
              onLevel={lvl => onLevel(i, lvl)}
              onRole={role => onRole(i, role)}
              onBuild={() => onBuild(i)}
            />
          ) : (
            <button
              key={`${side}-${i}`}
              onClick={() => onAdd(i)}
              style={{
                padding: '14px 12px', borderRadius: 8, textAlign: 'center', fontSize: 13, cursor: 'pointer',
                color: 'var(--text-muted)',
                background: c ? 'rgba(255,255,255,0.02)' : '#18181B',
                border: `1px dashed ${c ? 'rgba(186,117,23,0.25)' : '#27272A'}`,
              }}
            >
              {m.addSlot}
            </button>
          )
        )}
      </div>
    </div>
  )
}

// Slot occupé : icône + nom + niveau + build attaché + retrait.
function FilledSlot({
  champ, version, c, m, build, onClear, onLevel, onRole, onBuild,
}: {
  champ: MatchUpChampion
  version: string
  c: boolean
  m: AnalyseDict['matchup']
  build: BuildSummary | null
  onClear: () => void
  onLevel: (level: number) => void
  onRole: (role: MatchUpRole) => void
  onBuild: () => void
}) {
  const lang = useLang()
  const name = champ.champ!.name
  const border = c ? 'rgba(186,117,23,0.25)' : '#27272A'
  // Cap dérivé du rôle : 20 pour Top (Role Quest S16), 18 partout ailleurs et
  // quand aucun rôle n'est renseigné.
  const maxLevel = maxLevelForRole(champ.role)
  return (
    <div
      style={{
        display: 'flex', flexDirection: 'column', gap: 8, padding: '8px 10px', borderRadius: 8,
        background: c ? 'rgba(255,255,255,0.03)' : '#18181B', border: `1px solid ${border}`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={champImgUrl(version, champ.champ!.image)} alt={name} width={40} height={40} style={{ borderRadius: 6, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {name}
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{m.level}</span>
            <select
              value={champ.level}
              onChange={e => onLevel(Number(e.target.value))}
              style={{
                fontSize: 12, padding: '2px 6px', borderRadius: 6, cursor: 'pointer',
                color: 'var(--text)', background: c ? 'rgba(0,0,0,0.25)' : '#0F0F11', border: `1px solid ${border}`,
              }}
            >
              {Array.from({ length: maxLevel - MIN_LEVEL + 1 }, (_, k) => MIN_LEVEL + k).map(lvl => (
                <option key={lvl} value={lvl}>{lvl}</option>
              ))}
            </select>
            {champ.role === 'TOP' && (
              <span title={m.topLevelCap} style={{ fontSize: 10, color: ROLE_COLORS.TOP, fontWeight: 700 }}>
                /20
              </span>
            )}
          </label>
        </div>
        <button
          onClick={onClear}
          title={m.removeSlot} aria-label={m.removeSlotLabel.replace('{name}', name)}
          style={{
            flexShrink: 0, width: 24, height: 24, borderRadius: 6, cursor: 'pointer', lineHeight: 1,
            color: 'var(--text-muted)', background: 'transparent', border: `1px solid ${border}`,
          }}
        >
          ×
        </button>
      </div>

      {/* Rôle du slot (optionnel) — toggle : re-cliquer le rôle actif le retire. */}
      <div style={{ display: 'flex', gap: 4 }} role="group" aria-label={m.roleGroupLabel.replace('{name}', name)}>
        {ROLES.map(r => {
          const on = champ.role === r
          return (
            <button
              key={r}
              onClick={() => onRole(r)}
              aria-pressed={on}
              title={(on ? m.unassignRole : m.assignRole).replace('{role}', r)}
              style={{
                flex: 1, padding: '3px 0', borderRadius: 5, fontSize: 10, fontWeight: 700, letterSpacing: 0.5, cursor: 'pointer',
                color: on ? '#fff' : 'var(--text-muted)',
                background: on ? ROLE_COLORS[r] : 'transparent',
                border: `1px solid ${on ? ROLE_COLORS[r] : border}`,
              }}
            >
              {ROLE_SHORT[r]}
            </button>
          )
        })}
      </div>

      {/* Ligne build : chip + bouton d'édition */}
      <button
        onClick={onBuild}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '6px 8px', borderRadius: 6, cursor: 'pointer',
          textAlign: 'left', background: c ? 'rgba(0,0,0,0.2)' : '#0F0F11', border: `1px dashed ${border}`,
        }}
      >
        {build ? (
          <>
            <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
              {build.itemImages.slice(0, 5).map((img, k) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={k} src={itemImgUrl(version, img)} alt="" width={20} height={20} style={{ borderRadius: 4 }} />
              ))}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{build.label}</div>
              {build.gold > 0 && <div style={{ fontSize: 10, color: c ? '#FAC775' : '#EF9F27' }}>{formatNumber(build.gold, lang)} {m.goldSuffix}</div>}
            </div>
          </>
        ) : (
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{m.addBuild}</span>
        )}
      </button>
    </div>
  )
}
