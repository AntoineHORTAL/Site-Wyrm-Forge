import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Proxy Next.js 16 (ex-middleware). Un seul rôle depuis le 2026-09-11 :
// rafraîchissement de session Supabase + garde /dashboard.
//
// ⚠️ Les DEUX routages de sous-domaine ont été retirés, dans les deux cas en
// suppression NETTE et sur décision HORTAL :
//   • TOURNOIS, le 2026-09-03 — le sous-domaine et wyrm-forge.com/tournois*
//     renvoient 404 ;
//   • PRAC, le 2026-09-11 — avec tout le module (pages, tables, Edge Functions).
//     `prac.wyrm-forge.com` doit encore être retiré côté DNS Cloudflare et côté
//     domaines Vercel, ainsi que la variable NEXT_PUBLIC_PRAC_HOST : tant qu'ils
//     existent, le sous-domaine sert l'apex au lieu de ne rien servir.
//
// Il ne reste donc AUCUN routage par host ici. Si un sous-domaine devait
// réapparaître, le patron est dans l'historique Git de ce fichier.

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: {
        domain: process.env.NEXT_PUBLIC_COOKIE_DOMAIN || undefined,
        // Secure conditionné : le dev local (`next dev`) sert en HTTP sur localhost →
        // un cookie Secure y serait rejeté. NODE_ENV='production' couvre les déploiements
        // Vercel (preview + prod), tous en HTTPS. Doit rester identique dans client.ts + server.ts.
        secure: process.env.NODE_ENV === 'production',
      },
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // IMPORTANT : ne rien insérer entre createServerClient et getUser (refresh token).
  const { data: { user } } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  // ── Garde /dashboard ────────────────────────────────────────────────────────
  if (!user && pathname.startsWith('/dashboard')) {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api|.*\\.[^/]+$).*)',
  ],
}
