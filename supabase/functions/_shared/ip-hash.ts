// Empreinte d'adresse IP — partagée par les deux limiteurs par IP.
//
// Aucune IP n'est écrite en clair en base : `rate-limit.ts` (table
// `riot_rate_limits`) et `ip-rate-limit.ts` (clés `rate:*` de `riot_cache`)
// n'y stockent que cette empreinte.
//
// ⚠️ HMAC avec secret, jamais un SHA-256 nu : l'espace IPv4 ne compte que 2³²
// adresses, une empreinte sans secret se renverse par force brute en quelques
// minutes. Le secret est `RATE_LIMITE_RIOT_IP` (secret Edge Functions).
//
// Module SANS import : chargeable par vitest (WebCrypto est natif sous Node 20
// comme sous Deno).

export const IP_HASH_SECRET_ENV = 'RATE_LIMITE_RIOT_IP'

/** HMAC-SHA256(ip, secret), 32 premiers caractères hexadécimaux. */
export async function hmacHex(data: string, secret: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign'],
  )
  const buf = await crypto.subtle.sign('HMAC', key, enc.encode(data))
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 32)
}

/** Secret lu dans l'environnement Deno ; `undefined` hors Deno ou si absent. */
export function ipHashSecretFromEnv(): string | undefined {
  try {
    // deno-lint-ignore no-explicit-any
    const deno = (globalThis as any).Deno
    const v = deno?.env?.get(IP_HASH_SECRET_ENV)
    return typeof v === 'string' && v.length > 0 ? v : undefined
  } catch {
    return undefined
  }
}
