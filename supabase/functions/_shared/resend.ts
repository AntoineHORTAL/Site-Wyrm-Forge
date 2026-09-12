// Helper d'envoi d'e-mails via Resend (https://resend.com/docs/api-reference/emails/send-email).
//
// Recréé le 2026-09-11 pour les e-mails d'abonnement, sur le principe de
// l'original (supprimé avec le module PRAC, cf. `git show 6b46bde:supabase/
// functions/_shared/resend.ts`) : une fonction d'envoi GÉNÉRIQUE, aucune logique
// métier ici. Réutilisable plus tard (Lot 3 du Kit, par exemple).
//
// Secret requis : RESEND_API_KEY (secret Edge Functions).
//
// Deux différences délibérées avec l'original :
//   • PAS d'expéditeur par défaut. L'adresse d'envoi est une décision HORTAL
//     (domaine vérifié côté Resend) : chaque appelant passe `from` explicitement,
//     lu dans sa propre configuration. Un défaut en dur partirait en silence
//     depuis une adresse que personne n'a validée.
//   • `idempotencyKey` : transmis dans l'en-tête `Idempotency-Key`. Resend
//     renvoie alors le même résultat, sans second envoi, pour une même clé
//     rejouée (fenêtre de 24 h). C'est le filet contre le doublon quand un
//     envoi a réussi mais que sa clôture en base n'a pas pu être écrite.
//
// AUCUN import : ce fichier se charge tel quel sous Deno ET sous vitest
// (`src/lib/stripe/resend-helper.test.ts`). D'où la lecture directe de la clé
// plutôt que `requireSecret` d'`auth.ts`, qui tire supabase-js depuis esm.sh.

const RESEND_ENDPOINT = 'https://api.resend.com/emails'

/** Même contrat que `requireSecret` : le nom du secret ne sort pas dans le message. */
function resendApiKey(): string {
  const env = (globalThis as { Deno?: { env: { get(name: string): string | undefined } } }).Deno?.env
  const key = env?.get('RESEND_API_KEY')
  if (!key) throw new Error('Configuration serveur incomplète.')
  return key
}

export interface SendEmailOptions {
  /** Pour les tests — en production, lue dans RESEND_API_KEY. */
  apiKey?: string
  /** Pour les tests — en production, le `fetch` global. */
  fetchImpl?: typeof fetch
}

export interface SendEmailParams {
  from: string
  to: string
  subject: string
  html: string
  text?: string
  replyTo?: string
  idempotencyKey?: string
}

export interface SendEmailResult {
  ok: boolean
  status: number
  id?: string       // id du message Resend (présent si ok)
  error?: string    // message d'erreur (présent si !ok)
}

/**
 * Envoie un e-mail via l'API Resend. Ne throw JAMAIS sur une erreur HTTP ni
 * réseau : retourne `{ ok: false, status, error }` pour que l'appelant décide
 * (marquer 'failed', relancer plus tard). Throw uniquement si RESEND_API_KEY est
 * absent — mauvaise configuration serveur (l'Edge Function le vérifie avant de
 * réclamer quoi que ce soit dans la file).
 */
export async function sendEmail(p: SendEmailParams, opts: SendEmailOptions = {}): Promise<SendEmailResult> {
  const apiKey = opts.apiKey ?? resendApiKey()
  const doFetch = opts.fetchImpl ?? fetch

  let res: Response
  try {
    res = await doFetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...(p.idempotencyKey ? { 'Idempotency-Key': p.idempotencyKey } : {}),
      },
      body: JSON.stringify({
        from: p.from,
        to: p.to,
        subject: p.subject,
        html: p.html,
        ...(p.text ? { text: p.text } : {}),
        ...(p.replyTo ? { reply_to: p.replyTo } : {}),
      }),
      // Un envoi ne doit jamais bloquer le traitement de la file : au-delà, on
      // considère l'envoi en échec et la ligne est relancée plus tard.
      signal: AbortSignal.timeout(15_000),
    })
  } catch (e) {
    // Erreur réseau ou timeout — échec d'envoi récupérable.
    return { ok: false, status: 0, error: e instanceof Error ? e.message : 'network error' }
  }

  const body = await res.json().catch(() => null)
  if (!res.ok) {
    return { ok: false, status: res.status, error: body?.message ?? body?.error ?? `Resend ${res.status}` }
  }
  return { ok: true, status: res.status, id: body?.id }
}
