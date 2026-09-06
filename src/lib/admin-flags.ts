import type { Lang } from '@/locales/landing'

/**
 * Panneau admin des feature flags — logique PURE, sans dépendance React.
 *
 * Même partage des rôles que `lib/feature-flags.ts` : tout ce qui DÉCIDE vit ici
 * et se teste sans DOM, `AdminTab` ne porte que le rendu. C'est ce qui rend
 * vérifiables les quatre propriétés qui comptent vraiment dans ce panneau — le
 * partitionnement du catalogue, le refus d'une coupure sans motif, le verrouillage
 * des enfants d'overlay, et le bandeau d'alerte.
 */

/** Une ligne du catalogue `app_settings`, telle que la lit l'admin (`select *`). */
export interface FlagCatalogueRow {
  key: string
  value: string
  kind: 'setting' | 'launch' | 'kill'
  surface: 'web' | 'app' | 'shared' | null
  group_key: string | null
  parent_key: string | null
  off_behavior: 'hidden' | 'notice' | 'degraded' | null
  label_fr: string | null
  label_en: string | null
  desc_fr: string | null
  desc_en: string | null
  sort_order: number
  reason: string | null
  updated_at: string | null
  updated_by: string | null
}

/** Clé du flag maître de l'overlay — sa sous-section est traitée à part. */
export const OVERLAY_MASTER_KEY = 'overlay_enabled'

/** Un flag est-il actif ? La valeur est un TEXT en base, jamais un booléen. */
export const isOn = (row: FlagCatalogueRow): boolean => row.value === 'true'

/** Libellé dans la langue courante, avec repli sur la clé si la base ment. */
export function flagLabel(row: FlagCatalogueRow, lang: Lang): string {
  const label = lang === 'en' ? row.label_en : row.label_fr
  // La contrainte `app_settings_flag_metadata_complete` garantit la présence des
  // libellés — ce repli couvre le seul cas restant : une ligne insérée en
  // service_role avant que la contrainte n'existe. La clé reste LISIBLE, ce qui
  // vaut mieux qu'un interrupteur muet.
  return label?.trim() || row.key
}

/** Description dans la langue courante. Chaîne vide plutôt que `undefined`. */
export function flagDescription(row: FlagCatalogueRow, lang: Lang): string {
  return ((lang === 'en' ? row.desc_en : row.desc_fr) ?? '').trim()
}

/**
 * Ordre d'affichage : `group_key` puis `sort_order`.
 *
 * Le tri est fait CÔTÉ CLIENT en plus du `ORDER BY` de la requête. Ce n'est pas
 * de la redondance décorative : le partitionnement ci-dessous redistribue les
 * lignes dans trois listes, et rien ne garantirait leur ordre relatif après coup
 * si on se reposait sur celui de la réponse.
 */
export function byGroupThenOrder(a: FlagCatalogueRow, b: FlagCatalogueRow): number {
  const ga = a.group_key ?? ''
  const gb = b.group_key ?? ''
  if (ga !== gb) return ga.localeCompare(gb)
  if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order
  return a.key.localeCompare(b.key)
}

/** Les quatre listes que le panneau rend, dérivées du catalogue brut. */
export interface CataloguePartition {
  /** Catégorie 1 — flags de lancement, section « Lancements ». */
  launch: FlagCatalogueRow[]
  /** Catégorie 2 — kill switches, HORS overlay. */
  kill: FlagCatalogueRow[]
  /** Le maître de l'overlay, ou `null` s'il n'est pas dans le catalogue. */
  overlayMaster: FlagCatalogueRow | null
  /** Les 18 enfants, indentés sous le maître. */
  overlayChildren: FlagCatalogueRow[]
}

/**
 * Répartit le catalogue dans les sections du panneau.
 *
 * ⚠️ L'appartenance à l'overlay se lit sur `parent_key`, PAS sur un préfixe de
 * clé. Un test de préfixe (`key.startsWith('overlay_')`) marcherait aujourd'hui
 * et se romprait au premier flag nommé autrement — alors que `parent_key` EST la
 * relation, telle que la base la porte. C'est aussi ce qui fait que la
 * sous-section suivra d'elle-même un 19ᵉ enfant ajouté par un simple INSERT.
 *
 * Les lignes `kind='setting'` sont écartées : elles ne sont pas des flags et ne
 * doivent apparaître dans aucune des deux sections (`patch_auto_publish` garde
 * son interrupteur dédié dans la carte Patch notes).
 */
export function partitionCatalogue(rows: readonly FlagCatalogueRow[]): CataloguePartition {
  const flags = rows.filter(r => r.kind === 'launch' || r.kind === 'kill')

  const overlayMaster = flags.find(r => r.key === OVERLAY_MASTER_KEY) ?? null
  const overlayChildren = flags
    .filter(r => r.parent_key === OVERLAY_MASTER_KEY)
    .sort(byGroupThenOrder)

  const launch = flags
    .filter(r => r.kind === 'launch')
    .sort(byGroupThenOrder)

  const kill = flags
    .filter(r =>
      r.kind === 'kill' &&
      r.key !== OVERLAY_MASTER_KEY &&
      r.parent_key !== OVERLAY_MASTER_KEY)
    .sort(byGroupThenOrder)

  return { launch, kill, overlayMaster, overlayChildren }
}

/**
 * Kill switches actuellement COUPÉS — alimente le bandeau d'alerte permanent.
 *
 * Volontairement calculé sur le catalogue ENTIER, overlay compris : un bloc
 * d'overlay coupé et oublié est exactement le genre de coupure que le bandeau
 * existe pour rappeler.
 *
 * Les flags de LANCEMENT en sont exclus : un flag de lancement à `false` est
 * l'état NORMAL d'une feature pas encore ouverte, pas un incident. Les faire
 * figurer noierait les vraies coupures sous cinq lignes permanentes — le bandeau
 * ne serait plus lu au bout d'une semaine.
 */
export function cutKillSwitches(rows: readonly FlagCatalogueRow[]): FlagCatalogueRow[] {
  return rows.filter(r => r.kind === 'kill' && !isOn(r)).sort(byGroupThenOrder)
}

/**
 * Une coupure peut-elle être confirmée ? Le motif est OBLIGATOIRE.
 *
 * ⚠️ C'est la garde de l'exigence « un flag coupé à 2h du matin doit être
 * explicable à 9h ». Elle est ici, dans une fonction pure, et pas seulement dans
 * un `disabled` de bouton : `AdminTab` la rappelle AUSSI avant d'envoyer l'update,
 * pour qu'un bouton réactivé par les outils de développement ne suffise pas à
 * écrire une coupure sans motif.
 */
export function canSubmitCut(reason: string): boolean {
  return reason.trim().length > 0
}

/**
 * Un flag enfant doit-il être verrouillé parce que son maître est coupé ?
 *
 * Reprend la grammaire visuelle de l'onglet Overlay de l'app WPF, où décocher le
 * toggle maître grise tout le bloc qu'il commande : l'admin et l'utilisateur
 * final voient la même chose, ce qui était le point de l'architecture validée.
 *
 * Le maître ABSENT du catalogue ne verrouille rien — on ne bloque pas l'admin
 * sur une donnée manquante.
 */
export function isChildLocked(master: FlagCatalogueRow | null): boolean {
  return master !== null && !isOn(master)
}

/**
 * Clé de dico décrivant ce que verra l'utilisateur si le flag est coupé.
 *
 * Dérivée d'`off_behavior`, affichée AVANT la bascule : l'admin doit savoir ce
 * qu'il casse avant de cliquer, pas après.
 */
export type OffBehaviorKey = 'hidden' | 'notice' | 'degraded'

export function offBehaviorKey(row: FlagCatalogueRow): OffBehaviorKey {
  // 'notice' est le défaut du catalogue pour un kill switch, et le repli le plus
  // sûr à afficher : il décrit le comportement le moins destructeur.
  return row.off_behavior ?? 'notice'
}

/**
 * Durée écoulée, en français/anglais, sous la forme « il y a 12 min ».
 *
 * `Intl.RelativeTimeFormat` plutôt qu'un gabarit maison : les deux langues du
 * site y sont gérées, y compris les pluriels, et c'est déjà l'approche de
 * `lib/intl.ts` pour les dates et les nombres.
 *
 * Renvoie `null` sur une date absente ou illisible — l'appelant omet alors la
 * mention plutôt que d'afficher « il y a NaN ».
 */
export function relativeTime(iso: string | null, lang: Lang, now: Date = new Date()): string | null {
  if (!iso) return null
  const then = new Date(iso)
  if (Number.isNaN(then.getTime())) return null

  const seconds = Math.round((then.getTime() - now.getTime()) / 1000)
  const rtf = new Intl.RelativeTimeFormat(lang === 'en' ? 'en-GB' : 'fr-FR', { numeric: 'auto' })

  const steps: [Intl.RelativeTimeFormatUnit, number][] = [
    ['second', 60],
    ['minute', 60],
    ['hour', 24],
    ['day', 30],
    ['month', 12],
  ]

  let value = seconds
  for (const [unit, size] of steps) {
    if (Math.abs(value) < size) return rtf.format(value, unit)
    value = Math.round(value / size)
  }
  return rtf.format(value, 'year')
}

/* ════════════════════════════════════════════════════════════════════════════
 *  REGROUPEMENT DES KILL SWITCHES PAR SURFACE
 * ════════════════════════════════════════════════════════════════════════════ */

/**
 * Ordre d'affichage des sous-groupes de la section « Kill switches ».
 *
 * `shared` en dernier, et non au milieu : les deux premiers groupes répondent à
 * « qu'est-ce que je casse chez qui », le troisième est le cas qui casse
 * partout. Le lire en dernier évite de le confondre avec l'un des deux autres.
 */
export const SURFACE_ORDER = ['web', 'app', 'shared'] as const

export type SurfaceKey = typeof SURFACE_ORDER[number]

/**
 * Surface ouverte par défaut dans la section Kill switches.
 *
 * `web` plutôt que `shared` : le panneau est administré depuis le site, et une
 * coupure côté site est celle que l'admin constate lui-même en premier. Le
 * bandeau de coupures reste global, donc ce défaut ne cache jamais un incident
 * survenu sur une autre surface — il choisit seulement par où commencer.
 */
export const DEFAULT_KILL_SURFACE: SurfaceKey = 'web'

/**
 * Surface d'affichage d'un flag.
 *
 * ⚠️ Une surface absente retombe sur `shared` plutôt que d'être écartée. La
 * contrainte `app_settings_flag_metadata_complete` rend ce cas inatteignable
 * (tout `kind <> 'setting'` a une surface), mais si elle venait à être
 * contournée, un flag SANS groupe disparaîtrait du panneau — donc un kill
 * switch qu'on ne pourrait plus couper. Mieux vaut le montrer dans le groupe le
 * plus large que le perdre.
 */
export function surfaceOf(row: FlagCatalogueRow): SurfaceKey {
  return row.surface === 'web' || row.surface === 'app' ? row.surface : 'shared'
}

export type KillBySurface = Record<SurfaceKey, FlagCatalogueRow[]>

/**
 * Répartit les kill switches en trois groupes DISJOINTS.
 *
 * ⚠️ `shared` est un groupe à part entière, pas une duplication dans « Site » et
 * dans « App ». Une même clé rendue deux fois donnerait deux interrupteurs pour
 * une seule ligne en base : deux contrôles d'apparence indépendante pour une
 * valeur unique, et un décompte de coupures qui compterait double. La base
 * modélise la surface comme UNE valeur, l'écran la reflète telle quelle.
 *
 * L'ordre interne de chaque groupe est celui reçu — `partitionCatalogue` a déjà
 * trié par (group_key, sort_order).
 */
export function groupKillBySurface(kill: readonly FlagCatalogueRow[]): KillBySurface {
  const out: KillBySurface = { web: [], app: [], shared: [] }
  for (const row of kill) out[surfaceOf(row)].push(row)
  return out
}

/* ════════════════════════════════════════════════════════════════════════════
 *  LANCEMENT D'UNE FEATURE — transition launch → kill
 * ════════════════════════════════════════════════════════════════════════════ */

/**
 * Un flag attend-il son lancement ?
 *
 * Le test porte sur `kind`, PAS sur `kind === 'launch' && !isOn(row)`. Un flag
 * `launch` déjà à `true` est un état hérité de l'ancien interrupteur réversible :
 * le masquer laisserait ce flag bloqué à mi-chemin, visible nulle part et
 * impossible à faire passer en kill switch. Il garde donc son bouton, qui
 * termine la transition.
 */
export function isPendingLaunch(row: FlagCatalogueRow): boolean {
  return row.kind === 'launch'
}

/**
 * Ce qui est écrit en base pour lancer une feature — UNE SEULE écriture.
 *
 * ⚠️ `value` et `kind` partent ENSEMBLE, dans le même UPDATE. Les séparer en
 * deux requêtes ouvrirait une fenêtre où le flag serait soit ouvert au public en
 * étant encore catalogué comme lancement (donc absent de la section qui permet
 * de le couper), soit catalogué en kill switch alors qu'il est encore fermé. Les
 * deux états sont incohérents et le second est un kill switch fantôme.
 *
 * `reason` est remis à `null` : cette colonne est le MOTIF DE COUPURE, relu tel
 * quel par la carte d'un flag coupé. Y écrire une note de lancement afficherait
 * « Motif : … » avec le texte d'une mise en ligne le jour d'un incident. C'est
 * aussi pourquoi la modale de lancement ne propose aucun champ de motif.
 */
export interface LaunchPatch {
  value: 'true'
  kind: 'kill'
  reason: null
}

export function launchPatch(): LaunchPatch {
  return { value: 'true', kind: 'kill', reason: null }
}

/**
 * Applique le lancement à une ligne, pour la mise à jour optimiste du panneau.
 *
 * ⚠️ `off_behavior` n'est PAS touché : le flag garde la convention de coupure
 * déjà posée en base par la migration de catalogue. Les cinq flags de lancement
 * actuels portent tous `hidden` (vérifié en base) — aucun n'est `NULL`, la
 * contrainte de métadonnées complètes reste donc satisfaite après transition.
 */
export function applyLaunch(row: FlagCatalogueRow): FlagCatalogueRow {
  return { ...row, ...launchPatch() }
}
