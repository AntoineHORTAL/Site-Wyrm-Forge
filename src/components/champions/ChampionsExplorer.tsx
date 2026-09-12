'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ALL_TAGS, DIFFICULTY_BOUNDS, championIconUrl, filterChampions, NO_FILTERS,
  type ChampionSummary, type ChampionTag, type DifficultyRange, type SortBy,
} from '@/lib/champions-catalog'

/**
 * Filtres et grille de /champions — la partie INTERACTIVE, par-dessus une liste
 * déjà rendue par le serveur.
 *
 * 🔴 L'INVARIANT DE CETTE PAGE : au premier rendu, l'état est `NO_FILTERS`, donc
 * `filterChampions` rend la liste COMPLÈTE, dans l'ordre alphabétique. Le HTML
 * produit par le serveur contient donc les ~170 champions, leurs noms, leurs
 * classes et leurs liens — un visiteur sans JavaScript, et le robot d'examen
 * AdSense qui récupère le HTML brut, voient la page pleine. C'est exactement ce
 * qui manquait quand la liste se chargeait dans un `useEffect`.
 *
 * ⚠️ Ne pas introduire d'état initial qui masquerait des champions (une
 * pagination « 24 premiers », un filtre par défaut) sans mesurer ce que devient
 * le HTML servi : ce serait revenir à la coquille vide par un autre chemin.
 *
 * ⚠️ Les cartes sont des `<Link>`, pas des `<div onClick>` : un lien est
 * suivable sans JavaScript et explorable par un robot. La page d'origine
 * poussait la route avec `router.push` depuis un `div` — les 170 pages de
 * champions étaient donc invisibles pour un crawler.
 */

const TAG_LABELS: Record<ChampionTag, string> = {
  Fighter:  'Combattant',
  Tank:     'Tank',
  Mage:     'Mage',
  Assassin: 'Assassin',
  Marksman: 'Tireur',
  Support:  'Support',
}

const TAG_COLORS: Record<ChampionTag, string> = {
  Fighter:  '#E24B4A',
  Tank:     '#5DCAA5',
  Mage:     '#7F77DD',
  Assassin: '#A855F7',
  Marksman: '#EF9F27',
  Support:  '#3A8AC9',
}

const DIFFICULTY_FILTERS: { key: DifficultyRange; label: string }[] = [
  { key: 'all',    label: 'Toutes' },
  { key: 'easy',   label: `Facile (${DIFFICULTY_BOUNDS.easy.join('-')})` },
  { key: 'medium', label: `Moyenne (${DIFFICULTY_BOUNDS.medium.join('-')})` },
  { key: 'hard',   label: `Difficile (${DIFFICULTY_BOUNDS.hard.join('-')})` },
]

export default function ChampionsExplorer({
  champions, version, footer,
}: {
  champions: ChampionSummary[]
  version: string
  /** Rendu sous la grille — l'emplacement publicitaire, passé par le serveur. */
  footer?: React.ReactNode
}) {
  const [query,      setQuery]      = useState(NO_FILTERS.query)
  const [activeTags, setActiveTags] = useState<Set<string>>(new Set())
  const [difficulty, setDifficulty] = useState<DifficultyRange>(NO_FILTERS.difficulty)
  const [sortBy,     setSortBy]     = useState<SortBy>(NO_FILTERS.sortBy)

  const filtered = useMemo(
    () => filterChampions(champions, { query, tags: activeTags, difficulty, sortBy }),
    [champions, query, activeTags, difficulty, sortBy],
  )

  const toggleTag = (tag: ChampionTag) => {
    setActiveTags(prev => {
      const next = new Set(prev)
      if (next.has(tag)) next.delete(tag); else next.add(tag)
      return next
    })
  }

  return (
    <>
      <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 16 }}>
        {filtered.length} champions
        {filtered.length !== champions.length ? ` sur ${champions.length}` : ''}
      </div>

      {/* ── Barre de filtres ── */}
      <section style={{
        padding: '14px 18px', borderRadius: 10, marginBottom: 16,
        background: 'rgba(255,255,255,0.02)',
        border: '1px solid rgba(255,255,255,0.06)',
      }}>
        <label htmlFor="champ-search" className="sr-only">Rechercher un champion</label>
        <input
          id="champ-search"
          type="search" value={query} onChange={e => setQuery(e.target.value)}
          placeholder="Rechercher un champion (ex: braum, jayce, sol…)"
          style={{
            width: '100%', padding: '10px 12px', borderRadius: 6, fontSize: 14,
            background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(127,119,221,0.3)',
            color: '#F5F2FA', outline: 'none', fontFamily: 'inherit',
          }}
        />

        <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          <span style={{ fontSize: 10, color: 'var(--text-dim)', letterSpacing: 1, marginRight: 4 }}>CLASSE</span>
          {ALL_TAGS.map(tag => {
            const on = activeTags.has(tag)
            const col = TAG_COLORS[tag]
            return (
              <button key={tag} type="button" onClick={() => toggleTag(tag)} aria-pressed={on} style={{
                padding: '4px 10px', borderRadius: 5, fontSize: 11, fontWeight: 600,
                cursor: 'pointer', transition: 'all 120ms', fontFamily: 'inherit',
                background: on ? `${col}22` : 'rgba(255,255,255,0.03)',
                border: `1px solid ${on ? col : 'rgba(255,255,255,0.08)'}`,
                color: on ? '#F5F2FA' : 'var(--text-muted)',
              }}>{TAG_LABELS[tag]}</button>
            )
          })}
          {activeTags.size > 0 && (
            <button type="button" onClick={() => setActiveTags(new Set())} style={{
              padding: '4px 10px', borderRadius: 5, fontSize: 11, fontFamily: 'inherit',
              cursor: 'pointer', background: 'transparent',
              border: '1px solid rgba(255,255,255,0.08)', color: 'var(--text-dim)',
            }}>Effacer</button>
          )}
        </div>

        <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 10, color: 'var(--text-dim)', letterSpacing: 1, marginRight: 4 }}>DIFFICULTÉ</span>
            {DIFFICULTY_FILTERS.map(d => {
              const on = difficulty === d.key
              return (
                <button key={d.key} type="button" onClick={() => setDifficulty(d.key)} aria-pressed={on} style={{
                  padding: '4px 10px', borderRadius: 5, fontSize: 11, fontWeight: 600,
                  cursor: 'pointer', transition: 'all 120ms', fontFamily: 'inherit',
                  background: on ? 'rgba(239,159,39,0.18)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${on ? '#EF9F27' : 'rgba(255,255,255,0.08)'}`,
                  color: on ? '#F5F2FA' : 'var(--text-muted)',
                }}>{d.label}</button>
              )
            })}
          </div>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginLeft: 'auto' }}>
            <label htmlFor="champ-sort" style={{ fontSize: 10, color: 'var(--text-dim)', letterSpacing: 1, marginRight: 4 }}>
              TRIER PAR
            </label>
            <select id="champ-sort" value={sortBy} onChange={e => setSortBy(e.target.value as SortBy)} style={{
              padding: '4px 8px', borderRadius: 5, fontSize: 11,
              background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.08)',
              color: '#F5F2FA', cursor: 'pointer', fontFamily: 'inherit',
            }}>
              <option value="alpha">Nom (A-Z)</option>
              <option value="diff-asc">Difficulté croissante</option>
              <option value="diff-desc">Difficulté décroissante</option>
            </select>
          </div>
        </div>
      </section>

      {/* ── Grille ── */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-dim)' }}>
          Aucun champion ne correspond aux filtres.
        </div>
      ) : (
        <div style={{
          display: 'grid', gap: 10,
          gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))',
        }}>
          {filtered.map(ch => (
            <ChampionCard key={ch.id} champ={ch} version={version} />
          ))}
        </div>
      )}

      {footer}
    </>
  )
}

function ChampionCard({ champ, version }: { champ: ChampionSummary; version: string }) {
  return (
    <Link
      href={`/champion/${champ.id}`}
      className="champ-card"
      style={{
        display: 'block', borderRadius: 8, overflow: 'hidden', textDecoration: 'none',
        background: 'rgba(255,255,255,0.02)',
        border: '1px solid rgba(255,255,255,0.06)',
        transition: 'border-color 150ms, transform 150ms',
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- CDN DDragon, hors
          `images.remotePatterns` : `next/image` refuserait l'hôte et la page ne
          sert de toute façon que des vignettes 110 px déjà optimisées. */}
      <img
        src={championIconUrl(version, champ.image)}
        alt={`${champ.name}, ${champ.title}`}
        loading="lazy"
        width={110} height={110}
        style={{ width: '100%', aspectRatio: '1 / 1', objectFit: 'cover', display: 'block' }}
      />
      <div style={{ padding: '6px 8px' }}>
        <div style={{
          fontSize: 12, fontWeight: 600, color: '#F5F2FA',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>{champ.name}</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 }}>
          <div style={{ display: 'flex', gap: 3 }}>
            {champ.tags.slice(0, 2).map(t => (
              <span key={t} style={{
                width: 6, height: 6, borderRadius: '50%',
                background: TAG_COLORS[t as ChampionTag] ?? 'rgba(255,255,255,0.3)',
              }} title={TAG_LABELS[t as ChampionTag] ?? t} />
            ))}
          </div>
          <span style={{ fontSize: 9, color: 'var(--text-dim)' }}>
            ★ {champ.difficulty}/10
          </span>
        </div>
      </div>
    </Link>
  )
}
