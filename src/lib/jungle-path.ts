/**
 * Jungle paths — module PUR, partagé par l'onglet « Jungle Path » du site et testé
 * sans navigateur (`jungle-path.test.ts`).
 *
 * Le format est celui de l'APP WPF, au caractère près : c'est le contrat JSONB de la
 * table `jungle_paths` (migration 20261018000001, § table `jungle_paths` d'AGENTS.md).
 * Le modèle C# miroir est `Logiciel-Assistant-LOL/Models/JunglePath.cs`, sérialisé par
 * System.Text.Json avec ses options par défaut :
 *   - clés en PascalCase (`Type`, `X`, `HasSmite`…) — une clé en camelCase serait
 *     IGNORÉE sans erreur par l'app (`x` relu comme 0) ;
 *   - `Type` en ENTIER — une chaîne (`"Ward"`) ferait échouer la lecture du fichier
 *     local ENTIER de l'app, et la base la refuse (23514) ;
 *   - coordonnées NORMALISÉES 0–1 du fond `map11` 16.20.1 (même image côté site et
 *     côté app). Le site dessine en 0–100 % (viewBox SVG) et convertit ici.
 *
 * 🔴 ALLER-RETOUR SANS PERTE. Un path créé dans l'app peut contenir ce que le site ne
 * sait ni afficher ni éditer : sorts (`Label` « Spell:… »), éléments de type Stroke,
 * types inconnus, points glissés hors du cadre, clés que l'app ajoutera demain. Le site
 * garde ces objets TELS QUELS — mêmes clés, mêmes valeurs, même ordre — et ne réécrit
 * que ce qu'il crée lui-même. D'où deux règles :
 *   - la lecture ne « normalise » rien (pas d'`Order: -1` ajouté, pas de clamp) ;
 *   - le bornage 0–1 et l'arrondi à 4 décimales ne s'appliquent qu'aux coordonnées que
 *     le SITE produit (`toNormalized`).
 *
 * Imports relatifs uniquement (convention des modules purs, cf. vitest.config.ts).
 */

/* ── Types d'éléments — `PathElementType` de l'app, valeurs FIGÉES ──────────────── */

export const ELEMENT_TYPE = {
  Camp: 0,
  Smite: 1,
  Ward: 2,
  Invade: 3,
  Gank: 4,
  Stroke: 5,
  Spell: 6,
} as const

/** Marqueurs que le site sait poser. Le nom EST le `Label` écrit (comme dans l'app). */
export type PlacementType = 'Smite' | 'Ward' | 'Invade' | 'Gank'
export const PLACEMENT_TYPES: readonly PlacementType[] = ['Smite', 'Ward', 'Invade', 'Gank']

/** Types que le site édite (pose, gomme, « Tout effacer »). Tout le reste est conservé. */
const EDITABLE_TYPES: ReadonlySet<number> = new Set([
  ELEMENT_TYPE.Camp, ELEMENT_TYPE.Smite, ELEMENT_TYPE.Ward, ELEMENT_TYPE.Invade, ELEMENT_TYPE.Gank,
])

/* ── Modèle — miroir de Models/JunglePath.cs ──────────────────────────────────── */

/**
 * `PathElement` de l'app. Les champs optionnels le sont parce qu'une ligne valide pour
 * la base peut les omettre (l'app relit alors ses défauts) : la lecture ne les ajoute
 * pas, pour ne rien changer à un path qu'on ne fait que rouvrir. La signature d'index
 * porte les clés inconnues, conservées telles quelles.
 */
export interface PathElement {
  Type: number
  X: number
  Y: number
  Label?: string
  /** Ordre de passage des CAMPS (1, 2…) ; -1 ou absent = non ordonné. */
  Order?: number
  HasSmite?: boolean
  [extra: string]: unknown
}

export interface PathPoint {
  X: number
  Y: number
  [extra: string]: unknown
}

export interface PathStroke {
  Points: PathPoint[]
  Color?: string
  Thickness?: number
  [extra: string]: unknown
}

/** `JunglePath.Side` — valeurs de l'app, casse comprise (CHECK en base). */
export type PathSide = 'Blue' | 'Red'

/** Ligne de `public.jungle_paths` telle que PostgREST la renvoie (JSONB casté, non sûr). */
export interface JunglePathRow {
  id: string
  user_id?: string
  name: string
  champion: string | null
  side: string | null
  elements: unknown
  strokes: unknown
  creator: string | null
  is_from_workshop: boolean | null
  created_at: string | null
  updated_at?: string | null
}

/** Path en cours d'édition dans l'onglet. */
export interface JunglePathDraft {
  id: string
  name: string
  champion: string
  side: PathSide
  elements: PathElement[]
  strokes: PathStroke[]
  /** Conservés sans être édités : l'app les écrit pour un path importé du Workshop. */
  creator: string
  isFromWorkshop: boolean
  /** Fourni par la base ; jamais réécrit par le site. */
  createdAt: string | null
}

/** Ce que le site envoie à la base. Ni `user_id` (défaut `auth.uid()`) ni `created_at`. */
export interface JunglePathWrite {
  id: string
  name: string
  champion: string
  side: PathSide
  elements: PathElement[]
  strokes: PathStroke[]
  creator: string
  is_from_workshop: boolean
}

/* ── Positions des camps ──────────────────────────────────────────────────────── */

/** Camps de jungle, dans l'ordre de l'éditeur de l'app. Clé du dictionnaire du site. */
export type CampBase = 'BlueBuff' | 'Gromp' | 'Wolves' | 'Raptors' | 'RedBuff' | 'Krugs' | 'Scuttler'
export const CAMP_BASES: readonly CampBase[] = [
  'BlueBuff', 'Gromp', 'Wolves', 'Raptors', 'RedBuff', 'Krugs', 'Scuttler',
]

/** Équipe dont c'est la jungle — suffixe de la clé de camp. Ce n'est PAS `side`. */
export type CampTeam = 'Blue' | 'Red'

/**
 * Copie de `CampPositionService.EditorPositions` (app WPF,
 * `Logiciel-Assistant-LOL/Services/CampPositionService.cs`, relevée le 2026-10-18).
 *
 * C'est la table que l'éditeur de l'app écrit dans `PathElement.X/Y`, et c'est dans ce
 * repère que l'overlay projette les camps en jeu. Un camp posé par le site doit donc
 * tomber EXACTEMENT au même endroit : la moindre retouche ici décalerait les camps des
 * paths créés sur le site, en jeu, sans erreur. `jungle-path.test.ts` fige les
 * 14 valeurs — modifier l'une impose de modifier l'app dans le même mouvement.
 *
 * Le suffixe désigne la jungle de l'ÉQUIPE (`Gromp_Blue` = Gromp de l'équipe bleue),
 * pas la moitié de carte choisie dans `side` : la carte n'est jamais retournée.
 * Couleurs : celles de l'app.
 */
export const CAMP_POSITIONS: Readonly<Record<string, { x: number; y: number; color: string }>> = {
  BlueBuff_Blue: { x: 0.25, y: 0.46, color: '#4FC3F7' },
  Gromp_Blue:    { x: 0.15, y: 0.43, color: '#81C784' },
  Wolves_Blue:   { x: 0.25, y: 0.56, color: '#90A4AE' },
  Raptors_Blue:  { x: 0.47, y: 0.64, color: '#FFB74D' },
  RedBuff_Blue:  { x: 0.52, y: 0.73, color: '#EF5350' },
  Krugs_Blue:    { x: 0.57, y: 0.83, color: '#A1887F' },
  Scuttler_Blue: { x: 0.30, y: 0.35, color: '#4DD0E1' },
  BlueBuff_Red:  { x: 0.75, y: 0.54, color: '#4FC3F7' },
  Gromp_Red:     { x: 0.85, y: 0.57, color: '#81C784' },
  Wolves_Red:    { x: 0.74, y: 0.43, color: '#90A4AE' },
  Raptors_Red:   { x: 0.52, y: 0.35, color: '#FFB74D' },
  RedBuff_Red:   { x: 0.48, y: 0.26, color: '#EF5350' },
  Krugs_Red:     { x: 0.44, y: 0.17, color: '#A1887F' },
  Scuttler_Red:  { x: 0.72, y: 0.65, color: '#4DD0E1' },
}

export function campKey(base: CampBase, team: CampTeam): string {
  return `${base}_${team}`
}

/** `Gromp_Blue` → `Gromp` ; toute autre chaîne → `null` (camp inconnu du site). */
export function campBaseOf(label: string | undefined): CampBase | null {
  if (!label) return null
  const base = label.replace(/_(Blue|Red)$/, '')
  return (CAMP_BASES as readonly string[]).includes(base) && label !== base ? base as CampBase : null
}

/* ── Conversions 0–100 % (site) ↔ 0–1 (contrat) ───────────────────────────────── */

/** Arrondi à 4 décimales : 1/10 000 de la carte, soit ~0,05 px sur l'image de 512 px. */
export function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000
}

/**
 * Coordonnée PRODUITE par le site (pourcentage du viewBox) → valeur du contrat.
 * Bornée à [0, 1] : un clic ou un tracé du site ne sort jamais de la carte. Ne JAMAIS
 * appliquer aux coordonnées relues — un point de l'app hors cadre doit survivre.
 */
export function toNormalized(percent: number): number {
  if (!Number.isFinite(percent)) return 0
  return round4(Math.min(1, Math.max(0, percent / 100)))
}

/** Valeur du contrat → pourcentage du viewBox, pour l'affichage. Aucune borne. */
export function toPercent(normalized: number): number {
  return normalized * 100
}

/* ── Lecture défensive ────────────────────────────────────────────────────────── */

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/**
 * Un élément est-il relisible par l'app ? Mêmes règles que la contrainte
 * `jungle_paths_elements_shape` : le JSONB arrive simplement CASTÉ, le type
 * TypeScript ne garantit rien à l'exécution. Un type d'élément inconnu mais bien
 * formé est VALIDE — conservé, simplement pas affiché.
 */
export function isValidElement(v: unknown): v is PathElement {
  if (!isObject(v)) return false
  if (!isNumber(v.Type) || !Number.isInteger(v.Type) || v.Type < 0 || v.Type > 255) return false
  if (!isNumber(v.X) || !isNumber(v.Y)) return false
  if ('Label' in v && typeof v.Label !== 'string') return false
  if ('Order' in v && (!isNumber(v.Order) || !Number.isInteger(v.Order))) return false
  if ('HasSmite' in v && typeof v.HasSmite !== 'boolean') return false
  return true
}

export function isValidStroke(v: unknown): v is PathStroke {
  if (!isObject(v) || !Array.isArray(v.Points)) return false
  if (!v.Points.every(p => isObject(p) && isNumber(p.X) && isNumber(p.Y))) return false
  if ('Color' in v && typeof v.Color !== 'string') return false
  if ('Thickness' in v && !isNumber(v.Thickness)) return false
  return true
}

/**
 * Éléments relus de la base. Les objets valides sont renvoyés TELS QUELS (même
 * référence) ; un objet invalide — que la base n'aurait pas dû laisser passer — est
 * écarté plutôt que de faire échouer l'affichage du path entier.
 */
export function parseElements(raw: unknown): PathElement[] {
  return Array.isArray(raw) ? raw.filter(isValidElement) : []
}

export function parseStrokes(raw: unknown): PathStroke[] {
  return Array.isArray(raw) ? raw.filter(isValidStroke) : []
}

export function rowToDraft(row: JunglePathRow): JunglePathDraft {
  return {
    id: row.id,
    name: row.name ?? '',
    champion: row.champion ?? '',
    side: row.side === 'Red' ? 'Red' : 'Blue',
    elements: parseElements(row.elements),
    strokes: parseStrokes(row.strokes),
    creator: row.creator ?? '',
    isFromWorkshop: row.is_from_workshop === true,
    createdAt: row.created_at ?? null,
  }
}

/** Charge utile d'écriture. Le nom est rogné ; tout le reste part tel quel. */
export function draftToWrite(d: JunglePathDraft): JunglePathWrite {
  return {
    id: d.id,
    name: d.name.trim(),
    champion: d.champion.trim(),
    side: d.side,
    elements: d.elements,
    strokes: d.strokes,
    creator: d.creator,
    is_from_workshop: d.isFromWorkshop,
  }
}

export function emptyDraft(id: string): JunglePathDraft {
  return {
    id, name: '', champion: '', side: 'Blue', elements: [], strokes: [],
    creator: '', isFromWorkshop: false, createdAt: null,
  }
}

/**
 * Empreinte de ce qui serait écrit : sert à l'état « modifications non sauvegardées ».
 * Comparer les charges utiles (et non les états React) ignore ce que la sauvegarde
 * ne change pas, comme des espaces en fin de nom.
 */
export function draftFingerprint(d: JunglePathDraft): string {
  const w = draftToWrite(d)
  return JSON.stringify([w.name, w.champion, w.side, w.elements, w.strokes, w.creator, w.is_from_workshop])
}

/** Un path neuf est-il encore vierge (rien à perdre en le quittant) ? */
export function isBlankDraft(d: JunglePathDraft): boolean {
  return d.name.trim() === '' && d.champion.trim() === ''
    && d.elements.length === 0 && d.strokes.length === 0
}

/* ── Affichage ────────────────────────────────────────────────────────────────── */

/** Ordre de passage d'un élément ; -1 si non ordonné. */
export function orderOf(el: PathElement): number {
  return typeof el.Order === 'number' ? el.Order : -1
}

/** `Spell:Flash:https://…` → `Flash`. Libellé lisible d'un sort posé dans l'app. */
export function spellName(label: string | undefined): string {
  return label?.split(':')[1] || '?'
}

/** Le site sait-il dessiner cet élément ? (Stroke-élément et types inconnus : non.) */
export function isDisplayable(el: PathElement): boolean {
  return EDITABLE_TYPES.has(el.Type) || el.Type === ELEMENT_TYPE.Spell
}

/* ── Édition — chaque opération renvoie de NOUVEAUX tableaux, sans muter ─────── */

function isCamp(el: PathElement, key?: string): boolean {
  return el.Type === ELEMENT_TYPE.Camp && (key === undefined || el.Label === key)
}

/** Prochain numéro de passage : après le plus grand déjà attribué à un camp. */
export function nextCampOrder(elements: readonly PathElement[]): number {
  return elements.reduce((max, el) => (isCamp(el) ? Math.max(max, orderOf(el)) : max), 0) + 1
}

/**
 * Clic sur un camp, comportement de l'app (`JunglePathTab.CampButton_Click`) :
 * absent → posé à SA position, numéroté à la suite ; déjà présent → bascule « à smiter ».
 * Seuls les camps reçoivent un `Order` ; les placements restent à -1.
 */
export function toggleCamp(elements: readonly PathElement[], key: string): PathElement[] {
  const pos = CAMP_POSITIONS[key]
  if (!pos) return [...elements]
  if (elements.some(el => isCamp(el, key))) {
    return elements.map(el => (isCamp(el, key) ? { ...el, HasSmite: !el.HasSmite } : el))
  }
  return [...elements, {
    Type: ELEMENT_TYPE.Camp, Label: key, X: pos.x, Y: pos.y,
    Order: nextCampOrder(elements), HasSmite: false,
  }]
}

/**
 * Renumérote les camps ordonnés 1, 2, 3… en conservant leur ordre relatif, comme la
 * gomme de l'app. Les camps sans ordre (-1) et les autres éléments ne bougent pas ;
 * un camp dont le numéro est déjà le bon garde son objet d'origine.
 */
export function renumberCamps(elements: readonly PathElement[]): PathElement[] {
  const ordered = elements
    .map((el, i) => ({ el, i }))
    .filter(({ el }) => isCamp(el) && orderOf(el) >= 0)
    .sort((a, b) => orderOf(a.el) - orderOf(b.el) || a.i - b.i)
  const next = new Map(ordered.map(({ i }, rank) => [i, rank + 1]))
  return elements.map((el, i) => {
    const n = next.get(i)
    return n === undefined || el.Order === n ? el : { ...el, Order: n }
  })
}

/** Retire un camp du path et renumérote les autres. */
export function removeCamp(elements: readonly PathElement[], key: string): PathElement[] {
  return renumberCamps(elements.filter(el => !isCamp(el, key)))
}

/** Pose un marqueur (smite, ward…) au point cliqué, en pourcentage du viewBox. */
export function addPlacement(
  elements: readonly PathElement[], type: PlacementType, xPercent: number, yPercent: number,
): PathElement[] {
  return [...elements, {
    Type: ELEMENT_TYPE[type], Label: type,
    X: toNormalized(xPercent), Y: toNormalized(yPercent),
    Order: -1, HasSmite: false,
  }]
}

const COLOR_RE = /^#[0-9A-Fa-f]{6}$/

/**
 * Nouveau tracé. Points en pourcentage du viewBox → 0–1 bornés et arrondis ; couleur
 * forcée au format `#RRGGBB` (celui que WPF relit et que la base exige) ; épaisseur
 * bornée. Un tracé de moins de deux points n'est pas un tracé : rien n'est ajouté.
 */
export function addStroke(
  strokes: readonly PathStroke[],
  pointsPercent: readonly { x: number; y: number }[],
  color: string,
  thickness: number,
): PathStroke[] {
  if (pointsPercent.length < 2) return [...strokes]
  return [...strokes, {
    Points: pointsPercent.map(p => ({ X: toNormalized(p.x), Y: toNormalized(p.y) })),
    Color: COLOR_RE.test(color) ? color.toUpperCase() : '#FF0000',
    Thickness: Math.min(100, Math.max(1, Math.round(thickness))),
  }]
}

/**
 * « Tout effacer » : retire ce que le site édite (camps, marqueurs, tracés) et GARDE
 * le reste — sorts et éléments inconnus posés dans l'app.
 */
export function clearEditable(elements: readonly PathElement[]): PathElement[] {
  return elements.filter(el => !EDITABLE_TYPES.has(el.Type))
}

/**
 * Gomme : retire l'élément éditable le plus proche du point (en pourcentage), sinon le
 * tracé passant le plus près, dans un rayon donné. Les sorts et éléments inconnus ne
 * sont jamais gommés. Les camps restants sont renumérotés.
 */
export function eraseAt(
  elements: readonly PathElement[],
  strokes: readonly PathStroke[],
  xPercent: number,
  yPercent: number,
  radiusPercent = 4,
): { elements: PathElement[]; strokes: PathStroke[] } {
  const dist = (x: number, y: number) => Math.hypot(toPercent(x) - xPercent, toPercent(y) - yPercent)

  let bestEl = -1
  let bestElD = radiusPercent
  elements.forEach((el, i) => {
    if (!EDITABLE_TYPES.has(el.Type)) return
    const d = dist(el.X, el.Y)
    if (d <= bestElD) { bestElD = d; bestEl = i }
  })
  if (bestEl >= 0) {
    return { elements: renumberCamps(elements.filter((_, i) => i !== bestEl)), strokes: [...strokes] }
  }

  let bestSt = -1
  let bestStD = radiusPercent
  strokes.forEach((s, i) => {
    for (const p of s.Points) {
      const d = dist(p.X, p.Y)
      if (d <= bestStD) { bestStD = d; bestSt = i }
    }
  })
  return {
    elements: [...elements],
    strokes: bestSt >= 0 ? strokes.filter((_, i) => i !== bestSt) : [...strokes],
  }
}

/* ── Erreurs d'écriture ───────────────────────────────────────────────────────── */

/** Clés de `strategie.jungle.errors` — la traduction vit dans le dictionnaire. */
export type JunglePathErrorKey =
  | 'needName' | 'network' | 'forbidden' | 'invalid' | 'conflict'
  | 'notSaved' | 'notDeleted' | 'loadFailed' | 'generic'

/**
 * Traduit le résultat d'une écriture Supabase en clé d'erreur, ou `null` si elle a
 * réussi. Le nombre de lignes renvoyées par `.select()` fait partie du verdict : une
 * écriture que la RLS écarte (ligne d'un autre compte, ligne supprimée entre-temps)
 * ne lève AUCUNE erreur et renvoie simplement 0 ligne.
 */
export function writeErrorKey(
  error: { code?: string | null; message?: string | null } | null,
  rows: number,
  op: 'save' | 'delete',
): JunglePathErrorKey | null {
  if (error) {
    switch (error.code) {
      case '42501': return 'forbidden'   // RLS / privilège
      case '23514': return 'invalid'     // contrainte de forme ou de taille
      case '23505': return 'conflict'    // id déjà pris
    }
    // supabase-js sans réponse HTTP : pas de code, message « Failed to fetch »…
    if (!error.code && /fetch|network/i.test(error.message ?? '')) return 'network'
    return 'generic'
  }
  if (rows === 0) return op === 'delete' ? 'notDeleted' : 'notSaved'
  return null
}
