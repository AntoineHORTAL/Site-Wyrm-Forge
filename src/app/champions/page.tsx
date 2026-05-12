'use client'

/**
 * Explorateur de tous les champions League : /champions
 *
 * Données : DDragon (champion.json) — pas de win/pick/ban rate pour la v1
 *           car Riot API ne les expose pas directement (à implémenter plus
 *           tard via aggregation ou source tierce).
 *
 * Filtres :
 *   - Recherche par nom (case-insensitive, accent-insensitive)
 *   - Tags (Fighter, Tank, Mage, Assassin, Marksman, Support)
 *   - Difficulté (Facile / Moyenne / Difficile)
 *   - Tri (alphabétique / difficulté croissante ou décroissante)
 */
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

const DDN = 'https://ddragon.leagueoflegends.com'

interface ChampSummary {
  id: string; name: string; title: string; image: string
  tags: string[]; difficulty: number
}

const ALL_TAGS = ['Fighter', 'Tank', 'Mage', 'Assassin', 'Marksman', 'Support'] as const
type Tag = typeof ALL_TAGS[number]

const TAG_LABELS: Record<Tag, string> = {
  Fighter:  'Combattant',
  Tank:     'Tank',
  Mage:     'Mage',
  Assassin: 'Assassin',
  Marksman: 'Tireur',
  Support:  'Support',
}

const TAG_COLORS: Record<Tag, string> = {
  Fighter:  '#E24B4A',
  Tank:     '#5DCAA5',
  Mage:     '#7F77DD',
  Assassin: '#A855F7',
  Marksman: '#EF9F27',
  Support:  '#3A8AC9',
}

type DifficultyRange = 'all' | 'easy' | 'medium' | 'hard'
type SortBy = 'alpha' | 'diff-asc' | 'diff-desc'

// Normalise (accent-insensitive) pour la recherche
function normalize(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

export default function ChampionsPage() {
  const router = useRouter()
  const [version, setVersion] = useState('')
  const [list,    setList]    = useState<ChampSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')

  // Filtres UI
  const [query,      setQuery]      = useState('')
  const [activeTags, setActiveTags] = useState<Set<Tag>>(new Set())
  const [diff,       setDiff]       = useState<DifficultyRange>('all')
  const [sortBy,     setSortBy]     = useState<SortBy>('alpha')

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true); setError('')
      try {
        const vRes = await fetch(`${DDN}/api/versions.json`)
        const vList: string[] = await vRes.json()
        if (cancelled) return
        const v = vList[0]
        setVersion(v)

        const cRes = await fetch(`${DDN}/cdn/${v}/data/fr_FR/champion.json`)
        const cData = await cRes.json()
        if (cancelled) return

        const arr: ChampSummary[] = Object.values(cData.data).map((ch: unknown) => {
          const c = ch as {
            id: string; name: string; title: string; image: { full: string }
            tags: string[]; info: { difficulty: number }
          }
          return {
            id: c.id, name: c.name, title: c.title, image: c.image.full,
            tags: c.tags, difficulty: c.info.difficulty,
          }
        })
        setList(arr)
      } catch {
        if (!cancelled) setError('Impossible de charger la liste des champions.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  // ── Filtrage et tri ──
  const filtered = useMemo(() => {
    let arr = list

    // Recherche par nom (accent-insensitive)
    if (query.trim()) {
      const q = normalize(query.trim())
      arr = arr.filter(c => normalize(c.name).includes(q))
    }

    // Tags (au moins un tag actif sélectionné)
    if (activeTags.size > 0) {
      arr = arr.filter(c => c.tags.some(t => activeTags.has(t as Tag)))
    }

    // Difficulté
    if (diff === 'easy')   arr = arr.filter(c => c.difficulty <= 3)
    if (diff === 'medium') arr = arr.filter(c => c.difficulty >= 4 && c.difficulty <= 7)
    if (diff === 'hard')   arr = arr.filter(c => c.difficulty >= 8)

    // Tri
    if (sortBy === 'alpha') {
      arr = [...arr].sort((a, b) => a.name.localeCompare(b.name, 'fr'))
    } else if (sortBy === 'diff-asc') {
      arr = [...arr].sort((a, b) => a.difficulty - b.difficulty || a.name.localeCompare(b.name, 'fr'))
    } else {
      arr = [...arr].sort((a, b) => b.difficulty - a.difficulty || a.name.localeCompare(b.name, 'fr'))
    }

    return arr
  }, [list, query, activeTags, diff, sortBy])

  const toggleTag = (tag: Tag) => {
    setActiveTags(prev => {
      const next = new Set(prev)
      if (next.has(tag)) next.delete(tag)
      else next.add(tag)
      return next
    })
  }

  return (
    <main style={{
      minHeight: '100vh', padding: '24px clamp(12px, 4vw, 40px)',
      maxWidth: 1400, margin: '0 auto', color: '#F5F2FA',
    }}>
      <button onClick={() => router.back()} style={{
        background: 'transparent', border: 'none', cursor: 'pointer',
        color: 'var(--text-muted)', fontSize: 13, padding: '6px 0', marginBottom: 14,
      }}>← Retour</button>

      <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 4 }}>Tous les champions</h1>
      <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 16 }}>
        {loading ? 'Chargement…' : `${filtered.length} champions${filtered.length !== list.length ? ` sur ${list.length}` : ''}`}
      </div>

      {error && (
        <div style={{
          padding: 14, borderRadius: 6, marginBottom: 14,
          background: 'rgba(226,75,74,0.08)', border: '1px solid rgba(226,75,74,0.3)',
          color: '#E24B4A', fontSize: 13,
        }}>{error}</div>
      )}

      {/* ── Barre de filtres ── */}
      <section style={{
        padding: '14px 18px', borderRadius: 10, marginBottom: 16,
        background: 'rgba(255,255,255,0.02)',
        border: '1px solid rgba(255,255,255,0.06)',
      }}>
        {/* Recherche */}
        <input
          type="text" value={query} onChange={e => setQuery(e.target.value)}
          placeholder="Rechercher un champion (ex: braum, jayce, sol…)"
          style={{
            width: '100%', padding: '10px 12px', borderRadius: 6, fontSize: 14,
            background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(127,119,221,0.3)',
            color: '#F5F2FA', outline: 'none', fontFamily: 'inherit',
          }}
        />

        {/* Tags */}
        <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          <span style={{ fontSize: 10, color: 'var(--text-dim)', letterSpacing: 1, marginRight: 4 }}>CLASSE</span>
          {ALL_TAGS.map(tag => {
            const on = activeTags.has(tag)
            const col = TAG_COLORS[tag]
            return (
              <button key={tag} onClick={() => toggleTag(tag)} style={{
                padding: '4px 10px', borderRadius: 5, fontSize: 11, fontWeight: 600,
                cursor: 'pointer', transition: 'all 120ms',
                background: on ? `${col}22` : 'rgba(255,255,255,0.03)',
                border: `1px solid ${on ? col : 'rgba(255,255,255,0.08)'}`,
                color: on ? '#F5F2FA' : 'var(--text-muted)',
              }}>{TAG_LABELS[tag]}</button>
            )
          })}
          {activeTags.size > 0 && (
            <button onClick={() => setActiveTags(new Set())} style={{
              padding: '4px 10px', borderRadius: 5, fontSize: 11,
              cursor: 'pointer', background: 'transparent',
              border: '1px solid rgba(255,255,255,0.08)', color: 'var(--text-dim)',
            }}>Effacer</button>
          )}
        </div>

        {/* Difficulté + tri */}
        <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <span style={{ fontSize: 10, color: 'var(--text-dim)', letterSpacing: 1, marginRight: 4 }}>DIFFICULTÉ</span>
            {([
              { key: 'all',    label: 'Toutes' },
              { key: 'easy',   label: 'Facile (1-3)' },
              { key: 'medium', label: 'Moyenne (4-7)' },
              { key: 'hard',   label: 'Difficile (8-10)' },
            ] as { key: DifficultyRange; label: string }[]).map(d => {
              const on = diff === d.key
              return (
                <button key={d.key} onClick={() => setDiff(d.key)} style={{
                  padding: '4px 10px', borderRadius: 5, fontSize: 11, fontWeight: 600,
                  cursor: 'pointer', transition: 'all 120ms',
                  background: on ? 'rgba(239,159,39,0.18)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${on ? '#EF9F27' : 'rgba(255,255,255,0.08)'}`,
                  color: on ? '#F5F2FA' : 'var(--text-muted)',
                }}>{d.label}</button>
              )
            })}
          </div>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginLeft: 'auto' }}>
            <span style={{ fontSize: 10, color: 'var(--text-dim)', letterSpacing: 1, marginRight: 4 }}>TRIER PAR</span>
            <select value={sortBy} onChange={e => setSortBy(e.target.value as SortBy)} style={{
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

      {/* ── Grille de champions ── */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
          Chargement…
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-dim)' }}>
          Aucun champion ne correspond aux filtres.
        </div>
      ) : (
        <div style={{
          display: 'grid', gap: 10,
          gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))',
        }}>
          {filtered.map(ch => (
            <ChampionCard key={ch.id} champ={ch} version={version}
              onClick={() => router.push(`/champion/${ch.id}`)} />
          ))}
        </div>
      )}
    </main>
  )
}

function ChampionCard({ champ, version, onClick }: {
  champ: ChampSummary; version: string; onClick: () => void
}) {
  const [hover, setHover] = useState(false)
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        cursor: 'pointer', borderRadius: 8, overflow: 'hidden',
        background: 'rgba(255,255,255,0.02)',
        border: `1px solid ${hover ? '#EF9F27' : 'rgba(255,255,255,0.06)'}`,
        transition: 'all 150ms',
        transform: hover ? 'translateY(-2px)' : 'translateY(0)',
      }}
    >
      {version
        ? <img src={`https://ddragon.leagueoflegends.com/cdn/${version}/img/champion/${champ.image}`}
            alt={champ.name}
            loading="lazy"
            style={{ width: '100%', aspectRatio: '1 / 1', objectFit: 'cover', display: 'block' }} />
        : <div style={{ width: '100%', aspectRatio: '1 / 1', background: '#222' }} />}
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
                background: TAG_COLORS[t as Tag] ?? 'rgba(255,255,255,0.3)',
              }} title={TAG_LABELS[t as Tag] ?? t} />
            ))}
          </div>
          <span style={{ fontSize: 9, color: 'var(--text-dim)' }}>
            ★ {champ.difficulty}/10
          </span>
        </div>
      </div>
    </div>
  )
}
