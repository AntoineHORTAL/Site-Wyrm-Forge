import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'
import {
  CONSENT_TEXTS,
  CONSENT_LOCALES,
  CURRENT_CONSENT_VERSION,
  CGV_VERSION,
  checkConsent,
  consentText,
  recordConsentThenOpenCheckout,
  type ConsentProof,
} from './checkout-consent'
import { BILLING_PERIODS, PLAN_KEYS } from './plans'

/**
 * Demande expresse d'exécution immédiate avant paiement.
 *
 * Trois choses sont verrouillées ici, chacune pour une raison juridique :
 *   1. aucune session Stripe sans preuve écrite — et dans cet ordre ;
 *   2. un texte publié ne bouge jamais (la preuve dit « version X », il faut
 *      que « version X » désigne toujours le même texte) ;
 *   3. la route n'accepte qu'une case réellement cochée, sur le texte en vigueur.
 */

const CONSENT_ID = '3f2b9c1e-8a4d-4e6f-9b2a-1c3d5e7f9a0b'

function proof(over: Partial<ConsentProof> = {}): ConsentProof {
  return {
    userId: '11111111-2222-4333-8444-555555555555',
    plan: 'forgeron',
    period: 'mensuel',
    version: CURRENT_CONSENT_VERSION,
    locale: 'fr',
    text: CONSENT_TEXTS[CURRENT_CONSENT_VERSION].fr,
    termsVersion: CGV_VERSION,
    ...over,
  }
}

describe('ordre : la preuve AVANT la session Stripe', () => {
  // Couvre explicitement les QUATRE couples palier × périodicité : le flux
  // annuel ne doit pas être un cas oublié du mensuel.
  const combos = PLAN_KEYS.flatMap(plan => BILLING_PERIODS.map(period => ({ plan, period })))

  it.each(combos)('$plan / $period — écrit la preuve, puis ouvre la session', async ({ plan, period }) => {
    const calls: string[] = []
    const recordConsent = vi.fn(async (p: ConsentProof) => {
      calls.push(`consent:${p.plan}:${p.period}`)
      return CONSENT_ID
    })
    const openSession = vi.fn(async (id: string) => {
      calls.push(`session:${id}`)
      return { url: 'https://checkout.stripe.test/x' }
    })

    const res = await recordConsentThenOpenCheckout(proof({ plan, period }), { recordConsent, openSession })

    expect(res.ok).toBe(true)
    expect(calls).toEqual([`consent:${plan}:${period}`, `session:${CONSENT_ID}`])
    // La session reçoit l'identifiant de la preuve — c'est lui qui part dans
    // les métadonnées Stripe.
    expect(openSession).toHaveBeenCalledExactlyOnceWith(CONSENT_ID)
  })

  it('attend la FIN de l’écriture avant d’ouvrir la session (pas de course)', async () => {
    let written = false
    const recordConsent = async () => {
      await new Promise(r => setTimeout(r, 5))
      written = true
      return CONSENT_ID
    }
    let writtenWhenOpened: boolean | null = null
    const openSession = async () => {
      writtenWhenOpened = written
      return {}
    }

    await recordConsentThenOpenCheckout(proof(), { recordConsent, openSession })
    expect(writtenWhenOpened).toBe(true)
  })

  it.each(BILLING_PERIODS)('écriture en échec (%s) ⇒ AUCUNE session, jamais en best-effort', async (period) => {
    const openSession = vi.fn(async () => ({}))
    const res = await recordConsentThenOpenCheckout(proof({ period }), {
      recordConsent: async () => { throw new Error('23503 foreign_key_violation') },
      openSession,
    })

    expect(openSession).not.toHaveBeenCalled()
    expect(res).toMatchObject({ ok: false, stage: 'consent', consentId: null })
  })

  it.each([null, undefined, '', 'pas-un-uuid', 42])(
    'identifiant de preuve invalide (%s) ⇒ traité comme une écriture ratée',
    async (bad) => {
      const openSession = vi.fn(async () => ({}))
      const res = await recordConsentThenOpenCheckout(proof(), {
        recordConsent: async () => bad as unknown as string,
        openSession,
      })

      expect(openSession).not.toHaveBeenCalled()
      expect(res).toMatchObject({ ok: false, stage: 'consent' })
    },
  )

  it('Stripe en échec APRÈS la preuve ⇒ stage session, et la preuve est nommée', async () => {
    const res = await recordConsentThenOpenCheckout(proof(), {
      recordConsent: async () => CONSENT_ID,
      openSession: async () => { throw new Error('stripe down') },
    })

    expect(res).toMatchObject({ ok: false, stage: 'session', consentId: CONSENT_ID })
  })

  it('transmet la preuve telle quelle à l’écriture', async () => {
    const recordConsent = vi.fn(async () => CONSENT_ID)
    const p = proof({ plan: 'maitre', period: 'annuel', locale: 'en', text: CONSENT_TEXTS[CURRENT_CONSENT_VERSION].en })
    await recordConsentThenOpenCheckout(p, { recordConsent, openSession: async () => ({}) })

    expect(recordConsent).toHaveBeenCalledExactlyOnceWith(p)
  })
})

describe('checkConsent — ce que la route accepte', () => {
  const valid = { accepted: true, version: CURRENT_CONSENT_VERSION, locale: 'fr' }

  it('accepte une case cochée sur le texte en vigueur, et relit le texte côté serveur', () => {
    expect(checkConsent(valid)).toEqual({
      ok: true,
      version: CURRENT_CONSENT_VERSION,
      locale: 'fr',
      text: CONSENT_TEXTS[CURRENT_CONSENT_VERSION].fr,
    })
  })

  it('ignore tout texte envoyé par le client', () => {
    // Un client modifié ne peut pas faire enregistrer autre chose que ce que le
    // site affiche : le champ `text` du corps n'est jamais lu.
    const res = checkConsent({ ...valid, text: 'J’accepte tout et son contraire.' })
    expect(res.ok && res.text).toBe(CONSENT_TEXTS[CURRENT_CONSENT_VERSION].fr)
  })

  it.each([
    ['corps absent', undefined],
    ['null', null],
    ['chaîne', 'yes'],
    ['case non cochée', { ...valid, accepted: false }],
    ['« true » en texte', { ...valid, accepted: 'true' }],
    ['1', { ...valid, accepted: 1 }],
    ['accepted absent', { version: CURRENT_CONSENT_VERSION, locale: 'fr' }],
  ])('refuse sans case cochée : %s', (_label, raw) => {
    expect(checkConsent(raw)).toEqual({ ok: false, error: 'consent_required' })
  })

  it.each(['retractation-2020-01-01', '', undefined, 42])(
    'refuse une version qui n’est pas la courante (%s)',
    (version) => {
      expect(checkConsent({ ...valid, version })).toEqual({ ok: false, error: 'consent_outdated' })
    },
  )

  it.each(['de', 'FR', '', undefined])('refuse une langue non proposée (%s)', (locale) => {
    expect(checkConsent({ ...valid, locale })).toEqual({ ok: false, error: 'invalid_locale' })
  })

  it('accepte l’anglais, avec le texte anglais', () => {
    const res = checkConsent({ ...valid, locale: 'en' })
    expect(res.ok && res.text).toBe(CONSENT_TEXTS[CURRENT_CONSENT_VERSION].en)
  })
})

describe('textes versionnés', () => {
  it('la version courante existe dans toutes les langues de la vitrine', () => {
    for (const locale of CONSENT_LOCALES) {
      expect(consentText(CURRENT_CONSENT_VERSION, locale)?.trim()).toBeTruthy()
    }
  })

  it('consentText renvoie null sur une version ou une langue inconnue', () => {
    expect(consentText('inconnue', 'fr')).toBeNull()
    expect(consentText(CURRENT_CONSENT_VERSION, 'de')).toBeNull()
    expect(consentText('__proto__', 'fr')).toBeNull()
  })

  it('reste dans les bornes du CHECK SQL (20 à 2000 caractères)', () => {
    for (const texts of Object.values(CONSENT_TEXTS)) {
      for (const t of Object.values(texts)) {
        expect(t.length).toBeGreaterThanOrEqual(20)
        expect(t.length).toBeLessThanOrEqual(2000)
      }
    }
  })

  it('dit ce que la loi exige pour un abonnement (L221-25) — FR', () => {
    const fr = CONSENT_TEXTS[CURRENT_CONSENT_VERSION].fr
    expect(fr).toContain('14 jours')
    expect(fr).toMatch(/immédiatement/)
    // La contrepartie réelle d'une rétractation après demande expresse : le
    // prorata du service fourni — pas la perte pure et simple du droit.
    expect(fr).toMatch(/montant correspondant au service fourni/)
    expect(fr).toMatch(/pleinement fourni/)
  })

  /**
   * 🔴 UNE VERSION PUBLIÉE NE SE MODIFIE JAMAIS.
   *
   * Les lignes de `checkout_consent_log` portent le texte en toutes lettres,
   * mais aussi sa version : si le texte de `retractation-2026-09-11` était
   * réécrit en place, la version ne désignerait plus ce que les premiers
   * abonnés ont accepté. Si ce test échoue : ANNULER la modification, et créer
   * une nouvelle version à la place (voir l'en-tête de `checkout-consent.ts`).
   * Ajouter l'empreinte de la nouvelle version ci-dessous.
   */
  it('fige le contenu de chaque version publiée', () => {
    // Échoue dans les deux cas utiles : un texte publié a bougé, OU une version
    // a été ajoutée sans que son empreinte soit figée ici.
    const actual = Object.fromEntries(
      Object.entries(CONSENT_TEXTS).map(([version, texts]) => [
        version,
        Object.fromEntries(Object.entries(texts).map(([locale, t]) => [locale, sha(t)])),
      ]),
    )
    expect(actual).toEqual(FROZEN)
  })
})

describe('version des CGV enregistrée avec la preuve', () => {
  // Le document vit dans `src/locales/legal/cgv.tsx` depuis le chantier de
  // traduction (la page n'est plus qu'une coquille qui exporte `metadata`), et
  // la date y est au format ISO : c'est `LegalPage` qui la rend en toutes
  // lettres dans la langue lue. Le fichier est relu en TEXTE plutôt qu'importé
  // parce qu'il contient du JSX qui tire tout l'arbre React — la propriété
  // vérifiée, elle, est une simple chaîne.
  const source = readFileSync(path.resolve(__dirname, '../../locales/legal/cgv.tsx'), 'utf8')

  it('correspond à la date « Dernière mise à jour » du document /cgv', () => {
    // Si les CGV changent sans que `CGV_VERSION` avance, les nouveaux abonnés
    // seraient enregistrés comme ayant accepté une version qui ne désigne plus
    // le texte qu'ils ont lu.
    const dates = [...source.matchAll(/^ {2}updated: '(\d{4}-\d{2}-\d{2})',$/gm)]
      .map(m => m[1])
    expect(dates.length, 'date de mise à jour introuvable dans locales/legal/cgv.tsx')
      .toBeGreaterThan(0)
    for (const iso of dates) expect(iso).toBe(CGV_VERSION)
  })

  it('est la MÊME dans les deux langues', () => {
    // `cgvFr` et `cgvEn` portent chacun leur `updated`. Deux dates différentes
    // feraient annoncer deux versions du contrat selon la langue lue, alors
    // qu'une seule est enregistrée avec la preuve de consentement.
    const dates = [...source.matchAll(/^ {2}updated: '(\d{4}-\d{2}-\d{2})',$/gm)]
      .map(m => m[1])
    expect(dates).toHaveLength(2)
    expect(dates[0]).toBe(dates[1])
  })
})

function sha(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex')
}

/** Empreintes SHA-256 des versions publiées. Append-only. */
const FROZEN: Record<string, Record<string, string>> = {
  'retractation-2026-09-11': {
    fr: 'c9dc7c90f8c50fc54ce4176dbd367c09e05f579f9619af194ee4b15e83f0ae9b',
    en: '33aa21df49ae512d0679117f61b2638511e19dc606873f85fea08cf64495d882',
  },
}
