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
