'use client'

import { useState, useEffect, useMemo } from 'react'
import { useTheme } from '@/components/providers/ThemeProvider'
import { createClient } from '@/lib/supabase/client'
import { loadDDragon, champImgUrl, itemImgUrl, type DDragonData, type DDChampFull, type DDItemFull } from '@/lib/matchup/ddragon'
import { listScenarios, saveScenario } from '@/lib/matchup/storage'
import {
  createScenario, resizeToMode, setChampion, setLevel, setBuild, MIN_LEVEL, MAX_LEVEL,
  type MatchUpScenario, type MatchUpMode, type MatchUpChampion, type Side, type BuildRef,
} from '@/lib/matchup/types'
import type { SavedBuildLite } from '@/lib/matchup/build-resolve'
import ModeSelector from '@/components/dashboard/matchup/ModeSelector'
import ChampionPicker from '@/components/dashboard/matchup/ChampionPicker'
import BuildPicker, { type SavedBuildDisplay } from '@/components/dashboard/matchup/BuildPicker'

// ════════════════════════════════════════════════════════════════════════════
//  MatchUpTab — éditeur de scénario MatchUp (portage web du builder WPF)
// ════════════════════════════════════════════════════════════════════════════
// Lot 2.1 : socle (mode, slots vides, autosave localStorage).
// Lot 2.2 : sélection de champion + niveau simulé 1..18.
// Lot 2.3 : build d'items par slot — build sauvegardé (item_builds) OU build
// temporaire (snapshot inline), via l'overlay BuildPicker. La comparaison de
// stats agrégées (resolveBuildStats) arrive en 2.4.

type PickerTarget = { side: Side; index: number }

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
  const c = theme === 'mythic'
  const supabase = useMemo(() => createClient(), [])

  const [dd, setDd]             = useState<DDragonData | null>(null)
  const [ddError, setDdError]   = useState(false)
  const [scenario, setScenario] = useState<MatchUpScenario | null>(null)
  const [saved, setSaved]       = useState<SavedBuildFull[]>([])
  const [champTarget, setChampTarget] = useState<PickerTarget | null>(null)
  const [buildTarget, setBuildTarget] = useState<PickerTarget | null>(null)

  // Chargement DDragon + builds sauvegardés + restauration/création du scénario.
  useEffect(() => {
    let alive = true
    loadDDragon().then(d => { if (alive) setDd(d) }).catch(() => { if (alive) setDdError(true) })
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

  function applyBuild(build: BuildRef) {
    if (!buildTarget) return
    setScenario(s => (s ? setBuild(s, buildTarget.side, buildTarget.index, build) : s))
    setBuildTarget(null)
  }

  // Résumé d'affichage d'un build attaché à un slot (null si aucun).
  function describeBuild(build: BuildRef): BuildSummary | null {
    if (build.kind === 'none') return null
    if (build.kind === 'saved') {
      const sd = savedById[build.buildId]
      if (!sd) return { label: 'Build supprimé', itemImages: [], gold: 0 }
      return { label: sd.name, itemImages: sd.itemImages, gold: sd.totalGold }
    }
    // temp
    const items = build.blocks.flatMap(b => b.items)
    const gold = items.reduce((s, it) => s + (itemsById[it.id]?.gold ?? 0) * it.count, 0)
    return { label: 'Build temporaire', itemImages: items.map(it => it.image), gold }
  }

  if (ddError) {
    return <p style={{ color: '#E5484D', fontSize: 14 }}>Impossible de charger les données des champions. Réessaie plus tard.</p>
  }
  if (!dd || !scenario) {
    return <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Chargement des champions…</p>
  }

  const buildSlot = buildTarget ? scenario[buildTarget.side][buildTarget.index] : null

  const columnProps = (side: Side, champions: MatchUpChampion[]) => ({
    side, champions, version: dd.version, c,
    describeBuild,
    onAdd:   (i: number) => setChampTarget({ side, index: i }),
    onClear: (i: number) => clearSlot(side, i),
    onLevel: (i: number, lvl: number) => changeLevel(side, i, lvl),
    onBuild: (i: number) => setBuildTarget({ side, index: i }),
  })

  return (
    <div>
      <ModeSelector mode={scenario.mode} onChange={changeMode} c={c} />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 16, alignItems: 'start' }}>
        <SlotColumn label="Alliés" color="#5DCAA5" {...columnProps('allies', scenario.allies)} />
        <div style={{ alignSelf: 'center', color: 'var(--text-muted)', fontWeight: 700, fontSize: 18 }}>VS</div>
        <SlotColumn label="Ennemis" color="#E5484D" {...columnProps('enemies', scenario.enemies)} />
      </div>

      {champTarget && (
        <ChampionPicker
          champs={dd.champs} version={dd.version} c={c}
          onPick={pickChampion} onClose={() => setChampTarget(null)}
        />
      )}

      {buildTarget && buildSlot && (
        <BuildPicker
          items={dd.items} version={dd.version} c={c}
          savedBuilds={saved}
          initial={buildSlot.build}
          onApply={applyBuild} onClose={() => setBuildTarget(null)}
        />
      )}
    </div>
  )
}

// Colonne de slots d'un camp.
function SlotColumn({
  label, color, side, champions, version, c, describeBuild, onAdd, onClear, onLevel, onBuild,
}: {
  label: string
  color: string
  side: Side
  champions: MatchUpChampion[]
  version: string
  c: boolean
  describeBuild: (build: BuildRef) => BuildSummary | null
  onAdd: (index: number) => void
  onClear: (index: number) => void
  onLevel: (index: number, level: number) => void
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
              champ={ch} version={version} c={c}
              build={describeBuild(ch.build)}
              onClear={() => onClear(i)}
              onLevel={lvl => onLevel(i, lvl)}
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
              + Ajouter
            </button>
          )
        )}
      </div>
    </div>
  )
}

// Slot occupé : icône + nom + niveau + build attaché + retrait.
function FilledSlot({
  champ, version, c, build, onClear, onLevel, onBuild,
}: {
  champ: MatchUpChampion
  version: string
  c: boolean
  build: BuildSummary | null
  onClear: () => void
  onLevel: (level: number) => void
  onBuild: () => void
}) {
  const name = champ.champ!.name
  const border = c ? 'rgba(186,117,23,0.25)' : '#27272A'
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
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Niveau</span>
            <select
              value={champ.level}
              onChange={e => onLevel(Number(e.target.value))}
              style={{
                fontSize: 12, padding: '2px 6px', borderRadius: 6, cursor: 'pointer',
                color: 'var(--text)', background: c ? 'rgba(0,0,0,0.25)' : '#0F0F11', border: `1px solid ${border}`,
              }}
            >
              {Array.from({ length: MAX_LEVEL - MIN_LEVEL + 1 }, (_, k) => MIN_LEVEL + k).map(lvl => (
                <option key={lvl} value={lvl}>{lvl}</option>
              ))}
            </select>
          </label>
        </div>
        <button
          onClick={onClear}
          title="Retirer" aria-label={`Retirer ${name}`}
          style={{
            flexShrink: 0, width: 24, height: 24, borderRadius: 6, cursor: 'pointer', lineHeight: 1,
            color: 'var(--text-muted)', background: 'transparent', border: `1px solid ${border}`,
          }}
        >
          ×
        </button>
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
              {build.gold > 0 && <div style={{ fontSize: 10, color: c ? '#FAC775' : '#EF9F27' }}>{build.gold.toLocaleString('fr-FR')} g</div>}
            </div>
          </>
        ) : (
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>+ Build d&apos;items</span>
        )}
      </button>
    </div>
  )
}
