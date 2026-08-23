'use client'

import { useState, useEffect } from 'react'
import {
  IconFlame, IconCalendar, IconDiamonds, IconSparkles,
  IconArrowUp, IconArrowDown, IconRefresh, IconAdjustments,
  IconSword, IconSettings,
} from '@tabler/icons-react'
import { useLang } from '@/locales/dashboard'
import { formatDate } from '@/lib/intl'

const DDN = 'https://ddragon.leagueoflegends.com'

// ─── Types ─────────────────────────────────────────────────────────────────────

export type ChangeType = 'buff' | 'nerf' | 'ajustement' | 'refonte'
export type SpellSlot  = 'Q' | 'W' | 'E' | 'R' | 'passive'

export interface ChangeEntry {
  label:   string
  spell?:  SpellSlot   // slot associé — permet d'afficher l'icône du sort
  before?: string
  after?:  string
}

export interface ChampionEntry {
  name:         string
  ddragon_key:  string
  type:         ChangeType
  description?: string
  changes:      ChangeEntry[]
}

export interface BaseEntry {
  name:         string
  ddragon_id?:  number
  icon_url?:    string    // icône attachée par le classificateur backend (runes)
  type:         ChangeType
  description?: string
  changes:      ChangeEntry[]
}

export type ItemEntry   = BaseEntry
export type SystemEntry = BaseEntry

export interface PatchData {
  subtitle:   string
  highlights: string[]
  counts:     { champions: number; items: number; runes: number; systeme: number }
  champions:  ChampionEntry[]
  items:      BaseEntry[]
  runes:      BaseEntry[]
  systeme:    BaseEntry[]
}

export interface PatchNote {
  id:            string
  version:       string
  title:         string
  summary_jsonb: PatchData
  image_url:     string | null
  published_at:  string
}

export interface PatchCardProps {
  patch:            PatchNote
  ddragonVersion:   string
  // Quand true, force toutes les descriptions à s'afficher (mode export image)
  forceExpandDesc?: boolean
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

/**
 * ⚠️ Ce composant est rendu par l'onglet Patch Notes du dashboard ET par la page
 * publique /patch-notes. La date suit la langue CHOISIE par le visiteur, qui est
 * globale au site : un visiteur qui n'a jamais basculé reste en français.
 */
const FMT_DATE: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' }

function initials(name: string): string { return name.slice(0, 2) }

function norm(s: string): string {
  return s.normalize('NFD')
    .replace(/[̀-ͯ]/g, '')       // strip combining diacritical marks
    .replace(/[‘’ʼ]/g, "'")  // normalise apostrophes
    .toLowerCase()
    .trim()
}

function normalizeType(t: string): ChangeType {
  if (t === 'rework' || t === 'refonte') return 'refonte'
  if (t === 'adj' || t === 'neutral' || t === 'ajustement') return 'ajustement'
  if (t === 'new') return 'ajustement'
  if (t === 'nerf') return 'nerf'
  return 'buff'
}

function tagClass(type: ChangeType): string {
  if (type === 'buff') return 't-buff'; if (type === 'nerf') return 't-nerf'
  if (type === 'refonte') return 't-rework'; return 't-adj'
}
function tagLabel(type: ChangeType): string {
  if (type === 'buff') return 'Buff'; if (type === 'nerf') return 'Nerf'
  if (type === 'refonte') return 'Refonte'; return 'Ajustement'
}
function TagIcon({ type }: { type: ChangeType }) {
  const size = 12
  if (type === 'buff') return <IconArrowUp size={size} />
  if (type === 'nerf') return <IconArrowDown size={size} />
  if (type === 'refonte') return <IconRefresh size={size} />
  return <IconAdjustments size={size} />
}

function groupByType<T extends { type: string }>(arr: T[]) {
  const normalize = (e: T) => ({ ...e, type: normalizeType(e.type) as ChangeType })
  const items = arr.map(normalize)
  return {
    buffs:       items.filter(e => e.type === 'buff'),
    nerfs:       items.filter(e => e.type === 'nerf'),
    ajustements: items.filter(e => e.type === 'ajustement'),
    refontes:    items.filter(e => e.type === 'refonte'),
  }
}

// ─── Sous-composants ───────────────────────────────────────────────────────────

function ChangeValue({
  change, cardType, spellIconUrl,
}: {
  change: ChangeEntry; cardType: ChangeType; spellIconUrl?: string
}) {
  const valueClass = cardType === 'buff' ? 'pn-up' : cardType === 'nerf' ? 'pn-dn' : 'pn-eq'
  const hasValue = change.before || change.after
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      {spellIconUrl && (
        <img
          src={spellIconUrl}
          width={16} height={16}
          style={{ borderRadius: 3, flexShrink: 0 }}
          onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
          crossOrigin="anonymous"
          referrerPolicy="no-referrer"
        />
      )}
      {hasValue ? (
        <>
          {change.label}{' '}
          <b className={valueClass}>
            {change.before && change.after
              ? `${change.before} → ${change.after}`
              : (change.after ?? change.before)}
          </b>
        </>
      ) : (
        change.label
      )}
    </span>
  )
}

// Map slot → icône URL pour un champion donné
type SpellMap = Record<string, string>

function ChampionCard({
  champ, ddragonVersion, spellMap, forceExpandDesc,
}: {
  champ: ChampionEntry; ddragonVersion: string; spellMap?: SpellMap; forceExpandDesc?: boolean
}) {
  const type = normalizeType(champ.type)
  const [showDesc, setShowDesc] = useState(false)
  const descVisible = showDesc || !!forceExpandDesc

  return (
    <article className={`pn-card ${type}`}>
      <span className="pn-cico">
        <span className="pn-cico-init">{initials(champ.name)}</span>
        <img
          alt={champ.name}
          src={`${DDN}/cdn/${ddragonVersion}/img/champion/${champ.ddragon_key}.png`}
          onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
          crossOrigin="anonymous"
          referrerPolicy="no-referrer"
        />
      </span>
      <div className="pn-c-body">
        <div
          className={`pn-c-top${champ.description ? ' pn-c-top--has-desc' : ''}`}
          onClick={champ.description ? () => setShowDesc(s => !s) : undefined}
        >
          <span className="pn-c-name">{champ.name}</span>
          <span className={`pn-tag ${tagClass(type)}`}>
            <TagIcon type={type} />{tagLabel(type)}
          </span>
          {champ.description && (
            <span className="pn-desc-toggle">{descVisible ? '▲' : '▼'}</span>
          )}
        </div>
        {champ.description && descVisible && (
          <p className="pn-desc">{champ.description}</p>
        )}
        <div className="pn-changes">
          {champ.changes.map((c, i) => (
            <ChangeValue
              key={i}
              change={c}
              cardType={type}
              spellIconUrl={c.spell ? spellMap?.[c.spell] : undefined}
            />
          ))}
        </div>
      </div>
    </article>
  )
}

function EntryCard({
  entry, iconUrl, FallbackIcon = IconSword, forceExpandDesc,
}: {
  entry: BaseEntry; iconUrl?: string; FallbackIcon?: React.ElementType; forceExpandDesc?: boolean
}) {
  const type = normalizeType(entry.type)
  const [showDesc, setShowDesc] = useState(false)
  const descVisible = showDesc || !!forceExpandDesc

  return (
    <article className={`pn-card ${type}`}>
      <span className="pn-iico">
        {iconUrl ? (
          <img
            src={iconUrl}
            alt={entry.name}
            width={28} height={28}
            style={{ borderRadius: 4, objectFit: 'contain' }}
            onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
            crossOrigin="anonymous"
            referrerPolicy="no-referrer"
          />
        ) : (
          <FallbackIcon size={22} />
        )}
      </span>
      <div className="pn-c-body">
        <div
          className={`pn-c-top${entry.description ? ' pn-c-top--has-desc' : ''}`}
          onClick={entry.description ? () => setShowDesc(s => !s) : undefined}
        >
          <span className="pn-c-name">{entry.name}</span>
          <span className={`pn-tag ${tagClass(type)}`}>
            <TagIcon type={type} />{tagLabel(type)}
          </span>
          {entry.description && (
            <span className="pn-desc-toggle">{descVisible ? '▲' : '▼'}</span>
          )}
        </div>
        {entry.description && descVisible && (
          <p className="pn-desc">{entry.description}</p>
        )}
        <div className="pn-changes">
          {entry.changes.map((c, i) => (
            <ChangeValue key={i} change={c} cardType={type} />
          ))}
        </div>
      </div>
    </article>
  )
}

function TypeGroup({
  label, items, tagCls, renderCard,
}: {
  label: string; items: (BaseEntry | ChampionEntry)[]; tagCls: string
  renderCard: (entry: BaseEntry | ChampionEntry, i: number) => React.ReactNode
}) {
  if (items.length === 0) return null
  return (
    <>
      <div className="pn-grp pn-rise">
        <span className="pn-grp-name">{label}</span>
        <span className="pn-grp-line" />
        <span className={`pn-grp-count ${tagCls}`}>{items.length}</span>
      </div>
      {items.map((e, i) => renderCard(e, i))}
    </>
  )
}

// ─── Composant principal ───────────────────────────────────────────────────────

export default function PatchCard({ patch, ddragonVersion, forceExpandDesc }: PatchCardProps) {
  const d = patch.summary_jsonb
  const lang = useLang()

  const [itemNameMap, setItemNameMap] = useState<Record<string, string>>({})
  const [runeNameMap, setRuneNameMap] = useState<Record<string, string>>({})
  // spellCache[ddragon_key][slot] → icon URL
  const [spellCache, setSpellCache]   = useState<Record<string, SpellMap>>({})
  // Si la bannière échoue (CORS / hotlink Riot), repli sur le séparateur diamant
  const [bannerError, setBannerError] = useState(false)

  // Chargement item.json + runesReforged.json
  useEffect(() => {
    if (!ddragonVersion) return
    let cancelled = false
    async function loadMaps() {
      try {
        const [iData, rData] = await Promise.all([
          fetch(`${DDN}/cdn/${ddragonVersion}/data/fr_FR/item.json`).then(r => r.json()),
          fetch(`${DDN}/cdn/${ddragonVersion}/data/fr_FR/runesReforged.json`).then(r => r.json()),
        ])
        if (cancelled) return
        const im: Record<string, string> = {}
        Object.values(iData.data as Record<string, unknown>).forEach((raw: unknown) => {
          const r = raw as { name: string; image: { full: string } }
          im[norm(r.name)] = `${DDN}/cdn/${ddragonVersion}/img/item/${r.image.full}`
        })
        const rm: Record<string, string> = {}
        ;(rData as { slots: { runes: { name: string; icon: string }[] }[] }[]).forEach(tree => {
          tree.slots?.forEach(slot => slot.runes?.forEach(rune => {
            rm[norm(rune.name)] = `${DDN}/cdn/img/${rune.icon}`
          }))
        })
        setItemNameMap(im)
        setRuneNameMap(rm)
      } catch { /* fallback Tabler */ }
    }
    loadMaps()
    return () => { cancelled = true }
  }, [ddragonVersion])

  // Chargement des icônes de sorts pour les champions qui en ont besoin
  useEffect(() => {
    if (!ddragonVersion || !d.champions.length) return
    let cancelled = false
    async function loadSpells() {
      // Seulement les champions ayant au moins un changement taggé avec un spell
      const needed = d.champions.filter(ch =>
        ch.changes.some(c => c.spell)
      )
      if (!needed.length) return

      const results = await Promise.allSettled(
        needed.map(async ch => {
          try {
            const res = await fetch(`${DDN}/cdn/${ddragonVersion}/data/fr_FR/champion/${ch.ddragon_key}.json`)
            if (!res.ok) return [ch.ddragon_key, null] as const
            const data = await res.json()
            const cd = data.data[ch.ddragon_key]
            if (!cd) return [ch.ddragon_key, null] as const
            const spells: SpellMap = {
              Q:       `${DDN}/cdn/${ddragonVersion}/img/spell/${cd.spells[0]?.image.full}`,
              W:       `${DDN}/cdn/${ddragonVersion}/img/spell/${cd.spells[1]?.image.full}`,
              E:       `${DDN}/cdn/${ddragonVersion}/img/spell/${cd.spells[2]?.image.full}`,
              R:       `${DDN}/cdn/${ddragonVersion}/img/spell/${cd.spells[3]?.image.full}`,
              passive: `${DDN}/cdn/${ddragonVersion}/img/passive/${cd.passive?.image.full}`,
            }
            return [ch.ddragon_key, spells] as const
          } catch {
            return [ch.ddragon_key, null] as const
          }
        })
      )

      if (cancelled) return
      const cache: Record<string, SpellMap> = {}
      results.forEach(r => {
        if (r.status === 'fulfilled' && r.value[1]) {
          cache[r.value[0]] = r.value[1]
        }
      })
      setSpellCache(cache)
    }
    loadSpells()
    return () => { cancelled = true }
  }, [ddragonVersion, d.champions])

  const champGroups = groupByType(d.champions)
  const itemGroups  = groupByType(d.items)
  const runeGroups  = groupByType(d.runes ?? [])
  const sysGroups   = groupByType(d.systeme)

  return (
    <div className="pn-wrap" style={{ fontFamily: "'Spectral', Georgia, serif" }}>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header>
        <p className="pn-eyebrow pn-rise">Wyrm Forge · Notes de patch</p>
        <h2 className="pn-h1 pn-rise">{patch.title}</h2>
        {d.subtitle && <p className="pn-sub pn-rise">{d.subtitle}</p>}
        <div className="pn-meta pn-rise">
          <span className="pn-chip patch">
            <IconFlame size={13} />Patch {patch.version}
          </span>
          <span className="pn-chip date">
            <IconCalendar size={13} />{formatDate(patch.published_at, lang, FMT_DATE)}
          </span>
        </div>
      </header>

      {/* ── Bannière ou séparateur diamant ──────────────────────────────── */}
      {/* Si image_url définie ET pas d'erreur de chargement : bannière.                 */}
      {/* Sinon (pas d'URL ou CORS/hotlink Riot bloqué) : séparateur diamant.            */}
      {/* Pour éviter les erreurs CORS, héberger les bannières sur Supabase Storage.     */}
      {patch.image_url && !bannerError ? (
        <>
          <div className="pn-thin-rule pn-rise" />
          <div className="pn-banner pn-rise">
            <img
              src={patch.image_url}
              alt={`Bannière patch ${patch.version}`}
              crossOrigin="anonymous"
              onError={() => setBannerError(true)}
            />
          </div>
          <div className="pn-thin-rule pn-rise" />
        </>
      ) : (
        <div className="pn-rule pn-rise">
          <span className="pn-rule-icon"><IconDiamonds size={18} /></span>
        </div>
      )}

      {/* ── Compteurs ───────────────────────────────────────────────────── */}
      <section className="pn-stat-grid pn-rise">
        <div className="pn-stat">
          <div className="pn-stat-n">{d.counts.champions}</div>
          <div className="pn-stat-l">Champions</div>
        </div>
        <div className="pn-stat">
          <div className="pn-stat-n">{d.counts.items}</div>
          <div className="pn-stat-l">Items</div>
        </div>
        <div className="pn-stat">
          <div className="pn-stat-n">{d.counts.runes ?? 0}</div>
          <div className="pn-stat-l">Runes</div>
        </div>
        <div className="pn-stat">
          <div className="pn-stat-n">{d.counts.systeme}</div>
          <div className="pn-stat-l">Système</div>
        </div>
      </section>

      {/* ── Faits marquants ─────────────────────────────────────────────── */}
      {d.highlights.length > 0 && (
        <section className="pn-highlights pn-rise">
          <h3 className="pn-highlights-title">
            <span className="pn-highlights-title-icon"><IconSparkles size={16} /></span>
            Faits marquants
          </h3>
          <ul>
            {d.highlights.map((h, i) => <li key={i}>{h}</li>)}
          </ul>
        </section>
      )}

      {/* ── Champions ───────────────────────────────────────────────────── */}
      {d.champions.length > 0 && (
        <>
          <h2 className="pn-h2 pn-rise">Champions</h2>
          <TypeGroup label="Buffs"       items={champGroups.buffs}       tagCls="t-buff"   renderCard={(e, i) => <ChampionCard key={i} champ={e as ChampionEntry} ddragonVersion={ddragonVersion} spellMap={spellCache[(e as ChampionEntry).ddragon_key]} forceExpandDesc={forceExpandDesc} />} />
          <TypeGroup label="Nerfs"       items={champGroups.nerfs}       tagCls="t-nerf"   renderCard={(e, i) => <ChampionCard key={i} champ={e as ChampionEntry} ddragonVersion={ddragonVersion} spellMap={spellCache[(e as ChampionEntry).ddragon_key]} forceExpandDesc={forceExpandDesc} />} />
          <TypeGroup label="Ajustements" items={champGroups.ajustements} tagCls="t-adj"    renderCard={(e, i) => <ChampionCard key={i} champ={e as ChampionEntry} ddragonVersion={ddragonVersion} spellMap={spellCache[(e as ChampionEntry).ddragon_key]} forceExpandDesc={forceExpandDesc} />} />
          <TypeGroup label="Refontes"    items={champGroups.refontes}    tagCls="t-rework" renderCard={(e, i) => <ChampionCard key={i} champ={e as ChampionEntry} ddragonVersion={ddragonVersion} spellMap={spellCache[(e as ChampionEntry).ddragon_key]} forceExpandDesc={forceExpandDesc} />} />
        </>
      )}

      {/* ── Items ───────────────────────────────────────────────────────── */}
      {d.items.length > 0 && (
        <>
          <h2 className="pn-h2 pn-rise">Items</h2>
          <TypeGroup label="Buffs"       items={itemGroups.buffs}       tagCls="t-buff"   renderCard={(e, i) => { const it = e as BaseEntry; const u = it.ddragon_id ? `${DDN}/cdn/${ddragonVersion}/img/item/${it.ddragon_id}.png` : itemNameMap[norm(it.name)]; return <EntryCard key={i} entry={it} iconUrl={u} forceExpandDesc={forceExpandDesc} /> }} />
          <TypeGroup label="Nerfs"       items={itemGroups.nerfs}       tagCls="t-nerf"   renderCard={(e, i) => { const it = e as BaseEntry; const u = it.ddragon_id ? `${DDN}/cdn/${ddragonVersion}/img/item/${it.ddragon_id}.png` : itemNameMap[norm(it.name)]; return <EntryCard key={i} entry={it} iconUrl={u} forceExpandDesc={forceExpandDesc} /> }} />
          <TypeGroup label="Ajustements" items={itemGroups.ajustements} tagCls="t-adj"    renderCard={(e, i) => { const it = e as BaseEntry; const u = it.ddragon_id ? `${DDN}/cdn/${ddragonVersion}/img/item/${it.ddragon_id}.png` : itemNameMap[norm(it.name)]; return <EntryCard key={i} entry={it} iconUrl={u} forceExpandDesc={forceExpandDesc} /> }} />
          <TypeGroup label="Refontes"    items={itemGroups.refontes}    tagCls="t-rework" renderCard={(e, i) => { const it = e as BaseEntry; const u = it.ddragon_id ? `${DDN}/cdn/${ddragonVersion}/img/item/${it.ddragon_id}.png` : itemNameMap[norm(it.name)]; return <EntryCard key={i} entry={it} iconUrl={u} forceExpandDesc={forceExpandDesc} /> }} />
        </>
      )}

      {/* ── Runes ───────────────────────────────────────────────────────── */}
      {(d.runes ?? []).length > 0 && (
        <>
          <h2 className="pn-h2 pn-rise">Runes</h2>
          {/* icon_url attachée par le backend au moment de la classification —
              fallback runeNameMap (re-matching fr_FR) si absent (ancien patch) */}
          <TypeGroup label="Buffs"       items={runeGroups.buffs}       tagCls="t-buff"   renderCard={(e, i) => { const r = e as BaseEntry; return <EntryCard key={i} entry={r} iconUrl={r.icon_url ?? runeNameMap[norm(r.name)]} FallbackIcon={IconSparkles} forceExpandDesc={forceExpandDesc} /> }} />
          <TypeGroup label="Nerfs"       items={runeGroups.nerfs}       tagCls="t-nerf"   renderCard={(e, i) => { const r = e as BaseEntry; return <EntryCard key={i} entry={r} iconUrl={r.icon_url ?? runeNameMap[norm(r.name)]} FallbackIcon={IconSparkles} forceExpandDesc={forceExpandDesc} /> }} />
          <TypeGroup label="Ajustements" items={runeGroups.ajustements} tagCls="t-adj"    renderCard={(e, i) => { const r = e as BaseEntry; return <EntryCard key={i} entry={r} iconUrl={r.icon_url ?? runeNameMap[norm(r.name)]} FallbackIcon={IconSparkles} forceExpandDesc={forceExpandDesc} /> }} />
          <TypeGroup label="Refontes"    items={runeGroups.refontes}    tagCls="t-rework" renderCard={(e, i) => { const r = e as BaseEntry; return <EntryCard key={i} entry={r} iconUrl={r.icon_url ?? runeNameMap[norm(r.name)]} FallbackIcon={IconSparkles} forceExpandDesc={forceExpandDesc} /> }} />
        </>
      )}

      {/* ── Système ─────────────────────────────────────────────────────── */}
      {d.systeme.length > 0 && (
        <>
          <h2 className="pn-h2 pn-rise">Système</h2>
          <TypeGroup label="Buffs"       items={sysGroups.buffs}       tagCls="t-buff"   renderCard={(e, i) => <EntryCard key={i} entry={e as BaseEntry} FallbackIcon={IconSettings} forceExpandDesc={forceExpandDesc} />} />
          <TypeGroup label="Nerfs"       items={sysGroups.nerfs}       tagCls="t-nerf"   renderCard={(e, i) => <EntryCard key={i} entry={e as BaseEntry} FallbackIcon={IconSettings} forceExpandDesc={forceExpandDesc} />} />
          <TypeGroup label="Ajustements" items={sysGroups.ajustements} tagCls="t-adj"    renderCard={(e, i) => <EntryCard key={i} entry={e as BaseEntry} FallbackIcon={IconSettings} forceExpandDesc={forceExpandDesc} />} />
          <TypeGroup label="Refontes"    items={sysGroups.refontes}    tagCls="t-rework" renderCard={(e, i) => <EntryCard key={i} entry={e as BaseEntry} FallbackIcon={IconSettings} forceExpandDesc={forceExpandDesc} />} />
        </>
      )}

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer className="pn-footer pn-rise">
        Source : Riot Games · résumé reformulé par Wyrm Forge.
        Icônes via{' '}
        <a href="https://developer.riotgames.com/docs/lol#data-dragon" target="_blank" rel="noreferrer">
          Data Dragon
        </a>.
      </footer>
    </div>
  )
}
