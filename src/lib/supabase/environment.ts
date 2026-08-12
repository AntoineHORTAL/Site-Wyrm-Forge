/**
 * À quel projet Supabase le site parle-t-il RÉELLEMENT ?
 *
 * Module PUR (aucun import, aucune dépendance React/Next) : il se teste sans alias `@/`,
 * conformément à la convention des modules de logique du repo.
 *
 * Pendant web du `AppConfig.IsTestDatabase` de l'app WPF. Comme lui, la réponse est
 * dérivée de l'URL EFFECTIVE, jamais d'une variable d'environnement séparée
 * (`NEXT_PUBLIC_IS_TEST` ou équivalent) : une variable à part peut diverger de l'URL
 * qu'elle est censée décrire, et afficherait alors « BASE DE TEST » à quelqu'un branché
 * sur la PROD — soit exactement le contresens que ce bandeau existe pour éviter.
 */

/** Projet Supabase de PRODUCTION. ⚠️ Si le projet change, mettre à jour ici. */
export const PROD_SUPABASE_URL = 'https://cuscgmgqakxnfwnsrhhv.supabase.co'

/** Projet Supabase de TEST — schéma identique, données jetables. Informatif (libellés). */
export const TEST_SUPABASE_URL = 'https://gyjcdswpybrhesarompg.supabase.co'

/**
 * Normalise une URL de projet pour la comparaison : casse et slash final ne doivent pas
 * décider de l'affichage d'un bandeau. `.env.local` est un fichier édité à la main —
 * `https://…supabase.co/` y est aussi plausible que sans slash.
 */
function normalizeUrl(url: string): string {
  return url.trim().replace(/\/+$/, '').toLowerCase()
}

/** Référence du projet = sous-domaine de l'URL (`https://abc.supabase.co` → `abc`). */
export function projectRefFromUrl(url: string | undefined): string | null {
  if (!url) return null
  const m = normalizeUrl(url).match(/^https?:\/\/([a-z0-9-]+)\.supabase\.co$/)
  return m ? m[1] : null
}

/**
 * Référence du projet portée par la CLÉ elle-même, ou `null` si non déterminable.
 *
 * ⚠️ Deux formats de clé publique coexistent chez Supabase, et le site n'utilise PAS
 * le même que l'app WPF :
 *   - `eyJ…` — clé anon héritée, un JWT dont le payload contient `{ ref: "<projet>" }`.
 *     C'est ce que porte `.env.local` aujourd'hui, et c'est vérifiable.
 *   - `sb_publishable_…` — nouveau format, opaque : il ne contient AUCUNE référence de
 *     projet. Non vérifiable, on renvoie `null` (et l'appelant s'abstient de juger).
 *
 * Décoder le payload d'un JWT ne le valide pas et n'a pas à le faire : on ne cherche pas
 * à authentifier la clé (le serveur Supabase s'en charge), seulement à lire à quel projet
 * elle se déclare appartenir.
 */
export function projectRefFromKey(key: string | undefined): string | null {
  if (!key) return null
  const parts = key.trim().split('.')
  if (parts.length !== 3) return null // sb_publishable_… ou clé tronquée : rien à lire

  try {
    // atob est disponible partout où ce module tourne (navigateur, Node ≥ 16, Edge).
    const payload = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'))
    const ref = (JSON.parse(payload) as { ref?: unknown }).ref
    return typeof ref === 'string' && ref.length > 0 ? ref : null
  } catch {
    return null // payload illisible : non vérifiable, jamais une erreur bloquante
  }
}

/**
 * Vrai quand le site NE parle PAS à la base de production — ce que le bandeau affiche.
 * Dérivé de l'URL seule, comme `AppConfig.IsTestDatabase` côté WPF.
 */
export function isTestDatabase(url: string | undefined): boolean {
  if (!url) return false // sans URL, rien ne tourne de toute façon : pas de faux « test »
  return normalizeUrl(url) !== normalizeUrl(PROD_SUPABASE_URL)
}

export type SupabaseEnvVerdict =
  /** Config utilisable. `isTest` pilote le bandeau. */
  | { kind: 'ok'; isTest: boolean; url: string }
  /** Une variable d'environnement obligatoire manque. */
  | { kind: 'missing'; missing: string[] }
  /** L'URL et la clé désignent deux projets Supabase DIFFÉRENTS. */
  | { kind: 'mismatch'; url: string; urlRef: string; keyRef: string }

/**
 * Verdict complet sur un couple (URL, clé).
 *
 * Le cas `mismatch` est le pendant web de `AppConfig.DetectIncoherentPair` (WPF) — mais
 * il est détecté DIFFÉREMMENT, et c'est délibéré. Le WPF compare à des couples connus
 * codés en dur ; transposer ça ici produirait des faux positifs (le site utilise pour le
 * MÊME projet de prod une clé au format hérité, distincte de la clé publishable du WPF)
 * et casserait le jour d'une rotation de clé. La vérification structurelle ci-dessous
 * n'a besoin d'aucune clé en dur, fonctionne pour n'importe quel projet — y compris un
 * futur troisième — et ne peut pas devenir fausse avec le temps.
 *
 * Volontairement conservateur, comme côté WPF : tout ce qui n'est pas vérifiable
 * (clé `sb_publishable_…`, URL hors `*.supabase.co`) est déclaré `ok`, jamais suspect.
 */
export function inspectSupabaseEnv(
  url: string | undefined,
  key: string | undefined,
): SupabaseEnvVerdict {
  const missing: string[] = []
  if (!url?.trim()) missing.push('NEXT_PUBLIC_SUPABASE_URL')
  if (!key?.trim()) missing.push('NEXT_PUBLIC_SUPABASE_ANON_KEY')
  if (missing.length > 0) return { kind: 'missing', missing }

  const urlRef = projectRefFromUrl(url)
  const keyRef = projectRefFromKey(key)

  if (urlRef && keyRef && urlRef !== keyRef) {
    return { kind: 'mismatch', url: url!, urlRef, keyRef }
  }
  return { kind: 'ok', isTest: isTestDatabase(url), url: url! }
}

/**
 * Lit les deux variables publiques.
 *
 * ⚠️ Les `process.env.NEXT_PUBLIC_*` sont écrits en toutes lettres : Next les remplace
 * par leur valeur À LA COMPILATION, et uniquement sur cette forme littérale. Un accès
 * dynamique (`process.env[nom]`) ne serait PAS remplacé et renverrait `undefined` dans
 * le navigateur — d'où une lecture centralisée ici plutôt que dispersée.
 */
export function readSupabaseEnv(): { url: string | undefined; key: string | undefined } {
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    key: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  }
}

/** Libellé lisible d'un projet, pour les messages de diagnostic. */
export function describeProject(ref: string | null): string {
  if (!ref) return 'inconnu'
  if (ref === projectRefFromUrl(PROD_SUPABASE_URL)) return `${ref} (PRODUCTION)`
  if (ref === projectRefFromUrl(TEST_SUPABASE_URL)) return `${ref} (TEST)`
  return ref
}
