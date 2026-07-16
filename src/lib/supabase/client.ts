import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: {
        domain: process.env.NEXT_PUBLIC_COOKIE_DOMAIN || undefined,
        // Secure conditionné : le dev local (`next dev`) sert en HTTP sur localhost →
        // un cookie Secure y serait rejeté. NODE_ENV='production' couvre les déploiements
        // Vercel (preview + prod), tous en HTTPS. Doit rester identique dans server.ts + proxy.ts.
        secure: process.env.NODE_ENV === 'production',
      },
    }
  )
}
