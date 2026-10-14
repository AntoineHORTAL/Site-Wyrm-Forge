import { describe, expect, it } from 'vitest'
import { mayRecordPlayer } from './privacy-exclusion'

/**
 * Droit d'opposition : un joueur dans la liste d'exclusion n'est jamais écrit
 * dans l'autocomplétion, et le doute (lecture impossible) vaut exclusion.
 */
const PUUID = 'a'.repeat(78)

describe('mayRecordPlayer', () => {
  it('autorise un joueur absent de la liste', async () => {
    expect(await mayRecordPlayer(PUUID, async () => false)).toBe(true)
  })

  it('refuse un joueur exclu', async () => {
    expect(await mayRecordPlayer(PUUID, async () => true)).toBe(false)
  })

  it('refuse si la liste ne peut pas être lue (échec fermé)', async () => {
    expect(await mayRecordPlayer(PUUID, async () => { throw new Error('db down') })).toBe(false)
  })

  it('refuse sans PUUID : impossible de vérifier', async () => {
    let called = false
    const lookup = async () => { called = true; return false }
    expect(await mayRecordPlayer('', lookup)).toBe(false)
    expect(await mayRecordPlayer(null, lookup)).toBe(false)
    expect(called).toBe(false)
  })
})
