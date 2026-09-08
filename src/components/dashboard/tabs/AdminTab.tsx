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
import { TIER_ORDER, isPaidTier } from '@/lib/subscription'
import SettingToggle from '@/components/dashboard/SettingToggle'
import KillSwitchModal from '@/components/dashboard/KillSwitchModal'
import LaunchModal from '@/components/dashboard/LaunchModal'
import SubViewTabs from '@/components/dashboard/SubViewTabs'
import CutBanner from '@/components/dashboard/CutBanner'
import {
  ADMIN_SUBTAB_IDS, DEFAULT_ADMIN_SUBTAB, CUT_BANNER_TARGET,
  adminPanelLayout, subTabFromSearch, type AdminSubTab,
} from '@/lib/admin-subtabs'
import {
  KIT_OPEN_STATUSES,
  type KitStatus, type KitOrderRow, type KitOrderEvent, type KitConfirmKind,
} from '@/lib/kit-orders'
import KitOrderCard from '@/components/dashboard/KitOrderCard'
import {
  partitionCatalogue, cutKillSwitches, canSubmitCut, isChildLocked,
  offBehaviorKey, relativeTime, flagLabel, flagDescription, isOn,
  groupKillBySurface, SURFACE_ORDER, DEFAULT_KILL_SURFACE, isPendingLaunch,
  launchPatch, applyLaunch, type SurfaceKey,
  type FlagCatalogueRow,
} from '@/lib/admin-flags'
import {
  profileRoleLabel, patchStatusLabel, patchGenReasonLabel,
  kitStatusLabel, kitErrorLabel,
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

// `KitOrderRow` et `KitOrderEvent` vivent dans `lib/kit-orders.ts` : ce panneau
// les charge, `KitOrderCard` les rend, et son test en fabrique sans monter ni
// l'un ni l'autre. Même emplacement et même raison que `FlagCatalogueRow`.

/**
 * Timeline vide, partagée par toutes les cartes repliées.
 *
 * Constante de module et non un `[]` littéral dans le JSX : le littéral créerait
 * un tableau neuf à chaque rendu, donc une prop `events` toujours « nouvelle »
 * pour les N-1 cartes dont la timeline est fermée. Une seule est ouverte à la
 * fois — c'est le cas général, pas un cas limite.
 */
const EMPTY_EVENTS: readonly KitOrderEvent[] = []

// Alias de la liste canonique de `lib/subscription.ts`. Le nom `TIERS` est
// CONSERVÉ : il est importé par `locales/dashboard/dashboard.test.ts`, qui en
// fait une frontière métier (tout tier proposé par l'éditeur admin doit avoir
// un libellé FR et EN). Seule la duplication de la liste disparaît.
export const TIERS = TIER_ORDER

const TIER_COLORS: Record<string, string> = {
  'apprenti':    '#A1A1AA',
  'forgeron':    '#5DCAA5',
  'maître':      '#7F77DD',
  'légion':      '#3A8AC9',
  // Marqueur de RÔLE, pas un palier (cf. `effectiveTier` dans `page.tsx`).
  // Absent de `TIER_ORDER`, donc jamais rendu dans les boutons d'assignation ni
  // dans les cartes de comptage — il n'est là que pour qu'un badge alimenté par
  // `effectiveTier` ne retombe pas sur le gris neutre. Reprend l'or de l'ancien
  // `architecte+` : l'admin garde exactement l'apparence qu'il avait.
  'admin':       '#EF9F27',
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

/**
 * Clés `kind='setting'` rendues par un interrupteur DÉDIÉ, hors catalogue.
 *
 * ⚠️ Cette liste ne contient plus les feature flags. Elle en portait quatre ; les
 * trois clés Écailles sont parties dans le CATALOGUE, lu dynamiquement depuis
 * `app_settings` (`kind IN ('launch','kill')`). C'est tout l'objet du chantier :
 * ajouter un flag devient un INSERT, sans toucher à ce fichier ni redéployer.
 *
 * `patch_auto_publish` reste ici parce qu'il n'est pas un flag mais un réglage du
 * comportement de génération des patch notes — il vit dans la carte Patch notes,
 * pas dans les deux sections du catalogue, et son rendu est inchangé.
 */
export const ADMIN_SETTING_KEYS = [
  'patch_auto_publish',
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
// Les deux helpers de style des boutons du sous-onglet Kits ont suivi le rendu
// dans `components/dashboard/KitOrderCard.tsx` : ils n'ont de sens qu'auprès des
// boutons qu'ils habillent.

function expiryLabel(iso: string | null, labels: AdminDict['expiry'], lang: Lang): string {
  if (!iso) return labels.lifetime
  const d = new Date(iso)
  const now = new Date()
  if (d < now) return labels.expired
  return formatDate(d, lang, FMT_DATE)
}

export default function AdminTab() {
  const { theme } = useTheme()
  const c = theme === 'mythic'
  const supabase = createClient()
  const dico = useDashboard()
  const lang = useLang()
  const A = dico.admin
  /** Châssis du panneau de flags. Les LIBELLÉS des flags, eux, viennent de la base. */
  const F = A.flags
  /** Sous-onglet « Kits ». */
  const K = A.kits

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

  // Catalogue de feature flags (kind 'launch' / 'kill') — lu dynamiquement.
  const [catalogue, setCatalogue] = useState<FlagCatalogueRow[]>([])
  const [catalogueLoading, setCatalogueLoading] = useState(false)
  // Coupure en attente de confirmation + son motif. Même patron que
  // `confirmCertifyId` : un seul élément confirmable à la fois, l'état porte sa clé.
  const [confirmCutKey, setConfirmCutKey] = useState<string | null>(null)
  const [cutReason, setCutReason]         = useState('')
  /** Lancement en attente de confirmation. Même patron que `confirmCutKey`. */
  const [confirmLaunchKey, setConfirmLaunchKey] = useState<string | null>(null)

  // Sous-onglet actif. Le panneau empilait trois blocs sans rapport ; ils sont
  // désormais commutés ici. ⚠️ Les quatre loaders restent au montage (voir le
  // `useEffect` plus bas) — un sous-onglet ne commute que du JSX, il ne possède
  // jamais son chargement, sinon le bandeau de coupures serait vide partout
  // ailleurs que sur « flags ».
  // ── Sous-onglet « Kits » (service Kit sur mesure) ──────────────────────
  const [kits, setKits]               = useState<KitOrderRow[]>([])
  const [kitsLoading, setKitsLoading] = useState(false)
  /** id du dossier dont une action est en vol — désactive SES boutons, pas ceux des autres. */
  const [kitBusyId, setKitBusyId]     = useState<string | null>(null)
  /**
   * Message d'erreur BRUT tel que renvoyé par PostgREST, jamais le libellé
   * traduit. La résolution (`kitErrorLabel`) se fait au RENDU : c'est ce qui
   * garde les fonctions de chargement indépendantes du dictionnaire — sinon `A`
   * entrerait dans les dépendances de `loadKits` et un changement de langue
   * relancerait les cinq requêtes du panneau. Effet de bord bienvenu : une
   * erreur affichée suit la langue si on la change.
   */
  const [kitError, setKitError]       = useState<string | null>(null)
  /**
   * Confirmation ouverte : QUEL dossier, et POUR QUEL geste.
   *
   * ⚠️ UNE valeur, pas deux états indépendants. Avec `confirmCancelId` et
   * `confirmRollbackId` séparés, une même carte pouvait afficher les deux
   * questions à la fois — « Revenir à X ? » et « Annuler ce dossier ? » côte à
   * côte, avec deux boutons « Confirmer » que rien ne distingue. Ici, ouvrir
   * l'une ferme l'autre par construction.
   */
  const [kitConfirm, setKitConfirm] = useState<{ id: string; kind: KitConfirmKind } | null>(null)
  /** Dossier dont la timeline est dépliée, et son contenu. Un seul à la fois. */
  const [timelineFor, setTimelineFor] = useState<string | null>(null)
  const [timeline, setTimeline]       = useState<KitOrderEvent[]>([])
  const [priceEditId, setPriceEditId] = useState<string | null>(null)
  const [priceDraft, setPriceDraft]   = useState('')
  /** Formulaire d'ouverture d'un dossier. */
  const [openClientId, setOpenClientId] = useState('')
  const [openStatus, setOpenStatus]     = useState<KitStatus>('acompte_paye')
  const [opening, setOpening]           = useState(false)

  const [subTab, setSubTab] = useState<AdminSubTab>(DEFAULT_ADMIN_SUBTAB)

  // Surface active DANS la section des kill switches. État local, non
  // deep-linkable : c'est un filtre de lecture à l'intérieur d'une section, pas
  // une destination qu'on partage — le lien d'incident vise `?subtab=flags`, et
  // le bandeau global y nomme déjà les coupures, toutes surfaces confondues.
  const [killSurface, setKillSurface] = useState<SurfaceKey>(DEFAULT_KILL_SURFACE)

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

  // Met à jour un seul réglage — optimistic update puis écriture DB.
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

  // ════════════════════════════════════════════════════════════════════
  //  CATALOGUE DE FEATURE FLAGS
  // ════════════════════════════════════════════════════════════════════

  /**
   * Charge TOUT le catalogue. `select('*')` et non une liste de colonnes : une
   * colonne ajoutée plus tard au catalogue doit arriver ici sans redéploiement,
   * au même titre qu'une ligne.
   */
  const loadCatalogue = useCallback(async () => {
    setCatalogueLoading(true)
    const { data } = await supabase
      .from('app_settings')
      .select('*')
      .in('kind', ['launch', 'kill'])
      .order('group_key', { ascending: true })
      .order('sort_order', { ascending: true })
    setCatalogue((data ?? []) as FlagCatalogueRow[])
    setCatalogueLoading(false)
  }, [supabase])

  /**
   * Bascule d'un flag du catalogue.
   *
   * ⚠️ Trois choses à ne pas défaire ici :
   *
   * 1. `updated_by` n'est PAS écrit côté client. Le trigger
   *    `trg_app_settings_actor` (migration 20260905000001) le renseigne depuis
   *    `auth.uid()`, et seulement quand la VALEUR change. Le poser ici le
   *    rendrait falsifiable par le client, alors que la base le tient déjà.
   *
   * 2. `reason` est écrit à la COUPURE et remis à `null` à la réactivation. Un
   *    motif qui survit au retour à la normale mentirait sur l'état courant à la
   *    coupure suivante.
   *
   * 3. La policy `as_update_admin` (`USING is_admin()`) reste la seule vraie
   *    barrière : cet écran n'est qu'une commodité. Un non-admin qui forcerait le
   *    rendu de ce composant se ferait refuser l'écriture par la base.
   */
  async function toggleFlag(key: string, next: boolean, reason: string | null) {
    setCatalogue(prev => prev.map(r =>
      r.key === key
        ? { ...r, value: next ? 'true' : 'false', reason: next ? null : reason }
        : r))
    setSettingsSaving(key)

    await supabase
      .from('app_settings')
      .update({ value: next ? 'true' : 'false', reason: next ? null : reason })
      .eq('key', key)

    setSettingsSaving(null)
    setConfirmCutKey(null)
    setCutReason('')
    // Relecture : `updated_at` et `updated_by` sont posés par les triggers, le
    // client ne peut pas les deviner — et ce sont eux qu'affiche la carte coupée.
    await loadCatalogue()
  }

  /**
   * Lancement d'une feature — `value` ET `kind` dans le MÊME UPDATE.
   *
   * ⚠️ Une seule écriture, jamais deux. Deux requêtes successives laisseraient,
   * entre les deux, un flag soit ouvert au public tout en étant encore catalogué
   * « lancement » (donc absent de la section qui permet de le couper), soit
   * catalogué en kill switch alors qu'il est encore fermé. Le patch vient de
   * `launchPatch()`, testé à part.
   *
   * Le trigger `trg_app_settings_actor` s'enclenche normalement : sa clause
   * `WHEN (NEW.value IS DISTINCT FROM OLD.value)` ne regarde que `value`, et
   * `value` change bien ici — rien dans le trigger ne suppose que c'est la
   * SEULE colonne modifiée.
   */
  async function launchFlag(key: string) {
    setCatalogue(prev => prev.map(r => (r.key === key ? applyLaunch(r) : r)))
    setSettingsSaving(key)

    await supabase.from('app_settings').update(launchPatch()).eq('key', key)

    setSettingsSaving(null)
    setConfirmLaunchKey(null)
    // Relecture : le flag doit ressortir en kill switch, dans son groupe de
    // surface, avec l'`updated_by` posé par le trigger.
    await loadCatalogue()
  }

  /**
   * Point d'entrée unique des interrupteurs du catalogue.
   *
   * Réactivation → directe, sans friction : rien ne doit ralentir un retour à la
   * normale. Coupure d'un kill switch → passe par la confirmation + motif.
   *
   * ⚠️ Un flag de LANCEMENT ne passe plus par ici : sa carte porte un bouton
   * « Lancer », pas un interrupteur, et il est routé vers `onLaunchRequest`.
   */
  function onCatalogueToggle(key: string) {
    const row = catalogue.find(r => r.key === key)
    if (!row) return

    if (isOn(row) && row.kind === 'kill') {
      setConfirmCutKey(key)
      setCutReason('')
      return
    }
    void toggleFlag(key, !isOn(row), null)
  }

  /** Le bouton « Lancer » n'écrit rien : il ouvre la confirmation. */
  function onLaunchRequest(key: string) {
    setConfirmLaunchKey(key)
  }

  /** Confirmation d'une coupure. Le motif vide est refusé ICI AUSSI, pas seulement dans le `disabled`. */
  function confirmCut(key: string) {
    if (!canSubmitCut(cutReason)) return
    void toggleFlag(key, false, cutReason.trim())
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

  // ════════════════════════════════════════════════════════════════════
  //  KITS SUR MESURE
  // ════════════════════════════════════════════════════════════════════

  /**
   * Charge tous les dossiers. Pas de pagination : le service se vend à l'unité
   * avec un accompagnement humain derrière — la table restera à deux chiffres
   * pendant longtemps. Le jour où ce ne sera plus vrai, c'est un `.range()` ici.
   *
   * La policy `ko_select` renvoie TOUT à un admin, et seulement ses propres
   * lignes à un non-admin : cet écran n'ajoute aucun filtre, il n'en a pas besoin.
   */
  const loadKits = useCallback(async () => {
    setKitsLoading(true)
    const { data, error } = await supabase
      .from('kit_orders')
      .select('id, user_id, status, price_total_cents, admin_note, created_at, updated_at')
      .order('created_at', { ascending: false })
    if (error) setKitError(error.message)
    setKits((data ?? []) as KitOrderRow[])
    setKitsLoading(false)
  }, [supabase])

  /**
   * Fait passer un dossier d'un état à l'autre.
   *
   * ⚠️ Passe par la RPC `kit_set_status`, JAMAIS par un `.update()`. Ce n'est pas
   * une préférence de style : aucune policy UPDATE n'existe sur `kit_orders`, un
   * update direct serait refusé par la base. La fonction re-vérifie `is_admin()`
   * et la validité de la transition, et écrit la ligne d'audit dans la même
   * transaction — trois choses qu'un update client ne peut pas faire.
   *
   * Pas de mise à jour optimiste, contrairement à `toggleFlag` : là-bas l'écriture
   * ne peut pas être refusée métier (un booléen bascule toujours), ici elle peut
   * l'être (`invalid_transition`). Peindre l'état visé avant la réponse afficherait
   * un dossier « terminé » qui ne l'est pas.
   */
  async function advanceKit(id: string, next: KitStatus) {
    setKitBusyId(id)
    setKitError(null)
    const { error } = await supabase.rpc('kit_set_status', {
      p_order_id: id, p_next_status: next,
    })
    setKitBusyId(null)
    setKitConfirm(null)
    if (error) { setKitError(error.message); return }
    await loadKits()
    // La timeline dépliée vient de gagner une ligne — la relire, sinon elle
    // mentirait jusqu'au prochain repli/dépli.
    if (timelineFor === id) await loadTimeline(id)
  }

  /** Ouvre un dossier. `kit_open_order` refuse un second dossier ACTIF pour le même client. */
  async function openKitOrder() {
    if (!openClientId) return
    setOpening(true)
    setKitError(null)
    const { error } = await supabase.rpc('kit_open_order', {
      p_user_id: openClientId,
      p_status:  openStatus,
    })
    setOpening(false)
    if (error) { setKitError(error.message); return }
    setOpenClientId('')
    await loadKits()
  }

  /**
   * Enregistre le prix total, en CENTIMES.
   *
   * L'admin saisit des euros ; la base ne stocke que des centimes (jamais de
   * flottant sur de l'argent). La conversion se fait ici, une fois, avec un
   * `Math.round` : `19.99 * 100` vaut `1998.9999…` en virgule flottante.
   * Une saisie vide ou non numérique est ignorée plutôt que d'envoyer un NaN.
   */
  async function saveKitPrice(id: string) {
    const euros = Number(priceDraft.replace(',', '.'))
    if (!Number.isFinite(euros) || euros <= 0) { setPriceEditId(null); return }
    setKitBusyId(id)
    setKitError(null)
    const { error } = await supabase.rpc('kit_set_details', {
      p_order_id: id, p_price_total_cents: Math.round(euros * 100),
    })
    setKitBusyId(null)
    setPriceEditId(null)
    if (error) { setKitError(error.message); return }
    await loadKits()
  }

  /**
   * Charge la timeline d'un dossier. Chargée À LA DEMANDE et pour un seul
   * dossier : la tirer pour toutes les lignes du tableau multiplierait les
   * requêtes pour de l'information que l'admin ne regarde qu'en cas de doute.
   *
   * `kit_order_events` n'est lisible que par `is_admin()` (policy
   * `koe_select_admin`) — le client ne voit jamais sa propre timeline.
   */
  async function loadTimeline(id: string) {
    const { data } = await supabase
      .from('kit_order_events')
      .select('id, from_status, to_status, actor, note, created_at')
      .eq('kit_order_id', id)
      .order('created_at', { ascending: false })
    setTimeline((data ?? []) as KitOrderEvent[])
  }

  async function toggleTimeline(id: string) {
    if (timelineFor === id) { setTimelineFor(null); setTimeline([]); return }
    setTimelineFor(id)
    setTimeline([])
    await loadTimeline(id)
  }

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

  // Deep-link `?tab=admin&subtab=…`, lu UNE FOIS au montage — même parti pris
  // que `?tab=` dans `app/page.tsx` : l'URL n'est jamais réécrite au clic, pour
  // rester cohérent avec le reste du dashboard qui ne le fait pas non plus.
  // Une valeur inconnue retombe sur le défaut (garde dans `subTabFromSearch`).
  //
  // ⚠️ `AdminTab` est démonté à chaque changement d'onglet principal
  // (`Dashboard.tsx` : `{activeTab === 'admin' && <AdminTab />}`), donc revenir
  // sur l'admin relit le paramètre et réapplique le sous-onglet. C'est voulu :
  // tant que l'URL porte `subtab=flags`, l'honorer reste cohérent avec ce
  // qu'elle annonce — c'est l'ignorer qui surprendrait.
  useEffect(() => { setSubTab(subTabFromSearch(window.location.search)) }, [])

  useEffect(() => {
    if (!previewFullscreen) return
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setPreviewFullscreen(null) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [previewFullscreen])

  // Tout est chargé AU MONTAGE, pas à l'ouverture du sous-onglet correspondant.
  // C'est l'idiome déjà en place ici, et il évite le piège du chargement
  // paresseux : une liste restée vide parce que personne n'a cliqué sur l'onglet
  // qui la remplit. Cinq requêtes légères pour un écran réservé aux admins.
  useEffect(() => { load(); loadPatches(); loadSettings(); loadCatalogue(); loadKits() },
    [load, loadPatches, loadSettings, loadCatalogue, loadKits])

  // ── Dérivés du catalogue ──────────────────────────────────────────────
  // Recalculés à chaque rendu, via des fonctions PURES testées dans
  // `lib/admin-flags.test.ts`. Le catalogue fait ~40 lignes : le mémoïser
  // coûterait plus de code qu'il n'en économise de travail.
  const { launch, kill, overlayMaster, overlayChildren } = partitionCatalogue(catalogue)
  const cuts = cutKillSwitches(catalogue)
  const overlayLocked = isChildLocked(overlayMaster)

  // Ce que le panneau montre. Fonction PURE (`lib/admin-subtabs.ts`) : c'est
  // elle qui porte l'invariant « le bandeau ne dépend jamais du sous-onglet ».
  const layout = adminPanelLayout(subTab, cuts.length)

  /** Pastilles de sous-onglets. Le compteur rouge ne vit que sur « flags ». */
  const subTabViews = ADMIN_SUBTAB_IDS.map(id => ({
    id,
    label: A.subtabs[id],
    badge: id === 'flags' ? cuts.length : null,
  }))

  /** Kill switches répartis en trois groupes disjoints (Site / App / Site + App). */
  const killBySurface = groupKillBySurface(kill)

  /**
   * Coupures EN COURS par surface — alimente le compteur de chaque pastille.
   *
   * Les sous-onglets masquent les deux tiers de la liste : sans ce compteur, une
   * coupure sur une surface inactive ne se verrait plus dans la section. Le
   * bandeau global la nomme toujours, mais il ne dit pas SOUS QUELLE pastille
   * aller la chercher. Calculé sur `cuts`, donc overlay compris.
   */
  const cutsBySurface = groupKillBySurface(cuts)

  /** Pastilles de surface, avec leur compteur de coupures. */
  const surfaceViews = SURFACE_ORDER.map(s => ({
    id: s,
    label: F.surface[s],
    badge: cutsBySurface[s].length,
  }))

  /** L'overlay est `surface='app'` : sa sous-section vit sous la pastille App. */
  const showOverlay = killSurface === 'app' && overlayMaster !== null
  const surfaceRows = killBySurface[killSurface]

  /** Flag visé par la confirmation de lancement, ou `null`. */
  const launchTarget = confirmLaunchKey
    ? (catalogue.find(r => r.key === confirmLaunchKey) ?? null)
    : null

  /** Flag visé par la modale de confirmation, ou `null` si elle est fermée. */
  const cutTarget = confirmCutKey
    ? (catalogue.find(r => r.key === confirmCutKey) ?? null)
    : null

  /**
   * Pseudo de l'admin qui a coupé, résolu depuis `profiles` — DÉJÀ chargé par ce
   * panneau pour son tableau des comptes. Aucune requête ni jointure de plus : le
   * seul écran qui affiche ces coupures est aussi le seul qui a la liste sous la
   * main. Renvoie `null` si l'auteur est inconnu (compte supprimé, écriture
   * service_role) — la carte omet alors la mention plutôt que d'afficher un UUID.
   */
  const adminName = (userId: string | null): string | null =>
    userId ? (profiles.find(p => p.id === userId)?.username ?? null) : null

  /**
   * Carte d'un kill switch : l'interrupteur, ce qu'il casse, et — s'il est coupé —
   * qui l'a coupé, quand, et pourquoi.
   *
   * @param child enfant d'overlay : indenté, et verrouillé si le maître est coupé.
   */
  function renderKillCard(row: FlagCatalogueRow, child = false) {
    const on = isOn(row)
    const locked = child && overlayLocked
    const who = adminName(row.updated_by)
    const when = relativeTime(row.updated_at, lang)

    return (
      <SettingToggle
        key={row.key}
        label={flagLabel(row, lang)}
        description={flagDescription(row, lang)}
        settingKey={row.key}
        value={on}
        saving={settingsSaving === row.key}
        loading={catalogueLoading}
        onToggle={onCatalogueToggle}
        border={border}
        bg={bg}
        variant="kill"
        stateLabel={on ? F.stateActive : F.stateCut}
        locked={locked}
        lockedHint={F.lockedByMaster}
        indented={child}
      >
        {/* Ce que verra l'utilisateur — affiché en PERMANENCE, pas seulement
            pendant la confirmation : l'admin doit pouvoir lire l'impact en
            parcourant la liste, avant même de viser un interrupteur. */}
        {/* ⚠️ Mêmes couleurs que l'encart d'impact de `KillSwitchModal` — c'est
            littéralement le même texte, il doit se lire pareil sur la carte et
            dans la confirmation. `var(--text-dim)` + `opacity: .75` tombait à
            2,62:1 en thème `classic` : le pire contraste du panneau, et sur la
            ligne qui dit ce qu'une coupure va casser. Libellé en rouge clair
            (7,43:1), valeur en gris neutre (7,13:1), dans les deux thèmes. */}
        <div style={{ fontSize: 10, color: '#A5A3AE', marginTop: 5 }}>
          <span style={{ color: '#E8908D' }}>{F.impactLabel}</span>{' '}
          {F.impact[offBehaviorKey(row)]}
        </div>

        {/* Traçabilité d'une coupure en cours. */}
        {!on && when && (
          <div style={{ fontSize: 11, color: '#E24B4A', marginTop: 6, fontWeight: 500 }}>
            {(who ? F.cutBy.replace('{who}', who) : F.cutByUnknown).replace('{when}', when)}
          </div>
        )}
        {!on && row.reason && (
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, fontStyle: 'italic' }}>
            {F.cutReason.replace('{reason}', row.reason)}
          </div>
        )}

        {/* La confirmation d'une coupure ne vit PAS dans la carte : elle est
            portalisée en modale, en bas de ce composant. Une carte qui se dépliait
            faisait défiler la liste sous le curseur au moment précis où l'admin
            s'apprête à couper quelque chose. */}
      </SettingToggle>
    )
  }

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
    // Abonnés actifs = tier payant + expiration définie + pas encore expirée.
    // `isPaidTier` plutôt qu'un `!== 'apprenti'` en dur : même règle que le
    // verrou des fonctionnalités payantes, définie à un seul endroit.
    activeSubscribers: withExpiry.filter(p =>
      isPaidTier(p.tier) && new Date(p.tier_expires_at!) > new Date()
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

      {/* ── Bandeau de coupures ─────────────────────────────────────────
          AU-DESSUS des sous-onglets, et rendu par le panneau lui-même : c'est
          ce qui le rend visible quel que soit le sous-onglet actif. Le déplacer
          à l'intérieur d'une section reviendrait à parier qu'un admin pressé
          pense à cliquer dessus — le pari exact que ce bandeau existe pour ne
          pas avoir à faire. Cliquable : il saute sur la section des flags. */}
      {layout.showBanner && (
        <CutBanner
          cuts={cuts}
          lang={lang}
          labels={{ bannerOne: F.bannerOne, bannerOther: F.bannerOther, bannerJump: F.bannerJump }}
          onJump={() => setSubTab(CUT_BANNER_TARGET)}
        />
      )}

      {/* ── Sous-onglets ────────────────────────────────────────────────
          Même barre de pastilles que l'onglet Écailles (`SubViewTabs`) : un
          admin qui connaît la Forge reconnaît le geste, et l'app n'acquiert pas
          un troisième vocabulaire de navigation. */}
      <SubViewTabs
        views={subTabViews}
        active={subTab}
        onSelect={setSubTab}
        accent={c ? '#EF9F27' : '#7F77DD'}
        activeBg={c ? 'rgba(186,117,23,0.2)' : 'rgba(127,119,221,0.15)'}
        border={border}
        ariaLabel={A.subtabs.ariaLabel}
      />

      {/* ══ Sous-onglet « Utilisateurs » ══════════════════════════════ */}
      {layout.showUsers && (
      <>
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
      </>
      )}

      {/* ══ Sous-onglet « Patch notes » ═══════════════════════════════ */}
      {layout.showPatchNotes && (
      <>
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

      </>
      )}

      {/* ══ Sous-onglet « Feature flags » ═════════════════════════════ */}
      {layout.showFlags && (
      <>
      {/* ── Feature flags — piloté par le CATALOGUE `app_settings` ──────
          Il y avait ici la section « Économie Écailles » : trois interrupteurs
          écrits en dur, avec leurs libellés dans le dico. Tout vient désormais de
          la base — ajouter un flag est un INSERT, sans toucher à ce fichier.

          ⚠️ Le bandeau de coupures NE VIT PLUS ICI — il est remonté au-dessus des
          sous-onglets, hors de cette section. Ne pas le réintroduire dans ce
          bloc : il redeviendrait invisible depuis les deux autres sections. */}

      {catalogueLoading && (
        <div style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 8 }}>
          {dico.common.loading}
        </div>
      )}

      {!catalogueLoading && catalogue.length === 0 && (
        <div style={{ color: 'var(--text-dim)', fontSize: 13, marginTop: 8, fontStyle: 'italic' }}>
          {F.empty}
        </div>
      )}

      {/* ── 🚀 Lancements ───────────────────────────────────────────────
          Bascule SANS friction : ouvrir une feature est une annonce, pas un
          incident, et la refermer avant lancement ne casse rien pour personne. */}
      {launch.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <div style={{
            fontSize: 12, color: '#EF9F27', textTransform: 'uppercase',
            letterSpacing: 1, fontWeight: 700, marginBottom: 4,
          }}>{F.launchTitle}</div>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 12 }}>{F.launchHint}</div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {launch.map(row => (
              // Bouton « Lancer », plus un interrupteur : lancer est un geste à
              // SENS UNIQUE (le flag devient un kill switch). Un interrupteur
              // laisserait croire qu'on peut le rebasculer pour « délancer ».
              <SettingToggle
                key={row.key}
                label={flagLabel(row, lang)}
                description={flagDescription(row, lang)}
                settingKey={row.key}
                value={isOn(row)}
                saving={settingsSaving === row.key}
                loading={catalogueLoading}
                onToggle={onLaunchRequest}
                border={border}
                bg={bg}
                variant="launch"
                stateLabel={isOn(row) ? F.stateLive : F.stateNotLaunched}
                actionLabel={isPendingLaunch(row) ? F.launchAction : undefined}
                indented={row.parent_key !== null}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── 🛑 Kill switches ───────────────────────────────────────────── */}
      {(kill.length > 0 || overlayMaster) && (
        <div style={{ marginTop: 28 }}>
          <div style={{
            fontSize: 12, color: '#E24B4A', textTransform: 'uppercase',
            letterSpacing: 1, fontWeight: 700, marginBottom: 4,
          }}>{F.killTitle}</div>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 12 }}>{F.killHint}</div>

          {/* ── Sous-navigation par surface ───────────────────────────────
              Trois pastilles DISJOINTES. `shared` a la sienne plutôt que d'être
              dupliqué dans « Site » ET « App » : un flag rendu deux fois
              donnerait deux interrupteurs pour une seule ligne en base, et sa
              coupure serait comptée dans les deux onglets. Même raisonnement
              que pour les groupes qu'elles remplacent — la base modélise la
              surface comme UNE valeur, l'écran la reflète telle quelle.

              ⚠️ Le compteur rouge de chaque pastille n'est pas décoratif : la
              liste ne montre plus qu'une surface à la fois, donc une coupure
              ailleurs sortirait du champ de vision. Le bandeau global la nomme
              toujours, mais lui seul ne dit pas SOUS QUELLE pastille aller la
              chercher. */}
          <SubViewTabs
            views={surfaceViews}
            active={killSurface}
            onSelect={setKillSurface}
            accent={c ? '#EF9F27' : '#7F77DD'}
            activeBg={c ? 'rgba(186,117,23,0.2)' : 'rgba(127,119,221,0.15)'}
            border={border}
            ariaLabel={F.surfaceAriaLabel}
          />

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {surfaceRows.map(row => renderKillCard(row))}
          </div>

          {surfaceRows.length === 0 && !showOverlay && (
            <div style={{ color: '#A5A3AE', fontSize: 12, fontStyle: 'italic' }}>
              {F.surfaceEmpty}
            </div>
          )}

          {/* Sous-section overlay : le maître, puis ses 18 enfants indentés.
              Quand le maître est coupé, les enfants sont grisés et non cliquables
              — même grammaire que le toggle maître de l'onglet Overlay dans l'app
              WPF, pour que l'admin et l'utilisateur final lisent la même chose. */}
          {showOverlay && overlayMaster && (
            <div style={{ marginTop: 20 }}>
              <div style={{
                fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase',
                letterSpacing: 1, fontWeight: 600, marginBottom: 4,
              }}>{F.overlayTitle}</div>
              <div style={{ fontSize: 11, color: '#A5A3AE', marginBottom: 10 }}>{F.overlayHint}</div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {renderKillCard(overlayMaster)}
                {overlayChildren.map(row => renderKillCard(row, true))}
              </div>
            </div>
          )}
        </div>
      )}
      </>
      )}

      {/* ══ Sous-onglet « Kits » ══════════════════════════════════════
          Service « Kit sur mesure » — lot 1 (V0 interne). L'admin encaisse et
          fixe les RDV à la main ; cet écran ne fait que suivre le dossier.

          ⚠️ TOUTE écriture passe par une RPC SECURITY DEFINER. Il n'existe
          aucune policy INSERT/UPDATE/DELETE sur `kit_orders` : un `.update()`
          depuis ce composant serait refusé par la base. C'est délibéré, et c'est
          la correction de la dette des Scénarios (verrou purement client) —
          voir l'en-tête de la migration 20260908000001. Ne pas « simplifier »
          ces appels en écritures directes.

          ⚠️ CE SOUS-ONGLET NE LIT PAS `kit_sur_mesure_enabled`, ET C'EST VOULU.
          Ce flag de lancement (migration 20260908000002, `off_behavior='hidden'`)
          ne gouverne QUE la surface UTILISATEUR FINAL — la page de commande et
          l'entrée de navigation qui arrivent au lot 2. Le panneau admin doit
          rester ouvert quel que soit son état, pour deux raisons :

            1. C'est là que se préparent les dossiers AVANT le lancement. Un flag
               qui fermerait aussi l'admin rendrait la recette impossible : on ne
               pourrait pas vérifier que le parcours fonctionne avant de l'ouvrir
               au public, ce qui est exactement l'usage d'un flag de lancement.
            2. C'est la convention DÉJÀ en vigueur ici — `EcaillesTab` rend la
               Forge à un admin même quand `ecailles_enabled` est à `false`
               (« recette avant lancement », cf. `feature-flags.test.ts`). Brancher
               ce sous-onglet sur le flag introduirait une exception à cette règle.

          Corollaire à tenir au LOT 2 : c'est la surface cliente qui devra lire
          `useFlag('kit_sur_mesure_enabled')`, pas celle-ci. Et le vrai verrou de
          ce qui coûte reste la garde `is_admin()` des trois RPC — un flag est de
          la présentation, jamais une barrière. */}
      {layout.showKits && (
      <>
      <div style={{
        fontSize: 12, color: c ? '#EF9F27' : '#7F77DD', textTransform: 'uppercase',
        letterSpacing: 1, fontWeight: 700, marginBottom: 4,
      }}>{K.title}</div>
      <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 16 }}>{K.hint}</div>

      {kitError && (
        <div style={{
          fontSize: 12, color: '#E24B4A', marginBottom: 12,
          padding: '8px 12px', borderRadius: 8,
          border: '1px solid rgba(226,75,74,0.3)', background: 'rgba(226,75,74,0.08)',
        }}>
          {K.errorPrefix.replace('{message}', kitErrorLabel(A, kitError))}
        </div>
      )}

      {/* ── Ouvrir un dossier ────────────────────────────────────────────
          Le sélecteur de client réutilise `profiles`, DÉJÀ chargé par ce panneau
          pour le tableau des comptes — aucune requête supplémentaire, exactement
          le raisonnement d'`adminName()` pour les auteurs de coupures. */}
      <div style={{
        marginBottom: 24, padding: 14, borderRadius: 10,
        border: `1px solid ${border}`, background: bg,
        display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 220 }}>
          <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>{K.openClientLabel}</label>
          <select
            value={openClientId}
            onChange={e => setOpenClientId(e.target.value)}
            style={{
              padding: '7px 10px', borderRadius: 7, fontSize: 13, fontFamily: 'inherit',
              border: `1px solid ${border}`, background: c ? 'rgba(20,10,35,0.6)' : '#27272A', color: 'inherit',
            }}
          >
            <option value="">{K.openClientEmpty}</option>
            {profiles.map(p => (
              <option key={p.id} value={p.id}>{p.username}{p.email ? ` — ${p.email}` : ''}</option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 180 }}>
          <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>{K.openStatusLabel}</label>
          {/* Deux entrées seulement — `kit_open_order` refuse tout autre état de
              départ. Les proposer toutes ferait cliquer sur une option que la
              base rejette. */}
          <select
            value={openStatus}
            onChange={e => setOpenStatus(e.target.value as KitStatus)}
            style={{
              padding: '7px 10px', borderRadius: 7, fontSize: 13, fontFamily: 'inherit',
              border: `1px solid ${border}`, background: c ? 'rgba(20,10,35,0.6)' : '#27272A', color: 'inherit',
            }}
          >
            {KIT_OPEN_STATUSES.map(s => (
              <option key={s} value={s}>{kitStatusLabel(A, s)}</option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={() => void openKitOrder()}
          disabled={!openClientId || opening}
          style={{
            padding: '8px 16px', borderRadius: 7, fontSize: 13, fontWeight: 600,
            fontFamily: 'inherit', border: 'none',
            cursor: (!openClientId || opening) ? 'not-allowed' : 'pointer',
            opacity: (!openClientId || opening) ? 0.5 : 1,
            background: c ? '#EF9F27' : '#7F77DD', color: c ? '#1A1A1A' : '#FFFFFF',
          }}
        >
          {opening ? K.opening : K.openAction}
        </button>
      </div>

      {kitsLoading && (
        <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>{dico.common.loading}</div>
      )}

      {!kitsLoading && kits.length === 0 && (
        <div style={{ color: 'var(--text-dim)', fontSize: 13, fontStyle: 'italic' }}>
          {K.empty}
        </div>
      )}

      {/* ── Les dossiers ─────────────────────────────────────────────────
          Une CARTE par dossier plutôt qu'une ligne de tableau : chacune porte
          jusqu'à trois actions, une édition de prix et une timeline dépliable.
          Le tableau des comptes s'en sort avec des lignes parce qu'il n'a qu'un
          bouton par ligne. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {kits.map(order => (
          <KitOrderCard
            key={order.id}
            order={order}
            /* Résolu depuis `profiles`, DÉJÀ chargé par ce panneau pour le
               tableau des comptes — aucune requête ni jointure de plus, même
               raisonnement qu'`adminName` pour les auteurs de coupure. */
            clientName={profiles.find(p => p.id === order.user_id)?.username ?? null}
            labels={K}
            statusLabel={s => kitStatusLabel(A, s)}
            lang={lang}
            busy={kitBusyId === order.id}
            confirm={kitConfirm?.id === order.id ? kitConfirm.kind : null}
            priceEditing={priceEditId === order.id}
            priceDraft={priceDraft}
            timelineOpen={timelineFor === order.id}
            /* `EMPTY_EVENTS` et non `[]` : un littéral créerait un tableau neuf
               à chaque rendu de chaque carte, donc une prop toujours « nouvelle »
               pour les N-1 cartes dont la timeline est repliée. */
            events={timelineFor === order.id ? timeline : EMPTY_EVENTS}
            actorName={adminName}
            accent={c ? '#EF9F27' : '#7F77DD'}
            border={border}
            bg={bg}
            inputBg={c ? 'rgba(20,10,35,0.6)' : '#27272A'}
            onAdvance={next => void advanceKit(order.id, next)}
            onConfirmRequest={kind => setKitConfirm({ id: order.id, kind })}
            onConfirmDismiss={() => setKitConfirm(null)}
            onPriceEdit={draft => { setPriceEditId(order.id); setPriceDraft(draft) }}
            onPriceDraft={setPriceDraft}
            onPriceSave={() => void saveKitPrice(order.id)}
            onPriceDismiss={() => setPriceEditId(null)}
            onToggleTimeline={() => void toggleTimeline(order.id)}
          />
        ))}
      </div>
      </>
      )}

      {/* ── Modales ─────────────────────────────────────────────────────
          Rendues HORS des sous-onglets : ce sont des surcouches portalisées sur
          `document.body`, elles n'appartiennent à aucune section. */}

      {/* ── Modale de confirmation d'une coupure ─────────────────────────
          Portalisée sur `document.body` sous la garde `mounted`, comme la
          prévisualisation ci-dessous : `document` n'existe pas au rendu serveur.

          ⚠️ Le toggle NE BASCULE PAS tant que cette modale n'est pas confirmée —
          `onCatalogueToggle` se contente de poser `confirmCutKey` et sort. La
          réactivation, elle, ne passe jamais par ici : rien ne doit ralentir un
          retour à la normale. */}
      {mounted && cutTarget && createPortal(
        <KillSwitchModal
          flagLabel={flagLabel(cutTarget, lang)}
          reason={cutReason}
          saving={settingsSaving === cutTarget.key}
          onReasonChange={setCutReason}
          onConfirm={() => confirmCut(cutTarget.key)}
          onCancel={() => { setConfirmCutKey(null); setCutReason('') }}
          labels={{
            cutTitle:             F.cutTitle,
            cutReasonLabel:       F.cutReasonLabel,
            cutReasonHint:        F.cutReasonHint,
            cutReasonPlaceholder: F.cutReasonPlaceholder,
            cutConfirm:           F.cutConfirm,
            cutCancel:            F.cutCancel,
            impactLabel:          F.impactLabel,
            impactText:           F.impact[offBehaviorKey(cutTarget)],
          }}
        />,
        document.body,
      )}

      {/* ── Modale de confirmation d'un lancement ────────────────────────
          Même portalisation que la coupure. Le bouton « Lancer » de la carte
          n'écrit RIEN : il pose `confirmLaunchKey`, l'écriture n'a lieu qu'ici. */}
      {mounted && launchTarget && createPortal(
        <LaunchModal
          flagLabel={flagLabel(launchTarget, lang)}
          saving={settingsSaving === launchTarget.key}
          onConfirm={() => void launchFlag(launchTarget.key)}
          onCancel={() => setConfirmLaunchKey(null)}
          labels={{
            launchTitle:        F.launchModalTitle,
            launchImpactLabel:  F.launchImpactLabel,
            launchImpactText:   F.launchImpactText,
            launchIrreversible: F.launchIrreversible,
            launchConfirm:      F.launchConfirm,
            launchCancel:       F.launchCancel,
          }}
        />,
        document.body,
      )}

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
