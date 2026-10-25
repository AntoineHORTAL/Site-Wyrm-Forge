// URL de téléchargement de l'installateur Windows, hébergé sur Supabase Storage
// (bucket public « downloads », dossier `velopack`). Centralisée ici car réutilisée
// par Nav, Hero, FinalCTA, Pricing, Footer et la page /about.
//
// ⚠️ Cette URL est STABLE et ne doit PAS être versionnée à la main : le nom de
// fichier produit par `vpk pack` ne contient pas le numéro de version, et le
// workflow release.yml du dépôt de l'app le ré-uploade en `x-upsert` à chaque
// tag de production. Le lien pointe donc toujours sur le dernier Setup.exe publié.
//
// Il remplace l'ancien `downloads/WyrmForge.exe` — un exécutable single-file
// déposé à la main dans le bucket, que plus aucun workflow ne mettait à jour
// (il datait du 28/05/2026 alors que l'app en était à la 1.0.2).
//
// ⚠️ Ne JAMAIS le faire pointer vers une Release GitHub : le dépôt de l'app est
// privé, ses assets exigent une authentification et sont donc inaccessibles à un
// visiteur — c'est précisément ce qui rendait l'ancienne auto-update inopérante.
//
// Canal `win` = production. Le canal `preview` (tags v*-*) publie sous d'autres
// noms de fichiers et ne doit jamais être exposé sur le site.
//
// Les liens du site n'utilisent pas cette constante directement mais
// `useWindowsDownloadUrl()` : même URL, plus `?download=WyrmForge-<version>-Setup.exe`
// pour que le fichier enregistré porte le numéro de version. C'est Supabase Storage
// qui pose alors le Content-Disposition — l'attribut HTML `download` est ignoré par
// les navigateurs sur un lien d'une autre origine. La constante reste le repli tant
// que la version n'est pas connue (rendu serveur, flux injoignable).
export const WINDOWS_DOWNLOAD_URL =
  'https://cuscgmgqakxnfwnsrhhv.supabase.co/storage/v1/object/public/downloads/velopack/WyrmForge-win-Setup.exe'

// Flux Vélopack du canal stable, réécrit par release.yml dans le même upload que le
// Setup.exe : c'est la source de vérité de la version publiée, rien à bumper à la main.
export const VELOPACK_STABLE_FEED_URL =
  'https://cuscgmgqakxnfwnsrhhv.supabase.co/storage/v1/object/public/downloads/velopack/releases.win.json'

const STABLE_VERSION = /^(\d+)\.(\d+)\.(\d+)$/

/**
 * Plus haute version STABLE (x.y.z, sans suffixe) parmi les paquets « Full » du flux
 * Vélopack. `null` si le flux est illisible ou vide : l'appelant garde le lien neutre.
 */
export function latestStableVersion(feed: unknown): string | null {
  const assets = (feed as { Assets?: unknown } | null)?.Assets
  if (!Array.isArray(assets)) return null

  let best: number[] | null = null
  let bestText: string | null = null
  for (const a of assets) {
    if (a?.Type !== 'Full' || typeof a?.Version !== 'string') continue
    const m = STABLE_VERSION.exec(a.Version)
    if (!m) continue
    const v = [Number(m[1]), Number(m[2]), Number(m[3])]
    const cmp = best ? v[0] - best[0] || v[1] - best[1] || v[2] - best[2] : 1
    if (cmp > 0) {
      best = v
      bestText = a.Version
    }
  }
  return bestText
}

/** Lien de téléchargement, nom de fichier versionné si la version est connue. */
export function windowsDownloadUrl(version: string | null): string {
  if (!version || !STABLE_VERSION.test(version)) return WINDOWS_DOWNLOAD_URL
  return `${WINDOWS_DOWNLOAD_URL}?download=${encodeURIComponent(`WyrmForge-${version}-Setup.exe`)}`
}
