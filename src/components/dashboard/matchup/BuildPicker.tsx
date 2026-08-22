'use client'

import { useState, useMemo, useEffect } from 'react'
import { itemImgUrl, type DDItemFull } from '@/lib/matchup/ddragon'
import type { BuildRef, MatchUpBuildItem } from '@/lib/matchup/types'
import type { AnalyseDict } from '@/locales/dashboard/analyse'

// Libellés injectés par le parent plutôt que lus d'un hook : ce composant est une
// pure vue d'overlay, il n'a pas d'autre raison de dépendre du contexte de langue.
type PickerLabels = AnalyseDict['matchup']['picker']

// ════════════════════════════════════════════════════════════════════════════
//  BuildPicker — attribution d'un build à un slot (Lot 2.3)
// ════════════════════════════════════════════════════════════════════════════
// Deux sources, comme le cadrage BuildsTab : un build SAUVEGARDÉ (item_builds)
// appliqué par référence (kind:'saved') ou un build TEMPORAIRE composé à la volée
// (kind:'temp', snapshot d'items autonome). « Aucun build » détache (kind:'none').
// Le temporaire est modélisé ici comme un bloc unique à plat (sous-ensemble du
// modèle multi-blocs) — suffisant et lisible pour l'usage MatchUp.

// Vue d'affichage d'un build sauvegardé (dérivée d'une ligne item_builds).
export interface SavedBuildDisplay {
  id: string
  name: string
  champName: string | null
  itemImages: string[]   // fichiers DDragon des premiers items (aperçu)
  totalGold: number
}

function uid(): string {
  return globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2, 11)
}

function norm(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

export default function BuildPicker({
  items, version, savedBuilds, initial, labels, onApply, onClose, c,
}: {
  items: DDItemFull[]
  version: string
  savedBuilds: SavedBuildDisplay[]
  initial: BuildRef
  labels: PickerLabels
  onApply: (build: BuildRef) => void
  onClose: () => void
  c: boolean
}) {
  const accent = c ? '#BA7517' : '#7F77DD'
  const border = c ? 'rgba(186,117,23,0.25)' : '#27272A'

  const [mode, setMode] = useState<'saved' | 'temp'>(initial.kind === 'temp' ? 'temp' : 'saved')
  const [search, setSearch] = useState('')
  // Items du build temporaire (bloc unique à plat). Préchargés si on édite un temp.
  const [tempItems, setTempItems] = useState<MatchUpBuildItem[]>(
    initial.kind === 'temp' ? initial.blocks.flatMap(b => b.items) : [],
  )

  // Fermeture à Échap.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const filtered = useMemo(() => {
    const q = norm(search.trim())
    const base = q ? items.filter(it => norm(it.name).includes(q)) : items
    return base.slice(0, 120)   // borne l'affichage (le catalogue complet est large)
  }, [items, search])

  const tempGold = useMemo(
    () => tempItems.reduce((s, it) => {
      const gold = items.find(x => x.id === it.id)?.gold ?? 0
      return s + gold * it.count
    }, 0),
    [tempItems, items],
  )

  function addTemp(it: DDItemFull) {
    setTempItems(prev => {
      const ex = prev.find(p => p.id === it.id)
      if (ex) return prev.map(p => p.id === it.id ? { ...p, count: p.count + 1 } : p)
      return [...prev, { id: it.id, name: it.name, image: it.image, stats: it.stats, count: 1 }]
    })
  }
  function changeTemp(id: string, delta: number) {
    setTempItems(prev => prev
      .map(p => p.id === id ? { ...p, count: p.count + delta } : p)
      .filter(p => p.count > 0))
  }

  function applyTemp() {
    if (tempItems.length === 0) { onApply({ kind: 'none' }); return }
    // ⚠️ `name` n'est JAMAIS affiché : le slot montre `matchup.buildTemp`, et
    // `buildItemNames` ne lit que `items`. C'est une étiquette interne du snapshot
    // persisté en localStorage — elle ne passe donc pas par le dico.
    onApply({ kind: 'temp', blocks: [{ id: uid(), name: 'Build', items: tempItems }] })
  }

  const tabStyle = (on: boolean) => ({
    padding: '6px 14px', borderRadius: 8, fontSize: 13, cursor: 'pointer',
    fontWeight: on ? 700 : 500,
    color: on ? '#fff' : 'var(--text-muted)',
    background: on ? accent : (c ? 'rgba(255,255,255,0.03)' : '#18181B'),
    border: `1px solid ${on ? accent : border}`,
  })

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 'min(620px, 100%)', maxHeight: '82vh', display: 'flex', flexDirection: 'column',
          background: c ? '#1A1A1A' : '#0F0F11', border: `1px solid ${c ? 'rgba(186,117,23,0.35)' : '#27272A'}`,
          borderRadius: 12, overflow: 'hidden',
        }}
      >
        {/* Header + onglets */}
        <div style={{ padding: 14, borderBottom: `1px solid ${border}`, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setMode('saved')} style={tabStyle(mode === 'saved')}>{labels.tabSaved}</button>
            <button onClick={() => setMode('temp')} style={tabStyle(mode === 'temp')}>{labels.tabTemp}</button>
          </div>
          <div style={{ flex: 1 }} />
          <button
            onClick={() => onApply({ kind: 'none' })}
            style={{ padding: '6px 12px', borderRadius: 8, fontSize: 12, cursor: 'pointer', color: 'var(--text-muted)', background: 'transparent', border: `1px solid ${border}` }}
          >
            {labels.none}
          </button>
        </div>

        {/* Corps */}
        {mode === 'saved' ? (
          <div style={{ padding: 12, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {savedBuilds.length === 0 && (
              <p style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: 24 }}>
                {labels.emptySaved}
              </p>
            )}
            {savedBuilds.map(b => {
              const selected = initial.kind === 'saved' && initial.buildId === b.id
              return (
                <button
                  key={b.id}
                  onClick={() => onApply({ kind: 'saved', buildId: b.id })}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: 10, borderRadius: 8, cursor: 'pointer',
                    textAlign: 'left', background: selected ? (c ? 'rgba(186,117,23,0.12)' : '#1D1D20') : 'transparent',
                    border: `1px solid ${selected ? accent : border}`,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {b.name}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {/* ⚠️ `toLocaleString('fr-FR')` : locale de DONNÉE (Lot 8). */}
                      {b.champName ?? labels.freeChampion} · {b.totalGold.toLocaleString('fr-FR')} g
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
                    {b.itemImages.slice(0, 6).map((img, i) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={i} src={itemImgUrl(version, img)} alt="" width={24} height={24} style={{ borderRadius: 4 }} />
                    ))}
                  </div>
                </button>
              )
            })}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>
            {/* Items sélectionnés */}
            {tempItems.length > 0 && (
              <div style={{ padding: '10px 12px', borderBottom: `1px solid ${border}`, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {tempItems.map(it => (
                  <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 6px', borderRadius: 6, border: `1px solid ${border}` }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={itemImgUrl(version, it.image)} alt={it.name} width={22} height={22} style={{ borderRadius: 4 }} />
                    <button onClick={() => changeTemp(it.id, -1)} style={{ width: 16, height: 16, borderRadius: 4, cursor: 'pointer', color: 'var(--text-muted)', background: 'transparent', border: `1px solid ${border}`, lineHeight: 1 }}>−</button>
                    <span style={{ fontSize: 12, color: 'var(--text)', minWidth: 12, textAlign: 'center' }}>{it.count}</span>
                    <button onClick={() => changeTemp(it.id, 1)} style={{ width: 16, height: 16, borderRadius: 4, cursor: 'pointer', color: 'var(--text-muted)', background: 'transparent', border: `1px solid ${border}`, lineHeight: 1 }}>+</button>
                  </div>
                ))}
              </div>
            )}

            {/* Recherche */}
            <div style={{ padding: 12, paddingBottom: 8 }}>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={labels.searchItem}
                style={{
                  width: '100%', padding: '9px 12px', borderRadius: 8, fontSize: 14,
                  color: 'var(--text)', background: c ? 'rgba(255,255,255,0.04)' : '#18181B',
                  border: `1px solid ${border}`, outline: 'none',
                }}
              />
            </div>

            {/* Grille d'items */}
            <div style={{ padding: '0 12px 12px', overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(48px, 1fr))', gap: 6 }}>
              {filtered.map(it => (
                <button
                  key={it.id}
                  onClick={() => addTemp(it)}
                  title={labels.itemTitle.replace('{name}', it.name).replace('{gold}', String(it.gold))}
                  style={{ padding: 3, borderRadius: 6, cursor: 'pointer', background: 'transparent', border: '1px solid transparent' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = accent }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'transparent' }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={itemImgUrl(version, it.image)} alt={it.name} loading="lazy" width={40} height={40} style={{ borderRadius: 4, display: 'block', width: '100%', height: 'auto' }} />
                </button>
              ))}
            </div>

            {/* Pied : total + appliquer */}
            <div style={{ padding: 12, borderTop: `1px solid ${border}`, display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {(tempItems.length === 1 ? labels.countOne : labels.countOther)
                  .replace('{count}', String(tempItems.length))} · {tempGold.toLocaleString('fr-FR')} g
              </span>
              <div style={{ flex: 1 }} />
              <button
                onClick={applyTemp}
                style={{ padding: '8px 18px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', color: '#fff', background: accent, border: `1px solid ${accent}` }}
              >
                {labels.apply}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
