import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Proxy Next.js 16 (ex-middleware). Deux rôles :
//   1. Routing sous-domaine 2 niveaux (série → tournoi) du module Tournois :
//      host = NEXT_PUBLIC_TOURNOIS_HOST :
//        /                 → /tournois            (listing écosystèmes)
//        /manage(/*)       → /tournois/manage(/*) (back-office)
//        /[serie]          → /tournois/[serie]    (vitrine série)
//        /[serie]/[slug]*  → /tournois/[serie]/[slug]*  (tournoi, match, admin)
//      (rewrite — la barre d'URL reste sur le sous-domaine)
//      host principal + /tournois* → redirect 308 vers le sous-domaine.
//      local / preview (host non câblé) → pas de rewrite (/tournois/... direct).
//      Normalisation de casse : segments serie/slug en MAJUSCULE → 308 vers minuscule
//      (le code de match M7 n'est PAS touché).
//   2. Rafraîchissement de session Supabase + garde /dashboard.

function tournoisHostname(): string | null {
  const h = process.env.NEXT_PUBLIC_TOURNOIS_HOST
  if (!h) return null
  try {
    return new URL(/^https?:\/\//.test(h) ? h : `https://${h}`).hostname
  } catch {
    return null
  }
}

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

// Met en minuscule les segments serie (idx) et slug (idx+1), sauf si le segment
// serie est la route statique 'manage'. Laisse intacts les segments suivants
// (notamment le code de match M7). Retourne null si rien à changer.
function lowercaseSerieSlug(segments: string[], serieIdx: number): string[] | null {
  if (segments.length <= serieIdx) return null
  if (segments[serieIdx] === 'manage') return null
  let changed = false
  const out = [...segments]
  const lc0 = out[serieIdx].toLowerCase()
  if (lc0 !== out[serieIdx]) { out[serieIdx] = lc0; changed = true }
  if (out.length > serieIdx + 1) {
    const lc1 = out[serieIdx + 1].toLowerCase()
    if (lc1 !== out[serieIdx + 1]) { out[serieIdx + 1] = lc1; changed = true }
  }
  return changed ? out : null
}

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: { domain: process.env.NEXT_PUBLIC_COOKIE_DOMAIN || undefined },
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
  const tHost    = tournoisHostname()
  const pHost    = pracHostname()
  const { pathname, search } = request.nextUrl

  // ── CAS 1 — sous-domaine tournois ────────────────────────────────────────────
  if (tHost && !isLocal && hostname === tHost) {
    const segments = pathname.split('/').filter(Boolean)   // ['xv2','noel','match','M7']

    // Normalisation casse des segments serie/slug → 308
    const normalized = lowercaseSerieSlug(segments, 0)
    if (normalized) {
      return NextResponse.redirect(new URL(`https://${tHost}/${normalized.join('/')}${search}`), 308)
    }

    // Rewrite interne /X → /tournois/X (URL inchangée)
    const url = request.nextUrl.clone()
    url.pathname = pathname === '/' ? '/tournois' : `/tournois${pathname}`
    const rewriteResponse = NextResponse.rewrite(url, { request })
    supabaseResponse.cookies.getAll().forEach((c) => rewriteResponse.cookies.set(c))
    return rewriteResponse
  }

  // ── CAS 2 — host principal + /tournois* → 308 vers le sous-domaine ───────────
  if (tHost && !isLocal && (pathname === '/tournois' || pathname.startsWith('/tournois/'))) {
    const rest = pathname.slice('/tournois'.length) || '/'
    return NextResponse.redirect(new URL(`https://${tHost}${rest}${search}`), 308)
  }

  // ── Local / preview — pas de rewrite, normalisation casse sous /tournois ─────
  if ((!tHost || isLocal) && (pathname === '/tournois' || pathname.startsWith('/tournois/'))) {
    const segments = pathname.split('/').filter(Boolean)   // ['tournois','xv2','noel',...]
    const normalized = lowercaseSerieSlug(segments, 1)     // serie = segs[1]
    if (normalized) {
      return NextResponse.redirect(new URL(`/${normalized.join('/')}${search}`, request.url), 308)
    }
  }

  // ── CAS 3 — sous-domaine prac ────────────────────────────────────────────────
  // Rewrite interne /X → /prac/X (URL inchangée). Pas de normalisation de casse
  // (routes plates). La garde d'accès (is_prac_admin) est faite dans le layout /prac.
  if (pHost && !isLocal && hostname === pHost) {
    const url = request.nextUrl.clone()
    url.pathname = pathname === '/' ? '/prac' : `/prac${pathname}`
    const rewriteResponse = NextResponse.rewrite(url, { request })
    supabaseResponse.cookies.getAll().forEach((c) => rewriteResponse.cookies.set(c))
    return rewriteResponse
  }

  // ── CAS 4 — host principal + /prac* → 308 vers le sous-domaine ───────────────
  if (pHost && !isLocal && (pathname === '/prac' || pathname.startsWith('/prac/'))) {
    const rest = pathname.slice('/prac'.length) || '/'
    return NextResponse.redirect(new URL(`https://${pHost}${rest}${search}`), 308)
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
