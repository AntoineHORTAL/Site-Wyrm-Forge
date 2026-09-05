import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Proxy Next.js 16 (ex-middleware). Deux rôles :
//   1. Routing du sous-domaine prac (outil interne) : host = NEXT_PUBLIC_PRAC_HOST
//      → rewrite /X vers /prac/X ; host principal + /prac* → redirect vers l'accueil.
//   2. Rafraîchissement de session Supabase + garde /dashboard.
//
// ⚠️ Le routage du sous-domaine TOURNOIS a été retiré le 2026-09-03 avec la route
// /tournois elle-même (décision HORTAL). Suppression NETTE, sans redirection : le
// sous-domaine et wyrm-forge.com/tournois* renvoient désormais 404. Si un lien
// externe s'avérait cassé, le patron à reprendre est le CAS 2 ci-dessous (prac),
// qui redirige vers l'accueil plutôt que de relayer.

// Sous-domaine prac (outil interne de suivi de joueurs) — routes plates sous /prac.
function pracHostname(): string | null {
  const h = process.env.NEXT_PUBLIC_PRAC_HOST
  if (!h) return null
  try {
    return new URL(/^https?:\/\//.test(h) ? h : `https://${h}`).hostname
  } catch {
    return null
  }
}

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

  const hostname = (request.headers.get('host') ?? '').split(':')[0].toLowerCase()
  const isLocal  = hostname === 'localhost' || hostname === '127.0.0.1'
  const pHost    = pracHostname()
  // `search` n'est plus déstructuré : seuls les CAS tournois (retirés) le relayaient.
  const { pathname } = request.nextUrl

  // ── CAS 1 — sous-domaine prac ────────────────────────────────────────────────
  // Rewrite interne /X → /prac/X (URL inchangée). Pas de normalisation de casse
  // (routes plates). La garde d'accès (is_prac_admin) est faite dans le layout /prac.
  if (pHost && !isLocal && hostname === pHost) {
    const url = request.nextUrl.clone()
    url.pathname = pathname === '/' ? '/prac' : `/prac${pathname}`
    const rewriteResponse = NextResponse.rewrite(url, { request })
    supabaseResponse.cookies.getAll().forEach((c) => rewriteResponse.cookies.set(c))
    return rewriteResponse
  }

  // ── CAS 2 — host principal + /prac* → BLOQUÉ (redirect accueil apex) ──────────
  // /prac n'est servi QUE sur le sous-domaine prac en prod : outil interne noindex
  // sans lien public entrant, donc l'accès apex wyrm-forge.com/prac* est BLOQUÉ
  // (redirigé vers l'accueil apex), jamais relayé — MÊME pour un admin prac
  // authentifié. Le layout /prac double cette garde (host check).
  if (pHost && !isLocal && (pathname === '/prac' || pathname.startsWith('/prac/'))) {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    url.search = ''
    return NextResponse.redirect(url)
  }

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
