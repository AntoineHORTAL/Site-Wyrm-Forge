// ════════════════════════════════════════════════════════════════════════════
//  Edge Function `subscription-emails` — envoi des e-mails d'abonnement
// ════════════════════════════════════════════════════════════════════════════
// Déclenchée par pg_cron (`trigger_subscription_emails_drain`, migration
// 20260911000004) toutes les 5 minutes, et seulement quand la file contient une
// ligne due. Traite la file `subscription_emails` en claim-then-send :
// réclamer → envoyer via Resend → clore. Toute la logique (validation des
// rappels, gabarits, isolation des échecs) vit dans le module PUR
// `_shared/subscription-emails.ts`, testé par vitest ; ce fichier ne fait que
// câbler les effets.
//
// Sécurité : `verify_jwt = false` (appelant = Postgres, pas un utilisateur) ;
// la barrière est l'en-tête `X-Internal-Token`, comparé en temps constant au
// secret SUBSCRIPTION_EMAILS_TOKEN — même valeur que le secret Vault
// `subscription_emails_token`. Sans jeton valide : 401, rien n'est lu.
//
// Secrets Edge Functions :
//   RESEND_API_KEY              clé Resend (fournie par HORTAL)
//   SUBSCRIPTION_EMAILS_TOKEN   jeton interne (identique au secret Vault)
//   EMAIL_FROM                  expéditeur, ex. « Wyrm Forge <…@wyrm-forge.com> » — À DÉCIDER PAR HORTAL
//   EMAIL_REPLY_TO   (option)   adresse de réponse, ex. contact@wyrm-forge.com
//   SITE_URL         (option)   défaut https://wyrm-forge.com (même repli que l'ancien prac-notify)
//   STRIPE_PORTAL_LOGIN_URL (option) lien « no-code » de connexion au portail Stripe ;
//                                à défaut, les e-mails renvoient vers /profil
//
// ⚠️ Configuration FERMÉE PAR DÉFAUT : sans EMAIL_FROM ou sans RESEND_API_KEY,
// l'EF répond 503 SANS RIEN RÉCLAMER — la file reste intacte et tout part dès
// que la configuration est posée. Réclamer puis échouer brûlerait les
// tentatives de relance pour une simple absence de réglage.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { secretsMatch } from '../_shared/auth.ts'
import { sendEmail } from '../_shared/resend.ts'
import { processDueEmails, type ClaimedEmail, type FinishOutcome } from '../_shared/subscription-emails.ts'

const BATCH = 10

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const expected = Deno.env.get('SUBSCRIPTION_EMAILS_TOKEN')
  if (!expected || !(await secretsMatch(req.headers.get('X-Internal-Token'), expected))) {
    return json({ error: 'unauthorized' }, 401)
  }

  const from = Deno.env.get('EMAIL_FROM')
  if (!from || !Deno.env.get('RESEND_API_KEY')) {
    console.error('subscription-emails: EMAIL_FROM ou RESEND_API_KEY absent — aucune ligne réclamée')
    return json({ error: 'email_not_configured' }, 503)
  }
  const replyTo = Deno.env.get('EMAIL_REPLY_TO') ?? undefined
  const site = (Deno.env.get('SITE_URL') ?? 'https://wyrm-forge.com').replace(/\/$/, '')

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  try {
    const report = await processDueEmails({
      claim: async (limit) => {
        const { data, error } = await db.rpc('claim_subscription_emails', { p_limit: limit })
        if (error) throw new Error(`claim_subscription_emails: ${error.message}`)
        return (data ?? []) as ClaimedEmail[]
      },

      // Destinataire CANONIQUE : auth.users, relu à l'envoi (une adresse changée
      // entre-temps est prise en compte). Jamais stockée dans la charge utile.
      recipientOf: async (userId) => {
        const { data, error } = await db.auth.admin.getUserById(userId)
        if (error) throw new Error(`getUserById: ${error.message}`)
        return data.user?.email ?? null
      },

      subscriptionState: async (subscriptionId) => {
        const { data, error } = await db.from('stripe_subscriptions')
          .select('status, cancel_at_period_end, current_period_end')
          .eq('stripe_subscription_id', subscriptionId).maybeSingle()
        if (error) throw new Error(`stripe_subscriptions: ${error.message}`)
        return data
      },

      // Texte EXACT de la demande expresse acceptée (L221-13 : sa confirmation
      // fait partie de la confirmation du contrat) — et la LANGUE dans laquelle
      // la case a été lue, qui est celle de la confirmation de commande.
      consentOf: async (consentId) => {
        const { data, error } = await db.from('checkout_consent_log')
          .select('consent_text, terms_version, locale').eq('id', consentId).maybeSingle()
        if (error) throw new Error(`checkout_consent_log: ${error.message}`)
        return data
          ? { text: data.consent_text, terms_version: data.terms_version, locale: data.locale ?? null }
          : null
      },

      // Dernière langue connue du compte, pour les e-mails qui ne sont rattachés
      // à AUCUNE preuve précise (résiliation, rappel annuel). Sert l'index
      // `idx_checkout_consent_log_user (user_id, accepted_at DESC)` déjà posé par
      // la migration 20260911000003 — aucune colonne ni table à ajouter.
      localeOf: async (userId) => {
        const { data, error } = await db.from('checkout_consent_log')
          .select('locale').eq('user_id', userId)
          .order('accepted_at', { ascending: false }).limit(1).maybeSingle()
        if (error) throw new Error(`checkout_consent_log locale: ${error.message}`)
        return data?.locale ?? null
      },

      send: (m) => sendEmail({ from, to: m.to, subject: m.subject, html: m.html, text: m.text, replyTo, idempotencyKey: m.idempotencyKey }),

      finish: async (id, outcome: FinishOutcome) => {
        const { error } = await db.rpc('finish_subscription_email', {
          p_id: id,
          p_status: outcome.status,
          p_provider_message_id: outcome.status === 'sent' ? outcome.providerId : null,
          p_error: outcome.status === 'sent' ? null : outcome.error,
          p_recipient: 'recipient' in outcome ? outcome.recipient ?? null : null,
        })
        if (error) throw new Error(`finish_subscription_email: ${error.message}`)
      },

      links: {
        profile: `${site}/profil`,
        cgv: `${site}/cgv`,
        portalLogin: Deno.env.get('STRIPE_PORTAL_LOGIN_URL') || null,
      },
      now: () => new Date(),
      // Jamais d'adresse e-mail dans les logs : identifiants de ligne seulement.
      log: (level, message, data) => console[level](`subscription-emails: ${message}`, data ?? {}),
    }, BATCH)

    console.log('subscription-emails: passe terminée', report)
    return json(report)
  } catch (e) {
    console.error('subscription-emails: échec de la passe', e instanceof Error ? e.message : e)
    return json({ error: 'drain_failed' }, 500)
  }
})
