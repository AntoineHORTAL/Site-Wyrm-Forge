'use client'

import { useState, useEffect, useRef } from 'react'
import { useTheme } from '@/components/providers/ThemeProvider'
import { createClient } from '@/lib/supabase/client'

// ─── Types ─────────────────────────────────────────────────────────────────────
interface DDItem {
  id: string
  name: string
  image: string
  gold: { total: number; purchasable: boolean }
  tags: string[]
  stats: Record<string, number>
  depth?: number
  maps: Record<string, boolean>
  description?: string
  from?: string[]    // IDs des composants nécessaires
  into?: string[]    // IDs des items dans lesquels celui-ci entre
}

interface DDChamp {
  id: string
  name: string
  image: string
}

interface BlockItem {
  item: DDItem
  count: number
}

interface BuildBlock {
  id: string
  name: string
  items: BlockItem[]
}

interface StatConfig {
  key: string
  label: string
  suffix: string
  icon: string
  mult?: number
  scale?: number
  category: 'off' | 'def' | 'util'
}

interface SavedBuild {
  id: string
  name: string
  champ: DDChamp | null
  blocks: BuildBlock[]
  totalGold: number
  createdAt: string   // ISO date string
}

// ─── Filter categories ─────────────────────────────────────────────────────────
const FILTERS = [
  { icon: '/Icons/Stats/Attack_damage.png',          label: 'AD',           tags: ['Damage'] },
  { icon: '/Icons/Stats/Ability_power.png',          label: 'AP',           tags: ['SpellDamage'] },
  { icon: '/Icons/Stats/Armor.png',                  label: 'Armure',       tags: ['Armor'] },
  { icon: '/Icons/Stats/Magic_resistance.png',       label: 'Rés. mag.',    tags: ['SpellBlock'] },
  { icon: '/Icons/Stats/Health.png',                 label: 'Vie',          tags: ['Health'] },
  { icon: '/Icons/Stats/Armor_penetration.png',      label: 'Létalité',     tags: ['ArmorPenetration'] },
  { icon: '/Icons/Stats/Magic_penetration.png',      label: 'Pén. mag.',    tags: ['MagicPenetration'] },
  { icon: '/Icons/Stats/Attack_speed.png',           label: 'Vit. attq.',   tags: ['AttackSpeed'], scale: 1.5 },
  { icon: '/Icons/Stats/Critical_strike_chance.png', label: 'Crit',         tags: ['CriticalStrike'] },
  { icon: '/Icons/Stats/Life_steal.png',             label: 'Vol de vie',   tags: ['LifeSteal'] },
  { icon: '/Icons/Stats/Omnivamp.png',               label: 'Omnivamp',     tags: ['SpellVamp'] },
  { icon: '/Icons/Stats/Movement_speed.png',         label: 'Vit. dép.',    tags: ['NonbootsMovement'] },
  { icon: '/Icons/Stats/Mana.png',                   label: 'Mana',         tags: ['Mana'] },
  { icon: '/Icons/Stats/Health_regeneration.png',    label: 'Régén. PV',    tags: ['HealthRegen'] },
  { icon: '/Icons/Stats/Mana_regeneration.png',      label: 'Régén. mana',  tags: ['ManaRegen'] },
  { icon: '/Icons/Stats/Heal_and_shield_power.png',  label: 'Soins',        tags: ['Aura'] },
  { icon: '/Icons/Stats/Tenacity.png',               label: 'Ténacité',     tags: ['Tenacity'] },
  { icon: '/Icons/Stats/Adaptive_Force.png',         label: 'Adapt.',       tags: ['Damage', 'SpellDamage'] },
]

// ─── Stat display ──────────────────────────────────────────────────────────────
const STATS: StatConfig[] = [
  { key: 'FlatPhysicalDamageMod',   label: 'Dégâts physiques',  suffix: '',  icon: '/Icons/Stats/Attack_damage.png',         category: 'off' },
  { key: 'FlatMagicDamageMod',      label: 'Puissance (AP)',     suffix: '',  icon: '/Icons/Stats/Ability_power.png',          category: 'off' },
  { key: 'FlatCritChanceMod',       label: 'Coup critique',      suffix: '%', mult: 100, icon: '/Icons/Stats/Critical_strike_chance.png', category: 'off' },
  { key: 'PercentAttackSpeedMod',   label: "Vitesse d'attaque",  suffix: '%', mult: 100, icon: '/Icons/Stats/Attack_speed.png', scale: 1.5, category: 'off' },
  { key: 'PercentLifeStealMod',     label: 'Vol de vie',         suffix: '%', mult: 100, icon: '/Icons/Stats/Life_steal.png',             category: 'off' },
  { key: 'FlatArmorPenetrationMod', label: 'Létalité',           suffix: '',  icon: '/Icons/Stats/Armor_penetration.png',      category: 'off' },
  { key: 'FlatMagicPenetrationMod', label: 'Pén. magique',       suffix: '',  icon: '/Icons/Stats/Magic_penetration.png',      category: 'off' },
  { key: 'FlatHPPoolMod',           label: 'Points de vie',      suffix: '',  icon: '/Icons/Stats/Health.png',                 category: 'def' },
  { key: 'FlatArmorMod',            label: 'Armure',             suffix: '',  icon: '/Icons/Stats/Armor.png',                  category: 'def' },
  { key: 'FlatSpellBlockMod',       label: 'Résistance mag.',    suffix: '',  icon: '/Icons/Stats/Magic_resistance.png',       category: 'def' },
  { key: 'FlatHPRegenMod',          label: 'Régén. PV',          suffix: '',  icon: '/Icons/Stats/Health_regeneration.png',    category: 'def' },
  { key: 'FlatMPPoolMod',           label: 'Mana',               suffix: '',  icon: '/Icons/Stats/Mana.png',                   category: 'util' },
  { key: 'FlatMovementSpeedMod',    label: 'Vitesse dép.',       suffix: '',  icon: '/Icons/Stats/Movement_speed.png',         category: 'util' },
  { key: 'PercentMovementSpeedMod', label: 'Vitesse dép. %',     suffix: '%', mult: 100, icon: '/Icons/Stats/Movement_speed.png', category: 'util' },
]

// ─── Helpers ───────────────────────────────────────────────────────────────────
const DDN = 'https://ddragon.leagueoflegends.com'
const itemImg  = (v: string, f: string) => `${DDN}/cdn/${v}/img/item/${f}`
const champImg = (v: string, f: string) => `${DDN}/cdn/${v}/img/champion/${f}`
const uid = () => Math.random().toString(36).slice(2, 9)

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .trim()
}

// ─── Component ─────────────────────────────────────────────────────────────────
export default function BuildsTab() {
  const { theme } = useTheme()
  const c = theme === 'mythic'
  const supabase = createClient()

  // Navigation
  const [view, setView]               = useState<'list' | 'editor'>('list')
  const [savedBuilds, setSavedBuilds] = useState<SavedBuild[]>([])
  const [buildsLoading, setBuildsLoading] = useState(true)
  const [savingBuild, setSavingBuild]     = useState(false)
  const [editingBuildId, setEditingBuildId] = useState<string | null>(null)
  const [userId, setUserId]           = useState<string | null>(null)

  // API
  const [version, setVersion]       = useState('')
  const [allItems, setAllItems]     = useState<DDItem[]>([])
  const [allChamps, setAllChamps]   = useState<DDChamp[]>([])
  const [itemsById, setItemsById]   = useState<Record<string, DDItem>>({})
  const [loading, setLoading]       = useState(true)
  const [apiError, setApiError]     = useState('')
  const [selectedItem, setSelectedItem] = useState<DDItem | null>(null)

  // UI
  const [search, setSearch]           = useState('')
  const [activeFilters, setActiveFilters] = useState<string[]>([])
  const [buildName, setBuildName]     = useState('')
  const [selectedChamp, setSelectedChamp] = useState<DDChamp | null>(null)
  const [champSearch, setChampSearch] = useState('')
  const [showChampDrop, setShowChampDrop] = useState(false)
  const [showDetail, setShowDetail]   = useState(false)
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null)
  const [sortOrder, setSortOrder]           = useState<'asc' | 'desc'>('asc')
  const [targetBlockId, setTargetBlockId]   = useState<string>('')

  // Blocks
  const [blocks, setBlocks] = useState<BuildBlock[]>([
    { id: uid(), name: 'Items de départ', items: [] },
    { id: uid(), name: 'Items cœur',      items: [] },
  ])

  // Drag
  const [dragItem, setDragItem]         = useState<DDItem | null>(null)
  const [dragOverBlock, setDragOverBlock] = useState<string | null>(null)

  const champDropRef = useRef<HTMLDivElement>(null)
  const detailRef    = useRef<HTMLDivElement>(null)

  // ── Fetch Data Dragon + user + builds ───────────────────────────────────────
  useEffect(() => {
    async function load() {
      try {
        setLoading(true)

        // Récupérer l'utilisateur et ses builds en parallèle avec DDR
        const [vRes, { data: { user } }] = await Promise.all([
          fetch(`${DDN}/api/versions.json`),
          supabase.auth.getUser(),
        ])

        const versions: string[] = await vRes.json()
        const v = versions[0]
        setVersion(v)
        setUserId(user?.id ?? null)

        const [iRes, cRes, buildsRes] = await Promise.all([
          fetch(`${DDN}/cdn/${v}/data/fr_FR/item.json`),
          fetch(`${DDN}/cdn/${v}/data/fr_FR/champion.json`),
          user
            ? supabase.from('item_builds').select('*').order('created_at', { ascending: false })
            : Promise.resolve({ data: [] }),
        ])
        const iData = await iRes.json()
        const cData = await cRes.json()

        // Map complète (pour lookup composants/évolutions)
        const byId: Record<string, DDItem> = {}
        Object.entries(iData.data).forEach(([id, raw]: [string, any]) => {
          byId[id] = {
            id,
            name:        raw.name,
            image:       raw.image?.full ?? '',
            gold:        raw.gold  ?? { total: 0, purchasable: false },
            tags:        raw.tags  ?? [],
            stats:       raw.stats ?? {},
            depth:       raw.depth,
            maps:        raw.maps  ?? {},
            description: raw.description ?? '',
            from:        raw.from  ?? [],
            into:        raw.into  ?? [],
          }
        })
        setItemsById(byId)

        // Items: map 11 (Summoner's Rift), achetables, visibles en boutique, sans doublons
        const rawItems: DDItem[] = Object.entries(iData.data)
          .filter(([, raw]: [string, any]) => {
            if (!raw.maps?.['11'])             return false
            if (!raw.gold?.purchasable)        return false
            if (raw.gold?.total === undefined) return false
            if (raw.inStore === false)         return false
            if (raw.requiredAlly)              return false
            if (raw.requiredChampion)          return false
            return true
          })
          .map(([id]: [string, any]) => byId[id])
          .sort((a, b) => a.name.localeCompare(b.name, 'fr'))

        // Dédoublonner par nom
        const seen = new Set<string>()
        const items = rawItems.filter(item => {
          if (seen.has(item.name)) return false
          seen.add(item.name)
          return true
        })
        setAllItems(items)

        // Champions
        const champs: DDChamp[] = Object.entries(cData.data)
          .map(([id, raw]: [string, any]) => ({ id, name: raw.name, image: raw.image.full }))
          .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
        setAllChamps(champs)

        // Builds depuis Supabase — rehydratation slim → DDItem via byId
        const rows = (buildsRes as any).data ?? []
        setSavedBuilds(rows.map((row: any) => ({
          id:        row.id,
          name:      row.name,
          champ:     row.champ ?? null,
          totalGold: row.total_gold,
          createdAt: row.created_at,
          blocks: (row.blocks ?? []).map((sb: any) => ({
            id:   sb.id ?? uid(),
            name: sb.name ?? 'Bloc',
            items: (sb.items ?? []).map((si: any) => {
              const full = byId[si.itemId]
              return {
                count: si.count ?? 1,
                item: full ?? {
                  id: si.itemId, name: si.name ?? '', image: si.image ?? '',
                  gold: { total: si.gold ?? 0, purchasable: true },
                  tags: [], stats: {}, maps: { '11': true },
                  description: '', from: [], into: [],
                },
              }
            }),
          })),
        })))
      } catch {
        setApiError('Erreur lors du chargement des données Riot.')
      } finally {
        setLoading(false)
        setBuildsLoading(false)
      }
    }
    load()
  }, [])

  // ── Sync targetBlockId quand les blocs changent ──────────────────────────
  useEffect(() => {
    setTargetBlockId(prev => {
      if (blocks.find(b => b.id === prev)) return prev  // bloc toujours valide
      return blocks[0]?.id ?? ''                         // sinon premier bloc
    })
  }, [blocks])

  // ── Auto-scroll vers le détail quand un item est sélectionné ─────────────
  useEffect(() => {
    if (selectedItem && detailRef.current) {
      detailRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [selectedItem])

  // ── Close champ dropdown on outside click ─────────────────────────────────
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (champDropRef.current && !champDropRef.current.contains(e.target as Node))
        setShowChampDrop(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  // ── Filtered + sorted lists ───────────────────────────────────────────────
  const filteredItems = allItems
    .filter(item => {
      if (search && !item.name.toLowerCase().includes(search.toLowerCase())) return false
      if (activeFilters.length === 0) return true
      return activeFilters.some(label => {
        const f = FILTERS.find(x => x.label === label)
        if (!f) return false
        if (label === 'Légendaire') return (item.depth ?? 1) >= 2 && item.gold.total >= 2500
        return f.tags.some(t => item.tags.includes(t))
      })
    })
    .sort((a, b) =>
      sortOrder === 'asc' ? a.gold.total - b.gold.total : b.gold.total - a.gold.total
    )

  const filteredChamps = allChamps.filter(ch =>
    ch.name.toLowerCase().includes(champSearch.toLowerCase())
  )

  // ── Block helpers ─────────────────────────────────────────────────────────
  function addToBlock(blockId: string, item: DDItem) {
    setBlocks(prev => prev.map(b => {
      if (b.id !== blockId) return b
      const ex = b.items.find(bi => bi.item.id === item.id)
      if (ex) return { ...b, items: b.items.map(bi => bi.item.id === item.id ? { ...bi, count: bi.count + 1 } : bi) }
      return { ...b, items: [...b.items, { item, count: 1 }] }
    }))
  }

  function changeCount(blockId: string, itemId: string, delta: number) {
    setBlocks(prev => prev.map(b => {
      if (b.id !== blockId) return b
      return {
        ...b,
        items: b.items
          .map(bi => bi.item.id === itemId ? { ...bi, count: bi.count + delta } : bi)
          .filter(bi => bi.count > 0),
      }
    }))
  }

  function removeFromBlock(blockId: string, itemId: string) {
    setBlocks(prev => prev.map(b =>
      b.id === blockId ? { ...b, items: b.items.filter(bi => bi.item.id !== itemId) } : b
    ))
  }

  function addBlock() {
    setBlocks(prev => [...prev, { id: uid(), name: `Bloc ${prev.length + 1}`, items: [] }])
  }

  function removeBlock(id: string) {
    setBlocks(prev => prev.filter(b => b.id !== id))
  }

  function renameBlock(id: string, name: string) {
    setBlocks(prev => prev.map(b => b.id === id ? { ...b, name } : b))
  }

  // ── Gestion des builds sauvegardés ───────────────────────────────────────
  const DEFAULT_BLOCKS: BuildBlock[] = [
    { id: uid(), name: 'Items de départ', items: [] },
    { id: uid(), name: 'Items cœur',      items: [] },
  ]

  function openNewBuild() {
    setBuildName('')
    setSelectedChamp(null)
    setEditingBuildId(null)
    setBlocks([
      { id: uid(), name: 'Items de départ', items: [] },
      { id: uid(), name: 'Items cœur',      items: [] },
    ])
    setSelectedItem(null)
    setView('editor')
  }

  function openEditBuild(build: SavedBuild) {
    setBuildName(build.name)
    setSelectedChamp(build.champ)
    setEditingBuildId(build.id)
    setBlocks(build.blocks)
    setSelectedItem(null)
    setView('editor')
  }

  async function saveBuild() {
    if (!userId) return
    setSavingBuild(true)
    const gold = blocks.reduce(
      (s, b) => s + b.items.reduce((ss, bi) => ss + bi.item.gold.total * bi.count, 0), 0
    )
    // Format slim pour Supabase (interopérable avec l'app desktop)
    const slimBlocks = blocks.map(b => ({
      id:    b.id,
      name:  b.name,
      items: b.items.map(({ item, count }) => ({
        itemId: item.id,
        name:   item.name,
        image:  item.image,
        gold:   item.gold.total,
        count,
      })),
    }))

    const payload = {
      name:       buildName.trim() || 'Build sans nom',
      champ:      selectedChamp
        ? { id: selectedChamp.id, name: selectedChamp.name, image: selectedChamp.image }
        : null,
      blocks:     slimBlocks,
      total_gold: gold,
    }

    if (editingBuildId) {
      // Mise à jour d'un build existant
      await supabase
        .from('item_builds')
        .update(payload)
        .eq('id', editingBuildId)
      // En mémoire : conserver les blocks complets (pas slim)
      setSavedBuilds(prev => prev.map(b =>
        b.id === editingBuildId
          ? { ...b, name: payload.name, champ: selectedChamp, blocks, totalGold: gold }
          : b
      ))
    } else {
      // Création d'un nouveau build
      const { data, error } = await supabase
        .from('item_builds')
        .insert({ ...payload, user_id: userId })
        .select()
        .single()
      if (!error && data) {
        setSavedBuilds(prev => [{
          id:        data.id,
          name:      data.name,
          champ:     data.champ,
          blocks,          // blocks complets en mémoire
          totalGold:  data.total_gold,
          createdAt:  data.created_at,
        }, ...prev])
      }
    }

    setSavingBuild(false)
    setView('list')
  }

  async function deleteBuild(id: string) {
    await supabase.from('item_builds').delete().eq('id', id)
    setSavedBuilds(prev => prev.filter(b => b.id !== id))
  }

  // ── Fermer le détail et scroller vers l'item ──────────────────────────────
  function closeDetail() {
    if (selectedItem) {
      const el = document.querySelector(`[data-item-id="${selectedItem.id}"]`)
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
    setSelectedItem(null)
  }

  // ── Drag handlers ─────────────────────────────────────────────────────────
  function handleDrop(blockId: string) {
    if (dragItem) { addToBlock(blockId, dragItem); setDragItem(null) }
    setDragOverBlock(null)
  }

  // ── Computed stats ────────────────────────────────────────────────────────
  const statTotals: Record<string, number> = {}
  for (const b of blocks) {
    for (const { item, count } of b.items) {
      for (const [k, v] of Object.entries(item.stats)) {
        statTotals[k] = (statTotals[k] ?? 0) + v * count
      }
    }
  }
  const totalGold = blocks.reduce(
    (s, b) => s + b.items.reduce((ss, bi) => ss + bi.item.gold.total * bi.count, 0), 0
  )

  // ── Style tokens ──────────────────────────────────────────────────────────
  const border  = c ? 'rgba(186,117,23,0.2)' : '#27272A'
  const borderH = c ? 'rgba(186,117,23,0.5)' : '#3F3F46'
  const bg      = c ? 'rgba(20,10,35,0.5)'   : '#18181B'
  const bgCard  = c ? 'rgba(42,21,71,0.4)'   : '#27272A'
  const accent  = c ? '#BA7517' : '#7F77DD'
  const gold    = c ? '#FAC775' : '#EF9F27'

  // ── Render ────────────────────────────────────────────────────────────────
  // ── Vue liste ─────────────────────────────────────────────────────────────
  if (view === 'list') return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#F5F2FA' }}>Mes builds</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>
            {savedBuilds.length} build{savedBuilds.length !== 1 ? 's' : ''} sauvegardé{savedBuilds.length !== 1 ? 's' : ''}
          </div>
        </div>
        <button onClick={openNewBuild} style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '10px 20px', borderRadius: 8,
          background: 'linear-gradient(135deg,#7F77DD,#534AB7)',
          border: 'none', color: 'white', fontSize: 13, fontWeight: 600,
          cursor: 'pointer', fontFamily: 'inherit',
        }}>
          + Créer un build
        </button>
      </div>

      {/* Chargement */}
      {buildsLoading && (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)', fontSize: 13 }}>
          Chargement de tes builds…
        </div>
      )}

      {/* Liste vide */}
      {!buildsLoading && savedBuilds.length === 0 && (
        <div style={{
          textAlign: 'center', padding: '60px 20px',
          background: c ? 'rgba(20,10,35,0.4)' : '#18181B',
          border: `1px dashed ${border}`, borderRadius: 12,
        }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🔨</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#F5F2FA', marginBottom: 8 }}>
            Aucun build sauvegardé
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>
            Crée ton premier build en sélectionnant les items qui te correspondent.
          </div>
          <button onClick={openNewBuild} style={{
            padding: '10px 24px', borderRadius: 8,
            background: 'linear-gradient(135deg,#7F77DD,#534AB7)',
            border: 'none', color: 'white', fontSize: 13, fontWeight: 600,
            cursor: 'pointer', fontFamily: 'inherit',
          }}>
            Créer mon premier build
          </button>
        </div>
      )}

      {/* Grille de cards */}
      {!buildsLoading && savedBuilds.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
          {savedBuilds.map(build => {
            // Tous les items du build (preview)
            const allBuildItems = build.blocks.flatMap(b => b.items).slice(0, 6)
            return (
              <div key={build.id} style={{
                padding: 18, borderRadius: 10,
                background: c ? 'rgba(42,21,71,0.4)' : '#18181B',
                border: `1px solid ${border}`,
                display: 'flex', flexDirection: 'column', gap: 12,
              }}>
                {/* Header card */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  {build.champ && version
                    ? <img src={champImg(version, build.champ.image)} alt={build.champ.name}
                        style={{ width: 44, height: 44, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
                    : <div style={{
                        width: 44, height: 44, borderRadius: 8, flexShrink: 0,
                        background: c ? 'rgba(186,117,23,0.15)' : '#27272A',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 20,
                      }}>🔨</div>
                  }
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#F5F2FA', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {build.name}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                      {build.champ?.name ?? 'Champion libre'} · {build.blocks.reduce((s, b) => s + b.items.reduce((ss, bi) => ss + bi.count, 0), 0)} items
                    </div>
                  </div>
                </div>

                {/* Preview items */}
                {allBuildItems.length > 0 && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {allBuildItems.map(({ item }, i) => (
                      version
                        ? <img key={i} src={itemImg(version, item.image)} alt={item.name}
                            style={{ width: 34, height: 34, borderRadius: 5, objectFit: 'cover' }} />
                        : null
                    ))}
                  </div>
                )}

                {/* Footer */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto' }}>
                  <span style={{ fontSize: 12, color: c ? '#FAC775' : '#EF9F27', fontWeight: 600 }}>
                    {build.totalGold.toLocaleString('fr-FR')} g
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                    {new Date(build.createdAt).toLocaleDateString('fr-FR')}
                  </span>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => openEditBuild(build)} style={{
                    flex: 1, padding: '8px 0',
                    background: 'linear-gradient(135deg,#7F77DD,#534AB7)',
                    border: 'none', borderRadius: 6,
                    color: 'white', fontSize: 12, fontWeight: 600,
                    cursor: 'pointer', fontFamily: 'inherit',
                  }}>
                    ✏️ Modifier
                  </button>
                  <button onClick={() => deleteBuild(build.id)} style={{
                    padding: '8px 12px',
                    background: 'transparent', border: `1px solid #E24B4A`,
                    borderRadius: 6, color: '#E24B4A',
                    fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
                  }}>
                    🗑
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )

  // ── Vue éditeur ────────────────────────────────────────────────────────────
  return (
    <div style={{ position: 'relative' }}>

      {/* ══ Topbar ══════════════════════════════════════════════════════════ */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10,
        padding: '10px 14px', marginBottom: 14, borderRadius: 6,
        background: bg, border: `1px solid ${border}`, fontSize: 12,
      }}>
        {/* Retour */}
        <button onClick={() => setView('list')} style={{
          padding: '5px 12px', background: 'transparent',
          border: `1px solid ${border}`, borderRadius: 4,
          color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
        }}>
          ← Mes builds
        </button>

        {/* Build name */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ color: 'var(--text-muted)' }}>Nom :</span>
          <input
            className="wf-input"
            style={{ width: 140 }}
            value={buildName}
            onChange={e => setBuildName(e.target.value)}
            placeholder="Mon build..."
          />
        </div>

        {/* Champion dropdown */}
        <div ref={champDropRef} style={{ position: 'relative' }}>
          <button
            onClick={() => setShowChampDrop(v => !v)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px',
              borderRadius: 6, background: bgCard, border: `1px solid ${border}`,
              color: 'var(--text)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12,
            }}
          >
            {selectedChamp && version
              ? <>
                  <img src={champImg(version, selectedChamp.image)} alt={selectedChamp.name}
                    style={{ width: 22, height: 22, borderRadius: 3, objectFit: 'cover' }} />
                  {selectedChamp.name}
                </>
              : <span style={{ color: 'var(--text-muted)' }}>Champion ▾</span>
            }
          </button>

          {showChampDrop && (
            <div style={{
              position: 'absolute', top: 'calc(100% + 4px)', right: 0, zIndex: 100,
              background: c ? '#150828' : '#18181B', border: `1px solid ${borderH}`,
              borderRadius: 8, padding: 10, width: 240,
              boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
            }}>
              <input
                className="wf-input" style={{ marginBottom: 8 }}
                placeholder="🔍 Rechercher..."
                value={champSearch} onChange={e => setChampSearch(e.target.value)}
                autoFocus
              />
              <div style={{ maxHeight: 260, overflowY: 'auto' }} className="thin-scroll">
                {filteredChamps.map(ch => (
                  <button key={ch.id}
                    onClick={() => { setSelectedChamp(ch); setShowChampDrop(false); setChampSearch('') }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                      padding: '6px 8px', borderRadius: 6, border: 'none', textAlign: 'left',
                      background: selectedChamp?.id === ch.id
                        ? (c ? 'rgba(186,117,23,0.2)' : 'rgba(127,119,221,0.2)')
                        : 'transparent',
                      color: 'var(--text)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12,
                    }}
                  >
                    {version && (
                      <img src={champImg(version, ch.image)} alt={ch.name}
                        style={{ width: 26, height: 26, borderRadius: 4, objectFit: 'cover' }} />
                    )}
                    {ch.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div style={{ flex: 1 }} />

        {/* Détails */}
        <button onClick={() => setShowDetail(v => !v)} style={{
          padding: '5px 14px', borderRadius: 4, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12,
          background: showDetail ? (c ? 'rgba(186,117,23,0.2)' : 'rgba(127,119,221,0.2)') : 'transparent',
          border: `1px solid ${showDetail ? accent : border}`,
          color: showDetail ? gold : 'var(--text-muted)',
        }}>
          📊 Détails
        </button>

        {/* Sauver */}
        <button onClick={saveBuild} disabled={savingBuild} style={{
          padding: '5px 14px', background: savingBuild ? 'rgba(127,119,221,0.4)' : 'linear-gradient(135deg,#7F77DD,#534AB7)',
          border: 'none', borderRadius: 4, color: 'white', fontSize: 12,
          fontWeight: 600, cursor: savingBuild ? 'default' : 'pointer', fontFamily: 'inherit',
          transition: 'background 0.15s',
        }}>{savingBuild ? 'Sauvegarde…' : 'Sauver'}</button>
      </div>

      {/* ══ Main grid ═══════════════════════════════════════════════════════ */}
      <div className="dash-grid-builds">

        {/* ── Filter sidebar ── */}
        <div className="dash-filters-hide" style={{
          background: bg, border: `1px solid ${border}`, borderRadius: 6, padding: '10px 6px',
        }}>
          {/* ── Tri par prix ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 4, marginBottom: 6 }}>
            {(['asc', 'desc'] as const).map(order => {
              const on = sortOrder === order
              return (
                <button key={order} title={order === 'asc' ? 'Moins cher en premier' : 'Plus cher en premier'}
                  onClick={() => setSortOrder(order)}
                  onMouseEnter={e => {
                    if (!on) e.currentTarget.style.background = c ? 'rgba(186,117,23,0.1)' : 'rgba(127,119,221,0.1)'
                    e.currentTarget.style.borderColor = c ? 'rgba(186,117,23,0.5)' : '#7F77DD'
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = on ? (c ? 'rgba(186,117,23,0.2)' : 'rgba(127,119,221,0.2)') : (c ? 'rgba(42,21,71,0.3)' : '#27272A')
                    e.currentTarget.style.borderColor = on ? accent : border
                  }}
                  style={{
                    width: '100%', aspectRatio: '1', borderRadius: 5,
                    cursor: 'pointer', display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center', gap: 1,
                    background: on ? (c ? 'rgba(186,117,23,0.2)' : 'rgba(127,119,221,0.2)') : (c ? 'rgba(42,21,71,0.3)' : '#27272A'),
                    border: `1px solid ${on ? accent : border}`,
                    transition: 'background 0.15s, border-color 0.15s',
                  }}
                >
                  <img src="/Icons/Stats/Gold.png" alt="or"
                    style={{ width: 14, height: 14, objectFit: 'contain',
                      filter: on ? 'none' : 'brightness(0.55)' }}
                  />
                  <span style={{ fontSize: 11, color: on ? gold : 'var(--text-dim)', lineHeight: 1 }}>
                    {order === 'asc' ? '↑' : '↓'}
                  </span>
                </button>
              )
            })}
          </div>

          <div style={{ height: 1, background: border, marginBottom: 6 }} />

          <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, color: accent, marginBottom: 6, textAlign: 'center' }}>
            Filtres
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 4 }}>
            {FILTERS.map(f => {
              const on = activeFilters.includes(f.label)
              return (
                <button key={f.label} title={f.label}
                  onClick={() => setActiveFilters(prev =>
                    prev.includes(f.label) ? prev.filter(x => x !== f.label) : [...prev, f.label]
                  )}
                  onMouseEnter={e => {
                    if (!on) e.currentTarget.style.background = c ? 'rgba(186,117,23,0.1)' : 'rgba(127,119,221,0.1)'
                    e.currentTarget.style.borderColor = c ? 'rgba(186,117,23,0.5)' : '#7F77DD'
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = on ? (c ? 'rgba(186,117,23,0.2)' : 'rgba(127,119,221,0.2)') : (c ? 'rgba(42,21,71,0.3)' : '#27272A')
                    e.currentTarget.style.borderColor = on ? accent : border
                  }}
                  style={{
                    width: '100%', aspectRatio: '1', borderRadius: 5,
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: on ? (c ? 'rgba(186,117,23,0.2)' : 'rgba(127,119,221,0.2)') : (c ? 'rgba(42,21,71,0.3)' : '#27272A'),
                    border: `1px solid ${on ? accent : border}`,
                    transition: 'background 0.15s, border-color 0.15s',
                  }}
                >
                  <img src={f.icon} alt={f.label}
                    style={{ width: 22, height: 22, objectFit: 'contain', display: 'block',
                      filter: on ? 'none' : 'brightness(0.55)',
                      transform: f.scale ? `scale(${f.scale})` : undefined }}
                  />
                </button>
              )
            })}
          </div>
          {activeFilters.length > 0 && (
            <button onClick={() => setActiveFilters([])}
              style={{ marginTop: 8, background: 'none', border: 'none', color: '#E24B4A', fontSize: 11, cursor: 'pointer', width: '100%' }}
            >✕ Reset</button>
          )}
        </div>

        {/* ── Item grid ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, height: '100%', minHeight: 0 }}>
          <input
            className="wf-input" style={{ flexShrink: 0 }}
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="🔍 Rechercher un item..."
          />
          <div className="dash-items-grid thin-scroll" style={{
            background: c ? 'rgba(20,10,35,0.4)' : '#0F0F11',
            border: `1px solid ${c ? 'rgba(186,117,23,0.15)' : '#27272A'}`,
            borderRadius: 6, padding: 10, flex: 1, minHeight: 0, overflowY: 'auto',
          }}>
            {loading ? (
              <div style={{ gridColumn: '1/-1', textAlign: 'center', color: 'var(--text-muted)', padding: 40, fontSize: 13 }}>
                Chargement des items Riot…
              </div>
            ) : apiError ? (
              <div style={{ gridColumn: '1/-1', textAlign: 'center', color: '#E24B4A', padding: 40, fontSize: 13 }}>
                {apiError}
              </div>
            ) : filteredItems.length === 0 ? (
              <div style={{ gridColumn: '1/-1', textAlign: 'center', color: 'var(--text-dim)', padding: 40, fontSize: 13 }}>
                Aucun item trouvé
              </div>
            ) : filteredItems.map(item => (
              <div key={item.id}
                data-item-id={item.id}
                draggable
                onDragStart={() => setDragItem(item)}
                onDragEnd={() => { setDragItem(null); setDragOverBlock(null) }}
                onClick={() => setSelectedItem(prev => prev?.id === item.id ? null : item)}
                title={`${item.name} — ${item.gold.total === 0 ? 'Gratuit' : item.gold.total + 'g'}\nClic = détail · Glisse = ajouter au bloc`}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  gap: 2, cursor: 'pointer', padding: 3, borderRadius: 5,
                  userSelect: 'none', transition: 'background 0.1s',
                  outline: selectedItem?.id === item.id ? `2px solid ${accent}` : 'none',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = c ? 'rgba(186,117,23,0.1)' : 'rgba(127,119,221,0.1)')}
                onMouseLeave={e => (e.currentTarget.style.background = selectedItem?.id === item.id ? (c ? 'rgba(186,117,23,0.1)' : 'rgba(127,119,221,0.1)') : 'transparent')}
              >
                {version
                  ? <img src={itemImg(version, item.image)} alt={item.name} draggable={false}
                      style={{ width: '100%', aspectRatio: '1', borderRadius: 4, objectFit: 'cover', display: 'block' }} />
                  : <div style={{ width: '100%', aspectRatio: '1', borderRadius: 4, background: bgCard }} />
                }
                <div style={{ fontSize: 8, color: gold, fontWeight: 600, lineHeight: 1 }}>
                  {item.gold.total === 0 ? 'Gratuit' : `${item.gold.total}g`}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Build blocks panel ── */}
        <div className="dash-edit-panel thin-scroll" style={{
          background: bg, border: `1px solid ${border}`, borderRadius: 6, padding: 12,
          display: 'flex', flexDirection: 'column', gap: 10,
          height: '100%', minHeight: 0, overflowY: 'auto',
        }}>

          {blocks.map(block => {
            const blockGold = block.items.reduce((s, bi) => s + bi.item.gold.total * bi.count, 0)
            const isOver = dragOverBlock === block.id
            return (
              <div key={block.id}
                onDragOver={e => { e.preventDefault(); setDragOverBlock(block.id) }}
                onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverBlock(null) }}
                onDrop={() => handleDrop(block.id)}
                style={{
                  borderRadius: 8, padding: 10, transition: 'border-color 0.15s, background 0.15s',
                  background: isOver ? (c ? 'rgba(186,117,23,0.1)' : 'rgba(127,119,221,0.1)') : bgCard,
                  border: `1px solid ${isOver ? accent : border}`,
                }}
              >
                {/* Block header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                  {editingBlockId === block.id
                    ? <input autoFocus value={block.name}
                        onChange={e => renameBlock(block.id, e.target.value)}
                        onBlur={() => setEditingBlockId(null)}
                        onKeyDown={e => { if (e.key === 'Enter') setEditingBlockId(null) }}
                        style={{
                          flex: 1, background: 'transparent', border: 'none',
                          borderBottom: `1px solid ${accent}`, outline: 'none',
                          color: '#F5F2FA', fontSize: 12, fontWeight: 600,
                          fontFamily: 'inherit', padding: '2px 0',
                        }}
                      />
                    : <div onClick={() => setEditingBlockId(block.id)}
                        style={{ flex: 1, fontSize: 12, fontWeight: 600, color: '#F5F2FA', cursor: 'text' }}
                      >
                        {block.name}
                      </div>
                  }
                  <button onClick={() => removeBlock(block.id)}
                    style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 15, padding: 0, lineHeight: 1 }}
                    title="Supprimer ce bloc"
                  >×</button>
                </div>

                {/* Empty drop hint */}
                {block.items.length === 0 && (
                  <div style={{
                    textAlign: 'center', padding: '14px 0',
                    color: isOver ? (c ? '#FAC775' : '#A5A0FF') : 'var(--text-dim)',
                    fontSize: 11, border: `1px dashed ${isOver ? accent : border}`,
                    borderRadius: 6, transition: 'all 0.15s',
                  }}>
                    {isOver ? '⬇ Déposer ici' : 'Glisse des items ici'}
                  </div>
                )}

                {/* Items */}
                {block.items.map(({ item, count }) => {
                  const itemStats = STATS.filter(s => (item.stats[s.key] ?? 0) !== 0)
                  return (
                    <div key={item.id}
                      onClick={() => changeCount(block.id, item.id, 1)}
                      onContextMenu={e => { e.preventDefault(); changeCount(block.id, item.id, -1) }}
                      style={{
                        display: 'flex', alignItems: 'flex-start', gap: 8,
                        padding: '7px 0', cursor: 'pointer',
                        borderBottom: `1px solid ${border}`,
                      }}
                      title="Clic gauche = +1  •  Clic droit = -1"
                    >
                      {/* Icon */}
                      {version
                        ? <img src={itemImg(version, item.image)} alt={item.name}
                            style={{ width: 32, height: 32, borderRadius: 4, objectFit: 'cover', flexShrink: 0, marginTop: 1 }} />
                        : <div style={{ width: 32, height: 32, borderRadius: 4, background: border, flexShrink: 0 }} />
                      }

                      {/* Content */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {/* Name + counter */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                          <div style={{ flex: 1, fontSize: 11, fontWeight: 600, color: '#F5F2FA', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {item.name}
                          </div>
                          {/* Counter + remove */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                            <button onClick={() => changeCount(block.id, item.id, -1)}
                              style={{
                                width: 16, height: 16, borderRadius: 3, border: `1px solid ${border}`,
                                background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer',
                                fontFamily: 'inherit', fontSize: 12, lineHeight: 1,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                              }}
                            >−</button>
                            <span style={{ fontSize: 11, color: '#F5F2FA', minWidth: 14, textAlign: 'center' }}>{count}</span>
                            <button onClick={() => changeCount(block.id, item.id, 1)}
                              style={{
                                width: 16, height: 16, borderRadius: 3, border: `1px solid ${border}`,
                                background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer',
                                fontFamily: 'inherit', fontSize: 12, lineHeight: 1,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                              }}
                            >+</button>
                            <button onClick={() => removeFromBlock(block.id, item.id)}
                              style={{ background: 'none', border: 'none', color: '#E24B4A', cursor: 'pointer', fontSize: 14, padding: 0, marginLeft: 1, lineHeight: 1 }}
                              title="Retirer l'item"
                            >×</button>
                          </div>
                        </div>

                        {/* Gold */}
                        <div style={{ fontSize: 10, color: gold, fontWeight: 600, marginBottom: itemStats.length > 0 ? 4 : 0 }}>
                          {item.gold.total === 0 ? 'Gratuit' : `${(item.gold.total * count).toLocaleString('fr-FR')}g`}
                        </div>

                        {/* Stats */}
                        {itemStats.length > 0 && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px 8px' }}>
                            {itemStats.map(s => {
                              const raw = (item.stats[s.key] ?? 0) * count
                              const val = s.mult
                                ? (Math.round(raw * s.mult * 10) / 10)
                                : Math.round(raw)
                              return (
                                <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                                  <img src={s.icon} alt={s.label} style={{ width: 11, height: 11, objectFit: 'contain', flexShrink: 0,
                                    transform: s.scale ? `scale(${s.scale})` : undefined }} />
                                  <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                                    +{val}{s.suffix}
                                  </span>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}

                {/* Block total */}
                {blockGold > 0 && (
                  <div style={{ marginTop: 6, textAlign: 'right', fontSize: 11, color: gold, fontWeight: 600 }}>
                    {blockGold.toLocaleString('fr-FR')}g
                  </div>
                )}
              </div>
            )
          })}

          {/* Add block */}
          <button onClick={addBlock} style={{
            width: '100%', padding: 10, background: 'transparent',
            border: `1px dashed ${border}`, borderRadius: 8,
            color: 'var(--text-muted)', fontFamily: 'inherit', fontSize: 12, cursor: 'pointer',
          }}>
            + Ajouter un bloc
          </button>

          {/* Grand total */}
          {totalGold > 0 && (
            <div style={{
              padding: '10px 12px', borderRadius: 6,
              background: c ? 'rgba(186,117,23,0.1)' : 'rgba(127,119,221,0.1)',
              border: `1px solid ${accent}`,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Total build</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: gold }}>
                {totalGold.toLocaleString('fr-FR')} g
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ══ Detail panel backdrop ════════════════════════════════════════════ */}
      {showDetail && (
        <div onClick={() => setShowDetail(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 199, background: 'rgba(0,0,0,0.5)' }}
        />
      )}

      {/* ══ Detail panel ════════════════════════════════════════════════════ */}
      {showDetail && (
        <div className="thin-scroll" style={{
          position: 'fixed', top: '50%', left: '50%',
          transform: 'translate(-50%,-50%)',
          zIndex: 200, width: 380, maxHeight: '80vh',
          background: c ? '#150828' : '#18181B',
          border: `1px solid ${borderH}`,
          borderRadius: 12, padding: 20,
          boxShadow: '0 16px 64px rgba(0,0,0,0.7)',
          overflowY: 'auto',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#F5F2FA' }}>
              📊 Statistiques du build
            </div>
            <button onClick={() => setShowDetail(false)}
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 20, lineHeight: 1 }}
            >×</button>
          </div>

          {/* Champion */}
          {selectedChamp && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, padding: '8px 12px', borderRadius: 8, background: bgCard }}>
              {version && (
                <img src={champImg(version, selectedChamp.image)} alt={selectedChamp.name}
                  style={{ width: 36, height: 36, borderRadius: 6, objectFit: 'cover' }} />
              )}
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#F5F2FA' }}>{selectedChamp.name}</div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{buildName || 'Build sans nom'}</div>
              </div>
            </div>
          )}

          {/* Total gold */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '10px 12px', borderRadius: 8, marginBottom: 16,
            background: c ? 'rgba(186,117,23,0.1)' : 'rgba(127,119,221,0.1)',
            border: `1px solid ${accent}`,
          }}>
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>💰 Coût total</span>
            <span style={{ fontSize: 16, fontWeight: 700, color: gold }}>
              {totalGold.toLocaleString('fr-FR')} g
            </span>
          </div>

          {/* Stat sections */}
          {(['off', 'def', 'util'] as const).map(cat => {
            const label = cat === 'off' ? '⚔️ Offensif' : cat === 'def' ? '🛡️ Défensif' : '🔧 Utilitaire'
            const rows = STATS.filter(s => s.category === cat && (statTotals[s.key] ?? 0) !== 0)
            if (rows.length === 0) return null
            return (
              <div key={cat} style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, color: accent, marginBottom: 8 }}>
                  {label}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {rows.map(s => {
                    const raw = statTotals[s.key] ?? 0
                    const val = s.mult
                      ? (Math.round(raw * s.mult * 10) / 10).toFixed(1)
                      : Math.round(raw).toString()
                    return (
                      <div key={s.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <img src={s.icon} alt={s.label} style={{ width: 16, height: 16, objectFit: 'contain',
                            transform: s.scale ? `scale(${s.scale})` : undefined }} />
                          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{s.label}</span>
                        </div>
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#F5F2FA' }}>
                          +{val}{s.suffix}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}

          {totalGold === 0 && (
            <p style={{ color: 'var(--text-dim)', fontSize: 13, textAlign: 'center', padding: 20 }}>
              Ajoute des items dans ton build pour voir les stats.
            </p>
          )}

          {/* Blocks summary */}
          {blocks.some(b => b.items.length > 0) && (
            <div style={{ borderTop: `1px solid ${border}`, paddingTop: 14, marginTop: 4 }}>
              <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, color: accent, marginBottom: 8 }}>
                📦 Détail par bloc
              </div>
              {blocks.filter(b => b.items.length > 0).map(b => (
                <div key={b.id} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{b.name}</span>
                  <span style={{ fontSize: 12, color: gold, fontWeight: 600 }}>
                    {b.items.reduce((s, bi) => s + bi.item.gold.total * bi.count, 0).toLocaleString('fr-FR')}g
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ══ Item detail panel ═══════════════════════════════════════════════ */}
      {selectedItem && (() => {
        const si = selectedItem
        const siStats = STATS.filter(s => (si.stats[s.key] ?? 0) !== 0)
        const desc = stripHtml(si.description ?? '')

        // Arborescence complète des composants (récursif vers le bas)
        function getAllComponents(id: string, visited = new Set<string>()): DDItem[] {
          if (visited.has(id)) return []
          visited.add(id)
          const item = itemsById[id]
          if (!item) return []
          const result: DDItem[] = []
          for (const cid of item.from ?? []) {
            const c = itemsById[cid]
            if (c && !visited.has(cid)) {
              result.push(c)
              result.push(...getAllComponents(cid, visited))
            }
          }
          return result
        }

        // Arborescence complète des évolutions (récursif vers le haut)
        function getAllBuildsInto(id: string, visited = new Set<string>()): DDItem[] {
          if (visited.has(id)) return []
          visited.add(id)
          const item = itemsById[id]
          if (!item) return []
          const result: DDItem[] = []
          for (const nid of item.into ?? []) {
            const n = itemsById[nid]
            if (n && !visited.has(nid)) {
              result.push(n)
              result.push(...getAllBuildsInto(nid, visited))
            }
          }
          return result
        }

        const components = getAllComponents(si.id)
        const buildsInto = getAllBuildsInto(si.id)

        return (
          <div ref={detailRef} style={{
            marginTop: 14, borderRadius: 10,
            background: c ? 'rgba(20,10,35,0.7)' : '#18181B',
            border: `1px solid ${c ? 'rgba(186,117,23,0.4)' : '#3F3F46'}`,
            padding: 20,
          }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 16 }}>
              {version && (
                <img src={itemImg(version, si.image)} alt={si.name}
                  style={{ width: 64, height: 64, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#F5F2FA', marginBottom: 4 }}>{si.name}</div>
                <div style={{ fontSize: 13, color: gold, fontWeight: 600, marginBottom: 8 }}>
                  {si.gold.total === 0 ? 'Gratuit' : `${si.gold.total.toLocaleString('fr-FR')} g`}
                </div>
                {siStats.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px' }}>
                    {siStats.map(s => {
                      const raw = si.stats[s.key] ?? 0
                      const val = s.mult ? (Math.round(raw * s.mult * 10) / 10) : Math.round(raw)
                      return (
                        <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <img src={s.icon} alt={s.label}
                            style={{ width: 14, height: 14, objectFit: 'contain',
                              transform: s.scale ? `scale(${s.scale})` : undefined }} />
                          <span style={{ fontSize: 12, color: '#F5F2FA', fontWeight: 600 }}>+{val}{s.suffix}</span>
                          <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{s.label}</span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
              {/* Close */}
              <button onClick={closeDetail}
                style={{ background: 'none', border: 'none', color: '#E24B4A', cursor: 'pointer', fontSize: 20, lineHeight: 1, flexShrink: 0 }}
                title="Fermer"
              >×</button>
            </div>

            {/* Ajouter au bloc */}
            {blocks.length > 0 && (
              <div style={{
                display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8,
                borderTop: `1px solid ${border}`, paddingTop: 12, marginBottom: 12,
              }}>
                <select
                  value={targetBlockId}
                  onChange={e => setTargetBlockId(e.target.value)}
                  style={{
                    flex: '1 1 160px', padding: '7px 10px', borderRadius: 6,
                    background: c ? 'rgba(20,10,35,0.8)' : '#27272A',
                    border: `1px solid ${border}`, color: '#F5F2FA',
                    fontFamily: 'inherit', fontSize: 13, outline: 'none', cursor: 'pointer',
                  }}
                >
                  {blocks.map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
                <button
                  onClick={() => { if (targetBlockId) addToBlock(targetBlockId, si) }}
                  style={{
                    padding: '7px 18px', borderRadius: 6, cursor: 'pointer',
                    background: 'linear-gradient(135deg,#7F77DD,#534AB7)',
                    border: 'none', color: 'white', fontSize: 13, fontWeight: 600,
                    fontFamily: 'inherit', whiteSpace: 'nowrap',
                  }}
                >
                  + Ajouter au bloc
                </button>
              </div>
            )}

            {/* Description */}
            {desc && (
              <div style={{
                fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6,
                borderTop: `1px solid ${border}`, paddingTop: 12, marginBottom: 16,
                whiteSpace: 'pre-line',
              }}>
                {desc}
              </div>
            )}

            {/* Components (craft) */}
            {components.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, color: accent, marginBottom: 8 }}>
                  🔨 Composants requis
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {components.map(comp => (
                    <button key={comp.id}
                      onClick={() => setSelectedItem(comp)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '6px 10px', borderRadius: 6,
                        background: bgCard, border: `1px solid ${border}`,
                        cursor: 'pointer', fontFamily: 'inherit',
                        transition: 'border-color 0.15s',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.borderColor = accent)}
                      onMouseLeave={e => (e.currentTarget.style.borderColor = border)}
                    >
                      {version && (
                        <img src={itemImg(version, comp.image)} alt={comp.name}
                          style={{ width: 28, height: 28, borderRadius: 4, objectFit: 'cover' }} />
                      )}
                      <div style={{ textAlign: 'left' }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: '#F5F2FA' }}>{comp.name}</div>
                        <div style={{ fontSize: 10, color: gold }}>
                          {comp.gold.total === 0 ? 'Gratuit' : `${comp.gold.total}g`}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Builds into */}
            {buildsInto.length > 0 && (
              <div>
                <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, color: accent, marginBottom: 8 }}>
                  ⬆ Se transforme en
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {buildsInto.map(next => (
                    <button key={next.id}
                      onClick={() => setSelectedItem(next)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '6px 10px', borderRadius: 6,
                        background: bgCard, border: `1px solid ${border}`,
                        cursor: 'pointer', fontFamily: 'inherit',
                        transition: 'border-color 0.15s',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.borderColor = accent)}
                      onMouseLeave={e => (e.currentTarget.style.borderColor = border)}
                    >
                      {version && (
                        <img src={itemImg(version, next.image)} alt={next.name}
                          style={{ width: 28, height: 28, borderRadius: 4, objectFit: 'cover' }} />
                      )}
                      <div style={{ textAlign: 'left' }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: '#F5F2FA' }}>{next.name}</div>
                        <div style={{ fontSize: 10, color: gold }}>
                          {next.gold.total === 0 ? 'Gratuit' : `${next.gold.total}g`}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )
      })()}
    </div>
  )
}
