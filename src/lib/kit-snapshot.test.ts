import { describe, it, expect } from 'vitest'
import {
  KIT_FORMULAS, KIT_PRICE_CENTS, isKitFormula,
  EMPTY_KIT_FORM, KIT_FIELD_MAX, SNAPSHOT_MAX_BYTES,
  snapshotByteSize, validateKitForm, canSubmitKitForm,
  buildKitSnapshot, buildBookingUrl,
  type KitFormInput,
} from './kit-snapshot'

/**
 * Contrat du `player_snapshot` — logique PURE.
 *
 * ⚠️ Ce fichier verrouille le MIROIR client des gardes SQL de
 * `kit_assert_snapshot` (migration 20260909000001). Il ne prouve rien sur la
 * base : c'est elle l'autorité, et un client qui appelle PostgREST directement
 * ne passe jamais par ici. Le front valide pour rendre un message clair, pas
 * pour protéger quoi que ce soit.
 */

/** Formulaire minimal valide — le socle de la plupart des cas. */
const OK: KitFormInput = {
  ...EMPTY_KIT_FORM,
  riot_rank: 'gold',
  goals: 'Monter en Platine avant la fin de saison',
}

const PROFILE = {
  riot_puuid:    'puuid-abc',
  riot_gamename: 'Faker',
  riot_tagline:  'T1',
  riot_platform: 'euw1',
  riot_rank:     'silver',       // ← périmé : le formulaire fait foi
}

const AT = '2026-09-09T12:00:00.000Z'

describe('formules', () => {
  it('n\'en propose que deux, et les reconnaît', () => {
    expect([...KIT_FORMULAS]).toEqual(['solo', 'duo'])
    expect(isKitFormula('solo')).toBe(true)
    expect(isKitFormula('trio')).toBe(false)
    expect(isKitFormula(null)).toBe(false)
  })

  it('porte les prix en CENTIMES, comme price_total_cents', () => {
    // Jamais de flottant sur de l'argent, et la même unité que la colonne :
    // 60 € et 110 €.
    expect(KIT_PRICE_CENTS.solo).toBe(6000)
    expect(KIT_PRICE_CENTS.duo).toBe(11000)
    for (const f of KIT_FORMULAS) {
      expect(Number.isInteger(KIT_PRICE_CENTS[f]), f).toBe(true)
    }
  })
})

describe('validation', () => {
  it('accepte le formulaire minimal', () => {
    expect(validateKitForm(OK)).toEqual({})
    expect(canSubmitKitForm(OK)).toBe(true)
  })

  it('exige le rang et les objectifs, et rien d\'autre', () => {
    const errs = validateKitForm(EMPTY_KIT_FORM)

    expect(errs.riot_rank).toBe('required')
    expect(errs.goals).toBe('required')
    // Le reste prépare une conversation : exiger un format ferait perdre des
    // clients pour rien.
    expect(errs.availability).toBeUndefined()
    expect(errs.playstyle).toBeUndefined()
    expect(errs.role).toBeUndefined()
  })

  it('refuse un champ rempli d\'espaces comme s\'il était vide', () => {
    expect(validateKitForm({ ...OK, goals: '   \n  ' }).goals).toBe('required')
  })

  it('borne chaque champ libre à KIT_FIELD_MAX', () => {
    const long = 'a'.repeat(KIT_FIELD_MAX + 1)

    expect(validateKitForm({ ...OK, goals: long }).goals).toBe('tooLong')
    expect(validateKitForm({ ...OK, playstyle: long }).playstyle).toBe('tooLong')
    // Pile à la limite : accepté.
    expect(validateKitForm({ ...OK, playstyle: 'a'.repeat(KIT_FIELD_MAX) }).playstyle)
      .toBeUndefined()
  })

  it('exige le pseudo du binôme en DUO seulement', () => {
    const duo = { ...OK, formula: 'duo' as const }

    expect(validateKitForm(duo).partner_gamename).toBe('required')
    expect(validateKitForm({ ...duo, partner_gamename: 'Ami' }).partner_gamename)
      .toBeUndefined()
    // En solo, le champ n'est jamais réclamé même vide.
    expect(validateKitForm(OK).partner_gamename).toBeUndefined()
  })

  it('laisse le tag et le rôle du binôme facultatifs', () => {
    // On les demandera de vive voix : les exiger bloquerait une vente pour une
    // information que le client n'a pas forcément sous la main.
    const duo = { ...OK, formula: 'duo' as const, partner_gamename: 'Ami' }
    expect(validateKitForm(duo)).toEqual({})
  })
})

describe('🔴 borne de taille — miroir de kit_assert_snapshot', () => {
  it('recopie la valeur de la base', () => {
    // ⚠️ Si `octet_length(...) > 4096` change dans la migration, cette constante
    // doit suivre. Sans quoi le front laisserait partir ce que la base refuse,
    // et l'utilisateur récolterait un `snapshot_too_large` opaque.
    expect(SNAPSHOT_MAX_BYTES).toBe(4096)
  })

  it('compte des OCTETS UTF-8, pas des caractères', () => {
    // `octet_length` en SQL compte des octets : un accent en vaut deux, un
    // emoji quatre. Compter des caractères sous-estimerait la taille réelle et
    // laisserait passer un snapshot que la base refuse.
    expect(snapshotByteSize('é')).toBeGreaterThan(snapshotByteSize('e'))
    expect(snapshotByteSize({ a: '🐉' })).toBeGreaterThan(snapshotByteSize({ a: 'd' }))
  })

  it('signale un dépassement global même si chaque champ tient', () => {
    // Cinq champs à la limite : chacun est valide isolément, la somme ne l'est
    // pas forcément. C'est ce filet-là qui l'attrape.
    const gros = 'é'.repeat(KIT_FIELD_MAX)      // 2 octets par caractère
    const errs = validateKitForm({
      ...OK,
      goals: gros, availability: gros, champions_liked: gros,
      champions_disliked: gros, playstyle: gros,
    })

    expect(errs.size).toBe('tooLong')
    expect(canSubmitKitForm({ ...OK, goals: gros, availability: gros, playstyle: gros })).toBeTypeOf('boolean')
  })

  it('un formulaire raisonnable reste très loin de la borne', () => {
    const snap = buildKitSnapshot({
      ...OK,
      role: 'JUNGLE',
      availability: 'Soirs de semaine après 20h, week-end variable',
      champions_liked: 'Lee Sin, Vi, Hecarim',
      champions_disliked: 'Evelynn',
      playstyle: 'Agressif early, je force les ganks bot',
    }, PROFILE, AT)

    expect(snapshotByteSize(snap)).toBeLessThan(SNAPSHOT_MAX_BYTES / 2)
  })
})

describe('construction du snapshot', () => {
  it('porte une version de contrat', () => {
    // Permet de relire un vieux snapshot sans deviner sa forme le jour où le
    // formulaire change.
    expect(buildKitSnapshot(OK, PROFILE, AT).v).toBe(1)
  })

  it('gèle l\'instant fourni, sans lire l\'horloge', () => {
    // `capturedAt` est injecté : c'est ce qui rend la fonction pure.
    expect(buildKitSnapshot(OK, PROFILE, AT).captured_at).toBe(AT)
  })

  it('🔴 prend le rang du FORMULAIRE, jamais celui du profil', () => {
    // Le cœur de la capture. Le profil ne sert que de valeur initiale au champ :
    // l'utilisateur a pu grimper depuis, ou ne l'avoir jamais renseigné.
    const snap = buildKitSnapshot({ ...OK, riot_rank: 'gold' }, PROFILE, AT)

    expect(snap.riot_rank).toBe('gold')
    expect(snap.riot_rank).not.toBe(PROFILE.riot_rank)
  })

  it('recopie les faits Riot vérifiés depuis le profil', () => {
    // Ceux-là, l'utilisateur ne peut PAS les saisir : ils viennent de la liaison
    // de compte et sont protégés en écriture par `trg_protect_riot_columns`.
    const snap = buildKitSnapshot(OK, PROFILE, AT)

    expect(snap.riot_puuid).toBe('puuid-abc')
    expect(snap.riot_gamename).toBe('Faker')
    expect(snap.riot_platform).toBe('euw1')
  })

  it('accepte un compte SANS Riot ID lié', () => {
    // Refuser la commande d'un client qui n'a pas lié son compte serait absurde.
    const snap = buildKitSnapshot(OK, {}, AT)

    expect(snap.riot_puuid).toBeNull()
    expect(snap.riot_gamename).toBeNull()
    expect(snap.riot_rank).toBe('gold')     // le formulaire, lui, l'a
  })

  it('normalise les chaînes vides en null, jamais en ""', () => {
    const snap = buildKitSnapshot(OK, { riot_gamename: '   ' }, AT)
    expect(snap.riot_gamename).toBeNull()
  })

  it('coupe les espaces des champs libres', () => {
    const snap = buildKitSnapshot({ ...OK, goals: '  monter en élo  ' }, PROFILE, AT)
    expect(snap.goals).toBe('monter en élo')
  })

  it('n\'ajoute AUCUNE clé partner en solo', () => {
    // Un `partner: {}` dans un snapshot solo se lirait comme un binôme dont on
    // aurait perdu les informations.
    const snap = buildKitSnapshot({ ...OK, partner_gamename: 'Ami' }, PROFILE, AT)

    expect(snap.partner).toBeUndefined()
    expect('partner' in snap).toBe(false)
  })

  it('porte le binôme en duo', () => {
    const snap = buildKitSnapshot({
      ...OK, formula: 'duo',
      partner_gamename: 'Ami', partner_tagline: 'EUW', partner_role: 'SUPPORT',
    }, PROFILE, AT)

    expect(snap.partner).toEqual({
      riot_gamename: 'Ami', riot_tagline: 'EUW', role: 'SUPPORT',
    })
  })

  it('produit un objet JSON sérialisable tel quel', () => {
    // C'est ce qui part en `p_snapshot` : `jsonb_typeof` doit y voir un `object`,
    // sans quoi `kit_assert_snapshot` lève `invalid_snapshot`.
    const snap = buildKitSnapshot(OK, PROFILE, AT)
    const round = JSON.parse(JSON.stringify(snap))

    expect(round).toEqual(snap)
    expect(Array.isArray(round)).toBe(false)
    expect(typeof round).toBe('object')
  })
})

describe('lien de réservation', () => {
  it('renvoie null sans URL configurée — pas de bouton mort', () => {
    // Un « Prendre rendez-vous » qui pointe vers nulle part coûte plus cher que
    // pas de bouton du tout : l'écran bascule sur le contact manuel.
    expect(buildBookingUrl(undefined, {})).toBeNull()
    expect(buildBookingUrl('', {})).toBeNull()
    expect(buildBookingUrl('   ', {})).toBeNull()
  })

  it('renvoie null sur une URL invalide plutôt que de jeter', () => {
    // Une variable d'environnement mal saisie ne doit pas casser le rendu de
    // toute la page.
    expect(buildBookingUrl('pas-une-url', {})).toBeNull()
  })

  it('préremplit nom et email quand on les a', () => {
    const url = buildBookingUrl('https://cal.com/hortal/kit', {
      name: 'Antoine', email: 'a@b.c',
    })!

    expect(url).toContain('name=Antoine')
    expect(url).toContain('email=a%40b.c')
  })

  it('n\'ajoute QUE les paramètres dont on dispose', () => {
    // Un `?email=` vide afficherait un champ prérempli avec du vide — pire que
    // de le laisser au visiteur.
    const url = buildBookingUrl('https://cal.com/hortal/kit', { name: 'Antoine', email: null })!

    expect(url).toContain('name=Antoine')
    expect(url).not.toContain('email=')
  })

  it('conserve les paramètres déjà présents sur l\'URL de base', () => {
    const url = buildBookingUrl('https://cal.com/hortal/kit?duration=30', { name: 'A' })!

    expect(url).toContain('duration=30')
    expect(url).toContain('name=A')
  })
})
