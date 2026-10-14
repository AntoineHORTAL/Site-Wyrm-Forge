import { describe, expect, it, vi } from 'vitest'
import {
  checkIpRateLimit, commitDetailRateLimit, peekDetailRateLimit,
  type DetailBackend, type RateBackend,
} from './ip-rate-limit'
import { hmacHex } from './ip-hash'

/**
 * Promesse de la politique de confidentialité : aucune IP en clair dans
 * `riot_cache`. Les clés des deux limiteurs portent un HMAC de l'IP, et un
 * secret absent n'écrit rien du tout.
 */

const IP     = '203.0.113.42'
const SECRET = 'secret-de-test'

const req = () => new Request('https://x.test', { headers: { 'x-forwarded-for': `${IP}, 10.0.0.1` } })

function memRate() {
  const store = new Map<string, number[]>()
  const backend: RateBackend = {
    async get(k) { return store.get(k) ?? null },
    async set(k, v) { store.set(k, v) },
  }
  return { store, backend }
}

function memDetail() {
  const store = new Map<string, Record<string, number>>()
  const backend: DetailBackend = {
    async get(k) { return store.get(k) ?? null },
    async set(k, v) { store.set(k, v) },
  }
  return { store, backend }
}

describe('hmacHex', () => {
  it('est stable, dépend du secret, et ne contient pas l’IP', async () => {
    const a = await hmacHex(IP, SECRET)
    expect(a).toMatch(/^[0-9a-f]{32}$/)
    expect(await hmacHex(IP, SECRET)).toBe(a)
    expect(await hmacHex(IP, 'autre')).not.toBe(a)
    expect(a).not.toContain('203')
  })
})

describe('limiteur de recherche', () => {
  it('écrit une clé hachée, jamais l’IP', async () => {
    const { store, backend } = memRate()
    await checkIpRateLimit(req(), backend, { secret: SECRET })
    const keys = [...store.keys()]
    expect(keys).toEqual([`rate:ip:${await hmacHex(IP, SECRET)}`])
    expect(keys.join()).not.toContain(IP)
  })

  it('compte toujours : refuse au-delà de la limite', async () => {
    const { backend } = memRate()
    for (let i = 0; i < 2; i++) {
      expect((await checkIpRateLimit(req(), backend, { secret: SECRET, limit: 2, now: 1000 + i })).allowed).toBe(true)
    }
    expect((await checkIpRateLimit(req(), backend, { secret: SECRET, limit: 2, now: 1003 })).allowed).toBe(false)
  })

  it('sans secret : laisse passer et n’écrit rien', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { store, backend } = memRate()
    const r = await checkIpRateLimit(req(), backend)
    expect(r.allowed).toBe(true)
    expect(store.size).toBe(0)
    expect(err).toHaveBeenCalled()
    err.mockRestore()
  })
})

describe('limiteur de détail', () => {
  it('écrit une clé hachée, jamais l’IP', async () => {
    const { store, backend } = memDetail()
    await commitDetailRateLimit(req(), backend, 'EUW1_1', { secret: SECRET })
    const keys = [...store.keys()]
    expect(keys).toEqual([`rate:detail:ip:${await hmacHex(IP, SECRET)}`])
    const peek = await peekDetailRateLimit(req(), backend, { secret: SECRET })
    expect(peek.viewedIds).toEqual(['EUW1_1'])
  })

  it('sans secret : laisse passer et n’écrit rien', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { store, backend } = memDetail()
    const c = await commitDetailRateLimit(req(), backend, 'EUW1_1')
    expect(c.allowed).toBe(true)
    expect(store.size).toBe(0)
    err.mockRestore()
  })
})

describe('aucune IP en clair, nulle part', () => {
  it('ni dans les clés, ni dans les valeurs stockées, ni dans les résultats renvoyés, ni dans les logs', async () => {
    const logs: string[] = []
    const spies = (['log', 'info', 'warn', 'error'] as const).map(m =>
      vi.spyOn(console, m).mockImplementation((...a: unknown[]) => { logs.push(a.map(String).join(' ')) }))

    const rate = memRate()
    const detail = memDetail()
    const results = [
      await checkIpRateLimit(req(), rate.backend, { secret: SECRET }),
      await peekDetailRateLimit(req(), detail.backend, { secret: SECRET }),
      await commitDetailRateLimit(req(), detail.backend, 'EUW1_1', { secret: SECRET }),
      // Sans secret : chemin du log d'erreur.
      await checkIpRateLimit(req(), memRate().backend),
      await commitDetailRateLimit(req(), memDetail().backend, 'EUW1_2'),
    ]

    const everything = JSON.stringify({
      rate: [...rate.store.entries()],
      detail: [...detail.store.entries()],
      results,
      logs,
    })
    expect(everything).not.toContain(IP)
    spies.forEach(s => s.mockRestore())
  })
})
