import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getStripe, priceEnv, SITE_URL } from '@/lib/stripe/server'
import {
  isPlanKey,
  isBillingPeriod,
  resolvePriceId,
  TIER_BY_PLAN,
  stripeMode,
} from '@/lib/stripe/plans'

/**
 * Ouverture d'une session Stripe Checkout en mode `subscription`.
 *
 * POST `{ plan: 'forgeron' | 'maitre', period: 'mensuel' | 'annuel' }`
 *   → 200 `{ url }` — le navigateur y redirige.
 *
 * `runtime = 'nodejs'` comme `api/external/items` : le SDK Stripe s'appuie sur
 * des API Node, il ne tourne pas sur le runtime Edge.
 */
export const runtime = 'nodejs'

/**
 * Le montant N'EST JAMAIS transmis par le client — seulement le couple
 * (palier, périodicité), qui sert à choisir un `price_id` configuré côté
 * serveur. C'est le même patron intent→grant que « Chaleur de la Forge » :
 * « Coût jamais transmis par le client, il est recalculé serveur à chaque
 * appel ». Ici l'enjeu est direct : accepter un prix du navigateur, ce serait
 * accepter de vendre Maître au prix qu'il aura choisi.
 */
interface CheckoutBody {
  plan?: unknown
  period?: unknown
}

function badRequest(code: string, status = 400) {
  return NextResponse.json({ error: code }, { status })
}

export async function POST(request: NextRequest) {
  // ── 1. Qui demande ? ────────────────────────────────────────────────────────
  //
  // `getUser()` et jamais `getSession()` : `getSession` relit le cookie sans le
  // faire valider par le serveur d'auth. Sur une route qui ouvre un paiement,
  // l'identité doit être vérifiée en amont, pas déduite d'un cookie présent.
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) return badRequest('not_authenticated', 401)

  // ── 2. Que demande-t-il ? ───────────────────────────────────────────────────
  let body: CheckoutBody
  try {
    body = (await request.json()) as CheckoutBody
  } catch {
    return badRequest('invalid_json')
  }

  const { plan, period } = body
  if (!isPlanKey(plan)) return badRequest('invalid_plan')
  if (!isBillingPeriod(period)) return badRequest('invalid_period')

  const priceId = resolvePriceId(plan, period, priceEnv())
  if (!priceId) {
    // Variable d'environnement absente : configuration incomplète, pas une
    // faute de l'utilisateur. 503 plutôt que 400 — il n'a rien à corriger.
    console.error(`[stripe/checkout] price_id absent pour ${plan}/${period}`)
    return badRequest('price_not_configured', 503)
  }

  try {
    const stripe = getStripe()

    // Mode Stripe déduit de la clé (jamais d'un drapeau séparé) et journalisé :
    // c'est ce qui permet de constater, en lisant les logs, qu'une session a
    // bien été ouverte en test. Aucun refus ici — bloquer le mode live ferait
    // du passage en production un changement de code.
    const mode = stripeMode(process.env.STRIPE_SECRET_KEY)

    // ── 3. Réutiliser le client Stripe existant, s'il y en a un ───────────────
    //
    // Lecture sous le JWT de l'utilisateur : la policy `ss_select_own` lui donne
    // SA ligne et rien d'autre. Aucun `service_role` n'est nécessaire ici, et
    // c'est voulu — cette route n'écrit rien, le webhook est seul à le faire.
    //
    // Sans cette relecture, un réabonnement créerait un second client Stripe
    // pour la même personne : historique de facturation coupé en deux, et un
    // `stripe_customer_id` concurrent que la contrainte UNIQUE de la table
    // rejetterait au premier webhook.
    const { data: existing } = await supabase
      .from('stripe_subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .maybeSingle()

    const customerId: string | undefined = existing?.stripe_customer_id ?? undefined

    // ── 4. La session ─────────────────────────────────────────────────────────
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],

      // Deux rattachements, volontairement REDONDANTS — ils ne survivent pas
      // aux mêmes événements :
      //   • `client_reference_id` ne vit que sur la session de checkout, donc
      //     n'est lisible que par `checkout.session.completed` ;
      //   • `subscription_data.metadata` est recopié sur l'ABONNEMENT, donc
      //     accompagne aussi les `customer.subscription.updated`/`deleted`, y
      //     compris quand ils sont déclenchés depuis le Dashboard Stripe.
      // Le webhook a besoin des deux : voir `resolveUserId` côté webhook.
      client_reference_id: user.id,
      metadata: { user_id: user.id, plan, period },
      subscription_data: {
        metadata: { user_id: user.id, plan, period, tier: TIER_BY_PLAN[plan] },
      },

      // Client connu → on le réutilise. Sinon Stripe en crée un, pré-rempli
      // avec l'e-mail du compte : `customer` et `customer_email` sont
      // mutuellement exclusifs côté API, d'où le ternaire plutôt que les deux.
      ...(customerId
        ? { customer: customerId }
        : { customer_email: user.email ?? undefined }),

      // ⚠️ Origine de confiance, jamais `request.url` — même règle que
      // `auth/callback` (le header Host est falsifiable). `success_url` est
      // l'adresse vers laquelle Stripe renvoie quelqu'un qui vient de payer.
      //
      // `?tab=tarifs` : l'onglet caché du dashboard (`DEEP_LINKABLE_TABS` dans
      // page.tsx) — l'utilisateur revient là d'où il est parti. `checkout=success`
      // déclenche l'attente d'activation (`CheckoutReturn`), le palier n'étant
      // pas encore écrit à cet instant : c'est le webhook qui l'écrira.
      success_url: `${SITE_URL}/?tab=tarifs&checkout=success`,
      cancel_url:  `${SITE_URL}/?tab=tarifs&checkout=cancel`,

      allow_promotion_codes: true,
    })

    if (!session.url) {
      console.error('[stripe/checkout] session créée sans URL', { id: session.id })
      return badRequest('checkout_unavailable', 502)
    }

    console.log('[stripe/checkout] session ouverte', {
      mode, plan, period, user_id: user.id, session_id: session.id,
    })

    return NextResponse.json({ url: session.url })
  } catch (err) {
    // Le message d'erreur Stripe peut nommer des identifiants de compte : il va
    // dans les logs serveur, jamais dans la réponse.
    console.error('[stripe/checkout]', err instanceof Error ? err.message : err)
    return badRequest('checkout_failed', 502)
  }
}

/**
 * Rien à lire ici. Un GET explicite en 405 vaut mieux que le 404 par défaut :
 * il distingue « route absente » de « mauvaise méthode » quand on diagnostique
 * un déploiement.
 */
export async function GET() {
  return NextResponse.json({ error: 'method_not_allowed' }, { status: 405 })
}

