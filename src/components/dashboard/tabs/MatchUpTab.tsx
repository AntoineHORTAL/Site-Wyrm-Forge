'use client'

import { useState, useEffect } from 'react'
import { useTheme } from '@/components/providers/ThemeProvider'
import { loadDDragon, champImgUrl, type DDragonData, type DDChampFull } from '@/lib/matchup/ddragon'
import { listScenarios, saveScenario } from '@/lib/matchup/storage'
import {
  createScenario, resizeToMode, setChampion, setLevel, MIN_LEVEL, MAX_LEVEL,
  type MatchUpScenario, type MatchUpMode, type MatchUpChampion, type Side,
} from '@/lib/matchup/types'
import ModeSelector from '@/components/dashboard/matchup/ModeSelector'
import ChampionPicker from '@/components/dashboard/matchup/ChampionPicker'

// ════════════════════════════════════════════════════════════════════════════
//  MatchUpTab — éditeur de scénario MatchUp (portage web du builder WPF)
// ════════════════════════════════════════════════════════════════════════════
// Lot 2.1 : socle (mode, slots vides, autosave localStorage).
// Lot 2.2 : sélection de champion par slot (overlay ChampionPicker) + niveau
// simulé 1..18. Le snapshot de stats DDragon (`baseStats`) est figé à la
// sélection. Build + comparaison de stats arrivent en 2.3→2.4.

type PickerTarget = { side: Side; index: number }

export default function MatchUpTab() {
  const { theme } = useTheme()
  const c = theme === 'mythic'

  const [dd, setDd]             = useState<DDragonData | null>(null)
  const [ddError, setDdError]   = useState(false)
  const [scenario, setScenario] = useState<MatchUpScenario | null>(null)
  const [picker, setPicker]     = useState<PickerTarget | null>(null)

  // Chargement DDragon + restauration/création du scénario de travail.
  useEffect(() => {
    let alive = true
    loadDDragon().then(d => { if (alive) setDd(d) }).catch(() => { if (alive) setDdError(true) })
    const existing = listScenarios()
    setScenario(existing[0] ?? createScenario('1v1'))
    return () => { alive = false }
  }, [])

  // Autosave debounced : toute mutation du scénario est persistée en localStorage.
  useEffect(() => {
    if (!scenario) return
    const t = setTimeout(() => saveScenario(scenario), 400)
    return () => clearTimeout(t)
  }, [scenario])

  function changeMode(mode: MatchUpMode) {
    setScenario(s => (s ? resizeToMode(s, mode) : s))
  }

  // Sélection d'un champion depuis l'overlay → fige le snapshot de stats DDragon.
  function pickChampion(ch: DDChampFull) {
    if (!picker) return
    setScenario(s => (s ? setChampion(s, picker.side, picker.index, { id: ch.id, name: ch.name, image: ch.image }, ch.stats) : s))
    setPicker(null)
  }

  function clearSlot(side: Side, index: number) {
    setScenario(s => (s ? setChampion(s, side, index, null) : s))
  }

  function changeLevel(side: Side, index: number, level: number) {
    setScenario(s => (s ? setLevel(s, side, index, level) : s))
  }

  if (ddError) {
    return <p style={{ color: '#E5484D', fontSize: 14 }}>Impossible de charger les données des champions. Réessaie plus tard.</p>
  }
  if (!dd || !scenario) {
    return <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Chargement des champions…</p>
  }

  return (
    <div>
      <ModeSelector mode={scenario.mode} onChange={changeMode} c={c} />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 16, alignItems: 'start' }}>
        <SlotColumn
          label="Alliés" color="#5DCAA5" side="allies" champions={scenario.allies}
          version={dd.version} c={c}
          onAdd={i => setPicker({ side: 'allies', index: i })}
          onClear={i => clearSlot('allies', i)}
          onLevel={(i, lvl) => changeLevel('allies', i, lvl)}
        />
        <div style={{ alignSelf: 'center', color: 'var(--text-muted)', fontWeight: 700, fontSize: 18 }}>VS</div>
        <SlotColumn
          label="Ennemis" color="#E5484D" side="enemies" champions={scenario.enemies}
          version={dd.version} c={c}
          onAdd={i => setPicker({ side: 'enemies', index: i })}
          onClear={i => clearSlot('enemies', i)}
          onLevel={(i, lvl) => changeLevel('enemies', i, lvl)}
        />
      </div>

      {picker && (
        <ChampionPicker
          champs={dd.champs} version={dd.version} c={c}
          onPick={pickChampion} onClose={() => setPicker(null)}
        />
      )}
    </div>
  )
}

// Colonne de slots d'un camp. Un slot vide affiche « + Ajouter » (ouvre le
// picker) ; un slot occupé affiche l'icône, le nom, le sélecteur de niveau et un
// bouton de retrait.
function SlotColumn({
  label, color, side, champions, version, c, onAdd, onClear, onLevel,
}: {
  label: string
  color: string
  side: Side
  champions: MatchUpChampion[]
  version: string
  c: boolean
  onAdd: (index: number) => void
  onClear: (index: number) => void
  onLevel: (index: number, level: number) => void
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
              onClear={() => onClear(i)}
              onLevel={lvl => onLevel(i, lvl)}
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

// Slot occupé : icône + nom + niveau + retrait.
function FilledSlot({
  champ, version, c, onClear, onLevel,
}: {
  champ: MatchUpChampion
  version: string
  c: boolean
  onClear: () => void
  onLevel: (level: number) => void
}) {
  const name = champ.champ!.name
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8,
        background: c ? 'rgba(255,255,255,0.03)' : '#18181B',
        border: `1px solid ${c ? 'rgba(186,117,23,0.25)' : '#27272A'}`,
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={champImgUrl(version, champ.champ!.image)}
        alt={name}
        width={40} height={40}
        style={{ borderRadius: 6, flexShrink: 0 }}
      />
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
              color: 'var(--text)', background: c ? 'rgba(0,0,0,0.25)' : '#0F0F11',
              border: `1px solid ${c ? 'rgba(186,117,23,0.25)' : '#27272A'}`,
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
        title="Retirer"
        aria-label={`Retirer ${name}`}
        style={{
          flexShrink: 0, width: 24, height: 24, borderRadius: 6, cursor: 'pointer', lineHeight: 1,
          color: 'var(--text-muted)', background: 'transparent',
          border: `1px solid ${c ? 'rgba(186,117,23,0.25)' : '#27272A'}`,
        }}
      >
        ×
      </button>
    </div>
  )
}
