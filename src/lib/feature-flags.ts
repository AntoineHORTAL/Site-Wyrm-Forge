/**
 * Feature flags — module PUR, sans dépendance React.
 *
 * Tout ce qui DÉCIDE ici : résolution de la hiérarchie `parent_key`, politique de
 * repli quand le catalogue n'est pas (encore) là, et câblage du rafraîchissement.
 * `FeatureFlagsProvider` n'est qu'une coquille React autour de ces fonctions —
 * c'est ce qui les rend testables sans jsdom ni testing-library, conformément au
 * choix assumé de ce dépôt (cf. `vitest.config.ts` et `LiveComposition.test.tsx`).
 *
 * Le catalogue vit dans `app_settings` (migration 20260905000001), partagé avec
 * l'app WPF. Les deux clients appliquent la MÊME politique de repli asymétrique —
 * voir `Services/FeatureFlagService.cs` côté bureau.
 */

/** Nature d'un flag, telle que portée par `app_settings.kind`. */
export type FlagKind = 'setting' | 'launch' | 'kill'

/** Une ligne du catalogue, réduite à ce dont le site a besoin. */
export interface FlagRow {
  key: string
  /** TEXT en base (`'true'` / `'false'`), jamais un booléen JSON. */
  value: string
  kind: FlagKind
  parent_key: string | null
}

/**
 * Les seules clés qui doivent échouer FERMÉ quand le catalogue est absent : les
 * flags de LANCEMENT.
 *
 * ⚠️ Volontairement une liste des flags FERMÉS, et non une table des 39 clés.
 * Recopier le catalogue ici en ferait un doublon de la base à maintenir à chaque
 * `INSERT` — la règle inverse se suffit : **tout ce qui n'est pas listé ici est un
 * kill switch, donc ouvert par défaut**. Un flag de lancement ajouté en base plus
 * tard et absent d'ici ne crée pas de fuite : si le bundle ne connaît pas la clé,
 * c'est qu'il n'embarque pas la feature qu'elle garde.
 *
 * Alignée sur `ColdStartClosed` de `Services/FeatureFlagService.cs` pour tout ce
 * que les DEUX clients embarquent. Un flag `surface='web'` n'a rien à y faire :
 * l'app WPF ne connaît pas la feature, donc ne peut pas la laisser fuir — c'est
 * la règle énoncée juste au-dessus, appliquée dans l'autre sens.
 * `kit_sur_mesure_enabled` est le premier de ce genre.
 */
export const LAUNCH_FLAG_KEYS: ReadonlySet<string> = new Set([
  'ecailles_enabled',
  'shop_enabled',
  'quests_enabled',
  'cosmetics_enabled',
  'scenarios_enabled',
  // Service « Kit sur mesure » (migration 20260908000002). `surface='web'` :
  // aucune brique côté app de bureau, donc aucun pendant dans `ColdStartClosed`.
  'kit_sur_mesure_enabled',
])

/**
 * Valeur d'un flag qu'on ne connaît pas — pendant le premier chargement comme en
 * cas d'erreur réseau.
 *
 * L'asymétrie est délibérée, ne pas l'uniformiser :
 *  - **kill switch → `true`** (fail-open) : une panne réseau ne doit jamais vider
 *    le site de ses fonctionnalités livrées ;
 *  - **flag de lancement → `false`** (fail-closed) : jamais de fuite d'une feature
 *    pas encore lancée, fût-ce le temps d'un chargement.
 *
 * Elle n'est tenable que parce que l'application RÉELLE des coupures qui coûtent
 * (achats, quotas IA, proxys Riot) reste côté serveur, dans les Edge Functions, où
 * `isFeatureEnabled()` est fail-closed dans les deux sens. Ici, le flag est de la
 * PRÉSENTATION.
 */
export function flagFallback(key: string): boolean {
  return !LAUNCH_FLAG_KEYS.has(key)
}

/** Profondeur maximale de la chaîne de parents — garde-fou anti-cycle. */
const MAX_PARENT_DEPTH = 16

/**
 * Aplatit le catalogue en une map `clé → valeur EFFECTIVE`, parents appliqués.
 *
 * Un flag n'est actif que si lui-même ET tous ses ancêtres le sont : couper
 * `ecailles_enabled` doit éteindre la boutique et les quêtes sans qu'aucun
 * appelant ait à le savoir.
 *
 * ⚠️ Résolu UNE FOIS, ici, et pas à chaque lecture de hook. Remonter la chaîne à
 * chaque `useFlag()` ferait payer le parcours à chaque rendu de chaque composant,
 * pour un résultat identique entre deux rafraîchissements.
 *
 * Robuste aux deux façons dont la base peut mentir : un `parent_key` qui ne
 * correspond à aucune ligne (le parent n'est pas dans la réponse — RLS, ou clé
 * supprimée) est IGNORÉ plutôt que traité comme `false`, sinon un enfant
 * disparaîtrait pour une raison invisible ; un cycle est borné par
 * `MAX_PARENT_DEPTH` au lieu de boucler à l'infini.
 */
export function resolveFlags(rows: readonly FlagRow[]): Record<string, boolean> {
  const byKey = new Map<string, FlagRow>()
  for (const row of rows) byKey.set(row.key, row)

  const resolved: Record<string, boolean> = {}

  for (const row of rows) {
    let value = row.value === 'true'
    let parent = row.parent_key
    let depth = 0

    while (value && parent && depth < MAX_PARENT_DEPTH) {
      const ancestor = byKey.get(parent)
      if (!ancestor) break            // parent hors réponse → on n'invente rien
      if (ancestor.value !== 'true') { value = false; break }
      parent = ancestor.parent_key
      depth++
    }

    resolved[row.key] = value
  }

  return resolved
}

/**
 * Lecture d'un flag résolu, avec repli asymétrique. C'est le cœur de `useFlag`.
 *
 * @param resolved map produite par {@link resolveFlags}
 * @param key      clé `app_settings.key`
 */
export function readFlag(resolved: Record<string, boolean>, key: string): boolean {
  const value = resolved[key]
  return value === undefined ? flagFallback(key) : value
}

// ⚠️ Il y avait ici `gateState(isLoading, enabled)`, la décision à trois états de
// la garde CLIENTE des routes publiques. Elle a disparu avec elle : ces routes
// lisent désormais le flag CÔTÉ SERVEUR (`isPublicFlagEnabled`), donc la décision
// est déjà tranchée quand le composant s'exécute — il n'existe plus d'état
// « on ne sait pas encore » à arbitrer.
//
// L'état de chargement reste, lui, une notion valide pour les consommateurs
// CLIENTS du provider : `EcaillesTab` attend toujours `isLoading` avant de
// trancher entre la Forge et l'écran « bientôt ». La différence est que le
// dashboard n'a pas d'enjeu de HTML initial, contrairement à une page publique.

// ════════════════════════════════════════════════════════════════════════════
//  CÂBLAGE DU RAFRAÎCHISSEMENT
// ════════════════════════════════════════════════════════════════════════════

/** Cadence du poll de fond, en millisecondes. */
export const REFRESH_INTERVAL_MS = 60_000

/**
 * Dépendances injectées — c'est ce qui rend le câblage testable en environnement
 * `node`, sans jsdom. Le provider passe les vraies (`document`, `window`).
 */
export interface RefreshScheduleDeps {
  onRefresh: () => void
  addEventListener: (type: string, handler: () => void) => void
  removeEventListener: (type: string, handler: () => void) => void
  setInterval: (handler: () => void, ms: number) => unknown
  clearInterval: (id: unknown) => void
  /** L'onglet est-il en arrière-plan ? */
  isHidden: () => boolean
  intervalMs?: number
}

/**
 * Arme les deux déclencheurs de rafraîchissement et renvoie la fonction de
 * nettoyage. À appeler dans un `useEffect`, dont on retourne le résultat.
 *
 * ⚠️ `visibilitychange` ne rafraîchit qu'au RETOUR sur l'onglet (`!isHidden()`).
 * L'événement se lève dans les deux sens : sans ce test, quitter l'onglet
 * déclencherait une requête que personne n'attend, doublant le trafic pour rien.
 *
 * ⚠️ Le nettoyage retire l'écouteur ET l'intervalle. Un `useEffect` sans cela
 * empilerait un timer par montage — en développement, le double montage du mode
 * strict de React suffit déjà à en laisser un orphelin.
 */
export function startFlagsRefresh(deps: RefreshScheduleDeps): () => void {
  const { onRefresh, isHidden, intervalMs = REFRESH_INTERVAL_MS } = deps

  const onVisibility = () => {
    if (!isHidden()) onRefresh()
  }

  deps.addEventListener('visibilitychange', onVisibility)
  const timer = deps.setInterval(onRefresh, intervalMs)

  return () => {
    deps.removeEventListener('visibilitychange', onVisibility)
    deps.clearInterval(timer)
  }
}
