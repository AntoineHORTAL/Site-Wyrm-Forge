'use client'

import { useState, useEffect, useCallback } from 'react'
import { useTheme } from '@/components/providers/ThemeProvider'
import { useSession } from '@/components/providers/SessionProvider'
import { createClient } from '@/lib/supabase/client'
import { useDashboard, useLang } from '@/locales/dashboard'
import { kitProgressMessage, kitRpcError } from '@/locales/dashboard/kit'
import { formatDate } from '@/lib/intl'
import { formatKitPrice, type KitStatus, type KitOrderRow } from '@/lib/kit-orders'
import {
  KIT_FORMULAS, KIT_PRICE_CENTS, KIT_FIELD_MAX, EMPTY_KIT_FORM,
  validateKitForm, canSubmitKitForm, buildKitSnapshot, buildBookingUrl,
  type KitFormInput, type KitFormErrors, type KitFormula, type KitPlayerSnapshot,
} from '@/lib/kit-snapshot'
import { LOL_RANKS } from '@/app/profil/page'

/**
 * Onglet « Kit sur mesure » — surface UTILISATEUR FINAL (lot 2).
 *
 * ⚠️ LA GARDE DU FLAG N'EST PAS ICI. `Dashboard.tsx` décide de monter ou non cet
 * onglet (`kit_sur_mesure_enabled`, convention `'hidden'` : l'entrée disparaît,
 * l'admin la garde pour recetter). C'est le même point d'intégration que pour
 * Écailles et Scénarios — le dupliquer ici créerait deux endroits à corriger.
 *
 * ⚠️ ET LE FLAG N'EST PAS LA BARRIÈRE. `useFlag` ne masque qu'un onglet ; la
 * table est exposée par PostgREST et la RPC est accordée à `authenticated`. La
 * vraie garde est la relecture de `kit_sur_mesure_enabled` DANS
 * `kit_request_order` (migration 20260909000001). Ce composant n'est qu'une
 * commodité, au même titre que le panneau admin l'est vis-à-vis d'`is_admin()`.
 *
 * ⚠️ LE SNAPSHOT EST UN GEL. Le formulaire est pré-rempli depuis `profiles`,
 * mais ce qui part en base est une COPIE prise à l'instant de l'envoi. On ne
 * relit JAMAIS `profiles.riot_rank` pour afficher un dossier existant : cette
 * colonne bouge, et c'est précisément ce que le gel existe pour neutraliser.
 * L'écho du dossier plus bas lit `player_snapshot`, jamais le profil.
 */

/** Les cinq rôles, valeurs brutes — identiques dans les deux langues. */
const ROLES = ['TOP', 'JUNGLE', 'MID', 'ADC', 'SUPPORT'] as const

/**
 * Un dossier est-il encore « en cours » ?
 *
 * Miroir du prédicat de `uq_kit_orders_active` : c'est exactement la condition
 * qui fait refuser un second dépôt par la base. Un dossier clos rend donc le
 * formulaire au client, sans qu'on ait à le lui dire.
 */
const isOpen = (status: KitStatus) => status !== 'termine' && status !== 'annule'

export default function KitTab() {
  const { theme } = useTheme()
  const c = theme === 'mythic'
  const d = useDashboard()
  const lang = useLang()
  const K = d.kit
  const P = d.profil
  const { user, profile } = useSession()
  const supabase = createClient()

  const [order, setOrder]     = useState<KitOrderRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [form, setForm]       = useState<KitFormInput>(EMPTY_KIT_FORM)
  /** Les erreurs ne s'affichent qu'après une tentative d'envoi. */
  const [touched, setTouched] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  const accent = c ? '#EF9F27' : '#7F77DD'
  const border = c ? 'rgba(186,117,23,0.2)' : '#27272A'
  const bg     = c ? 'rgba(42,21,71,0.4)'   : '#18181B'
  const inputBg = c ? 'rgba(20,10,35,0.6)'  : '#27272A'

  /**
   * Charge le dossier de l'utilisateur.
   *
   * ⚠️ `.eq('user_id', user.id)` est OBLIGATOIRE, et pas une redondance de la
   * RLS. La policy `ko_select` dit `is_admin() OR auth.uid() = user_id` : pour un
   * ADMIN elle laisse passer TOUS les dossiers. Sans ce filtre, un admin qui
   * ouvre cet onglet pour recetter verrait le dossier de quelqu'un d'autre
   * présenté comme le sien.
   */
  const load = useCallback(async () => {
    if (!user) { setLoading(false); return }
    setLoading(true)
    const { data } = await supabase
      .from('kit_orders')
      .select('id, user_id, status, price_total_cents, admin_note, created_at, updated_at, player_snapshot')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
    const row = (data?.[0] ?? null) as (KitOrderRow & { player_snapshot: KitPlayerSnapshot }) | null
    setOrder(row)
    setLoading(false)
  }, [supabase, user])

  useEffect(() => { load() }, [load])

  // Pré-remplissage du rang depuis le profil — VALEUR INITIALE seulement. Le
  // champ reste modifiable : l'utilisateur a pu grimper depuis, ou ne jamais
  // l'avoir renseigné. C'est la saisie du formulaire qui est figée, pas le profil.
  useEffect(() => {
    if (profile?.riot_rank) setForm(f => (f.riot_rank ? f : { ...f, riot_rank: profile.riot_rank! }))
  }, [profile?.riot_rank])

  const errors: KitFormErrors = validateKitForm(form)
  const set = <F extends keyof KitFormInput>(field: F, value: KitFormInput[F]) =>
    setForm(f => ({ ...f, [field]: value }))

  async function submit() {
    setTouched(true)
    if (!canSubmitKitForm(form)) return

    setSending(true)
    setError(null)
    const snapshot = buildKitSnapshot(form, profile ?? {}, new Date().toISOString())
    const { error: rpcError } = await supabase.rpc('kit_request_order', { p_snapshot: snapshot })
    setSending(false)

    if (rpcError) { setError(rpcError.message); return }
    setForm(EMPTY_KIT_FORM)
    setTouched(false)
    await load()
  }

  const bookingUrl = buildBookingUrl(
    process.env.NEXT_PUBLIC_KIT_BOOKING_URL,
    { name: profile?.username, email: user?.email },
  )

  /* ── Styles partagés ──────────────────────────────────────────────────── */
  const card: React.CSSProperties = {
    padding: 18, borderRadius: 12, border: `1px solid ${border}`, background: bg,
  }
  const input: React.CSSProperties = {
    width: '100%', padding: '8px 11px', borderRadius: 7, fontSize: 13,
    fontFamily: 'inherit', border: `1px solid ${border}`,
    background: inputBg, color: 'inherit',
  }
  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 4,
  }

  /** Un champ de texte libre, avec son compteur et son erreur éventuelle. */
  const field = (
    key: keyof KitFormInput, label: string, placeholder: string, multiline = false,
  ) => {
    const err = touched ? errors[key] : undefined
    const value = form[key] as string
    return (
      <div style={{ marginBottom: 14 }}>
        <label style={labelStyle} htmlFor={`kit-${key}`}>{label}</label>
        {multiline ? (
          <textarea
            id={`kit-${key}`} rows={3} value={value} placeholder={placeholder}
            onChange={e => set(key, e.target.value as KitFormInput[typeof key])}
            style={{ ...input, resize: 'vertical', borderColor: err ? '#E24B4A' : border }}
          />
        ) : (
          <input
            id={`kit-${key}`} value={value} placeholder={placeholder}
            onChange={e => set(key, e.target.value as KitFormInput[typeof key])}
            style={{ ...input, borderColor: err ? '#E24B4A' : border }}
          />
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3 }}>
          <span style={{ fontSize: 11, color: '#E24B4A' }}>
            {err ? K.form.errors[err] : ''}
          </span>
          {/* Compteur affiché seulement quand on approche de la limite : le
              montrer d'emblée sur un champ vide met une contrainte en avant
              alors qu'on demande à quelqu'un de se raconter. */}
          {value.length > KIT_FIELD_MAX * 0.7 && (
            <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>
              {K.form.counter.replace('{n}', String(value.length)).replace('{max}', String(KIT_FIELD_MAX))}
            </span>
          )}
        </div>
      </div>
    )
  }

  if (loading) {
    return <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>{d.common.loading}</div>
  }

  /* ══════════════════════════════════════════════════════════════════════
     A — UN DOSSIER EST EN COURS : on montre son avancement, pas le formulaire
     ══════════════════════════════════════════════════════════════════════ */
  if (order && isOpen(order.status)) {
    const snap = (order as KitOrderRow & { player_snapshot?: KitPlayerSnapshot }).player_snapshot
    return (
      <div style={{ maxWidth: 720 }}>
        <div style={card}>
          <div style={{ fontSize: 12, color: accent, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700 }}>
            {K.existing.title}
          </div>
          <p style={{ fontSize: 15, margin: '10px 0 6px', lineHeight: 1.5 }}>
            {kitProgressMessage(K, order.status)}
          </p>
          <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
            {K.existing.since.replace('{date}',
              formatDate(new Date(order.created_at), lang, { day: '2-digit', month: 'long', year: 'numeric' }))}
          </div>
        </div>

        {/* Écho de ce que le client a rempli — relu depuis le SNAPSHOT FIGÉ.
            Jamais depuis `profiles` : le rang y a pu changer depuis, et afficher
            la valeur d'aujourd'hui ferait mentir la capture. */}
        {snap && (
          <div style={{ ...card, marginTop: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{K.existing.snapshotTitle}</div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 12 }}>
              {K.existing.snapshotHint}
            </div>
            <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 14px', fontSize: 13 }}>
              {([
                [K.form.rank,         snap.riot_rank ? P.riotRanks[snap.riot_rank as keyof typeof P.riotRanks] ?? snap.riot_rank : null],
                [K.form.role,         snap.role],
                [K.form.goals,        snap.goals],
                [K.form.availability, snap.availability],
                [K.form.liked,        snap.champions_liked],
                [K.form.disliked,     snap.champions_disliked],
                [K.form.playstyle,    snap.playstyle],
              ] as [string, string | null][])
                .filter(([, v]) => v)
                .map(([label, v]) => (
                  <div key={label} style={{ display: 'contents' }}>
                    <dt style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{label}</dt>
                    <dd style={{ margin: 0 }}>{v}</dd>
                  </div>
                ))}
            </dl>
          </div>
        )}

        {bookingUrl && (
          <div style={{ ...card, marginTop: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{K.booking.title}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', margin: '4px 0 10px' }}>{K.booking.hint}</div>
            <a
              href={bookingUrl} target="_blank" rel="noopener noreferrer"
              style={{
                display: 'inline-block', padding: '9px 18px', borderRadius: 8,
                background: accent, color: '#1A1A1A', fontWeight: 600,
                fontSize: 13, textDecoration: 'none',
              }}
            >{K.booking.action}</a>
          </div>
        )}
      </div>
    )
  }

  /* ══════════════════════════════════════════════════════════════════════
     B — AUCUN DOSSIER EN COURS : présentation, tarifs, et formulaire
     ══════════════════════════════════════════════════════════════════════ */
  return (
    <div style={{ maxWidth: 720 }}>
      {/* ── Présentation ─────────────────────────────────────────────── */}
      <div style={card}>
        <div style={{ fontSize: 11, color: accent, textTransform: 'uppercase', letterSpacing: 1.5, fontWeight: 700 }}>
          {K.pitch.eyebrow}
        </div>
        <h2 style={{ fontSize: 21, margin: '6px 0 4px', color: '#F5F2FA' }}>{K.pitch.title}</h2>
        <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: '0 0 14px' }}>{K.pitch.subtitle}</p>
        <ol style={{ margin: 0, paddingLeft: 20, fontSize: 13, lineHeight: 1.8 }}>
          {K.pitch.steps.map(s => <li key={s}>{s}</li>)}
        </ol>
      </div>

      {/* ── Formules ─────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 12, marginTop: 14, flexWrap: 'wrap' }}>
        {KIT_FORMULAS.map(f => {
          const picked = form.formula === f
          return (
            <button
              key={f} type="button"
              onClick={() => set('formula', f as KitFormula)}
              aria-pressed={picked}
              style={{
                flex: 1, minWidth: 200, textAlign: 'left', cursor: 'pointer',
                padding: 16, borderRadius: 12, fontFamily: 'inherit',
                background: picked ? 'rgba(255,255,255,0.04)' : 'transparent',
                border: `1px solid ${picked ? accent : border}`,
                color: 'inherit', transition: 'border-color 0.15s',
              }}
            >
              <div style={{ fontSize: 15, fontWeight: 700 }}>{K.formulas[f].name}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', margin: '2px 0 8px' }}>
                {K.formulas[f].who}
              </div>
              <div style={{ fontSize: 20, fontWeight: 700, color: picked ? accent : 'inherit' }}>
                {formatKitPrice(KIT_PRICE_CENTS[f], lang)}
              </div>
            </button>
          )
        })}
      </div>

      {/* ⚠️ Mention obligatoire tant que le lot 4 (Stripe) n'est pas livré :
          les prix sont affichés, rien n'est payable en ligne. */}
      <p style={{ fontSize: 12, color: 'var(--text-dim)', margin: '10px 2px 0' }}>
        {K.pitch.noPayment}
      </p>

      {/* ── Rendez-vous ──────────────────────────────────────────────── */}
      <div style={{ ...card, marginTop: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{K.booking.title}</div>
        {bookingUrl ? (
          <>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', margin: '4px 0 10px' }}>{K.booking.hint}</div>
            <a
              href={bookingUrl} target="_blank" rel="noopener noreferrer"
              style={{
                display: 'inline-block', padding: '9px 18px', borderRadius: 8,
                background: accent, color: '#1A1A1A', fontWeight: 600,
                fontSize: 13, textDecoration: 'none',
              }}
            >{K.booking.action}</a>
          </>
        ) : (
          // Aucune URL configurée : on ne rend PAS un bouton mort.
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{K.booking.fallback}</div>
        )}
      </div>

      {/* ── Formulaire de capture ────────────────────────────────────── */}
      <div style={{ ...card, marginTop: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{K.form.title}</div>
        <div style={{ fontSize: 11, color: 'var(--text-dim)', margin: '4px 0 16px' }}>{K.form.hint}</div>

        {/* Rang — pré-rempli depuis le profil, modifiable. C'est CETTE valeur
            qui est figée, pas celle de `profiles`. */}
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle} htmlFor="kit-rank">{K.form.rank}</label>
          <select
            id="kit-rank" value={form.riot_rank}
            onChange={e => set('riot_rank', e.target.value)}
            style={{ ...input, borderColor: touched && errors.riot_rank ? '#E24B4A' : border }}
          >
            <option value="">{K.form.rankPlaceholder}</option>
            {/* `r.key` EST la valeur écrite en base ; seul le libellé est traduit. */}
            {LOL_RANKS.map(r => <option key={r.key} value={r.key}>{P.riotRanks[r.key]}</option>)}
          </select>
          {touched && errors.riot_rank && (
            <span style={{ fontSize: 11, color: '#E24B4A' }}>{K.form.errors[errors.riot_rank]}</span>
          )}
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle} htmlFor="kit-role">{K.form.role}</label>
          <select
            id="kit-role" value={form.role}
            onChange={e => set('role', e.target.value)}
            style={input}
          >
            <option value="">{K.form.rolePlaceholder}</option>
            {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>

        {field('goals',              K.form.goals,        K.form.goalsPlaceholder, true)}
        {field('availability',       K.form.availability, K.form.availabilityPlaceholder)}
        {field('champions_liked',    K.form.liked,        K.form.likedPlaceholder)}
        {field('champions_disliked', K.form.disliked,     K.form.dislikedPlaceholder)}
        {field('playstyle',          K.form.playstyle,    K.form.playstylePlaceholder, true)}

        {/* Bloc binôme — rendu SEULEMENT en duo. Le laisser visible en solo
            ferait remplir des champs que le snapshot n'emportera pas. */}
        {form.formula === 'duo' && (
          <div style={{ marginTop: 4, paddingTop: 14, borderTop: `1px solid ${border}` }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{K.form.partnerTitle}</div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', margin: '4px 0 12px' }}>
              {K.form.partnerHint}
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ flex: 2, minWidth: 160 }}>
                {field('partner_gamename', K.form.partnerGamename, 'Faker')}
              </div>
              <div style={{ flex: 1, minWidth: 90 }}>
                {field('partner_tagline', K.form.partnerTagline, 'EUW')}
              </div>
            </div>
            <div>
              <label style={labelStyle} htmlFor="kit-partner-role">{K.form.partnerRole}</label>
              <select
                id="kit-partner-role" value={form.partner_role}
                onChange={e => set('partner_role', e.target.value)}
                style={input}
              >
                <option value="">{K.form.rolePlaceholder}</option>
                {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          </div>
        )}

        {touched && errors.size && (
          <div style={{ fontSize: 12, color: '#E24B4A', marginBottom: 10 }}>{K.form.sizeError}</div>
        )}

        {error && (
          <div style={{
            fontSize: 12, color: '#E24B4A', margin: '10px 0',
            padding: '8px 12px', borderRadius: 8,
            border: '1px solid rgba(226,75,74,0.3)', background: 'rgba(226,75,74,0.08)',
          }}>
            {K.form.errorPrefix.replace('{message}', kitRpcError(K, error))}
          </div>
        )}

        <button
          type="button" onClick={() => void submit()} disabled={sending}
          style={{
            marginTop: 8, padding: '10px 22px', borderRadius: 8, border: 'none',
            fontSize: 14, fontWeight: 600, fontFamily: 'inherit',
            background: accent, color: '#1A1A1A',
            cursor: sending ? 'not-allowed' : 'pointer', opacity: sending ? 0.6 : 1,
          }}
        >
          {sending ? K.form.submitting : K.form.submit}
        </button>
      </div>
    </div>
  )
}
