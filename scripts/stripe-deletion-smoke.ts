// ════════════════════════════════════════════════════════════════════════════
//  Smoke test RÉEL — « un compte supprimé ne doit plus jamais être prélevé »
// ════════════════════════════════════════════════════════════════════════════
// Rejoue, sur le SANDBOX Stripe et avec une HORLOGE DE TEST avancée au-delà du
// renouvellement, les deux étages de `src/lib/stripe/account-deletion.ts` — le
// vrai code du module, pas une copie :
//
//   A. Demande de suppression (chemin nominal) — `stopBillingThenRecordDeletion`
//      programme la fin de l'abonnement ; l'horloge passe l'échéance ; on
//      vérifie qu'AUCUNE facture de renouvellement n'a été créée ni payée.
//   B. Filet du webhook (compte supprimé sans demande) — l'horloge passe
//      l'échéance, Stripe crée la facture de renouvellement en brouillon ;
//      `cancelAndDiscardRenewal` (le geste du webhook sur `invoice.created`)
//      résilie l'abonnement et FIGE le brouillon (`auto_advance: false`) ; on
//      vérifie qu'il n'est jamais finalisé ni prélevé.
//
// ⚠️ Passe par la CLI `stripe` (connectée au sandbox), JAMAIS par
// STRIPE_SECRET_KEY : la clé de `.env.local` est une clé LIVE. Chaque objet
// renvoyé est contrôlé `livemode: false` ; le script s'arrête au premier objet
// live. Tout est nettoyé à la fin (horloges supprimées → clients et
// abonnements avec, prix et produit archivés).
//
// Usage : npx tsx scripts/stripe-deletion-smoke.ts   (même convention que postgame-measure.ts)
// Durée : 1 à 2 minutes (avance des horloges de test).
// ════════════════════════════════════════════════════════════════════════════
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import {
  stopBillingThenRecordDeletion,
  cancelAndDiscardRenewal,
  type SubscriptionLite,
  type StripeRenewalClient,
} from '../src/lib/stripe/account-deletion'

// JSON brut renvoyé par la CLI : volontairement non typé, chaque champ lu est vérifié.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Obj = Record<string, any>

function cli(args: string[]): Obj {
  const out = execFileSync('stripe', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  // Les opérations DELETE (même avec `--confirm`) impriment un en-tête
  // « This command will be executed… Mode: Test » AVANT le JSON.
  if (args.includes('--confirm') && !/Mode: Test/.test(out)) {
    throw new Error('La CLI ne confirme pas le mode Test — arrêt.')
  }
  const json = JSON.parse(out.slice(out.indexOf('{'))) as Obj
  assertTestMode(json)
  if (json.error) throw new Error(`stripe ${args.slice(0, 2).join(' ')}: ${json.error.message}`)
  return json
}

function assertTestMode(o: unknown): void {
  if (!o || typeof o !== 'object') return
  const r = o as Obj
  if (r.livemode === true) throw new Error('OBJET LIVE — arrêt immédiat. La CLI doit pointer le sandbox.')
  if (Array.isArray(r.data)) r.data.forEach(assertTestMode)
}

const checks: { name: string; ok: boolean; detail: string }[] = []
function check(name: string, ok: boolean, detail: string) {
  checks.push({ name, ok, detail })
  console.log(`${ok ? '✅' : '❌'} ${name} — ${detail}`)
}

async function advance(clockId: string, to: number) {
  cli(['test_helpers', 'test_clocks', 'advance', clockId, '-d', `frozen_time=${to}`])
  for (let i = 0; i < 90; i++) {
    const c = cli(['test_helpers', 'test_clocks', 'retrieve', clockId])
    if (c.status === 'ready') return
    if (c.status === 'internal_failure') throw new Error(`horloge ${clockId} en échec`)
    await new Promise(r => setTimeout(r, 2000))
  }
  throw new Error(`horloge ${clockId} jamais prête`)
}

/** Client sur une horloge, carte de test par défaut, abonnement actif payé. */
function subscribedCustomer(clockId: string, priceId: string, userId: string) {
  const customer = cli(['customers', 'create', '-d', `test_clock=${clockId}`,
    '-d', 'email=deletion-smoke@example.com', '-d', 'payment_method=pm_card_visa'])
  const pm = cli(['payment_methods', 'list', '-d', `customer=${customer.id}`, '-d', 'type=card']).data[0]
  const sub = cli(['subscriptions', 'create', '-d', `customer=${customer.id}`,
    '-d', `items[0][price]=${priceId}`, '-d', `default_payment_method=${pm.id}`,
    '-d', `metadata[user_id]=${userId}`])
  return { customer, sub }
}

function invoicesOf(customerId: string): Obj[] {
  return cli(['invoices', 'list', '-d', `customer=${customerId}`, '-d', 'limit=20']).data
}

/** Le client Stripe structurel attendu par `cancelAndDiscardRenewal`, via la CLI. */
const cliRenewalClient: StripeRenewalClient = {
  subscriptions: {
    cancel: async (id) => cli(['subscriptions', 'cancel', id, '-d', 'invoice_now=false', '-d', 'prorate=false', '--confirm']),
  },
  invoices: {
    retrieve: async (id) => cli(['invoices', 'retrieve', id]) as { status: string | null },
    update: async (id, p) => cli(['invoices', 'update', id, '-d', `auto_advance=${p.auto_advance}`]),
    voidInvoice: async (id) => cli(['invoices', 'void_invoice', id]),
  },
}

async function main() {
  const now = Math.floor(Date.now() / 1000)
  const DAY = 86400
  const created: { clocks: string[]; product?: string; price?: string } = { clocks: [] }

  try {
    const price = cli(['prices', 'create', '-d', 'unit_amount=300', '-d', 'currency=eur',
      '-d', 'recurring[interval]=month', '-d', 'product_data[name]=Smoke suppression de compte'])
    created.price = price.id
    created.product = price.product

    // ── A. Demande de suppression : fin de période, puis échéance franchie ──
    const clockA = cli(['test_helpers', 'test_clocks', 'create', '-d', `frozen_time=${now}`, '-d', 'name=smoke-deletion-A'])
    created.clocks.push(clockA.id)
    const userA = randomUUID()
    const a = subscribedCustomer(clockA.id, price.id, userA)
    check('A0 — abonnement actif, premier paiement encaissé', a.sub.status === 'active',
      `status=${a.sub.status}`)

    const result = await stopBillingThenRecordDeletion({
      findSubscriptions: async () => {
        const list = cli(['subscriptions', 'list', '-d', `customer=${a.customer.id}`, '-d', 'status=all'])
        return list.data.map((s: Obj): SubscriptionLite =>
          ({ id: s.id, status: s.status, cancel_at_period_end: s.cancel_at_period_end }))
      },
      schedule: async (id) => { cli(['subscriptions', 'update', id, '-d', 'cancel_at_period_end=true']) },
      cancelNow: async (id) => { cli(['subscriptions', 'cancel', id, '--confirm']) },
      recordRequest: async () => 'demande enregistrée (simulée — pas de base ici)',
    })
    check('A1 — Stripe traité avant la demande, demande enregistrée', result.ok && result.scheduled.length === 1,
      JSON.stringify({ ok: result.ok, scheduled: result.scheduled.length }))

    const afterA = cli(['subscriptions', 'retrieve', a.sub.id])
    check('A2 — abonnement programmé pour s’arrêter', afterA.cancel_at_period_end === true,
      `cancel_at_period_end=${afterA.cancel_at_period_end}`)

    await advance(clockA.id, now + 40 * DAY)
    const finalA = cli(['subscriptions', 'retrieve', a.sub.id])
    const invA = invoicesOf(a.customer.id)
    const paidA = invA.filter(i => i.status === 'paid')
    const cycleA = invA.filter(i => i.billing_reason === 'subscription_cycle')
    check('A3 — 🔴 après l’échéance : abonnement terminé', finalA.status === 'canceled', `status=${finalA.status}`)
    check('A4 — 🔴 aucun renouvellement facturé, un seul paiement au total',
      paidA.length === 1 && cycleA.length === 0,
      `payées=${paidA.length} renouvellements=${cycleA.length} (factures: ${invA.map(i => `${i.billing_reason}/${i.status}`).join(', ')})`)

    // ── B. Filet du webhook : compte supprimé SANS demande ──────────────────
    const clockB = cli(['test_helpers', 'test_clocks', 'create', '-d', `frozen_time=${now}`, '-d', 'name=smoke-deletion-B'])
    created.clocks.push(clockB.id)
    const b = subscribedCustomer(clockB.id, price.id, randomUUID())
    const periodEnd: number = b.sub.items.data[0].current_period_end

    // Juste après l'échéance : Stripe a créé la facture de renouvellement, en
    // brouillon (finalisation automatique environ une heure plus tard).
    await advance(clockB.id, periodEnd + 300)
    const draft = invoicesOf(b.customer.id).find(i => i.billing_reason === 'subscription_cycle')
    check('B0 — facture de renouvellement créée, encore en brouillon', draft?.status === 'draft',
      `facture=${draft?.id ?? '∅'} status=${draft?.status ?? '∅'}`)

    if (draft) {
      const outcome = await cancelAndDiscardRenewal(cliRenewalClient, b.sub.id, draft.id)
      check('B1 — le geste du webhook résilie et fige la facture brouillon', outcome === 'frozen', `outcome=${outcome}`)
    }

    await advance(clockB.id, periodEnd + 5 * DAY)
    const finalB = cli(['subscriptions', 'retrieve', b.sub.id])
    const invB = invoicesOf(b.customer.id)
    const paidB = invB.filter(i => i.status === 'paid')
    const renewal = invB.find(i => i.billing_reason === 'subscription_cycle')
    check('B2 — 🔴 abonnement résilié', finalB.status === 'canceled', `status=${finalB.status}`)
    check('B3 — 🔴 le renouvellement n’a jamais été prélevé, un seul paiement au total',
      paidB.length === 1 && renewal?.status !== 'paid',
      `payées=${paidB.length} (factures: ${invB.map(i => `${i.billing_reason}/${i.status}`).join(', ')})`)
    check('B4 — 5 jours plus tard, la facture de renouvellement est toujours un brouillon figé',
      renewal?.status === 'draft' && renewal?.auto_advance === false && (renewal?.amount_paid ?? 0) === 0,
      `status=${renewal?.status} auto_advance=${renewal?.auto_advance} amount_paid=${renewal?.amount_paid}`)
  } finally {
    // Nettoyage : supprimer une horloge supprime ses clients et abonnements.
    for (const id of created.clocks) {
      try { cli(['test_helpers', 'test_clocks', 'delete', id, '--confirm']) } catch (e) { console.warn('nettoyage horloge', id, e) }
    }
    if (created.price) try { cli(['prices', 'update', created.price, '-d', 'active=false']) } catch { /* déjà archivé */ }
    if (created.product) try { cli(['products', 'update', created.product, '-d', 'active=false']) } catch { /* idem */ }
  }

  const failed = checks.filter(c => !c.ok)
  console.log(`\n${checks.length - failed.length}/${checks.length} vérifications OK`)
  process.exit(failed.length === 0 ? 0 : 1)
}

main().catch((e) => { console.error(e); process.exit(1) })
