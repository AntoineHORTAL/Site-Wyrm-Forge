/**
 * Demande expresse d'exécution immédiate — ce que la personne coche avant de
 * payer, et l'ORDRE dans lequel la preuve est écrite.
 *
 * Module PUR (aucun import React/Next, aucun SDK, aucun accès à `process.env`),
 * comme `plans.ts` et pour la même raison : c'est ici que vit la règle, donc
 * c'est ici qu'elle se teste, sans harnais de route (le repo n'en a pas, cf.
 * AGENTS.md § Abonnements Stripe › Tests).
 *
 * ════════════════════════════════════════════════════════════════════════════
 *  CE QUE LA CASE PROUVE — ET CE QU'ELLE NE FAIT PAS
 * ════════════════════════════════════════════════════════════════════════════
 * Un abonnement est un service fourni EN CONTINU : il n'est jamais « pleinement
 * exécuté » avant la fin des 14 jours. L'exception de l'art. L221-28 1° du Code
 * de la consommation (perte du droit de rétractation) ne joue donc presque jamais
 * ici. Ce qui s'applique, c'est l'art. L221-25 :
 *   • SANS demande expresse recueillie, un client qui se rétracte ne doit RIEN —
 *     remboursement intégral, même après deux semaines d'usage (al. 3) ;
 *   • AVEC demande expresse, il doit le montant du service fourni jusqu'à sa
 *     rétractation, proportionné au prix total (al. 2) — il est remboursé du reste.
 * La case ne supprime donc pas le droit de rétractation d'un abonné : elle en
 * change la contrepartie (prorata au lieu de remboursement intégral). Le texte
 * ci-dessous le dit tel quel, et garde la mention « une fois le service
 * pleinement fourni » qui couvre le cas L221-28 1°.
 *
 * ════════════════════════════════════════════════════════════════════════════
 *  POURQUOI LE TEXTE EST VERSIONNÉ ICI, ET PAS DANS LE DICTIONNAIRE
 * ════════════════════════════════════════════════════════════════════════════
 * La valeur probante tient au TEXTE EXACT affiché au moment du clic. Le client
 * l'affiche depuis ce module, et le serveur l'enregistre depuis ce même module
 * (il ne l'accepte JAMAIS du navigateur : il reçoit une version et une langue,
 * et relit le texte ici). Les deux ne peuvent donc pas diverger.
 *
 * ⚠️ UNE VERSION PUBLIÉE NE SE MODIFIE JAMAIS. Pour changer le texte : ajouter
 * une NOUVELLE entrée à `CONSENT_TEXTS`, pointer `CURRENT_CONSENT_VERSION` dessus,
 * et laisser l'ancienne en place. Les lignes déjà enregistrées portent l'ancien
 * texte en toutes lettres ; une version réécrite en place ferait mentir la
 * correspondance version → texte. `checkout-consent.test.ts` fige le contenu de
 * chaque version publiée et échoue si l'une d'elles bouge.
 */

import type { BillingPeriod, PlanKey } from './plans'

/** Langues dans lesquelles la case est proposée — celles de la vitrine (`Lang`). */
export type ConsentLocale = 'fr' | 'en'
export const CONSENT_LOCALES: readonly ConsentLocale[] = ['fr', 'en'] as const

/**
 * Version des CGV en vigueur, enregistrée avec chaque consentement.
 *
 * ⚠️ DOIT correspondre à la date « Dernière mise à jour » de `src/app/cgv/page.tsx`
 * — vérifié par `checkout-consent.test.ts`, qui relit la page. Modifier les CGV
 * sans avancer cette date ferait enregistrer, pour les nouveaux abonnés, une
 * version qui ne désigne plus le texte qu'ils ont eu sous les yeux.
 */
export const CGV_VERSION = '2026-09-11'

/**
 * Textes de la case, par version puis par langue. APPEND-ONLY — voir l'en-tête.
 */
export const CONSENT_TEXTS = {
  'retractation-2026-09-11': {
    fr:
      "Je demande à accéder à mon abonnement immédiatement, avant la fin du délai de "
      + "rétractation de 14 jours. Je reconnais que, si j'exerce mon droit de rétractation "
      + "pendant ce délai, je devrai payer le montant correspondant au service fourni "
      + "jusqu'à ma rétractation, et que je perdrai ce droit une fois le service "
      + 'pleinement fourni.',
    en:
      'I request immediate access to my subscription, before the end of the 14-day '
      + 'withdrawal period. I acknowledge that if I exercise my right of withdrawal during '
      + 'this period, I will pay an amount corresponding to the service provided up to my '
      + 'withdrawal, and that I will lose this right once the service has been fully provided.',
  },
} as const satisfies Record<string, Record<ConsentLocale, string>>

export type ConsentVersion = keyof typeof CONSENT_TEXTS

/** Seule version acceptée par la route de checkout. */
export const CURRENT_CONSENT_VERSION: ConsentVersion = 'retractation-2026-09-11'

function isConsentLocale(value: unknown): value is ConsentLocale {
  return typeof value === 'string' && (CONSENT_LOCALES as readonly string[]).includes(value)
}

/** Texte exact d'une version dans une langue, ou `null` si l'un des deux est inconnu. */
export function consentText(version: string, locale: string): string | null {
  if (!Object.prototype.hasOwnProperty.call(CONSENT_TEXTS, version)) return null
  if (!isConsentLocale(locale)) return null
  return CONSENT_TEXTS[version as ConsentVersion][locale]
}

/* ════════════════════════════════════════════════════════════════════════════
   VALIDATION DU CORPS DE REQUÊTE
   ════════════════════════════════════════════════════════════════════════════ */

export type ConsentCheck =
  | { ok: true; version: ConsentVersion; locale: ConsentLocale; text: string }
  | { ok: false; error: 'consent_required' | 'consent_outdated' | 'invalid_locale' }

/**
 * Le champ `consent` du corps de `/api/stripe/checkout` est-il une demande
 * expresse valable ?
 *
 *  • `accepted` doit valoir le BOOLÉEN `true` — ni `"true"`, ni `1`. Une case
 *    cochée produit un booléen ; toute autre forme vient d'ailleurs que du
 *    formulaire et ne prouve rien.
 *  • `version` doit être la version COURANTE. Un onglet ouvert avant une mise à
 *    jour du texte enverrait l'ancienne : on la refuse (`consent_outdated`) pour
 *    que la personne recharge et lise le texte en vigueur, plutôt que
 *    d'enregistrer une acceptation d'un texte qu'on a retiré.
 *  • Le TEXTE n'est jamais lu dans le corps : il est relu ici, à partir de la
 *    version et de la langue. Un client modifié ne peut pas faire enregistrer
 *    autre chose que ce que le site affiche.
 */
export function checkConsent(raw: unknown): ConsentCheck {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'consent_required' }
  const { accepted, version, locale } = raw as Record<string, unknown>

  if (accepted !== true) return { ok: false, error: 'consent_required' }
  if (version !== CURRENT_CONSENT_VERSION) return { ok: false, error: 'consent_outdated' }
  if (!isConsentLocale(locale)) return { ok: false, error: 'invalid_locale' }

  return { ok: true, version, locale, text: CONSENT_TEXTS[version][locale] }
}

/* ════════════════════════════════════════════════════════════════════════════
   ORDRE D'EXÉCUTION — la preuve AVANT la session Stripe, jamais en best-effort
   ════════════════════════════════════════════════════════════════════════════ */

/** Ce qui est écrit dans `checkout_consent_log` (migration 20260911000003). */
export interface ConsentProof {
  userId: string
  plan: PlanKey
  period: BillingPeriod
  version: ConsentVersion
  locale: ConsentLocale
  text: string
  termsVersion: string
}

export type ConsentedCheckout<S> =
  | { ok: true; consentId: string; session: S }
  /**
   * `stage: 'consent'` — la preuve n'a PAS été écrite : aucune session n'a été
   * ouverte, rien ne peut être payé.
   * `stage: 'session'` — la preuve est écrite (`consentId`), mais Stripe a
   * échoué : une ligne de consentement sans paiement, inoffensive.
   */
  | { ok: false; stage: 'consent' | 'session'; consentId: string | null; error: unknown }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Écrit la preuve, PUIS ouvre la session de paiement — dans cet ordre, et la
 * seconde étape n'a lieu que si la première a abouti.
 *
 * Les deux effets sont INJECTÉS (la route passe la RPC Supabase et l'appel
 * Stripe) : c'est ce qui permet de tester l'ordre sans réseau. La garantie
 * « pas de session sans preuve » ne repose donc pas sur la lecture de la route,
 * mais sur ce module et ses tests.
 *
 * `openSession` reçoit l'identifiant de la preuve : la route le pose dans les
 * `metadata` de la session ET de l'abonnement Stripe, ce qui relie un litige
 * (retrouvé depuis Stripe) à la ligne exacte qui prouve l'acceptation.
 */
export async function recordConsentThenOpenCheckout<S>(
  proof: ConsentProof,
  deps: {
    recordConsent: (proof: ConsentProof) => Promise<string>
    openSession: (consentId: string) => Promise<S>
  },
): Promise<ConsentedCheckout<S>> {
  let consentId: string
  try {
    consentId = await deps.recordConsent(proof)
  } catch (error) {
    return { ok: false, stage: 'consent', consentId: null, error }
  }

  // Un identifiant qui n'en est pas un (RPC renvoyant `null`, forme inattendue)
  // vaut absence de preuve : on ne paie pas sur une écriture non confirmée.
  if (typeof consentId !== 'string' || !UUID_RE.test(consentId)) {
    return {
      ok: false, stage: 'consent', consentId: null,
      error: new Error(`identifiant de consentement invalide : ${String(consentId)}`),
    }
  }

  try {
    const session = await deps.openSession(consentId)
    return { ok: true, consentId, session }
  } catch (error) {
    return { ok: false, stage: 'session', consentId, error }
  }
}
