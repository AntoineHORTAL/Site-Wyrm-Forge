'use client'

/**
 * Éditeur de runes complet (style op.gg / u.gg).
 *
 * Composition d'une page de runes LoL :
 *   - Arbre PRIMAIRE (1 parmi 5) :
 *       - 1 keystone (1 parmi 3-4)
 *       - 3 runes mineures (1 par slot)
 *   - Arbre SECONDAIRE (différent du primaire) :
 *       - 2 runes mineures (parmi les 9, mais une seule par slot)
 *   - 3 stat shards :
 *       - 1 row Offense + 1 row Flex + 1 row Defense
 *
 * Source des données : DDragon runesReforged.json (chargé à l'init).
 * Les stat shards sont hardcodés (Riot ne les expose pas en API).
 */
import { useEffect, useState } from 'react'

const DDN = 'https://ddragon.leagueoflegends.com'

// ── Types ────────────────────────────────────────────────────────────────────
export interface RunesPage {
  primary: {
    tree: number          // ID arbre primaire (8000-8400)
    keystone: number      // ID rune keystone
    perks: number[]       // 3 IDs de runes mineures (1 par slot)
  } | null
  secondary: {
    tree: number          // ID arbre secondaire (différent du primaire)
    perks: number[]       // 2 IDs de runes mineures
  } | null
  shards: [number, number, number] | null  // 3 shards (Offense / Flex / Defense)
}

interface RuneTree {
  id: number; key: string; icon: string; name: string
  slots: { runes: { id: number; key: string; icon: string; name: string }[] }[]
}

interface Props {
  value: RunesPage
  onChange: (v: RunesPage) => void
}

// ── Stat shards (hardcodés — pas dans DDragon) ───────────────────────────────
const SHARDS = {
  // 3 lignes : Offense (0), Flex (1), Defense (2)
  rows: [
    [
      { id: 5008, name: 'Force adaptative', desc: '+9 Force adaptative' },
      { id: 5005, name: 'Vitesse d\'attaque', desc: '+10 % vitesse d\'attaque' },
      { id: 5007, name: 'Hâte de comp.', desc: '+8 hâte de compétence' },
    ],
    [
      { id: 5008, name: 'Force adaptative', desc: '+9 Force adaptative' },
      { id: 5002, name: 'Armure', desc: '+6 armure' },
      { id: 5003, name: 'Résistance magique', desc: '+8 résistance magique' },
    ],
    [
      { id: 5001, name: 'PV (scaling)', desc: '+10-180 PV (selon niveau)' },
      { id: 5002, name: 'Armure', desc: '+6 armure' },
      { id: 5003, name: 'Résistance magique', desc: '+8 résistance magique' },
    ],
  ],
}

// URLs des icônes de shards (asset Community Dragon)
function shardIconUrl(id: number): string {
  const map: Record<number, string> = {
    5008: 'https://raw.communitydragon.org/latest/game/assets/perks/statmods/statmodsadaptiveforceicon.png',
    5005: 'https://raw.communitydragon.org/latest/game/assets/perks/statmods/statmodsattackspeedicon.png',
    5007: 'https://raw.communitydragon.org/latest/game/assets/perks/statmods/statmodscdrscalingicon.png',
    5002: 'https://raw.communitydragon.org/latest/game/assets/perks/statmods/statmodsarmoricon.png',
    5003: 'https://raw.communitydragon.org/latest/game/assets/perks/statmods/statmodsmagicresicon.png',
    5001: 'https://raw.communitydragon.org/latest/game/assets/perks/statmods/statmodshealthscalingicon.png',
  }
  return map[id] || ''
}

// ── Composant ────────────────────────────────────────────────────────────────
export default function RunesEditor({ value, onChange }: Props) {
  const [trees, setTrees] = useState<RuneTree[]>([])
  const [version, setVersion] = useState('')

  // Charge runesReforged.json depuis DDragon
  useEffect(() => {
    let cancelled = false
    async function load() {
      const vRes = await fetch(`${DDN}/api/versions.json`)
      const vList: string[] = await vRes.json()
      if (cancelled) return
      const v = vList[0]
      setVersion(v)
      const rRes = await fetch(`${DDN}/cdn/${v}/data/fr_FR/runesReforged.json`)
      const rData: RuneTree[] = await rRes.json()
      if (!cancelled) setTrees(rData)
    }
    load()
    return () => { cancelled = true }
  }, [])

  void version
  const treeById = (id: number) => trees.find(t => t.id === id)

  // ── Handlers ──
  function selectPrimaryTree(treeId: number) {
    // Reset complet du primaire quand on change d'arbre
    onChange({
      ...value,
      primary: { tree: treeId, keystone: 0, perks: [] },
      // Si secondaire = même arbre, on le reset aussi
      secondary: value.secondary?.tree === treeId ? null : value.secondary,
    })
  }

  function selectKeystone(id: number) {
    if (!value.primary) return
    onChange({ ...value, primary: { ...value.primary, keystone: id } })
  }

  function selectPrimaryPerk(slotIdx: number, runeId: number) {
    if (!value.primary) return
    const next = [...value.primary.perks]
    // S'assurer que le tableau a la bonne taille (un perk par slot 1, 2, 3)
    while (next.length < 3) next.push(0)
    next[slotIdx] = runeId
    onChange({ ...value, primary: { ...value.primary, perks: next } })
  }

  function selectSecondaryTree(treeId: number) {
    if (treeId === value.primary?.tree) return // pas le même arbre
    onChange({
      ...value,
      secondary: { tree: treeId, perks: [] },
    })
  }

  function toggleSecondaryPerk(runeId: number, slotIdx: number) {
    if (!value.secondary) return
    const current = value.secondary.perks
    // Trouver si une rune du même slot est déjà sélectionnée → on la remplace
    const tree = treeById(value.secondary.tree)
    if (!tree) return
    const slot = tree.slots[slotIdx + 1] // slot 0 du secondaire = slot 1 de l'arbre (le slot 0 c'est le keystone, qu'on prend pas en secondaire)
    if (!slot) return
    const idsInSlot = slot.runes.map(r => r.id)

    if (current.includes(runeId)) {
      // Désélection
      onChange({ ...value, secondary: { ...value.secondary, perks: current.filter(id => id !== runeId) } })
      return
    }
    // Si on a déjà 2 perks et qu'aucun n'est dans ce slot → on remplace le premier du même slot,
    // sinon on ajoute. Au max 2 perks au total.
    const sameSlotPerk = current.find(id => idsInSlot.includes(id))
    let next: number[]
    if (sameSlotPerk) {
      // Remplace la rune du même slot
      next = current.map(id => id === sameSlotPerk ? runeId : id)
    } else if (current.length < 2) {
      next = [...current, runeId]
    } else {
      return // déjà 2 perks et aucun dans ce slot → ignore
    }
    onChange({ ...value, secondary: { ...value.secondary, perks: next } })
  }

  function selectShard(row: 0 | 1 | 2, shardId: number) {
    const shards: [number, number, number] = value.shards ? [...value.shards] : [0, 0, 0]
    shards[row] = shardId
    onChange({ ...value, shards })
  }

  function clearAll() {
    onChange({ primary: null, secondary: null, shards: null })
  }

  if (trees.length === 0) {
    return (
      <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)' }}>
        Chargement des runes…
      </div>
    )
  }

  const primaryTree   = value.primary?.tree   ? treeById(value.primary.tree) : null
  const secondaryTree = value.secondary?.tree ? treeById(value.secondary.tree) : null

  return (
    <div style={{
      padding: 14, borderRadius: 8,
      background: 'rgba(255,255,255,0.02)',
      border: '1px solid rgba(255,255,255,0.06)',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase' }}>
          Runes
        </div>
        <button onClick={clearAll} style={{
          padding: '4px 10px', fontSize: 11, cursor: 'pointer',
          background: 'rgba(226,75,74,0.08)', border: '1px solid rgba(226,75,74,0.25)',
          color: '#E24B4A', borderRadius: 4,
        }}>
          Tout effacer
        </button>
      </div>

      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14,
      }}>
        {/* ── Arbre PRIMAIRE ── */}
        <div style={{
          padding: 12, borderRadius: 8,
          background: 'rgba(0,0,0,0.25)',
        }}>
          <SectionTitle>Arbre primaire</SectionTitle>
          {/* Sélection de l'arbre */}
          <TreePicker trees={trees}
            selectedId={value.primary?.tree}
            onSelect={selectPrimaryTree} />

          {primaryTree && (
            <>
              {/* Keystone (slot 0) */}
              <SlotSection label="Keystone">
                <RuneRow runes={primaryTree.slots[0].runes}
                  selectedId={value.primary?.keystone}
                  onSelect={selectKeystone}
                  size={48} />
              </SlotSection>

              {/* 3 slots de runes mineures (slots 1, 2, 3) */}
              {[1, 2, 3].map(slotIdx => (
                <SlotSection key={slotIdx} label={`Slot ${slotIdx}`}>
                  <RuneRow runes={primaryTree.slots[slotIdx].runes}
                    selectedId={value.primary?.perks[slotIdx - 1]}
                    onSelect={id => selectPrimaryPerk(slotIdx - 1, id)}
                    size={36} />
                </SlotSection>
              ))}
            </>
          )}
        </div>

        {/* ── Arbre SECONDAIRE ── */}
        <div style={{
          padding: 12, borderRadius: 8,
          background: 'rgba(0,0,0,0.25)',
        }}>
          <SectionTitle>Arbre secondaire</SectionTitle>
          {/* Sélection de l'arbre (exclure le primaire) */}
          <TreePicker trees={trees.filter(t => t.id !== value.primary?.tree)}
            selectedId={value.secondary?.tree}
            onSelect={selectSecondaryTree} />

          {secondaryTree && (
            <>
              {/* 3 slots — on choisit 2 runes en tout, max 1 par slot */}
              {[1, 2, 3].map(slotIdx => (
                <SlotSection key={slotIdx} label={`Slot ${slotIdx}`}>
                  <RuneRow runes={secondaryTree.slots[slotIdx].runes}
                    selectedId={value.secondary?.perks.find(id => secondaryTree.slots[slotIdx].runes.some(r => r.id === id))}
                    onSelect={id => toggleSecondaryPerk(id, slotIdx - 1)}
                    size={36}
                    disabled={!value.secondary?.perks.find(id => secondaryTree.slots[slotIdx].runes.some(r => r.id === id))
                      && (value.secondary?.perks.length ?? 0) >= 2} />
                </SlotSection>
              ))}

              <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 6 }}>
                Choisis 2 runes parmi les 3 slots (max 1 par slot). Actuellement : {value.secondary?.perks.length ?? 0}/2.
              </div>
            </>
          )}

          {/* ── Stat shards ── */}
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <SectionTitle>Stat shards</SectionTitle>
            {(['Offense', 'Flex', 'Defense'] as const).map((rowLabel, rowIdx) => (
              <SlotSection key={rowLabel} label={rowLabel}>
                <div style={{ display: 'flex', gap: 6 }}>
                  {SHARDS.rows[rowIdx].map(shard => {
                    const selected = value.shards?.[rowIdx] === shard.id
                    return (
                      <button key={`${shard.id}-${rowIdx}`}
                        onClick={() => selectShard(rowIdx as 0|1|2, shard.id)}
                        title={shard.desc}
                        style={{
                          width: 30, height: 30, borderRadius: '50%',
                          background: selected ? 'rgba(239,159,39,0.18)' : 'rgba(255,255,255,0.04)',
                          border: `2px solid ${selected ? '#EF9F27' : 'rgba(255,255,255,0.1)'}`,
                          cursor: 'pointer', padding: 0,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                        <img src={shardIconUrl(shard.id)} alt={shard.name}
                          style={{ width: 22, height: 22 }}
                          onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
                      </button>
                    )
                  })}
                </div>
              </SlotSection>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Composants internes ──
function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 10, color: 'var(--text-dim)', letterSpacing: 1,
      textTransform: 'uppercase', marginBottom: 8,
    }}>
      {children}
    </div>
  )
}

function SlotSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 9, color: 'var(--text-dim)', letterSpacing: 1, marginBottom: 4, textTransform: 'uppercase' }}>
        {label}
      </div>
      {children}
    </div>
  )
}

function TreePicker({ trees, selectedId, onSelect }: {
  trees: RuneTree[]; selectedId?: number; onSelect: (id: number) => void
}) {
  return (
    <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
      {trees.map(tree => {
        const active = selectedId === tree.id
        return (
          <button key={tree.id} onClick={() => onSelect(tree.id)}
            title={tree.name}
            style={{
              width: 38, height: 38, borderRadius: 6, cursor: 'pointer',
              background: active ? 'rgba(127,119,221,0.18)' : 'rgba(255,255,255,0.03)',
              border: `2px solid ${active ? '#7F77DD' : 'rgba(255,255,255,0.06)'}`,
              padding: 4,
            }}>
            <img src={`${DDN}/cdn/img/${tree.icon}`} alt={tree.name}
              style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          </button>
        )
      })}
    </div>
  )
}

function RuneRow({ runes, selectedId, onSelect, size = 36, disabled }: {
  runes: { id: number; icon: string; name: string }[]
  selectedId?: number
  onSelect: (id: number) => void
  size?: number
  disabled?: boolean
}) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {runes.map(rune => {
        const active = selectedId === rune.id
        return (
          <button key={rune.id} onClick={() => onSelect(rune.id)}
            disabled={disabled && !active}
            title={rune.name}
            style={{
              width: size, height: size, borderRadius: '50%',
              background: active ? 'rgba(239,159,39,0.18)' : 'rgba(255,255,255,0.04)',
              border: `2px solid ${active ? '#EF9F27' : 'rgba(255,255,255,0.1)'}`,
              cursor: disabled && !active ? 'not-allowed' : 'pointer',
              padding: 3, opacity: disabled && !active ? 0.3 : 1,
            }}>
            <img src={`${DDN}/cdn/img/${rune.icon}`} alt={rune.name}
              style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          </button>
        )
      })}
    </div>
  )
}
