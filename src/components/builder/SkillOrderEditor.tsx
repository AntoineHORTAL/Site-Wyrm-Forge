'use client'

/**
 * Éditeur de Skill Order pour un build.
 *
 * Saisie de la priorité de montée des sorts sur les 18 niveaux du jeu, plus
 * la priorité de max (ex: Q > E > W).
 *
 * Règles LoL :
 *   - 18 niveaux au total
 *   - R (ultime) : disponible uniquement aux niveaux 6, 11, 16
 *   - Q/W/E : max 5 points chacun
 *   - R : max 3 points (les 3 niveaux d'ult)
 *
 * Format de sortie :
 *   {
 *     levels: ['Q', 'W', 'E', 'Q', ...],  // 18 entrées
 *     priority: ['Q', 'W', 'E']           // ordre de max (3 sorts)
 *   }
 */
import { useMemo } from 'react'
import { useDashboard } from '@/locales/dashboard'
import type { BuildsDict } from '@/locales/dashboard/builds'

export interface SkillOrder {
  levels: Slot[]      // 18 entrées (Q/W/E/R), tableau peut être plus court si pas encore complet
  priority: Slot[]    // ordre de max des sorts (ex: ['Q', 'E', 'W'])
}

export type Slot = 'Q' | 'W' | 'E' | 'R'

const SLOTS: Slot[] = ['Q', 'W', 'E', 'R']
const SLOT_COLORS: Record<Slot, string> = {
  Q: '#3A8AC9',
  W: '#5DCAA5',
  E: '#EF9F27',
  R: '#E24B4A',
}

// Niveaux où R peut être pris
const R_LEVELS = new Set([6, 11, 16])

interface Props {
  value: SkillOrder
  onChange: (v: SkillOrder) => void
}

export default function SkillOrderEditor({ value, onChange }: Props) {
  const TOTAL_LEVELS = 18
  const sk = useDashboard().builds.skills

  // Compteurs de points par sort (pour valider les contraintes)
  const counts = useMemo(() => {
    const c: Record<Slot, number> = { Q: 0, W: 0, E: 0, R: 0 }
    value.levels.forEach(s => { if (s) c[s]++ })
    return c
  }, [value.levels])

  const maxPoints: Record<Slot, number> = { Q: 5, W: 5, E: 5, R: 3 }

  // Définir le sort pour un niveau (1-indexé) — valide selon les règles
  function setLevel(level1Based: number, slot: Slot) {
    const idx = level1Based - 1
    // R uniquement aux niveaux 6/11/16
    if (slot === 'R' && !R_LEVELS.has(level1Based)) return
    // Si on tente R alors qu'on n'est pas à un niveau autorisé
    if (slot !== 'R' && R_LEVELS.has(level1Based) === false) {
      // OK
    }

    // Vérifier que ce sort n'a pas déjà atteint son max
    // (sauf si on remplace par lui-même, ou si c'était déjà ce sort là)
    const previous = value.levels[idx]
    if (previous === slot) {
      // Toggle off : on retire la valeur
      const next = [...value.levels]
      next[idx] = '' as unknown as Slot
      onChange({ ...value, levels: next })
      return
    }

    // Compter sans la valeur précédente, ajouter la nouvelle
    const newCount = counts[slot] + (previous === slot ? 0 : 1) - (previous === slot ? 1 : 0)
    if (newCount > maxPoints[slot]) return

    const next = [...value.levels]
    // Pad jusqu'à l'index si besoin
    while (next.length <= idx) next.push('' as unknown as Slot)
    next[idx] = slot
    onChange({ ...value, levels: next })
  }

  // Toggle la priorité (ordre de max)
  function togglePriority(slot: Slot) {
    if (slot === 'R') return // R n'est pas dans la priorité de max
    const current = value.priority
    if (current.includes(slot)) {
      // Retirer
      onChange({ ...value, priority: current.filter(s => s !== slot) })
    } else {
      // Ajouter en fin (max 3 sorts dans la priorité)
      if (current.length >= 3) return
      onChange({ ...value, priority: [...current, slot] })
    }
  }

  function clearAll() {
    onChange({ levels: [], priority: [] })
  }

  return (
    <div style={{
      padding: 14, borderRadius: 8,
      background: 'rgba(255,255,255,0.02)',
      border: '1px solid rgba(255,255,255,0.06)',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase' }}>
          {sk.title}
        </div>
        <button onClick={clearAll} style={{
          padding: '4px 10px', fontSize: 11, cursor: 'pointer',
          background: 'rgba(226,75,74,0.08)', border: '1px solid rgba(226,75,74,0.25)',
          color: '#E24B4A', borderRadius: 4,
        }}>
          {sk.clearAll}
        </button>
      </div>

      {/* Grille 18 niveaux × 4 slots */}
      <div style={{ overflowX: 'auto' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: `36px repeat(${TOTAL_LEVELS}, minmax(28px, 1fr))`,
          gap: 3,
          fontSize: 11,
          minWidth: 600,
        }}>
          {/* Header colonnes : numéros de niveaux */}
          <div></div>
          {Array.from({ length: TOTAL_LEVELS }, (_, i) => i + 1).map(level => (
            <div key={level} style={{
              textAlign: 'center', color: 'var(--text-dim)',
              fontWeight: R_LEVELS.has(level) ? 700 : 400,
              padding: '2px 0',
            }}>
              {level}
            </div>
          ))}

          {/* Lignes Q W E R */}
          {SLOTS.map(slot => (
            <Row key={slot} slot={slot} levels={value.levels}
              counts={counts} maxPoints={maxPoints} onSet={setLevel} sk={sk} />
          ))}
        </div>
      </div>

      {/* Compteurs */}
      <div style={{
        display: 'flex', gap: 12, marginTop: 12, justifyContent: 'flex-end',
        fontSize: 11, color: 'var(--text-dim)',
      }}>
        {SLOTS.map(s => (
          <span key={s} style={{
            color: counts[s] > 0 ? SLOT_COLORS[s] : 'var(--text-dim)',
            fontWeight: 600,
          }}>
            {s}: {counts[s]}/{maxPoints[s]}
          </span>
        ))}
      </div>

      {/* Priorité de max */}
      <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ fontSize: 11, color: 'var(--text-dim)', letterSpacing: 1, marginBottom: 8, textTransform: 'uppercase' }}>
          {sk.priorityLabel}
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          {(['Q', 'W', 'E'] as Slot[]).map(s => {
            const idx = value.priority.indexOf(s)
            const active = idx !== -1
            return (
              <button key={s} onClick={() => togglePriority(s)} style={{
                position: 'relative',
                width: 38, height: 38, borderRadius: 6, cursor: 'pointer',
                background: active ? SLOT_COLORS[s] : 'rgba(255,255,255,0.04)',
                border: `1px solid ${active ? SLOT_COLORS[s] : 'rgba(255,255,255,0.1)'}`,
                color: active ? '#0a0612' : 'var(--text-muted)',
                fontSize: 16, fontWeight: 800, fontFamily: 'inherit',
              }}>
                {s}
                {active && (
                  <span style={{
                    position: 'absolute', top: -6, right: -6,
                    background: '#EF9F27', color: '#0a0612',
                    width: 18, height: 18, borderRadius: '50%',
                    fontSize: 10, fontWeight: 700,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>{idx + 1}</span>
                )}
              </button>
            )
          })}
          {value.priority.length > 0 && (
            <div style={{
              marginLeft: 12, padding: '6px 12px', borderRadius: 5,
              background: 'rgba(127,119,221,0.10)',
              fontSize: 13, fontWeight: 600, color: '#F5F2FA',
            }}>
              {value.priority.join(' > ')}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Ligne d'un sort dans la grille ──
function Row({ slot, levels, counts, maxPoints, onSet, sk }: {
  slot: Slot
  levels: Slot[]
  counts: Record<Slot, number>
  maxPoints: Record<Slot, number>
  onSet: (level: number, slot: Slot) => void
  sk: BuildsDict['skills']
}) {
  const TOTAL_LEVELS = 18
  const isFull = counts[slot] >= maxPoints[slot]

  return (
    <>
      {/* Label du sort */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontWeight: 700, color: SLOT_COLORS[slot], fontSize: 13,
      }}>
        {slot}
      </div>

      {/* 18 cellules cliquables */}
      {Array.from({ length: TOTAL_LEVELS }, (_, i) => i + 1).map(level => {
        const isPicked  = levels[level - 1] === slot
        const isRLevel  = R_LEVELS.has(level)
        // R uniquement aux niveaux 6/11/16. Pour Q/W/E : on peut pas prendre R level
        const disabled  = (slot === 'R' && !isRLevel) || (slot !== 'R' && isRLevel && levels[level - 1] === 'R')
        const cantPick  = !isPicked && isFull
        return (
          <button
            key={level}
            onClick={() => onSet(level, slot)}
            disabled={disabled}
            style={{
              height: 26, borderRadius: 3,
              cursor: disabled ? 'not-allowed' : (cantPick ? 'not-allowed' : 'pointer'),
              background: isPicked ? SLOT_COLORS[slot] : (disabled ? 'rgba(255,255,255,0.01)' : 'rgba(255,255,255,0.03)'),
              border: isPicked ? 'none' : '1px solid rgba(255,255,255,0.05)',
              color: isPicked ? '#0a0612' : 'transparent',
              fontWeight: 700, fontSize: 10,
              opacity: disabled ? 0.3 : (cantPick ? 0.4 : 1),
              padding: 0,
            }}
            title={disabled ? (slot === 'R' ? sk.ultOnlyLevels : sk.levelReservedForUlt) : ''}
          >
            {isPicked && counts[slot]}
          </button>
        )
      })}
    </>
  )
}
