import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: {
        domain: process.env.NEXT_PUBLIC_COOKIE_DOMAIN || undefined,
        // Secure conditionné : le dev local (`next dev`) sert en HTTP sur localhost →
        // un cookie Secure y serait rejeté. NODE_ENV='production' couvre les déploiements
        // Vercel (preview + prod), tous en HTTPS. Doit rester identique dans client.ts + proxy.ts.
        secure: process.env.NODE_ENV === 'production',
      },
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {}
        },
      },
    }
  )
}
