import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  if (code) {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
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

    const { data: { session } } = await supabase.auth.exchangeCodeForSession(code)

    // Pour les nouveaux utilisateurs OAuth (Google, etc.) : créer le profil si absent
    if (session?.user) {
      const user = session.user
      const { data: existing } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', user.id)
        .single()

      if (!existing) {
        // Dériver un username depuis les métadonnées Google ou l'email
        const rawName: string =
          user.user_metadata?.full_name ??
          user.user_metadata?.name ??
          user.email?.split('@')[0] ??
          'Invocateur'

        // Nettoyer le username (retirer caractères spéciaux, max 32 chars)
        const username = rawName.replace(/[^a-zA-Z0-9_\- ]/g, '').trim().slice(0, 32) || 'Invocateur'

        await supabase.from('profiles').insert({
          id:         user.id,
          username,
          email:      user.email ?? '',
          tier:       'apprenti',
          certified:  false,
        })
      }
    }
  }

  return NextResponse.redirect(origin)
}
