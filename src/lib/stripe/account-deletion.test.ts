import { describe, it, expect, vi } from 'vitest'
import {
  deletionActionFor,
  uniqueSubscriptions,
  stopBillingThenRecordDeletion,
  shouldStopBillingForDeletedAccount,
  cancelAndDiscardRenewal,
  type SubscriptionLite,
} from './account-deletion'

/**
 * Un compte supprimé ne doit plus JAMAIS être prélevé.
 *
 * Verrouillé ici : la décision par statut, l'ORDRE « Stripe puis demande », et
 * le verdict du filet du webhook. Le chemin réel (Stripe en mode test, horloge
 * de test avancée au-delà du renouvellement) est rejoué par
 * `scripts/stripe-deletion-smoke.mjs`.
 */

const sub = (status: string, cancel_at_period_end = false, id = `sub_${status}`): SubscriptionLite =>
  ({ id, status, cancel_at_period_end })

describe('deletionActionFor — que faire de chaque abonnement à la demande', () => {
  it.each(['active', 'trialing', 'past_due', 'unpaid'])(
    '%s ⇒ fin de période (plus aucun renouvellement, accès payé conservé)',
    (status) => expect(deletionActionFor(sub(status))).toBe('schedule'),
  )

  it.each(['incomplete', 'paused'])('%s ⇒ résiliation immédiate (aucun accès payé à préserver)', (status) => {
    expect(deletionActionFor(sub(status))).toBe('cancel_now')
  })

  it.each(['canceled', 'incomplete_expired'])('%s ⇒ rien à faire', (status) => {
    expect(deletionActionFor(sub(status))).toBe('skip')
  })

  it('résiliation déjà programmée ⇒ rien à refaire', () => {
    expect(deletionActionFor(sub('active', true))).toBe('skip')
  })

  it('statut inconnu de Stripe ⇒ fin de période (le choix qui supprime tout renouvellement)', () => {
    expect(deletionActionFor(sub('some_future_status'))).toBe('schedule')
  })

  it('tolère la casse et les espaces', () => {
    expect(deletionActionFor(sub(' Active '))).toBe('schedule')
  })
})

describe('uniqueSubscriptions — table + recherche Stripe', () => {
  it('dédoublonne par identifiant, en gardant la première occurrence', () => {
    const a = sub('active', false, 'sub_1')
    const b = sub('active', false, 'sub_2')
    expect(uniqueSubscriptions([[a, b], [sub('canceled', false, 'sub_1')]])).toEqual([a, b])
  })
})

describe('stopBillingThenRecordDeletion — Stripe AVANT la demande', () => {
  it('programme la fin, résilie ce qui doit l’être, PUIS enregistre la demande', async () => {
    const calls: string[] = []
    const res = await stopBillingThenRecordDeletion({
      findSubscriptions: async () => [
        sub('active', false, 'sub_a'),
        sub('incomplete', false, 'sub_i'),
        sub('canceled', false, 'sub_c'),
        sub('active', true, 'sub_done'),
      ],
      schedule: async (id) => { calls.push(`schedule:${id}`) },
      cancelNow: async (id) => { calls.push(`cancel:${id}`) },
      recordRequest: async () => { calls.push('record'); return { id: 'req_1' } },
    })

    expect(calls).toEqual(['schedule:sub_a', 'cancel:sub_i', 'record'])
    expect(res).toMatchObject({ ok: true, scheduled: ['sub_a'], canceled: ['sub_i'], record: { id: 'req_1' } })
  })

  it('🔴 Stripe en échec ⇒ la demande N’EST PAS enregistrée', async () => {
    const recordRequest = vi.fn(async () => ({}))
    const res = await stopBillingThenRecordDeletion({
      findSubscriptions: async () => [sub('active', false, 'sub_a'), sub('active', false, 'sub_b')],
      schedule: async (id) => { if (id === 'sub_b') throw new Error('stripe down') },
      cancelNow: async () => {},
      recordRequest,
    })

    expect(recordRequest).not.toHaveBeenCalled()
    // Ce qui a été fait avant l'échec est dit — et jamais défait.
    expect(res).toMatchObject({ ok: false, stage: 'stripe', scheduled: ['sub_a'] })
  })

  it('🔴 recherche des abonnements en échec ⇒ rien n’est enregistré (on ne suppose pas « aucun abonnement »)', async () => {
    const recordRequest = vi.fn(async () => ({}))
    const res = await stopBillingThenRecordDeletion({
      findSubscriptions: async () => { throw new Error('search indisponible') },
      schedule: async () => {},
      cancelNow: async () => {},
      recordRequest,
    })
    expect(recordRequest).not.toHaveBeenCalled()
    expect(res).toMatchObject({ ok: false, stage: 'stripe' })
  })

  it('enregistrement en échec APRÈS Stripe ⇒ stage record, facturation arrêtée quand même', async () => {
    const res = await stopBillingThenRecordDeletion({
      findSubscriptions: async () => [sub('active', false, 'sub_a')],
      schedule: async () => {},
      cancelNow: async () => {},
      recordRequest: async () => { throw new Error('insert KO') },
    })
    expect(res).toMatchObject({ ok: false, stage: 'record', scheduled: ['sub_a'] })
  })

  it('compte sans aucun abonnement ⇒ la demande est enregistrée normalement', async () => {
    const res = await stopBillingThenRecordDeletion({
      findSubscriptions: async () => [],
      schedule: async () => {},
      cancelNow: async () => {},
      recordRequest: async () => 'ok',
    })
    expect(res).toMatchObject({ ok: true, scheduled: [], canceled: [], record: 'ok' })
  })
})

describe('cancelAndDiscardRenewal — couper un renouvellement avant prélèvement', () => {
  function fakeStripe(status: string) {
    const calls: string[] = []
    const client = {
      subscriptions: { cancel: async (id: string) => { calls.push(`cancel:${id}`) } },
      invoices: {
        retrieve: async (id: string) => { calls.push(`retrieve:${id}`); return { status } },
        update: async (id: string, p: { auto_advance: boolean }) => { calls.push(`update:${id}:auto_advance=${p.auto_advance}`) },
        voidInvoice: async (id: string) => { calls.push(`void:${id}`) },
      },
    }
    return { client, calls }
  }

  it('🔴 résilie D’ABORD, puis fige la facture brouillon (jamais finalisée, jamais prélevée)', async () => {
    const { client, calls } = fakeStripe('draft')
    expect(await cancelAndDiscardRenewal(client, 'sub_1', 'in_1')).toBe('frozen')
    expect(calls).toEqual(['cancel:sub_1', 'retrieve:in_1', 'update:in_1:auto_advance=false'])
  })

  it('ne tente JAMAIS de supprimer la facture (Stripe le refuse pour une facture d’abonnement)', async () => {
    const { client } = fakeStripe('draft')
    expect('del' in client.invoices).toBe(false)
  })

  it('facture déjà finalisée mais impayée ⇒ annulée', async () => {
    const { client, calls } = fakeStripe('open')
    expect(await cancelAndDiscardRenewal(client, 'sub_1', 'in_1')).toBe('voided')
    expect(calls).toContain('void:in_1')
  })

  it('facture déjà payée ⇒ signalée « paid » (remboursement manuel), abonnement résilié quand même', async () => {
    const { client, calls } = fakeStripe('paid')
    expect(await cancelAndDiscardRenewal(client, 'sub_1', 'in_1')).toBe('paid')
    expect(calls[0]).toBe('cancel:sub_1')
    expect(calls).not.toContain('void:in_1')
  })
})

describe('shouldStopBillingForDeletedAccount — filet du webhook', () => {
  it('🔴 compte identifié, profil disparu, abonnement vivant ⇒ résilier', () => {
    for (const status of ['active', 'trialing', 'past_due', 'unpaid', 'incomplete', 'paused']) {
      expect(shouldStopBillingForDeletedAccount({ userId: 'u', profileExists: false, status })).toBe(true)
    }
  })

  it('compte existant ⇒ jamais', () => {
    expect(shouldStopBillingForDeletedAccount({ userId: 'u', profileExists: true, status: 'active' })).toBe(false)
  })

  it('compte NON identifié ⇒ jamais (on ne coupe pas sur une absence d’information)', () => {
    expect(shouldStopBillingForDeletedAccount({ userId: null, profileExists: false, status: 'active' })).toBe(false)
  })

  it('abonnement déjà terminé ⇒ rien à résilier', () => {
    expect(shouldStopBillingForDeletedAccount({ userId: 'u', profileExists: false, status: 'canceled' })).toBe(false)
  })
})
