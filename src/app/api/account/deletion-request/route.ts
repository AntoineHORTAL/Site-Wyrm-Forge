import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import type Stripe from 'stripe'
import { createClient } from '@/lib/supabase/server'
import { getStripe } from '@/lib/stripe/server'
import {
  stopBillingThenRecordDeletion,
  uniqueSubscriptions,
  type SubscriptionLite,
} from '@/lib/stripe/account-deletion'

/**
 * Demande de suppression de compte (RGPD art. 17) — AVEC arrêt de la
 * facturation Stripe.
 *
 * POST `{ email: string, reason?: string }` → 201 `{ request, billing }`.
 *
 * Remplace l'`insert` direct que `/profil` faisait depuis le navigateur : un
 * navigateur ne peut pas parler à Stripe avec la clé secrète, et la suppression
 * d'un compte doit ARRÊTER LES PRÉLÈVEMENTS (sinon l'abonnement survit au compte
 * et continue d'être renouvelé). Décision HORTAL du 2026-09-11 : résiliation en
 * FIN DE PÉRIODE dès la demande. Ordre et décisions : `account-deletion.ts`.
 *
 * L'insertion dans `deletion_requests` se fait sous le JWT de l'utilisateur :
 * les policies existantes (dont le refus des adresses @wyrm-forge.com) restent
 * la barrière, cette route n'a besoin d'aucun `service_role`.
 *
 * L'ANNULATION d'une demande reste un `update` côté client, sans appel Stripe :
 * l'abonnement reste résilié (voir l'en-tête d'`account-deletion.ts`).
 */
export const runtime = 'nodejs'

const WYRM_DOMAIN = '@wyrm-forge.com'
const MAX_REASON = 1000

function fail(code: string, status: number) {
  return NextResponse.json({ error: code }, { status })
}

function toLite(s: Stripe.Subscription): SubscriptionLite {
  return { id: s.id, status: s.status, cancel_at_period_end: s.cancel_at_period_end }
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return fail('not_authenticated', 401)

  let body: { email?: unknown; reason?: unknown }
  try {
    body = await request.json()
  } catch {
    return fail('invalid_json', 400)
  }

  const email = (user.email ?? '').trim().toLowerCase()
  // Re-vérification serveur de la saisie de confirmation : l'interface la
  // vérifie déjà, mais un appel direct ne doit pas pouvoir s'en dispenser.
  if (typeof body.email !== 'string' || body.email.trim().toLowerCase() !== email || !email) {
    return fail('email_mismatch', 400)
  }
  const reason = typeof body.reason === 'string' && body.reason.trim()
    ? body.reason.trim().slice(0, MAX_REASON)
    : null

  const { data: profile } = await supabase
    .from('profiles').select('username, role').eq('id', user.id).maybeSingle()

  // Comptes d'équipe : jamais supprimables depuis le site (même règle que
  // l'interface, et la policy INSERT refuse déjà les adresses @wyrm-forge.com).
  if (email.endsWith(WYRM_DOMAIN) || profile?.role === 'admin') return fail('protected_account', 403)

  const { data: existing } = await supabase
    .from('deletion_requests').select('id')
    .eq('user_id', user.id).eq('status', 'pending').limit(1).maybeSingle()
  if (existing) return fail('already_pending', 409)

  // Client Stripe connu — lecture sous le JWT (policy `ss_select_own`).
  const { data: sub } = await supabase
    .from('stripe_subscriptions').select('stripe_customer_id')
    .eq('user_id', user.id).maybeSingle()
  const customerId: string | null = sub?.stripe_customer_id ?? null

  const result = await stopBillingThenRecordDeletion({
    // DEUX sources, et pas seulement la table : un abonnement dont le webhook
    // n'a jamais été reçu n'a pas de ligne `stripe_subscriptions`, mais porte
    // `metadata.user_id` (posé par la route de checkout). La recherche Stripe
    // le retrouve. Si l'une des deux sources échoue, TOUT échoue : on
    // n'enregistre pas une demande sans être sûr d'avoir arrêté la facturation.
    findSubscriptions: async () => {
      const stripe = getStripe()
      const lists: SubscriptionLite[][] = []
      if (customerId) {
        const byCustomer = await stripe.subscriptions.list({ customer: customerId, status: 'all', limit: 100 })
        lists.push(byCustomer.data.map(toLite))
      }
      // `user.id` est un uuid issu de `getUser()` : aucune injection possible
      // dans la requête de recherche.
      const byMetadata = await stripe.subscriptions.search({
        query: `metadata['user_id']:'${user.id}'`, limit: 100,
      })
      lists.push(byMetadata.data.map(toLite))
      return uniqueSubscriptions(lists)
    },
    schedule: async (id) => {
      await getStripe().subscriptions.update(id, { cancel_at_period_end: true })
    },
    cancelNow: async (id) => {
      await getStripe().subscriptions.cancel(id, { invoice_now: false, prorate: false })
    },
    recordRequest: async () => {
      const { data, error } = await supabase.from('deletion_requests').insert({
        user_id: user.id,
        email: user.email,
        username: profile?.username ?? null,
        reason,
        status: 'pending',
      }).select().single()
      if (error) throw new Error(`insert deletion_requests: ${error.message}`)
      return data
    },
  })

  if (!result.ok) {
    console.error('[account/deletion-request]', result.stage, {
      user_id: user.id, scheduled: result.scheduled, canceled: result.canceled,
      error: result.error instanceof Error ? result.error.message : result.error,
    })
    // `stripe` : rien n'est enregistré, la personne peut réessayer.
    // `record` : la facturation EST arrêtée, mais la demande n'est pas
    // enregistrée — l'interface le dit, pour qu'elle ne croie pas l'inverse.
    return fail(result.stage === 'stripe' ? 'billing_stop_failed' : 'request_not_recorded', 503)
  }

  console.log('[account/deletion-request] demande enregistrée', {
    user_id: user.id, scheduled: result.scheduled, canceled: result.canceled,
  })

  return NextResponse.json({
    request: result.record,
    billing: { scheduled: result.scheduled.length, canceled: result.canceled.length },
  }, { status: 201 })
}

export async function GET() {
  return NextResponse.json({ error: 'method_not_allowed' }, { status: 405 })
}
