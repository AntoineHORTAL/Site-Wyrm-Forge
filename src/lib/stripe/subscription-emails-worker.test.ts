import { describe, it, expect, vi } from 'vitest'
import {
  processDueEmails,
  reminderStillValid,
  renderEmail,
  reminderWindow,
  resolveEmailLocale,
  tierLabel,
  DEFAULT_EMAIL_LOCALE,
  EMAIL_LOCALES,
  EMAIL_TEXTS,
  type ClaimedEmail,
  type EmailKind,
  type EmailLinks,
  type EmailLocale,
  type EmailPayload,
  type FinishOutcome,
  type RenewalReminderPayload,
  type SubscriptionState,
  type WorkerDeps,
} from '../../../supabase/functions/_shared/subscription-emails'
import { sendEmail } from '../../../supabase/functions/_shared/resend'
import {
  cancellationIntent, orderConfirmationIntent, renewalReminderIntent, type EmailIntent,
} from './subscription-emails'
import { LANG_PARAM } from '@/lib/lang-param'

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

// Annoté `EmailLinks` (et non inféré) : sans cela `portalLogin` vaudrait le type
// `null`, et un test qui le remplace par l'URL du portail Stripe ne compilerait pas.
const LINKS: EmailLinks = { profile: 'https://wyrm-forge.com/profil', cgv: 'https://wyrm-forge.com/cgv', portalLogin: null }
const USER = 'u-1'
const SUB = 'sub_1'

function harness(opts: {
  queue: FakeQueue
  now: () => number
  send?: WorkerDeps['send']
  state?: SubscriptionState | null
  recipient?: string | null
  /** Langue enregistrée avec la preuve de CETTE commande (`checkout_consent_log.locale`). */
  consentLocale?: string | null
  /** Dernière langue connue du compte — `undefined` ⇒ aucune preuve, donc `null`. */
  knownLocale?: string | null
  /** Remplace entièrement la lecture de la dernière langue connue (pour la faire échouer). */
  localeOf?: WorkerDeps['localeOf']
}) {
  const sent: { to: string; subject: string; html: string; idempotencyKey: string; text: string }[] = []
  const logs: { level: string; message: string }[] = []
  const deps: WorkerDeps = {
    claim: async (limit) => opts.queue.claim(opts.now(), limit),
    recipientOf: async () => (opts.recipient === undefined ? 'joueur@example.com' : opts.recipient),
    subscriptionState: async () => (opts.state === undefined ? null : opts.state),
    consentOf: async () => ({
      text: 'Je demande à accéder à mon abonnement immédiatement…',
      terms_version: '2026-09-11',
      locale: opts.consentLocale ?? null,
    }),
    localeOf: opts.localeOf ?? (async () => opts.knownLocale ?? null),
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

/* ════════════════════════════════════════════════════════════════════════════
   LANGUE DES E-MAILS — source, repli, et gabarit réellement choisi
   ════════════════════════════════════════════════════════════════════════════
   La langue vient de `checkout_consent_log.locale` : celle de la preuve de la
   commande pour `order_confirmation`, la dernière connue du compte pour les
   deux autres. Trois propriétés se testent ici :

     • la NORMALISATION (`fr-FR`, `EN`, valeur inconnue, absente) ;
     • le CHOIX du gabarit de bout en bout, à travers `processDueEmails` — pas
       seulement `renderEmail`, parce que le bug probable est dans le câblage
       (une locale lue mais pas transmise) ;
     • le REPLI en français, qui doit être SÛR (l'e-mail part quand même) et
       JOURNALISÉ (un rappel L215-1 dans la mauvaise langue ne doit pas passer
       inaperçu). */

describe('langue des e-mails — normalisation', () => {
  it('reconnaît les deux langues du catalogue, étiquette régionale comprise', () => {
    for (const v of ['fr', 'FR', ' fr ', 'fr-FR', 'fr-CA']) expect(resolveEmailLocale(v), v).toBe('fr')
    for (const v of ['en', 'EN', 'en-GB', 'en-US']) expect(resolveEmailLocale(v), v).toBe('en')
  })

  it('retombe sur le FRANÇAIS pour toute valeur absente, vide ou hors catalogue', () => {
    // Le comportement d'avant la traduction : un e-mail part toujours, et il
    // part en français quand on ne sait pas faire mieux.
    for (const v of [null, undefined, '', '   ', 'de', 'es-ES', 42, {}, []]) {
      expect(resolveEmailLocale(v), String(v)).toBe(DEFAULT_EMAIL_LOCALE)
    }
    expect(DEFAULT_EMAIL_LOCALE).toBe('fr')
  })

  it('le catalogue de langues est celui de la case de consentement', () => {
    // `CONSENT_LOCALES` de src/lib/stripe/checkout-consent.ts : c'est la même
    // colonne qui alimente les deux, elles ne peuvent pas diverger.
    expect([...EMAIL_LOCALES]).toEqual(['fr', 'en'])
  })
})

describe('langue des e-mails — dictionnaire FR / EN', () => {
  /** Chemins de toutes les feuilles (`order.subject`, `tiers.forgeron`, …). */
  function leafPaths(value: unknown, prefix = '', out: string[] = []): string[] {
    if (typeof value !== 'object' || value === null) { out.push(prefix); return out }
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      leafPaths(v, prefix ? `${prefix}.${k}` : k, out)
    }
    return out
  }

  it('les deux langues portent exactement les mêmes clés', () => {
    // Le typage le garantit à la compilation (`typeof` du FR) ; ce test attrape
    // le cas où quelqu'un contourne le type pour livrer plus vite.
    expect(leafPaths(EMAIL_TEXTS.en).sort()).toEqual(leafPaths(EMAIL_TEXTS.fr).sort())
  })

  it('aucune chaîne n’est restée en français côté anglais', () => {
    const fr = EMAIL_TEXTS.fr, en = EMAIL_TEXTS.en
    const pairs: [string, string, string][] = [
      ['order.intro', fr.order.intro, en.order.intro],
      ['order.heading', fr.order.heading, en.order.heading],
      ['order.noCommitment', fr.order.noCommitment, en.order.noCommitment],
      ['order.withdrawalIntro', fr.order.withdrawalIntro, en.order.withdrawalIntro],
      ['cancellation.title', fr.cancellation.title, en.cancellation.title],
      ['cancellation.noRefund', fr.cancellation.noRefund, en.cancellation.noRefund],
      ['cancellation.backToFree', fr.cancellation.backToFree, en.cancellation.backToFree],
      ['reminder.manage', fr.reminder.manage, en.reminder.manage],
      ['reminder.doNothing', fr.reminder.doNothing, en.reminder.doNothing],
      ['footerNoticeText', fr.footerNoticeText, en.footerNoticeText],
    ]
    for (const [path, a, b] of pairs) expect(b, path).not.toBe(a)
  })

  it('les paliers sont nommés comme sur le site, dans chaque langue', () => {
    // Mêmes libellés que la grille tarifaire, la modale de paiement et les CGV.
    expect(tierLabel('forgeron', 'fr')).toBe('Forgeron')
    expect(tierLabel('maître', 'fr')).toBe('Maître')
    expect(tierLabel('forgeron', 'en')).toBe('Blacksmith')
    expect(tierLabel('maître', 'en')).toBe('Master')
    // `maitre` sans accent (clé ASCII des métadonnées Stripe) = même palier.
    expect(tierLabel('maitre', 'en')).toBe('Master')
    // Palier inconnu : on affiche ce qu'on a plutôt que rien.
    expect(tierLabel('legion', 'en')).toBe('Legion')
  })

  it('sans langue fournie, `renderEmail` rend le français — le comportement d’avant', () => {
    const m = renderEmail('order_confirmation', orderIntent().payload, { links: LINKS })
    expect(m.html).toContain('<html lang="fr"')
    expect(m.subject).toContain('Forgeron')
  })
})

describe('gabarits EN — le contenu exigé par la loi survit à la traduction', () => {
  const ctx = { links: LINKS, locale: 'en' as EmailLocale, consentText: 'I request immediate access…', termsVersion: '2026-09-11' }

  it('commande : palier, prix, périodicité, 1er prélèvement, portail, CGV, rétractation, texte accepté', () => {
    const m = renderEmail('order_confirmation',
      { ...orderIntent().payload, amount_paid_cents: 150 } as EmailPayload, ctx)
    expect(m.html).toContain('<html lang="en"')
    expect(m.subject).toContain('Blacksmith')
    // Montants et dates dans la convention anglaise (en-GB, comme `formatPrice`
    // et `lib/intl.ts` sur le site), mais dates TOUJOURS en Europe/Paris : ce
    // sont les dates contractuelles annoncées par les CGV et le portail Stripe.
    for (const s of ['Blacksmith', 'monthly', '€3.00', 'per month', '11 September 2026', '€1.50',
      LINKS.profile, LINKS.cgv, '14 days', 'I request immediate access…', '11 October 2026']) {
      expect(m.text, s).toContain(s)
      expect(m.html, s).toContain(s)
    }
  })

  it('résiliation : confirmation, date de fin d’accès, pas de remboursement partiel', () => {
    const m = renderEmail('cancellation_confirmation', {
      tier: 'maître', period: 'annuel', access_until: '2027-09-11T10:00:00.000Z', requested_at: '2026-10-01T08:00:00.000Z',
    }, ctx)
    for (const s of ['cancellation', '11 September 2027', 'not partially refunded', '1 October 2026']) {
      expect(m.text.toLowerCase(), s).toContain(s.toLowerCase())
    }
    expect(m.subject).toContain('11 September 2027')
    expect(m.subject).toContain('Master')
  })

  it('rappel : date de reconduction mise en évidence, montant, lien pour résilier', () => {
    // L215-1 exige un encadré apparent : le <blockquote> en tête doit porter la
    // date dans les deux langues, sinon la traduction a fait perdre la mention.
    const m = renderEmail('renewal_reminder', reminderIntent().payload, ctx)
    expect(m.html).toMatch(/<blockquote[^>]*>Renewal date: 11 September 2027/)
    for (const s of ['€60.00', '11 September 2027', LINKS.profile, 'L215-1', 'not to renew']) {
      expect(m.text, s).toContain(s)
    }
  })

  it('échappe le HTML des valeurs insérées, en anglais aussi', () => {
    const m = renderEmail('order_confirmation', orderIntent().payload,
      { links: LINKS, locale: 'en', consentText: '<script>x</script>' })
    expect(m.html).not.toContain('<script>')
    expect(m.html).toContain('&lt;script&gt;')
  })

  it('la mention « e-mail de service » est traduite, l’adresse du siège non', () => {
    const en = renderEmail('order_confirmation', orderIntent().payload, ctx)
    expect(en.html).toContain('5 Rue du 23 Janvier, 21000 Dijon')
    expect(en.text).toContain('not marketing')
    expect(en.text).not.toContain('publicitaire')
  })
})

describe('🔴 le gabarit choisi suit la langue enregistrée', () => {
  const AT = () => Date.parse('2026-09-11T10:05:00Z')

  const cancelIntent = () => cancellationIntent({
    userId: USER, subscriptionId: SUB, eventId: 'evt_1', tier: 'maître', period: 'annuel',
    scheduledNow: true, scheduledBefore: false,
    accessUntil: '2027-09-11T10:00:00.000Z', requestedAt: '2026-09-11T08:00:00.000Z',
  })!

  it('commande : la locale de LA preuve de cette commande fait foi', async () => {
    const q = new FakeQueue(); q.enqueue(orderIntent())
    const h = harness({ queue: q, now: AT, consentLocale: 'en', knownLocale: 'fr' })
    await processDueEmails(h.deps)
    // La preuve l'emporte sur la dernière langue connue : c'est CE texte-là que
    // la personne a lu au moment de payer.
    expect(h.sent[0].subject).toContain('Blacksmith')
    expect(h.sent[0].html).toContain('<html lang="en"')
  })

  it('commande sans preuve rattachée : on retombe sur la dernière langue connue', async () => {
    // `consent_id` peut être null (souscription d'avant le recueil, ou preuve
    // introuvable) : la commande garde quand même la bonne langue.
    const q = new FakeQueue()
    q.enqueue(orderConfirmationIntent({
      userId: USER, subscriptionId: SUB, tier: 'forgeron', period: 'mensuel', amountPaidCents: 300,
      listPriceCents: 300, currency: 'eur', firstChargeAt: '2026-09-11T10:00:00.000Z',
      nextRenewalAt: null, consentId: null,
    })!)
    const h = harness({ queue: q, now: AT, knownLocale: 'en' })
    await processDueEmails(h.deps)
    expect(h.sent[0].subject).toContain('Blacksmith')
  })

  it('résiliation : dernière langue connue du compte', async () => {
    const q = new FakeQueue(); q.enqueue(cancelIntent())
    const h = harness({ queue: q, now: AT, knownLocale: 'en' })
    await processDueEmails(h.deps)
    expect(h.sent[0].subject).toContain('Cancellation recorded')
    expect(h.sent[0].html).toContain('<html lang="en"')
  })

  it('rappel annuel : dernière langue connue du compte', async () => {
    const q = new FakeQueue(); q.enqueue(reminderIntent())
    const at = Date.parse('2027-07-27T10:00:00Z')
    const h = harness({ queue: q, now: () => at, knownLocale: 'en', state: liveState })
    await processDueEmails(h.deps)
    expect(h.sent[0].subject).toContain('Renewal of your Master subscription')
    expect(h.sent[0].html).toContain('<html lang="en"')
  })

  it('la même file rend le français quand la langue enregistrée est « fr »', async () => {
    const q = new FakeQueue(); q.enqueue(cancelIntent())
    const h = harness({ queue: q, now: AT, knownLocale: 'fr' })
    await processDueEmails(h.deps)
    expect(h.sent[0].subject).toContain('Résiliation enregistrée')
    expect(h.sent[0].html).toContain('<html lang="fr"')
  })
})

describe('🔴 langue inconnue : repli français, jamais un échec silencieux', () => {
  const AT = () => Date.parse('2026-09-11T10:05:00Z')

  it('aucune preuve pour ce compte ⇒ français, et le repli est journalisé', async () => {
    const q = new FakeQueue(); q.enqueue(orderConfirmationIntent({
      userId: USER, subscriptionId: SUB, tier: 'forgeron', period: 'mensuel', amountPaidCents: 300,
      listPriceCents: 300, currency: 'eur', firstChargeAt: '2026-09-11T10:00:00.000Z',
      nextRenewalAt: null, consentId: null,
    })!)
    const h = harness({ queue: q, now: AT, knownLocale: null })
    const r = await processDueEmails(h.deps)

    expect(r.sent).toBe(1)                                   // l'e-mail PART
    expect(h.sent[0].html).toContain('<html lang="fr"')      // dans le comportement d'avant
    expect(h.logs.some(l => l.message.includes('aucune langue connue'))).toBe(true)
  })

  it('langue enregistrée hors catalogue ⇒ français, journalisé en warn', async () => {
    const q = new FakeQueue(); q.enqueue(cancellationIntent({
      userId: USER, subscriptionId: SUB, eventId: 'evt_2', tier: 'maître', period: 'annuel',
      scheduledNow: true, scheduledBefore: false,
      accessUntil: '2027-09-11T10:00:00.000Z', requestedAt: '2026-09-11T08:00:00.000Z',
    })!)
    const h = harness({ queue: q, now: AT, knownLocale: 'de-DE' })
    const r = await processDueEmails(h.deps)

    expect(r.sent).toBe(1)
    expect(h.sent[0].subject).toContain('Résiliation enregistrée')
    const warn = h.logs.find(l => l.message.includes('hors catalogue'))
    expect(warn?.level).toBe('warn')
  })

  it('lecture de la langue en PANNE ⇒ l’e-mail part quand même, en français', async () => {
    // Un rappel L215-1 ou une confirmation de commande ne doit pas être sacrifié
    // parce qu'une requête de confort a échoué : la sanction du défaut
    // d'information est bien plus lourde qu'un e-mail dans la mauvaise langue.
    const q = new FakeQueue(); q.enqueue(reminderIntent())
    const at = Date.parse('2027-07-27T10:00:00Z')
    const h = harness({
      queue: q, now: () => at, state: liveState,
      localeOf: async () => { throw new Error('timeout') },
    })
    const r = await processDueEmails(h.deps)

    expect(r).toMatchObject({ sent: 1, failed: 0, skipped: 0 })
    expect(q.rows[0].status).toBe('sent')
    expect(h.sent[0].html).toContain('<html lang="fr"')
    const warn = h.logs.find(l => l.message.includes('langue indéterminable'))
    expect(warn?.level).toBe('warn')
  })

  it('un compte supprimé n’interroge même pas la langue', async () => {
    // La ligne est passée en `skipped: account_deleted` avant tout rendu : pas
    // de requête inutile, et surtout pas de `localeOf(null)`.
    const q = new FakeQueue(); q.enqueue(orderIntent())
    q.rows[0].user_id = null
    let asked = 0
    const h = harness({ queue: q, now: AT, localeOf: async () => { asked++; return 'en' } })
    const r = await processDueEmails(h.deps)

    expect(r.skipped).toBe(1)
    expect(asked).toBe(0)
  })
})

/* ════════════════════════════════════════════════════════════════════════════
   🔴 LIENS SORTANTS — la langue voyage dans l'URL
   ════════════════════════════════════════════════════════════════════════════
   Un e-mail anglais dont le lien pointe sur `/cgv` tout court fait atterrir son
   destinataire sur la version FRANÇAISE : la langue du site vit dans le
   `localStorage`, qui ne franchit ni l'e-mail ni l'appareil. Le cas est la
   règle (lien ouvert depuis l'application mail d'un téléphone), pas l'exception.

   ⚠️ Le nom du paramètre est écrit des DEUX côtés — `LANG_PARAM`
   (`src/lib/lang-param.ts`, lu par `LanguageProvider`) et une constante locale
   du module Deno, qui ne peut pas importer `src/`. Ces tests comparent le lien
   RENDU à `LANG_PARAM` : c'est ce qui interdit aux deux côtés de diverger. */

describe('🔴 liens des e-mails — la langue voyage dans l’URL', () => {
  const ctx = (locale: EmailLocale, links = LINKS) => ({ links, locale, consentText: null, termsVersion: null })

  const cancelPayload = {
    tier: 'maître' as const, period: 'annuel' as const,
    access_until: '2027-09-11T10:00:00.000Z', requested_at: '2026-09-11T08:00:00.000Z',
  }

  const cases: [string, EmailKind, EmailPayload][] = [
    ['commande', 'order_confirmation', orderIntent().payload],
    ['résiliation', 'cancellation_confirmation', cancelPayload],
    ['rappel annuel', 'renewal_reminder', reminderIntent().payload],
  ]

  it.each(cases)('%s (EN) : /cgv et /profil portent ?lang=en', (_label, kind, payload) => {
    const m = renderEmail(kind, payload, ctx('en'))
    expect(m.text).toContain(`${LINKS.cgv}?${LANG_PARAM}=en`)
    expect(m.text).toContain(`${LINKS.profile}?${LANG_PARAM}=en`)
    // Le HTML porte le même lien que le texte brut : c'est le <a href>, pas
    // seulement le libellé visible.
    expect(m.html).toContain(`href="${LINKS.cgv}?${LANG_PARAM}=en"`)
    // Plus AUCUN lien nu vers le site : c'est exactement le bug corrigé.
    expect(m.text).not.toMatch(new RegExp(`${LINKS.cgv}(?!\\?)`))
  })

  it.each(cases)('%s (FR) : les mêmes liens portent ?lang=fr', (_label, kind, payload) => {
    // Estampillé dans les DEUX langues, pas seulement en anglais : un abonné
    // français dont le navigateur a gardé « en » d'une visite précédente doit
    // lui aussi atterrir dans la langue de l'e-mail qu'il vient de lire.
    const m = renderEmail(kind, payload, ctx('fr'))
    expect(m.text).toContain(`${LINKS.cgv}?${LANG_PARAM}=fr`)
    expect(m.text).toContain(`${LINKS.profile}?${LANG_PARAM}=fr`)
  })

  it('le portail Stripe n’est PAS estampillé — ce n’est pas une URL à nous', () => {
    // Stripe gère sa propre langue ; `?lang=` y serait un paramètre parasite.
    const portalLogin = 'https://billing.stripe.com/p/login/test_x'
    const m = renderEmail('renewal_reminder', reminderIntent().payload, ctx('en', { ...LINKS, portalLogin }))
    expect(m.text).toContain(portalLogin)
    expect(m.text).not.toContain(`${portalLogin}?${LANG_PARAM}`)
    // Le lien CGV, lui, reste estampillé : les deux ne se confondent pas.
    expect(m.text).toContain(`${LINKS.cgv}?${LANG_PARAM}=en`)
  })

  it('de bout en bout : l’e-mail réellement envoyé porte la langue de son gabarit', async () => {
    const q = new FakeQueue(); q.enqueue(orderIntent())
    const h = harness({ queue: q, now: () => Date.parse('2026-09-11T10:05:00Z'), consentLocale: 'en' })
    await processDueEmails(h.deps)
    expect(h.sent[0].text).toContain(`${LINKS.cgv}?${LANG_PARAM}=en`)
  })
})
