import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { isValidElement, type ReactElement, type ReactNode } from 'react'
import KitOrderCard, { type KitOrderCardProps } from './KitOrderCard'
import { adminFr, adminEn, kitStatusLabel } from '@/locales/dashboard/admin'
import {
  KIT_STATUS_CHAIN, kitActions,
  type KitStatus, type KitOrderRow, type KitOrderEvent,
} from '@/lib/kit-orders'

/**
 * RENDU et CÂBLAGE de la carte d'un dossier « Kit sur mesure ».
 *
 * Rendu en HTML statique via `react-dom/server` — ni jsdom ni testing-library,
 * comme `SubViewTabs.test.tsx`, `SettingToggle.test.tsx` et
 * `LiveComposition.test.tsx`. `KitOrderCard` est écrite SANS hook précisément
 * pour ça : on peut l'appeler comme une simple fonction, parcourir l'arbre
 * d'éléments retourné et déclencher les vrais `onClick`.
 *
 * ⚠️ Ce que ce fichier NE prouve PAS, et ne peut pas prouver : que la base
 * refuse une transition. Ça, c'est
 * `supabase/tests/20260908000001_kit_orders_test.sql` (T5, T6). Ici on vérifie
 * seulement que l'écran ne PROPOSE jamais un geste que la base refuserait — la
 * carte est un miroir d'affichage, jamais une barrière.
 */

function render(el: ReactElement): ReactNode {
  const run = el.type as (props: unknown) => ReactNode
  return run(el.props)
}

function clickables(node: ReactNode, out: ReactElement[] = []): ReactElement[] {
  if (Array.isArray(node)) { node.forEach(n => clickables(n, out)); return out }
  if (!isValidElement(node)) return out
  const props = node.props as { onClick?: unknown; children?: ReactNode }
  if (typeof props.onClick === 'function') out.push(node)
  clickables(props.children, out)
  return out
}

/** Le bouton dont le rendu textuel contient `needle`. */
function buttonWith(tree: ReactNode, needle: string): ReactElement {
  const found = clickables(tree).filter(el => {
    const kids = (el.props as { children?: ReactNode }).children
    return JSON.stringify(kids ?? '').includes(needle)
  })
  if (found.length === 0) throw new Error(`aucun bouton contenant « ${needle} »`)
  return found[0]
}

function click(el: ReactElement) {
  ;(el.props as { onClick: () => void }).onClick()
}

const K = adminFr.kits

const ORDER: KitOrderRow = {
  id: 'ord-1',
  user_id: '11111111-2222-3333-4444-555555555555',
  status: 'acompte_paye',
  price_total_cents: null,
  admin_note: null,
  created_at: '2026-09-01T10:00:00Z',
  updated_at: '2026-09-08T10:00:00Z',
}

const EVENTS: KitOrderEvent[] = [
  { id: 2, from_status: 'demande', to_status: 'acompte_paye', actor: 'admin-1', note: null, created_at: '2026-09-02T10:00:00Z' },
  { id: 1, from_status: null,      to_status: 'demande',      actor: null,      note: 'ouvert au tel', created_at: '2026-09-01T10:00:00Z' },
]

function card(over: Partial<KitOrderCardProps> = {}) {
  const props: KitOrderCardProps = {
    order: ORDER,
    clientName: 'Faker',
    labels: K,
    statusLabel: s => kitStatusLabel(adminFr, s),
    lang: 'fr',
    busy: false,
    confirm: null,
    priceEditing: false,
    priceDraft: '',
    timelineOpen: false,
    events: [],
    actorName: id => (id === 'admin-1' ? 'HORTAL' : null),
    accent: '#EF9F27',
    border: '#27272A',
    bg: '#18181B',
    inputBg: '#27272A',
    onAdvance: () => {},
    onConfirmRequest: () => {},
    onConfirmDismiss: () => {},
    onPriceEdit: () => {},
    onPriceDraft: () => {},
    onPriceSave: () => {},
    onPriceDismiss: () => {},
    onToggleTimeline: () => {},
    ...over,
  }
  return <KitOrderCard {...props} />
}

describe('rendu de la carte', () => {
  it('affiche le client, l\'état et la position dans le parcours', () => {
    const html = renderToStaticMarkup(card())

    expect(html).toContain('Faker')
    expect(html).toContain(K.statuses.acompte_paye)
    // `acompte_paye` est l'index 1 de la chaîne → « étape 2/7 ».
    expect(html).toContain(`étape 2/${KIT_STATUS_CHAIN.length}`)
  })

  it('retombe sur l\'uuid abrégé quand le client est introuvable', () => {
    // Le cas réel : liste des profils pas encore chargée, ou ligne écrite par
    // service_role. Un vide ferait croire à un dossier orphelin.
    const html = renderToStaticMarkup(card({ clientName: null }))

    expect(html).toContain('11111111')
    expect(html).not.toContain(ORDER.user_id)   // abrégé, pas l'uuid entier
  })

  it('affiche les deux dates : ouverture absolue, mise à jour relative', () => {
    const html = renderToStaticMarkup(card())

    expect(html).toContain(K.opened)
    // `updated` enveloppe une durée produite par `relativeTime`.
    expect(html).toContain('màj')
  })

  it('n\'affiche AUCUNE étape pour un dossier annulé', () => {
    // `kitStatusIndex('annule')` vaut null : « étape 0/7 » se lirait « rien n'a
    // été fait », ce qui est faux d'un dossier abandonné en cours de route.
    const html = renderToStaticMarkup(card({ order: { ...ORDER, status: 'annule' } }))

    expect(html).not.toContain('étape')
    expect(html).toContain(K.statuses.annule)
  })

  it('ne colore que les deux états terminaux', () => {
    const done = renderToStaticMarkup(card({ order: { ...ORDER, status: 'termine' } }))
    const gone = renderToStaticMarkup(card({ order: { ...ORDER, status: 'annule' } }))
    const mid  = renderToStaticMarkup(card({ order: { ...ORDER, status: 'kit_trouve' } }))

    expect(done).toContain('#5DCAA5')
    expect(gone).toContain('#E24B4A')
    // Un état intermédiaire ne porte aucune des deux teintes de statut : il
    // décrit un dossier qui avance, pas une anomalie ni une réussite.
    expect(mid).not.toContain('#5DCAA5')
  })

  it('rend tous ses boutons en type="button"', () => {
    // Sans `type`, un bouton dans un futur <form> soumettrait la page.
    const html = renderToStaticMarkup(card())
    const buttons = html.match(/<button/g) ?? []

    expect(buttons.length).toBeGreaterThan(0)
    expect(html.match(/type="button"/g)).toHaveLength(buttons.length)
  })
})

describe('prix', () => {
  it('affiche un tiret tant que le prix n\'est pas renseigné', () => {
    const html = renderToStaticMarkup(card())
    expect(html).toContain(K.noPrice)
  })

  it('affiche le montant et la répartition 40/60 quand il l\'est', () => {
    const html = renderToStaticMarkup(card({
      order: { ...ORDER, price_total_cents: 10000 },
    }))

    expect(html).toContain('100,00')      // total
    expect(html).toContain('40,00')       // acompte
    expect(html).toContain('60,00')       // solde
  })

  it('ouvre l\'édition PRÉ-REMPLIE en euros, pas en centimes', () => {
    // La conversion inverse (avec arrondi) appartient à AdminTab : c'est lui qui
    // parle à la base. La carte ne fait que proposer un brouillon lisible.
    const onPriceEdit = vi.fn()
    click(buttonWith(render(card({
      order: { ...ORDER, price_total_cents: 9900 }, onPriceEdit,
    })), '99'))

    expect(onPriceEdit).toHaveBeenCalledExactlyOnceWith('99')
  })

  it('propose un brouillon VIDE quand aucun prix n\'est encore posé', () => {
    const onPriceEdit = vi.fn()
    click(buttonWith(render(card({ onPriceEdit })), K.noPrice))

    expect(onPriceEdit).toHaveBeenCalledExactlyOnceWith('')
  })

  it('remplace le bouton par un champ quand l\'édition est ouverte', () => {
    const html = renderToStaticMarkup(card({ priceEditing: true, priceDraft: '99' }))

    expect(html).toContain('type="number"')
    expect(html).toContain(K.priceSave)
  })
})

describe('🔴 les actions offertes suivent la table de transitions', () => {
  /**
   * Le test qui compte pour cette carte.
   *
   * Pour CHACUN des 8 états, on vérifie que les boutons rendus correspondent
   * exactement à ce que `kitActions` autorise — lui-même verrouillé sur les 17
   * transitions valides par `kit-orders.test.ts`. Un bouton de trop ici, c'est
   * un clic qui partirait en RPC pour se faire refuser par la base avec
   * `invalid_transition` : une erreur affichée à l'admin pour un geste que
   * l'écran lui avait proposé.
   */
  const ALL: KitStatus[] = [...KIT_STATUS_CHAIN, 'annule']

  for (const status of ALL) {
    it(`« ${status} » ne propose que ses transitions valides`, () => {
      const actions = kitActions(status)
      const html = renderToStaticMarkup(card({ order: { ...ORDER, status } }))

      // Avancer
      if (actions.advance) {
        expect(html, status).toContain(
          K.advance.replace('{label}', K.statuses[actions.advance]))
      } else {
        expect(html, status).not.toContain('→ ')
      }

      // Reculer
      if (actions.rollback) {
        expect(html, status).toContain(
          K.rollback.replace('{label}', K.statuses[actions.rollback]))
      } else {
        expect(html, status).not.toContain('← ')
      }

      // Annuler
      expect(html.includes(`>${K.cancel}<`), status).toBe(actions.cancel)
    })
  }

  it('un dossier TERMINÉ n\'offre plus que l\'historique', () => {
    // `termine` est terminal dans les deux sens : ni avance, ni retour, ni
    // annulation. Un kit livré ne se dé-livre pas.
    const tree = render(card({ order: { ...ORDER, status: 'termine' } }))
    const labels = clickables(tree).map(el =>
      JSON.stringify((el.props as { children?: ReactNode }).children ?? ''))

    // Deux boutons restent : le prix (toujours éditable) et l'historique.
    expect(labels.some(l => l.includes(K.timelineShow))).toBe(true)
    expect(labels.some(l => l.includes(K.cancel))).toBe(false)
  })

  it('un dossier ANNULÉ n\'offre plus que l\'historique', () => {
    const tree = render(card({ order: { ...ORDER, status: 'annule' } }))
    const labels = clickables(tree).map(el =>
      JSON.stringify((el.props as { children?: ReactNode }).children ?? ''))

    expect(labels.some(l => l.includes(K.timelineShow))).toBe(true)
    expect(labels.some(l => l.includes(K.cancel))).toBe(false)
  })
})

describe('confirmations', () => {
  it('avancer NE demande PAS confirmation — c\'est le cours normal du dossier', () => {
    const onAdvance = vi.fn()
    const onConfirmRequest = vi.fn()
    const next = kitActions(ORDER.status).advance!

    click(buttonWith(render(card({ onAdvance, onConfirmRequest })),
      K.statuses[next]))

    expect(onAdvance).toHaveBeenCalledExactlyOnceWith(next)
    expect(onConfirmRequest).not.toHaveBeenCalled()
  })

  it('reculer demande confirmation AVANT d\'écrire', () => {
    // Reculer avoue une erreur et laisse une ligne d'audit : on ne la pose pas
    // par mégarde.
    const onAdvance = vi.fn()
    const onConfirmRequest = vi.fn()
    const prev = kitActions(ORDER.status).rollback!

    click(buttonWith(render(card({ onAdvance, onConfirmRequest })),
      K.rollback.replace('{label}', K.statuses[prev])))

    expect(onConfirmRequest).toHaveBeenCalledExactlyOnceWith('rollback')
    expect(onAdvance).not.toHaveBeenCalled()
  })

  it('annuler demande confirmation AVANT d\'écrire', () => {
    const onAdvance = vi.fn()
    const onConfirmRequest = vi.fn()

    click(buttonWith(render(card({ onAdvance, onConfirmRequest })), K.cancel))

    expect(onConfirmRequest).toHaveBeenCalledExactlyOnceWith('cancel')
    expect(onAdvance).not.toHaveBeenCalled()
  })

  it('la confirmation d\'annulation écrit bien « annule »', () => {
    const onAdvance = vi.fn()
    click(buttonWith(render(card({ confirm: 'cancel', onAdvance })), K.confirm))

    expect(onAdvance).toHaveBeenCalledExactlyOnceWith('annule')
  })

  it('la confirmation de retour écrit bien l\'état précédent', () => {
    const onAdvance = vi.fn()
    const prev = kitActions(ORDER.status).rollback!
    click(buttonWith(render(card({ confirm: 'rollback', onAdvance })), K.confirm))

    expect(onAdvance).toHaveBeenCalledExactlyOnceWith(prev)
  })

  it('n\'affiche JAMAIS les deux confirmations à la fois', () => {
    // `confirm` est UNE valeur, pas deux booléens : c'est ce qui rend l'état
    // « les deux ouvertes » inatteignable, et non une garde d'affichage.
    const roll = renderToStaticMarkup(card({ confirm: 'rollback' }))
    const canc = renderToStaticMarkup(card({ confirm: 'cancel' }))

    expect(roll).not.toContain(K.confirmCancel)
    expect(canc).not.toContain(K.confirmRollback.slice(0, 12))
  })
})

describe('verrouillage pendant une écriture', () => {
  it('désactive les boutons d\'action quand une RPC est en vol', () => {
    const html = renderToStaticMarkup(card({ busy: true }))

    // Le bouton « avancer » est désactivé, et la carte est grisée.
    expect(html).toContain('disabled=""')
    expect(html).toContain('opacity:0.6')
  })

  it('laisse l\'historique consultable même occupé', () => {
    // Lire ne provoque aucune écriture : rien ne justifie de le bloquer.
    const tree = render(card({ busy: true }))
    const btn = buttonWith(tree, K.timelineShow)

    expect((btn.props as { disabled?: boolean }).disabled).toBeFalsy()
  })
})

describe('timeline', () => {
  it('reste fermée par défaut', () => {
    const html = renderToStaticMarkup(card())

    expect(html).toContain(K.timelineShow)
    expect(html).not.toContain(K.timelineEmpty)
  })

  it('affiche les événements, du plus récent au plus ancien', () => {
    const html = renderToStaticMarkup(card({ timelineOpen: true, events: EVENTS }))

    expect(html).toContain(K.timelineHide)
    // Événement de transition (from → to) et événement d'ouverture (from null).
    expect(html).toContain(K.statuses.acompte_paye)
    expect(html).toContain('ouvert au tel')
  })

  it('nomme l\'auteur quand il est connu, l\'omet sinon', () => {
    const html = renderToStaticMarkup(card({ timelineOpen: true, events: EVENTS }))

    // `actor: 'admin-1'` → résolu ; `actor: null` → aucune mention, surtout pas
    // un UUID. Une seule des deux lignes porte donc « par … ».
    expect(html).toContain('HORTAL')
    expect(html.match(/par HORTAL/g)).toHaveLength(1)
  })

  it('dit explicitement qu\'il n\'y a rien plutôt que de rester vide', () => {
    const html = renderToStaticMarkup(card({ timelineOpen: true, events: [] }))

    expect(html).toContain(K.timelineEmpty)
  })

  it('remonte le pli/dépli au parent', () => {
    const onToggleTimeline = vi.fn()
    click(buttonWith(render(card({ onToggleTimeline })), K.timelineShow))

    expect(onToggleTimeline).toHaveBeenCalledOnce()
  })
})

describe('parité FR / EN', () => {
  it('rend la carte dans les deux langues sans clé manquante', () => {
    // Le dico EN est typé `AdminDict`, donc les clés sont garanties à la
    // compilation. Ce test couvre le RENDU : un gabarit dont le marqueur
    // `{label}` ne serait pas remplacé laisserait l'accolade visible à l'écran.
    for (const [dict, lang] of [[adminFr, 'fr'], [adminEn, 'en']] as const) {
      const html = renderToStaticMarkup(card({
        labels: dict.kits,
        statusLabel: s => kitStatusLabel(dict, s),
        lang,
        order: { ...ORDER, price_total_cents: 10000 },
      }))

      expect(html, lang).toContain(dict.kits.statuses.acompte_paye)
      expect(html, lang).not.toContain('{label}')
      expect(html, lang).not.toContain('{n}')
      expect(html, lang).not.toContain('{total}')
      expect(html, lang).not.toContain('{deposit}')
      expect(html, lang).not.toContain('{balance}')
      expect(html, lang).not.toContain('{when}')
    }
  })
})
