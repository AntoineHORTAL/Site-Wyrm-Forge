import { describe, it, expect } from 'vitest'
import {
  likeAvailability,
  parseToggleResult,
  likeErrorKind,
  likedSetFromRows,
  withLikeState,
} from './workshop-likes'

const ME    = '11111111-1111-1111-1111-111111111111'
const OTHER = '22222222-2222-2222-2222-222222222222'

describe('likeAvailability', () => {
  it('déconnecté ⇒ signedOut, même sur son propre build', () => {
    expect(likeAvailability(null, OTHER)).toBe('signedOut')
    expect(likeAvailability(undefined, null)).toBe('signedOut')
    expect(likeAvailability('', ME)).toBe('signedOut')
  })
  it('son propre build ⇒ own', () => {
    expect(likeAvailability(ME, ME)).toBe('own')
  })
  it('build d\'autrui ⇒ ok', () => {
    expect(likeAvailability(ME, OTHER)).toBe('ok')
  })
  it('auteur inconnu (creator_id NULL) ⇒ likable, comme côté serveur', () => {
    expect(likeAvailability(ME, null)).toBe('ok')
    expect(likeAvailability(ME, undefined)).toBe('ok')
  })
})

describe('parseToggleResult', () => {
  it('lit la forme PostgREST d\'une RETURNS TABLE (tableau)', () => {
    expect(parseToggleResult([{ liked: true, like_count: 3 }])).toEqual({ liked: true, likeCount: 3 })
    expect(parseToggleResult([{ liked: false, like_count: 0 }])).toEqual({ liked: false, likeCount: 0 })
  })
  it('tolère un objet nu et un compteur en chaîne', () => {
    expect(parseToggleResult({ liked: true, like_count: '12' })).toEqual({ liked: true, likeCount: 12 })
  })
  it('refuse toute forme qui ne dit pas l\'état serveur', () => {
    expect(parseToggleResult(null)).toBeNull()
    expect(parseToggleResult([])).toBeNull()
    expect(parseToggleResult([{ like_count: 1 }])).toBeNull()
    expect(parseToggleResult([{ liked: 'true', like_count: 1 }])).toBeNull()
    expect(parseToggleResult([{ liked: true }])).toBeNull()
    expect(parseToggleResult([{ liked: true, like_count: -1 }])).toBeNull()
    expect(parseToggleResult([{ liked: true, like_count: 'abc' }])).toBeNull()
  })
})

describe('likeErrorKind', () => {
  it('RPC absente (site déployé avant la migration) ⇒ unavailable', () => {
    expect(likeErrorKind({ code: 'PGRST202', message: 'Could not find the function public.toggle_build_like' }))
      .toBe('unavailable')
    expect(likeErrorKind({ code: '42883', message: 'function does not exist' })).toBe('unavailable')
  })
  it('exceptions métier de la fonction', () => {
    expect(likeErrorKind({ code: '42501', message: 'own_build' })).toBe('own')
    expect(likeErrorKind({ code: '42501', message: 'not_authenticated' })).toBe('signedOut')
  })
  it('privilège refusé sans message métier ⇒ session perdue', () => {
    expect(likeErrorKind({ code: '42501', message: 'permission denied for function toggle_build_like' }))
      .toBe('signedOut')
  })
  it('le reste ⇒ other', () => {
    expect(likeErrorKind({ code: 'P0002', message: 'build_not_found' })).toBe('other')
    expect(likeErrorKind({ message: 'Failed to fetch' })).toBe('other')
    expect(likeErrorKind(null)).toBe('other')
  })
})

describe('likedSetFromRows / withLikeState', () => {
  it('construit l\'ensemble à partir des lignes, en ignorant les lignes mal formées', () => {
    const s = likedSetFromRows([{ build_id: 'a' }, { build_id: 'b' }, { build_id: null }, null, { x: 1 }])
    expect([...s].sort()).toEqual(['a', 'b'])
    expect(likedSetFromRows(null).size).toBe(0)
  })
  it('applique l\'état renvoyé par le serveur sans muter l\'ensemble d\'origine', () => {
    const before = new Set(['a'])
    const added = withLikeState(before, 'b', true)
    const removed = withLikeState(added, 'a', false)
    expect([...before]).toEqual(['a'])
    expect([...added].sort()).toEqual(['a', 'b'])
    expect([...removed]).toEqual(['b'])
    expect([...withLikeState(before, 'a', true)]).toEqual(['a'])
  })
})
