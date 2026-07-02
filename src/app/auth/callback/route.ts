import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Cible de redirection de confiance — jamais origin tiré de request.url
// (vecteur open redirect si le header Host est forgé).
// NEXT_PUBLIC_SITE_URL doit être défini dans les env Vercel (ex: https://wyrm-forge.com).
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')

  const home  = new URL('/', SITE_URL)
  const error = new URL('/?error=auth', SITE_URL)

  if (!code) return NextResponse.redirect(home)

  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: { domain: process.env.NEXT_PUBLIC_COOKIE_DOMAIN || undefined },
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        },
      },
    }
  )

  // C2 / M4 — vérification de l'erreur d'échange de code
  const { data: { session }, error: sessionError } =
    await supabase.auth.exchangeCodeForSession(code)

  if (sessionError || !session?.user) {
    console.error('[auth/callback] exchangeCodeForSession:', sessionError?.message)
    return NextResponse.redirect(error)
  }

  const user = session.user

  const rawName: string =
    user.user_metadata?.full_name ??
    user.user_metadata?.name ??
    user.email?.split('@')[0] ??
    'Invocateur'

  const username =
    rawName.replace(/[^a-zA-Z0-9_\- ]/g, '').trim().slice(0, 32) || 'Invocateur'

  // M1 — atomique : upsert avec ignoreDuplicates évite la race condition
  //      double-clic / retry réseau (équivaut à INSERT … ON CONFLICT (id) DO NOTHING).
  // C1 — role: 'user' explicite (ceinture) + DEFAULT 'user' en DB (bretelles).
  // C2 — erreur vérifiée et propagée.
  const { error: insertError } = await supabase.from('profiles').upsert(
    {
      id:        user.id,
      username,
      email:     user.email ?? '',
      tier:      'apprenti',
      role:      'user',
      certified: false,
    },
    { onConflict: 'id', ignoreDuplicates: true }
  )

  if (insertError) {
    console.error('[auth/callback] profile upsert:', insertError.message)
    return NextResponse.redirect(error)
  }

  return NextResponse.redirect(home)
}
