// Per-IP rate limiting via HMAC-hashed IP + 1-minute sliding window in Postgres.
// Uses fn_riot_rate_increment (SECURITY DEFINER) for atomic upsert.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const LIMIT_PER_MINUTE = 20

function db() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
}

async function hmacHex(data: string, secret: string): Promise<string> {
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

function clientIp(req: Request): string {
  // CF-Connecting-IP is the most reliable when traffic passes through Cloudflare.
  const cf = req.headers.get('CF-Connecting-IP')
  if (cf?.trim()) return cf.trim()
  // Take only the first entry of X-Forwarded-For (leftmost = original client).
  const xff = req.headers.get('X-Forwarded-For')
  if (xff) return xff.split(',')[0].trim()
  return 'unknown'
}

/** Returns true if the request should be blocked (rate limit exceeded). Fails open on error. */
export async function isRateLimited(req: Request, fn: string): Promise<boolean> {
  const salt = Deno.env.get('RATE_LIMITE_RIOT_IP')
  if (!salt) return false // fail open if secret not configured

  try {
    const ip   = clientIp(req)
    const hash = await hmacHex(ip, salt)
    // Align to the current minute boundary for the fixed window
    const win  = new Date()
    win.setSeconds(0, 0)

    const { data, error } = await db().rpc('fn_riot_rate_increment', {
      p_ip_hash:       hash,
      p_function_name: fn,
      p_window_start:  win.toISOString(),
    })
    if (error) return false // fail open on DB error

    return (typeof data === 'number' ? data : 0) > LIMIT_PER_MINUTE
  } catch {
    return false
  }
}
