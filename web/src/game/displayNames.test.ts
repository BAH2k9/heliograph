import { describe, expect, it } from 'vitest'
import { PIECE_NAMES, SIDE_NAMES, winnerSideName } from './displayNames'

describe('displayNames', () => {
  it('gives every piece kind a distinct on-screen name', () => {
    const names = Object.values(PIECE_NAMES)
    expect(names).toHaveLength(6)
    expect(new Set(names).size).toBe(6)
    expect(PIECE_NAMES.Keep).toBe('Keep')
    expect(PIECE_NAMES.Heliostat).toBe('Heliostat')
  })

  it('names the sides Brass and Cobalt, never by seat', () => {
    expect(SIDE_NAMES).toEqual({ P1: 'Brass', P2: 'Cobalt' })
    expect(winnerSideName('P1Win')).toBe('Brass')
    expect(winnerSideName('P2Win')).toBe('Cobalt')
  })
})
