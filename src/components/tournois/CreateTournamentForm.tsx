'use client'

// CreateTournamentForm — formulaire de création (bloc E).
// Upload hero → bucket Storage tournament-heroes (validé client : ≤5 Mo, png/jpeg/webp,
// nom = uuid). Création via EF tournament-admin (action create_tournament, garde
// is_tournament_admin REVÉRIFIÉE côté serveur). Succès → redirect /[slug]/admin.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  callTournamentEF,
  tournamentPath,
  slugify,
  RESERVED_TOURNAMENT_SLUGS,
  TOURNAMENT_CATEGORIES,
  TEAM_SIZES,
  DEFAULT_XV2_RULES,
  type TournamentSeries,
} from '@/lib/tournois'

// Cible d'édition (mode "Modifier le tournoi") — réutilise ce formulaire.
export interface EditTarget {
  id:              string
  serie:           string
  slug:            string
  name:            string
  format:          string
  map:             string
  max_teams:       number
  starts_at:       string | null
  category:        'amis' | 'communautaire'
  cashprize_label: string | null
  cashprize_bonus: string | null
  caster_name:     string | null
  twitch_url:      string | null
  hero_image_url:  string | null
  rules:           string[]
}

interface CreateTournamentFormProps {
  series:          TournamentSeries[]
  editing?:        EditTarget        // si présent → mode édition (update_tournament)
  preselectSerieId?: string          // série pré-sélectionnée + verrouillée (lien vitrine)
}

// ISO UTC → valeur "datetime-local" (heure locale) pour pré-remplir l'input
function isoToLocalInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const HERO_BUCKET   = 'tournament-heroes'
const MAX_HERO_BYTES = 5 * 1024 * 1024
const HERO_TYPES    = ['image/png', 'image/jpeg', 'image/webp']
const TWITCH_RE     = /^https:\/\/(www\.)?twitch\.tv\/.+/
const SLUG_RE       = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'rgba(20,9,28,0.8)',
  border: '1px solid rgba(47,111,222,0.35)',
  borderRadius: 4,
  padding: '10px 12px',
  color: '#fff',
  fontFamily: 'Rajdhani, sans-serif',
  fontSize: 14,
  outline: 'none',
}
const labelStyle: React.CSSProperties = {
  display: 'block',
  color: '#8fc6f5',
  fontSize: 12,
  textTransform: 'uppercase',
  letterSpacing: '.08em',
  marginBottom: 6,
}
const fieldGap: React.CSSProperties = { marginBottom: 18 }
const smallBtn: React.CSSProperties = {
  background: 'rgba(28,58,110,0.6)',
  border: '1px solid rgba(47,111,222,0.4)',
  borderRadius: 4,
  color: '#8fc6f5',
  fontFamily: 'Rajdhani, sans-serif',
  fontWeight: 600,
  fontSize: 13,
  padding: '6px 10px',
  cursor: 'pointer',
}

export default function CreateTournamentForm({ series, editing, preselectSerieId }: CreateTournamentFormProps) {
  const router = useRouter()
  const isEdit = !!editing

  const [name, setName]       = useState(editing?.name ?? '')
  const [slug, setSlug]       = useState(editing?.slug ?? '')
  const [slugEdited, setSlugEdited] = useState(false)
  const [format, setFormat]   = useState(editing?.format ?? '2V2')
  const [map, setMap]         = useState(editing?.map ?? 'ARAM')
  const [maxTeams, setMaxTeams] = useState<number>(editing?.max_teams ?? 8)
  const [startsAt, setStartsAt] = useState(isoToLocalInput(editing?.starts_at ?? null))
  // Série OBLIGATOIRE : une série existante (la création de série a sa page dédiée).
  const preselectValid = !!(preselectSerieId && series.some((s) => s.id === preselectSerieId))
  const [seriesSel, setSeriesSel] = useState<string>(
    (preselectValid ? preselectSerieId! : null) ?? series[0]?.id ?? '')
  const [category, setCategory] = useState<'amis' | 'communautaire'>(editing?.category ?? 'amis')
  const [cashLabel, setCashLabel]   = useState(editing?.cashprize_label ?? '')
  const [cashBonus, setCashBonus]   = useState(editing?.cashprize_bonus ?? '')
  const [caster, setCaster]         = useState(editing?.caster_name ?? '')
  const [twitch, setTwitch]         = useState(editing?.twitch_url ?? '')
  const [rules, setRules]           = useState<string[]>(editing?.rules ?? [...DEFAULT_XV2_RULES])

  const [heroUrl, setHeroUrl]       = useState<string | null>(editing?.hero_image_url ?? null)
  const [heroUploading, setHeroUploading] = useState(false)
  const [heroError, setHeroError]   = useState<string | null>(null)

  const [submitting, setSubmitting] = useState(false)
  const [error, setError]           = useState<string | null>(null)

  // ── Nom → slug auto (tant que le slug n'a pas été édité manuellement) ────────
  function onNameChange(v: string) {
    setName(v)
    if (!slugEdited) setSlug(slugify(v))
  }
  function onSlugChange(v: string) {
    setSlugEdited(true)
    setSlug(slugify(v))
  }

  const slugReserved = RESERVED_TOURNAMENT_SLUGS.includes(slug)
  const slugValid    = SLUG_RE.test(slug) && !slugReserved

  // ── Règles ───────────────────────────────────────────────────────────────────
  function setRule(i: number, v: string) {
    setRules((prev) => prev.map((r, idx) => (idx === i ? v : r)))
  }
  function addRule()      { setRules((prev) => [...prev, '']) }
  function removeRule(i: number) { setRules((prev) => prev.filter((_, idx) => idx !== i)) }
  function moveRule(i: number, dir: -1 | 1) {
    setRules((prev) => {
      const j = i + dir
      if (j < 0 || j >= prev.length) return prev
      const next = [...prev]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
  }

  // ── Upload hero ───────────────────────────────────────────────────────────────
  async function onHeroSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''   // permet de re-sélectionner le même fichier
    if (!file) return

    setHeroError(null)
    if (!HERO_TYPES.includes(file.type)) {
      setHeroError('Format non supporté (png, jpeg ou webp uniquement).')
      return
    }
    if (file.size > MAX_HERO_BYTES) {
      setHeroError('Image trop lourde (5 Mo maximum).')
      return
    }

    setHeroUploading(true)
    try {
      const supabase = createClient()
      const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
      const path = `${crypto.randomUUID()}.${ext}`
      const { error: upErr } = await supabase.storage
        .from(HERO_BUCKET)
        .upload(path, file, { contentType: file.type, upsert: false })
      if (upErr) {
        setHeroError('Échec de l\'upload — réessaie.')
        return
      }
      const { data } = supabase.storage.from(HERO_BUCKET).getPublicUrl(path)
      setHeroUrl(data.publicUrl)
    } finally {
      setHeroUploading(false)
    }
  }

  // ── Soumission ────────────────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (submitting) return
    setError(null)

    if (name.trim().length < 3) { setError('Le nom doit faire au moins 3 caractères.'); return }
    if (twitch.trim() && !TWITCH_RE.test(twitch.trim())) {
      setError('URL Twitch invalide (format https://twitch.tv/…).'); return
    }

    // ── Mode ÉDITION : update_tournament (slug & série non modifiables) ──────
    if (isEdit) {
      let starts_at: string | null = null
      if (startsAt) { const d = new Date(startsAt); if (!isNaN(d.getTime())) starts_at = d.toISOString() }
      setSubmitting(true)
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setError('Session expirée — reconnecte-toi.'); setSubmitting(false); return }
      const { error: efError } = await callTournamentEF('tournament-admin', {
        action: 'update_tournament',
        tournament_id: editing!.id,
        name: name.trim(),
        starts_at,
        category,
        cashprize_label: cashLabel.trim() || null,
        cashprize_bonus: cashBonus.trim() || null,
        caster_name: caster.trim() || null,
        twitch_url: twitch.trim() || null,
        rules: rules.map((r) => r.trim()).filter(Boolean),
        hero_image_url: heroUrl,
      }, session.access_token)
      if (efError) { setError(efError); setSubmitting(false); return }
      router.push(tournamentPath(editing!.serie, editing!.slug))
      return
    }

    if (!slugValid) {
      setError(slugReserved
        ? `Le slug « ${slug} » est réservé. Choisis-en un autre.`
        : 'Slug invalide (3 à 40 caractères : minuscules, chiffres, tirets).')
      return
    }
    if (twitch.trim() && !TWITCH_RE.test(twitch.trim())) {
      setError('URL Twitch invalide (format https://twitch.tv/…).')
      return
    }

    // Série obligatoire (existante uniquement)
    if (!seriesSel) { setError('Choisis une série.'); return }
    const sel = series.find((s) => s.id === seriesSel)
    if (!sel) { setError('Série introuvable.'); return }
    const seriesPayload: Record<string, unknown> = { series_id: sel.id }
    const serieSlugForRedirect = sel.slug

    const cleanRules = rules.map((r) => r.trim()).filter(Boolean)

    let starts_at: string | null = null
    if (startsAt) {
      const d = new Date(startsAt)          // datetime-local interprété en heure locale
      if (!isNaN(d.getTime())) starts_at = d.toISOString()   // → UTC
    }

    setSubmitting(true)
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      setError('Session expirée — reconnecte-toi.')
      setSubmitting(false)
      return
    }

    const { data, error: efError } = await callTournamentEF<{ slug: string }>(
      'tournament-admin',
      {
        action: 'create_tournament',
        ...seriesPayload,
        name: name.trim(),
        slug,
        format: format.trim() || '2V2',
        map: map.trim() || 'ARAM',
        max_teams: maxTeams,
        starts_at,
        category,
        cashprize_label: cashLabel.trim() || null,
        cashprize_bonus: cashBonus.trim() || null,
        caster_name: caster.trim() || null,
        twitch_url: twitch.trim() || null,
        rules: cleanRules,
        hero_image_url: heroUrl,
      },
      session.access_token,
    )

    if (efError || !data?.slug) {
      setError(efError ?? 'Erreur lors de la création du tournoi.')
      setSubmitting(false)
      return
    }

    // Succès → panneau organisateur du brouillon créé
    router.push(tournamentPath(serieSlugForRedirect, data.slug, '/admin'))
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column' }}>
      {/* Nom + slug */}
      <div style={fieldGap}>
        <label htmlFor="ct-name" style={labelStyle}>Nom du tournoi</label>
        <input id="ct-name" type="text" value={name} onChange={(e) => onNameChange(e.target.value)}
          required minLength={3} maxLength={80} placeholder="Tournoi de Noël XV2" style={inputStyle} />
      </div>

      {!isEdit && (
      <div style={fieldGap}>
        <label htmlFor="ct-slug" style={labelStyle}>Slug (URL)</label>
        <input id="ct-slug" type="text" value={slug} onChange={(e) => onSlugChange(e.target.value)}
          required placeholder="tournoi-noel-xv2" style={{
            ...inputStyle,
            borderColor: slug && !slugValid ? 'rgba(224,49,49,0.6)' : inputStyle.border as string,
          }} />
        <p className="xv2-data" style={{ margin: '6px 0 0', fontSize: 12, color: slug && !slugValid ? '#ff8787' : '#6e85a0' }}>
          {slug
            ? (slugReserved ? `« ${slug} » est réservé.` : slugValid ? `URL : …/${slug}` : 'Minuscules, chiffres et tirets (3 à 40 caractères).')
            : 'Généré depuis le nom — éditable.'}
        </p>
      </div>
      )}

      {/* Format / Map / Équipes — non éditables après création */}
      {!isEdit && (
      <>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', ...fieldGap }}>
        <div style={{ flex: 1, minWidth: 120 }}>
          <label htmlFor="ct-format" style={labelStyle}>Format</label>
          <input id="ct-format" type="text" value={format} onChange={(e) => setFormat(e.target.value)} style={inputStyle} />
        </div>
        <div style={{ flex: 1, minWidth: 120 }}>
          <label htmlFor="ct-map" style={labelStyle}>Carte</label>
          <input id="ct-map" type="text" value={map} onChange={(e) => setMap(e.target.value)} style={inputStyle} />
        </div>
        <div style={{ flex: 1, minWidth: 120 }}>
          <label htmlFor="ct-teams" style={labelStyle}>Nombre d&apos;équipes</label>
          <select id="ct-teams" value={maxTeams} onChange={(e) => setMaxTeams(Number(e.target.value))} style={inputStyle}>
            {TEAM_SIZES.map((n) => <option key={n} value={n}>{n} équipes</option>)}
          </select>
        </div>
      </div>
      <p className="xv2-data" style={{ margin: '-8px 0 18px', fontSize: 12, color: '#6e85a0' }}>
        Détermine la structure du bracket (double élimination). Il faudra exactement ce nombre d&apos;équipes validées pour générer le bracket.
      </p>
      </>
      )}

      {/* Date */}
      <div style={fieldGap}>
        <label htmlFor="ct-date" style={labelStyle}>Date & heure de début</label>
        <input id="ct-date" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} style={inputStyle} />
        <p className="xv2-data" style={{ margin: '6px 0 0', fontSize: 12, color: '#6e85a0' }}>
          Heure locale — stockée en UTC.
        </p>
      </div>

      {/* Série (obligatoire) / Catégorie */}
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', ...fieldGap }}>
        {!isEdit && (
        <div style={{ flex: 1, minWidth: 160 }}>
          <label htmlFor="ct-series" style={labelStyle}>Série *</label>
          <select id="ct-series" value={seriesSel} onChange={(e) => setSeriesSel(e.target.value)}
            required disabled={preselectValid} style={{ ...inputStyle, opacity: preselectValid ? 0.7 : 1 }}>
            {series.length === 0 && <option value="">Aucune série disponible</option>}
            {series.map((s) => <option key={s.id} value={s.id}>{s.display_name}</option>)}
          </select>
          <p className="xv2-data" style={{ margin: '6px 0 0', fontSize: 12, color: '#6e85a0' }}>
            {preselectValid
              ? 'Série verrouillée (création depuis sa vitrine).'
              : 'Crée une nouvelle série depuis « + Nouvelle série » sur le listing.'}
          </p>
        </div>
        )}
        <div style={{ flex: 1, minWidth: 160 }}>
          <label htmlFor="ct-cat" style={labelStyle}>Catégorie</label>
          <select id="ct-cat" value={category} onChange={(e) => setCategory(e.target.value as 'amis' | 'communautaire')} style={inputStyle}>
            {TOURNAMENT_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>

      {/* Cashprize */}
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', ...fieldGap }}>
        <div style={{ flex: 1, minWidth: 160 }}>
          <label htmlFor="ct-cash" style={labelStyle}>Cashprize (libellé)</label>
          <input id="ct-cash" type="text" value={cashLabel} onChange={(e) => setCashLabel(e.target.value)} placeholder="60€" style={inputStyle} />
        </div>
        <div style={{ flex: 1, minWidth: 160 }}>
          <label htmlFor="ct-bonus" style={labelStyle}>Bonus cashprize</label>
          <input id="ct-bonus" type="text" value={cashBonus} onChange={(e) => setCashBonus(e.target.value)} placeholder="+ ARÈNE PASS XV2" style={inputStyle} />
        </div>
      </div>

      {/* Caster / Twitch */}
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', ...fieldGap }}>
        <div style={{ flex: 1, minWidth: 160 }}>
          <label htmlFor="ct-caster" style={labelStyle}>Caster</label>
          <input id="ct-caster" type="text" value={caster} onChange={(e) => setCaster(e.target.value)} placeholder="WyrmCaster" style={inputStyle} />
        </div>
        <div style={{ flex: 1, minWidth: 160 }}>
          <label htmlFor="ct-twitch" style={labelStyle}>URL Twitch</label>
          <input id="ct-twitch" type="url" value={twitch} onChange={(e) => setTwitch(e.target.value)}
            placeholder="https://twitch.tv/wyrmforge" style={{
              ...inputStyle,
              borderColor: twitch.trim() && !TWITCH_RE.test(twitch.trim()) ? 'rgba(224,49,49,0.6)' : inputStyle.border as string,
            }} />
        </div>
      </div>

      {/* Règles — éditeur de liste ordonnée */}
      <div style={fieldGap}>
        <label style={labelStyle}>Règles</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {rules.map((r, i) => (
            <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <span className="xv2-data" style={{ color: '#6e85a0', fontSize: 12, width: 20 }}>{i + 1}.</span>
              <input type="text" value={r} onChange={(e) => setRule(i, e.target.value)} style={{ ...inputStyle, flex: 1 }} />
              <button type="button" style={smallBtn} onClick={() => moveRule(i, -1)} disabled={i === 0} aria-label="Monter">↑</button>
              <button type="button" style={smallBtn} onClick={() => moveRule(i, 1)} disabled={i === rules.length - 1} aria-label="Descendre">↓</button>
              <button type="button" style={{ ...smallBtn, color: '#ff8787', borderColor: 'rgba(224,49,49,0.4)' }} onClick={() => removeRule(i)} aria-label="Supprimer">✕</button>
            </div>
          ))}
        </div>
        <button type="button" style={{ ...smallBtn, marginTop: 10 }} onClick={addRule}>+ Ajouter une règle</button>
      </div>

      {/* Image hero */}
      <div style={fieldGap}>
        <label style={labelStyle}>Image d&apos;affiche (optionnel)</label>
        {heroUrl ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={heroUrl} alt="Aperçu de l'affiche" style={{ width: 160, height: 90, objectFit: 'cover', borderRadius: 4, border: '1px solid rgba(47,111,222,0.4)' }} />
            <button type="button" style={{ ...smallBtn, color: '#ff8787', borderColor: 'rgba(224,49,49,0.4)' }} onClick={() => setHeroUrl(null)}>
              Retirer l&apos;image
            </button>
          </div>
        ) : (
          <input type="file" accept="image/png,image/jpeg,image/webp" onChange={onHeroSelect} disabled={heroUploading}
            style={{ ...inputStyle, padding: 8 }} />
        )}
        {heroUploading && <p className="xv2-data" style={{ margin: '6px 0 0', fontSize: 12, color: '#8fc6f5' }}>Upload en cours…</p>}
        {heroError && <p role="alert" className="xv2-data" style={{ margin: '6px 0 0', fontSize: 12, color: '#ff8787' }}>{heroError}</p>}
        {!heroUrl && !heroError && (
          <p className="xv2-data" style={{ margin: '6px 0 0', fontSize: 12, color: '#6e85a0' }}>
            png/jpeg/webp, 5 Mo max. Sans image, une illustration Wyrm Forge sera utilisée.
          </p>
        )}
      </div>

      {/* Erreur globale */}
      {error && (
        <p role="alert" className="xv2-data" style={{
          margin: '4px 0 16px', padding: '10px 14px', borderRadius: 4, fontSize: 14,
          background: 'rgba(224,49,49,0.12)', border: '1px solid rgba(224,49,49,0.4)', color: '#ff8787',
        }}>
          {error}
        </p>
      )}

      <div style={{ marginTop: 8 }}>
        <button type="submit" className="xv2-btn-primary"
          disabled={submitting || heroUploading}
          style={{ border: 'none', opacity: submitting || heroUploading ? 0.6 : 1, cursor: submitting || heroUploading ? 'not-allowed' : 'pointer' }}>
          {submitting ? (isEdit ? 'Enregistrement…' : 'Création…') : (isEdit ? 'Enregistrer les modifications' : 'Créer le brouillon')}
        </button>
      </div>
    </form>
  )
}
