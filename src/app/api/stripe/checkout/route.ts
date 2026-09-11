import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getStripe, priceEnv, SITE_URL } from '@/lib/stripe/server'
import {
  isPlanKey,
  isBillingPeriod,
  resolvePriceId,
  TIER_BY_PLAN,
  stripeMode,
} from '@/lib/stripe/plans'
import {
  checkConsent,
  recordConsentThenOpenCheckout,
  CGV_VERSION,
  type ConsentProof,
} from '@/lib/stripe/checkout-consent'

/**
 * Ouverture d'une session Stripe Checkout en mode `subscription`.
 *
 * POST `{
 *   plan: 'forgeron' | 'maitre',
 *   period: 'mensuel' | 'annuel',
 *   consent: { accepted: true, version: <CURRENT_CONSENT_VERSION>, locale: 'fr' | 'en' },
 * }`
 *   → 200 `{ url }` — le navigateur y redirige.
 *
 * ⚠️ PAS DE SESSION SANS PREUVE. La demande expresse d'exécution immédiate
 * (case cochée dans `CheckoutConsentModal`) est validée, puis ÉCRITE en base
 * (`checkout_consent_log`), et c'est seulement ensuite que la session Stripe
 * est créée. Si l'écriture échoue, la route répond 503 et Stripe n'est jamais
 * appelé. L'ordre est porté par `recordConsentThenOpenCheckout`, testé dans
 * `checkout-consent.test.ts` — pas par la seule lecture de ce fichier.
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
  consent?: unknown
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

  // Demande expresse d'exécution immédiate (art. L221-25 C. conso). Refusée
  // AVANT toute autre étape : sans elle, aucune session ne doit exister, quel
  // que soit le client qui appelle cette route (bouton, reprise après
  // connexion, `curl`). Le texte n'est pas lu dans le corps — `checkConsent`
  // le relit dans le module versionné, à partir de la version et de la langue.
  const consent = checkConsent(body.consent)
  if (!consent.ok) return badRequest(consent.error)

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

    // ── 4. La preuve, PUIS la session ─────────────────────────────────────────
    const proof: ConsentProof = {
      userId: user.id,
      plan,
      period,
      version: consent.version,
      locale: consent.locale,
      text: consent.text,
      termsVersion: CGV_VERSION,
    }

    const result = await recordConsentThenOpenCheckout(proof, {
      // Écriture via le client `service_role` : `checkout_consent_log` n'a
      // AUCUN privilège client, et la RPC n'est exécutable que par ce rôle —
      // un navigateur ne peut pas fabriquer de preuve. `user.id` vient de
      // `getUser()` ci-dessus, jamais du corps de la requête.
      recordConsent: async (p) => {
        const { data, error } = await createAdminClient().rpc('record_checkout_consent', {
          p_user_id:         p.userId,
          p_plan:            p.plan,
          p_period:          p.period,
          p_consent_version: p.version,
          p_locale:          p.locale,
          p_consent_text:    p.text,
          p_terms_version:   p.termsVersion,
        })
        if (error) throw new Error(`rpc record_checkout_consent: ${error.message}`)
        return data as string
      },

      openSession: (consentId) => stripe.checkout.sessions.create({
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
        //
        // `consent_id` suit le même double chemin : c'est ce qui permet, depuis
        // un litige ouvert dans Stripe (session OU abonnement), de retrouver la
        // ligne exacte de `checkout_consent_log` qui prouve l'acceptation.
        client_reference_id: user.id,
        metadata: { user_id: user.id, plan, period, consent_id: consentId },
        subscription_data: {
          metadata: {
            user_id: user.id, plan, period, tier: TIER_BY_PLAN[plan], consent_id: consentId,
          },
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
      }),
    })

    if (!result.ok) {
      if (result.stage === 'consent') {
        // La preuve n'a pas été écrite → aucune session n'a été créée. 503 : ce
        // n'est pas une faute de l'utilisateur, et il n'a rien été débité.
        console.error('[stripe/checkout] preuve de consentement NON écrite — aucune session ouverte',
          result.error instanceof Error ? result.error.message : result.error)
        return badRequest('consent_not_recorded', 503)
      }
      // Preuve écrite, Stripe en échec : une ligne de consentement sans
      // paiement, inoffensive. Le message d'erreur Stripe peut nommer des
      // identifiants de compte : il va dans les logs serveur, jamais dans la
      // réponse.
      console.error('[stripe/checkout] session en échec après preuve', {
        consent_id: result.consentId,
        error: result.error instanceof Error ? result.error.message : result.error,
      })
      return badRequest('checkout_failed', 502)
    }

    const session = result.session
    if (!session.url) {
      console.error('[stripe/checkout] session créée sans URL', { id: session.id })
      return badRequest('checkout_unavailable', 502)
    }

    console.log('[stripe/checkout] session ouverte', {
      mode, plan, period, user_id: user.id, session_id: session.id, consent_id: result.consentId,
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

