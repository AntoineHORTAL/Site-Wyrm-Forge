'use client'

import { useState, useEffect } from 'react'
import { useTheme } from '@/components/providers/ThemeProvider'
import { loadDDragon, type DDragonData } from '@/lib/matchup/ddragon'
import { listScenarios, saveScenario } from '@/lib/matchup/storage'
import { createScenario, resizeToMode, type MatchUpScenario, type MatchUpMode } from '@/lib/matchup/types'
import ModeSelector from '@/components/dashboard/matchup/ModeSelector'

// ════════════════════════════════════════════════════════════════════════════
//  MatchUpTab — éditeur de scénario MatchUp (portage web du builder WPF)
// ════════════════════════════════════════════════════════════════════════════
// Lot 2.1 (socle) : chargement DDragon, sélecteur de mode 1v1→5v5, slots vides,
// autosave localStorage à chaque changement (parité comportement WPF). La
// sélection de champions/builds et la comparaison de stats arrivent en 2.2→2.4.

export default function MatchUpTab() {
  const { theme } = useTheme()
  const c = theme === 'mythic'

  const [dd, setDd]             = useState<DDragonData | null>(null)
  const [ddError, setDdError]   = useState(false)
  const [scenario, setScenario] = useState<MatchUpScenario | null>(null)

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
        <SlotColumn label="Alliés"  color="#5DCAA5" champions={scenario.allies}  c={c} />
        <div style={{ alignSelf: 'center', color: 'var(--text-muted)', fontWeight: 700, fontSize: 18 }}>VS</div>
        <SlotColumn label="Ennemis" color="#E5484D" champions={scenario.enemies} c={c} />
      </div>
    </div>
  )
}

// Colonne de slots d'un camp. En 2.1 les slots sont des placeholders (la
// sélection de champion devient interactive en 2.2).
function SlotColumn({
  label, color, champions, c,
}: {
  label: string
  color: string
  champions: { champ: { name: string } | null }[]
  c: boolean
}) {
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 700, color, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>
        {label}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {champions.map((ch, i) => (
          <div
            key={i}
            style={{
              padding: '14px 12px',
              borderRadius: 8,
              textAlign: 'center',
              fontSize: 13,
              color: 'var(--text-muted)',
              background: c ? 'rgba(255,255,255,0.02)' : '#18181B',
              border: `1px dashed ${c ? 'rgba(186,117,23,0.25)' : '#27272A'}`,
            }}
          >
            {ch.champ ? ch.champ.name : '+ Ajouter'}
          </div>
        ))}
      </div>
    </div>
  )
}
