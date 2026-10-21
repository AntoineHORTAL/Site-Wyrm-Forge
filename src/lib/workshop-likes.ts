// Likes du Workshop Builds — décisions PURES (aucun import, testées par
// workshop-likes.test.ts). L'appel réseau reste dans WorkshopBuildsTab.
//
// Le serveur fait foi (migration 20261021000001) :
//   • `toggle_build_like(p_build_id)` est la SEULE voie d'écriture : authentifié
//     requis, refuse son propre build (`own_build`), ajoute ou retire le like, et
//     renvoie l'état final `{ liked, like_count }` ;
//   • `workshop_build_likes` n'est lisible que pour SES propres likes (RLS).
// Le client n'ajoute ni ne retire jamais 1 de lui-même : il affiche ce que le
// serveur renvoie. Ce module ne décide que de l'AFFICHAGE du bouton, la barrière
// est en base.

// ── Disponibilité du bouton ──────────────────────────────────────────────────
export type LikeAvailability = 'ok' | 'own' | 'signedOut'

// `creatorId` peut être NULL (build antérieur à la colonne, ou auteur supprimé :
// ON DELETE SET NULL) : un tel build reste likable par tout compte connecté,
// comme côté serveur.
export function likeAvailability(
  userId: string | null | undefined,
  creatorId: string | null | undefined,
): LikeAvailability {
  if (!userId) return 'signedOut'
  if (creatorId && creatorId === userId) return 'own'
  return 'ok'
}

// ── Résultat du toggle ───────────────────────────────────────────────────────
export interface LikeResult {
  liked: boolean
  likeCount: number
}

// PostgREST renvoie une fonction `RETURNS TABLE` sous forme de TABLEAU
// (`[{ liked, like_count }]`). On tolère aussi un objet nu. Toute autre forme
// ⇒ null : l'appelant n'affiche rien plutôt qu'un compteur inventé.
export function parseToggleResult(data: unknown): LikeResult | null {
  const row = Array.isArray(data) ? data[0] : data
  if (!row || typeof row !== 'object') return null
  const { liked, like_count } = row as { liked?: unknown; like_count?: unknown }
  if (typeof liked !== 'boolean') return null
  const count = typeof like_count === 'string' ? Number(like_count) : like_count
  if (typeof count !== 'number' || !Number.isFinite(count) || count < 0) return null
  return { liked, likeCount: count }
}

// ── Erreurs ──────────────────────────────────────────────────────────────────
// `unavailable` : la RPC n'existe pas (encore) sur la base — site déployé avant la
// migration. On le distingue pour afficher « momentanément indisponible » plutôt
// qu'une erreur générique, et pour cesser de proposer le bouton.
export type LikeErrorKind = 'unavailable' | 'own' | 'signedOut' | 'other'

export function likeErrorKind(
  error: { code?: string | null; message?: string | null } | null | undefined,
): LikeErrorKind {
  if (!error) return 'other'
  const code = error.code ?? ''
  const msg  = (error.message ?? '').toLowerCase()
  // PGRST202 : fonction introuvable dans le cache de schéma ; 42883 : n'existe pas.
  if (code === 'PGRST202' || code === '42883') return 'unavailable'
  // Exceptions levées par la fonction : elles arrivent dans `message`.
  if (msg.includes('own_build')) return 'own'
  if (msg.includes('not_authenticated')) return 'signedOut'
  // 42501 sans message métier = privilège refusé (session expirée → rôle anon).
  if (code === '42501') return 'signedOut'
  return 'other'
}

// ── Ensemble des builds likés ────────────────────────────────────────────────
// Lignes de `select('build_id') from workshop_build_likes` → Set. Lignes mal
// formées ignorées.
export function likedSetFromRows(rows: unknown): Set<string> {
  const out = new Set<string>()
  if (!Array.isArray(rows)) return out
  for (const r of rows) {
    const id = (r as { build_id?: unknown } | null)?.build_id
    if (typeof id === 'string' && id) out.add(id)
  }
  return out
}

// Nouvel ensemble (immuable, pour React) après un toggle confirmé par le serveur.
export function withLikeState(liked: ReadonlySet<string>, buildId: string, isLiked: boolean): Set<string> {
  const next = new Set(liked)
  if (isLiked) next.add(buildId)
  else next.delete(buildId)
  return next
}
