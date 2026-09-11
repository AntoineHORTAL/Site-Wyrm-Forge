import { describe, it, expect, vi } from 'vitest'
import {
  processDueEmails,
  reminderStillValid,
  renderEmail,
  reminderWindow,
  type ClaimedEmail,
  type EmailKind,
  type EmailPayload,
  type FinishOutcome,
  type RenewalReminderPayload,
  type SubscriptionState,
  type WorkerDeps,
} from '../../../supabase/functions/_shared/subscription-emails'
import { sendEmail } from '../../../supabase/functions/_shared/resend'
import { orderConfirmationIntent, renewalReminderIntent, type EmailIntent } from './subscription-emails'

/**
 * Côté Edge Function : traitement de la file en claim-then-send, gabarits, et
 * helper Resend. La file est simulée en mémoire avec la sémantique de la base
 * (dédoublonnage par clé, réclamation `pending`/`failed` dus → `sending`,
 * clôture seulement depuis `sending`) ; la vraie sémantique SQL est éprouvée par
 * `supabase/tests/20260911000004_subscription_emails_test.sql`.
 */

interface Row extends ClaimedEmail {
  status: 'pending' | 'sending' | 'sent' | 'failed' | 'skipped'
  not_before: number
  next_attempt_at: number | null
  last_error: string | null
}

class FakeQueue {
  rows: Row[] = []
  private seq = 1
  enqueue(i: EmailIntent): string {
    if (this.rows.some(r => r.dedup_key === i.dedupKey)) return 'unchanged'
    this.rows.push({
      id: this.seq++, user_id: i.userId, stripe_subscription_id: i.subscriptionId, kind: i.kind,
      dedup_key: i.dedupKey, payload: i.payload, attempts: 0, status: 'pending',
      not_before: Date.parse(i.notBefore), next_attempt_at: null, last_error: null,
    })
    return 'inserted'
  }
  claim(now: number, limit: number): ClaimedEmail[] {
    const due = this.rows.filter(r =>
      (r.status === 'pending' && r.not_before <= now) ||
      (r.status === 'failed' && r.attempts < 8 && (r.next_attempt_at ?? 0) <= now)).slice(0, limit)
    due.forEach(r => { r.status = 'sending'; r.attempts++ })
    return due.map(r => ({ ...r }))
  }
  finish(id: number, o: FinishOutcome, now: number) {
    const r = this.rows.find(x => x.id === id)!
    if (r.status !== 'sending') return
    r.status = o.status
    r.last_error = o.status === 'sent' ? null : o.error
    r.next_attempt_at = o.status === 'failed' ? now + 15 * 60_000 : null
  }
}

const LINKS = { profile: 'https://wyrm-forge.com/profil', cgv: 'https://wyrm-forge.com/cgv', portalLogin: null }
const USER = 'u-1'
const SUB = 'sub_1'

function harness(opts: {
  queue: FakeQueue
  now: () => number
  send?: WorkerDeps['send']
  state?: SubscriptionState | null
  recipient?: string | null
}) {
  const sent: { to: string; subject: string; idempotencyKey: string; text: string }[] = []
  const logs: { level: string; message: string }[] = []
  const deps: WorkerDeps = {
    claim: async (limit) => opts.queue.claim(opts.now(), limit),
    recipientOf: async () => (opts.recipient === undefined ? 'joueur@example.com' : opts.recipient),
    subscriptionState: async () => (opts.state === undefined ? null : opts.state),
    consentOf: async () => ({ text: 'Je demande à accéder à mon abonnement immédiatement…', terms_version: '2026-09-11' }),
    send: opts.send ?? (async (m) => { sent.push(m); return { ok: true, id: `re_${sent.length}`, status: 200 } }),
    finish: async (id, o) => opts.queue.finish(id, o, opts.now()),
    links: LINKS,
    now: () => new Date(opts.now()),
    log: (level, message) => { logs.push({ level, message }) },
  }
  return { deps, sent, logs }
}

const orderIntent = () => orderConfirmationIntent({
  userId: USER, subscriptionId: SUB, tier: 'forgeron', period: 'mensuel', amountPaidCents: 300,
  listPriceCents: 300, currency: 'eur', firstChargeAt: '2026-09-11T10:00:00.000Z',
  nextRenewalAt: '2026-10-11T10:00:00.000Z', consentId: 'c-1',
})!

const RENEWAL = '2027-09-11T10:00:00.000Z'
const reminderIntent = () => renewalReminderIntent({
  userId: USER, subscriptionId: SUB, tier: 'maître', period: 'annuel', status: 'active',
  scheduledCancellation: false, renewalAt: RENEWAL, amountCents: 6000, currency: 'eur', amountIsEstimate: false,
})!
const liveState: SubscriptionState = { status: 'active', cancel_at_period_end: false, current_period_end: RENEWAL }

describe('🔴 chaque e-mail ne part qu’une fois', () => {
  it('événement Stripe rejoué (dépôt en double) + deux passes du worker ⇒ UN seul envoi', async () => {
    const q = new FakeQueue()
    expect(q.enqueue(orderIntent())).toBe('inserted')
    expect(q.enqueue(orderIntent())).toBe('unchanged') // rejeu du webhook
    const h = harness({ queue: q, now: () => Date.parse('2026-09-11T10:05:00Z') })

    await processDueEmails(h.deps)
    await processDueEmails(h.deps) // passe suivante du cron
    expect(h.sent).toHaveLength(1)
    expect(q.rows[0].status).toBe('sent')
  })

  it('l’envoi porte l’Idempotency-Key = dedup_key (filet contre le doublon après plantage)', async () => {
    const q = new FakeQueue(); q.enqueue(orderIntent())
    const h = harness({ queue: q, now: () => Date.parse('2026-09-11T10:05:00Z') })
    await processDueEmails(h.deps)
    expect(h.sent[0].idempotencyKey).toBe(`order:${SUB}`)
  })

  it('deux passes CONCURRENTES ne réclament pas la même ligne', async () => {
    const q = new FakeQueue(); q.enqueue(orderIntent())
    const now = () => Date.parse('2026-09-11T10:05:00Z')
    const a = harness({ queue: q, now }); const b = harness({ queue: q, now })
    await Promise.all([processDueEmails(a.deps), processDueEmails(b.deps)])
    expect(a.sent.length + b.sent.length).toBe(1)
  })
})

describe('🔴 Resend indisponible', () => {
  it('l’échec d’un envoi est isolé : ligne `failed`, les suivantes partent', async () => {
    const q = new FakeQueue()
    q.enqueue(orderIntent())
    q.enqueue({ ...orderIntent(), dedupKey: 'order:sub_2', subscriptionId: 'sub_2' })
    let calls = 0
    const h = harness({
      queue: q, now: () => Date.parse('2026-09-11T10:05:00Z'),
      send: async () => (++calls === 1 ? { ok: false, status: 503, error: 'Resend down' } : { ok: true, id: 're_ok', status: 200 }),
    })
    const report = await processDueEmails(h.deps)
    expect(report).toEqual({ claimed: 2, sent: 1, failed: 1, skipped: 0 })
    expect(q.rows.map(r => r.status)).toEqual(['failed', 'sent'])
  })

  it('la ligne en échec est relancée à l’échéance de sa relance, et part une seule fois', async () => {
    const q = new FakeQueue(); q.enqueue(orderIntent())
    let t = Date.parse('2026-09-11T10:05:00Z')
    let down = true
    const h = harness({
      queue: q, now: () => t,
      send: async () => (down ? { ok: false, status: 0, error: 'network' } : { ok: true, id: 're_1', status: 200 }),
    })
    await processDueEmails(h.deps)
    expect(q.rows[0].status).toBe('failed')

    down = false
    await processDueEmails(h.deps)                 // relance pas encore due
    expect(q.rows[0].status).toBe('failed')
    t += 16 * 60_000                               // 15 min plus tard
    const r = await processDueEmails(h.deps)
    expect(r.sent).toBe(1)
    expect(q.rows[0].status).toBe('sent')
  })

  it('une exception pendant le traitement (base, gabarit…) ne stoppe pas la passe', async () => {
    const q = new FakeQueue(); q.enqueue(orderIntent()); q.enqueue({ ...orderIntent(), dedupKey: 'order:sub_2' })
    const h = harness({ queue: q, now: () => Date.parse('2026-09-11T10:05:00Z') })
    let first = true
    h.deps.recipientOf = async () => { if (first) { first = false; throw new Error('auth down') } return 'a@b.c' }
    const report = await processDueEmails(h.deps)
    expect(report).toMatchObject({ sent: 1, failed: 1 })
  })

  it('une clôture impossible est journalisée sans interrompre la passe', async () => {
    const q = new FakeQueue(); q.enqueue(orderIntent())
    const h = harness({ queue: q, now: () => Date.parse('2026-09-11T10:05:00Z') })
    h.deps.finish = async () => { throw new Error('db down') }
    await expect(processDueEmails(h.deps)).resolves.toMatchObject({ sent: 1 })
    expect(h.logs.some(l => l.level === 'error' && /finish/.test(l.message))).toBe(true)
  })
})

describe('🔴 job de rappel annuel', () => {
  const sendAt = reminderWindow(new Date(RENEWAL)).sendAt.getTime()

  it('rien avant le point fixe, envoi à partir du point fixe', async () => {
    const q = new FakeQueue(); q.enqueue(reminderIntent())
    let t = sendAt - 60_000
    const h = harness({ queue: q, now: () => t, state: liveState })
    expect((await processDueEmails(h.deps)).claimed).toBe(0)
    t = sendAt + 60_000
    expect((await processDueEmails(h.deps)).sent).toBe(1)
  })

  it('ne renvoie pas deux fois pour le même cycle (événements Stripe successifs, passes quotidiennes)', async () => {
    const q = new FakeQueue()
    q.enqueue(reminderIntent())
    const h = harness({ queue: q, now: () => sendAt + 60_000, state: liveState })
    await processDueEmails(h.deps)
    q.enqueue(reminderIntent())           // nouvel événement du même cycle
    await processDueEmails(h.deps)        // passe du lendemain
    await processDueEmails(h.deps)
    expect(h.sent).toHaveLength(1)
  })

  it('le cycle suivant a son propre rappel', async () => {
    const q = new FakeQueue()
    q.enqueue(reminderIntent())
    q.enqueue(renewalReminderIntent({
      userId: USER, subscriptionId: SUB, tier: 'maître', period: 'annuel', status: 'active',
      scheduledCancellation: false, renewalAt: '2028-09-11T10:00:00.000Z', amountCents: 6000, currency: 'eur', amountIsEstimate: false,
    })!)
    expect(q.rows).toHaveLength(2)
  })

  it.each([
    ['résiliation programmée entre-temps', { ...liveState, cancel_at_period_end: true }, 'cancellation_scheduled'],
    ['abonnement terminé', { ...liveState, status: 'canceled' }, 'status_canceled'],
    ['échéance déplacée (renouvelé, changé)', { ...liveState, current_period_end: '2027-10-01T00:00:00.000Z' }, 'period_changed'],
    ['abonnement introuvable', null, 'subscription_not_found'],
  ])('revérifié à l’envoi — %s ⇒ `skipped`, rien n’est envoyé', async (_l, state, reason) => {
    const q = new FakeQueue(); q.enqueue(reminderIntent())
    const h = harness({ queue: q, now: () => sendAt + 60_000, state })
    const r = await processDueEmails(h.deps)
    expect(r.skipped).toBe(1)
    expect(h.sent).toHaveLength(0)
    expect(q.rows[0]).toMatchObject({ status: 'skipped', last_error: reason })
  })

  it('un envoi après la limite légale part quand même, mais est journalisé HORS DÉLAI', async () => {
    const q = new FakeQueue(); q.enqueue(reminderIntent())
    const late = reminderWindow(new Date(RENEWAL)).legalDeadline.getTime() + 86_400_000
    const h = harness({ queue: q, now: () => late, state: liveState })
    await processDueEmails(h.deps)
    expect(h.sent).toHaveLength(1)
    expect(h.logs.some(l => l.level === 'error' && /HORS DÉLAI/.test(l.message))).toBe(true)
  })

  it('reminderStillValid accepte un abonnement vivant à l’échéance attendue', () => {
    expect(reminderStillValid(reminderIntent().payload as RenewalReminderPayload, liveState)).toBeNull()
  })
})

describe('destinataire', () => {
  it('compte supprimé (user_id NULL) ou sans adresse ⇒ `skipped`, rien n’est envoyé', async () => {
    const q = new FakeQueue(); q.enqueue(orderIntent()); q.rows[0].user_id = null
    q.enqueue({ ...orderIntent(), dedupKey: 'order:sub_2' })
    const h = harness({ queue: q, now: () => Date.parse('2026-09-11T10:05:00Z'), recipient: null })
    const r = await processDueEmails(h.deps)
    expect(r).toMatchObject({ skipped: 2, sent: 0 })
    expect(q.rows.map(x => x.last_error)).toEqual(['account_deleted', 'no_recipient'])
  })
})

describe('gabarits — le contenu exigé par la loi', () => {
  const ctx = { links: LINKS, consentText: 'Je demande à accéder…', termsVersion: '2026-09-11' }
  const render = (kind: EmailKind, payload: EmailPayload) => renderEmail(kind, payload, ctx)

  it('commande : palier, prix, périodicité, 1er prélèvement, portail, CGV, rétractation, texte accepté', () => {
    const m = render('order_confirmation', { ...orderIntent().payload, amount_paid_cents: 150 } as EmailPayload)
    expect(m.subject).toContain('Forgeron')
    for (const s of ['Forgeron', 'mensuelle', '3,00', 'par mois', '11 septembre 2026', '1,50',
      LINKS.profile, LINKS.cgv, '14 jours', 'Je demande à accéder…', '11 octobre 2026']) {
      expect(m.text, s).toContain(s)
      expect(m.html, s).toContain(s)
    }
  })

  it('résiliation : confirmation, date de fin d’accès, pas de remboursement partiel', () => {
    const m = render('cancellation_confirmation', {
      tier: 'maître', period: 'annuel', access_until: '2027-09-11T10:00:00.000Z', requested_at: '2026-10-01T08:00:00.000Z',
    })
    for (const s of ['résiliation', '11 septembre 2027', 'remboursée partiellement', '1 octobre 2026']) {
      expect(m.text.toLowerCase(), s).toContain(s.toLowerCase())
    }
    expect(m.subject).toContain('11 septembre 2027')
  })

  it('rappel : date de reconduction mise en évidence, montant, lien pour résilier', () => {
    const m = render('renewal_reminder', reminderIntent().payload)
    expect(m.html).toContain('<blockquote')
    expect(m.html).toMatch(/<blockquote[^>]*>Date de reconduction : 11 septembre 2027/)
    for (const s of ['60,00', '11 septembre 2027', LINKS.profile, 'L215-1', 'ne pas reconduire']) {
      expect(m.text, s).toContain(s)
    }
  })

  it('le lien « no-code » du portail Stripe remplace /profil quand il est configuré', () => {
    const m = renderEmail('renewal_reminder', reminderIntent().payload,
      { links: { ...LINKS, portalLogin: 'https://billing.stripe.com/p/login/test_x' } })
    expect(m.text).toContain('https://billing.stripe.com/p/login/test_x')
  })

  it('échappe le HTML des valeurs insérées', () => {
    const m = renderEmail('order_confirmation', orderIntent().payload, { links: LINKS, consentText: '<script>x</script>' })
    expect(m.html).not.toContain('<script>')
    expect(m.html).toContain('&lt;script&gt;')
  })
})

describe('helper Resend — ne lève jamais sur une panne', () => {
  const params = { from: 'Wyrm Forge <x@wyrm-forge.com>', to: 'a@b.c', subject: 's', html: '<p>h</p>', text: 't', idempotencyKey: 'order:sub_1' }

  it('envoie l’Idempotency-Key et l’expéditeur fourni (aucun défaut en dur)', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ id: 're_1' }), { status: 200 }))
    const r = await sendEmail(params, { apiKey: 'k', fetchImpl: fetchImpl as unknown as typeof fetch })
    expect(r).toEqual({ ok: true, status: 200, id: 're_1' })
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect((init.headers as Record<string, string>)['Idempotency-Key']).toBe('order:sub_1')
    expect(JSON.parse(String(init.body)).from).toBe('Wyrm Forge <x@wyrm-forge.com>')
  })

  it('erreur réseau ⇒ { ok: false }, pas d’exception', async () => {
    const r = await sendEmail(params, { apiKey: 'k', fetchImpl: (async () => { throw new Error('ECONNRESET') }) as unknown as typeof fetch })
    expect(r).toEqual({ ok: false, status: 0, error: 'ECONNRESET' })
  })

  it('erreur HTTP (503) ⇒ { ok: false, status }, pas d’exception', async () => {
    const r = await sendEmail(params, { apiKey: 'k', fetchImpl: (async () => new Response(JSON.stringify({ message: 'unavailable' }), { status: 503 })) as unknown as typeof fetch })
    expect(r).toEqual({ ok: false, status: 503, error: 'unavailable' })
  })

  it('clé absente ⇒ erreur de configuration, sans nommer le secret', async () => {
    await expect(sendEmail(params)).rejects.toThrow('Configuration serveur incomplète.')
  })
})
