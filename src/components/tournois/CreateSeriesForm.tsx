'use client'

// CreateSeriesForm — création d'une SÉRIE (page dédiée, admins globaux).
// Aperçu live du thème (preset + override 2 couleurs). Uploads logo/hero vers le
// bucket tournament-heroes (réutilisé). Création via EF create_series.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  callTournamentEF, seriesPath, slugify, RESERVED_SERIES_SLUGS,
} from '@/lib/tournois'
import { THEME_PRESETS, HEX_RE, resolveThemeVars } from '@/lib/tournois/themes'

const BUCKET = 'tournament-heroes'   // réutilisé pour les visuels de série
const MAX_BYTES = 5 * 1024 * 1024
const TYPES = ['image/png', 'image/jpeg', 'image/webp']
const SERIES_SLUG_RE = /^[a-z0-9-]+$/

const input: React.CSSProperties = {
  width: '100%', background: 'rgba(20,9,28,0.8)', border: '1px solid rgba(47,111,222,0.35)',
  borderRadius: 4, padding: '10px 12px', color: '#fff', fontFamily: 'Rajdhani, sans-serif', fontSize: 14, outline: 'none',
}
const label: React.CSSProperties = {
  display: 'block', color: '#8fc6f5', fontSize: 12, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 6,
}
const gap: React.CSSProperties = { marginBottom: 18 }
const small: React.CSSProperties = {
  background: 'rgba(28,58,110,0.6)', border: '1px solid rgba(47,111,222,0.4)', borderRadius: 4,
  color: '#8fc6f5', fontFamily: 'Rajdhani, sans-serif', fontWeight: 600, fontSize: 13, padding: '6px 10px', cursor: 'pointer',
}

export default function CreateSeriesForm() {
  const router = useRouter()

  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugEdited, setSlugEdited] = useState(false)
  const [description, setDescription] = useState('')
  const [preset, setPreset] = useState('xv2')
  const [primaryOn, setPrimaryOn] = useState(false)
  const [primary, setPrimary] = useState('#f06ad8')
  const [accentOn, setAccentOn] = useState(false)
  const [accent, setAccent] = useState('#2f6fde')
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [heroUrl, setHeroUrl] = useState<string | null>(null)
  const [isPublic, setIsPublic] = useState(true)
  const [sortOrder, setSortOrder] = useState('0')

  const [uploading, setUploading] = useState<'logo' | 'hero' | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function onName(v: string) {
    setName(v)
    if (!slugEdited) setSlug(slugify(v))
  }
  const slugReserved = RESERVED_SERIES_SLUGS.includes(slug)
  const slugValid = SERIES_SLUG_RE.test(slug) && !slugReserved

  // Aperçu live : couleurs effectives du thème (preset + override valides)
  const vars = resolveThemeVars(preset, primaryOn ? primary : null, accentOn ? accent : null)

  async function upload(kind: 'logo' | 'hero', e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setError(null)
    if (!TYPES.includes(file.type)) { setError('Format non supporté (png, jpeg ou webp).'); return }
    if (file.size > MAX_BYTES) { setError('Image trop lourde (5 Mo maximum).'); return }
    setUploading(kind)
    try {
      const supabase = createClient()
      const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
      const path = `series/${crypto.randomUUID()}.${ext}`
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false })
      if (upErr) { setError('Échec de l\'upload — réessaie.'); return }
      const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
      if (kind === 'logo') setLogoUrl(data.publicUrl); else setHeroUrl(data.publicUrl)
    } finally {
      setUploading(null)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (submitting) return
    setError(null)

    if (name.trim().length < 2) { setError('Le nom doit faire au moins 2 caractères.'); return }
    if (!slugValid) {
      setError(slugReserved ? `Le slug « ${slug} » est réservé.` : 'Slug invalide (minuscules, chiffres, tirets).')
      return
    }
    if (primaryOn && !HEX_RE.test(primary)) { setError('Couleur dominante invalide (#RRGGBB).'); return }
    if (accentOn && !HEX_RE.test(accent)) { setError('Couleur accent invalide (#RRGGBB).'); return }
    const so = Number(sortOrder)
    if (!Number.isInteger(so)) { setError('Ordre d\'affichage invalide.'); return }

    setSubmitting(true)
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setError('Session expirée — reconnecte-toi.'); setSubmitting(false); return }

    const { data, error: efError } = await callTournamentEF<{ slug: string }>(
      'tournament-admin',
      {
        action: 'create_series',
        display_name: name.trim(),
        slug,
        description: description.trim() || null,
        theme_preset: preset,
        theme_primary: primaryOn ? primary : null,
        theme_accent: accentOn ? accent : null,
        logo_url: logoUrl,
        hero_image_url: heroUrl,
        is_public: isPublic,
        sort_order: so,
      },
      session.access_token,
    )
    if (efError || !data?.slug) {
      setError(efError ?? 'Erreur lors de la création de la série.')
      setSubmitting(false)
      return
    }
    router.push(seriesPath(data.slug))
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={gap}>
        <label htmlFor="cs-name" style={label}>Nom de la série *</label>
        <input id="cs-name" type="text" value={name} onChange={(e) => onName(e.target.value)} required maxLength={60} placeholder="XV2" style={input} />
      </div>

      <div style={gap}>
        <label htmlFor="cs-slug" style={label}>Slug (URL) *</label>
        <input id="cs-slug" type="text" value={slug} onChange={(e) => { setSlugEdited(true); setSlug(slugify(e.target.value)) }}
          required placeholder="xv2" style={{ ...input, borderColor: slug && !slugValid ? 'rgba(224,49,49,0.6)' : input.border as string }} />
        <p className="xv2-data" style={{ margin: '6px 0 0', fontSize: 12, color: slug && !slugValid ? '#ff8787' : '#6e85a0' }}>
          {slug ? (slugReserved ? `« ${slug} » est réservé.` : slugValid ? `URL : …/${slug}` : 'Minuscules, chiffres et tirets.') : 'Généré depuis le nom — éditable.'}
        </p>
      </div>

      <div style={gap}>
        <label htmlFor="cs-desc" style={label}>Description (optionnel)</label>
        <textarea id="cs-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} style={{ ...input, resize: 'vertical' }} />
      </div>

      {/* Thème + aperçu live */}
      <div style={gap}>
        <label style={label}>Thème</label>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div style={{ flex: 1, minWidth: 200, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <select aria-label="Preset de thème" value={preset} onChange={(e) => setPreset(e.target.value)} style={input}>
              {THEME_PRESETS.map((p) => <option key={p} value={p}>Preset : {p}</option>)}
            </select>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#8fa0bb', fontSize: 13 }}>
              <input type="checkbox" checked={primaryOn} onChange={(e) => setPrimaryOn(e.target.checked)} />
              Dominante personnalisée
              {primaryOn && <input type="color" value={primary} onChange={(e) => setPrimary(e.target.value)} />}
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#8fa0bb', fontSize: 13 }}>
              <input type="checkbox" checked={accentOn} onChange={(e) => setAccentOn(e.target.checked)} />
              Accent personnalisé
              {accentOn && <input type="color" value={accent} onChange={(e) => setAccent(e.target.value)} />}
            </label>
          </div>
          {/* Aperçu live */}
          <div className="xv2-bg" style={{ ...vars, width: 180, borderRadius: 8, padding: 14, border: '1px solid rgba(255,255,255,0.1)' }}>
            <p className="xv2-display" style={{ margin: '0 0 8px', color: 'var(--xv2-pink)', fontSize: 16 }}>APERÇU</p>
            <div style={{ display: 'flex', gap: 6 }}>
              <span style={{ width: 28, height: 28, borderRadius: 4, background: 'var(--xv2-pink)' }} />
              <span style={{ width: 28, height: 28, borderRadius: 4, background: 'var(--xv2-blue)' }} />
            </div>
          </div>
        </div>
      </div>

      {/* Visuels */}
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', ...gap }}>
        {(['logo', 'hero'] as const).map((kind) => {
          const url = kind === 'logo' ? logoUrl : heroUrl
          const set = kind === 'logo' ? setLogoUrl : setHeroUrl
          return (
            <div key={kind} style={{ flex: 1, minWidth: 200 }}>
              <label style={label}>{kind === 'logo' ? 'Logo' : 'Image hero'} (optionnel)</label>
              {url ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt="" style={{ width: 64, height: 36, objectFit: 'cover', borderRadius: 4, border: '1px solid rgba(47,111,222,0.4)' }} />
                  <button type="button" style={{ ...small, color: '#ff8787', borderColor: 'rgba(224,49,49,0.4)' }} onClick={() => set(null)}>Retirer</button>
                </div>
              ) : (
                <input type="file" accept="image/png,image/jpeg,image/webp" disabled={uploading === kind} onChange={(e) => upload(kind, e)} style={{ ...input, padding: 8 }} />
              )}
              {uploading === kind && <p className="xv2-data" style={{ margin: '6px 0 0', fontSize: 12, color: '#8fc6f5' }}>Upload…</p>}
            </div>
          )
        })}
      </div>

      {/* Public + ordre */}
      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'center', ...gap }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#fff', fontSize: 14 }}>
          <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} />
          Série publique
        </label>
        <div>
          <label htmlFor="cs-order" style={{ ...label, display: 'inline-block', marginRight: 8 }}>Ordre</label>
          <input id="cs-order" type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} style={{ ...input, width: 90, display: 'inline-block' }} />
        </div>
      </div>

      {error && (
        <p role="alert" className="xv2-data" style={{ margin: '4px 0 16px', padding: '10px 14px', borderRadius: 4, fontSize: 14, background: 'rgba(224,49,49,0.12)', border: '1px solid rgba(224,49,49,0.4)', color: '#ff8787' }}>
          {error}
        </p>
      )}

      <div style={{ marginTop: 8 }}>
        <button type="submit" className="xv2-btn-primary" disabled={submitting || uploading !== null}
          style={{ border: 'none', opacity: submitting || uploading ? 0.6 : 1, cursor: submitting || uploading ? 'not-allowed' : 'pointer' }}>
          {submitting ? 'Création…' : 'Créer la série'}
        </button>
      </div>
    </form>
  )
}
