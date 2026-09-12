import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import {
  cancellationIntent,
  enqueueSafely,
  isCancellationScheduled,
  orderConfirmationIntent,
  periodFromInterval,
  renewalReminderIntent,
  wasCancellationScheduled,
  type EmailIntent,
} from './subscription-emails'
import {
  REMINDER_MARGIN_DAYS,
  reminderWindow,
  subtractCalendarMonths,
} from '../../../supabase/functions/_shared/subscription-emails'

/**
 * Côté webhook : QUEL e-mail déposer, QUAND, avec QUELLE clé d'idempotence — et
 * la garantie qu'aucun de ces calculs ne peut faire échouer le webhook.
 */

const USER = '11111111-2222-4333-8444-555555555555'
const SUB = 'sub_123'

const order = (over: Partial<Parameters<typeof orderConfirmationIntent>[0]> = {}) => orderConfirmationIntent({
  userId: USER, subscriptionId: SUB, tier: 'forgeron', period: 'mensuel',
  amountPaidCents: 300, listPriceCents: 300, currency: 'eur',
  firstChargeAt: '2026-09-11T10:00:00.000Z', nextRenewalAt: '2026-10-11T10:00:00.000Z',
  consentId: 'c0ffee00-0000-4000-8000-000000000000', ...over,
})

describe('periodFromInterval', () => {
  it('traduit month/year, et rien d’autre', () => {
    expect(periodFromInterval('month')).toBe('mensuel')
    expect(periodFromInterval('year')).toBe('annuel')
    expect(periodFromInterval('week')).toBeNull()
    expect(periodFromInterval(undefined)).toBeNull()
  })
})

describe('confirmation de commande (L221-13)', () => {
  it('🔴 un événement rejoué produit la MÊME clé — la base ne crée pas de seconde ligne', () => {
    expect(order()!.dedupKey).toBe(order()!.dedupKey)
    expect(order()!.dedupKey).toBe(`order:${SUB}`)
  })

  it('porte palier, prix, périodicité, premier prélèvement, échéance et preuve de consentement', () => {
    expect(order()!.payload).toEqual({
      tier: 'forgeron', period: 'mensuel', amount_paid_cents: 300, list_price_cents: 300,
      currency: 'eur', first_charge_at: '2026-09-11T10:00:00.000Z',
      next_renewal_at: '2026-10-11T10:00:00.000Z', consent_id: 'c0ffee00-0000-4000-8000-000000000000',
    })
    expect(order()!.notBefore).toBe('2026-09-11T10:00:00.000Z')
  })

  it('montant débité absent ⇒ prix catalogue', () => {
    expect((order({ amountPaidCents: null })!.payload as { amount_paid_cents: number }).amount_paid_cents).toBe(300)
  })

  it.each([
    ['palier inconnu', { tier: null }],
    ['périodicité inconnue', { period: null }],
    ['prix inconnu', { listPriceCents: null }],
    ['devise inconnue', { currency: null }],
  ])('donnée manquante (%s) ⇒ null, jamais une exception', (_l, over) => {
    expect(order(over as never)).toBeNull()
  })
})

describe('confirmation de résiliation (L215-1-1)', () => {
  const base = {
    userId: USER, subscriptionId: SUB, eventId: 'evt_1', tier: 'maître', period: 'annuel' as const,
    accessUntil: '2027-09-11T10:00:00.000Z', requestedAt: '2026-10-01T08:00:00.000Z',
  }

  it('🔴 seulement quand la résiliation PASSE à programmée', () => {
    expect(cancellationIntent({ ...base, scheduledNow: true, scheduledBefore: false })).not.toBeNull()
    expect(cancellationIntent({ ...base, scheduledNow: true, scheduledBefore: true })).toBeNull()
    expect(cancellationIntent({ ...base, scheduledNow: false, scheduledBefore: true })).toBeNull()
    // Événement qui ne touche pas la résiliation (renouvellement, changement de carte…).
    expect(cancellationIntent({ ...base, scheduledNow: true, scheduledBefore: undefined })).toBeNull()
  })

  it('🔴 clé par événement : un rejeu du même événement ne renvoie rien', () => {
    const a = cancellationIntent({ ...base, scheduledNow: true, scheduledBefore: false })!
    const b = cancellationIntent({ ...base, scheduledNow: true, scheduledBefore: false })!
    expect(a.dedupKey).toBe(b.dedupKey)
    expect(a.dedupKey).toBe(`cancel:${SUB}:evt_1`)
    // Nouvelle demande après réactivation = autre événement = nouvelle confirmation.
    expect(cancellationIntent({ ...base, eventId: 'evt_2', scheduledNow: true, scheduledBefore: false })!.dedupKey)
      .not.toBe(a.dedupKey)
  })

  it('porte la date de fin d’accès', () => {
    const i = cancellationIntent({ ...base, scheduledNow: true, scheduledBefore: false })!
    expect(i.payload).toMatchObject({ access_until: '2027-09-11T10:00:00.000Z', tier: 'maître' })
  })

  it('lit les deux formes de résiliation programmée (flag ou date)', () => {
    expect(isCancellationScheduled({ cancel_at_period_end: true })).toBe(true)
    expect(isCancellationScheduled({ cancel_at_period_end: false, cancel_at: 1_900_000_000 })).toBe(true)
    expect(isCancellationScheduled({ cancel_at_period_end: false, cancel_at: null })).toBe(false)
  })

  it('wasCancellationScheduled ne se prononce que si l’un des champs a bougé', () => {
    expect(wasCancellationScheduled({ cancel_at_period_end: false })).toBe(false)
    expect(wasCancellationScheduled({ cancel_at_period_end: true })).toBe(true)
    expect(wasCancellationScheduled({ cancel_at: null })).toBe(false)
    expect(wasCancellationScheduled({ items: {} })).toBeUndefined()
    expect(wasCancellationScheduled(undefined)).toBeUndefined()
  })
})

describe('rappel avant reconduction annuelle (L215-1)', () => {
  const base = {
    userId: USER, subscriptionId: SUB, tier: 'forgeron', period: 'annuel' as const, status: 'active',
    scheduledCancellation: false, renewalAt: '2027-09-11T10:00:00.000Z',
    amountCents: 3000, currency: 'eur', amountIsEstimate: false,
  }

  it('programmé au point fixe « un mois calendaire + 15 jours » avant l’échéance', () => {
    const i = renewalReminderIntent(base)!
    expect(i.notBefore).toBe(reminderWindow(new Date(base.renewalAt)).sendAt.toISOString())
    expect(i.notBefore).toBe('2027-07-27T10:00:00.000Z') // 11/08 − 15 j
  })

  it('🔴 un rappel par CYCLE : même échéance ⇒ même clé, échéance suivante ⇒ nouvelle clé', () => {
    expect(renewalReminderIntent(base)!.dedupKey).toBe(`renewal:${SUB}:${base.renewalAt}`)
    expect(renewalReminderIntent(base)!.dedupKey).toBe(renewalReminderIntent(base)!.dedupKey)
    expect(renewalReminderIntent({ ...base, renewalAt: '2028-09-11T10:00:00.000Z' })!.dedupKey)
      .not.toBe(renewalReminderIntent(base)!.dedupKey)
  })

  it.each([
    ['mensuel', { period: 'mensuel' as const }],
    ['résiliation programmée', { scheduledCancellation: true }],
    ['abonnement terminé', { status: 'canceled' }],
    ['impayé terminal', { status: 'unpaid' }],
    ['échéance inconnue', { renewalAt: null }],
    ['montant inconnu', { amountCents: null }],
  ])('pas de rappel : %s', (_l, over) => {
    expect(renewalReminderIntent({ ...base, ...over } as never)).toBeNull()
  })
})

describe('calendrier légal du rappel — « au plus tôt 3 mois, au plus tard 1 mois »', () => {
  it('🔴 pour CHAQUE jour de trois années (bissextile comprise), le point fixe est dans la fenêtre légale', () => {
    const start = Date.UTC(2027, 0, 1, 12)
    for (let d = 0; d < 3 * 366; d++) {
      const renewal = new Date(start + d * 86_400_000)
      const w = reminderWindow(renewal)
      expect(w.sendAt.getTime(), renewal.toISOString()).toBeLessThanOrEqual(w.legalDeadline.getTime())
      expect(w.sendAt.getTime(), renewal.toISOString()).toBeGreaterThanOrEqual(w.legalEarliest.getTime())
      // La marge avant la limite légale est exactement celle annoncée.
      expect(w.legalDeadline.getTime() - w.sendAt.getTime()).toBe(REMINDER_MARGIN_DAYS * 86_400_000)
    }
  })

  it('🔴 pourquoi pas « J-30 » : pour une échéance au 31 mars, J-30 serait HORS DÉLAI', () => {
    const renewal = new Date('2027-03-31T10:00:00.000Z')
    const thirtyDaysBefore = new Date(renewal.getTime() - 30 * 86_400_000) // 1er mars
    const deadline = reminderWindow(renewal).legalDeadline                  // 28 février
    expect(deadline.toISOString()).toBe('2027-02-28T10:00:00.000Z')
    expect(thirtyDaysBefore.getTime()).toBeGreaterThan(deadline.getTime())
  })

  it('subtractCalendarMonths ramène au dernier jour du mois quand le jour n’existe pas', () => {
    expect(subtractCalendarMonths(new Date('2027-03-31T00:00:00Z'), 1).toISOString()).toBe('2027-02-28T00:00:00.000Z')
    expect(subtractCalendarMonths(new Date('2028-03-31T00:00:00Z'), 1).toISOString()).toBe('2028-02-29T00:00:00.000Z')
    expect(subtractCalendarMonths(new Date('2027-01-15T08:30:00Z'), 3).toISOString()).toBe('2026-10-15T08:30:00.000Z')
  })
})

describe('🔴 découplage : un e-mail ne fait jamais échouer le webhook', () => {
  const intents = [order(), null, renewalReminderIntent({
    userId: USER, subscriptionId: SUB, tier: 'forgeron', period: 'annuel', status: 'active',
    scheduledCancellation: false, renewalAt: '2027-09-11T10:00:00.000Z', amountCents: 3000,
    currency: 'eur', amountIsEstimate: false,
  })]

  it('dépôt en échec (base indisponible) ⇒ rapporté, JAMAIS levé', async () => {
    const report = await enqueueSafely(intents, async () => { throw new Error('connection refused') })
    expect(report.enqueued).toEqual([])
    expect(report.failed.map(f => f.error)).toEqual(['connection refused', 'connection refused'])
  })

  it('un échec isolé n’empêche pas le dépôt suivant', async () => {
    const seen: string[] = []
    const report = await enqueueSafely(intents, async (i: EmailIntent) => {
      seen.push(i.kind)
      if (i.kind === 'order_confirmation') throw new Error('boom')
      return 'inserted'
    })
    expect(seen).toEqual(['order_confirmation', 'renewal_reminder'])
    expect(report.enqueued).toEqual([{ dedupKey: `renewal:${SUB}:2027-09-11T10:00:00.000Z`, result: 'inserted' }])
  })

  it('même une exception SYNCHRONE du dépôt est avalée', async () => {
    const enqueue = vi.fn(() => { throw new Error('sync') }) as unknown as (i: EmailIntent) => Promise<string>
    await expect(enqueueSafely(intents, enqueue)).resolves.toMatchObject({ failed: [{}, {}] })
  })

  it('le webhook n’importe ni n’appelle Resend, et ne dépose qu’APRÈS l’enregistrement', () => {
    // Pas de harnais de route dans ce dépôt : on verrouille la structure.
    const src = readFileSync(path.resolve(__dirname, '../../app/api/stripe/webhook/route.ts'), 'utf8')
    expect(src).not.toMatch(/resend/i)
    expect(src).not.toMatch(/sendEmail/)
    // Dans chaque branche, l'appel de dépôt suit l'application de l'abonnement.
    const applies = [...src.matchAll(/const result = await applySubscription\(/g)].map(m => m.index!)
    const queues = [...src.matchAll(/await queueSubscriptionEmails\(admin, stripe, \{/g)].map(m => m.index!)
    expect(applies.length).toBe(2)
    expect(queues.length).toBe(2)
    queues.forEach((q, i) => expect(q).toBeGreaterThan(applies[i]))
    // Et le helper est entièrement protégé par un try/catch.
    const helper = src.slice(src.indexOf('async function queueSubscriptionEmails('), src.indexOf('export async function POST('))
    expect(helper).toMatch(/\{\s*const \{ event, userId, subscription, session, applied \} = args\s*try \{/)
    expect(helper).toMatch(/\} catch \(e\) \{\s*console\.error\('\[stripe\/webhook\] préparation des e-mails en échec/)
  })
})
