// Helper d'envoi d'e-mails via Resend (https://resend.com/docs/api-reference/emails/send-email).
// Premier transport e-mail du projet — réutilisable au-delà du module prac.
//
// Secret requis : RESEND_API_KEY (secret Supabase). Domaine d'envoi vérifié :
// wyrm-forge.com (DKIM posé côté Cloudflare). Le `from` par défaut utilise
// noreply@wyrm-forge.com ; chaque appelant peut le surcharger.
import { requireSecret } from './auth.ts'

const RESEND_ENDPOINT = 'https://api.resend.com/emails'
const DEFAULT_FROM    = 'Wyrm Forge <noreply@wyrm-forge.com>'

export interface SendEmailParams {
  to: string
  subject: string
  html: string
  text?: string
  from?: string
}

export interface SendEmailResult {
  ok: boolean
  status: number
  id?: string       // id du message Resend (présent si ok)
  error?: string    // message d'erreur (présent si !ok)
}

/**
 * Envoie un e-mail via l'API Resend. Ne throw jamais sur une erreur HTTP : retourne
 * { ok:false, status, error } pour que l'appelant décide (ex. marquer 'failed' +
 * laisser le webhook retenter). Throw uniquement si RESEND_API_KEY est absent
 * (mauvaise configuration serveur — via requireSecret).
 */
export async function sendEmail(p: SendEmailParams): Promise<SendEmailResult> {
  const apiKey = requireSecret('RESEND_API_KEY')

  let res: Response
  try {
    res = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: p.from ?? DEFAULT_FROM,
        to: p.to,
        subject: p.subject,
        html: p.html,
        ...(p.text ? { text: p.text } : {}),
      }),
    })
  } catch (e) {
    // Erreur réseau (DNS, timeout…) — traitée comme un échec d'envoi récupérable.
    return { ok: false, status: 0, error: e instanceof Error ? e.message : 'network error' }
  }

  const body = await res.json().catch(() => null)
  if (!res.ok) {
    return { ok: false, status: res.status, error: body?.message ?? body?.error ?? `Resend ${res.status}` }
  }
  return { ok: true, status: res.status, id: body?.id }
}
