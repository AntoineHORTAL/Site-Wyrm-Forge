import { formatDate } from '@/lib/intl'
import { relativeTime } from '@/lib/admin-flags'
import {
  KIT_STATUS_CHAIN, kitActions, kitStatusIndex, formatKitPrice, kitInstalments,
  type KitStatus, type KitOrderRow, type KitOrderEvent, type KitConfirmKind,
} from '@/lib/kit-orders'
import type { AdminDict } from '@/locales/dashboard/admin'
import type { Lang } from '@/locales/landing'

/**
 * Carte d'un dossier « Kit sur mesure » dans le panneau admin.
 *
 * Sortie d'`AdminTab` pour la même raison que `SettingToggle`, `CutBanner` et les
 * deux modales : rendue ainsi, elle est TESTABLE en isolation via
 * `renderToStaticMarkup`, sans monter AdminTab (donc sans Supabase, sans portail,
 * sans jsdom). C'est le patron du dépôt, pas une préférence.
 *
 * ⚠️ AUCUN HOOK ici, et ce n'est pas un hasard : `KitOrderCard.test.tsx` appelle
 * la fonction directement pour parcourir l'arbre d'éléments et déclencher les
 * vrais `onClick` — impossible dès qu'un `useState` apparaît. Toute la mémoire
 * (quel dossier confirme quoi, quel prix est en cours d'édition) vit dans
 * AdminTab et descend en props.
 *
 * ⚠️ Cette carte n'écrit RIEN. Elle remonte des intentions ; AdminTab les traduit
 * en appels RPC `kit_set_status` / `kit_set_details`. Il n'existe aucune policy
 * INSERT/UPDATE/DELETE sur `kit_orders` — un `.update()` serait de toute façon
 * refusé par la base (migration 20260908000001), mais le principe doit rester
 * lisible ici aussi : la carte ne connaît pas Supabase.
 *
 * Une CARTE plutôt qu'une ligne de tableau : chaque dossier porte jusqu'à trois
 * actions, une édition de prix et une timeline dépliable. Le tableau des comptes
 * s'en sort avec des lignes parce qu'il n'a qu'un bouton par ligne.
 */

/** Couleur de la pastille d'état. Seuls les deux états TERMINAUX sont colorés. */
function statusTone(status: KitStatus): { bg: string; fg: string } {
  if (status === 'termine') return { bg: 'rgba(93,202,165,0.15)', fg: '#5DCAA5' }
  if (status === 'annule')  return { bg: 'rgba(226,75,74,0.12)',  fg: '#E24B4A' }
  // Les six états intermédiaires sont neutres : ils décrivent un dossier qui
  // avance normalement, pas une anomalie. Les teinter ferait lire une gradation
  // là où il n'y a qu'une position.
  return { bg: 'rgba(255,255,255,0.06)', fg: 'var(--text-muted)' }
}

function btnStyle(bg: string, busy: boolean): React.CSSProperties {
  return {
    padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600,
    fontFamily: 'inherit', border: 'none', background: bg, color: '#1A1A1A',
    cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.5 : 1,
  }
}

function ghostStyle(border: string): React.CSSProperties {
  return {
    padding: '5px 12px', borderRadius: 6, fontSize: 12,
    fontFamily: 'inherit', border: `1px solid ${border}`,
    background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer',
  }
}

export interface KitOrderCardProps {
  order: KitOrderRow
  /** Pseudo du client, déjà résolu. `null` → l'uuid abrégé (compte introuvable). */
  clientName: string | null
  labels: AdminDict['kits']
  /** Résolution d'un `kit_orders.status` vers son libellé traduit. */
  statusLabel: (status: string) => string
  lang: Lang
  /** Une écriture est en vol sur CE dossier : la carte se grise et se verrouille. */
  busy: boolean
  /** Confirmation ouverte sur CE dossier, ou `null`. Exclusive par construction. */
  confirm: KitConfirmKind | null
  /** Édition du prix ouverte sur CE dossier — `priceDraft` n'a de sens que si vrai. */
  priceEditing: boolean
  priceDraft: string
  /** Timeline dépliée sur CE dossier — `events` n'est lu que si vrai. */
  timelineOpen: boolean
  events: readonly KitOrderEvent[]
  /** Pseudo de l'auteur d'un événement, ou `null` s'il est inconnu. */
  actorName: (userId: string | null) => string | null
  accent: string
  border: string
  bg: string
  inputBg: string
  onAdvance: (next: KitStatus) => void
  onConfirmRequest: (kind: KitConfirmKind) => void
  onConfirmDismiss: () => void
  /** Ouvre l'édition du prix, pré-remplie avec ce brouillon (en EUROS). */
  onPriceEdit: (draft: string) => void
  onPriceDraft: (value: string) => void
  onPriceSave: () => void
  onPriceDismiss: () => void
  onToggleTimeline: () => void
}

export default function KitOrderCard({
  order, clientName, labels: K, statusLabel, lang, busy, confirm,
  priceEditing, priceDraft, timelineOpen, events, actorName,
  accent, border, bg, inputBg,
  onAdvance, onConfirmRequest, onConfirmDismiss,
  onPriceEdit, onPriceDraft, onPriceSave, onPriceDismiss, onToggleTimeline,
}: KitOrderCardProps) {
  // ⚠️ `kitActions` est le MIROIR de la garde de `kit_set_status`, verrouillé
  // par `kit-orders.test.ts` (17 transitions sur 64 couples). Un bouton rendu
  // ici correspond donc toujours à une transition que la base acceptera. La
  // réciproque n'est pas garantie et n'a pas besoin de l'être.
  const actions = kitActions(order.status)
  const idx     = kitStatusIndex(order.status)
  const tone    = statusTone(order.status)
  const price   = formatKitPrice(order.price_total_cents, lang)
  const parts   = order.price_total_cents !== null ? kitInstalments(order.price_total_cents) : null

  return (
    <div style={{
      padding: 14, borderRadius: 10,
      border: `1px solid ${border}`, background: bg,
      opacity: busy ? 0.6 : 1, transition: 'opacity 0.15s',
    }}>
      {/* ── Ligne 1 — identité, état, position, dates ─────────────────────── */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 600, fontSize: 14 }}>
          {/* Un compte supprimé emporte son dossier (FK CASCADE) ; ce repli
              couvre le cas où la liste des profils n'est pas encore chargée, ou
              une ligne écrite par service_role. Même parti pris qu'`adminName`
              pour les auteurs de coupure : un uuid abrégé plutôt qu'un vide. */}
          {clientName ?? order.user_id.slice(0, 8)}
        </span>

        <span style={{
          fontSize: 12, padding: '2px 9px', borderRadius: 999, fontWeight: 600,
          background: tone.bg, color: tone.fg,
        }}>
          {statusLabel(order.status)}
        </span>

        {/* Position dans le parcours. ABSENTE pour un dossier annulé :
            `kitStatusIndex` renvoie `null`, et « étape 0/7 » se lirait « rien
            n'a été fait » — faux d'un dossier abandonné en cours de route. */}
        {idx !== null && (
          <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>
            {K.step.replace('{n}', String(idx + 1))
                   .replace('{total}', String(KIT_STATUS_CHAIN.length))}
          </span>
        )}

        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-dim)' }}>
          {K.opened} {formatDate(new Date(order.created_at), lang, { day: '2-digit', month: 'short', year: 'numeric' })}
          {/* Dernière mise à jour, en RELATIF (« il y a 12 min ») là où
              l'ouverture est en date absolue. Les deux répondent à des questions
              différentes : « depuis quand ce client attend-il ? » se lit sur une
              date, « ce dossier a-t-il bougé récemment ? » sur une durée. Omise
              quand elle est illisible plutôt que d'afficher « il y a NaN ». */}
          {relativeTime(order.updated_at, lang) && (
            <span style={{ marginLeft: 8 }}>
              · {K.updated.replace('{when}', relativeTime(order.updated_at, lang)!)}
            </span>
          )}
        </span>
      </div>

      {/* ── Ligne 2 — prix et répartition indicative 40/60 ────────────────── */}
      <div style={{ marginTop: 8, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        {priceEditing ? (
          <>
            <input
              type="number" min="0" step="0.01"
              value={priceDraft}
              onChange={e => onPriceDraft(e.target.value)}
              placeholder={K.priceLabel}
              aria-label={K.priceLabel}
              style={{
                width: 120, padding: '5px 9px', borderRadius: 6, fontSize: 13,
                fontFamily: 'inherit', border: `1px solid ${border}`,
                background: inputBg, color: 'inherit',
              }}
            />
            <button type="button" onClick={onPriceSave} disabled={busy} style={btnStyle(accent, busy)}>
              {K.priceSave}
            </button>
            <button type="button" onClick={onPriceDismiss} style={ghostStyle(border)}>
              {K.dismiss}
            </button>
          </>
        ) : (
          <button
            type="button"
            // Centimes → EUROS pour l'édition. La conversion inverse, avec
            // arrondi, appartient à AdminTab : `19.99 * 100` vaut 1998.9999… en
            // virgule flottante, et c'est lui qui parle à la base.
            onClick={() => onPriceEdit(
              order.price_total_cents !== null ? String(order.price_total_cents / 100) : '',
            )}
            aria-label={K.priceLabel}
            style={{ ...ghostStyle(border), color: price ? 'inherit' : 'var(--text-dim)' }}
          >
            {price ?? K.noPrice}
          </button>
        )}

        {parts && (
          <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>
            {K.instalments
              .replace('{deposit}', formatKitPrice(parts.deposit, lang) ?? '')
              .replace('{balance}', formatKitPrice(parts.balance, lang) ?? '')}
          </span>
        )}
      </div>

      {/* ── Ligne 3 — actions ────────────────────────────────────────────── */}
      <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {/* Avancer NE demande PAS confirmation : c'est le cours normal du
            dossier, et le geste le plus fréquent. Reculer et annuler, si. */}
        {actions.advance && (
          <button
            type="button" disabled={busy}
            onClick={() => onAdvance(actions.advance!)}
            style={btnStyle(accent, busy)}
          >
            {K.advance.replace('{label}', statusLabel(actions.advance))}
          </button>
        )}

        {actions.rollback && (
          confirm === 'rollback' ? (
            <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: 12 }}>
              {K.confirmRollback.replace('{label}', statusLabel(actions.rollback))}
              <button
                type="button" disabled={busy}
                onClick={() => onAdvance(actions.rollback!)}
                style={btnStyle('#E2A44A', busy)}
              >{K.confirm}</button>
              <button type="button" onClick={onConfirmDismiss} style={ghostStyle(border)}>
                {K.dismiss}
              </button>
            </span>
          ) : (
            <button
              type="button" disabled={busy}
              onClick={() => onConfirmRequest('rollback')}
              style={ghostStyle(border)}
            >
              {K.rollback.replace('{label}', statusLabel(actions.rollback))}
            </button>
          )
        )}

        {actions.cancel && (
          confirm === 'cancel' ? (
            <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: 12 }}>
              {K.confirmCancel}
              <button
                type="button" disabled={busy}
                onClick={() => onAdvance('annule')}
                style={btnStyle('#E24B4A', busy)}
              >{K.confirm}</button>
              <button type="button" onClick={onConfirmDismiss} style={ghostStyle(border)}>
                {K.dismiss}
              </button>
            </span>
          ) : (
            <button
              type="button" disabled={busy}
              onClick={() => onConfirmRequest('cancel')}
              style={{ ...ghostStyle(border), color: '#E24B4A' }}
            >{K.cancel}</button>
          )
        )}

        <button
          type="button"
          onClick={onToggleTimeline}
          style={{ ...ghostStyle(border), marginLeft: 'auto' }}
        >
          {timelineOpen ? K.timelineHide : K.timelineShow}
        </button>
      </div>

      {/* ── Timeline — chargée à la demande, ADMIN uniquement ──────────────
          Policy `koe_select_admin` : le client ne lit jamais sa propre timeline.
          Elle porte les retours arrière et les notes internes, qui ne le
          regardent pas — son statut courant est la vérité qui le concerne. */}
      {timelineOpen && (
        <div style={{
          marginTop: 10, paddingTop: 10, borderTop: `1px solid ${border}`,
          display: 'flex', flexDirection: 'column', gap: 5,
        }}>
          {events.length === 0 && (
            <span style={{ fontSize: 11, color: 'var(--text-dim)', fontStyle: 'italic' }}>
              {K.timelineEmpty}
            </span>
          )}
          {events.map(ev => {
            const who = actorName(ev.actor)
            return (
              <div key={ev.id} style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                <span style={{ color: 'var(--text-dim)', marginRight: 8 }}>
                  {relativeTime(ev.created_at, lang)}
                </span>
                {ev.from_status
                  ? K.timelineMoved
                      .replace('{from}', statusLabel(ev.from_status))
                      .replace('{to}',   statusLabel(ev.to_status))
                  : K.timelineOpened.replace('{to}', statusLabel(ev.to_status))}
                {/* Auteur inconnu (compte supprimé, écriture service_role du
                    futur webhook Stripe) → mention omise plutôt qu'un UUID. */}
                {who && (
                  <span style={{ marginLeft: 8, color: 'var(--text-dim)' }}>
                    {K.timelineBy.replace('{who}', who)}
                  </span>
                )}
                {ev.note && <span style={{ marginLeft: 8 }}>— {ev.note}</span>}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
