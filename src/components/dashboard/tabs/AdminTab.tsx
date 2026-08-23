'use client'

import { useState, useEffect, useCallback, Fragment } from 'react'
import { createPortal } from 'react-dom'
import { createClient } from '@/lib/supabase/client'
import { useTheme } from '@/components/providers/ThemeProvider'
import { IconMaximize, IconX } from '@tabler/icons-react'
import PatchCard, { type PatchData, type PatchNote as PatchCardNote } from '@/components/patch-notes/PatchCard'
import { useDashboard, useLang } from '@/locales/dashboard'
import type { Lang } from '@/locales/landing'
import { formatDate } from '@/lib/intl'
import { subscriptionTierLabel } from '@/locales/dashboard/nav'
import {
  profileRoleLabel, patchStatusLabel, patchGenReasonLabel,
  type AdminDict, type AdminSettingKey,
} from '@/locales/dashboard/admin'

// Le badge est rendu seul (icône sans texte) dans la colonne Utilisateur : son
// `aria-label` EST sa seule sortie pour un lecteur d'écran, il se traduit donc.
const CertifiedBadge = ({ size = 14 }: { size?: number }) => {
  const label = useDashboard().admin.actions.certifiedAlt
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-label={label} style={{ flexShrink: 0, display: 'block' }}>
      <circle cx="12" cy="12" r="10" fill="#3B82F6"/>
      <path d="M8 12.5l2.5 2.5 5.5-6" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

interface Profile {
  id: string
  username: string
  email?: string
  tier: string
  role: string
  certified: boolean
  tier_expires_at: string | null
  created_at?: string
}

/** Valeurs acceptées par `CHECK (status IN ('draft', 'published'))` sur `patch_notes`. */
export const PATCH_STATUSES = ['draft', 'published'] as const
type PatchStatus = typeof PATCH_STATUSES[number]

/** Valeurs de `profiles.role` (`text NOT NULL DEFAULT 'user'`). */
export const PROFILE_ROLES = ['user', 'admin'] as const

/**
 * Motifs de `{ skipped: true, reason }` renvoyés par l'Edge Function
 * `patch-notes-generator`. Recopiés depuis son `index.ts` : le client ne peut pas les
 * importer (code Deno), mais un motif inconnu reste affiché brut.
 */
export const PATCH_GEN_REASONS = ['already_generated', 'race_condition'] as const

interface PatchNote {
  id: number
  version: string
  title: string
  summary_jsonb: PatchData
  image_url: string | null
  status: PatchStatus
  created_at: string
  published_at: string | null
}

export const TIERS = ['apprenti', 'forgeron', 'maître', 'légion', 'architecte', 'architecte+']

const TIER_COLORS: Record<string, string> = {
  'apprenti':    '#A1A1AA',
  'forgeron':    '#5DCAA5',
  'maître':      '#7F77DD',
  'légion':      '#3A8AC9',
  'architecte':  '#BA7517',
  'architecte+': '#EF9F27',
}

/**
 * Raccourcis d'expiration. `key` indexe le libellé dans le dico ; `days` est la seule
 * donnée métier, elle reste ici — un libellé traduit ne doit jamais servir de clé.
 */
export const QUICK_DATES = [
  { key: 'm1', days: 30 },
  { key: 'm3', days: 90 },
  { key: 'm6', days: 180 },
  { key: 'y1', days: 365 },
] as const satisfies readonly { key: keyof AdminDict['quickDates']; days: number }[]

/** Clés `app_settings.key` gérées par ce panneau — pilotent le `.in()` ET l'état initial. */
export const ADMIN_SETTING_KEYS = [
  'patch_auto_publish', 'ecailles_enabled', 'shop_enabled', 'quests_enabled',
] as const satisfies readonly AdminSettingKey[]

function addDays(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

/** Format de date partagé par la colonne Expiration et la liste des patch notes. */
const FMT_DATE: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short', year: 'numeric' }

/**
 * Colonne Expiration : « À vie », « ⚠ Expiré », ou la date.
 *
 * Les deux libellés viennent du dico ; la DATE est formatée dans la langue affichée
 * depuis le Lot 8 (`lib/intl`), d'où le paramètre `lang`.
 */
function expiryLabel(iso: string | null, labels: AdminDict['expiry'], lang: Lang): string {
  if (!iso) return labels.lifetime
  const d = new Date(iso)
  const now = new Date()
  if (d < now) return labels.expired
  return formatDate(d, lang, FMT_DATE)
}

// Composant réutilisable pour un toggle de feature flag app_settings.
// Factorisé ici pour éviter la duplication de JSX entre patch_auto_publish
// et les flags Écailles — même rendu visuel garanti.
interface SettingToggleProps {
  label:       string
  description: string
  settingKey:  string
  value:       boolean
  saving:      boolean
  loading:     boolean
  onToggle:    (key: string) => void
  border:      string
  bg:          string
}
function SettingToggle({ label, description, settingKey, value, saving, loading, onToggle, border, bg }: SettingToggleProps) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '12px 16px', borderRadius: 8,
      background: bg, border: `1px solid ${border}`,
      gap: 16, flexWrap: 'wrap',
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#F5F2FA', marginBottom: 2 }}>
          {label}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
          {description}
        </div>
      </div>
      <button
        onClick={() => onToggle(settingKey)}
        disabled={saving || loading}
        aria-pressed={value}
        style={{
          flexShrink: 0,
          width: 52, height: 28, borderRadius: 14,
          background: value ? '#5DCAA5' : '#3F3F46',
          border: 'none', cursor: saving || loading ? 'not-allowed' : 'pointer',
          position: 'relative', transition: 'background 0.2s',
          opacity: saving || loading ? 0.6 : 1,
        }}
      >
        <span style={{
          position: 'absolute',
          top: 3, left: value ? 27 : 3,
          width: 22, height: 22, borderRadius: '50%',
          background: 'white', transition: 'left 0.2s',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 9, color: value ? '#5DCAA5' : '#71717A',
        }}>
          {saving ? '…' : (value ? '✓' : '')}
        </span>
      </button>
    </div>
  )
}

export default function AdminTab() {
  const { theme } = useTheme()
  const c = theme === 'mythic'
  const supabase = createClient()
  const dico = useDashboard()
  const lang = useLang()
  const A = dico.admin

  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]     = useState('')
  const [editId, setEditId]         = useState<string | null>(null)
  const [saving, setSaving]         = useState(false)
  const [successId, setSuccessId]   = useState<string | null>(null)
  const [saveError, setSaveError]   = useState<string | null>(null)
  const [confirmCertifyId, setConfirmCertifyId] = useState<string | null>(null)

  // Patch notes
  const [patches, setPatches]               = useState<PatchNote[]>([])
  const [patchesLoading, setPatchesLoading] = useState(true)
  const [generating, setGenerating]         = useState(false)
  const [genResult, setGenResult]           = useState<{ created?: boolean; skipped?: boolean; version?: string; reason?: string } | null>(null)
  const [genError, setGenError]             = useState<string | null>(null)
  const [editPatchId, setEditPatchId]           = useState<number | null>(null)
  const [editTitle, setEditTitle]               = useState('')
  const [editImageUrl, setEditImageUrl]         = useState('')
  const [editJsonRaw, setEditJsonRaw]           = useState('')
  const [editJsonError, setEditJsonError]       = useState<string | null>(null)
  const [savingPatch, setSavingPatch]           = useState(false)
  const [confirmDeleteId, setConfirmDeleteId]   = useState<number | null>(null)
  const [deletingId, setDeletingId]             = useState<number | null>(null)
  const [ddragonVersion, setDdragonVersion]     = useState('15.10.1')
  const [patchError, setPatchError]         = useState<string | null>(null)
  const [publishingId, setPublishingId]     = useState<number | null>(null)
  const [previewFullscreen, setPreviewFullscreen] = useState<PatchCardNote | null>(null)
  const [mounted, setMounted]               = useState(false)

  // Edit state
  const [eTier, setETier]           = useState('')
  // Tri-état : null = aucun choix d'expiration fait (ni « À vie » ni « Date »).
  // Force un choix explicite de l'admin → évite d'écrire null par défaut.
  const [eLifetime, setELifetime]   = useState<boolean | null>(null)
  const [eDate, setEDate]           = useState('')

  // Réglages globaux (app_settings) — feature flags
  // Objet plat : clé = key DB, valeur = booléen parsé depuis le TEXT 'true'/'false'
  const [settings, setSettings] = useState<Record<string, boolean>>(
    () => Object.fromEntries(ADMIN_SETTING_KEYS.map(k => [k, false])),
  )
  const [settingsLoading, setSettingsLoading] = useState(false)
  const [settingsSaving, setSettingsSaving]   = useState<string | null>(null)

  const border = c ? 'rgba(186,117,23,0.2)' : '#27272A'
  const bg     = c ? 'rgba(42,21,71,0.4)'   : '#18181B'

  // Charge les feature flags depuis app_settings.
  // On ne charge que les clés gérées dans ce panneau pour éviter
  // de mapper des clés inconnues (cap_daily_scales, streak_bonus_pct, etc.).
  const loadSettings = useCallback(async () => {
    setSettingsLoading(true)
    const { data } = await supabase
      .from('app_settings')
      .select('key, value')
      .in('key', [...ADMIN_SETTING_KEYS])
    if (data) {
      const mapped: Record<string, boolean> = {}
      for (const row of data) mapped[row.key] = row.value === 'true'
      setSettings(prev => ({ ...prev, ...mapped }))
    }
    setSettingsLoading(false)
  }, [supabase])

  // Met à jour un seul flag — optimistic update puis écriture DB.
  // La policy as_update_admin côté serveur garantit qu'un non-admin
  // ne peut pas écrire même si ce composant est affiché (RLS enforcement).
  async function toggleSetting(key: string) {
    const next = !settings[key]
    setSettings(prev => ({ ...prev, [key]: next }))
    setSettingsSaving(key)
    await supabase
      .from('app_settings')
      .update({ value: next ? 'true' : 'false' })
      .eq('key', key)
    setSettingsSaving(null)
  }

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('profiles')
      .select('id, username, email, tier, role, certified, tier_expires_at, created_at')
      .order('created_at', { ascending: false })
    setProfiles(data ?? [])
    setLoading(false)
  }, [supabase])

  const loadPatches = useCallback(async () => {
    setPatchesLoading(true)
    const [{ data }, vRes] = await Promise.all([
      supabase
        .from('patch_notes')
        .select('id, version, title, summary_jsonb, image_url, status, created_at, published_at')
        .order('created_at', { ascending: false })
        .limit(20),
      fetch('https://ddragon.leagueoflegends.com/api/versions.json').catch(() => null),
    ])
    setPatches((data ?? []) as PatchNote[])
    if (vRes?.ok) {
      const versions = await vRes.json() as string[]
      if (versions[0]) setDdragonVersion(versions[0])
    }
    setPatchesLoading(false)
  }, [supabase])

  async function generate() {
    setGenerating(true)
    setGenResult(null)
    setGenError(null)
    const { data, error } = await supabase.functions.invoke('patch-notes-generator')
    setGenerating(false)
    if (error) { setGenError(error.message); return }
    setGenResult(data as typeof genResult)
    if ((data as { created?: boolean })?.created) loadPatches()
  }

  async function publishPatch(id: number) {
    setPublishingId(id)
    setPatchError(null)
    const { error } = await supabase.from('patch_notes')
      .update({ status: 'published', published_at: new Date().toISOString() })
      .eq('id', id)
    if (error) { setPatchError(error.message); setPublishingId(null); return }
    await loadPatches()
    setPublishingId(null)
  }

  async function unpublishPatch(id: number) {
    setPublishingId(id)
    setPatchError(null)
    const { error } = await supabase.from('patch_notes')
      .update({ status: 'draft', published_at: null })
      .eq('id', id)
    if (error) { setPatchError(error.message); setPublishingId(null); return }
    await loadPatches()
    setPublishingId(null)
  }

  async function deletePatch(id: number) {
    setDeletingId(id)
    setPatchError(null)
    const { error } = await supabase.from('patch_notes').delete().eq('id', id)
    setDeletingId(null)
    setConfirmDeleteId(null)
    if (error) { setPatchError(error.message); return }
    await loadPatches()
  }

  async function savePatchEdit(id: number) {
    if (editJsonError) { setPatchError(A.patches.invalidJsonFix); return }
    let parsedJson: PatchData
    try { parsedJson = JSON.parse(editJsonRaw) as PatchData }
    catch { setPatchError(A.patches.invalidJson); return }
    setSavingPatch(true)
    setPatchError(null)
    const { error } = await supabase.from('patch_notes')
      .update({ title: editTitle, summary_jsonb: parsedJson, image_url: editImageUrl || null })
      .eq('id', id)
    setSavingPatch(false)
    if (error) { setPatchError(error.message); return }
    setEditPatchId(null)
    await loadPatches()
  }

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    if (!previewFullscreen) return
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setPreviewFullscreen(null) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [previewFullscreen])

  useEffect(() => { load(); loadPatches(); loadSettings() }, [load, loadPatches, loadSettings])

  function startEdit(p: Profile) {
    setEditId(p.id)
    setETier(p.tier)
    // Aucune pré-sélection de l'expiration : l'admin doit cliquer explicitement
    // « ♾ À vie » ou « 📅 Date » (le défaut « À vie » masquait une écriture null
    // silencieuse quand on voulait en fait poser une date).
    setELifetime(null)
    setEDate(p.tier_expires_at ? p.tier_expires_at.slice(0, 10) : addDays(365))
    setSaveError(null)
  }

  async function toggleCertify(p: Profile) {
    setSaving(true)
    await supabase.from('profiles').update({ certified: !p.certified }).eq('id', p.id)
    await load()
    setConfirmCertifyId(null)
    setSaving(false)
    setSuccessId(p.id)
    setTimeout(() => setSuccessId(null), 2500)
  }

  async function save(id: string) {
    if (eLifetime === null) return   // choix d'expiration non fait (bouton désactivé)
    setSaving(true)
    setSaveError(null)
    // `.select()` : sans lui, un UPDATE bloqué par RLS (0 ligne touchée) renvoie
    // error=null → faux succès. On vérifie donc AUSSI que des lignes sont revenues.
    const { data, error } = await supabase.from('profiles').update({
      tier: eTier,
      tier_expires_at: eLifetime ? null : (eDate ? new Date(eDate).toISOString() : null),
    }).eq('id', id).select()
    if (error || !data || data.length === 0) {
      setSaving(false)
      setSaveError(error?.message ?? A.edit.noRows)
      return
    }
    await load()
    setEditId(null)
    setSaving(false)
    setSuccessId(id)
    setTimeout(() => setSuccessId(null), 2500)
  }

  const filtered = profiles.filter(p =>
    p.username.toLowerCase().includes(search.toLowerCase()) ||
    (p.email ?? '').toLowerCase().includes(search.toLowerCase())
  )

  // Comptes avec expiration définie uniquement (hors "à vie") pour ne pas biaiser les stats
  const withExpiry = profiles.filter(p => p.tier_expires_at !== null && p.role !== 'admin')

  const stats = {
    total:      profiles.length,
    certified:  profiles.filter(p => p.certified).length,
    // Abonnés actifs = tier payant + expiration définie + pas encore expirée
    activeSubscribers: withExpiry.filter(p =>
      p.tier !== 'apprenti' && new Date(p.tier_expires_at!) > new Date()
    ).length,
    expiring: withExpiry.filter(p => {
      const exp = new Date(p.tier_expires_at!)
      const soon = new Date(); soon.setDate(soon.getDate() + 14)
      return exp > new Date() && exp < soon
    }).length,
  }

  // Comptage par tier — hors comptes à vie (tier_expires_at = null) et hors admins
  const tierCounts = TIERS.map(t => ({
    tier: t,
    count: withExpiry.filter(p => p.tier === t && new Date(p.tier_expires_at!) > new Date()).length,
  }))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Admin badge */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '12px 18px', borderRadius: 8,
        background: c ? 'rgba(186,117,23,0.08)' : 'rgba(226,75,74,0.06)',
        border: `1px solid ${c ? 'rgba(186,117,23,0.3)' : 'rgba(226,75,74,0.25)'}`,
      }}>
        <span style={{ fontSize: 18 }}>🛡️</span>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: c ? '#FAC775' : '#F5F2FA' }}>
            {A.banner.title}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
            {A.banner.subtitle}
          </div>
        </div>
      </div>

      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10 }}>
        {[
          { key: 'total',     label: A.kpis.total,             value: stats.total,             color: '#F5F2FA' },
          { key: 'certified', label: A.kpis.certified,         value: stats.certified,         color: '#3B82F6' },
          { key: 'active',    label: A.kpis.activeSubscribers, value: stats.activeSubscribers, color: '#5DCAA5' },
          { key: 'expiring',  label: A.kpis.expiring,          value: stats.expiring,          color: stats.expiring > 0 ? '#E24B4A' : 'var(--text-dim)' },
        ].map(k => (
          <div key={k.key} style={{ padding: '14px 16px', borderRadius: 8, background: bg, border: `1px solid ${border}` }}>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>{k.label}</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: k.color }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Répartition par tier (hors comptes à vie) */}
      <div style={{ padding: '16px 18px', borderRadius: 10, background: bg, border: `1px solid ${border}` }}>
        <div style={{ fontSize: 12, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12, fontWeight: 600 }}>
          {A.breakdown.title} <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>{A.breakdown.hint}</span>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {tierCounts.map(({ tier, count }) => (
            <div key={tier} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 14px', borderRadius: 8,
              background: c ? 'rgba(20,10,35,0.5)' : '#0F0F11',
              border: `1px solid ${count > 0 ? `${TIER_COLORS[tier]}40` : border}`,
            }}>
              <span style={{
                width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                background: TIER_COLORS[tier],
                opacity: count > 0 ? 1 : 0.3,
              }} />
              {/* `tier` reste la VALEUR métier (clé de couleur, clé de comptage) ;
                  seul son libellé passe par le dico — le même que la carte d'abonnement. */}
              <span style={{ fontSize: 12, color: count > 0 ? TIER_COLORS[tier] : 'var(--text-dim)', textTransform: 'capitalize', fontWeight: 500 }}>
                {subscriptionTierLabel(dico.nav, tier)}
              </span>
              <span style={{ fontSize: 14, fontWeight: 700, color: count > 0 ? '#F5F2FA' : 'var(--text-dim)' }}>
                {count}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Search */}
      <input
        value={search} onChange={e => setSearch(e.target.value)}
        placeholder={A.searchPlaceholder}
        style={{
          padding: '10px 14px', borderRadius: 8, fontSize: 13,
          background: c ? 'rgba(20,10,35,0.6)' : '#18181B',
          border: `1px solid ${border}`, color: '#F5F2FA',
          fontFamily: 'inherit', outline: 'none',
        }}
      />

      {/* Table */}
      <div style={{ borderRadius: 10, background: bg, border: `1px solid ${border}`, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-dim)', fontSize: 14 }}>
            {dico.common.loading}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', minWidth: 760, tableLayout: 'fixed', borderCollapse: 'collapse', fontSize: 13 }}>
              {/* Largeurs FIXES : les colonnes ne dépendent plus du contenu.
                  Empêche tout saut de largeur quand le contenu d'une cellule
                  change (confirmation inline de certification, badge « Certifié »,
                  « ✓ Sauvegardé »…). */}
              <colgroup>
                <col style={{ width: '32%' }} />{/* Utilisateur */}
                <col style={{ width: '11%' }} />{/* Tier */}
                <col style={{ width: '17%' }} />{/* Expiration */}
                <col style={{ width: '11%' }} />{/* Rôle */}
                <col style={{ width: '29%' }} />{/* Actions */}
              </colgroup>
              <thead>
                <tr style={{ background: c ? 'rgba(20,10,35,0.5)' : '#0F0F11' }}>
                  {/* `key` = clé de colonne, pas le libellé : un `key` qui change avec la
                      langue remonterait chaque `th` à chaque bascule FR/EN. */}
                  {(['user', 'tier', 'expiry', 'role', 'actions'] as const).map(col => (
                    <th key={col} style={{
                      padding: '10px 16px', textAlign: 'left',
                      color: 'var(--text-dim)', fontSize: 11,
                      textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600,
                    }}>{A.columns[col]}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(p => (
                  <Fragment key={p.id}>
                    {/* Main row */}
                    <tr key={p.id} style={{
                      borderTop: `1px solid ${border}`,
                      background: editId === p.id ? (c ? 'rgba(127,119,221,0.05)' : 'rgba(127,119,221,0.04)') : 'transparent',
                    }}>
                      {/* Username */}
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{
                            width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
                            background: p.role === 'admin'
                              ? 'linear-gradient(135deg, #BA7517, #EF9F27)'
                              : 'linear-gradient(135deg, #7F77DD, #534AB7)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 11, fontWeight: 700, color: 'white',
                          }}>{p.username.slice(0, 2).toUpperCase()}</div>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ color: '#F5F2FA', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 5 }}>
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.username}</span>
                              {p.certified && <CertifiedBadge size={13} />}
                            </div>
                            {p.email && (
                              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.email}</div>
                            )}
                          </div>
                          {successId === p.id && (
                            <span style={{ fontSize: 11, color: '#5DCAA5' }}>{A.actions.saved}</span>
                          )}
                        </div>
                      </td>

                      {/* Tier */}
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{
                          fontSize: 12, fontWeight: 600,
                          color: TIER_COLORS[p.tier] ?? '#A1A1AA',
                          textTransform: 'capitalize',
                        }}>{subscriptionTierLabel(dico.nav, p.tier)}</span>
                      </td>

                      {/* Expiration */}
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{
                          fontSize: 12,
                          color: !p.tier_expires_at ? '#5DCAA5'
                            : new Date(p.tier_expires_at) < new Date() ? '#E24B4A'
                            : 'var(--text-muted)',
                        }}>{expiryLabel(p.tier_expires_at, A.expiry, lang)}</span>
                      </td>

                      {/* Role — la BRANCHE reste sur la valeur métier (c'est elle qui
                          choisit le style du badge), seul le libellé vient du dico. */}
                      <td style={{ padding: '12px 16px' }}>
                        {p.role === 'admin' ? (
                          <span style={{
                            fontSize: 11, padding: '3px 8px', borderRadius: 4,
                            background: c ? 'rgba(186,117,23,0.15)' : 'rgba(226,75,74,0.1)',
                            border: `1px solid ${c ? 'rgba(186,117,23,0.4)' : 'rgba(226,75,74,0.3)'}`,
                            color: c ? '#FAC775' : '#E24B4A', textTransform: 'uppercase', letterSpacing: 1,
                          }}>{profileRoleLabel(A, p.role)}</span>
                        ) : (
                          <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{profileRoleLabel(A, p.role)}</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {/* Modifier (non-admin only) */}
                          {p.role !== 'admin' && (
                            <button
                              onClick={() => { editId === p.id ? setEditId(null) : startEdit(p); setConfirmCertifyId(null) }}
                              style={{
                                padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 500,
                                background: editId === p.id ? 'transparent' : (c ? 'rgba(127,119,221,0.15)' : 'rgba(127,119,221,0.12)'),
                                border: `1px solid ${editId === p.id ? border : (c ? 'rgba(127,119,221,0.4)' : '#7F77DD')}`,
                                color: editId === p.id ? 'var(--text-dim)' : (c ? '#FAFAFA' : '#7F77DD'),
                                cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
                              }}
                            >{editId === p.id ? dico.common.cancel : A.actions.edit}</button>
                          )}

                          {/* Certifier / Retirer */}
                          {p.role !== 'admin' && (
                            confirmCertifyId === p.id ? (
                              /* Confirmation inline */
                              <div style={{
                                display: 'flex', alignItems: 'center', gap: 6,
                                padding: '4px 10px', borderRadius: 6,
                                background: p.certified
                                  ? 'rgba(226,75,74,0.08)'
                                  : 'rgba(59,130,246,0.08)',
                                border: `1px solid ${p.certified ? 'rgba(226,75,74,0.3)' : 'rgba(59,130,246,0.3)'}`,
                              }}>
                                <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                                  {(p.certified ? A.actions.confirmUncertify : A.actions.confirmCertify).replace('{name}', p.username)}
                                </span>
                                <button
                                  onClick={() => toggleCertify(p)}
                                  disabled={saving}
                                  style={{
                                    padding: '3px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                                    background: p.certified ? '#E24B4A' : '#3B82F6',
                                    border: 'none', color: 'white',
                                    cursor: saving ? 'not-allowed' : 'pointer',
                                    opacity: saving ? 0.7 : 1, fontFamily: 'inherit',
                                  }}
                                >{saving ? '…' : A.actions.confirm}</button>
                                <button
                                  onClick={() => setConfirmCertifyId(null)}
                                  style={{
                                    padding: '3px 6px', borderRadius: 4, fontSize: 11,
                                    background: 'transparent', border: `1px solid ${border}`,
                                    color: 'var(--text-dim)', cursor: 'pointer', fontFamily: 'inherit',
                                  }}
                                >{A.actions.dismiss}</button>
                              </div>
                            ) : (
                              <button
                                onClick={() => { setConfirmCertifyId(p.id); setEditId(null) }}
                                style={{
                                  padding: '5px 10px', borderRadius: 6, fontSize: 12, fontWeight: 500,
                                  display: 'flex', alignItems: 'center', gap: 5,
                                  background: p.certified
                                    ? 'rgba(59,130,246,0.12)'
                                    : 'transparent',
                                  border: `1px solid ${p.certified ? 'rgba(59,130,246,0.4)' : border}`,
                                  color: p.certified ? '#3B82F6' : 'var(--text-dim)',
                                  cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
                                }}
                              >
                                {p.certified
                                  ? <><CertifiedBadge size={12} /> {A.actions.certified}</>
                                  : A.actions.certify
                                }
                              </button>
                            )
                          )}
                        </div>
                      </td>
                    </tr>

                    {/* Inline edit row */}
                    {editId === p.id && (
                      <tr key={`edit-${p.id}`} style={{ borderTop: `1px solid ${border}` }}>
                        <td colSpan={5} style={{ padding: '16px 20px' }}>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-end' }}>
                            {/* Tier selector */}
                            <div>
                              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>{A.edit.tierLabel}</div>
                              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                {TIERS.map(t => (
                                  <button key={t} onClick={() => setETier(t)} style={{
                                    padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 500,
                                    border: `1px solid ${eTier === t ? (TIER_COLORS[t] ?? border) : border}`,
                                    background: eTier === t ? `${TIER_COLORS[t]}18` : 'transparent',
                                    color: eTier === t ? (TIER_COLORS[t] ?? '#F5F2FA') : 'var(--text-muted)',
                                    cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
                                    textTransform: 'capitalize',
                                  }}>{subscriptionTierLabel(dico.nav, t)}</button>
                                ))}
                              </div>
                            </div>

                            {/* Expiration */}
                            <div>
                              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>{A.edit.expiryLabel}</div>
                              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                                <button onClick={() => setELifetime(true)} style={{
                                  padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                                  border: `1px solid ${eLifetime ? '#5DCAA5' : border}`,
                                  background: eLifetime ? 'rgba(93,202,165,0.12)' : 'transparent',
                                  color: eLifetime ? '#5DCAA5' : 'var(--text-muted)',
                                  cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
                                }}>{A.edit.lifetime}</button>

                                <button onClick={() => setELifetime(false)} style={{
                                  padding: '6px 14px', borderRadius: 6, fontSize: 12,
                                  border: `1px solid ${eLifetime === false ? (c ? '#BA7517' : '#7F77DD') : border}`,
                                  background: eLifetime === false ? (c ? 'rgba(186,117,23,0.12)' : 'rgba(127,119,221,0.12)') : 'transparent',
                                  color: eLifetime === false ? (c ? '#FAC775' : '#FAFAFA') : 'var(--text-muted)',
                                  cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
                                }}>{A.edit.date}</button>

                                {eLifetime === false && (
                                  <>
                                    {QUICK_DATES.map(q => (
                                      <button key={q.key} onClick={() => setEDate(addDays(q.days))} style={{
                                        padding: '5px 10px', borderRadius: 6, fontSize: 11,
                                        border: `1px solid ${border}`,
                                        background: 'transparent', color: 'var(--text-muted)',
                                        cursor: 'pointer', fontFamily: 'inherit',
                                      }}>{A.quickDates[q.key]}</button>
                                    ))}
                                    <input
                                      type="date" value={eDate}
                                      onChange={e => setEDate(e.target.value)}
                                      style={{
                                        padding: '5px 10px', borderRadius: 6, fontSize: 12,
                                        background: c ? 'rgba(20,10,35,0.6)' : '#27272A',
                                        border: `1px solid ${border}`, color: '#F5F2FA',
                                        fontFamily: 'inherit', outline: 'none',
                                        colorScheme: 'dark',
                                      }}
                                    />
                                  </>
                                )}
                              </div>
                            </div>

                            {/* Save */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
                              <button
                                onClick={() => save(p.id)}
                                disabled={saving || eLifetime === null}
                                style={{
                                  padding: '8px 20px', borderRadius: 6, fontSize: 13, fontWeight: 600,
                                  background: 'linear-gradient(135deg, #7F77DD, #534AB7)',
                                  border: 'none', color: 'white',
                                  cursor: (saving || eLifetime === null) ? 'not-allowed' : 'pointer',
                                  opacity: (saving || eLifetime === null) ? 0.7 : 1,
                                  fontFamily: 'inherit',
                                }}
                              >{saving ? '…' : A.edit.save}</button>
                              {eLifetime === null && (
                                <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{A.edit.chooseExpiry}</span>
                              )}
                              {saveError && (
                                <span style={{ fontSize: 11, color: '#E24B4A' }}>✗ {saveError}</span>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {/* ── Section Patch Notes ─────────────────────────────────────── */}
      <div style={{ marginTop: 8 }}>
        <div style={{
          fontSize: 12, color: 'var(--text-dim)', textTransform: 'uppercase',
          letterSpacing: 1, fontWeight: 600, marginBottom: 12,
        }}>{A.patches.title}</div>

        {/* Toggle publication automatique */}
        <SettingToggle
          label={A.settings.patch_auto_publish.label}
          description={A.settings.patch_auto_publish.description}
          settingKey="patch_auto_publish"
          value={settings.patch_auto_publish}
          saving={settingsSaving === 'patch_auto_publish'}
          loading={settingsLoading}
          onToggle={toggleSetting}
          border={border}
          bg={bg}
        />

        {/* Bouton génération + feedback */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginTop: 14, marginBottom: 14 }}>
          <button
            onClick={generate}
            disabled={generating}
            style={{
              padding: '8px 18px', borderRadius: 6, fontSize: 13, fontWeight: 600,
              background: generating
                ? 'rgba(127,119,221,0.1)'
                : 'linear-gradient(135deg, #7F77DD, #534AB7)',
              border: generating ? `1px solid ${border}` : 'none',
              color: generating ? 'var(--text-dim)' : 'white',
              cursor: generating ? 'wait' : 'pointer',
              fontFamily: 'inherit', transition: 'opacity 0.15s',
            }}
          >{generating ? A.patches.generating : A.patches.generate}</button>

          {genResult?.created && (
            <span style={{ fontSize: 12, color: '#5DCAA5' }}>
              {A.patches.genCreated.replace('{version}', genResult.version ?? '')}
            </span>
          )}
          {genResult?.skipped && (
            <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>
              {/* `reason` est un CODE renvoyé par l'Edge Function ; un code inconnu
                  reste affiché tel quel, un `reason` absent retombe sur « déjà généré ». */}
              {A.patches.genSkipped.replace('{reason}', patchGenReasonLabel(A, genResult.reason))}
            </span>
          )}
          {genError && (
            <span style={{ fontSize: 12, color: '#E24B4A' }}>
              ✗ {genError}
            </span>
          )}
        </div>

        {/* Erreur d'action patch (publish/unpublish/save) */}
        {patchError && (
          <div style={{
            marginBottom: 10, padding: '8px 12px', borderRadius: 6, fontSize: 12,
            background: 'rgba(226,75,74,0.08)', border: '1px solid rgba(226,75,74,0.3)',
            color: '#E24B4A',
          }}>
            {/* `patchError` est soit un message Supabase (non traduisible), soit un
                refus de JSON invalide déjà pris dans le dico. */}
            {A.patches.errorPrefix.replace('{message}', patchError)}
          </div>
        )}

        {/* Liste des patch notes */}
        {patchesLoading ? (
          <div style={{ fontSize: 13, color: 'var(--text-dim)', padding: '12px 0' }}>{dico.common.loading}</div>
        ) : patches.length === 0 ? (
          <div style={{
            padding: '20px', borderRadius: 8, textAlign: 'center',
            background: bg, border: `1px dashed ${border}`,
            fontSize: 13, color: 'var(--text-dim)',
          }}>{A.patches.empty}</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {patches.map(p => (
              <div key={p.id} style={{
                borderRadius: 8, background: bg, border: `1px solid ${border}`,
                overflow: 'hidden',
              }}>
                {/* Header de la carte */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 14px', flexWrap: 'wrap',
                }}>
                  {/* Badge statut */}
                  <span style={{
                    fontSize: 10, padding: '2px 8px', borderRadius: 4, fontWeight: 700,
                    background: p.status === 'published' ? 'rgba(93,202,165,0.12)' : 'rgba(239,159,39,0.12)',
                    border: `1px solid ${p.status === 'published' ? 'rgba(93,202,165,0.4)' : 'rgba(239,159,39,0.4)'}`,
                    color: p.status === 'published' ? '#5DCAA5' : '#EF9F27',
                    textTransform: 'uppercase', letterSpacing: 1,
                  }}>{patchStatusLabel(A, p.status)}</span>

                  {/* Titre + version */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#F5F2FA' }}>{p.title}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-dim)', marginLeft: 8 }}>v{p.version}</span>
                  </div>

                  {/* Date */}
                  <span style={{ fontSize: 11, color: 'var(--text-dim)', flexShrink: 0 }}>
                    {formatDate(p.created_at, lang, FMT_DATE)}
                  </span>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button
                      onClick={() => {
                        if (editPatchId === p.id) { setEditPatchId(null) }
                        else {
                          setEditPatchId(p.id)
                          setEditTitle(p.title)
                          setEditImageUrl(p.image_url ?? '')
                          setEditJsonRaw(JSON.stringify(p.summary_jsonb, null, 2))
                          setEditJsonError(null)
                        }
                      }}
                      style={{
                        padding: '4px 10px', borderRadius: 5, fontSize: 11, fontWeight: 500,
                        background: editPatchId === p.id ? 'transparent' : 'rgba(127,119,221,0.12)',
                        border: `1px solid ${editPatchId === p.id ? border : 'rgba(127,119,221,0.4)'}`,
                        color: editPatchId === p.id ? 'var(--text-dim)' : '#7F77DD',
                        cursor: 'pointer', fontFamily: 'inherit',
                      }}
                    >{editPatchId === p.id ? A.patches.close : A.patches.edit}</button>

                    {p.status === 'draft' ? (
                      <button
                        onClick={() => publishPatch(p.id)}
                        disabled={publishingId === p.id}
                        style={{
                          padding: '4px 10px', borderRadius: 5, fontSize: 11, fontWeight: 600,
                          background: 'rgba(93,202,165,0.15)',
                          border: '1px solid rgba(93,202,165,0.4)',
                          color: '#5DCAA5',
                          cursor: publishingId === p.id ? 'wait' : 'pointer',
                          opacity: publishingId === p.id ? 0.6 : 1,
                          fontFamily: 'inherit',
                        }}
                      >{publishingId === p.id ? '…' : A.patches.publish}</button>
                    ) : (
                      <button
                        onClick={() => unpublishPatch(p.id)}
                        disabled={publishingId === p.id}
                        style={{
                          padding: '4px 10px', borderRadius: 5, fontSize: 11, fontWeight: 500,
                          background: 'transparent',
                          border: `1px solid ${border}`,
                          color: 'var(--text-dim)',
                          cursor: publishingId === p.id ? 'wait' : 'pointer',
                          opacity: publishingId === p.id ? 0.6 : 1,
                          fontFamily: 'inherit',
                        }}
                      >{publishingId === p.id ? '…' : A.patches.unpublish}</button>
                    )}

                    {/* Supprimer (brouillons uniquement) */}
                    {p.status === 'draft' && (
                      confirmDeleteId === p.id ? (
                        <>
                          <button
                            onClick={() => deletePatch(p.id)}
                            disabled={deletingId === p.id}
                            style={{
                              padding: '4px 10px', borderRadius: 5, fontSize: 11, fontWeight: 600,
                              background: 'rgba(226,75,74,0.15)',
                              border: '1px solid rgba(226,75,74,0.5)',
                              color: '#EE7C6F',
                              cursor: deletingId === p.id ? 'wait' : 'pointer',
                              opacity: deletingId === p.id ? 0.6 : 1,
                              fontFamily: 'inherit',
                            }}
                          >{deletingId === p.id ? '…' : A.patches.confirm}</button>
                          <button
                            onClick={() => setConfirmDeleteId(null)}
                            style={{
                              padding: '4px 10px', borderRadius: 5, fontSize: 11,
                              background: 'transparent', border: `1px solid ${border}`,
                              color: 'var(--text-dim)', cursor: 'pointer', fontFamily: 'inherit',
                            }}
                          >{dico.common.cancel}</button>
                        </>
                      ) : (
                        <button
                          onClick={() => setConfirmDeleteId(p.id)}
                          style={{
                            padding: '4px 10px', borderRadius: 5, fontSize: 11,
                            background: 'transparent', border: `1px solid ${border}`,
                            color: 'var(--text-dim)', cursor: 'pointer', fontFamily: 'inherit',
                          }}
                        >{A.patches.delete}</button>
                      )
                    )}
                  </div>
                </div>

                {/* Zone d'édition + preview PatchCard */}
                {editPatchId === p.id && (() => {
                  // Tente de parser le JSON pour la preview live
                  let previewData: PatchData = p.summary_jsonb
                  try { if (!editJsonError) previewData = JSON.parse(editJsonRaw) as PatchData } catch { /* garde p.summary_jsonb */ }
                  const inputStyle = {
                    width: '100%', padding: '7px 10px', borderRadius: 5, fontSize: 13,
                    background: c ? 'rgba(20,10,35,0.6)' : '#0F0F11',
                    border: `1px solid ${border}`, color: '#F5F2FA',
                    fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' as const,
                  }
                  const labelStyle = { fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase' as const, letterSpacing: 1, marginBottom: 4 }
                  return (
                    <div style={{ borderTop: `1px solid ${border}` }}>
                      {/* Champs titre + image */}
                      <div style={{ padding: '12px 14px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                        <div>
                          <div style={labelStyle}>{A.patches.fieldTitle}</div>
                          <input value={editTitle} onChange={e => setEditTitle(e.target.value)} style={inputStyle} />
                        </div>
                        <div>
                          <div style={labelStyle}>{A.patches.fieldImage}</div>
                          <input
                            type="url"
                            value={editImageUrl}
                            onChange={e => setEditImageUrl(e.target.value)}
                            placeholder={A.patches.imagePlaceholder}
                            style={inputStyle}
                          />
                        </div>
                      </div>

                      {/* Textarea JSON */}
                      <div style={{ padding: '0 14px 10px' }}>
                        <div style={{ ...labelStyle, marginBottom: 6 }}>{A.patches.fieldJson}</div>
                        <textarea
                          value={editJsonRaw}
                          onChange={e => {
                            setEditJsonRaw(e.target.value)
                            try { JSON.parse(e.target.value); setEditJsonError(null) }
                            catch (err) { setEditJsonError((err as Error).message) }
                          }}
                          rows={18}
                          spellCheck={false}
                          style={{
                            width: '100%', padding: '8px 10px', borderRadius: 5, fontSize: 11,
                            background: c ? 'rgba(20,10,35,0.6)' : '#0F0F11',
                            border: `1px solid ${editJsonError ? '#E24B4A' : border}`,
                            color: editJsonError ? '#EE7C6F' : '#F5F2FA',
                            fontFamily: 'monospace', outline: 'none', resize: 'vertical',
                            boxSizing: 'border-box', lineHeight: 1.5,
                          }}
                        />
                        {editJsonError && (
                          /* Message écrit par `JSON.parse` : c'est le moteur JS qui le
                             produit, dans la langue du navigateur — non traduisible ici. */
                          <div style={{ fontSize: 11, color: '#EE7C6F', marginTop: 4 }}>
                            ⚠ {editJsonError}
                          </div>
                        )}
                      </div>

                      {/* Boutons */}
                      <div style={{ padding: '0 14px 12px', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                        <button
                          onClick={() => savePatchEdit(p.id)}
                          disabled={savingPatch || !!editJsonError}
                          style={{
                            padding: '7px 18px', borderRadius: 5, fontSize: 12, fontWeight: 600,
                            background: 'linear-gradient(135deg, #7F77DD, #534AB7)',
                            border: 'none', color: 'white',
                            cursor: savingPatch || editJsonError ? 'not-allowed' : 'pointer',
                            opacity: savingPatch || editJsonError ? 0.5 : 1, fontFamily: 'inherit',
                          }}
                        >{savingPatch ? A.patches.saving : A.patches.save}</button>
                        {p.status === 'draft' && (
                          <button
                            onClick={async () => { await savePatchEdit(p.id); await publishPatch(p.id) }}
                            disabled={savingPatch || publishingId === p.id || !!editJsonError}
                            style={{
                              padding: '7px 18px', borderRadius: 5, fontSize: 12, fontWeight: 600,
                              background: 'rgba(93,202,165,0.15)',
                              border: '1px solid rgba(93,202,165,0.4)',
                              color: '#5DCAA5',
                              cursor: editJsonError ? 'not-allowed' : 'pointer',
                              opacity: editJsonError ? 0.5 : 1,
                              fontFamily: 'inherit',
                            }}
                          >{A.patches.saveAndPublish}</button>
                        )}
                        <button
                          onClick={() => setPreviewFullscreen({
                            id: String(p.id),
                            version: p.version,
                            title: editTitle || p.title,
                            summary_jsonb: previewData,
                            image_url: editImageUrl || null,
                            published_at: p.published_at ?? p.created_at,
                          } as PatchCardNote)}
                          style={{
                            padding: '7px 12px', borderRadius: 5, fontSize: 12, fontWeight: 500,
                            display: 'flex', alignItems: 'center', gap: 6,
                            background: 'transparent',
                            border: `1px solid ${border}`,
                            color: 'var(--text-muted)',
                            cursor: 'pointer', fontFamily: 'inherit', marginLeft: 'auto',
                          }}
                        >
                          <IconMaximize size={13} />
                          {A.patches.preview}
                        </button>
                      </div>

                      {/* Aperçu rendu PatchCard */}
                      <div style={{
                        margin: '0 14px 14px', borderRadius: 12,
                        border: `1px solid ${border}`, background: '#130f1a',
                        padding: '20px 24px', maxHeight: 640, overflowY: 'auto',
                      }}>
                        <PatchCard
                          patch={{
                            id: String(p.id),
                            version: p.version,
                            title: editTitle || p.title,
                            summary_jsonb: previewData,
                            image_url: editImageUrl || null,
                            published_at: p.published_at ?? p.created_at,
                          } as PatchCardNote}
                          ddragonVersion={ddragonVersion}
                        />
                      </div>
                    </div>
                  )
                })()}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Section Économie Écailles ───────────────────────────────── */}
      <div style={{ marginTop: 8 }}>
        <div style={{
          fontSize: 12, color: 'var(--text-dim)', textTransform: 'uppercase',
          letterSpacing: 1, fontWeight: 600, marginBottom: 12,
        }}>{A.economy.title}</div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <SettingToggle
            label={A.settings.ecailles_enabled.label}
            description={A.settings.ecailles_enabled.description}
            settingKey="ecailles_enabled"
            value={settings.ecailles_enabled}
            saving={settingsSaving === 'ecailles_enabled'}
            loading={settingsLoading}
            onToggle={toggleSetting}
            border={border}
            bg={bg}
          />
          <SettingToggle
            label={A.settings.shop_enabled.label}
            description={A.settings.shop_enabled.description}
            settingKey="shop_enabled"
            value={settings.shop_enabled}
            saving={settingsSaving === 'shop_enabled'}
            loading={settingsLoading}
            onToggle={toggleSetting}
            border={border}
            bg={bg}
          />
          <SettingToggle
            label={A.settings.quests_enabled.label}
            description={A.settings.quests_enabled.description}
            settingKey="quests_enabled"
            value={settings.quests_enabled}
            saving={settingsSaving === 'quests_enabled'}
            loading={settingsLoading}
            onToggle={toggleSetting}
            border={border}
            bg={bg}
          />
        </div>
      </div>

      {/* ── Modal plein écran preview éditeur ────────────────────────────── */}
      {mounted && previewFullscreen && createPortal(
        <div className="pn-modal" onClick={() => setPreviewFullscreen(null)}>
          <div className="pn-modal-inner" onClick={e => e.stopPropagation()}>
            <button
              className="pn-modal-close"
              onClick={() => setPreviewFullscreen(null)}
              aria-label={A.patches.closePreview}
            >
              <IconX size={18} />
            </button>
            <PatchCard patch={previewFullscreen} ddragonVersion={ddragonVersion} />
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
