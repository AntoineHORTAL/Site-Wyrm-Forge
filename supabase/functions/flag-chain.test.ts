import { describe, it, expect } from 'vitest'
import { flagChainOpen, MAX_FLAG_DEPTH, type FlagChainRow } from './_shared/flag-chain.ts'

/**
 * Résolution `parent_key` des Edge Functions (`isFeatureEnabled`).
 * Le cas qui a motivé le module : `shop_enabled` ouvert sous `ecailles_enabled`
 * fermé. Les clients cachaient la boutique, `shop-purchase` acceptait l'achat.
 */
const row = (key: string, value: string | null, parent_key: string | null = null): FlagChainRow =>
  ({ key, value, parent_key })

describe('flagChainOpen', () => {
  it('enfant ouvert sous parent fermé ⇒ fermé', () => {
    const rows = [row('ecailles_enabled', 'false'), row('shop_enabled', 'true', 'ecailles_enabled')]
    expect(flagChainOpen(rows, 'shop_enabled')).toBe(false)
  })

  it('parent et enfant ouverts ⇒ ouvert ; enfant fermé ⇒ fermé', () => {
    const open = [row('ecailles_enabled', 'true'), row('quests_enabled', 'true', 'ecailles_enabled')]
    expect(flagChainOpen(open, 'quests_enabled')).toBe(true)
    const closed = [row('ecailles_enabled', 'true'), row('quests_enabled', 'false', 'ecailles_enabled')]
    expect(flagChainOpen(closed, 'quests_enabled')).toBe(false)
  })

  it('flag sans parent : sa valeur seule décide (comportement d\'avant inchangé)', () => {
    expect(flagChainOpen([row('riot_history_enabled', 'true')], 'riot_history_enabled')).toBe(true)
    expect(flagChainOpen([row('riot_history_enabled', 'false')], 'riot_history_enabled')).toBe(false)
  })

  it('fail-closed : clé absente, parent absent, valeur nulle', () => {
    expect(flagChainOpen([], 'shop_enabled')).toBe(false)
    expect(flagChainOpen([row('shop_enabled', 'true', 'ecailles_enabled')], 'shop_enabled')).toBe(false)
    expect(flagChainOpen([row('shop_enabled', null)], 'shop_enabled')).toBe(false)
  })

  it('un cycle ne boucle pas et reste fermé', () => {
    const rows = [row('a', 'true', 'b'), row('b', 'true', 'a')]
    expect(flagChainOpen(rows, 'a')).toBe(false)
  })

  it('une chaîne de MAX_FLAG_DEPTH niveaux passe, une de plus non', () => {
    const chain = (n: number) => Array.from({ length: n }, (_, i) =>
      row(`f${i}`, 'true', i + 1 < n ? `f${i + 1}` : null))
    expect(flagChainOpen(chain(MAX_FLAG_DEPTH), 'f0')).toBe(true)
    expect(flagChainOpen(chain(MAX_FLAG_DEPTH + 1), 'f0')).toBe(false)
  })
})
