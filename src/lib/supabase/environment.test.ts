import { describe, it, expect } from 'vitest'
import {
  PROD_SUPABASE_URL,
  TEST_SUPABASE_URL,
  describeProject,
  inspectSupabaseEnv,
  isTestDatabase,
  projectRefFromKey,
  projectRefFromUrl,
} from './environment'

/**
 * Clés de test forgées localement (payload JWT non signé) — ce ne sont PAS de vraies
 * clés Supabase. Seul le payload est lu par `projectRefFromKey`, la signature n'est
 * jamais vérifiée ici (ce n'est pas le rôle de ce module).
 */
function fakeJwt(payload: object): string {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(payload)}.signature-factice`
}

const PROD_REF = 'cuscgmgqakxnfwnsrhhv'
const TEST_REF = 'gyjcdswpybrhesarompg'
const PROD_KEY = fakeJwt({ iss: 'supabase', ref: PROD_REF, role: 'anon' })
const TEST_KEY = fakeJwt({ iss: 'supabase', ref: TEST_REF, role: 'anon' })

describe('projectRefFromUrl', () => {
  it('extrait le sous-domaine', () => {
    expect(projectRefFromUrl(PROD_SUPABASE_URL)).toBe(PROD_REF)
    expect(projectRefFromUrl(TEST_SUPABASE_URL)).toBe(TEST_REF)
  })

  it('tolère slash final, casse et espaces (fichier .env édité à la main)', () => {
    expect(projectRefFromUrl(`  HTTPS://${PROD_REF.toUpperCase()}.supabase.co/  `)).toBe(PROD_REF)
  })

  it('renvoie null hors *.supabase.co', () => {
    expect(projectRefFromUrl('https://exemple.com')).toBeNull()
    expect(projectRefFromUrl(undefined)).toBeNull()
  })
})

describe('projectRefFromKey', () => {
  it('lit le ref du payload des clés héritées (format JWT)', () => {
    expect(projectRefFromKey(PROD_KEY)).toBe(PROD_REF)
  })

  it('renvoie null sur le format publishable, opaque par nature', () => {
    // Le WPF utilise ce format : aucune référence de projet à l'intérieur.
    // Valeur factice — la forme suffit, aucune clé réelle n'a sa place ici.
    expect(projectRefFromKey('sb_publishable_FACTICE_AUCUNE_CLE_REELLE_ICI')).toBeNull()
  })

  it('renvoie null sur une clé illisible plutôt que de lever', () => {
    expect(projectRefFromKey('a.b.c')).toBeNull()
    expect(projectRefFromKey(fakeJwt({ iss: 'supabase' }))).toBeNull() // pas de ref
    expect(projectRefFromKey(undefined)).toBeNull()
  })
})

describe('isTestDatabase — dérivé de l URL seule', () => {
  it('faux sur la production, y compris avec un slash final', () => {
    expect(isTestDatabase(PROD_SUPABASE_URL)).toBe(false)
    expect(isTestDatabase(`${PROD_SUPABASE_URL}/`)).toBe(false)
  })

  it('vrai sur le projet de test', () => {
    expect(isTestDatabase(TEST_SUPABASE_URL)).toBe(true)
  })

  it('faux sans URL — ne jamais inventer un « test » sur une config absente', () => {
    expect(isTestDatabase(undefined)).toBe(false)
  })
})

describe('inspectSupabaseEnv', () => {
  it('signale les variables manquantes', () => {
    expect(inspectSupabaseEnv(undefined, undefined)).toEqual({
      kind: 'missing',
      missing: ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'],
    })
    expect(inspectSupabaseEnv(PROD_SUPABASE_URL, '   ')).toEqual({
      kind: 'missing',
      missing: ['NEXT_PUBLIC_SUPABASE_ANON_KEY'],
    })
  })

  it('accepte un couple cohérent', () => {
    expect(inspectSupabaseEnv(PROD_SUPABASE_URL, PROD_KEY)).toEqual({
      kind: 'ok',
      isTest: false,
      url: PROD_SUPABASE_URL,
    })
    expect(inspectSupabaseEnv(TEST_SUPABASE_URL, TEST_KEY)).toMatchObject({
      kind: 'ok',
      isTest: true,
    })
  })

  it('attrape le bug du 2026-08-12 : URL de prod, clé de test', () => {
    expect(inspectSupabaseEnv(PROD_SUPABASE_URL, TEST_KEY)).toEqual({
      kind: 'mismatch',
      url: PROD_SUPABASE_URL,
      urlRef: PROD_REF,
      keyRef: TEST_REF,
    })
  })

  it('attrape aussi le sens inverse : URL de test, clé de prod', () => {
    expect(inspectSupabaseEnv(TEST_SUPABASE_URL, PROD_KEY)).toMatchObject({ kind: 'mismatch' })
  })

  it('reste conservateur quand la clé n est pas vérifiable', () => {
    // Format publishable : aucun ref lisible → on ne juge pas, on n'invente pas d'erreur.
    const v = inspectSupabaseEnv(PROD_SUPABASE_URL, 'sb_publishable_FACTICE_AUCUNE_CLE_REELLE')
    expect(v).toMatchObject({ kind: 'ok', isTest: false })
  })

  it('reste conservateur sur une URL hors *.supabase.co', () => {
    // Proxy local ou domaine personnalisé : légitime, jamais traité comme une faute.
    expect(inspectSupabaseEnv('http://localhost:54321', PROD_KEY)).toMatchObject({ kind: 'ok' })
  })
})

describe('describeProject', () => {
  it('nomme les deux projets connus et laisse les autres tels quels', () => {
    expect(describeProject(PROD_REF)).toBe(`${PROD_REF} (PRODUCTION)`)
    expect(describeProject(TEST_REF)).toBe(`${TEST_REF} (TEST)`)
    expect(describeProject('autre')).toBe('autre')
    expect(describeProject(null)).toBe('inconnu')
  })
})
