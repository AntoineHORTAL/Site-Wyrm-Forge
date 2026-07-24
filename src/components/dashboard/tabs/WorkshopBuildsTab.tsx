'use client'

import { useState, useEffect } from 'react'
import { useTheme } from '@/components/providers/ThemeProvider'
import { createClient } from '@/lib/supabase/client'

// ─── Types ─────────────────────────────────────────────────────────────────────
interface WBItem {
  Id?: number; Name?: string; Gold?: number; Count?: number; IconUrl?: string
}
interface WBBlock {
  Id?: string; Title?: string; Items?: WBItem[]
}
interface WorkshopBuild {
  id: string
  titre: string
  description: string
  creator_name: string
  // Propriétaire réel de la publication (auth.uid() posé à l'INSERT). Seul critère
  // d'appartenance : creator_name est du texte libre, non vérifiable. NULL sur les
  // builds publiés avant l'ajout de la colonne → jamais retirables par leur auteur
  // (la policy wb_delete_owner compare à auth.uid(), et NULL n'est jamais égal).
  creator_id: string | null
  champion: string
  role: string
  patch: string
  items: WBBlock[]
  likes: number
  saves: number
  created_at: string
}

const DDN     = 'https://ddragon.leagueoflegends.com'
const itemImg = (v: string, id: number) => `${DDN}/cdn/${v}/img/item/${id}.png`
const champImg = (v: string, name: string) => `${DDN}/cdn/${v}/img/champion/${name}.png`

const ROLES = ['Tous', 'Top', 'Jungle', 'Mid', 'ADC', 'Support']

// ─── Component ─────────────────────────────────────────────────────────────────
export default function WorkshopBuildsTab() {
  const { theme } = useTheme()
  const c = theme === 'mythic'
  const supabase = createClient()

  const [builds, setBuilds]     = useState<WorkshopBuild[]>([])
  const [loading, setLoading]   = useState(true)
  const [version, setVersion]   = useState('')
  const [search, setSearch]     = useState('')
  const [role, setRole]         = useState('Tous')
  const [userId, setUserId]     = useState<string | null>(null)
  const [importing, setImporting] = useState<string | null>(null)
  const [liking, setLiking]     = useState<string | null>(null)
  const [imported, setImported] = useState<Set<string>>(new Set())
  const [deleting, setDeleting] = useState<string | null>(null)

  const border  = c ? 'rgba(186,117,23,0.2)' : '#27272A'
  const borderH = c ? 'rgba(186,117,23,0.5)' : '#3F3F46'
  const bg      = c ? 'rgba(42,21,71,0.4)'   : '#18181B'
  const accent  = c ? '#BA7517' : '#7F77DD'
  const gold    = c ? '#FAC775' : '#EF9F27'

  // ── Chargement ────────────────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      try {
        // Version DDragon + user + builds en parallèle
        const [vRes, { data: { user } }, { data: rows, error }] = await Promise.all([
          fetch(`${DDN}/api/versions.json`),
          supabase.auth.getUser(),
          supabase.from('workshop_builds').select('*').order('created_at', { ascending: false }),
        ])

        const versions: string[] = await vRes.json()
        setVersion(versions[0])
        setUserId(user?.id ?? null)

        if (!error && rows) {
          setBuilds(rows.map((r: any) => ({
            id:           r.id,
            titre:        r.titre      ?? '',
            description:  r.description ?? '',
            creator_name: r.creator_name ?? '',
            creator_id:   r.creator_id ?? null,
            champion:     r.champion   ?? '',
            role:         r.role       ?? '',
            patch:        r.patch      ?? '',
            likes:        r.likes      ?? 0,
            saves:        r.saves      ?? 0,
            created_at:   r.created_at ?? '',
            items:        Array.isArray(r.items) ? r.items : [],
          })))
        }

        // Vérifier quels builds sont déjà importés (item_builds)
        if (user) {
          const { data: myBuilds } = await supabase
            .from('item_builds')
            .select('id')
          // On marque les imports via le champ is_from_workshop qu'on va ajouter — pour l'instant on skip
        }
      } catch (e) {
        console.error('[Workshop] load error', e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  // ── Like ──────────────────────────────────────────────────────────────────
  async function handleLike(build: WorkshopBuild) {
    if (liking) return
    setLiking(build.id)
    const { error } = await supabase.rpc('increment_likes', { build_id: build.id })
    if (!error) {
      setBuilds(prev => prev.map(b => b.id === build.id ? { ...b, likes: b.likes + 1 } : b))
    }
    setLiking(null)
  }

  // ── Importer dans item_builds ─────────────────────────────────────────────
  async function handleImport(build: WorkshopBuild) {
    if (!userId || importing) return
    setImporting(build.id)

    // Convertir les blocs WB (PascalCase) → format slim item_builds
    const slimBlocks = build.items.map(bl => ({
      id:   bl.Id ?? crypto.randomUUID(),
      name: bl.Title ?? 'Bloc',
      items: (bl.Items ?? []).map(i => ({
        itemId: String(i.Id ?? 0),
        name:   i.Name ?? '',
        image:  `${i.Id ?? 0}.png`,
        gold:   i.Gold ?? 0,
        count:  i.Count ?? 1,
      })),
    }))

    const totalGold = slimBlocks.reduce(
      (s, bl) => s + bl.items.reduce((ss, i) => ss + i.gold * i.count, 0), 0
    )

    const { error } = await supabase.from('item_builds').insert({
      user_id:    userId,
      name:       build.titre,
      champ:      build.champion ? { name: build.champion } : null,
      blocks:     slimBlocks,
      total_gold: totalGold,
    })

    if (!error) {
      // Incrémenter le compteur saves
      await supabase.rpc('increment_saves', { build_id: build.id })
      setBuilds(prev => prev.map(b => b.id === build.id ? { ...b, saves: b.saves + 1 } : b))
      setImported(prev => new Set([...prev, build.id]))
    }

    setImporting(null)
  }

  // ── Retirer sa propre publication ─────────────────────────────────────────
  // Suppression réelle : workshop_builds n'a aucun flag de visibilité, retirer = DELETE.
  // L'autorisation est portée par la RLS (wb_delete_owner : auth.uid() = creator_id) —
  // le test d'appartenance côté client ne sert qu'à afficher le bouton, il n'autorise rien.
  async function handleDelete(build: WorkshopBuild) {
    if (deleting) return
    if (!confirm(`Retirer « ${build.titre} » du Workshop ?\n\nCette action est irréversible : le build ne sera plus visible par la communauté et ses ♥ et ↓ seront perdus. Ta copie personnelle dans « Builds Items » n'est pas affectée.`)) return

    setDeleting(build.id)
    // `.select()` est indispensable : un DELETE refusé par la RLS ne lève PAS d'erreur,
    // il supprime simplement 0 ligne (vérifié en conditions réelles). Sans les lignes
    // retournées, on retirerait la carte de l'affichage alors que le build est toujours
    // publié. On ne se fie donc qu'à ce que le serveur dit avoir supprimé.
    const { data, error } = await supabase
      .from('workshop_builds').delete().eq('id', build.id).select('id')

    if (!error && data && data.length > 0) {
      setBuilds(prev => prev.filter(b => b.id !== build.id))
    } else {
      console.error('[Workshop] delete refusé ou sans effet', error?.message ?? '0 ligne supprimée')
    }
    setDeleting(null)
  }

  // ── Filtres ───────────────────────────────────────────────────────────────
  const filtered = builds.filter(b => {
    if (role !== 'Tous' && b.role.toLowerCase() !== role.toLowerCase()) return false
    if (search && !b.titre.toLowerCase().includes(search.toLowerCase()) &&
        !b.champion.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
        Parcours, vote et importe les builds créés par la communauté.
      </p>

      {/* ── Filtres ── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="🔍 Rechercher un build ou un champion..."
          style={{
            flex: '1 1 200px', padding: '9px 14px', borderRadius: 8,
            background: c ? 'rgba(20,10,35,0.6)' : '#18181B',
            border: `1px solid ${border}`, color: 'var(--text)',
            fontFamily: 'inherit', fontSize: 13, outline: 'none',
          }}
        />
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {ROLES.map(r => {
            const on = role === r
            return (
              <button key={r} onClick={() => setRole(r)} style={{
                padding: '7px 14px', borderRadius: 20, fontSize: 12, fontWeight: 500,
                border: `1px solid ${on ? accent : border}`,
                background: on ? (c ? 'rgba(186,117,23,0.15)' : 'rgba(127,119,221,0.15)') : 'transparent',
                color: on ? (c ? '#FAC775' : '#FAFAFA') : 'var(--text-muted)',
                cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
              }}>{r}</button>
            )
          })}
        </div>
      </div>

      {/* ── Chargement ── */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)', fontSize: 13 }}>
          Chargement des builds…
        </div>
      )}

      {/* ── Aucun résultat ── */}
      {!loading && filtered.length === 0 && (
        <div style={{
          textAlign: 'center', padding: '60px 20px',
          background: c ? 'rgba(20,10,35,0.4)' : '#18181B',
          border: `1px dashed ${border}`, borderRadius: 12,
        }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>🔍</div>
          <div style={{ fontSize: 14, color: 'var(--text-muted)' }}>
            {builds.length === 0 ? 'Aucun build publié pour l\'instant.' : 'Aucun build ne correspond à ta recherche.'}
          </div>
        </div>
      )}

      {/* ── Grille de builds ── */}
      {!loading && filtered.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
          {filtered.map(build => {
            const allItems = (build.items ?? []).flatMap(bl => bl.Items ?? []).slice(0, 6)
            const isImported = imported.has(build.id)
            const isImportingThis = importing === build.id
            const isLikingThis = liking === build.id
            // `creator_id` peut être NULL (builds antérieurs à la colonne) : la comparaison
            // stricte l'exclut, et c'est voulu — la RLS refuserait la suppression de toute façon.
            const isMine = !!userId && build.creator_id === userId
            const isDeletingThis = deleting === build.id

            return (
              <div key={build.id} style={{
                padding: 18, borderRadius: 10, background: bg,
                border: `1px solid ${border}`,
                display: 'flex', flexDirection: 'column', gap: 12,
                transition: 'border-color 0.15s',
              }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = borderH)}
                onMouseLeave={e => (e.currentTarget.style.borderColor = border)}
              >
                {/* ── Header ── */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  {/* Champion icon */}
                  {version && build.champion ? (
                    <img
                      src={champImg(version, build.champion)}
                      alt={build.champion}
                      onError={e => {
                        e.currentTarget.style.display = 'none'
                        e.currentTarget.nextElementSibling?.removeAttribute('style')
                      }}
                      style={{ width: 44, height: 44, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }}
                    />
                  ) : null}
                  <div style={{
                    width: 44, height: 44, borderRadius: 8, flexShrink: 0,
                    background: 'linear-gradient(135deg,#7F77DD,#534AB7)',
                    display: version && build.champion ? 'none' : 'flex',
                    alignItems: 'center', justifyContent: 'center',
                    fontWeight: 700, fontSize: 14, color: 'white',
                  }}>
                    {build.champion.slice(0, 2).toUpperCase() || '??'}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#F5F2FA', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {build.titre}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-dim)', display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span>{build.champion}</span>
                      {build.role && <><span>·</span><span>{build.role}</span></>}
                      {build.patch && <><span>·</span><span style={{ color: accent }}>patch {build.patch}</span></>}
                    </div>
                  </div>
                </div>

                {/* ── Description ── */}
                {build.description && (
                  <div style={{
                    fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5,
                    display: '-webkit-box', WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical', overflow: 'hidden',
                  }}>
                    {build.description}
                  </div>
                )}

                {/* ── Preview items ── */}
                {allItems.length > 0 && version && (
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                    {allItems.map((item, i) => (
                      item.Id ? (
                        <img key={i}
                          src={itemImg(version, item.Id)}
                          alt={item.Name ?? ''}
                          title={`${item.Name ?? ''} (×${item.Count ?? 1})`}
                          onError={e => { e.currentTarget.style.display = 'none' }}
                          style={{ width: 32, height: 32, borderRadius: 5, objectFit: 'cover' }}
                        />
                      ) : null
                    ))}
                  </div>
                )}

                {/* ── Footer ── */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto' }}>
                  <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                    par <span style={{ color: 'var(--text-muted)' }}>{build.creator_name}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {/* Like */}
                    <button
                      onClick={() => handleLike(build)}
                      disabled={!!isLikingThis}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 4,
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: c ? '#BA7517' : '#7F77DD',
                        fontSize: 12, fontFamily: 'inherit', padding: '2px 6px',
                        opacity: isLikingThis ? 0.5 : 1, transition: 'opacity 0.15s',
                      }}
                    >
                      ♥ {build.likes}
                    </button>
                    {/* Saves */}
                    <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                      ↓ {build.saves}
                    </span>
                  </div>
                </div>

                {/* ── Import ── */}
                <button
                  onClick={() => handleImport(build)}
                  disabled={!userId || isImported || isImportingThis}
                  style={{
                    width: '100%', padding: '9px',
                    background: isImported
                      ? (c ? 'rgba(93,202,165,0.15)' : 'rgba(93,202,165,0.15)')
                      : 'linear-gradient(135deg,#7F77DD,#534AB7)',
                    border: isImported ? '1px solid rgba(93,202,165,0.4)' : 'none',
                    borderRadius: 6,
                    color: isImported ? '#5DCAA5' : 'white',
                    fontSize: 13, fontWeight: 600,
                    cursor: !userId || isImported ? 'default' : 'pointer',
                    fontFamily: 'inherit', transition: 'opacity 0.15s',
                    opacity: isImportingThis ? 0.6 : 1,
                  }}
                >
                  {isImported
                    ? '✓ Importé'
                    : isImportingThis
                      ? 'Import…'
                      : !userId
                        ? 'Connecte-toi pour importer'
                        : 'Importer le build'}
                </button>

                {/* ── Retirer (propriétaire uniquement) ── */}
                {isMine && (
                  <button
                    onClick={() => handleDelete(build)}
                    disabled={isDeletingThis}
                    style={{
                      width: '100%', padding: '7px',
                      background: 'transparent',
                      border: '1px solid rgba(229,72,77,0.35)',
                      borderRadius: 6, color: '#E5484D',
                      fontSize: 12, fontWeight: 500,
                      cursor: isDeletingThis ? 'default' : 'pointer',
                      fontFamily: 'inherit', transition: 'opacity 0.15s',
                      opacity: isDeletingThis ? 0.6 : 1,
                    }}
                  >
                    {isDeletingThis ? 'Retrait…' : '🗑 Retirer du Workshop'}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
