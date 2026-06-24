/**
 * Helper partagé pour les fetches externes (Meraki Analytics, etc.).
 * Utilisé uniquement côté serveur (route handlers Next.js).
 * Le cache est géré via Next.js `next.revalidate`.
 */
export async function fetchExternal<T = unknown>(url: string, revalidate = 86400): Promise<T> {
  const res = await fetch(url, { next: { revalidate } })
  if (!res.ok) throw new Error(`external fetch ${res.status}: ${url}`)
  return res.json() as Promise<T>
}
