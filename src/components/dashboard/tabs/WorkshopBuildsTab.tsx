'use client'

import { useState, useEffect } from 'react'
import { useTheme } from '@/components/providers/ThemeProvider'
import { createClient } from '@/lib/supabase/client'
import { removeWorkshopBuild } from '@/lib/workshop-builds'
import {
  likeAvailability, parseToggleResult, likeErrorKind, likedSetFromRows, withLikeState,
} from '@/lib/workshop-likes'
import { useDashboard } from '@/locales/dashboard'
import type { WorkshopRoleKey } from '@/locales/dashboard/workshop'

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

/**
 * Filtres de rôle. `key` sert l'état et le libellé (dico) ; `value` est la valeur
 * comparée à `workshop_builds.role` — c'est la FRONTIÈRE MÉTIER, elle reste en dur
 * ici et ne suit pas la langue. `null` = aucun filtre.
 */
const ROLES: { key: WorkshopRoleKey; value: string | null }[] = [
  { key: 'all',     value: null },
  { key: 'top',     value: 'Top' },
  { key: 'jungle',  value: 'Jungle' },
  { key: 'mid',     value: 'Mid' },
  { key: 'adc',     value: 'ADC' },
  { key: 'support', value: 'Support' },
]

// ─── Component ─────────────────────────────────────────────────────────────────
export default function WorkshopBuildsTab() {
  const { theme } = useTheme()
  const dico = useDashboard()
  const W = dico.workshop.builds
  const c = theme === 'mythic'
  const supabase = createClient()

  const [builds, setBuilds]     = useState<WorkshopBuild[]>([])
  const [loading, setLoading]   = useState(true)
  const [version, setVersion]   = useState('')
  const [search, setSearch]     = useState('')
  const [role, setRole]         = useState<WorkshopRoleKey>('all')
  const [userId, setUserId]     = useState<string | null>(null)
  const [importing, setImporting] = useState<string | null>(null)
  const [liking, setLiking]     = useState<string | null>(null)
  // Builds likés par l'utilisateur (lecture RLS de SES likes) + message d'échec du
  // dernier clic, porté par la carte concernée.
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set())
  const [likeError, setLikeError] = useState<{ id: string; text: string } | null>(null)
  // Vrai si la RPC est absente de la base (site déployé avant la migration) :
  // les boutons se désactivent au lieu de renvoyer une erreur à chaque clic.
  const [likesUnavailable, setLikesUnavailable] = useState(false)
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

        // Builds déjà likés : la RLS ne renvoie que les lignes de l'utilisateur.
        // Un échec (table absente avant la migration) laisse l'ensemble vide.
        if (user) {
          const { data: likeRows, error: likeErr } = await supabase
            .from('workshop_build_likes')
            .select('build_id')
          if (likeErr) console.error('[Workshop] liked builds load error', likeErr.message)
          else setLikedIds(likedSetFromRows(likeRows))
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
  // Un clic = like, le suivant = retrait. Le serveur fait foi : on affiche l'état
  // et le compteur qu'il RENVOIE, jamais un ±1 calculé ici. La règle (connecté,
  // pas son propre build, un seul like) est garantie par toggle_build_like ;
  // la désactivation du bouton n'est que de l'affichage.
  async function handleLike(build: WorkshopBuild) {
    if (liking || likesUnavailable) return
    if (likeAvailability(userId, build.creator_id) !== 'ok') return
    setLiking(build.id)
    setLikeError(null)
    const { data, error } = await supabase.rpc('toggle_build_like', { p_build_id: build.id })
    const result = error ? null : parseToggleResult(data)
    if (result) {
      setBuilds(prev => prev.map(b => b.id === build.id ? { ...b, likes: result.likeCount } : b))
      setLikedIds(prev => withLikeState(prev, build.id, result.liked))
    } else {
      const kind = likeErrorKind(error)
      if (kind === 'unavailable') setLikesUnavailable(true)
      setLikeError({
        id: build.id,
        text: kind === 'unavailable' ? W.likeUnavailable
            : kind === 'own'         ? W.likeOwn
            : kind === 'signedOut'   ? W.likeSignedOut
            :                          W.likeError,
      })
      if (error) console.error('[Workshop] toggle_build_like error', error.message)
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
    if (!confirm(W.removeConfirm.replace('{name}', build.titre))) return

    setDeleting(build.id)
    // Logique de suppression partagée avec le toggle « Dépublier » de BuildsTab
    // (helper removeWorkshopBuild : DELETE RLS-gardé + `.select()` obligatoire car
    // un refus RLS retire 0 ligne sans lever d'erreur). Ici on cible par `id` propre.
    const { removed, error } = await removeWorkshopBuild(supabase, { column: 'id', value: build.id })

    if (removed) {
      setBuilds(prev => prev.filter(b => b.id !== build.id))
    } else {
      console.error('[Workshop] delete refusé ou sans effet', error ?? '0 ligne supprimée')
    }
    setDeleting(null)
  }

  // ── Filtres ───────────────────────────────────────────────────────────────
  // `roleValue` est la valeur en base, jamais le libellé affiché.
  const roleValue = ROLES.find(r => r.key === role)?.value ?? null
  const filtered = builds.filter(b => {
    if (roleValue && b.role.toLowerCase() !== roleValue.toLowerCase()) return false
    if (search && !b.titre.toLowerCase().includes(search.toLowerCase()) &&
        !b.champion.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
        {W.intro}
      </p>

      {/* ── Filtres ── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder={W.search}
          style={{
            flex: '1 1 200px', padding: '9px 14px', borderRadius: 8,
            background: c ? 'rgba(20,10,35,0.6)' : '#18181B',
            border: `1px solid ${border}`, color: 'var(--text)',
            fontFamily: 'inherit', fontSize: 13, outline: 'none',
          }}
        />
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {ROLES.map(r => {
            const on = role === r.key
            return (
              <button key={r.key} onClick={() => setRole(r.key)} style={{
                padding: '7px 14px', borderRadius: 20, fontSize: 12, fontWeight: 500,
                border: `1px solid ${on ? accent : border}`,
                background: on ? (c ? 'rgba(186,117,23,0.15)' : 'rgba(127,119,221,0.15)') : 'transparent',
                color: on ? (c ? '#FAC775' : '#FAFAFA') : 'var(--text-muted)',
                cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
              }}>{W.roles[r.key]}</button>
            )
          })}
        </div>
      </div>

      {/* ── Chargement ── */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)', fontSize: 13 }}>
          {W.loading}
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
            {builds.length === 0 ? W.emptyAll : W.emptySearch}
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
            const likeAvail = likeAvailability(userId, build.creator_id)
            const isLiked = likedIds.has(build.id)
            const likeDisabled = likesUnavailable || likeAvail !== 'ok'
            const likeTitle = likesUnavailable    ? W.likeUnavailable
                            : likeAvail === 'own'       ? W.likeOwn
                            : likeAvail === 'signedOut' ? W.likeSignedOut
                            : isLiked                   ? W.unlike
                            :                             W.like
            const cardLikeError = likeError?.id === build.id ? likeError.text : null

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
                      {build.patch && <><span>·</span><span style={{ color: accent }}>{dico.workshop.shared.patchBadge.replace('{patch}', build.patch)}</span></>}
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
                          title={W.itemTitle
                            .replace('{name}', item.Name ?? '')
                            .replace('{count}', String(item.Count ?? 1))}
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
                    {dico.workshop.shared.by} <span style={{ color: 'var(--text-muted)' }}>{build.creator_name}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {/* Like */}
                    <button
                      onClick={() => handleLike(build)}
                      // aria-disabled et non `disabled` pour l'état « pas disponible » :
                      // un bouton `disabled` n'affiche pas son infobulle partout.
                      // handleLike ignore de toute façon le clic dans ce cas.
                      aria-disabled={likeDisabled}
                      disabled={isLikingThis}
                      title={likeTitle}
                      aria-label={`${likeTitle} (${build.likes})`}
                      aria-pressed={likeDisabled ? undefined : isLiked}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 4,
                        background: 'none', border: 'none',
                        cursor: likeDisabled ? 'default' : 'pointer',
                        // ♥ plein et coloré quand c'est liké ; ♡ neutre sinon.
                        color: isLiked ? '#E5484D' : 'var(--text-muted)',
                        fontSize: 12, fontFamily: 'inherit', padding: '2px 6px',
                        opacity: isLikingThis ? 0.5 : likeDisabled ? 0.6 : 1,
                        transition: 'opacity 0.15s, color 0.15s',
                      }}
                    >
                      <span aria-hidden="true">{isLiked ? '♥' : '♡'}</span> {build.likes}
                    </button>
                    {/* Saves */}
                    <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                      ↓ {build.saves}
                    </span>
                  </div>
                </div>

                {cardLikeError && (
                  <div role="status" style={{ fontSize: 11, color: '#E5484D', textAlign: 'right', marginTop: -6 }}>
                    {cardLikeError}
                  </div>
                )}

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
                    ? W.imported
                    : isImportingThis
                      ? W.importing
                      : !userId
                        ? W.importSignedOut
                        : W.import}
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
                    {isDeletingThis ? W.removing : W.remove}
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
