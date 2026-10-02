// ════════════════════════════════════════════════════════════════════════════
//  guide — STRUCTURE de la page `/guide` : ordre, ancres et feature flags
// ════════════════════════════════════════════════════════════════════════════
// Module PUR (aucun import React, aucun `@/`), même convention que
// `lang-param.ts` et `live-game.ts` : c'est ici que vit la règle « quelle
// sous-section est visible », donc c'est ici qu'elle se teste, sans jsdom.
//
// Le TEXTE vit dans `src/locales/guide.ts`, apparié par `id`. Ce fichier ne porte
// que du technique : identifiants (= ancres HTML, donc stables et identiques en
// FR et en EN), rattachement aux flags, et regroupement.
//
// 🔴 RÈGLE DE CONTENU : n'entre ici que ce qui est LIVE en prod pour un joueur.
// Rien de futur, de « bientôt », de flag de lancement fermé ou de retiré. La
// liste de ce qui a été exclu, et pourquoi, est dans la PR du chantier guide.

import { readFlag } from './feature-flags'

/** Rattachement d'une sous-section aux flags du catalogue `app_settings`. */
export interface GuideFlags {
  /** Visible seulement si TOUS ces flags sont actifs. */
  all?: readonly string[]
  /** Visible si AU MOINS UN de ces flags est actif. */
  any?: readonly string[]
}

export interface GuideEntryDef {
  /** Ancre HTML et clé du dictionnaire. */
  id: GuideEntryId
  /** Absent = toujours visible (décision du 2026-10-02 : sans flag, pas de masquage). */
  flags?: GuideFlags
  /**
   * Flag qui ne masque PAS la sous-section mais seulement sa partie IA
   * (`aiSteps` du dico) et la mention des crédits dans le palier. Cas du
   * Match Up : coupé, la comparaison de stats reste disponible (`off_behavior`
   * = 'degraded' dans le catalogue).
   */
  aiFlag?: string
}

export interface GuideGroupDef {
  /** Ancre HTML du groupe et clé de son titre dans le dico. */
  id: GuideGroupId
  entries: readonly GuideEntryDef[]
}

export interface GuideSectionDef {
  id: GuideSectionId
  /**
   * Bloc d'introduction de la section (sous-section à part entière, avec son
   * ancre) — l'overlay pour la section app.
   */
  intro?: GuideEntryDef
  groups?: readonly GuideGroupDef[]
  entries: readonly GuideEntryDef[]
}

export const GUIDE_SECTION_IDS = ['commun', 'site', 'app'] as const
export type GuideSectionId = (typeof GUIDE_SECTION_IDS)[number]

export const GUIDE_GROUP_IDS = ['objectifs', 'combat', 'jungle', 'suivi', 'avant-partie'] as const
export type GuideGroupId = (typeof GUIDE_GROUP_IDS)[number]

export const GUIDE_ENTRY_IDS = [
  // Commun
  'builds', 'champions', 'patch-notes', 'partie-en-direct', 'match-up',
  'workshop-builds', 'workshop-jungle', 'historique-parties',
  // Site
  'recherche-joueur', 'liaison-riot', 'historique-stats', 'bilan-ia',
  'todo-site', 'accueil-dashboard',
  // App
  'overlay',
  'timers-objectifs', 'timers-inhibiteurs',
  'sorts-ennemis', 'gold-diff', 'degats-sorts', 'comeback', 'conseils-objets',
  'parcours-jungle', 'calibrage-minimap',
  'build-en-jeu', 'panneau-stats', 'todo-en-jeu',
  'conseiller-champ-select', 'runes-auto', 'sets-objets',
  'comparaison-rang', 'mises-a-jour',
] as const
export type GuideEntryId = (typeof GUIDE_ENTRY_IDS)[number]

export const GUIDE_STRUCTURE: readonly GuideSectionDef[] = [
  {
    id: 'commun',
    entries: [
      { id: 'builds' },
      { id: 'champions' },
      { id: 'patch-notes',        flags: { all: ['patch_notes_enabled'] } },
      { id: 'partie-en-direct',   flags: { all: ['live_game_enabled'] } },
      { id: 'match-up',           aiFlag: 'matchup_ai_enabled' },
      { id: 'workshop-builds',    flags: { all: ['workshop_builds_enabled'] } },
      { id: 'workshop-jungle',    flags: { all: ['workshop_jungle_enabled'] } },
      { id: 'historique-parties', flags: { all: ['riot_history_enabled'] } },
    ],
  },
  {
    id: 'site',
    entries: [
      // La recherche publique passe par les pages /matches, /summoner, /match,
      // gardées par `player_search_enabled`, et lit l'historique Riot.
      { id: 'recherche-joueur',  flags: { all: ['player_search_enabled', 'riot_history_enabled'] } },
      { id: 'liaison-riot',      flags: { all: ['riot_link_enabled'] } },
      { id: 'historique-stats',  flags: { all: ['riot_history_enabled'] } },
      { id: 'bilan-ia',          flags: { all: ['postgame_ai_enabled'] } },
      { id: 'todo-site' },
      { id: 'accueil-dashboard' },
    ],
  },
  {
    id: 'app',
    // `overlay_enabled` est le PARENT des 18 flags `overlay_show_*` : coupé, la
    // résolution des parents (`resolveFlags`) éteint aussi tous les blocs
    // ci-dessous — l'introduction et les groupes disparaissent ensemble.
    intro: { id: 'overlay', flags: { all: ['overlay_enabled'] } },
    groups: [
      {
        id: 'objectifs',
        entries: [
          { id: 'timers-objectifs',   flags: { all: ['overlay_show_objective_timers'] } },
          { id: 'timers-inhibiteurs', flags: { all: ['overlay_show_inhib_timers'] } },
        ],
      },
      {
        id: 'combat',
        entries: [
          { id: 'sorts-ennemis', flags: { all: ['overlay_show_enemy_tracker'] } },
          { id: 'gold-diff',     flags: { all: ['overlay_show_gold_diff'] } },
          { id: 'degats-sorts',  flags: { all: ['overlay_show_spell_damage'] } },
          { id: 'comeback',      flags: { all: ['overlay_show_comeback_panel'] } },
          // Le bouton 💡 n'a pas de flag propre, mais il vit DANS l'overlay :
          // overlay coupé, il n'existe plus. Le maître est donc sa seule garde.
          { id: 'conseils-objets', flags: { all: ['overlay_enabled'] } },
        ],
      },
      {
        id: 'jungle',
        entries: [
          { id: 'parcours-jungle',   flags: { any: ['overlay_show_path_minimap', 'overlay_show_path_list'] } },
          { id: 'calibrage-minimap', flags: { all: ['minimap_detection_enabled'] } },
        ],
      },
      {
        id: 'suivi',
        entries: [
          { id: 'build-en-jeu',  flags: { all: ['overlay_show_item_build'] } },
          { id: 'panneau-stats', flags: { all: ['overlay_show_stats_panel'] } },
          { id: 'todo-en-jeu',   flags: { all: ['overlay_show_todo_panel'] } },
        ],
      },
      {
        id: 'avant-partie',
        entries: [
          { id: 'conseiller-champ-select', flags: { all: ['champ_select_advisor_enabled'] } },
          { id: 'runes-auto',              flags: { all: ['rune_page_apply_enabled'] } },
          { id: 'sets-objets',             flags: { all: ['item_set_export_enabled'] } },
        ],
      },
    ],
    entries: [
      { id: 'comparaison-rang' },
      { id: 'mises-a-jour' },
    ],
  },
]

/** Toutes les clés de flag lues par le guide — ce que la page demande au serveur. */
export function guideFlagKeys(structure: readonly GuideSectionDef[] = GUIDE_STRUCTURE): string[] {
  const keys = new Set<string>()
  const add = (e: GuideEntryDef) => {
    e.flags?.all?.forEach(k => keys.add(k))
    e.flags?.any?.forEach(k => keys.add(k))
    if (e.aiFlag) keys.add(e.aiFlag)
  }
  for (const s of structure) {
    if (s.intro) add(s.intro)
    s.groups?.forEach(g => g.entries.forEach(add))
    s.entries.forEach(add)
  }
  return [...keys].sort()
}

/**
 * Une sous-section est-elle visible ? `flags` est la map RÉSOLUE (parents
 * appliqués) ; une clé absente prend son repli asymétrique via `readFlag` —
 * kill switch ouvert, flag de lancement fermé.
 */
export function isEntryVisible(entry: GuideEntryDef, flags: Record<string, boolean>): boolean {
  const { all, any } = entry.flags ?? {}
  if (all && !all.every(k => readFlag(flags, k))) return false
  if (any && any.length > 0 && !any.some(k => readFlag(flags, k))) return false
  return true
}

/** Une sous-section telle que la page la rend : `showAi` déjà tranché. */
export interface VisibleGuideEntry {
  id: GuideEntryId
  showAi: boolean
}

export interface VisibleGuideSection {
  id: GuideSectionId
  intro?: VisibleGuideEntry
  groups: { id: GuideGroupId; entries: VisibleGuideEntry[] }[]
  entries: VisibleGuideEntry[]
}

/**
 * Le guide filtré par les flags — la SEULE source du sommaire ET du contenu, pour
 * qu'une sous-section masquée ne puisse pas laisser une entrée de sommaire
 * orpheline (ancre morte). Un groupe vidé disparaît ; une section vidée aussi.
 */
export function visibleGuide(
  flags: Record<string, boolean>,
  structure: readonly GuideSectionDef[] = GUIDE_STRUCTURE,
): VisibleGuideSection[] {
  const keep = (e: GuideEntryDef): VisibleGuideEntry | null =>
    isEntryVisible(e, flags)
      ? { id: e.id, showAi: e.aiFlag ? readFlag(flags, e.aiFlag) : false }
      : null
  const keepAll = (list: readonly GuideEntryDef[]) =>
    list.map(keep).filter((e): e is VisibleGuideEntry => e !== null)

  const out: VisibleGuideSection[] = []
  for (const s of structure) {
    const intro = s.intro ? keep(s.intro) ?? undefined : undefined
    const groups = (s.groups ?? [])
      .map(g => ({ id: g.id, entries: keepAll(g.entries) }))
      .filter(g => g.entries.length > 0)
    const entries = keepAll(s.entries)
    if (!intro && groups.length === 0 && entries.length === 0) continue
    out.push({ id: s.id, intro, groups, entries })
  }
  return out
}
