// Page vitrine publique : /patch-notes
// Server Component — SSR complet pour le SEO.
// Les données (patches + version DDragon) sont lues côté serveur et passées à PatchCard.

import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import PatchCard, { type PatchNote } from '@/components/patch-notes/PatchCard'

export const metadata = {
  title: 'Patch Notes LoL — Wyrm Forge',
  description:
    "Résumés en français des mises à jour League of Legends, rédigés par l'assistant IA Wyrm Forge. Suivez les changements de champions, items et systèmes patch après patch.",
}

const DDN = 'https://ddragon.leagueoflegends.com'

async function fetchDdragonVersion(): Promise<string> {
  try {
    const res = await fetch(`${DDN}/api/versions.json`, { next: { revalidate: 3600 } })
    if (!res.ok) return '15.10.1'
    const versions = await res.json() as string[]
    return versions[0] ?? '15.10.1'
  } catch {
    return '15.10.1'
  }
}

export default async function PatchNotesPage() {
  const supabase = await createClient()

  const [{ data: patches }, ddragonVersion] = await Promise.all([
    supabase
      .from('patch_notes')
      .select('id, version, title, summary_jsonb, image_url, published_at')
      .eq('status', 'published')
      .order('published_at', { ascending: false })
      .limit(20),
    fetchDdragonVersion(),
  ])

  const list = (patches ?? []) as PatchNote[]

  return (
    <main style={{
      minHeight: '100vh',
      background: '#130f1a',
      backgroundImage:
        'radial-gradient(900px 420px at 50% -120px, rgba(125,108,240,.2), transparent 70%), ' +
        'radial-gradient(600px 600px at 12% 30%, rgba(125,108,240,.05), transparent 70%)',
      padding: 'clamp(32px, 5vw, 72px) clamp(20px, 5vw, 48px)',
    }}>
      <div style={{ maxWidth: 920, margin: '0 auto' }}>

        {/* ── Navigation retour ────────────────────────────────────────── */}
        <Link
          href="/"
          style={{
            display: 'inline-block', marginBottom: 32,
            color: '#A79FB7', fontSize: 13, textDecoration: 'none',
            fontFamily: 'Cinzel, serif', letterSpacing: '.06em',
          }}
        >
          ← Accueil
        </Link>

        {/* ── Titre de la page ─────────────────────────────────────────── */}
        <div style={{ marginBottom: 48 }}>
          <p style={{
            fontFamily: 'Cinzel, serif', fontSize: 11, letterSpacing: '.34em',
            color: '#9D8BF5', textTransform: 'uppercase', margin: '0 0 12px',
          }}>
            Wyrm Forge · Archives
          </p>
          <h1 style={{
            fontFamily: 'Cinzel, serif', fontWeight: 600,
            fontSize: 'clamp(28px, 5vw, 44px)', lineHeight: 1.1,
            margin: '0 0 10px',
            background: 'linear-gradient(100deg,#EFE9F7 0%,#B9A7FB 46%,#E5AC5E 105%)',
            WebkitBackgroundClip: 'text', backgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}>
            Patch Notes
          </h1>
          <p style={{ color: '#A79FB7', fontSize: 15, margin: 0, fontStyle: 'italic' }}>
            Résumés des mises à jour League of Legends rédigés en français par l&apos;IA Wyrm Forge.
          </p>
        </div>

        {/* ── Contenu ──────────────────────────────────────────────────── */}
        {list.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: '60px 32px', borderRadius: 14,
            border: '2px dashed rgba(157,139,245,0.25)',
          }}>
            <p style={{ color: '#A79FB7', fontSize: 15, margin: 0 }}>
              Aucun patch notes publié pour l&apos;instant.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 48 }}>
            {list.map((patch, idx) => (
              <article
                key={patch.id}
                style={{
                  borderRadius: 16,
                  border: '1px solid rgba(255,255,255,0.06)',
                  background: 'rgba(26,20,34,0.6)',
                  padding: 'clamp(20px, 4vw, 36px)',
                  animationDelay: `${idx * 0.06}s`,
                }}
                className="pn-rise"
              >
                <PatchCard patch={patch} ddragonVersion={ddragonVersion} />
              </article>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
